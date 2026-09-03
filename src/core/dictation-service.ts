/**
 * Client-seitige Auswertung des `audio-ui`-Diensts (localhost, Default-Port 8765).
 *
 * Pur: kein `obsidian`, kein DOM, kein Netzwerk. Der Transport wird in der
 * Obsidian-Schicht injiziert; hier steht nur, wie eine Antwort zu LESEN ist.
 */

/** Mikrofon-Bereitschaft des Diensts, wie `GET /health` sie meldet. */
export type MicState = "bereit" | "wartet_auf_consent" | "unbekannt";

export type ServiceHealth = {
  /**
   * Darf Audio geschickt werden? Maßgeblich ist `engines_geladen`, NICHT
   * `zustand` — siehe `readServiceHealth`.
   */
  canTranscribe: boolean;
  mic: MicState;
  /**
   * Die Klartext-Auskunft des Diensts, wörtlich.
   *
   * ⚠️ **Nie eine Nutzermeldung aus `mic` allein bilden.** `wartet_auf_consent`
   * ist drüben ein Sammelbecken für fünf Ursachen (am Code gemessen,
   * `audio_ui/service/zustand.py`): Consent nicht erteilt · **abgelehnt, wo
   * Warten gerade nicht hilft** · durch Richtlinie gesperrt · Consent-Abfrage
   * selbst defekt · Modell lädt noch bzw. Ladefehler. Bei den letzten beiden hat
   * der Consent mit der Sache nichts zu tun. Nur `detail` sagt, welcher Fall
   * vorliegt.
   */
  detail: string;
};

/** Antwort auf `POST /transcribe`, so wie der Transport sie durchreicht. */
export type TranscribeResponse = { status: number; body: unknown };

/**
 * Fehlerarten von `POST /transcribe`. Getrennt, weil sie verschiedene Hinweise
 * verdienen: `ungueltige_anfrage` und `zu_gross` liegen beim Aufrufer,
 * `nicht_bereit` ist vorübergehend (Modell lädt noch), `dienst_fehler` gehört
 * ins Log des Diensts.
 *
 * ⚠️ Die Vokabel wählt den Hinweis, sie ERSETZT ihn nicht: hinter `400` stehen
 * drüben zwei Ursachen (unlesbares Audio · unbekannte Engine), hinter `413`
 * ebenfalls zwei (Body > 100 MB · Audio > 600 s). Welche es war, sagt nur
 * `detail`.
 */
export type TranscribeFailure = "ungueltige_anfrage" | "zu_gross" | "nicht_bereit" | "dienst_fehler";

export type TranscribeOutcome =
  | { ok: true; text: string; audioS: number; dauerS: number; rtf: number }
  | { ok: false; kind: TranscribeFailure; detail: string };

/** Übersetzt eine Dienst-Antwort in ein Ergebnis, das der Aufrufer anzeigen kann. */
export function transcribeOutcome(res: TranscribeResponse): TranscribeOutcome {
  const detail = detailOf(res.body);
  if (res.status === 200) {
    const b = res.body as { text?: unknown; audio_s?: unknown; dauer_s?: unknown; rtf?: unknown };
    return {
      ok: true,
      text: typeof b.text === "string" ? b.text : "",
      audioS: numberOr(b.audio_s),
      dauerS: numberOr(b.dauer_s),
      rtf: numberOr(b.rtf),
    };
  }
  if (res.status === 503) return { ok: false, kind: "nicht_bereit", detail };
  if (res.status === 400) return { ok: false, kind: "ungueltige_anfrage", detail };
  if (res.status === 413) return { ok: false, kind: "zu_gross", detail };
  return { ok: false, kind: "dienst_fehler", detail };
}

function detailOf(body: unknown): string {
  const raw = body as { detail?: unknown };
  return typeof raw?.detail === "string" ? raw.detail : "";
}

/**
 * Liest den Körper von `GET /health`.
 *
 * ⚠️ **`zustand` ist kein Gate.** In Etappe 1 öffnet der Dienst keinen
 * Audiostream, löst also nie den TCC-Dialog aus; auf einem Rechner ohne
 * Consent steht er deshalb dauerhaft auf `wartet_auf_consent`, während
 * `POST /transcribe` einwandfrei arbeitet. Wer Transkription hinter
 * `zustand === "bereit"` sperrt, hält den Dienst für unbenutzbar.
 * Der maschinenlesbare Indikator für „kann transkribieren" ist
 * `engines_geladen` (audio-ui `AGENTS.md`, 2026-09-02).
 */
export function readServiceHealth(body: unknown): ServiceHealth {
  const raw = body as { zustand?: unknown; engines_geladen?: unknown };
  const geladen = raw.engines_geladen;
  return {
    canTranscribe: Array.isArray(geladen) && geladen.length > 0,
    mic: raw.zustand === "bereit" || raw.zustand === "wartet_auf_consent" ? raw.zustand : "unbekannt",
    detail: detailOf(body),
  };
}

function numberOr(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Ergebnis einer Health-Abfrage aus Sicht des Plugins. */
export type ServiceProbe = { reachable: false } | { reachable: true; body: unknown };

/**
 * Die drei Zustände, die das Plugin unterscheiden muss.
 *
 * `nicht_erreichbar` kann der Dienst nicht selbst melden — er entsteht hier,
 * wenn die Anfrage gar nicht ankommt. Ohne diesen dritten Zustand meldet das
 * Plugin beim allerersten Start „nicht da", während auf dem Bildschirm ein
 * macOS-Dialog auf einen Klick wartet (gemessen 2026-09-01: > 5 min stilles
 * Hängen). Er ist **kein Erststart-Sonderfall**: der TCC-Anker ist der Pfad,
 * ein neues venv oder uv-Update bringt ihn wortlos zurück.
 */
export type ServiceState = MicState | "nicht_erreichbar";

export type ServiceStatus = {
  state: ServiceState;
  canTranscribe: boolean;
  detail: string;
  /**
   * Maschinenlesbare Ursache hinter `wartet_auf_consent` — ab Dienst 0.2.0.
   * `null` heißt entweder „alles gut" oder „der Dienst ist älter und kennt das
   * Feld nicht"; unterscheidbar an `state`.
   *
   * Bewusst ein roher `string`, kein Union-Typ: das Enum wächst drüben, und ein
   * Wert, den diese Fassung nicht kennt, darf hier nicht durchs Raster fallen.
   */
  cause: string | null;
  /**
   * Lohnt sich eine erneute Abfrage?
   *
   * ⚠️ **Nie aus `cause` ableiten.** Genau dafür gibt es dieses Feld: kommt
   * drüben ein neuer `cause`-Wert dazu, entscheidet ein Client, der ihn an einer
   * eigenen Tabelle nachschlägt, falsch — dieser hier fragt das Feld.
   * Fehlt es (Dienst 0.1.0), bleibt Nachfragen erlaubt: die Fälle, die es
   * verbieten würden, sind dort ohnehin nicht unterscheidbar.
   */
  retryUseful: boolean;
};

export function serviceStatus(probe: ServiceProbe): ServiceStatus {
  // Ohne Antwort gibt es kein `detail`: dieser Zustand entsteht hier, nicht drüben.
  if (!probe.reachable) {
    return { state: "nicht_erreichbar", canTranscribe: false, detail: "", cause: null, retryUseful: true };
  }
  const health = readServiceHealth(probe.body);
  const raw = probe.body as { ursache?: unknown; retry_sinnvoll?: unknown };
  return {
    state: health.mic,
    canTranscribe: health.canTranscribe,
    detail: health.detail,
    cause: typeof raw.ursache === "string" ? raw.ursache : null,
    retryUseful: typeof raw.retry_sinnvoll === "boolean" ? raw.retry_sinnvoll : true,
  };
}
