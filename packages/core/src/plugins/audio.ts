import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin } from "../types";

const audioExtensions = new Set([
  "mp3",
  "wav",
  "aif",
  "aiff",
  "aifc",
  "ogg",
  "oga",
  "aac",
  "m4a",
  "flac",
  "opus",
  "weba",
  "amr",
  "mid",
  "midi",
  "caf",
  "au",
  "snd",
  "wma"
]);

export function audioPlugin(): PreviewPlugin {
  return {
    name: "audio",
    match(file) {
      return file.mimeType.startsWith("audio/") || audioExtensions.has(file.extension);
    },
    async render(ctx) {
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-audio";
      const bytes = await readAudioBytes(ctx.file.blob);

      const title = document.createElement("div");
      title.className = "ofv-audio-title";
      title.textContent = ctx.file.name;

      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";

      const infoBar = createAudioInfo(parseAudioInfo(bytes, ctx.file.extension, ctx.file.mimeType));
      infoBar.hidden = true;
      infoBar.setAttribute("aria-hidden", "true");
      infoBar.style.display = "none";
      wrapper.append(title, audio, infoBar);
      ctx.viewport.classList.add("ofv-center");
      ctx.viewport.append(wrapper);

      const formatLabel = (ctx.file.extension || ctx.file.mimeType || "audio").toUpperCase();
      const showPlaybackFallback = () => {
        audio.pause();
        audio.remove();
        infoBar.hidden = false;
        infoBar.removeAttribute("aria-hidden");
        infoBar.style.removeProperty("display");

        if (wrapper.querySelector(".ofv-fallback")) {
          return;
        }

        const fallback = document.createElement("div");
        fallback.className = "ofv-fallback";

        const fallbackTitle = document.createElement("strong");
        fallbackTitle.textContent = `当前浏览器不支持直接播放该音频格式 (${formatLabel})`;

        const meta = document.createElement("span");
        meta.textContent = "建议转换为 MP3/AAC/OGG 等浏览器兼容格式，或直接下载在本地播放。";

        const download = document.createElement("a");
        download.href = url;
        download.download = ctx.file.name;
        download.textContent = "下载音频";

        fallback.append(fallbackTitle, meta, download);
        wrapper.append(fallback);
      };

      audio.addEventListener("error", showPlaybackFallback);

      return {
        destroy() {
          audio.removeEventListener("error", showPlaybackFallback);
          audio.pause();
          ctx.viewport.classList.remove("ofv-center");
          revokeObjectUrl(url, isExternal);
        }
      };
    }
  };
}

type AudioInfo = {
  format: string;
  codec?: string;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  bitrate?: string;
  duration?: string;
  tags?: string;
  note?: string;
};

async function readAudioBytes(blob?: Blob): Promise<Uint8Array> {
  if (!blob) {
    return new Uint8Array();
  }
  return new Uint8Array(await blob.arrayBuffer().catch(() => new ArrayBuffer(0)));
}

function createAudioInfo(info: AudioInfo): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "ofv-media-info";
  appendMediaInfo(bar, "格式", info.format);
  if (info.codec) {
    appendMediaInfo(bar, "编码", info.codec);
  }
  if (info.sampleRate) {
    appendMediaInfo(bar, "采样率", `${info.sampleRate} Hz`);
  }
  if (info.channels) {
    appendMediaInfo(bar, "声道", String(info.channels));
  }
  if (info.bitDepth) {
    appendMediaInfo(bar, "位深", `${info.bitDepth} bit`);
  }
  if (info.bitrate) {
    appendMediaInfo(bar, "码率", info.bitrate);
  }
  if (info.duration) {
    appendMediaInfo(bar, "时长", info.duration);
  }
  if (info.tags) {
    appendMediaInfo(bar, "标签", info.tags);
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

function parseAudioInfo(bytes: Uint8Array, extension: string, mimeType: string): AudioInfo {
  const fallback = (extension || mimeType || "audio").toUpperCase();
  if (bytes.length === 0) {
    return { format: fallback, note: "无法读取本地头信息" };
  }
  return parseWaveInfo(bytes) || parseFlacInfo(bytes) || parseOggInfo(bytes) || parseAiffInfo(bytes) || parseAuInfo(bytes) || parseMidiInfo(bytes) || parseAdtsAacInfo(bytes) || parseId3Mp3Info(bytes) || {
    format: fallback,
    note: "暂未识别音频头结构"
  };
}

function parseWaveInfo(bytes: Uint8Array): AudioInfo | null {
  if (bytes.length < 44 || asciiAt(bytes, 0, 4) !== "RIFF" || asciiAt(bytes, 8, 4) !== "WAVE") {
    return null;
  }
  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitDepth = 0;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const chunk = asciiAt(bytes, offset, 4);
    const size = readUint32Le(bytes, offset + 4);
    const dataOffset = offset + 8;
    if (chunk === "fmt " && dataOffset + 16 <= bytes.length) {
      channels = readUint16Le(bytes, dataOffset + 2);
      sampleRate = readUint32Le(bytes, dataOffset + 4);
      byteRate = readUint32Le(bytes, dataOffset + 8);
      bitDepth = readUint16Le(bytes, dataOffset + 14);
    }
    if (chunk === "data") {
      dataBytes = size;
    }
    offset += 8 + size + (size % 2);
  }
  return {
    format: "WAV",
    codec: "PCM",
    sampleRate,
    channels,
    bitDepth,
    bitrate: byteRate ? `${Math.round((byteRate * 8) / 1000)} kbps` : undefined,
    duration: byteRate && dataBytes ? formatDuration(dataBytes / byteRate) : undefined
  };
}

function parseFlacInfo(bytes: Uint8Array): AudioInfo | null {
  if (bytes.length < 42 || asciiAt(bytes, 0, 4) !== "fLaC") {
    return null;
  }
  let offset = 4;
  while (offset + 4 <= bytes.length) {
    const type = bytes[offset] & 0x7f;
    const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const dataOffset = offset + 4;
    if (type === 0 && dataOffset + 34 <= bytes.length) {
      const b10 = bytes[dataOffset + 10];
      const b11 = bytes[dataOffset + 11];
      const b12 = bytes[dataOffset + 12];
      const b13 = bytes[dataOffset + 13];
      const b14 = bytes[dataOffset + 14];
      const b15 = bytes[dataOffset + 15];
      const b16 = bytes[dataOffset + 16];
      const b17 = bytes[dataOffset + 17];
      const sampleRate = (b10 << 12) | (b11 << 4) | ((b12 & 0xf0) >> 4);
      const channels = ((b12 & 0x0e) >> 1) + 1;
      const bitDepth = (((b12 & 0x01) << 4) | ((b13 & 0xf0) >> 4)) + 1;
      const totalSamples = ((BigInt(b13 & 0x0f) << 32n) | (BigInt(b14) << 24n) | (BigInt(b15) << 16n) | (BigInt(b16) << 8n) | BigInt(b17));
      return {
        format: "FLAC",
        codec: "FLAC",
        sampleRate,
        channels,
        bitDepth,
        duration: sampleRate && totalSamples > 0n ? formatDuration(Number(totalSamples) / sampleRate) : undefined
      };
    }
    offset += 4 + length;
  }
  return { format: "FLAC", codec: "FLAC", note: "未找到 STREAMINFO metadata block" };
}

function parseId3Mp3Info(bytes: Uint8Array): AudioInfo | null {
  let offset = 0;
  let tags: string | undefined;
  if (bytes.length >= 10 && asciiAt(bytes, 0, 3) === "ID3") {
    tags = `ID3v2.${bytes[3]}.${bytes[4]}`;
    offset = 10 + readSynchsafe(bytes, 6);
  }
  for (let index = offset; index + 3 < Math.min(bytes.length, offset + 4096); index++) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) {
      const versionBits = (bytes[index + 1] >> 3) & 0x03;
      const layerBits = (bytes[index + 1] >> 1) & 0x03;
      const bitrateIndex = (bytes[index + 2] >> 4) & 0x0f;
      const sampleIndex = (bytes[index + 2] >> 2) & 0x03;
      const channelMode = (bytes[index + 3] >> 6) & 0x03;
      return {
        format: "MP3",
        codec: `${mpegVersion(versionBits)} Layer ${mpegLayer(layerBits)}`,
        sampleRate: mp3SampleRate(versionBits, sampleIndex),
        channels: channelMode === 3 ? 1 : 2,
        bitrate: mp3Bitrate(versionBits, layerBits, bitrateIndex),
        tags
      };
    }
  }
  return tags ? { format: "MP3", tags, note: "未在头部扫描到 MPEG frame" } : null;
}

function parseOggInfo(bytes: Uint8Array): AudioInfo | null {
  if (bytes.length < 36 || asciiAt(bytes, 0, 4) !== "OggS") {
    return null;
  }
  const pages = collectOggPages(bytes);
  const firstPacket = pages[0]?.packets[0];
  const lastGranule = [...pages].reverse().find((page) => page.granule > 0n)?.granule;
  if (firstPacket && asciiAt(firstPacket, 0, 8) === "OpusHead") {
    const preSkip = firstPacket.length >= 12 ? readUint16Le(firstPacket, 10) : 0;
    const sampleRate = firstPacket.length >= 16 ? readUint32Le(firstPacket, 12) : 48000;
    const totalSamples = lastGranule === undefined ? undefined : lastGranule - BigInt(preSkip);
    return {
      format: "Ogg",
      codec: "Opus",
      channels: firstPacket[9],
      sampleRate,
      duration: totalSamples !== undefined && totalSamples > 0n ? formatDuration(Number(totalSamples) / 48000) : undefined,
      note: `${pages.length} 页`
    };
  }
  if (firstPacket && firstPacket[0] === 0x01 && asciiAt(firstPacket, 1, 6) === "vorbis") {
    const sampleRate = firstPacket.length >= 16 ? readUint32Le(firstPacket, 12) : undefined;
    return {
      format: "Ogg",
      codec: "Vorbis",
      channels: firstPacket[11],
      sampleRate,
      bitrate: firstPacket.length >= 28 ? oggVorbisBitrate(firstPacket) : undefined,
      duration: sampleRate && lastGranule !== undefined && lastGranule > 0n ? formatDuration(Number(lastGranule) / sampleRate) : undefined,
      note: `${pages.length} 页`
    };
  }
  return { format: "Ogg", note: pages.length > 0 ? `未识别 Ogg codec header，${pages.length} 页` : "未识别 Ogg codec header" };
}

type OggPage = {
  granule: bigint;
  packets: Uint8Array[];
};

function collectOggPages(bytes: Uint8Array): OggPage[] {
  const pages: OggPage[] = [];
  let offset = 0;
  let continuedPacket: number[] = [];
  while (offset + 27 <= bytes.length && asciiAt(bytes, offset, 4) === "OggS") {
    const segmentCount = bytes[offset + 26];
    const segmentTableOffset = offset + 27;
    const dataOffset = segmentTableOffset + segmentCount;
    if (dataOffset > bytes.length) {
      break;
    }
    const sizes = Array.from(bytes.slice(segmentTableOffset, dataOffset));
    const payloadLength = sizes.reduce((sum, value) => sum + value, 0);
    const payloadEnd = dataOffset + payloadLength;
    if (payloadEnd > bytes.length) {
      break;
    }
    const pagePackets: Uint8Array[] = [];
    let packetOffset = dataOffset;
    for (const size of sizes) {
      continuedPacket.push(...bytes.slice(packetOffset, packetOffset + size));
      packetOffset += size;
      if (size < 255) {
        pagePackets.push(new Uint8Array(continuedPacket));
        continuedPacket = [];
      }
    }
    pages.push({
      granule: readUint64Le(bytes, offset + 6),
      packets: pagePackets
    });
    offset = payloadEnd;
  }
  return pages;
}

function oggVorbisBitrate(packet: Uint8Array): string | undefined {
  const nominal = readUint32Le(packet, 20);
  if (nominal > 0) {
    return `${Math.round(nominal / 1000)} kbps`;
  }
  const upper = readUint32Le(packet, 16);
  const lower = readUint32Le(packet, 24);
  if (upper > 0 && lower > 0) {
    return `${Math.round(((upper + lower) / 2) / 1000)} kbps`;
  }
  return undefined;
}

function parseAiffInfo(bytes: Uint8Array): AudioInfo | null {
  if (bytes.length < 12 || asciiAt(bytes, 0, 4) !== "FORM" || !["AIFF", "AIFC"].includes(asciiAt(bytes, 8, 4))) {
    return null;
  }
  const format = asciiAt(bytes, 8, 4);
  let offset = 12;
  while (offset + 26 <= bytes.length) {
    const chunk = asciiAt(bytes, offset, 4);
    const size = readUint32Be(bytes, offset + 4);
    if (chunk === "COMM") {
      return {
        format,
        channels: readUint16Be(bytes, offset + 8),
        bitDepth: readUint16Be(bytes, offset + 14),
        sampleRate: Math.round(readAiffExtended(bytes, offset + 16))
      };
    }
    offset += 8 + size + (size % 2);
  }
  return { format, note: "未找到 COMM chunk" };
}

function parseAuInfo(bytes: Uint8Array): AudioInfo | null {
  if (bytes.length < 24 || asciiAt(bytes, 0, 4) !== ".snd") {
    return null;
  }
  const dataOffset = readUint32Be(bytes, 4);
  const dataSize = readUint32Be(bytes, 8);
  const encoding = readUint32Be(bytes, 12);
  const sampleRate = readUint32Be(bytes, 16);
  const channels = readUint32Be(bytes, 20);
  const bitDepth = auBitDepth(encoding);
  const bytesPerSample = bitDepth ? bitDepth / 8 : 0;
  const resolvedDataSize = dataSize === 0xffffffff ? Math.max(0, bytes.length - dataOffset) : dataSize;
  return {
    format: "AU/SND",
    codec: auEncodingName(encoding),
    sampleRate,
    channels,
    bitDepth,
    duration: sampleRate && channels && bytesPerSample && resolvedDataSize ? formatDuration(resolvedDataSize / (sampleRate * channels * bytesPerSample)) : undefined,
    note: `data @ ${dataOffset} B`
  };
}

function auEncodingName(value: number): string {
  const names: Record<number, string> = {
    1: "8-bit μ-law",
    2: "8-bit linear PCM",
    3: "16-bit linear PCM",
    4: "24-bit linear PCM",
    5: "32-bit linear PCM",
    6: "32-bit float",
    7: "64-bit float",
    23: "G.721 ADPCM",
    24: "G.722 ADPCM",
    25: "G.723 3-bit ADPCM",
    26: "G.723 5-bit ADPCM",
    27: "8-bit A-law"
  };
  return names[value] || `encoding ${value}`;
}

function auBitDepth(value: number): number | undefined {
  const depths: Record<number, number> = {
    1: 8,
    2: 8,
    3: 16,
    4: 24,
    5: 32,
    6: 32,
    7: 64,
    27: 8
  };
  return depths[value];
}

function parseMidiInfo(bytes: Uint8Array): AudioInfo | null {
  if (bytes.length < 14 || asciiAt(bytes, 0, 4) !== "MThd") {
    return null;
  }
  return {
    format: "MIDI",
    codec: `SMF ${readUint16Be(bytes, 8)}`,
    channels: readUint16Be(bytes, 10),
    note: `${readUint16Be(bytes, 12)} ticks/quarter`
  };
}

function parseAdtsAacInfo(bytes: Uint8Array): AudioInfo | null {
  if (bytes.length < 7 || bytes[0] !== 0xff || (bytes[1] & 0xf0) !== 0xf0) {
    return null;
  }
  const profile = ((bytes[2] >> 6) & 0x03) + 1;
  const sampleIndex = (bytes[2] >> 2) & 0x0f;
  const channels = ((bytes[2] & 0x01) << 2) | ((bytes[3] >> 6) & 0x03);
  return {
    format: "AAC",
    codec: `AAC ADTS profile ${profile}`,
    sampleRate: aacSampleRate(sampleIndex),
    channels: channels || undefined,
    note: "ADTS stream"
  };
}

function aacSampleRate(index: number): number | undefined {
  return [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350][index];
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) {
    return "";
  }
  return new TextDecoder("ascii").decode(bytes.slice(offset, offset + length));
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint16(offset, true);
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint16(offset, false);
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint32(offset, true);
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return view(bytes).getUint32(offset, false);
}

function readUint64Le(bytes: Uint8Array, offset: number): bigint {
  return (BigInt(readUint32Le(bytes, offset + 4)) << 32n) | BigInt(readUint32Le(bytes, offset));
}

function readSynchsafe(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

function mpegVersion(bits: number): string {
  return bits === 3 ? "MPEG-1" : bits === 2 ? "MPEG-2" : bits === 0 ? "MPEG-2.5" : "MPEG";
}

function mpegLayer(bits: number): string {
  return bits === 3 ? "I" : bits === 2 ? "II" : bits === 1 ? "III" : "?";
}

function mp3SampleRate(versionBits: number, index: number): number | undefined {
  const rates = versionBits === 3 ? [44100, 48000, 32000] : versionBits === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
  return rates[index];
}

function mp3Bitrate(versionBits: number, layerBits: number, index: number): string | undefined {
  const mpeg1Layer3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Layer3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  if (index <= 0 || index >= 15 || layerBits !== 1) {
    return undefined;
  }
  return `${(versionBits === 3 ? mpeg1Layer3 : mpeg2Layer3)[index]} kbps`;
}

function readAiffExtended(bytes: Uint8Array, offset: number): number {
  const exponent = readUint16Be(bytes, offset) & 0x7fff;
  let mantissa = 0;
  for (let index = 0; index < 8; index++) {
    mantissa = mantissa * 256 + bytes[offset + 2 + index];
  }
  return mantissa * Math.pow(2, exponent - 16383 - 63);
}
