import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { audioPlugin } from "./audio";
import { videoPlugin } from "./video";

const hlsLoadSource = vi.hoisted(() => vi.fn());
const hlsAttachMedia = vi.hoisted(() => vi.fn());
const hlsDestroy = vi.hoisted(() => vi.fn());
const mpegtsCreatePlayer = vi.hoisted(() => vi.fn());
const mpegtsAttachMedia = vi.hoisted(() => vi.fn());
const mpegtsLoad = vi.hoisted(() => vi.fn());
const mpegtsUnload = vi.hoisted(() => vi.fn());
const mpegtsDestroy = vi.hoisted(() => vi.fn());
const mpegtsOn = vi.hoisted(() => vi.fn());

vi.mock("hls.js", () => {
  class Hls {
    static Events = { ERROR: "error" };
    static isSupported = vi.fn(() => true);
    loadSource = hlsLoadSource;
    attachMedia = hlsAttachMedia;
    on = vi.fn();
    destroy = hlsDestroy;
  }
  return { default: Hls };
});

vi.mock("mpegts.js", () => ({
  default: {
    Events: { ERROR: "error" },
    isSupported: vi.fn(() => true),
    createPlayer: mpegtsCreatePlayer
  }
}));

describe("media plugins", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    hlsLoadSource.mockClear();
    hlsAttachMedia.mockClear();
    hlsDestroy.mockClear();
    mpegtsCreatePlayer.mockClear();
    mpegtsAttachMedia.mockClear();
    mpegtsLoad.mockClear();
    mpegtsUnload.mockClear();
    mpegtsDestroy.mockClear();
    mpegtsOn.mockClear();
  });

  it("renders audio and revokes object urls on destroy", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-audio";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["audio"], { type: "audio/mpeg" }),
      fileName: "track.mp3",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("audio")));
    const audio = container.querySelector("audio");
    expect(audio?.src).toBe(objectUrl);

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("shows a download fallback when audio playback errors", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-audio-wma";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["audio"], { type: "audio/x-ms-wma" }),
      fileName: "track.wma",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("audio")));
    container.querySelector("audio")?.dispatchEvent(new Event("error"));

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));
    expect(container.querySelector("audio")).toBeNull();
    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("WMA");
    expect(container.querySelector(".ofv-fallback a")?.getAttribute("href")).toBe(objectUrl);

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("shows MIME type in audio fallback when extension is unavailable", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:ofv-audio-amr"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["audio"], { type: "audio/amr" }),
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("audio")));
    container.querySelector("audio")?.dispatchEvent(new Event("error"));

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));
    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("AUDIO/AMR");

    viewer.destroy();
  });

  it("shows a download fallback when video playback errors", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-video";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["video"], { type: "video/x-msvideo" }),
      fileName: "clip.avi",
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("video")));
    container.querySelector("video")?.dispatchEvent(new Event("error"));

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));
    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("AVI");
    expect(container.querySelector(".ofv-fallback a")?.getAttribute("href")).toBe(objectUrl);

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("shows MIME type in video fallback when extension is unavailable", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-video-mime";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["video"], { type: "video/x-matroska" }),
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("video")));
    container.querySelector("video")?.dispatchEvent(new Event("error"));

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));
    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("VIDEO/X-MATROSKA");

    viewer.destroy();
  });

  it("routes extensionless HLS MIME sources through hls.js", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-hls";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["#EXTM3U"], { type: "application/vnd.apple.mpegurl" }),
      plugins: [videoPlugin()]
    });

    await waitFor(() => hlsLoadSource.mock.calls.length > 0);

    expect(hlsLoadSource).toHaveBeenCalledWith(objectUrl);
    expect(hlsAttachMedia).toHaveBeenCalledWith(container.querySelector("video"));

    viewer.destroy();
    expect(hlsDestroy).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("routes video/mp2t blobs through mpegts.js without treating .ts text as video", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-mp2t";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });
    mpegtsCreatePlayer.mockReturnValue({
      attachMediaElement: mpegtsAttachMedia,
      load: mpegtsLoad,
      unload: mpegtsUnload,
      destroy: mpegtsDestroy,
      on: mpegtsOn
    });

    const viewer = createViewer({
      container,
      file: new Blob(["ts"], { type: "video/mp2t" }),
      fileName: "segment",
      plugins: [videoPlugin()]
    });

    await waitFor(() => mpegtsCreatePlayer.mock.calls.length > 0);

    expect(mpegtsCreatePlayer).toHaveBeenCalledWith({ type: "mpegts", url: objectUrl });
    expect(mpegtsAttachMedia).toHaveBeenCalledWith(container.querySelector("video"));
    expect(mpegtsLoad).toHaveBeenCalledTimes(1);

    viewer.destroy();
    expect(mpegtsUnload).toHaveBeenCalledTimes(1);
    expect(mpegtsDestroy).toHaveBeenCalledTimes(1);
  });

  it("routes .m2ts files through mpegts.js even when MIME is generic", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-m2ts";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });
    mpegtsCreatePlayer.mockReturnValue({
      attachMediaElement: mpegtsAttachMedia,
      load: mpegtsLoad,
      unload: mpegtsUnload,
      destroy: mpegtsDestroy,
      on: mpegtsOn
    });

    const viewer = createViewer({
      container,
      file: new Blob(["m2ts"], { type: "application/octet-stream" }),
      fileName: "camera.m2ts",
      plugins: [videoPlugin()]
    });

    await waitFor(() => mpegtsCreatePlayer.mock.calls.length > 0);

    expect(mpegtsCreatePlayer).toHaveBeenCalledWith({ type: "mpegts", url: objectUrl });

    viewer.destroy();
  });

  it("shows a download fallback for DASH manifests without a built-in DASH player", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:ofv-dash";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["<MPD />"], { type: "application/dash+xml" }),
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("APPLICATION/DASH+XML");
    expect(hlsLoadSource).not.toHaveBeenCalled();
    expect(mpegtsCreatePlayer).not.toHaveBeenCalled();

    viewer.destroy();
  });
});

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
