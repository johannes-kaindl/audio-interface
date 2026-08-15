import { describe, expect, it } from "vitest";
import { abort, begin, canAbort, fail, finish, IDLE, isBusy, progress } from "../../src/core/run-state";

describe("run-state", () => {
  it("begin → running mit Phase, progress aktualisiert nur im running", () => {
    const s = begin("preparing");
    expect(s).toEqual({ kind: "running", phase: "preparing", done: 0, total: 0 });
    expect(progress(s, "synthesizing", 2, 5)).toEqual({ kind: "running", phase: "synthesizing", done: 2, total: 5 });
    expect(progress(IDLE, "synthesizing", 2, 5)).toBe(IDLE);
  });
  it("abort: running (nicht writing) → aborted; writing bleibt; idle bleibt", () => {
    expect(abort(begin("synthesizing"))).toEqual({ kind: "aborted" });
    const w = progress(begin("writing"), "writing", 0, 1);
    expect(abort(w)).toBe(w);
    expect(abort(IDLE)).toBe(IDLE);
    expect(canAbort(begin("downloading"))).toBe(true);
    expect(canAbort(w)).toBe(false);
    expect(canAbort(IDLE)).toBe(false);
  });
  it("ein Fehler nach Abbruch überschreibt den Abbruch nicht", () => {
    const a = abort(begin("downloading"));
    expect(fail(a, "stream closed")).toBe(a);
    expect(fail(begin("downloading"), "404")).toEqual({ kind: "failed", message: "404" });
  });
  it("finish nach Abbruch bleibt aborted; sonst done mit Detail", () => {
    const a = abort(begin("synthesizing"));
    expect(finish(a, "x.wav")).toBe(a);
    expect(finish(begin("writing"), "x.wav")).toEqual({ kind: "done", detail: "x.wav" });
  });
  it("isBusy nur bei running", () => {
    expect(isBusy(begin("preparing"))).toBe(true);
    expect(isBusy(IDLE)).toBe(false);
    expect(isBusy(finish(begin("writing"), ""))).toBe(false);
  });
});
