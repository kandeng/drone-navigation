/**
 * useAppSettings.js – singleton reactive store for global app settings.
 * Persisted to localStorage under key 'app-settings'.
 */
import { reactive, watch } from 'vue';

const STORAGE_KEY = 'app-settings';

const defaults = {
  fontFamily: 'Calibri',
  fontSize: '16px',
  takeoffAltitude: 100,
  safetyBuffer: 8,
  defaultLat: 37.4286,
  defaultLon: -122.1699,
  defaultAlt: 150,
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

  function setTakeoffAltitude(val) {
    const n = Math.max(20, Math.min(10000, Number(val) || 200));
    state.takeoffAltitude = n;
  }

  function setSafetyBuffer(val) {
    const n = Math.max(2, Math.min(100, Number(val) || 18));
    state.safetyBuffer = n;
  }

  function setDefaultLat(val) {
    const n = Number(val);
    if (!isNaN(n) && n >= -90 && n <= 90) state.defaultLat = n;
  }

  function setDefaultLon(val) {
    const n = Number(val);
    if (!isNaN(n) && n >= -180 && n <= 180) state.defaultLon = n;
  }

  function setDefaultAlt(val) {
    const n = Math.max(0, Math.min(10000, Number(val) || 150));
    state.defaultAlt = n;
  }

  return {
    settings: state,
    setFontFamily,
    setFontSize,
    setTakeoffAltitude,
    setSafetyBuffer,
    setDefaultLat,
    setDefaultLon,
    setDefaultAlt,
  };
}
