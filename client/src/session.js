const KEY = "fortuneCitySession";

export function saveSession({ code, playerId, token }) {
  localStorage.setItem(KEY, JSON.stringify({ code, playerId, token }));
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
