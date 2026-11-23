import { MAX_LABEL_LENGTH, choiceLabel, readState, send, watchState, weeklyCount } from "./data.js";

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map(element => [element.id, element])
);
const dateFormat = new Intl.DateTimeFormat("fr", { dateStyle: "medium" });
const dialog = elements.settings;
const form = elements["settings-form"];
let state;
let settingsVersion;

function makeOption(label, value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function setListFeedback(message, tone = "") {
  elements["list-feedback"].textContent = message;
  elements["list-feedback"].dataset.tone = tone;
}

function renderOffer(offer) {
  const row = document.createElement("tr");
  const title = row.insertCell();
  const link = document.createElement("a");
  link.href = offer.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = offer.title;
  const site = document.createElement("span");
  site.className = "table-site";
  site.textContent = new URL(offer.url).hostname.replace(/^www\./, "");
  title.append(link, site);

  const select = document.createElement("select");
  select.className = "status-select";
  select.dataset.offerKey = offer.key;
  select.setAttribute("aria-label", `Statut de ${offer.title}`);
  select.replaceChildren(...state.choices.map(choice => makeOption(choice.label, choice.id)));
  if (!state.choices.some(choice => choice.id === offer.choiceId)) {
    const archived = makeOption(offer.choiceLabel, offer.choiceId);
    archived.disabled = true;
    select.prepend(archived);
  }
  select.value = offer.choiceId;
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      await send({ type: "change-choice", key: offer.key, choiceId: select.value });
    } catch (error) {
      select.value = offer.choiceId;
      setListFeedback(error.message, "error");
    } finally {
      select.disabled = false;
    }
  });
  row.insertCell().append(select);
  row.insertCell().textContent = dateFormat.format(offer.savedAt);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-button";
  remove.textContent = "Supprimer";
  remove.setAttribute("aria-label", `Supprimer ${offer.title}`);
  remove.addEventListener("click", async () => {
    if (!window.confirm(`Supprimer « ${offer.title} » ?`)) return;
    remove.disabled = true;
    try {
      await send({ type: "delete-offer", key: offer.key });
      setListFeedback("Offre supprimée.");
    } catch (error) {
      setListFeedback(error.message, "error");
    } finally {
      remove.disabled = false;
    }
  });
  row.insertCell().append(remove);
  return row;
}

function renderDashboard() {
  const count = weeklyCount(state.offers);
  elements["week-count"].textContent = `${count} / ${state.goal} envoyées`;
  elements["week-progress"].max = state.goal;
  elements["week-progress"].value = count;
  elements.week.hidden = false;
  elements.total.textContent = state.offers.length;

  const filter = elements["choice-filter"];
  const selected = filter.value;
  const choices = new Map(state.choices.map(choice => [choice.id, choice.label]));
  for (const offer of state.offers) {
    if (!choices.has(offer.choiceId)) choices.set(offer.choiceId, choiceLabel(state, offer));
  }
  filter.replaceChildren(makeOption("Tous les statuts", ""), ...[...choices].map(([id, label]) => makeOption(label, id)));
  filter.value = choices.has(selected) ? selected : "";
  elements.filter.hidden = !state.offers.length;

  const focusedKey = document.activeElement?.dataset.offerKey;
  const sorted = state.offers.filter(offer => !filter.value || offer.choiceId === filter.value)
    .sort((a, b) => b.savedAt - a.savedAt);
  elements.offers.replaceChildren(...sorted.map(renderOffer));
  elements["table-wrap"].hidden = !sorted.length;
  elements.empty.hidden = Boolean(sorted.length);
  elements.empty.textContent = filter.value
    ? "Aucune offre avec ce statut."
    : "Ouvre une offre dans Chrome, puis clique sur un choix dans Radar pour l’ajouter ici.";
  if (focusedKey) {
    [...elements.offers.querySelectorAll("select")].find(select => select.dataset.offerKey === focusedKey)?.focus();
  }
}

function addChoiceField(choice) {
  const field = document.createElement("fieldset");
  field.className = "choice-field";
  field.dataset.id = choice.id;

  const title = document.createElement("label");
  const label = document.createElement("input");
  label.type = "text";
  label.value = choice.label;
  label.placeholder = "Ex. À relancer vendredi";
  label.maxLength = MAX_LABEL_LENGTH;
  label.required = true;
  const titleText = document.createElement("span");
  titleText.className = "sr-only";
  titleText.textContent = "Nom du choix";
  title.append(titleText, label);

  const count = document.createElement("label");
  count.className = "count-choice";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = choice.sent;
  count.append(checkbox, "Compter comme envoyée");

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Retirer";
  remove.className = "delete-button";
  remove.addEventListener("click", () => {
    field.remove();
    updateRemoveButtons();
    elements["add-choice"].focus();
  });

  field.append(title, remove, count);
  elements["choice-fields"].append(field);
  return label;
}

function updateRemoveButtons() {
  const buttons = elements["choice-fields"].querySelectorAll("button");
  for (const button of buttons) button.disabled = buttons.length === 1;
}

function openSettings() {
  if (!state || dialog.open) return;
  settingsVersion = state.settingsVersion ?? 0;
  elements["settings-feedback"].textContent = "";
  elements["choice-fields"].replaceChildren();
  for (const choice of state.choices) addChoiceField(choice);
  updateRemoveButtons();
  form.elements.goal.value = state.goal;
  dialog.showModal();
}

elements["open-settings"].addEventListener("click", openSettings);
elements["close-settings"].addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  if (location.hash === "#choix") history.replaceState(null, "", location.pathname);
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#choix") openSettings();
});
elements["add-choice"].addEventListener("click", () => {
  const input = addChoiceField({ id: crypto.randomUUID(), label: "", sent: false });
  updateRemoveButtons();
  input.focus();
});
elements["choice-filter"].addEventListener("change", renderDashboard);

form.addEventListener("submit", async event => {
  event.preventDefault();
  const choices = [...elements["choice-fields"].children].map(field => ({
    id: field.dataset.id,
    label: field.querySelector("input[type=text]").value,
    sent: field.querySelector("input[type=checkbox]").checked
  }));

  elements["save-settings"].disabled = true;
  elements["settings-feedback"].textContent = "";
  try {
    await send({ type: "save-settings", choices, goal: form.elements.goal.valueAsNumber, settingsVersion });
    dialog.close();
    setListFeedback("Choix enregistrés.", "success");
  } catch (error) {
    elements["settings-feedback"].textContent = error.message;
    elements["settings-feedback"].dataset.tone = "error";
  } finally {
    elements["save-settings"].disabled = false;
  }
});

try {
  state = await readState();
  renderDashboard();
  elements["open-settings"].disabled = false;
  if (location.hash === "#choix") openSettings();
  watchState(updated => {
    state = updated;
    renderDashboard();
  });
} catch {
  setListFeedback("Impossible d’ouvrir tes candidatures. Recharge cet onglet.", "error");
}
