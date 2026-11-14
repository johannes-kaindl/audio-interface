// Statusleiste: ein Eintrag, Text je Zustand, Klick = Stopp/Abbruch. Reine Übersetzung Zustand → Text,
// damit main.ts sie nur füttern muss.
import { IDLE, type RunState } from "../core/run-state";
import { t } from "../i18n/strings";
import type { StatusBarItemHandle } from "../vendor/kit-obsidian/status-bar-item";
import type { SpeakerState } from "./speaker";

export function statusText(speaker: SpeakerState, run: RunState): string | null {
  if (run.status === "running") {
    if (run.phase === "downloading") return t("status.downloading", (run.done / 1e6).toFixed(0), (run.total / 1e6).toFixed(0));
    if (run.phase === "writing") return t("status.writing");
    if (run.phase === "synthesizing" || run.phase === "encoding") return t("status.rendering", run.done, run.total);
    return t("status.rendering", 0, 0);
  }
  if (speaker.kind === "rendering") return t("status.rendering", speaker.done, speaker.total);
  if (speaker.kind === "speaking") {
    return speaker.paused ? t("status.speakingPaused", speaker.done + 1, speaker.total) : t("status.speaking", speaker.done + 1, speaker.total);
  }
  return null;
}

/** Hängt die Zustände an den Kit-Handle (`createStatusBarItem`): Text je Zustand, `null` blendet den Eintrag aus. Klick, Klasse und `aria-label` setzt `main.ts` in `onCreate` des Handles. */
export class StatusBar {
  private speaker: SpeakerState = { kind: "idle" };
  private run: RunState = IDLE;

  constructor(private readonly item: StatusBarItemHandle) {
    this.render();
  }

  setSpeaker(s: SpeakerState): void {
    this.speaker = s;
    this.render();
  }

  setRun(s: RunState): void {
    this.run = s;
    this.render();
  }

  private render(): void {
    this.item.set(statusText(this.speaker, this.run));
  }
}
