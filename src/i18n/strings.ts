// UI-Strings (PROF-OBS-07): Engine aus dem Kit, Wörterbücher lokal. Schlüssel alphabetisch je Bereich.
import { defineStrings, pickLang, setLang, t } from "../vendor/kit/i18n";

export const EN: Record<string, string> = {
  "cmd.speakNote": "Read note aloud",
};

export const DE: Record<string, string> = {
  "cmd.speakNote": "Notiz vorlesen",
};

export function initI18n(rawLang: string | null | undefined): void {
  defineStrings({ en: EN, de: DE });
  setLang(pickLang(rawLang));
}

export { t };
