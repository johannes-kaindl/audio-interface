// uebernommen (Muster) aus apple-health/src/core/import-state.ts (2. Exemplar obsidian-transmute/src/core/vault/state.ts), 2026-08-15
// Zustandsautomat für abbrechbare Langläufer (Download, Export). Pur, dep-frei. Drittes Exemplar
// des REGISTRY-Musters — Phasen sind plugin-eigen, die zwei tragenden Regeln nicht:
// (1) ein Abbruch wird nie von einem Folgefehler überschrieben; (2) die Schreibphase ist der Punkt
// ohne Wiederkehr — Abbruch dort wird verweigert, sonst meldet die UI „abgebrochen" bei fertiger Datei.

export type RunPhase = "preparing" | "downloading" | "synthesizing" | "encoding" | "writing";

export type RunState =
  | { kind: "idle" }
  | { kind: "running"; phase: RunPhase; done: number; total: number }
  | { kind: "done"; detail: string }
  | { kind: "aborted" }
  | { kind: "failed"; message: string };

export const IDLE: RunState = { kind: "idle" };

export function begin(phase: RunPhase): RunState {
  return { kind: "running", phase, done: 0, total: 0 };
}

export function progress(s: RunState, phase: RunPhase, done: number, total: number): RunState {
  return s.kind === "running" ? { kind: "running", phase, done, total } : s;
}

export function canAbort(s: RunState): boolean {
  return s.kind === "running" && s.phase !== "writing";
}

export function abort(s: RunState): RunState {
  return canAbort(s) ? { kind: "aborted" } : s;
}

export function fail(s: RunState, message: string): RunState {
  return s.kind === "aborted" ? s : { kind: "failed", message };
}

export function finish(s: RunState, detail: string): RunState {
  return s.kind === "aborted" ? s : { kind: "done", detail };
}

export function isBusy(s: RunState): boolean {
  return s.kind === "running";
}
