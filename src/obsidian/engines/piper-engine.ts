// Ladbare Engine: hält den Piper-Worker (aus dem Cache als Blob gestartet), prüft die Assets vor dem
// ersten Start gegen SHA-256 und übersetzt Worker-Nachrichten in Promise/Fortschritt (Spec §5, §6).
// Worker/Store/Clock injiziert → Node-testbar.
import type { PcmBuffer } from "../../core/audio";
import type { EngineDescriptor } from "../../core/engine-manifest";
import type { EngineReadiness } from "../../core/engines";
import { parsePiperConfig } from "../../core/piper-phonemes";
import type { SpeechChunk } from "../../core/speech-text";
import type { WorkerRequest, WorkerResponse } from "../../core/worker-protocol";
import type { ClockPort } from "../../vendor/kit-obsidian/clock";
import type { AssetStore } from "../asset-store";

export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: WorkerResponse }) => void) | null;
  onerror: ((e: { message: string }) => void) | null;
}

export interface PiperEngineDeps {
  store: AssetStore;
  descriptor: EngineDescriptor;
  makeWorker(source: string): WorkerLike;
  clock: ClockPort;
  /** Worker nach Untätigkeit freigeben (Modell im Speicher ~250 MB). Default 5 min. */
  idleDisposeMs?: number;
  /** Init-Timeout. Default 60 s. */
  initTimeoutMs?: number;
}

export interface RenderOptions {
  /** 1 = normal; aus dem Sprechtempo: 1 / rate. */
  lengthScale: number;
}

export class EngineAbortError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

export class PiperEngine {
  readonly kind = "loadable" as const;
  readonly id: string;
  /** Werks-Tempo der Stimme (length_scale-Basis); Aufrufer teilen durch das Sprechtempo. */
  readonly tempo: number;
  private enabled = false;
  private worker: WorkerLike | null = null;
  private workerReady: Promise<void> | null = null;
  private starting = false;
  private failure: string | null = null;
  private idleTimer: number | null = null;
  private nextId = 1;
  private inflight = new Map<number, { resolve: (p: PcmBuffer) => void; reject: (e: Error) => void; onProgress: (d: number, t: number) => void }>();
  private busy = false;

  constructor(private readonly deps: PiperEngineDeps) {
    this.id = deps.descriptor.id;
    this.tempo = deps.descriptor.tempo ?? 1;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.dispose();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  lastError(): string | null {
    return this.failure;
  }

  async readiness(): Promise<EngineReadiness> {
    if (!this.enabled) return "off";
    if (this.failure) return "unavailable";
    if (this.starting) return "loading";
    if (this.worker) return "ready";
    const status = await this.deps.store.status(this.deps.descriptor);
    return status === "complete" ? "ready" : "needs-download";
  }

  /** Assets sind da, Worker noch nicht gestartet? Dann startet er hier (verify → Blob → init). */
  private async ensureWorker(): Promise<void> {
    if (this.worker && this.workerReady) return this.workerReady;
    if (this.workerReady) return this.workerReady;
    this.starting = true;
    this.workerReady = this.startWorker().finally(() => {
      this.starting = false;
    });
    return this.workerReady;
  }

  private async startWorker(): Promise<void> {
    const { store, descriptor } = this.deps;
    const verdict = await store.verify(descriptor);
    if (!verdict.ok) {
      this.failure = `checksum mismatch: ${verdict.fileName} (expected ${verdict.expected.slice(0, 12)}…, got ${verdict.actual.slice(0, 12)}…)`;
      throw new Error(this.failure);
    }
    const [source, wasm, model, configText] = await Promise.all([
      store.getText(descriptor, "worker"),
      store.getBuffer(descriptor, "wasm"),
      store.getBuffer(descriptor, "model"),
      store.getText(descriptor, "modelConfig"),
    ]);
    const config = parsePiperConfig(JSON.parse(configText));
    const worker = this.deps.makeWorker(source);
    this.worker = worker;
    worker.onmessage = (e) => this.onMessage(e.data);
    worker.onerror = (e) => this.onFatal(`worker error: ${e.message}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = this.deps.clock.setTimeout(() => {
        this.onFatal("worker init timeout");
        reject(new Error("worker init timeout"));
      }, this.deps.initTimeoutMs ?? 60_000);
      this.readyWaiters.push({
        resolve: () => {
          this.deps.clock.clearTimeout(timeout);
          resolve();
        },
        reject: (err) => {
          this.deps.clock.clearTimeout(timeout);
          reject(err);
        },
      });
      worker.postMessage({ type: "init", wasm, model, config }, [wasm, model]);
    });
  }

  private readyWaiters: { resolve: () => void; reject: (e: Error) => void }[] = [];

  private onMessage(msg: WorkerResponse): void {
    if (msg.type === "ready") {
      const w = this.readyWaiters.splice(0);
      w.forEach((x) => x.resolve());
      return;
    }
    if (msg.type === "progress") {
      this.inflight.get(msg.id)?.onProgress(msg.done, msg.total);
      return;
    }
    if (msg.type === "result") {
      const job = this.inflight.get(msg.id);
      this.inflight.delete(msg.id);
      job?.resolve({ samples: msg.samples, sampleRate: msg.sampleRate });
      this.busy = false;
      this.armIdleTimer();
      return;
    }
    if (msg.type === "error") {
      if (msg.id !== null) {
        const job = this.inflight.get(msg.id);
        this.inflight.delete(msg.id);
        job?.reject(new Error(msg.message));
        this.busy = false;
        this.armIdleTimer();
      } else {
        this.onFatal(msg.message);
      }
    }
  }

  private onFatal(message: string): void {
    this.failure = message;
    const w = this.readyWaiters.splice(0);
    w.forEach((x) => x.reject(new Error(message)));
    for (const [id, job] of this.inflight) {
      job.reject(new Error(message));
      this.inflight.delete(id);
    }
    this.terminateWorker();
  }

  private terminateWorker(): void {
    if (this.idleTimer !== null) {
      this.deps.clock.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.worker?.terminate();
    this.worker = null;
    this.workerReady = null;
    this.busy = false;
  }

  private armIdleTimer(): void {
    if (this.idleTimer !== null) this.deps.clock.clearTimeout(this.idleTimer);
    this.idleTimer = this.deps.clock.setTimeout(() => {
      this.idleTimer = null;
      if (!this.busy) this.terminateWorker();
    }, this.deps.idleDisposeMs ?? 300_000);
  }

  async synthesize(chunks: SpeechChunk[], opts: RenderOptions, signal: AbortSignal, onProgress: (done: number, total: number) => void): Promise<PcmBuffer> {
    if (!this.enabled) throw new Error("engine disabled");
    if (signal.aborted) throw new EngineAbortError();
    if (this.idleTimer !== null) {
      this.deps.clock.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    await this.ensureWorker();
    const worker = this.worker;
    if (!worker) throw new Error(this.failure ?? "worker unavailable");
    const id = this.nextId++;
    this.busy = true;
    return new Promise<PcmBuffer>((resolve, reject) => {
      const onAbort = (): void => {
        this.inflight.delete(id);
        // Der Worker kennt keinen Abbruch mitten in der Inferenz — terminieren, nächster Aufruf startet neu.
        this.terminateWorker();
        reject(new EngineAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.inflight.set(id, {
        resolve: (p) => {
          signal.removeEventListener("abort", onAbort);
          resolve(p);
        },
        reject: (e) => {
          signal.removeEventListener("abort", onAbort);
          reject(e);
        },
        onProgress,
      });
      worker.postMessage({ type: "synthesize", id, chunks, lengthScale: opts.lengthScale });
    });
  }

  /** Worker freigeben; Fehlerzustand zurücksetzen (nächster Aufruf versucht es neu). */
  dispose(): void {
    this.terminateWorker();
    this.failure = null;
    this.readyWaiters.splice(0);
  }
}
