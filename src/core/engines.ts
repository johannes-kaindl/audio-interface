// Engine-Auswahl aus Settings + Bereitschaft. Pur, keine I/O.
import { BUILTIN_ENGINE_ID } from "./engine-manifest";
import type { AudioInterfaceSettings } from "./settings-types";

export type EngineReadiness = "off" | "needs-download" | "loading" | "ready" | "unavailable";
export type ReadinessMap = Record<string, EngineReadiness | undefined>;

/** Engine für den Export — nur, wenn der Nutzer Export eingeschaltet hat UND die Engine bereit ist. */
export function exportEngineFor(settings: AudioInterfaceSettings, readiness: ReadinessMap): string | null {
  if (!settings.exportEnabled) return null;
  return readiness[settings.exportEngineId] === "ready" ? settings.exportEngineId : null;
}

/** Engine fürs Vorlesen — ladbare nur auf Wunsch und wenn bereit, sonst Systemstimmen. */
export function speakEngineFor(settings: AudioInterfaceSettings, readiness: ReadinessMap): string {
  if (settings.speakWithLoadable && settings.exportEnabled && readiness[settings.exportEngineId] === "ready") {
    return settings.exportEngineId;
  }
  return BUILTIN_ENGINE_ID;
}
