// Statusleiste: ein Eintrag, Text je Zustand, Klick = Stopp/Abbruch. Reine Übersetzung Zustand → Text,
// damit main.ts sie nur füttern muss.
import type { RunState } from "../core/run-state";
import { t } from "../i18n/strings";
import type { SpeakerState } from "./speaker";

export function statusText(speaker: SpeakerState, run: RunState): string | null {
  if (run.kind === "running") {
    if (run.phase === "downloading") return t("status.downloading", (run.done / 1048576).toFixed(0), (run.total / 1048576).toFixed(0));
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

export class StatusBar {
  private speaker: SpeakerState = { kind: "idle" };
  private run: RunState = { kind: "idle" };

  constructor(
    private readonly el: HTMLElement,
    onClick: () => void,
  ) {
    el.addClass("audio-interface-status");
    el.setAttr("aria-label", t("status.tooltip"));
    el.addEventListener("click", onClick);
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
    const text = statusText(this.speaker, this.run);
    this.el.setText(text ?? "");
    this.el.toggleClass("is-hidden", text === null);
  }
}
