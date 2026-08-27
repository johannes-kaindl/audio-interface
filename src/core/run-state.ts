// Adapter auf das Kit-Modul: die Zustandslogik liegt seit dem Vendoring in
// src/vendor/kit/run-state.ts (obsidian-kit 0.27.0, kanonisch aus apple-health/transmute/audio-interface
// zusammengefuehrt) — hier bleiben nur die repo-eigenen Arities, damit keine Aufrufstelle sich aendert.
// Die zwei tragenden Regeln stehen jetzt in der Fabrik: (1) ein Abbruch wird nie von einem Folgefehler
// ueberschrieben — das Kit verlangt dafuer `running` und schuetzt damit auch ein fertiges Ergebnis mit;
// (2) die Schreibphase ist der Punkt ohne Wiederkehr (`abortableIn`), sonst meldet die UI
// „abgebrochen" bei fertiger Datei.

import { makeRunState, type RunState as KitRunState } from "../vendor/kit/run-state";

export type RunPhase = "preparing" | "downloading" | "synthesizing" | "encoding" | "writing";

export type RunState = KitRunState<RunPhase, { done: number; total: number }, { detail: string }>;

const ops = makeRunState<RunPhase, { done: number; total: number }, { detail: string }>({
  abortableIn: (p) => p !== "writing",
});

export const IDLE: RunState = ops.IDLE;

export function begin(phase: RunPhase): RunState {
  return ops.begin(phase, { done: 0, total: 0 });
}

export function progress(s: RunState, phase: RunPhase, done: number, total: number): RunState {
  return ops.progress(s, { phase, done, total });
}

export function canAbort(s: RunState): boolean {
  return ops.canAbort(s);
}

export function abort(s: RunState): RunState {
  return ops.abort(s);
}

export function fail(s: RunState, message: string): RunState {
  return ops.fail(s, message);
}

export function finish(s: RunState, detail: string): RunState {
  return ops.finish(s, { detail });
}

export function isBusy(s: RunState): boolean {
  return ops.isBusy(s);
}
