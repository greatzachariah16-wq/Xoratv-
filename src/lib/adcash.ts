const STORAGE_KEY = "xora:adcash-enabled";

export function isAdcashEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "false";
}

export function setAdcashEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent("xora:adcash-toggle", { detail: enabled }));
}

export const ADCASH_STORAGE_KEY = STORAGE_KEY;
