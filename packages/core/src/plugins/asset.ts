import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin } from "../types";
import { appendMeta, createPanel, createSection, readArrayBuffer, resolveFormat } from "./utils";

const assetExtensions = new Set([
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
  "psd",
  "psb",
  "ai",
  "eps",
  "ps",
  "webarchive",
  "sqlite",
  "sqlite3",
  "db",
  "wasm",
  "parquet",
  "avro"
]);

const assetMimeFormatMap: Record<string, string> = {
  "font/ttf": "ttf",
  "font/otf": "otf",
  "font/woff": "woff",
  "font/woff2": "woff2",
  "application/vnd.ms-fontobject": "eot",
  "image/vnd.adobe.photoshop": "psd",
  "application/postscript": "ps",
  "application/x-webarchive": "webarchive",
  "application/vnd.sqlite3": "sqlite",
  "application/x-sqlite3": "sqlite",
  "application/wasm": "wasm",
  "application/vnd.apache.parquet": "parquet",
  "application/avro": "avro"
};

const assetMimeTypes = new Set(Object.keys(assetMimeFormatMap));

export function assetPlugin(): PreviewPlugin {
  return {
    name: "asset",
    match(file) {
      return assetExtensions.has(file.extension) || assetMimeTypes.has(file.mimeType);
    },
    async render(ctx) {
      const panel = createPanel("ofv-asset");
      ctx.viewport.append(panel);
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      const extension = resolveFormat(ctx.file, assetMimeFormatMap).toLowerCase();
      const bytes = new Uint8Array(await readArrayBuffer(ctx.file).catch(() => new ArrayBuffer(0)));

      const section = createSection(assetTitle(extension));
      const summary = document.createElement("div");
      summary.className = "ofv-asset-summary";
      appendMeta(summary, "文件", ctx.file.name);
      appendMeta(summary, "格式", extension ? `.${extension}` : ctx.file.mimeType || "未知");
      appendMeta(summary, "大小", formatBytes(ctx.file.size ?? bytes.byteLength));
      appendMeta(summary, "签名", byteSignature(bytes));

      const note = document.createElement("p");
      note.textContent = assetGuidance(extension);

      const download = document.createElement("a");
      download.className = "ofv-asset-download";
      download.href = url;
      download.download = ctx.file.name;
      download.textContent = "下载文件";

      section.append(summary, note, download);
      const preview = createHexPreview(bytes);
      if (preview) {
        section.append(preview);
      }
      panel.append(section);

      return {
        destroy() {
          revokeObjectUrl(url, isExternal);
          panel.remove();
        }
      };
    }
  };
}

function assetTitle(extension: string): string {
  if (["ttf", "otf", "woff", "woff2", "eot"].includes(extension)) {
    return "字体文件预览";
  }
  if (["psd", "psb", "ai", "eps", "ps"].includes(extension)) {
    return "设计文件预览";
  }
  if (["sqlite", "sqlite3", "db", "parquet", "avro"].includes(extension)) {
    return "数据文件预览";
  }
  if (extension === "wasm") {
    return "WebAssembly 文件预览";
  }
  if (extension === "webarchive") {
    return "网页归档预览";
  }
  return "资产文件预览";
}

function assetGuidance(extension: string): string {
  if (["ttf", "otf", "woff", "woff2", "eot"].includes(extension)) {
    return "当前版本识别字体容器并展示文件指纹。后续可接入 FontFace 进行字形示例、命名字表和 OpenType 表信息预览。";
  }
  if (extension === "psd" || extension === "psb") {
    return "PSD/PSB 通常需要专用图层解析器。建议后续接入 psd.js/WASM 或服务端转换为 PNG/PDF 后预览。";
  }
  if (["ai", "eps", "ps"].includes(extension)) {
    return "PostScript/Illustrator 文件已识别。建议使用服务端 Ghostscript/Illustrator 转换为 SVG、PDF 或位图后预览。";
  }
  if (["sqlite", "sqlite3", "db"].includes(extension)) {
    return "SQLite 数据库已识别。建议后续接入 sqlite-wasm 读取 schema、表列表和抽样数据。";
  }
  if (extension === "parquet" || extension === "avro") {
    return "列式/序列化数据文件已识别。建议后续接入 Arrow/Parquet/Avro 解析器展示 schema 和抽样记录。";
  }
  if (extension === "wasm") {
    return "WASM 模块已识别。建议后续解析 section、imports、exports 和自定义 name 信息。";
  }
  if (extension === "webarchive") {
    return "WebArchive 已识别。该格式通常需要专用解析或服务端转换为 HTML 资源包。";
  }
  return "该资产文件已识别，当前提供文件指纹和下载入口，后续可接入专用解析器增强。";
}

function createHexPreview(bytes: Uint8Array): HTMLElement | null {
  if (bytes.length === 0) {
    return null;
  }
  const pre = document.createElement("pre");
  pre.className = "ofv-text-block ofv-asset-hex";
  pre.textContent = hexPreview(bytes);
  return pre;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function byteSignature(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "空文件";
  }
  const ascii = new TextDecoder("ascii").decode(bytes.slice(0, Math.min(bytes.length, 16))).replace(/[^\x20-\x7E]/g, ".");
  const hex = Array.from(bytes.slice(0, Math.min(bytes.length, 8)))
    .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
  return `${ascii} (${hex})`;
}

function hexPreview(bytes: Uint8Array): string {
  const rows: string[] = [];
  const limit = Math.min(bytes.length, 256);
  for (let offset = 0; offset < limit; offset += 16) {
    const slice = bytes.slice(offset, offset + 16);
    const hex = Array.from(slice)
      .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
      .join(" ")
      .padEnd(47, " ");
    const ascii = Array.from(slice)
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."))
      .join("");
    rows.push(`${offset.toString(16).padStart(8, "0").toUpperCase()}  ${hex}  ${ascii}`);
  }
  if (bytes.length > limit) {
    rows.push(`... 仅展示前 ${limit} 字节，共 ${bytes.length} 字节`);
  }
  return rows.join("\n");
}
