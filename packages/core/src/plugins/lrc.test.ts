import { describe, expect, it } from "vitest";
import { parseLrc } from "./lrc";

describe("parseLrc", () => {
  it("parses metadata, repeated line timestamps, vocal roles, and enhanced word timing", () => {
    const parsed = parseLrc([
      "[ti:夜航]",
      "[ar:示例歌手]",
      "[00:01.20][00:11.20]M:<00:01.20>第一<00:01.80>句",
      "[00:03.00]继续男声",
      "[00:05.40]D:一起唱"
    ].join("\n"));

    expect(parsed.metadata).toEqual([
      { key: "ti", value: "夜航", line: 1 },
      { key: "ar", value: "示例歌手", line: 2 }
    ]);
    expect(parsed.lyrics[0]).toMatchObject({
      timestamps: ["00:01.20", "00:11.20"],
      text: "第一句",
      role: "M",
      explicitRole: "M"
    });
    expect(parsed.lyrics[0].words).toEqual([
      { timestamp: "00:01.20", text: "第一" },
      { timestamp: "00:01.80", text: "句" }
    ]);
    expect(parsed.lyrics[1]).toMatchObject({ role: "M", explicitRole: undefined });
    expect(parsed.lyrics[2]).toMatchObject({ role: "D", explicitRole: "D" });
  });

  it("keeps untimed lyric text while ignoring empty lines", () => {
    const parsed = parseLrc("\nA free lyric line\n[00:02]Timed line\n");

    expect(parsed.lyrics.map((line) => line.text)).toEqual(["A free lyric line", "Timed line"]);
    expect(parsed.lyrics[0].timestamps).toEqual([]);
  });
});
