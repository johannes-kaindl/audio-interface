// Nachrichten zwischen Renderer und Piper-Worker. Pur (nur Typen).
import type { PiperConfig } from "./piper-phonemes";
import type { SpeechChunk } from "./speech-text";

export type WorkerRequest =
  | { type: "init"; wasm: ArrayBuffer; model: ArrayBuffer; config: PiperConfig }
  | { type: "synthesize"; id: number; chunks: SpeechChunk[]; lengthScale: number }
  | { type: "dispose" };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; id: number; done: number; total: number }
  | { type: "result"; id: number; samples: Float32Array; sampleRate: number }
  | { type: "error"; id: number | null; message: string };
