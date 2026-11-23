import { choiceLabel, httpUrl, offerKey, readState, send, watchState, weeklyCount } from "./data.js";

const elements = Object.fromEntries(
  [...document.querySelectorAll("[id]")].map(element => [element.id, element])
);
let state;
let tab;
let selectedUrl;
let pending = false;

function showFeedback(text, tone = "") {
  elements.feedback.textContent = text;
  elements.feedback.dataset.tone = tone;
}

function render() {
  const count = weeklyCount(state.offers);
  elements["week-count"].textContent = `${count} / ${state.goal} envoyées`;
  elements["week-progress"].max = state.goal;
  elements["week-progress"].value = count;
  elements.weekly.hidden = false;

  if (!selectedUrl) return;
  const existing = state.offers.find(offer => offer.key === offerKey(selectedUrl.href));
  const focusedId = document.activeElement?.dataset.choice;
  elements["capture-title"].textContent = existing ? "Mettre à jour le statut" : "Enregistrer l’offre comme…";
  elements.choices.replaceChildren(...state.choices.map(choice => {
    const button = document.createElement("button");
    const label = document.createElement("span");
    const icon = document.createElement("span");
    button.type = "button";
    button.className = "choice-button";
    button.dataset.choice = choice.id;
    button.disabled = pending;
    button.setAttribute("aria-pressed", String(existing?.choiceId === choice.id));
    label.textContent = choice.label;
    icon.className = "choice-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = existing?.choiceId === choice.id ? "✓" : "→";
    button.append(label, icon);
    button.addEventListener("click", () => saveChoice(choice.id));
    return button;
  }));

  const focused = [...elements.choices.children].find(button => button.dataset.choice === focusedId);
  focused?.focus();
}

async function saveChoice(choiceId) {
  if (pending) return;
  const clicked = document.activeElement;
  pending = true;
  for (const button of elements.choices.children) button.disabled = true;
  showFeedback("Enregistrement…");
  try {
    state = await send({ type: "save-offer", url: selectedUrl.href, title: tab.title, choiceId });
    const offer = state.offers.find(item => item.key === offerKey(selectedUrl.href));
    showFeedback(`Enregistrée · ${choiceLabel(state, offer)}`, "success");
  } catch (error) {
    showFeedback(error.message, "error");
  } finally {
    pending = false;
    render();
    if (clicked?.dataset.choice) {
      [...elements.choices.children].find(button => button.dataset.choice === clicked.dataset.choice)?.focus();
    }
  }
}

try {
  const [tabs, storedState] = await Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), readState()]);
  [tab] = tabs;
  state = storedState;
  selectedUrl = httpUrl(tab?.url);

  if (selectedUrl) {
    const host = selectedUrl.hostname.replace(/^www\./, "");
    elements.site.textContent = host;
    elements["page-title"].textContent = tab.title?.trim() || host;
    elements["page-title"].title = elements["page-title"].textContent;
    elements["current-offer"].hidden = false;
    elements.capture.hidden = false;
    const existing = state.offers.find(offer => offer.key === offerKey(selectedUrl.href));
    if (existing) showFeedback(`Enregistrée · ${choiceLabel(state, existing)}`, "success");
  } else {
    showFeedback("Ouvre la page d’une offre pour l’enregistrer.");
  }

  render();
  watchState(updated => {
    state = updated;
    if (!pending) render();
  });
} catch {
  showFeedback("Radar n’a pas pu s’ouvrir. Réessaie.", "error");
}
