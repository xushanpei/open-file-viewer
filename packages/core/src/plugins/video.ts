import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewCommand, PreviewContext, PreviewPlugin } from "../types";

type MpegtsModule = {
  default?: MpegtsApi;
} & Partial<MpegtsApi>;

type MpegtsApi = {
  Events: { ERROR: string };
  isSupported(): boolean;
  createPlayer(options: { type: "flv" | "mpegts"; url: string }): {
    attachMediaElement(video: HTMLVideoElement): void;
    load(): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    unload(): void;
    destroy(): void;
  };
};

type MpegtsLoader = () => Promise<MpegtsModule>;

const mpegtsPackageName = "mpegts.js";

let loadMpegts: MpegtsLoader = () => importOptionalModule<MpegtsModule>(mpegtsPackageName);

const videoExtensions = new Set([
  "mp4",
  "mpg",
  "mpeg",
  "mpe",
  "mpv",
  "webm",
  "ogv",
  "mov",
  "m4v",
  "avi",
  "mkv",
  "flv",
  "wmv",
  "3gp",
  "3g2",
  "m2ts",
  "m3u8"
]);
const videoMimeTypes = new Set([
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
  "application/dash+xml"
]);
const hlsMimeTypes = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl", "application/mpegurl"]);

export function videoPlugin(): PreviewPlugin {
  return {
    name: "video",
    match(file) {
      return file.mimeType.startsWith("video/") || videoMimeTypes.has(file.mimeType) || videoExtensions.has(file.extension);
    },
    async render(ctx) {
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      const mimeType = ctx.file.mimeType.toLowerCase();
      const bytes = await readVideoBytes(ctx.file.blob);
      
      const container = document.createElement("div");
      container.className = "ofv-video-container";
      const stage = document.createElement("div");
      stage.className = "ofv-video-stage";

      const video = document.createElement("video");
      video.className = "ofv-media";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.style.objectFit = ctx.options.fit === "cover" ? "cover" : "contain";
      
      const ext = ctx.file.extension.toLowerCase();
      const infoBar = createVideoInfo(parseVideoInfo(bytes, ext, mimeType, ctx.file.name));
      infoBar.hidden = true;
      infoBar.setAttribute("aria-hidden", "true");
      infoBar.style.display = "none";
      stage.append(video);
      container.append(stage, infoBar);
      ctx.viewport.classList.add("ofv-center");
      ctx.viewport.append(container);

      let hlsInstance: any = null;
      let mpegtsPlayer: any = null;
      const isHls = ext === "m3u8" || hlsMimeTypes.has(mimeType);
      const isMpegTs = ext === "m2ts" || mimeType === "video/mp2t";
      const isDash = mimeType === "application/dash+xml";
      const isFlv = ext === "flv" || mimeType === "video/x-flv";
      const formatLabel = (ctx.file.extension || ctx.file.mimeType || "video").toUpperCase();
      const controller = createVideoTransformController(video, ctx);

      const showTranscodeFallback = () => {
        video.pause();
        video.remove();
        controller.setAvailable(false);
        ctx.toolbar?.refreshCommandSupport();
        infoBar.hidden = false;
        infoBar.removeAttribute("aria-hidden");
        infoBar.style.removeProperty("display");
        
        // Remove any existing fallback UI first
        const oldFallback = stage.querySelector(".ofv-fallback");
        if (oldFallback) {
          oldFallback.remove();
        }

        const fallback = document.createElement("div");
        fallback.className = "ofv-fallback";
        
        const title = document.createElement("strong");
        title.textContent = `当前浏览器不支持直接播放该视频格式 (${formatLabel})`;
        
        const meta = document.createElement("span");
        meta.textContent = "建议转换为 MP4 格式播放，或直接下载在本地播放。";
        
        const download = document.createElement("a");
        download.href = url;
        download.download = ctx.file.name;
        download.textContent = "下载视频";
        
        fallback.append(title, meta, download);
        stage.append(fallback);
      };

      const onVideoError = () => {
        showTranscodeFallback();
      };

      video.addEventListener("error", onVideoError);
      ctx.toolbar?.refreshCommandSupport();

      try {
        if (isDash) {
          showTranscodeFallback();
        } else if (isHls) {
          const Hls = (await import("hls.js")).default;
          if (Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.ERROR, (_event: any, data: any) => {
              if (data.fatal) {
                showTranscodeFallback();
              }
            });
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
          } else {
            showTranscodeFallback();
          }
        } else if (isFlv || isMpegTs) {
          const mpegtsModule = await loadMpegts();
          const mpegts = resolveMpegtsApi(mpegtsModule);
          if (mpegts.isSupported()) {
            mpegtsPlayer = mpegts.createPlayer({
              type: isFlv ? "flv" : "mpegts",
              url: url
            });
            mpegtsPlayer.attachMediaElement(video);
            mpegtsPlayer.load();
            mpegtsPlayer.on(mpegts.Events.ERROR, () => {
              showTranscodeFallback();
            });
          } else {
            showTranscodeFallback();
          }
        } else {
          // Native playback for mp4, webm, mov, ogg, etc.
          video.src = url;
        }
      } catch (err) {
        showTranscodeFallback();
      }

      return {
        canCommand(command) {
          return controller.canCommand(command);
        },
        command(command) {
          return controller.command(command);
        },
        resize() {
          video.style.width = "100%";
          video.style.height = "100%";
        },
        destroy() {
          video.removeEventListener("error", onVideoError);
          if (video.isConnected) {
            video.pause();
          }
          controller.destroy();
          
          if (hlsInstance) {
            hlsInstance.destroy();
          }
          if (mpegtsPlayer) {
            mpegtsPlayer.unload();
            mpegtsPlayer.destroy();
          }

          ctx.viewport.classList.remove("ofv-center");
          revokeObjectUrl(url, isExternal);
          container.remove();
        }
      };
    }
  };
}

export function __setMpegtsLoaderForTests(loader: MpegtsLoader | null): void {
  loadMpegts = loader || (() => importOptionalModule<MpegtsModule>(mpegtsPackageName));
}

function importOptionalModule<T>(packageName: string): Promise<T> {
  return new Function("packageName", "return import(packageName)")(packageName) as Promise<T>;
}

function resolveMpegtsApi(module: MpegtsModule): MpegtsApi {
  const api = module.default || module;
  if (!api.Events || !api.isSupported || !api.createPlayer) {
    throw new Error("mpegts.js is not available.");
  }
  return api as MpegtsApi;
}

function createVideoTransformController(video: HTMLVideoElement, ctx: Pick<PreviewContext, "toolbar">) {
  let scale = 1;
  let rotation = 0;
  let available = true;
  const apply = () => {
    video.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
    video.style.transformOrigin = "center";
    ctx.toolbar?.setZoom(available ? scale : undefined);
  };
  apply();

  const canTransform = (command: PreviewCommand) =>
    available &&
    (command === "zoom-in" ||
      command === "zoom-out" ||
      command === "zoom-reset" ||
      command === "rotate-right" ||
      command === "rotate-left");

  return {
    setAvailable(nextAvailable: boolean) {
      available = nextAvailable;
      if (available) {
        apply();
      } else {
        ctx.toolbar?.setZoom(undefined);
      }
    },
    canCommand(command: PreviewCommand) {
      return canTransform(command);
    },
    command(command: PreviewCommand) {
      if (!canTransform(command)) {
        return false;
      }
      if (command === "zoom-in") {
        scale = Math.min(4, Number((scale + 0.25).toFixed(2)));
        apply();
        return true;
      }
      if (command === "zoom-out") {
        scale = Math.max(0.25, Number((scale - 0.25).toFixed(2)));
        apply();
        return true;
      }
      if (command === "zoom-reset") {
        scale = 1;
        rotation = 0;
        apply();
        return true;
      }
      if (command === "rotate-right") {
        rotation += 90;
        apply();
        return true;
      }
      if (command === "rotate-left") {
        rotation -= 90;
        apply();
        return true;
      }
      return false;
    },
    destroy() {
      ctx.toolbar?.setZoom(undefined);
    }
  };
}

type VideoInfo = {
  format: string;
  codec?: string;
  width?: number;
  height?: number;
  duration?: string;
  bitrate?: string;
  tracks?: number;
  variants?: number;
  segments?: number;
  note?: string;
};

async function readVideoBytes(blob?: Blob): Promise<Uint8Array> {
  if (!blob) {
    return new Uint8Array();
  }
  return new Uint8Array(await blob.arrayBuffer().catch(() => new ArrayBuffer(0)));
}

function createVideoInfo(info: VideoInfo): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "ofv-media-info";
  appendMediaInfo(bar, "格式", info.format);
  if (info.codec) {
    appendMediaInfo(bar, "编码", info.codec);
  }
  if (info.width && info.height) {
    appendMediaInfo(bar, "尺寸", `${info.width} x ${info.height}px`);
  }
  if (info.duration) {
    appendMediaInfo(bar, "时长", info.duration);
  }
  if (info.bitrate) {
    appendMediaInfo(bar, "码率", info.bitrate);
  }
  if (info.tracks !== undefined) {
    appendMediaInfo(bar, "轨道", String(info.tracks));
  }
  if (info.variants !== undefined) {
    appendMediaInfo(bar, "变体", String(info.variants));
  }
  if (info.segments !== undefined) {
    appendMediaInfo(bar, "片段", String(info.segments));
  }
  if (info.note) {
    appendMediaInfo(bar, "说明", info.note);
  }
  return bar;
}

function appendMediaInfo(parent: HTMLElement, label: string, value: string): void {
  const item = document.createElement("span");
  item.className = "ofv-media-info-item";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  item.append(key, content);
  parent.append(item);
}

function parseVideoInfo(bytes: Uint8Array, extension: string, mimeType: string, fileName: string): VideoInfo {
  const fallback = (extension || mimeType || fileName.split(".").pop() || "video").toUpperCase();
  if (bytes.length === 0) {
    return { format: fallback, note: "无法读取本地头信息" };
  }
  return parseHlsInfo(bytes) || parseDashInfo(bytes) || parseMp4Info(bytes) || parseAviInfo(bytes) || parseEbmlInfo(bytes) || {
    format: fallback,
    note: "暂未识别视频头结构"
  };
}

function parseMp4Info(bytes: Uint8Array): VideoInfo | null {
  if (bytes.length < 12 || asciiAt(bytes, 4, 4) !== "ftyp") {
    return null;
  }
  const majorBrand = asciiAt(bytes, 8, 4);
  const info: VideoInfo = { format: ["qt  "].includes(majorBrand) ? "MOV" : "MP4", codec: majorBrand };
  const atoms = collectMp4Atoms(bytes, 0, bytes.length);
  const moov = atoms.find((atom) => atom.type === "moov");
  if (moov) {
    const children = collectMp4Atoms(bytes, moov.start + moov.headerSize, moov.end);
    const mvhd = children.find((atom) => atom.type === "mvhd");
    if (mvhd) {
      const duration = readMp4MvhdDuration(bytes, mvhd.start + mvhd.headerSize);
      if (duration !== undefined) {
        info.duration = formatDuration(duration);
      }
    }
    const tracks = children.filter((atom) => atom.type === "trak");
    info.tracks = tracks.length;
    for (const track of tracks) {
      const tkhd = collectMp4Atoms(bytes, track.start + track.headerSize, track.end).find((atom) => atom.type === "tkhd");
      if (tkhd) {
        const size = readMp4TkhdSize(bytes, tkhd.start + tkhd.headerSize);
        if (size.width && size.height) {
          info.width = size.width;
          info.height = size.height;
          break;
        }
      }
    }
  }
  return info;
}

type Mp4Atom = {
  type: string;
  start: number;
  end: number;
  headerSize: number;
};

function collectMp4Atoms(bytes: Uint8Array, start: number, end: number): Mp4Atom[] {
  const atoms: Mp4Atom[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = readUint32Be(bytes, offset);
    const type = asciiAt(bytes, offset + 4, 4);
    let headerSize = 8;
    if (size === 1 && offset + 16 <= end) {
      size = Number(readUint64Be(bytes, offset + 8));
      headerSize = 16;
    }
    if (size < headerSize || offset + size > end || !/^[\w ]{4}$/.test(type)) {
      break;
    }
    atoms.push({ type, start: offset, end: offset + size, headerSize });
    offset += size;
  }
  return atoms;
}

function readMp4MvhdDuration(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 20 > bytes.length) {
    return undefined;
  }
  const version = bytes[offset];
  if (version === 1 && offset + 32 <= bytes.length) {
    const timescale = readUint32Be(bytes, offset + 20);
    const duration = readUint64Be(bytes, offset + 24);
    return timescale ? Number(duration) / timescale : undefined;
  }
  const timescale = readUint32Be(bytes, offset + 12);
  const duration = readUint32Be(bytes, offset + 16);
  return timescale ? duration / timescale : undefined;
}

function readMp4TkhdSize(bytes: Uint8Array, offset: number): { width?: number; height?: number } {
  const version = bytes[offset];
  const sizeOffset = version === 1 ? offset + 84 : offset + 72;
  if (sizeOffset + 8 > bytes.length) {
    return {};
  }
  return {
    width: readUint32Be(bytes, sizeOffset) / 65536,
    height: readUint32Be(bytes, sizeOffset + 4) / 65536
  };
}

function parseAviInfo(bytes: Uint8Array): VideoInfo | null {
  if (bytes.length < 64 || asciiAt(bytes, 0, 4) !== "RIFF" || asciiAt(bytes, 8, 4) !== "AVI ") {
    return null;
  }
  const avihOffset = findAscii(bytes, "avih", 12);
  if (avihOffset < 0 || avihOffset + 56 > bytes.length) {
    return { format: "AVI", note: "未找到 avih header" };
  }
  const microSecPerFrame = readUint32Le(bytes, avihOffset + 8);
  const maxBytesPerSec = readUint32Le(bytes, avihOffset + 16);
  const totalFrames = readUint32Le(bytes, avihOffset + 24);
  const streams = readUint32Le(bytes, avihOffset + 32);
  const width = readUint32Le(bytes, avihOffset + 40);
  const height = readUint32Le(bytes, avihOffset + 44);
  return {
    format: "AVI",
    width,
    height,
    tracks: streams,
    bitrate: maxBytesPerSec ? `${Math.round((maxBytesPerSec * 8) / 1000)} kbps` : undefined,
    duration: microSecPerFrame && totalFrames ? formatDuration((microSecPerFrame * totalFrames) / 1_000_000) : undefined
  };
}

function parseEbmlInfo(bytes: Uint8Array): VideoInfo | null {
  if (bytes.length < 8 || bytes[0] !== 0x1a || bytes[1] !== 0x45 || bytes[2] !== 0xdf || bytes[3] !== 0xa3) {
    return null;
  }
  const root = collectEbmlElements(bytes, 0, bytes.length);
  const header = root.find((element) => element.id === 0x1a45dfa3);
  const headerChildren = header ? collectEbmlElements(bytes, header.dataStart, header.dataEnd) : [];
  const docTypeValue = readEbmlString(bytes, headerChildren.find((element) => element.id === 0x4282));
  const segment = root.find((element) => element.id === 0x18538067);
  const segmentChildren = segment ? collectEbmlElements(bytes, segment.dataStart, segment.dataEnd) : [];
  const info = parseEbmlSegmentInfo(bytes, segmentChildren.find((element) => element.id === 0x1549a966));
  const tracks = parseEbmlTracks(bytes, segmentChildren.find((element) => element.id === 0x1654ae6b));
  const docType = docTypeValue?.toLowerCase().includes("webm")
    ? "WebM"
    : docTypeValue?.toLowerCase().includes("matroska")
      ? "Matroska"
      : "EBML";
  return {
    format: docType,
    codec: tracks.codecs.length > 0 ? tracks.codecs.slice(0, 4).join(", ") : undefined,
    width: tracks.width,
    height: tracks.height,
    duration: info.duration === undefined ? undefined : formatDuration(info.duration),
    tracks: tracks.count || undefined,
    note: docTypeValue ? `EBML DocType ${docTypeValue}` : "已识别 EBML 容器"
  };
}

type EbmlElement = {
  id: number;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
};

function collectEbmlElements(bytes: Uint8Array, start: number, end: number, limit = 256): EbmlElement[] {
  const elements: EbmlElement[] = [];
  let offset = start;
  while (offset < end && elements.length < limit) {
    const id = readEbmlId(bytes, offset, end);
    if (!id) {
      break;
    }
    const size = readEbmlSize(bytes, id.offset, end);
    if (!size) {
      break;
    }
    const dataStart = size.offset;
    const dataEnd = size.unknown ? end : dataStart + size.value;
    if (dataEnd < dataStart || dataEnd > end) {
      break;
    }
    elements.push({
      id: id.value,
      start: offset,
      dataStart,
      dataEnd,
      end: dataEnd
    });
    offset = dataEnd;
  }
  return elements;
}

function readEbmlId(bytes: Uint8Array, offset: number, end: number): { value: number; offset: number } | undefined {
  const length = ebmlVintLength(bytes[offset]);
  if (!length || length > 4 || offset + length > end) {
    return undefined;
  }
  let value = 0;
  for (let index = 0; index < length; index++) {
    value = value * 256 + bytes[offset + index];
  }
  return { value, offset: offset + length };
}

function readEbmlSize(bytes: Uint8Array, offset: number, end: number): { value: number; offset: number; unknown: boolean } | undefined {
  const length = ebmlVintLength(bytes[offset]);
  if (!length || length > 8 || offset + length > end) {
    return undefined;
  }
  const firstMask = 0xff >> length;
  let value = bytes[offset] & firstMask;
  let max = firstMask;
  for (let index = 1; index < length; index++) {
    value = value * 256 + bytes[offset + index];
    max = max * 256 + 0xff;
  }
  return { value, offset: offset + length, unknown: value === max };
}

function ebmlVintLength(firstByte: number | undefined): number {
  if (!firstByte) {
    return 0;
  }
  for (let length = 1; length <= 8; length++) {
    if (firstByte & (0x80 >> (length - 1))) {
      return length;
    }
  }
  return 0;
}

function parseEbmlSegmentInfo(bytes: Uint8Array, element?: EbmlElement): { duration?: number } {
  if (!element) {
    return {};
  }
  const children = collectEbmlElements(bytes, element.dataStart, element.dataEnd);
  const timecodeScale = readEbmlUInt(bytes, children.find((child) => child.id === 0x2ad7b1)) || 1_000_000;
  const duration = readEbmlFloat(bytes, children.find((child) => child.id === 0x4489));
  return {
    duration: duration === undefined ? undefined : (duration * timecodeScale) / 1_000_000_000
  };
}

function parseEbmlTracks(bytes: Uint8Array, element?: EbmlElement): { count: number; codecs: string[]; width?: number; height?: number } {
  if (!element) {
    return { count: 0, codecs: [] };
  }
  const trackEntries = collectEbmlElements(bytes, element.dataStart, element.dataEnd).filter((child) => child.id === 0xae);
  const codecs: string[] = [];
  let width: number | undefined;
  let height: number | undefined;
  for (const track of trackEntries) {
    const children = collectEbmlElements(bytes, track.dataStart, track.dataEnd);
    const codec = readEbmlString(bytes, children.find((child) => child.id === 0x86));
    if (codec && !codecs.includes(codec)) {
      codecs.push(codec);
    }
    const type = readEbmlUInt(bytes, children.find((child) => child.id === 0x83));
    const video = children.find((child) => child.id === 0xe0);
    if (type === 1 && video) {
      const videoChildren = collectEbmlElements(bytes, video.dataStart, video.dataEnd);
      width = readEbmlUInt(bytes, videoChildren.find((child) => child.id === 0xb0)) || width;
      height = readEbmlUInt(bytes, videoChildren.find((child) => child.id === 0xba)) || height;
    }
  }
  return { count: trackEntries.length, codecs, width, height };
}

function readEbmlString(bytes: Uint8Array, element?: EbmlElement): string | undefined {
  if (!element || element.dataEnd <= element.dataStart || element.dataEnd - element.dataStart > 4096) {
    return undefined;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(element.dataStart, element.dataEnd)).replace(/\0+$/g, "").trim();
}

function readEbmlUInt(bytes: Uint8Array, element?: EbmlElement): number | undefined {
  if (!element || element.dataEnd <= element.dataStart || element.dataEnd - element.dataStart > 6) {
    return undefined;
  }
  let value = 0;
  for (let offset = element.dataStart; offset < element.dataEnd; offset++) {
    value = value * 256 + bytes[offset];
  }
  return value;
}

function readEbmlFloat(bytes: Uint8Array, element?: EbmlElement): number | undefined {
  if (!element) {
    return undefined;
  }
  const data = view(bytes);
  if (element.dataEnd - element.dataStart === 4) {
    return data.getFloat32(element.dataStart, false);
  }
  if (element.dataEnd - element.dataStart === 8) {
    return data.getFloat64(element.dataStart, false);
  }
  return undefined;
}

function parseHlsInfo(bytes: Uint8Array): VideoInfo | null {
  const text = decodeTextHead(bytes);
  if (!text.startsWith("#EXTM3U")) {
    return null;
  }
  const segments = countMatches(text, /^#EXTINF:/gm);
  const variants = countMatches(text, /^#EXT-X-STREAM-INF:/gm);
  const durations = [...text.matchAll(/^#EXTINF:([0-9.]+)/gm)].map((match) => Number(match[1])).filter(Number.isFinite);
  const bandwidth = text.match(/BANDWIDTH=(\d+)/i)?.[1];
  return {
    format: "HLS",
    variants,
    segments,
    duration: durations.length > 0 ? formatDuration(durations.reduce((sum, value) => sum + value, 0)) : undefined,
    bitrate: bandwidth ? `${Math.round(Number(bandwidth) / 1000)} kbps` : undefined
  };
}

function parseDashInfo(bytes: Uint8Array): VideoInfo | null {
  const text = decodeTextHead(bytes);
  if (!/<MPD[\s>]/i.test(text)) {
    return null;
  }
  return {
    format: "DASH",
    duration: isoDurationToClock(text.match(/mediaPresentationDuration=["']([^"']+)["']/i)?.[1]),
    variants: countMatches(text, /<Representation\b/gi),
    segments: countMatches(text, /<SegmentURL\b|<S\b/gi)
  };
}

function decodeTextHead(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 65536))).trim();
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function isoDurationToClock(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) {
    return value;
  }
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  return formatDuration(seconds);
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) {
    return "";
  }
  return new TextDecoder("latin1").decode(bytes.slice(offset, offset + length));
}

function findAscii(bytes: Uint8Array, value: string, start = 0): number {
  const encoded = new TextEncoder().encode(value);
  for (let offset = start; offset + encoded.length <= bytes.length; offset++) {
    if (encoded.every((byte, index) => bytes[offset + index] === byte)) {
      return offset;
    }
  }
  return -1;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint32(offset, true);
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint32(offset, false);
}

function readUint64Be(bytes: Uint8Array, offset: number): bigint {
  return (BigInt(readUint32Be(bytes, offset)) << 32n) | BigInt(readUint32Be(bytes, offset + 4));
}
