import { getLanguage, Plugin } from "obsidian";
import { initI18n, t } from "./i18n/strings";

export default class AudioInterfacePlugin extends Plugin {
  async onload(): Promise<void> {
    initI18n(getLanguage());
    this.addCommand({ id: "speak-note", name: t("cmd.speakNote"), callback: () => {} });
  }
}
