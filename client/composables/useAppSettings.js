/**
 * useAppSettings.js – singleton reactive store for global app settings.
 * Persisted to localStorage under key 'app-settings'.
 */
import { reactive, watch } from 'vue';

const STORAGE_KEY = 'app-settings';

const defaults = {
  fontFamily: 'Calibri',
  fontSize: '16px',
};

/** Hydrate from localStorage, falling back to defaults. */
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* corrupted storage – use defaults */
  }
  return { ...defaults };
}

const state = reactive(loadSettings());

/** Persist on every change. */
watch(
  state,
  (next) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  },
  { deep: true },
);

export function useAppSettings() {
  function setFontFamily(val) {
    state.fontFamily = val;
  }

  function setFontSize(val) {
    state.fontSize = val;
    /* Apply to html root so that rem-based sizes cascade correctly. */
    document.documentElement.style.fontSize = val;
  }

  return {
    settings: state,
    setFontFamily,
    setFontSize,
  };
}
