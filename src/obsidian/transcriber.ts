import { encodeWav, mixToMono, resample } from "../core/audio";
import { serviceStatus, transcribeOutcome, type ServiceStatus, type TranscribeOutcome } from "../core/dictation-service";

/** Der Dienst arbeitet intern mit 16 kHz Mono — wir liefern es gleich so. */
export const SERVICE_SAMPLE_RATE = 16000;

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  body?: ArrayBuffer;
  contentType?: string;
}

export interface HttpResponse {
  status: number;
  json: unknown;
}

export interface DecodedAudio {
  channels: Float32Array[];
  sampleRate: number;
}

export interface TranscriberDeps {
  /** Basis-URL aus den Einstellungen; nur localhost (Schema-geprüft). */
  baseUrl: () => string;
  /** HTTP. In Produktion Obsidians `requestUrl` — injiziert, damit Tests ohne Netz laufen. */
  request: (req: HttpRequest) => Promise<HttpResponse>;
  /**
   * Dekodiert beliebiges Audio zu Kanälen. In Produktion `AudioContext.decodeAudioData`.
   *
   * Der Grund, warum es das überhaupt gibt: der Dienst liest über `soundfile`
   * (libsndfile) und kennt damit **kein webm und kein m4a** — gemessen am
   * 2026-09-03, beide Male HTTP 400. Genau die erzeugt aber Obsidians
   * Audio-Recorder. Der Renderer kann sie nativ, also dekodieren wir hier und
   * schicken WAV. Nebeneffekt: der Dienst bekommt immer sein Zielformat und muss
   * nicht selbst resampeln.
   */
  decode: (bytes: ArrayBuffer) => Promise<DecodedAudio>;
}

export class Transcriber {
  constructor(private readonly deps: TranscriberDeps) {}

  /**
   * Fragt `GET /health`. Antwortet niemand, ist das `nicht_erreichbar` — der
   * dritte Zustand entsteht hier, nicht im Dienst.
   */
  async health(): Promise<ServiceStatus> {
    try {
      const res = await this.deps.request({ url: `${this.base()}/health`, method: "GET" });
      if (res.status !== 200) return serviceStatus({ reachable: false });
      return serviceStatus({ reachable: true, body: res.json });
    } catch {
      return serviceStatus({ reachable: false });
    }
  }

  /** Dekodiert, mischt zu Mono, taktet auf 16 kHz und schickt das Ergebnis als WAV. */
  async transcribeFile(bytes: ArrayBuffer): Promise<TranscribeOutcome> {
    const decoded = await this.deps.decode(bytes);
    const mono = { samples: mixToMono(decoded.channels), sampleRate: decoded.sampleRate };
    const wav = encodeWav(resample(mono, SERVICE_SAMPLE_RATE));
    const res = await this.deps.request({
      url: `${this.base()}/transcribe`,
      method: "POST",
      body: wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength) as ArrayBuffer,
      contentType: "audio/wav",
    });
    return transcribeOutcome({ status: res.status, body: res.json });
  }

  /** Ohne Schrägstrich am Ende, damit `${base}/health` nicht `//health` wird. */
  private base(): string {
    return this.deps.baseUrl().replace(/\/+$/, "");
  }
}
