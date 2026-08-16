// Export-Ablauf: Markdown → Chunks → Engine → PCM → (Resampling, Pegel) → WAV → Vault-Datei.
// Zustand über den Zustandsautomaten (core/run-state); die Vault-Schreibphase ist der Punkt ohne
// Wiederkehr. Vault nur über einen schmalen Port — Node-testbar, kein `fs`.
import { encodeWav, normalizePeak, resample, type PcmBuffer } from "../core/audio";
import { joinVaultPath, renderFileName, withSuffix } from "../core/file-naming";
import { abort, begin, fail, finish, progress, type RunState } from "../core/run-state";
import type { AudioInterfaceSettings } from "../core/settings-types";
import { prepareSpeech } from "../core/speech-text";
import type { PiperEngine } from "./engines/piper-engine";

export interface VaultPort {
  exists(path: string): boolean;
  folderExists(path: string): boolean;
  createFolder(path: string): Promise<void>;
  createBinary(path: string, data: Uint8Array): Promise<void>;
}

export interface ExportInput {
  markdown: string;
  noteBasename: string;
  /** Ordner der Notiz ("" = Vault-Root) — Ziel, wenn kein Exportordner gesetzt ist. */
  noteFolder: string;
  /** YYYY-MM-DD */
  today: string;
}

export interface ExportResult {
  path: string;
  seconds: number;
  sampleRate: number;
}

export interface ExportDeps {
  engine: PiperEngine;
  vault: VaultPort;
  settings: AudioInterfaceSettings;
  onState(s: RunState): void;
}

export class ExportError extends Error {
  constructor(
    readonly code: "empty" | "aborted" | "engine",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ExportError";
  }
}

const PHONE_RATE = 8000;

export function targetPcm(pcm: PcmBuffer, profile: AudioInterfaceSettings["exportProfile"]): PcmBuffer {
  const out = profile === "phone-8k" ? resample(pcm, PHONE_RATE) : pcm;
  return { samples: normalizePeak(out.samples), sampleRate: out.sampleRate };
}

export async function runExport(input: ExportInput, deps: ExportDeps, signal: AbortSignal): Promise<ExportResult> {
  let state: RunState = begin("preparing");
  const emit = (s: RunState): void => {
    state = s;
    deps.onState(s);
  };
  emit(state);
  const chunks = prepareSpeech(input.markdown);
  if (chunks.length === 0) {
    emit(fail(state, "empty"));
    throw new ExportError("empty");
  }
  const onAbort = (): void => emit(abort(state));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    emit(progress(state, "synthesizing", 0, chunks.length));
    let pcm: PcmBuffer;
    try {
      pcm = await deps.engine.synthesize(chunks, { lengthScale: deps.engine.tempo }, signal, (done, total) => emit(progress(state, "synthesizing", done, total)));
    } catch (err) {
      if (signal.aborted) throw new ExportError("aborted");
      const msg = err instanceof Error ? err.message : String(err);
      emit(fail(state, msg));
      throw new ExportError("engine", msg);
    }
    if (signal.aborted) throw new ExportError("aborted");
    emit(progress(state, "encoding", 0, 1));
    const out = targetPcm(pcm, deps.settings.exportProfile);
    const wav = encodeWav(out);
    if (signal.aborted) throw new ExportError("aborted");

    // Punkt ohne Wiederkehr: ab hier ignoriert der Zustandsautomat den Abbruch.
    emit(progress(state, "writing", 0, 1));
    const folder = deps.settings.exportFolder.trim() !== "" ? deps.settings.exportFolder.trim() : input.noteFolder;
    if (folder !== "" && !deps.vault.folderExists(folder)) await deps.vault.createFolder(folder);
    const base = renderFileName(deps.settings.exportFilePattern, { note: input.noteBasename, date: input.today });
    const fileName = withSuffix(base, "wav", (candidate) => deps.vault.exists(joinVaultPath(folder, candidate)));
    const path = joinVaultPath(folder, fileName);
    await deps.vault.createBinary(path, wav);
    emit(finish(state, path));
    return { path, seconds: out.samples.length / out.sampleRate, sampleRate: out.sampleRate };
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
