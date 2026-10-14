import { useSyncExternalStore } from "react";

const KEY = "usercue-theme";

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  root.style.colorScheme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  for (const listener of listeners) listener();
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    read,
    () => "light" as Theme,
  );
  return [theme, applyTheme] as const;
}
