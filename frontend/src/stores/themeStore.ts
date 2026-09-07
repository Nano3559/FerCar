import { create } from "zustand";

export type ThemeMode = "dark" | "light" | "system";

const STORAGE_KEY = "repuestopro-theme";

function getSystemTheme(): "dark" | "light" {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function effective(mode: ThemeMode): "dark" | "light" {
  return mode === "system" ? getSystemTheme() : mode;
}

function apply(mode: ThemeMode) {
  document.documentElement.dataset.theme = effective(mode);
  document.documentElement.dataset.mode = mode;
}

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: readStored(),
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    apply(mode);
    set({ mode });
  },
}));

if (typeof window !== "undefined") {
  apply(readStored());
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener?.("change", () => {
    if (useThemeStore.getState().mode === "system") apply("system");
  });
}