import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { audioPlugin } from "./audio";
import { __setMpegtsLoaderForTests, videoPlugin } from "./video";

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

describe("media plugins", () => {
  afterEach(() => {
    document.body.replaceChildren();
    __setMpegtsLoaderForTests(null);
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

  it("renders WAV audio header metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:wav-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalWav(),
      fileName: "tone.wav",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式WAV");
    expect(container.textContent).toContain("编码PCM");
    expect(container.textContent).toContain("采样率44100 Hz");
    expect(container.textContent).toContain("声道2");
    expect(container.textContent).toContain("位深16 bit");
    expect(container.textContent).toContain("时长0:01");

    viewer.destroy();
  });

  it("renders MP3 ID3 and MPEG frame metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mp3-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalMp3(),
      fileName: "track.mp3",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式MP3");
    expect(container.textContent).toContain("MPEG-1 Layer III");
    expect(container.textContent).toContain("采样率44100 Hz");
    expect(container.textContent).toContain("码率128 kbps");
    expect(container.textContent).toContain("标签ID3v2.4.0");

    viewer.destroy();
  });

  it("renders AAC ADTS metadata before trying the MP3 frame parser", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:aac-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalAac(),
      fileName: "tone.aac",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.textContent).toContain("格式AAC");
    expect(container.textContent).toContain("AAC ADTS");
    expect(container.textContent).toContain("采样率44100 Hz");
    expect(container.textContent).not.toContain("格式MP3");

    viewer.destroy();
  });

  it("renders FLAC stream info metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:flac-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalFlac(),
      fileName: "song.flac",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式FLAC");
    expect(container.textContent).toContain("采样率48000 Hz");
    expect(container.textContent).toContain("声道2");
    expect(container.textContent).toContain("位深24 bit");

    viewer.destroy();
  });

  it("renders Ogg Opus page metadata and duration", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:opus-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalOggOpus(),
      fileName: "voice.opus",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式Ogg");
    expect(container.textContent).toContain("编码Opus");
    expect(container.textContent).toContain("采样率48000 Hz");
    expect(container.textContent).toContain("声道2");
    expect(container.textContent).toContain("时长0:02");
    expect(container.textContent).toContain("说明2 页");

    viewer.destroy();
  });

  it("renders AU/SND audio header metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:au-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalAu(),
      fileName: "voice.au",
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式AU/SND");
    expect(container.textContent).toContain("8-bit μ-law");
    expect(container.textContent).toContain("采样率8000 Hz");
    expect(container.textContent).toContain("声道1");
    expect(container.textContent).toContain("位深8 bit");
    expect(container.textContent).toContain("时长0:01");
    expect(container.textContent).toContain("data @ 24 B");

    viewer.destroy();
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

  it("keeps shared zoom and rotate commands disabled for audio previews", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:ofv-audio-toolbar"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalWav(),
      fileName: "tone.wav",
      toolbar: true,
      plugins: [audioPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("audio")));

    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]')?.disabled).toBe(true);

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
    expect(container.querySelector("video")).toBeNull();

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("renders MP4 container metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:mp4-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalMp4(),
      fileName: "clip.mp4",
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式MP4");
    expect(container.textContent).toContain("编码isom");
    expect(container.textContent).toContain("尺寸1920 x 1080px");
    expect(container.textContent).toContain("时长0:12");
    expect(container.textContent).toContain("轨道1");

    viewer.destroy();
  });

  it("supports shared zoom and rotate commands for video previews inside narrow containers", async () => {
    const container = document.createElement("div");
    container.style.width = "260px";
    container.style.height = "220px";
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:video-toolbar"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalMp4(),
      fileName: "narrow.mp4",
      width: "260px",
      height: "220px",
      toolbar: true,
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector("video")));
    const video = container.querySelector<HTMLVideoElement>("video");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');

    expect(zoomIn?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    expect(container.querySelector<HTMLElement>(".ofv-video-container")?.clientWidth).toBeLessThanOrEqual(
      container.clientWidth
    );

    zoomIn?.click();
    expect(video?.style.transform).toBe("scale(1.25) rotate(0deg)");
    expect(zoomReset?.textContent).toBe("125%");

    rotate?.click();
    expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth + 1);
    const stage = container.querySelector<HTMLElement>(".ofv-video-stage");
    expect(stage?.scrollWidth).toBeLessThanOrEqual((stage?.clientWidth || 0) + 1);
    rotate?.click();
    rotate?.click();
    rotate?.click();
    rotate?.click();
    expect(video?.style.transform).toBe("scale(1.25) rotate(450deg)");

    zoomReset?.click();
    expect(video?.style.transform).toBe("scale(1) rotate(0deg)");
    expect(zoomReset?.textContent).toBe("100%");

    viewer.destroy();
  });

  it("renders HLS playlist metadata while routing through hls.js", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:hls-info";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(
        [
          [
            "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=2500000",
            "hi/prog.m3u8",
            "#EXTINF:4.0,",
            "seg1.ts",
            "#EXTINF:5.5,",
            "seg2.ts"
          ].join("\n")
        ],
        { type: "application/vnd.apple.mpegurl" }
      ),
      fileName: "stream.m3u8",
      plugins: [videoPlugin()]
    });

    await waitFor(() => hlsLoadSource.mock.calls.length > 0 && Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式HLS");
    expect(container.textContent).toContain("码率2500 kbps");
    expect(container.textContent).toContain("变体1");
    expect(container.textContent).toContain("片段2");
    expect(container.textContent).toContain("时长0:10");

    viewer.destroy();
  });

  it("renders AVI main header metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:avi-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalAvi(),
      fileName: "capture.avi",
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式AVI");
    expect(container.textContent).toContain("尺寸640 x 360px");
    expect(container.textContent).toContain("轨道2");
    expect(container.textContent).toContain("时长0:10");

    viewer.destroy();
  });

  it("renders WebM EBML segment info and track metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:webm-info"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalWebm(),
      fileName: "movie.webm",
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-media-info")));

    expect(container.querySelector<HTMLElement>(".ofv-media-info")?.hidden).toBe(true);
    expect(container.textContent).toContain("格式WebM");
    expect(container.textContent).toContain("编码V_VP9");
    expect(container.textContent).toContain("尺寸1280 x 720px");
    expect(container.textContent).toContain("时长0:12");
    expect(container.textContent).toContain("轨道2");
    expect(container.textContent).toContain("EBML DocType webm");

    viewer.destroy();
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
    __setMpegtsLoaderForTests(async () => ({
      default: {
        Events: { ERROR: "error" },
        isSupported: vi.fn(() => true),
        createPlayer: mpegtsCreatePlayer
      }
    }));
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
    __setMpegtsLoaderForTests(async () => ({
      default: {
        Events: { ERROR: "error" },
        isSupported: vi.fn(() => true),
        createPlayer: mpegtsCreatePlayer
      }
    }));
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
      toolbar: true,
      plugins: [videoPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.querySelector(".ofv-fallback")?.textContent).toContain("APPLICATION/DASH+XML");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]')?.disabled).toBe(true);
    expect(hlsLoadSource).not.toHaveBeenCalled();
    expect(mpegtsCreatePlayer).not.toHaveBeenCalled();

    viewer.destroy();
  });
});

function minimalWav(): Blob {
  const sampleRate = 44100;
  const channels = 2;
  const bitDepth = 16;
  const dataSize = sampleRate * channels * (bitDepth / 8);
  const bytes = new Uint8Array(44);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 36 + dataSize, true);
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bitDepth / 8), true);
  view.setUint16(32, channels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, dataSize, true);
  return new Blob([bytes], { type: "audio/wav" });
}

function minimalMp3(): Blob {
  return new Blob([
    new Uint8Array([
      0x49, 0x44, 0x33,
      0x04, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0xff, 0xfb, 0x90, 0x64
    ])
  ], { type: "audio/mpeg" });
}

function minimalAac(): Blob {
  return new Blob([new Uint8Array([0xff, 0xf1, 0x50, 0x80, 0x01, 0x1f, 0xfc])], { type: "audio/aac" });
}

function minimalFlac(): Blob {
  const bytes = new Uint8Array(4 + 4 + 34);
  bytes.set(new TextEncoder().encode("fLaC"), 0);
  bytes[4] = 0x80;
  bytes[5] = 0x00;
  bytes[6] = 0x00;
  bytes[7] = 0x22;
  const streamInfo = bytes.subarray(8);
  const sampleRate = 48000;
  const channelsMinusOne = 1;
  const bitsMinusOne = 23;
  const totalSamples = 48000n;
  streamInfo[10] = (sampleRate >>> 12) & 0xff;
  streamInfo[11] = (sampleRate >>> 4) & 0xff;
  streamInfo[12] = ((sampleRate & 0x0f) << 4) | ((channelsMinusOne & 0x07) << 1) | ((bitsMinusOne >>> 4) & 0x01);
  streamInfo[13] = ((bitsMinusOne & 0x0f) << 4) | Number((totalSamples >> 32n) & 0x0fn);
  streamInfo[14] = Number((totalSamples >> 24n) & 0xffn);
  streamInfo[15] = Number((totalSamples >> 16n) & 0xffn);
  streamInfo[16] = Number((totalSamples >> 8n) & 0xffn);
  streamInfo[17] = Number(totalSamples & 0xffn);
  return new Blob([bytes], { type: "audio/flac" });
}

function minimalOggOpus(): Blob {
  const opusHead = [
    ...ascii("OpusHead"),
    1,
    2,
    ...uint16Le(312),
    ...uint32Le(48000),
    ...uint16Le(0),
    0
  ];
  const audioPacket = [0xf8, 0xff, 0xfe];
  return new Blob([
    new Uint8Array([
      ...oggPage({ granule: 0n, sequence: 0, packets: [opusHead] }),
      ...oggPage({ granule: 96312n, sequence: 1, packets: [audioPacket] })
    ])
  ], { type: "audio/ogg" });
}

function minimalAu(): Blob {
  const sampleRate = 8000;
  const channels = 1;
  const dataSize = sampleRate * channels;
  const bytes = new Uint8Array(24 + dataSize);
  bytes.set(ascii(".snd"), 0);
  bytes.set(uint32Be(24), 4);
  bytes.set(uint32Be(dataSize), 8);
  bytes.set(uint32Be(1), 12);
  bytes.set(uint32Be(sampleRate), 16);
  bytes.set(uint32Be(channels), 20);
  bytes.fill(0xff, 24);
  return new Blob([bytes], { type: "audio/basic" });
}

function minimalMp4(): Blob {
  const ftyp = mp4Atom("ftyp", [...ascii("isom"), 0, 0, 0, 1, ...ascii("isom")]);
  const mvhd = mp4Atom("mvhd", [
    0, 0, 0, 0,
    ...uint32Be(0),
    ...uint32Be(0),
    ...uint32Be(1000),
    ...uint32Be(12000),
    ...new Array(80).fill(0)
  ]);
  const tkhdPayload = new Array(84).fill(0);
  tkhdPayload[0] = 0;
  tkhdPayload.splice(72, 4, ...uint32Be(1920 * 65536));
  tkhdPayload.splice(76, 4, ...uint32Be(1080 * 65536));
  const tkhd = mp4Atom("tkhd", tkhdPayload);
  const trak = mp4Atom("trak", tkhd);
  const moov = mp4Atom("moov", [...mvhd, ...trak]);
  return new Blob([new Uint8Array([...ftyp, ...moov])], { type: "video/mp4" });
}

function minimalAvi(): Blob {
  const bytes = new Uint8Array(12 + 8 + 56);
  const view = new DataView(bytes.buffer);
  bytes.set(ascii("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(ascii("AVI "), 8);
  bytes.set(ascii("avih"), 12);
  view.setUint32(16, 56, true);
  view.setUint32(20, 33333, true);
  view.setUint32(28, 800000, true);
  view.setUint32(36, 300, true);
  view.setUint32(44, 2, true);
  view.setUint32(52, 640, true);
  view.setUint32(56, 360, true);
  return new Blob([bytes], { type: "video/x-msvideo" });
}

function minimalWebm(): Blob {
  const header = ebmlElement(0x1a45dfa3, [
    ...ebmlElement(0x4286, [1]),
    ...ebmlElement(0x42f7, [1]),
    ...ebmlElement(0x4282, ascii("webm")),
    ...ebmlElement(0x4287, [4]),
    ...ebmlElement(0x4285, [2])
  ]);
  const info = ebmlElement(0x1549a966, [
    ...ebmlElement(0x2ad7b1, [0x0f, 0x42, 0x40]),
    ...ebmlElement(0x4489, float64Be(12250))
  ]);
  const videoTrack = ebmlElement(0xae, [
    ...ebmlElement(0xd7, [1]),
    ...ebmlElement(0x83, [1]),
    ...ebmlElement(0x86, ascii("V_VP9")),
    ...ebmlElement(0xe0, [
      ...ebmlElement(0xb0, [0x05, 0x00]),
      ...ebmlElement(0xba, [0x02, 0xd0])
    ])
  ]);
  const audioTrack = ebmlElement(0xae, [
    ...ebmlElement(0xd7, [2]),
    ...ebmlElement(0x83, [2]),
    ...ebmlElement(0x86, ascii("A_OPUS"))
  ]);
  const tracks = ebmlElement(0x1654ae6b, [...videoTrack, ...audioTrack]);
  const segment = ebmlElement(0x18538067, [...info, ...tracks]);
  return new Blob([new Uint8Array([...header, ...segment])], { type: "video/webm" });
}

function mp4Atom(type: string, payload: number[]): number[] {
  return [...uint32Be(payload.length + 8), ...ascii(type), ...payload];
}

function ebmlElement(id: number, payload: number[]): number[] {
  return [...ebmlId(id), ...ebmlSize(payload.length), ...payload];
}

function ebmlId(id: number): number[] {
  if (id <= 0xff) {
    return [id];
  }
  if (id <= 0xffff) {
    return [(id >>> 8) & 0xff, id & 0xff];
  }
  if (id <= 0xffffff) {
    return [(id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
  }
  return [(id >>> 24) & 0xff, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff];
}

function ebmlSize(size: number): number[] {
  if (size < 0x7f) {
    return [0x80 | size];
  }
  if (size < 0x3fff) {
    return [0x40 | ((size >>> 8) & 0x3f), size & 0xff];
  }
  return [0x20 | ((size >>> 16) & 0x1f), (size >>> 8) & 0xff, size & 0xff];
}

function float64Be(value: number): number[] {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return [...bytes];
}

function ascii(value: string): number[] {
  return [...new TextEncoder().encode(value)];
}

function uint32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function uint64Le(value: bigint): number[] {
  return [
    Number(value & 0xffn),
    Number((value >> 8n) & 0xffn),
    Number((value >> 16n) & 0xffn),
    Number((value >> 24n) & 0xffn),
    Number((value >> 32n) & 0xffn),
    Number((value >> 40n) & 0xffn),
    Number((value >> 48n) & 0xffn),
    Number((value >> 56n) & 0xffn)
  ];
}

function oggPage({ granule, sequence, packets }: { granule: bigint; sequence: number; packets: number[][] }): number[] {
  const payload = packets.flat();
  const segments = packets.flatMap((packet) => oggLacing(packet.length));
  return [
    ...ascii("OggS"),
    0,
    sequence === 0 ? 0x02 : 0,
    ...uint64Le(granule),
    ...uint32Le(1),
    ...uint32Le(sequence),
    ...uint32Le(0),
    segments.length,
    ...segments,
    ...payload
  ];
}

function oggLacing(length: number): number[] {
  const segments: number[] = [];
  let remaining = length;
  while (remaining >= 255) {
    segments.push(255);
    remaining -= 255;
  }
  segments.push(remaining);
  return segments;
}

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
