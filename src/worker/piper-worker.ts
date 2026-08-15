// Piper-TTS im Worker: ORT (CPU-WASM) + eSpeak-NG-Phonemisierung (ephone, GPL-3.0-or-later).
// Wird als Release-Asset ausgeliefert, nie in main.js gebündelt (Spec §5). Läuft aus einer Blob-URL;
// alle Binärdaten (WASM, Modell) kommen per Nachricht — der Worker lädt selbst nichts nach.
import * as ort from "onnxruntime-web/wasm";
import createEphone, { type ephoneModule } from "ephone";
import { loadData as loadGmw } from "ephone/lang/gmw.js";
import { concatWithSilence, type PcmBuffer } from "../core/audio";
import { ipaToIds, type PiperConfig } from "../core/piper-phonemes";
import type { WorkerRequest, WorkerResponse } from "../core/worker-protocol";

// Minimaler Worker-Scope statt DedicatedWorkerGlobalScope: hält Lint (no-undef) und Typecheck ohne
// globale WebWorker-lib zufrieden — mehr braucht der Worker vom Host nicht.
interface WorkerScope {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  close(): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
}
const scope = globalThis as unknown as WorkerScope;

const post = (m: WorkerResponse, transfer: Transferable[] = []): void => scope.postMessage(m, transfer);

let session: ort.InferenceSession | null = null;
let eph: ephoneModule | null = null;
let config: PiperConfig | null = null;

async function init(msg: Extract<WorkerRequest, { type: "init" }>): Promise<void> {
  ort.env.wasm.wasmBinary = msg.wasm;
  ort.env.wasm.numThreads = 1; // kein crossOriginIsolated im Renderer (Spike)
  ort.env.logLevel = "warning";
  config = msg.config;
  const [s, e] = await Promise.all([
    ort.InferenceSession.create(msg.model, { executionProviders: ["wasm"] }),
    createEphone({ languages: [async (m: unknown) => loadGmw(m)] }),
  ]);
  session = s;
  eph = e;
  eph.setVoice(config.espeak.voice);
  post({ type: "ready" });
}

async function synthesize(msg: Extract<WorkerRequest, { type: "synthesize" }>): Promise<void> {
  if (!session || !eph || !config) throw new Error("worker not initialised");
  const sr = config.audio.sample_rate;
  const parts: { pcm: PcmBuffer; pauseAfterMs: number }[] = [];
  for (let i = 0; i < msg.chunks.length; i++) {
    const chunk = msg.chunks[i];
    const { ids } = ipaToIds(eph.textToIpa(chunk.text), config.phoneme_id_map);
    const feeds = {
      input: new ort.Tensor("int64", BigInt64Array.from(ids.map((n) => BigInt(n))), [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor(
        "float32",
        Float32Array.from([config.inference.noise_scale, config.inference.length_scale * msg.lengthScale, config.inference.noise_w]),
        [3],
      ),
    };
    const out = await session.run(feeds);
    const data = out.output.data;
    if (!(data instanceof Float32Array)) throw new Error("unexpected output dtype");
    parts.push({ pcm: { samples: data, sampleRate: sr }, pauseAfterMs: chunk.pauseAfterMs });
    post({ type: "progress", id: msg.id, done: i + 1, total: msg.chunks.length });
  }
  const all = concatWithSilence(parts, sr);
  post({ type: "result", id: msg.id, samples: all.samples, sampleRate: sr }, [all.samples.buffer]);
}

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  void (async () => {
    try {
      if (msg.type === "init") await init(msg);
      else if (msg.type === "synthesize") await synthesize(msg);
      else if (msg.type === "dispose") {
        await session?.release();
        session = null;
        eph = null;
        scope.close();
      }
    } catch (err) {
      post({ type: "error", id: msg.type === "synthesize" ? msg.id : null, message: err instanceof Error ? err.message : String(err) });
    }
  })();
};
