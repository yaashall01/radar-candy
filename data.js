export const STORAGE_KEY = "radar";
export const MAX_LABEL_LENGTH = 48;

const DEFAULT_STATE = {
  choices: [
    { id: "todo", label: "À postuler", sent: false },
    { id: "sent", label: "J’ai postulé", sent: true },
    { id: "followup", label: "À relancer", sent: true },
    { id: "interview", label: "Entretien", sent: true }
  ],
  goal: 5,
  offers: []
};

export async function readState() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] ?? structuredClone(DEFAULT_STATE);
}

export function httpUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function offerKey(value) {
  const url = httpUrl(value);
  if (!url) return null;

  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.*|gclid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
  }
  if (url.hash.startsWith("#:~:text=")) url.hash = "";
  url.searchParams.sort();
  return url.href;
}

export function choiceLabel(state, offer) {
  return state.choices.find(choice => choice.id === offer.choiceId)?.label ?? offer.choiceLabel;
}

export function weeklyCount(offers, now = new Date()) {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);

  return offers.filter(offer => offer.sentAt >= +monday && offer.sentAt < +nextMonday).length;
}

export function watchState(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]?.newValue) {
      callback(changes[STORAGE_KEY].newValue);
    }
  });
}

export async function send(action) {
  const result = await chrome.runtime.sendMessage(action);
  if (!result?.ok) throw new Error(result?.error || "L’action a échoué. Réessaie.");
  return result.state;
}
