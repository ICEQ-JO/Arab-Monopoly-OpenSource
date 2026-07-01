const KEY = "richman-theme";

export function getStoredTheme() {
  return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(KEY, theme);
}
