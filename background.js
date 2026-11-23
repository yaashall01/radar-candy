import { MAX_LABEL_LENGTH, STORAGE_KEY, httpUrl, offerKey, readState } from "./data.js";

function setChoice(offer, choice, date) {
  offer.choiceId = choice.id;
  offer.choiceLabel = choice.label;
  offer.updatedAt = date;
  if (choice.sent && !offer.sentAt) offer.sentAt = date;
}

function updateOffer(state, message) {
  const choice = state.choices.find(item => item.id === message.choiceId);
  if (!choice) throw new Error("Ce choix a été modifié. Sélectionne un choix disponible.");

  const date = Date.now();
  let offer;
  if (message.type === "save-offer") {
    const url = httpUrl(message.url);
    if (!url) throw new Error("Ouvre une offre sur une page web pour l’enregistrer.");
    const key = offerKey(url.href);
    offer = state.offers.find(item => item.key === key);
    if (!offer) {
      const title = typeof message.title === "string" ? message.title.trim().slice(0, 300) : "";
      offer = {
        key,
        url: url.href,
        title: title || url.hostname,
        savedAt: date,
        sentAt: null
      };
      state.offers.push(offer);
    }
  } else {
    offer = state.offers.find(item => item.key === message.key);
    if (!offer) throw new Error("Cette offre a été supprimée.");
  }
  if (offer.choiceId !== choice.id) setChoice(offer, choice, date);
}

function updateSettings(state, message) {
  const { choices, goal, settingsVersion } = message;
  if (settingsVersion !== (state.settingsVersion ?? 0)) {
    throw new Error("Tes choix ont changé dans un autre onglet. Ferme et rouvre les réglages.");
  }
  if (!Array.isArray(choices) || choices.length < 1) {
    throw new Error("Garde au moins un choix dans l’extension.");
  }
  if (!Number.isInteger(goal) || goal < 1 || goal > 999) {
    throw new Error("Choisis un objectif entre 1 et 999.");
  }

  const ids = new Set();
  const labels = new Set();
  for (const choice of choices) {
    const label = choice?.label?.trim();
    if (!label || label.length > MAX_LABEL_LENGTH || typeof choice.id !== "string" || !choice.id) {
      throw new Error("Saisis un nom pour chaque choix.");
    }

    const normalized = label.toLocaleLowerCase("fr");
    if (labels.has(normalized) || ids.has(choice.id)) {
      throw new Error("Donne un nom différent à chaque choix.");
    }
    labels.add(normalized);
    ids.add(choice.id);
  }

  const oldChoices = new Map(state.choices.map(choice => [choice.id, choice.label]));
  const newChoices = new Map(choices.map(choice => [choice.id, choice.label.trim()]));
  for (const offer of state.offers) {
    offer.choiceLabel = newChoices.get(offer.choiceId) ?? oldChoices.get(offer.choiceId) ?? offer.choiceLabel;
  }

  state.choices = choices.map(choice => ({
    id: choice.id,
    label: choice.label.trim(),
    sent: Boolean(choice.sent)
  }));
  state.goal = goal;
  state.settingsVersion = settingsVersion + 1;
}

async function applyChange(message) {
  const state = await readState();
  switch (message.type) {
    case "save-offer":
    case "change-choice":
      updateOffer(state, message);
      break;
    case "delete-offer":
      state.offers = state.offers.filter(offer => offer.key !== message.key);
      break;
    case "save-settings":
      updateSettings(state, message);
      break;
    default:
      throw new Error("Action inconnue.");
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  return state;
}

// Serialize writes so simultaneous actions from different extension tabs are preserved.
let pendingWrite = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return;
  const write = pendingWrite.then(() => applyChange(message));
  pendingWrite = write.catch(() => {});
  write.then(
    state => respond({ ok: true, state }),
    error => respond({ ok: false, error: error.message })
  );
  return true;
});
