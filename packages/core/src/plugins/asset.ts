import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { Psd } from "ag-psd";
import type { PreviewCommand, PreviewInstance, PreviewPlugin, PreviewSize } from "../types";
import { renderPdfDocumentPreview } from "./pdf";
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

      if (isPhotoshopAsset(extension)) {
        const photoshopPreview = await createPhotoshopPreview(bytes, ctx.toolbar);
        panel.append(photoshopPreview.element);
        ctx.toolbar?.refreshCommandSupport();
        return {
          canCommand(command) {
            return photoshopPreview.instance?.canCommand?.(command) ?? false;
          },
          command(command) {
            return photoshopPreview.instance?.command?.(command) ?? false;
          },
          resize(size) {
            photoshopPreview.instance?.resize?.(size);
          },
          destroy() {
            photoshopPreview.instance?.destroy();
            revokeObjectUrl(url, isExternal);
            panel.remove();
          }
        };
      }

      if (extension === "ai" || extension === "eps" || extension === "ps") {
        const postScriptPreview = await createPostScriptPreview(bytes, url, ctx.file.name, ctx.size, ctx.options.fit, ctx.toolbar);
        panel.append(postScriptPreview.element);
        if (postScriptPreview.primaryRendered) {
          hideSuccessfulAssetDiagnostics(panel);
          ctx.toolbar?.refreshCommandSupport();
          return {
            canCommand(command) {
              return postScriptPreview.instance?.canCommand?.(command) ?? false;
            },
            command(command) {
              return postScriptPreview.instance?.command?.(command) ?? false;
            },
            resize(size) {
              postScriptPreview.instance?.resize?.(size);
            },
            destroy() {
              postScriptPreview.instance?.destroy();
              revokeObjectUrl(url, isExternal);
              panel.remove();
            }
          };
        }

        return {
          canCommand(command) {
            return postScriptPreview.instance?.canCommand?.(command) ?? false;
          },
          command(command) {
            return postScriptPreview.instance?.command?.(command) ?? false;
          },
          resize(size) {
            postScriptPreview.instance?.resize?.(size);
          },
          destroy() {
            postScriptPreview.instance?.destroy();
            revokeObjectUrl(url, isExternal);
            panel.remove();
          }
        };
      }

      const section = createSection(assetTitle(extension));
      const summary = document.createElement("div");
      summary.className = "ofv-asset-summary";
      appendMeta(summary, "文件", ctx.file.name);
      appendMeta(summary, "格式", extension ? `.${extension}` : ctx.file.mimeType || "未知");
      appendMeta(summary, "大小", formatBytes(ctx.file.size ?? bytes.byteLength));
      appendMeta(summary, "签名", byteSignature(bytes));
      hideSupplementalInfo(summary);

      const note = document.createElement("p");
      note.textContent = assetGuidance(extension);
      hideSupplementalInfo(note);

      const download = document.createElement("a");
      download.className = "ofv-asset-download";
      download.href = url;
      download.download = ctx.file.name;
      download.textContent = "下载文件";
      download.hidden = true;
      download.setAttribute("aria-hidden", "true");
      download.style.display = "none";

      section.append(summary, note, download);
      const childInstances: PreviewInstance[] = [];
      let hasPrimaryPreview = false;
      if (isFontAsset(extension)) {
        hideSuccessfulSectionHeading(section);
        section.append(await createFontPreview(extension, url, ctx.file.name, bytes));
        hasPrimaryPreview = true;
      }
      if (extension === "wasm") {
        section.append(createWasmPreview(bytes));
        hasPrimaryPreview = true;
      }
      if (extension === "sqlite" || extension === "sqlite3" || extension === "db") {
        section.append(createSqlitePreview(bytes));
        hasPrimaryPreview = true;
      }
      if (extension === "parquet") {
        section.append(createParquetPreview(bytes));
        hasPrimaryPreview = true;
      }
      if (extension === "avro") {
        section.append(createAvroPreview(bytes));
        hasPrimaryPreview = true;
      }
      if (extension === "webarchive") {
        section.append(createWebArchivePreview(bytes));
        hasPrimaryPreview = true;
      }
      if (hasPrimaryPreview) {
        hideSuccessfulSectionHeading(section);
      }
      const preview = shouldShowHexPreview(extension, hasPrimaryPreview) ? createHexPreview(bytes) : null;
      if (preview) {
        section.append(preview);
      }
      panel.append(section);

      return {
        canCommand(command) {
          return childInstances.some((instance) => instance.canCommand?.(command));
        },
        command(command) {
          for (const instance of childInstances) {
            if (instance.canCommand?.(command)) {
              return instance.command?.(command) ?? false;
            }
          }
          return false;
        },
        resize(size) {
          childInstances.forEach((instance) => instance.resize?.(size));
        },
        destroy() {
          childInstances.forEach((instance) => instance.destroy());
          revokeObjectUrl(url, isExternal);
          panel.remove();
        }
      };
    }
  };
}

function assetTitle(extension: string): string {
  if (isFontAsset(extension)) {
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
  if (isFontAsset(extension)) {
    return "字体文件已识别，当前会使用 FontFace 展示字形样张，并解析 sfnt/WOFF 表目录和 name 元信息。";
  }
  if (extension === "psd" || extension === "psb") {
    return "PSD/PSB 已识别，当前会优先解析 Photoshop 合成图预览，并保留画布、通道、位深和颜色模式等结构信息。";
  }
  if (["ai", "eps", "ps"].includes(extension)) {
    return "PostScript/Illustrator 文件已识别；PDF-compatible AI 会直接使用浏览器 PDF 预览，EPS/PS 会解析文档头、BoundingBox 和常见 DSC 元信息。";
  }
  if (["sqlite", "sqlite3", "db"].includes(extension)) {
    return "SQLite 数据库已识别，当前会解析数据库头、sqlite_schema 摘要，并对常见 table leaf page 做前端抽样预览；复杂查询可接入 sqlite-wasm 增强。";
  }
  if (extension === "parquet" || extension === "avro") {
    return "列式/序列化数据文件已识别，当前会解析容器头、元信息和 schema 摘要；抽样记录可后续接入专用解析器增强。";
  }
  if (extension === "wasm") {
    return "WASM 模块已识别，当前会解析版本、section 分布、imports、exports 和自定义 section 摘要。";
  }
  if (extension === "webarchive") {
    return "WebArchive 已识别，当前会解析 XML plist 主资源、MIME、编码和子资源数量；完整网页还原可后续接入资源包转换。";
  }
  return "该资产文件已识别，当前提供文件指纹和下载入口，后续可接入专用解析器增强。";
}

function isFontAsset(extension: string): boolean {
  return ["ttf", "otf", "woff", "woff2", "eot"].includes(extension);
}

function isPhotoshopAsset(extension: string): boolean {
  return extension === "psd" || extension === "psb";
}

async function createFontPreview(extension: string, url: string, fileName: string, bytes: Uint8Array): Promise<HTMLElement> {
  const preview = document.createElement("div");
  preview.className = "ofv-font-preview";

  const heading = document.createElement("strong");
  heading.textContent = "字体样张";

  const sample = document.createElement("div");
  sample.className = "ofv-font-sample";
  sample.textContent = "Open File Viewer 预览 1234567890";

  const pangram = document.createElement("div");
  pangram.className = "ofv-font-pangram";
  pangram.textContent = "The quick brown fox jumps over the lazy dog.";

  const meta = document.createElement("span");
  meta.className = "ofv-font-status";

  preview.append(heading, sample, pangram, meta);

  if (!("FontFace" in window) || !document.fonts) {
    meta.textContent = "当前浏览器不支持 FontFace API，无法生成实时字形样张。";
    preview.append(createFontInfoPreview(bytes, extension));
    return preview;
  }

  const family = `ofv-${fileName.replace(/[^a-z0-9_-]/gi, "-")}-${Date.now()}`;
  const format = fontFaceFormat(extension);
  const source = format ? `url("${url}") format("${format}")` : `url("${url}")`;
  let sampleRendered = false;

  try {
    const fontFace = new FontFace(family, source);
    const loaded = await fontFace.load();
    document.fonts.add(loaded);
    sample.style.fontFamily = `"${family}", sans-serif`;
    pangram.style.fontFamily = `"${family}", sans-serif`;
    meta.textContent = "已使用浏览器 FontFace API 加载字体样张。";
    hideSupplementalInfo(meta);
    sampleRendered = true;
  } catch (error) {
    meta.textContent = `字体样张加载失败：${error instanceof Error ? error.message : "当前字体编码暂不受浏览器支持。"}`;
  }

  const info = createFontInfoPreview(bytes, extension);
  const hasVisibleFontDiagnostic = Boolean(info.querySelector(".ofv-data-error"));
  if (sampleRendered || !hasVisibleFontDiagnostic) {
    hideSupplementalInfo(info);
  }
  preview.append(info);
  return preview;
}

function fontFaceFormat(extension: string): string {
  const map: Record<string, string> = {
    ttf: "truetype",
    otf: "opentype",
    woff: "woff",
    woff2: "woff2",
    eot: "embedded-opentype"
  };
  return map[extension] || "";
}

type FontTableEntry = {
  tag: string;
  checksum?: number;
  offset: number;
  length: number;
  compressedLength?: number;
};

type FontNameRecord = {
  id: number;
  label: string;
  value: string;
};

type FontContainerMeta = {
  label: string;
  value: string | number;
};

type FontInfo = {
  valid: boolean;
  error?: string;
  container?: string;
  flavor?: string;
  tables: FontTableEntry[];
  names: FontNameRecord[];
  totalSfntSize?: number;
  meta?: FontContainerMeta[];
};

function createFontInfoPreview(bytes: Uint8Array, extension: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-font-info";

  const heading = document.createElement("strong");
  heading.textContent = "字体结构";
  wrapper.append(heading);

  const parsed = parseFontInfo(bytes, extension);
  if (!parsed.valid) {
    const error = document.createElement("p");
    error.className = "ofv-data-error";
    error.textContent = parsed.error || "无法解析字体结构。";
    wrapper.append(error);
    return wrapper;
  }

  const summary = document.createElement("div");
  summary.className = "ofv-data-summary";
  appendMeta(summary, "容器", parsed.container || "sfnt");
  appendMeta(summary, "Flavor", parsed.flavor || "未知");
  appendMeta(summary, "表数量", parsed.tables.length);
  if (parsed.totalSfntSize !== undefined) {
    appendMeta(summary, "展开大小", formatBytes(parsed.totalSfntSize));
  }
  for (const item of parsed.meta || []) {
    appendMeta(summary, item.label, item.value);
  }
  wrapper.append(summary);

  if (parsed.error) {
    const note = document.createElement("p");
    note.className = "ofv-data-note";
    note.textContent = parsed.error;
    wrapper.append(note);
  }

  if (parsed.names.length > 0) {
    wrapper.append(createKeyValueTable("Name", parsed.names.map((item) => ({ key: item.label, value: item.value }))));
  }

  if (parsed.tables.length > 0) {
    wrapper.append(createFontTablePreview(parsed.tables));
  }
  return wrapper;
}

function createFontTablePreview(tables: FontTableEntry[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-font-tables";
  const title = document.createElement("strong");
  title.textContent = "Tables";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Tag", "Offset", "Length", "Compressed", "Checksum"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  for (const entry of tables.slice(0, 80)) {
    const row = document.createElement("tr");
    for (const value of [
      entry.tag,
      `0x${entry.offset.toString(16).toUpperCase()}`,
      formatBytes(entry.length),
      entry.compressedLength === undefined ? "-" : formatBytes(entry.compressedLength),
      entry.checksum === undefined ? "-" : `0x${entry.checksum.toString(16).padStart(8, "0").toUpperCase()}`
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  }
  table.append(thead, tbody);
  wrapper.append(title, table);
  return wrapper;
}

function parseFontInfo(bytes: Uint8Array, extension: string): FontInfo {
  if (bytes.length < 4) {
    return { valid: false, error: "文件太短，无法读取字体头。", tables: [], names: [] };
  }
  const signature = asciiAt(bytes, 0, 4);
  if (signature === "wOFF") {
    return parseWoffFont(bytes);
  }
  if (signature === "wOF2") {
    return parseWoff2Font(bytes);
  }
  if (extension === "eot") {
    return parseEotFont(bytes);
  }
  return parseSfntFont(bytes, 0, "sfnt");
}

function parseSfntFont(bytes: Uint8Array, offset: number, container: string): FontInfo {
  if (offset + 12 > bytes.length) {
    return { valid: false, error: "文件太短，无法读取 sfnt offset table。", tables: [], names: [] };
  }
  const flavor = fontFlavor(bytes, offset);
  if (!flavor) {
    return { valid: false, error: "缺少有效的 TrueType/OpenType sfnt 头。", tables: [], names: [] };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tableCount = view.getUint16(offset + 4, false);
  const directoryEnd = offset + 12 + tableCount * 16;
  if (tableCount <= 0 || directoryEnd > bytes.length) {
    return { valid: false, error: "sfnt 表目录超出文件边界。", tables: [], names: [] };
  }
  const tables: FontTableEntry[] = [];
  for (let index = 0; index < tableCount; index++) {
    const entryOffset = offset + 12 + index * 16;
    tables.push({
      tag: asciiAt(bytes, entryOffset, 4),
      checksum: view.getUint32(entryOffset + 4, false),
      offset: view.getUint32(entryOffset + 8, false),
      length: view.getUint32(entryOffset + 12, false)
    });
  }
  return {
    valid: true,
    container,
    flavor,
    tables,
    names: parseFontNameTable(bytes, tables.find((table) => table.tag === "name"))
  };
}

function parseWoffFont(bytes: Uint8Array): FontInfo {
  if (bytes.length < 44) {
    return { valid: false, error: "文件太短，无法读取 WOFF 头。", tables: [], names: [] };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tableCount = view.getUint16(12, false);
  const directoryEnd = 44 + tableCount * 20;
  if (tableCount <= 0 || directoryEnd > bytes.length) {
    return { valid: false, error: "WOFF 表目录超出文件边界。", tables: [], names: [] };
  }
  const tables: FontTableEntry[] = [];
  for (let index = 0; index < tableCount; index++) {
    const entryOffset = 44 + index * 20;
    tables.push({
      tag: asciiAt(bytes, entryOffset, 4),
      offset: view.getUint32(entryOffset + 4, false),
      compressedLength: view.getUint32(entryOffset + 8, false),
      length: view.getUint32(entryOffset + 12, false),
      checksum: view.getUint32(entryOffset + 16, false)
    });
  }
  return {
    valid: true,
    container: "WOFF",
    flavor: fontFlavor(bytes, 4) || asciiAt(bytes, 4, 4),
    tables,
    names: parseFontNameTable(bytes, tables.find((table) => table.tag === "name" && table.compressedLength === table.length)),
    totalSfntSize: view.getUint32(16, false)
  };
}

function parseWoff2Font(bytes: Uint8Array): FontInfo {
  if (bytes.length < 48) {
    return { valid: false, error: "文件太短，无法读取 WOFF2 头。", tables: [], names: [] };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tableCount = view.getUint16(12, false);
  let offset = 48;
  const tables: FontTableEntry[] = [];
  for (let index = 0; index < tableCount; index++) {
    if (offset >= bytes.length) {
      return { valid: false, error: "WOFF2 表目录超出文件边界。", tables: [], names: [] };
    }
    const flags = bytes[offset++];
    const knownTag = flags & 0x3f;
    let tag = woff2KnownTableTag(knownTag);
    if (knownTag === 0x3f) {
      if (offset + 4 > bytes.length) {
        return { valid: false, error: "WOFF2 自定义表 tag 超出文件边界。", tables: [], names: [] };
      }
      tag = asciiAt(bytes, offset, 4);
      offset += 4;
    }
    const originalLength = read255UInt16(bytes, offset);
    if (!originalLength) {
      return { valid: false, error: "WOFF2 表目录长度字段不完整。", tables: [], names: [] };
    }
    offset = originalLength.offset;
    let transformedLength: number | undefined;
    const hasTransform = (flags & 0xc0) !== 0 || (tag === "glyf" && (flags & 0xc0) !== 0) || (tag === "loca" && (flags & 0xc0) !== 0);
    if (hasTransform && tag !== "loca") {
      const transformed = read255UInt16(bytes, offset);
      if (!transformed) {
        return { valid: false, error: "WOFF2 transformLength 字段不完整。", tables: [], names: [] };
      }
      transformedLength = transformed.value;
      offset = transformed.offset;
    }
    tables.push({
      tag,
      offset: 0,
      length: originalLength.value,
      compressedLength: transformedLength
    });
  }
  return {
    valid: true,
    container: "WOFF2",
    flavor: fontFlavor(bytes, 4) || asciiAt(bytes, 4, 4),
    tables,
    names: [],
    totalSfntSize: view.getUint32(16, false),
    meta: [
      { label: "压缩数据", value: formatBytes(view.getUint32(20, false)) },
      { label: "Meta", value: view.getUint32(32, false) > 0 ? `${formatBytes(view.getUint32(36, false))} @ 0x${view.getUint32(32, false).toString(16).toUpperCase()}` : "无" },
      { label: "Private", value: view.getUint32(40, false) > 0 ? `${formatBytes(view.getUint32(44, false))} @ 0x${view.getUint32(40, false).toString(16).toUpperCase()}` : "无" }
    ],
    error: "WOFF2 已解析容器头和压缩表目录；name 表内容需 Brotli 解压后才能展开。"
  };
}

function parseEotFont(bytes: Uint8Array): FontInfo {
  if (bytes.length < 82) {
    return { valid: false, error: "文件太短，无法读取 EOT 头。", tables: [], names: [] };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eotSize = view.getUint32(0, true);
  const fontDataSize = view.getUint32(4, true);
  const version = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  const panose = Array.from(bytes.slice(16, 26)).map((item) => item.toString(16).padStart(2, "0")).join(" ");
  const charset = bytes[26];
  const italic = bytes[27];
  const weight = view.getUint32(28, true);
  let offset = 68;
  const names: FontNameRecord[] = [];
  const fields: Array<{ id: number; label: string; padded: boolean }> = [
    { id: 1, label: "Family", padded: true },
    { id: 2, label: "Subfamily", padded: true },
    { id: 5, label: "Version", padded: true },
    { id: 4, label: "Full name", padded: true },
    { id: 0, label: "Root strings", padded: false }
  ];
  for (const field of fields) {
    const fieldValue = readEotStringField(bytes, offset, field.padded);
    if (!fieldValue) {
      break;
    }
    offset = fieldValue.offset;
    if (field.id > 0 && fieldValue.value) {
      names.push({ id: field.id, label: field.label, value: fieldValue.value });
    }
  }
  if (offset + 4 <= bytes.length) {
    offset += 4;
  }
  const sfntOffset = findEmbeddedSfntOffset(bytes, offset);
  const embedded = sfntOffset === undefined ? undefined : parseSfntFont(bytes, sfntOffset, "EOT embedded sfnt");
  return {
    valid: true,
    container: "EOT",
    flavor: embedded?.valid ? embedded.flavor : "Embedded OpenType",
    tables: embedded?.valid ? embedded.tables : [],
    names: embedded?.valid && embedded.names.length > 0 ? embedded.names : names,
    totalSfntSize: fontDataSize || undefined,
    meta: [
      { label: "EOT 大小", value: eotSize ? formatBytes(eotSize) : "未声明" },
      { label: "版本", value: `0x${version.toString(16).toUpperCase()}` },
      { label: "Flags", value: `0x${flags.toString(16).toUpperCase()}` },
      { label: "Weight", value: weight || "未声明" },
      { label: "Italic", value: italic ? "是" : "否" },
      { label: "Charset", value: charset },
      { label: "PANOSE", value: panose },
      { label: "sfnt 偏移", value: sfntOffset === undefined ? "未找到" : `0x${sfntOffset.toString(16).toUpperCase()}` }
    ],
    error: embedded?.valid ? undefined : "已解析 EOT 容器头和名称字段，但未找到可展开的内嵌 sfnt 表目录。"
  };
}

function readEotStringField(bytes: Uint8Array, offset: number, padded: boolean): { value: string; offset: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (padded) {
    if (offset + 2 > bytes.length) {
      return undefined;
    }
    offset += 2;
  }
  if (offset + 2 > bytes.length) {
    return undefined;
  }
  const length = view.getUint16(offset, true);
  offset += 2;
  if (offset + length > bytes.length) {
    return undefined;
  }
  const value = length > 0 ? decodeEotString(bytes.slice(offset, offset + length)) : "";
  return { value, offset: offset + length };
}

function woff2KnownTableTag(index: number): string {
  const tags = [
    "cmap",
    "head",
    "hhea",
    "hmtx",
    "maxp",
    "name",
    "OS/2",
    "post",
    "cvt ",
    "fpgm",
    "glyf",
    "loca",
    "prep",
    "CFF ",
    "VORG",
    "EBDT",
    "EBLC",
    "gasp",
    "hdmx",
    "kern",
    "LTSH",
    "PCLT",
    "VDMX",
    "vhea",
    "vmtx",
    "BASE",
    "GDEF",
    "GPOS",
    "GSUB",
    "EBSC",
    "JSTF",
    "MATH",
    "CBDT",
    "CBLC",
    "COLR",
    "CPAL",
    "SVG ",
    "sbix",
    "acnt",
    "avar",
    "bdat",
    "bloc",
    "bsln",
    "cvar",
    "fdsc",
    "feat",
    "fmtx",
    "fvar",
    "gvar",
    "hsty",
    "just",
    "lcar",
    "mort",
    "morx",
    "opbd",
    "prop",
    "trak",
    "Zapf",
    "Silf",
    "Glat",
    "Gloc",
    "Feat",
    "Sill"
  ];
  return tags[index] || `table-${index}`;
}

function read255UInt16(bytes: Uint8Array, offset: number): { value: number; offset: number } | undefined {
  if (offset >= bytes.length) {
    return undefined;
  }
  const code = bytes[offset++];
  if (code === 253) {
    if (offset + 2 > bytes.length) {
      return undefined;
    }
    return { value: (bytes[offset] << 8) | bytes[offset + 1], offset: offset + 2 };
  }
  if (code === 254) {
    if (offset >= bytes.length) {
      return undefined;
    }
    return { value: bytes[offset] + 506, offset: offset + 1 };
  }
  if (code === 255) {
    if (offset >= bytes.length) {
      return undefined;
    }
    return { value: bytes[offset] + 253, offset: offset + 1 };
  }
  return { value: code, offset };
}

function decodeEotString(bytes: Uint8Array): string {
  const text = decodeUtf16Le(bytes).replace(/\0+$/g, "").trim();
  return text || new TextDecoder("latin1").decode(bytes).replace(/\0+$/g, "").trim();
}

function decodeUtf16Le(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    value += String.fromCharCode(bytes[index] | (bytes[index + 1] << 8));
  }
  return value;
}

function findEmbeddedSfntOffset(bytes: Uint8Array, start: number): number | undefined {
  for (let offset = Math.max(0, start); offset + 12 <= bytes.length; offset++) {
    const flavor = fontFlavor(bytes, offset);
    if (!flavor) {
      continue;
    }
    const tableCount = (bytes[offset + 4] << 8) | bytes[offset + 5];
    const directoryEnd = offset + 12 + tableCount * 16;
    if (tableCount > 0 && directoryEnd <= bytes.length) {
      return offset;
    }
  }
  return undefined;
}

function fontFlavor(bytes: Uint8Array, offset: number): string | undefined {
  if (offset + 4 > bytes.length) {
    return undefined;
  }
  const ascii = asciiAt(bytes, offset, 4);
  if (ascii === "OTTO") {
    return "OpenType/CFF";
  }
  if (ascii === "true") {
    return "Apple TrueType";
  }
  if (ascii === "typ1") {
    return "Type 1 sfnt";
  }
  if (bytes[offset] === 0x00 && bytes[offset + 1] === 0x01 && bytes[offset + 2] === 0x00 && bytes[offset + 3] === 0x00) {
    return "TrueType";
  }
  return undefined;
}

function parseFontNameTable(bytes: Uint8Array, table?: FontTableEntry): FontNameRecord[] {
  if (!table || table.offset + table.length > bytes.length || table.length < 6) {
    return [];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = table.offset;
  const count = view.getUint16(offset + 2, false);
  const storageOffset = view.getUint16(offset + 4, false);
  const recordsEnd = offset + 6 + count * 12;
  if (recordsEnd > bytes.length || storageOffset > table.length) {
    return [];
  }
  const wanted = new Map<number, string>([
    [1, "Family"],
    [2, "Subfamily"],
    [4, "Full name"],
    [5, "Version"],
    [6, "PostScript name"],
    [8, "Manufacturer"],
    [13, "License"],
    [16, "Typographic family"],
    [17, "Typographic subfamily"]
  ]);
  const names = new Map<number, FontNameRecord>();
  for (let index = 0; index < count; index++) {
    const recordOffset = offset + 6 + index * 12;
    const platformId = view.getUint16(recordOffset, false);
    const encodingId = view.getUint16(recordOffset + 2, false);
    const languageId = view.getUint16(recordOffset + 4, false);
    const nameId = view.getUint16(recordOffset + 6, false);
    const length = view.getUint16(recordOffset + 8, false);
    const stringOffset = view.getUint16(recordOffset + 10, false);
    const label = wanted.get(nameId);
    if (!label || names.has(nameId)) {
      continue;
    }
    const start = offset + storageOffset + stringOffset;
    const end = start + length;
    if (end > bytes.length || end > offset + table.length) {
      continue;
    }
    const value = decodeFontName(bytes.slice(start, end), platformId, encodingId).trim();
    if (value) {
      names.set(nameId, { id: nameId, label: languageId ? `${label} (${languageId.toString(16).toUpperCase()})` : label, value });
    }
  }
  return [...names.values()];
}

function decodeFontName(bytes: Uint8Array, platformId: number, encodingId: number): string {
  if (platformId === 0 || platformId === 3 || (platformId === 2 && encodingId === 1)) {
    return decodeUtf16Be(bytes);
  }
  return new TextDecoder("latin1").decode(bytes);
}

function decodeUtf16Be(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return value;
}

type WasmSection = {
  id: number;
  name: string;
  size: number;
  offset: number;
  customName?: string;
};

type WasmImport = {
  module: string;
  name: string;
  kind: string;
};

type WasmExport = {
  name: string;
  kind: string;
  index: number;
};

type WasmPreview = {
  valid: boolean;
  version?: number;
  error?: string;
  sections: WasmSection[];
  imports: WasmImport[];
  exports: WasmExport[];
};

function createWasmPreview(bytes: Uint8Array): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "ofv-wasm-preview";
  const parsed = parseWasm(bytes);

  const heading = document.createElement("strong");
  heading.textContent = "WASM 结构";
  preview.append(heading);

  if (!parsed.valid) {
    const error = document.createElement("p");
    error.className = "ofv-wasm-error";
    error.textContent = parsed.error || "不是有效的 WebAssembly 二进制模块。";
    preview.append(error);
    return preview;
  }

  const summary = document.createElement("div");
  summary.className = "ofv-wasm-summary";
  appendMeta(summary, "版本", parsed.version ?? "未知");
  appendMeta(summary, "Sections", parsed.sections.length);
  appendMeta(summary, "Imports", parsed.imports.length);
  appendMeta(summary, "Exports", parsed.exports.length);
  preview.append(summary);

  const sectionTable = createWasmSectionTable(parsed.sections);
  preview.append(sectionTable);
  if (parsed.imports.length > 0) {
    const imports = createWasmList("导入", parsed.imports.map((item) => `${item.module}.${item.name} · ${item.kind}`));
    preview.append(imports);
  }
  if (parsed.exports.length > 0) {
    const exports = createWasmList("导出", parsed.exports.map((item) => `${item.name} · ${item.kind} #${item.index}`));
    preview.append(exports);
  }

  return preview;
}

function createWasmSectionTable(sections: WasmSection[]): HTMLElement {
  const table = document.createElement("table");
  table.className = "ofv-wasm-sections";
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["Section", "大小", "偏移"]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.append(th);
  }
  thead.append(header);
  const tbody = document.createElement("tbody");
  for (const section of sections.slice(0, 80)) {
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = section.customName ? `${section.name} (${section.customName})` : section.name;
    const size = document.createElement("td");
    size.textContent = formatBytes(section.size);
    const offset = document.createElement("td");
    offset.textContent = `0x${section.offset.toString(16).toUpperCase()}`;
    row.append(name, size, offset);
    tbody.append(row);
  }
  table.append(thead, tbody);
  return table;
}

function createWasmList(titleText: string, rows: string[]): HTMLElement {
  const details = document.createElement("details");
  details.className = "ofv-details ofv-wasm-list";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = `${titleText} ${rows.length}`;
  const list = document.createElement("ul");
  for (const row of rows.slice(0, 120)) {
    const item = document.createElement("li");
    item.textContent = row;
    list.append(item);
  }
  if (rows.length > 120) {
    const item = document.createElement("li");
    item.textContent = `还有 ${rows.length - 120} 项未展示。`;
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function parseWasm(bytes: Uint8Array): WasmPreview {
  if (bytes.length < 8 || bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    return { valid: false, error: "缺少 WebAssembly magic header。", sections: [], imports: [], exports: [] };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  const sections: WasmSection[] = [];
  const imports: WasmImport[] = [];
  const exports: WasmExport[] = [];
  let offset = 8;

  try {
    while (offset < bytes.length) {
      const sectionOffset = offset;
      const id = bytes[offset++];
      const sizeInfo = readVarUint(bytes, offset);
      offset = sizeInfo.offset;
      const payloadOffset = offset;
      const payloadEnd = payloadOffset + sizeInfo.value;
      if (payloadEnd > bytes.length) {
        throw new Error("section 长度超过文件边界。");
      }

      const section: WasmSection = {
        id,
        name: wasmSectionName(id),
        size: sizeInfo.value,
        offset: sectionOffset
      };
      if (id === 0) {
        const customName = readWasmName(bytes, payloadOffset, payloadEnd);
        section.customName = customName.value || undefined;
      } else if (id === 2) {
        imports.push(...parseWasmImports(bytes, payloadOffset, payloadEnd));
      } else if (id === 7) {
        exports.push(...parseWasmExports(bytes, payloadOffset, payloadEnd));
      }
      sections.push(section);
      offset = payloadEnd;
    }
  } catch (error) {
    return {
      valid: false,
      version,
      error: error instanceof Error ? error.message : "WASM section 解析失败。",
      sections,
      imports,
      exports
    };
  }

  return { valid: true, version, sections, imports, exports };
}

function parseWasmImports(bytes: Uint8Array, offset: number, end: number): WasmImport[] {
  const imports: WasmImport[] = [];
  const count = readVarUint(bytes, offset);
  offset = count.offset;
  for (let index = 0; index < count.value && offset < end; index++) {
    const moduleName = readWasmName(bytes, offset, end);
    offset = moduleName.offset;
    const importName = readWasmName(bytes, offset, end);
    offset = importName.offset;
    const kind = bytes[offset++];
    offset = skipWasmImportDescriptor(bytes, offset, end, kind);
    imports.push({ module: moduleName.value, name: importName.value, kind: wasmExternalKind(kind) });
  }
  return imports;
}

function parseWasmExports(bytes: Uint8Array, offset: number, end: number): WasmExport[] {
  const exports: WasmExport[] = [];
  const count = readVarUint(bytes, offset);
  offset = count.offset;
  for (let index = 0; index < count.value && offset < end; index++) {
    const exportName = readWasmName(bytes, offset, end);
    offset = exportName.offset;
    const kind = bytes[offset++];
    const itemIndex = readVarUint(bytes, offset);
    offset = itemIndex.offset;
    exports.push({ name: exportName.value, kind: wasmExternalKind(kind), index: itemIndex.value });
  }
  return exports;
}

function skipWasmImportDescriptor(bytes: Uint8Array, offset: number, end: number, kind: number): number {
  if (kind === 0x00) {
    return readVarUint(bytes, offset).offset;
  }
  if (kind === 0x01) {
    const elementTypeOffset = offset + 1;
    return skipWasmLimits(bytes, elementTypeOffset, end);
  }
  if (kind === 0x02) {
    return skipWasmLimits(bytes, offset, end);
  }
  if (kind === 0x03) {
    return Math.min(end, offset + 2);
  }
  return offset;
}

function skipWasmLimits(bytes: Uint8Array, offset: number, end: number): number {
  const flags = bytes[offset++];
  offset = readVarUint(bytes, offset).offset;
  if ((flags & 0x01) === 0x01 && offset < end) {
    offset = readVarUint(bytes, offset).offset;
  }
  return offset;
}

function readVarUint(bytes: Uint8Array, offset: number): { value: number; offset: number } {
  let result = 0;
  let shift = 0;
  for (let index = 0; index < 5; index++) {
    if (offset >= bytes.length) {
      throw new Error("LEB128 数据不完整。");
    }
    const byte = bytes[offset++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, offset };
    }
    shift += 7;
  }
  throw new Error("LEB128 数据过长。");
}

function readWasmName(bytes: Uint8Array, offset: number, end: number): { value: string; offset: number } {
  const length = readVarUint(bytes, offset);
  offset = length.offset;
  const nameEnd = offset + length.value;
  if (nameEnd > end) {
    throw new Error("字符串长度超过 section 边界。");
  }
  return { value: new TextDecoder().decode(bytes.slice(offset, nameEnd)), offset: nameEnd };
}

function wasmSectionName(id: number): string {
  const names: Record<number, string> = {
    0: "custom",
    1: "type",
    2: "import",
    3: "function",
    4: "table",
    5: "memory",
    6: "global",
    7: "export",
    8: "start",
    9: "element",
    10: "code",
    11: "data",
    12: "data-count"
  };
  return names[id] || `unknown ${id}`;
}

function wasmExternalKind(kind: number): string {
  const names: Record<number, string> = {
    0x00: "function",
    0x01: "table",
    0x02: "memory",
    0x03: "global"
  };
  return names[kind] || `unknown ${kind}`;
}

type PhotoshopHeader = {
  valid: boolean;
  error?: string;
  signature?: string;
  version?: number;
  channels?: number;
  width?: number;
  height?: number;
  depth?: number;
  colorMode?: number;
};

async function createPhotoshopPreview(
  bytes: Uint8Array,
  toolbar?: { setZoom(value: number | undefined): void }
): Promise<{ element: HTMLElement; instance?: PreviewInstance }> {
  const preview = document.createElement("div");
  preview.className = "ofv-psd-preview";

  const header = parsePhotoshopHeader(bytes);
  if (!header.valid) {
    const error = document.createElement("p");
    error.className = "ofv-psd-error";
    error.textContent = header.error || "不是有效的 Photoshop 文档头。";
    preview.append(error);
    return { element: preview };
  }

  const composite = await createPhotoshopCompositePreview(bytes, header, toolbar);
  preview.append(composite.element);

  return { element: preview, instance: composite.instance };
}

async function createPhotoshopCompositePreview(
  bytes: Uint8Array,
  header: PhotoshopHeader,
  toolbar?: { setZoom(value: number | undefined): void }
): Promise<{ element: HTMLElement; instance?: PreviewInstance }> {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-psd-composite";

  if (!canUseBrowserCanvas()) {
    const status = document.createElement("p");
    status.className = "ofv-psd-error";
    status.textContent = "当前环境不支持 Canvas，无法生成 PSD 合成图预览。";
    wrapper.append(status);
    return { element: wrapper };
  }

  try {
    const { readPsd } = await import("ag-psd");
    const psd = readPsd(toStandaloneArrayBuffer(bytes), {
      skipLayerImageData: true,
      skipThumbnail: true,
      skipLinkedFilesData: true,
      useImageData: true,
      throwForMissingFeatures: false,
      logMissingFeatures: false
    });
    const canvas = psd.canvas || createCanvasFromPsdImageData(psd);
    if (!canvas) {
      throw new Error("PSD 文件没有可读取的合成图像数据。请在 Photoshop 中开启“最大兼容性”保存，或接入外部转换服务。");
    }

    canvas.classList.add("ofv-psd-canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Photoshop composite ${header.width} x ${header.height}`);
    wrapper.append(canvas);
    return { element: wrapper, instance: createAssetVisualController(canvas, toolbar) };
  } catch (error) {
    const status = document.createElement("p");
    status.className = "ofv-psd-error";
    status.textContent = `PSD 合成图解析失败：${error instanceof Error ? error.message : "当前文件特性暂不支持。"}`;
    wrapper.append(status);
  }

  return { element: wrapper };
}

function createAssetVisualController(
  element: HTMLElement,
  toolbar?: { setZoom(value: number | undefined): void }
): PreviewInstance {
  let scale = 1;
  let rotation = 0;
  const apply = () => {
    element.style.transform = `scale(${scale}) rotate(${rotation}deg)`;
    element.style.transformOrigin = "center";
    toolbar?.setZoom(scale);
  };
  apply();

  return {
    canCommand(command) {
      return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset" || command === "rotate-right" || command === "rotate-left";
    },
    command(command: PreviewCommand) {
      if (command === "zoom-in") {
        scale = Math.min(8, Number((scale + 0.25).toFixed(2)));
        apply();
        return true;
      }
      if (command === "zoom-out") {
        scale = Math.max(0.1, Number((scale - 0.25).toFixed(2)));
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
      element.style.removeProperty("transform");
      element.style.removeProperty("transform-origin");
      toolbar?.setZoom(undefined);
    }
  };
}

function canUseBrowserCanvas(): boolean {
  return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";
}

function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function createCanvasFromPsdImageData(psd: Psd): HTMLCanvasElement | undefined {
  const imageData = psd.imageData;
  if (!imageData || !imageData.width || !imageData.height || !(imageData.data instanceof Uint8ClampedArray)) {
    return undefined;
  }
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height), 0, 0);
  return canvas;
}

function parsePhotoshopHeader(bytes: Uint8Array): PhotoshopHeader {
  if (bytes.length < 26) {
    return { valid: false, error: "文件太短，无法读取 PSD/PSB 头信息。" };
  }
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 4));
  if (signature !== "8BPS") {
    return { valid: false, signature, error: "缺少 8BPS Photoshop 签名。" };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, false);
  if (version !== 1 && version !== 2) {
    return { valid: false, signature, version, error: `未知 Photoshop 文件版本：${version}。` };
  }

  const reserved = bytes.slice(6, 12);
  if (reserved.some((byte) => byte !== 0)) {
    return { valid: false, signature, version, error: "PSD/PSB 保留字段不为 0，文件头可能已损坏。" };
  }

  return {
    valid: true,
    signature,
    version,
    channels: view.getUint16(12, false),
    height: view.getUint32(14, false),
    width: view.getUint32(18, false),
    depth: view.getUint16(22, false),
    colorMode: view.getUint16(24, false)
  };
}

type SqliteHeader = {
  valid: boolean;
  error?: string;
  pageSize?: number;
  writeVersion?: number;
  readVersion?: number;
  pageCount?: number;
  schemaVersion?: number;
  textEncoding?: number;
  userVersion?: number;
};

type SqliteSchemaEntry = {
  type: string;
  name: string;
  tableName: string;
  rootPage: number;
  sql: string;
};

type SqliteColumn = {
  name: string;
  type: string;
  primaryKey: boolean;
};

type SqliteTableSample = {
  tableName: string;
  rootPage: number;
  columns: SqliteColumn[];
  rows: Array<Array<string | number | null>>;
  note?: string;
};

function createSqlitePreview(bytes: Uint8Array): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "ofv-sqlite-preview";
  const heading = document.createElement("strong");
  heading.textContent = "SQLite 结构";
  preview.append(heading);

  const header = parseSqliteHeader(bytes);
  if (!header.valid) {
    const error = document.createElement("p");
    error.className = "ofv-sqlite-error";
    error.textContent = header.error || "不是有效的 SQLite 数据库文件。";
    preview.append(error);
    return preview;
  }
  hideSupplementalInfo(heading);

  const summary = document.createElement("div");
  summary.className = "ofv-sqlite-summary";
  appendMeta(summary, "页大小", `${header.pageSize} B`);
  appendMeta(summary, "页数", header.pageCount ?? "未知");
  appendMeta(summary, "读写版本", `${sqliteJournalMode(header.readVersion)} / ${sqliteJournalMode(header.writeVersion)}`);
  appendMeta(summary, "Schema", header.schemaVersion ?? "未知");
  appendMeta(summary, "编码", sqliteEncoding(header.textEncoding));
  appendMeta(summary, "User version", header.userVersion ?? 0);
  hideSupplementalInfo(summary);
  preview.append(summary);

  const schema = parseSqliteSchema(bytes, header);
  if (schema.length > 0) {
    preview.append(createSqliteSchemaTable(schema));
    const samples = createSqliteTableSamples(bytes, header, schema);
    if (samples.length > 0) {
      preview.append(createSqliteDataPreview(samples));
    }
  } else {
    const empty = document.createElement("p");
    empty.className = "ofv-sqlite-empty";
    empty.textContent = "未从第一页 sqlite_schema 叶子页提取到结构定义；复杂数据库可后续接入 sqlite-wasm 完整读取。";
    preview.append(empty);
  }

  return preview;
}

function createSqliteTableSamples(bytes: Uint8Array, header: SqliteHeader, schema: SqliteSchemaEntry[]): SqliteTableSample[] {
  return schema
    .filter((entry) => entry.type === "table" && entry.rootPage > 0 && !entry.name.startsWith("sqlite_"))
    .slice(0, 6)
    .map((entry) => parseSqliteTableSample(bytes, header, entry))
    .filter((sample): sample is SqliteTableSample => Boolean(sample && (sample.rows.length > 0 || sample.note)));
}

function parseSqliteTableSample(bytes: Uint8Array, header: SqliteHeader, entry: SqliteSchemaEntry): SqliteTableSample | null {
  const pageSize = header.pageSize || 0;
  const pageIndex = entry.rootPage - 1;
  const pageStart = pageIndex * pageSize;
  if (pageSize <= 0 || pageStart < 0 || pageStart >= bytes.length) {
    return null;
  }
  const pageHeader = pageStart + (entry.rootPage === 1 ? 100 : 0);
  if (pageHeader + 8 > bytes.length) {
    return null;
  }
  const columns = parseSqliteCreateTableColumns(entry.sql);
  if (columns.length === 0) {
    return null;
  }
  if (bytes[pageHeader] !== 0x0d) {
    return {
      tableName: entry.name,
      rootPage: entry.rootPage,
      columns,
      rows: [],
      note: "当前只内置解析 SQLite table leaf page；索引页、溢出页或复杂 b-tree 可接入 sqlite-wasm 增强。"
    };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cellCount = view.getUint16(pageHeader + 3, false);
  const rows: Array<Array<string | number | null>> = [];
  const pageEnd = Math.min(bytes.length, pageStart + pageSize);
  for (let index = 0; index < Math.min(cellCount, 80); index++) {
    const pointerOffset = pageHeader + 8 + index * 2;
    if (pointerOffset + 2 > pageEnd) {
      break;
    }
    const cellOffset = pageStart + view.getUint16(pointerOffset, false);
    const row = parseSqliteTableCell(bytes, cellOffset, pageEnd, columns);
    if (row) {
      rows.push(row);
    }
  }
  return {
    tableName: entry.name,
    rootPage: entry.rootPage,
    columns,
    rows,
    note: rows.length === 0 ? "未从该表 root page 抽样到行数据。" : undefined
  };
}

function parseSqliteTableCell(
  bytes: Uint8Array,
  offset: number,
  pageEnd: number,
  columns: SqliteColumn[]
): Array<string | number | null> | null {
  try {
    let cursor = offset;
    const payloadLength = readSqliteVarint(bytes, cursor);
    cursor = payloadLength.offset;
    const rowId = readSqliteVarint(bytes, cursor);
    cursor = rowId.offset;
    const payloadEnd = Math.min(pageEnd, cursor + Number(payloadLength.value));
    if (payloadEnd > bytes.length) {
      return null;
    }
    const record = parseSqliteRecord(bytes, cursor, payloadEnd);
    return columns.map((column, index) => {
      const value = record[index] ?? null;
      return value === null && column.primaryKey && /int/i.test(column.type) ? Number(rowId.value) : value;
    });
  } catch {
    return null;
  }
}

function parseSqliteCreateTableColumns(sql: string): SqliteColumn[] {
  const start = sql.indexOf("(");
  const end = sql.lastIndexOf(")");
  if (start < 0 || end <= start) {
    return [];
  }
  return splitSqliteColumnDefinitions(sql.slice(start + 1, end))
    .map(parseSqliteColumnDefinition)
    .filter((column): column is SqliteColumn => Boolean(column));
}

function splitSqliteColumnDefinitions(value: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      current += char;
      if (char === quote && value[index + 1] === quote) {
        current += value[++index];
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "[") {
      quote = "]";
      current += char;
      continue;
    }
    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }
    if (char === "," && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result;
}

function parseSqliteColumnDefinition(definition: string): SqliteColumn | null {
  if (/^(?:constraint|primary|foreign|unique|check|key)\b/i.test(definition)) {
    return null;
  }
  const match = definition.match(/^("[^"]+"|'[^']+'|`[^`]+`|\[[^\]]+\]|\S+)(?:\s+(.+))?$/);
  if (!match) {
    return null;
  }
  const name = unquoteSqliteIdentifier(match[1]);
  const rest = match[2] || "";
  const typeMatch = rest.match(/^([a-z0-9_]+(?:\s+[a-z0-9_]+)?)/i);
  return {
    name,
    type: typeMatch?.[1]?.toUpperCase() || "ANY",
    primaryKey: /\bprimary\s+key\b/i.test(rest)
  };
}

function unquoteSqliteIdentifier(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith("`") && value.endsWith("`"))) {
    return value.slice(1, -1).replaceAll(value[0] + value[0], value[0]);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseSqliteHeader(bytes: Uint8Array): SqliteHeader {
  if (bytes.length < 100) {
    return { valid: false, error: "文件太短，无法读取 SQLite 数据库头。" };
  }
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 16));
  if (signature !== "SQLite format 3\0") {
    return { valid: false, error: "缺少 SQLite format 3 文件签名。" };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawPageSize = view.getUint16(16, false);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) {
    return { valid: false, error: `SQLite 页大小无效：${pageSize}。` };
  }

  return {
    valid: true,
    pageSize,
    writeVersion: bytes[18],
    readVersion: bytes[19],
    pageCount: view.getUint32(28, false),
    schemaVersion: view.getUint32(40, false),
    textEncoding: view.getUint32(56, false),
    userVersion: view.getUint32(60, false)
  };
}

function parseSqliteSchema(bytes: Uint8Array, header: SqliteHeader): SqliteSchemaEntry[] {
  const pageSize = header.pageSize || 0;
  if (pageSize <= 0 || bytes.length < Math.min(pageSize, 100)) {
    return [];
  }
  const pageStart = 0;
  const btreeStart = 100;
  if (bytes[btreeStart] !== 0x0d) {
    return [];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cellCount = view.getUint16(btreeStart + 3, false);
  const entries: SqliteSchemaEntry[] = [];
  for (let index = 0; index < Math.min(cellCount, 80); index++) {
    const pointerOffset = btreeStart + 8 + index * 2;
    if (pointerOffset + 2 > bytes.length) {
      break;
    }
    const cellOffset = pageStart + view.getUint16(pointerOffset, false);
    const entry = parseSqliteSchemaCell(bytes, cellOffset, pageStart + pageSize);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

function parseSqliteSchemaCell(bytes: Uint8Array, offset: number, pageEnd: number): SqliteSchemaEntry | null {
  try {
    let cursor = offset;
    const payloadLength = readSqliteVarint(bytes, cursor);
    cursor = payloadLength.offset;
    const rowId = readSqliteVarint(bytes, cursor);
    cursor = rowId.offset;
    const payloadEnd = Math.min(pageEnd, cursor + Number(payloadLength.value));
    if (payloadEnd > bytes.length) {
      return null;
    }
    const record = parseSqliteRecord(bytes, cursor, payloadEnd);
    if (record.length < 5) {
      return null;
    }
    return {
      type: String(record[0] ?? ""),
      name: String(record[1] ?? ""),
      tableName: String(record[2] ?? ""),
      rootPage: Number(record[3] ?? 0),
      sql: String(record[4] ?? "")
    };
  } catch {
    return null;
  }
}

function parseSqliteRecord(bytes: Uint8Array, offset: number, end: number): Array<string | number | null> {
  const headerSize = readSqliteVarint(bytes, offset);
  let headerCursor = headerSize.offset;
  const bodyStart = offset + Number(headerSize.value);
  let bodyCursor = bodyStart;
  const serialTypes: bigint[] = [];
  while (headerCursor < bodyStart && headerCursor < end) {
    const serial = readSqliteVarint(bytes, headerCursor);
    serialTypes.push(serial.value);
    headerCursor = serial.offset;
  }
  return serialTypes.map((serialType) => {
    const value = readSqliteValue(bytes, bodyCursor, end, serialType);
    bodyCursor = value.offset;
    return value.value;
  });
}

function readSqliteValue(
  bytes: Uint8Array,
  offset: number,
  end: number,
  serialType: bigint
): { value: string | number | null; offset: number } {
  const type = Number(serialType);
  if (type === 0) {
    return { value: null, offset };
  }
  if (type === 1) {
    return { value: signedInteger(bytes, offset, 1), offset: offset + 1 };
  }
  if (type === 2) {
    return { value: signedInteger(bytes, offset, 2), offset: offset + 2 };
  }
  if (type === 3) {
    return { value: signedInteger(bytes, offset, 3), offset: offset + 3 };
  }
  if (type === 4) {
    return { value: signedInteger(bytes, offset, 4), offset: offset + 4 };
  }
  if (type === 5) {
    return { value: signedInteger(bytes, offset, 6), offset: offset + 6 };
  }
  if (type === 6) {
    return { value: signedInteger(bytes, offset, 8), offset: offset + 8 };
  }
  if (type === 8) {
    return { value: 0, offset };
  }
  if (type === 9) {
    return { value: 1, offset };
  }
  if (type >= 12) {
    const length = Math.floor((type - 12) / 2);
    const valueEnd = Math.min(end, offset + length);
    if (type % 2 === 1) {
      return { value: new TextDecoder().decode(bytes.slice(offset, valueEnd)), offset: offset + length };
    }
    return { value: `<blob ${length} B>`, offset: offset + length };
  }
  return { value: null, offset };
}

function readSqliteVarint(bytes: Uint8Array, offset: number): { value: bigint; offset: number } {
  let value = 0n;
  for (let index = 0; index < 9; index++) {
    if (offset >= bytes.length) {
      throw new Error("SQLite varint 数据不完整。");
    }
    const byte = bytes[offset++];
    if (index === 8) {
      value = (value << 8n) | BigInt(byte);
      return { value, offset };
    }
    value = (value << 7n) | BigInt(byte & 0x7f);
    if ((byte & 0x80) === 0) {
      return { value, offset };
    }
  }
  return { value, offset };
}

function signedInteger(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0n;
  for (let index = 0; index < length; index++) {
    value = (value << 8n) | BigInt(bytes[offset + index] || 0);
  }
  const bits = BigInt(length * 8);
  const signBit = 1n << (bits - 1n);
  if ((value & signBit) !== 0n) {
    value -= 1n << bits;
  }
  return Number(value);
}

function createSqliteSchemaTable(entries: SqliteSchemaEntry[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-sqlite-schema";
  const title = document.createElement("strong");
  title.textContent = `Schema 对象 ${entries.length}`;
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["类型", "名称", "表", "Root", "SQL"]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.append(th);
  }
  thead.append(header);
  const tbody = document.createElement("tbody");
  for (const entry of entries) {
    const row = document.createElement("tr");
    for (const value of [entry.type, entry.name, entry.tableName, String(entry.rootPage), entry.sql]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  }
  table.append(thead, tbody);
  wrapper.append(title, table);
  return wrapper;
}

function createSqliteDataPreview(samples: SqliteTableSample[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-sqlite-data";
  const title = document.createElement("strong");
  title.textContent = "表数据抽样";
  wrapper.append(title);

  for (const sample of samples) {
    const details = document.createElement("details");
    details.className = "ofv-sqlite-table-sample";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = `${sample.tableName} · root ${sample.rootPage} · ${sample.rows.length} 行`;
    details.append(summary);

    if (sample.note) {
      const note = document.createElement("p");
      note.className = "ofv-sqlite-empty";
      note.textContent = sample.note;
      details.append(note);
    }

    if (sample.rows.length > 0) {
      const scroller = document.createElement("div");
      scroller.className = "ofv-sqlite-data-table";
      const table = document.createElement("table");
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const column of sample.columns) {
        const th = document.createElement("th");
        th.textContent = column.name;
        if (column.type) {
          th.title = column.primaryKey ? `${column.type} PRIMARY KEY` : column.type;
        }
        headRow.append(th);
      }
      thead.append(headRow);
      const tbody = document.createElement("tbody");
      for (const row of sample.rows) {
        const tr = document.createElement("tr");
        for (const value of row) {
          const td = document.createElement("td");
          td.textContent = value === null ? "NULL" : String(value);
          tr.append(td);
        }
        tbody.append(tr);
      }
      table.append(thead, tbody);
      scroller.append(table);
      details.append(scroller);
    }
    wrapper.append(details);
  }

  return wrapper;
}

function sqliteJournalMode(value?: number): string {
  if (value === 1) {
    return "rollback";
  }
  if (value === 2) {
    return "WAL";
  }
  return value === undefined ? "未知" : String(value);
}

function sqliteEncoding(value?: number): string {
  const encodings: Record<number, string> = {
    0: "未声明",
    1: "UTF-8",
    2: "UTF-16le",
    3: "UTF-16be"
  };
  return value === undefined ? "未知" : encodings[value] || `未知 (${value})`;
}

type ParquetPreview = {
  valid: boolean;
  error?: string;
  footerLength?: number;
  footerOffset?: number;
  dataBytes?: number;
};

function createParquetPreview(bytes: Uint8Array): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "ofv-data-preview";
  const heading = document.createElement("strong");
  heading.textContent = "Parquet 结构";
  preview.append(heading);

  const parsed = parseParquet(bytes);
  if (!parsed.valid) {
    const error = document.createElement("p");
    error.className = "ofv-data-error";
    error.textContent = parsed.error || "不是有效的 Parquet 文件。";
    preview.append(error);
    return preview;
  }

  const summary = document.createElement("div");
  summary.className = "ofv-data-summary";
  appendMeta(summary, "Magic", "PAR1");
  appendMeta(summary, "Footer", `${parsed.footerLength} B`);
  appendMeta(summary, "Footer offset", `0x${(parsed.footerOffset || 0).toString(16).toUpperCase()}`);
  appendMeta(summary, "数据区", formatBytes(parsed.dataBytes || 0));
  hideSupplementalInfo(summary);
  preview.append(summary);

  const note = document.createElement("p");
  note.className = "ofv-data-note";
  note.textContent = "Parquet footer 使用 Thrift 编码；正在尝试在浏览器端解析 schema、row group 和前几行数据。";
  hideSupplementalInfo(note);
  preview.append(note);
  void appendParquetDecodedPreview(preview, bytes, note, heading);
  return preview;
}

async function appendParquetDecodedPreview(
  preview: HTMLElement,
  bytes: Uint8Array,
  note: HTMLElement,
  heading: HTMLElement
): Promise<void> {
  try {
    const { parquetMetadataAsync, parquetReadObjects, parquetSchema } = await import("hyparquet");
    const file = arrayBufferLike(bytes);
    const metadata = await parquetMetadataAsync(file, { initialFetchSize: Math.min(bytes.byteLength, 512 * 1024) });
    const schema = parquetSchema(metadata);
    const fields = flattenParquetSchema(schema);
    const rows = await parquetReadObjects({
      file,
      metadata,
      rowFormat: "object",
      rowStart: 0,
      rowEnd: Math.min(20, Number(metadata.num_rows || 0n))
    });

    note.textContent = `已使用 hyparquet 在前端解析 schema、${metadata.row_groups.length} 个 row group 和 ${rows.length} 行抽样数据。`;
    if (rows.length > 0) {
      hideSupplementalInfo(heading);
      const schemaTable = createParquetSchemaTable(fields, metadata);
      hideSupplementalInfo(schemaTable);
      preview.append(schemaTable);
      preview.append(createObjectRowsTable("记录抽样", rows));
    } else {
      preview.append(createParquetSchemaTable(fields, metadata));
    }
  } catch (error) {
    note.textContent = `已展示 Parquet 容器边界；schema/记录解析失败：${error instanceof Error ? error.message : "当前编码或压缩方式暂不支持。"}`;
  }
}

function arrayBufferLike(bytes: Uint8Array): { byteLength: number; slice(start: number, end?: number): ArrayBuffer } {
  return {
    byteLength: bytes.byteLength,
    slice(start: number, end?: number) {
      return bytes.buffer.slice(bytes.byteOffset + start, bytes.byteOffset + (end ?? bytes.byteLength)) as ArrayBuffer;
    }
  };
}

type ParquetSchemaNode = {
  element?: { name?: string; type?: string; repetition_type?: string; converted_type?: string; logical_type?: { type?: string } };
  path?: string[];
  children?: ParquetSchemaNode[];
};

function flattenParquetSchema(schema: ParquetSchemaNode): Array<{ name: string; type: string; repetition: string; logical: string }> {
  const fields: Array<{ name: string; type: string; repetition: string; logical: string }> = [];
  const visit = (node: ParquetSchemaNode) => {
    const path = Array.isArray(node.path) && node.path.length > 0 ? node.path.join(".") : node.element?.name || "";
    if (node.element && path) {
      fields.push({
        name: path,
        type: node.element.type || (node.children?.length ? "group" : "-"),
        repetition: node.element.repetition_type || "-",
        logical: node.element.logical_type?.type || node.element.converted_type || "-"
      });
    }
    for (const child of node.children || []) {
      visit(child);
    }
  };
  for (const child of schema.children || []) {
    visit(child);
  }
  return fields;
}

function createParquetSchemaTable(
  fields: Array<{ name: string; type: string; repetition: string; logical: string }>,
  metadata: { num_rows: bigint; row_groups: unknown[]; created_by?: string }
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-parquet-schema";
  const title = document.createElement("strong");
  title.textContent = "Schema";
  const summary = document.createElement("div");
  summary.className = "ofv-data-summary";
  appendMeta(summary, "Rows", String(metadata.num_rows));
  appendMeta(summary, "Row groups", metadata.row_groups.length);
  appendMeta(summary, "Columns", fields.filter((field) => field.type !== "group").length);
  if (metadata.created_by) {
    appendMeta(summary, "Created by", metadata.created_by);
  }
  hideSupplementalInfo(summary);

  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Name", "Type", "Repetition", "Logical"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.append(th);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const field of fields.slice(0, 120)) {
    const row = document.createElement("tr");
    for (const value of [field.name, field.type, field.repetition, field.logical]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(title, summary, table);
  return wrapper;
}

function createObjectRowsTable(titleText: string, rows: Record<string, unknown>[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-parquet-records";
  const title = document.createElement("strong");
  title.textContent = `${titleText} ${rows.length}`;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 40);
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column;
    headRow.append(th);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const item of rows) {
    const row = document.createElement("tr");
    for (const column of columns) {
      const cell = document.createElement("td");
      cell.textContent = formatPreviewValue(item[column]);
      row.append(cell);
    }
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(title, table);
  return wrapper;
}

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return `Uint8Array(${value.byteLength})`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function parseParquet(bytes: Uint8Array): ParquetPreview {
  if (bytes.length < 12) {
    return { valid: false, error: "文件太短，无法读取 Parquet 头尾信息。" };
  }
  if (asciiAt(bytes, 0, 4) !== "PAR1" || asciiAt(bytes, bytes.length - 4, 4) !== "PAR1") {
    return { valid: false, error: "缺少 Parquet PAR1 magic header/footer。" };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const footerLength = view.getUint32(bytes.length - 8, true);
  const footerOffset = bytes.length - 8 - footerLength;
  if (footerOffset < 4) {
    return { valid: false, error: "Parquet footer 长度超过文件边界。" };
  }
  return {
    valid: true,
    footerLength,
    footerOffset,
    dataBytes: Math.max(0, footerOffset - 4)
  };
}

type AvroMetadata = {
  key: string;
  value: string;
};

type AvroValue = string | number | boolean | null;

type AvroFieldSchema = {
  name: string;
  type: unknown;
  label: string;
};

type AvroPreview = {
  valid: boolean;
  error?: string;
  metadata: AvroMetadata[];
  schema?: {
    type?: string;
    name?: string;
    namespace?: string;
    fields: string[];
    fieldSchemas: AvroFieldSchema[];
  };
  codec?: string;
  syncMarker?: string;
  records?: {
    fields: string[];
    rows: AvroValue[][];
    note?: string;
  };
};

function createAvroPreview(bytes: Uint8Array): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "ofv-data-preview";
  const heading = document.createElement("strong");
  heading.textContent = "Avro 结构";
  preview.append(heading);

  const parsed = parseAvro(bytes);
  if (!parsed.valid) {
    const error = document.createElement("p");
    error.className = "ofv-data-error";
    error.textContent = parsed.error || "不是有效的 Avro Object Container 文件。";
    preview.append(error);
    return preview;
  }

  const summary = document.createElement("div");
  summary.className = "ofv-data-summary";
  appendMeta(summary, "Magic", "Obj\\x01");
  appendMeta(summary, "Codec", parsed.codec || "null");
  appendMeta(summary, "Metadata", parsed.metadata.length);
  appendMeta(summary, "Sync marker", parsed.syncMarker || "未知");
  hideSupplementalInfo(summary);
    preview.append(summary);

  const hasRecordRows = Boolean(parsed.records && parsed.records.rows.length > 0);
  if (hasRecordRows) {
    hideSupplementalInfo(heading);
  }

  if (parsed.schema) {
    const schema = document.createElement("div");
    schema.className = "ofv-avro-schema";
    const title = document.createElement("strong");
    title.textContent = "Schema";
    const meta = document.createElement("div");
    meta.className = "ofv-data-summary";
    appendMeta(meta, "类型", parsed.schema.type || "未知");
    appendMeta(meta, "名称", [parsed.schema.namespace, parsed.schema.name].filter(Boolean).join(".") || "未知");
    appendMeta(meta, "字段", parsed.schema.fields.length);
    hideSupplementalInfo(meta);
    schema.append(title, meta);
    if (parsed.schema.fields.length > 0) {
      const list = document.createElement("ul");
      for (const field of parsed.schema.fields.slice(0, 80)) {
        const item = document.createElement("li");
        item.textContent = field;
        list.append(item);
      }
      schema.append(list);
    }
    if (hasRecordRows) {
      hideSupplementalInfo(schema);
    }
    preview.append(schema);
  }

  if (parsed.records && (parsed.records.rows.length > 0 || parsed.records.note)) {
    preview.append(createAvroRecordPreview(parsed.records));
  }

  if (parsed.metadata.length > 0) {
    const metadata = createKeyValueTable("Metadata", parsed.metadata);
    if (parsed.schema || hasRecordRows) {
      hideSupplementalInfo(metadata);
    }
    preview.append(metadata);
  }

  return preview;
}

function parseAvro(bytes: Uint8Array): AvroPreview {
  if (bytes.length < 4 || bytes[0] !== 0x4f || bytes[1] !== 0x62 || bytes[2] !== 0x6a || bytes[3] !== 0x01) {
    return { valid: false, error: "缺少 Avro Object Container magic header。", metadata: [] };
  }
  let offset = 4;
  const metadata: AvroMetadata[] = [];
  try {
    while (true) {
      const blockCount = readAvroLong(bytes, offset);
      offset = blockCount.offset;
      let count = blockCount.value;
      if (count === 0n) {
        break;
      }
      if (count < 0n) {
        count = -count;
        const blockSize = readAvroLong(bytes, offset);
        offset = blockSize.offset;
      }
      for (let index = 0; index < Number(count); index++) {
        const key = readAvroBytes(bytes, offset);
        offset = key.offset;
        const value = readAvroBytes(bytes, offset);
        offset = value.offset;
        metadata.push({
          key: new TextDecoder().decode(key.value),
          value: decodeAvroMetadataValue(key.value, value.value)
        });
      }
    }
    if (offset + 16 > bytes.length) {
      throw new Error("Avro sync marker 缺失。");
    }
    const syncMarkerBytes = bytes.slice(offset, offset + 16);
    const syncMarker = Array.from(syncMarkerBytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const schemaText = metadata.find((item) => item.key === "avro.schema")?.value;
    const codec = metadata.find((item) => item.key === "avro.codec")?.value;
    const schema = schemaText ? summarizeAvroSchema(schemaText) : undefined;
    return {
      valid: true,
      metadata,
      codec,
      syncMarker,
      schema,
      records: schemaText ? parseAvroRecordSamples(bytes, offset + 16, syncMarkerBytes, schemaText, codec) : undefined
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Avro metadata 解析失败。",
      metadata
    };
  }
}

function readAvroLong(bytes: Uint8Array, offset: number): { value: bigint; offset: number } {
  let result = 0n;
  let shift = 0n;
  for (let index = 0; index < 10; index++) {
    if (offset >= bytes.length) {
      throw new Error("Avro long 数据不完整。");
    }
    const byte = bytes[offset++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      const value = (result >> 1n) ^ -(result & 1n);
      return { value, offset };
    }
    shift += 7n;
  }
  throw new Error("Avro long 数据过长。");
}

function readAvroBytes(bytes: Uint8Array, offset: number): { value: Uint8Array; offset: number } {
  const length = readAvroLong(bytes, offset);
  offset = length.offset;
  if (length.value < 0n) {
    throw new Error("Avro bytes 长度无效。");
  }
  const size = Number(length.value);
  const end = offset + size;
  if (end > bytes.length) {
    throw new Error("Avro bytes 超出文件边界。");
  }
  return { value: bytes.slice(offset, end), offset: end };
}

function decodeAvroMetadataValue(keyBytes: Uint8Array, valueBytes: Uint8Array): string {
  const key = new TextDecoder().decode(keyBytes);
  if (key === "avro.schema" || key === "avro.codec" || /^[a-z0-9_.-]+$/i.test(key)) {
    return new TextDecoder().decode(valueBytes);
  }
  return `<${valueBytes.length} B>`;
}

function summarizeAvroSchema(schemaText: string): AvroPreview["schema"] {
  try {
    const schema = JSON.parse(schemaText) as {
      type?: string;
      name?: string;
      namespace?: string;
      fields?: Array<{ name?: string; type?: unknown }>;
    };
    const fieldSchemas = Array.isArray(schema.fields)
      ? schema.fields
          .filter((field) => typeof field.name === "string")
          .map((field) => ({
            name: field.name as string,
            type: field.type,
            label: `${field.name}: ${formatAvroType(field.type)}`
          }))
      : [];
    return {
      type: typeof schema.type === "string" ? schema.type : undefined,
      name: typeof schema.name === "string" ? schema.name : undefined,
      namespace: typeof schema.namespace === "string" ? schema.namespace : undefined,
      fields: fieldSchemas.map((field) => field.label),
      fieldSchemas
    };
  } catch {
    return { fields: [], fieldSchemas: [] };
  }
}

function parseAvroRecordSamples(
  bytes: Uint8Array,
  offset: number,
  syncMarker: Uint8Array,
  schemaText: string,
  codec?: string
): AvroPreview["records"] | undefined {
  if (codec && codec !== "null") {
    return { fields: [], rows: [], note: `当前内置抽样只支持 null codec；该文件使用 ${codec} 压缩。` };
  }
  const schema = summarizeAvroSchema(schemaText);
  const fields = schema?.fieldSchemas || [];
  if (!schema || schema.type !== "record" || fields.length === 0) {
    return undefined;
  }
  const rows: AvroValue[][] = [];
  try {
    while (offset < bytes.length && rows.length < 80) {
      const countInfo = readAvroLong(bytes, offset);
      offset = countInfo.offset;
      if (countInfo.value === 0n) {
        break;
      }
      const blockSizeInfo = readAvroLong(bytes, offset);
      offset = blockSizeInfo.offset;
      const count = Number(countInfo.value < 0n ? -countInfo.value : countInfo.value);
      const blockSize = Number(blockSizeInfo.value);
      const blockEnd = offset + blockSize;
      if (!Number.isFinite(count) || !Number.isFinite(blockSize) || blockSize < 0 || blockEnd > bytes.length) {
        throw new Error("Avro data block 超出文件边界。");
      }
      for (let index = 0; index < count && offset < blockEnd && rows.length < 80; index++) {
        const decoded = readAvroRecord(bytes, offset, blockEnd, fields);
        offset = decoded.offset;
        rows.push(decoded.row);
      }
      offset = blockEnd;
      if (offset + syncMarker.length <= bytes.length && matchesBytes(bytes, offset, syncMarker)) {
        offset += syncMarker.length;
      }
    }
  } catch (error) {
    return {
      fields: fields.map((field) => field.name),
      rows,
      note: rows.length > 0
        ? `已抽样部分记录，后续数据解析失败：${error instanceof Error ? error.message : "未知错误"}`
        : `记录抽样失败：${error instanceof Error ? error.message : "当前 schema 暂不支持"}`
    };
  }
  return rows.length > 0 ? { fields: fields.map((field) => field.name), rows } : undefined;
}

function readAvroRecord(
  bytes: Uint8Array,
  offset: number,
  end: number,
  fields: AvroFieldSchema[]
): { row: AvroValue[]; offset: number } {
  const row: AvroValue[] = [];
  for (const field of fields) {
    const value = readAvroDatum(bytes, offset, end, field.type);
    row.push(value.value);
    offset = value.offset;
  }
  return { row, offset };
}

function readAvroDatum(bytes: Uint8Array, offset: number, end: number, type: unknown): { value: AvroValue; offset: number } {
  if (Array.isArray(type)) {
    const branch = readAvroLong(bytes, offset);
    const branchIndex = Number(branch.value);
    const branchType = type[branchIndex];
    if (branchIndex < 0 || branchIndex >= type.length) {
      throw new Error("Avro union 分支索引无效。");
    }
    return readAvroDatum(bytes, branch.offset, end, branchType);
  }
  if (type && typeof type === "object") {
    const typed = type as { type?: unknown };
    return readAvroDatum(bytes, offset, end, typed.type);
  }
  if (type === "null") {
    return { value: null, offset };
  }
  if (type === "boolean") {
    if (offset >= end) {
      throw new Error("Avro boolean 数据不完整。");
    }
    return { value: bytes[offset] !== 0, offset: offset + 1 };
  }
  if (type === "int" || type === "long") {
    const value = readAvroLong(bytes, offset);
    return { value: Number(value.value), offset: value.offset };
  }
  if (type === "float") {
    if (offset + 4 > end) {
      throw new Error("Avro float 数据不完整。");
    }
    return { value: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(offset, true), offset: offset + 4 };
  }
  if (type === "double") {
    if (offset + 8 > end) {
      throw new Error("Avro double 数据不完整。");
    }
    return { value: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(offset, true), offset: offset + 8 };
  }
  if (type === "string") {
    const value = readAvroBytes(bytes, offset);
    if (value.offset > end) {
      throw new Error("Avro string 超出 block 边界。");
    }
    return { value: new TextDecoder().decode(value.value), offset: value.offset };
  }
  if (type === "bytes") {
    const value = readAvroBytes(bytes, offset);
    if (value.offset > end) {
      throw new Error("Avro bytes 超出 block 边界。");
    }
    return { value: `<bytes ${value.value.length} B>`, offset: value.offset };
  }
  throw new Error(`暂不支持 Avro 字段类型 ${formatAvroType(type)}。`);
}

function matchesBytes(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
  for (let index = 0; index < expected.length; index++) {
    if (bytes[offset + index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function createAvroRecordPreview(records: NonNullable<AvroPreview["records"]>): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-avro-records";
  const title = document.createElement("strong");
  title.textContent = `记录抽样 ${records.rows.length}`;
  wrapper.append(title);
  if (records.note) {
    const note = document.createElement("p");
    note.className = "ofv-data-note";
    note.textContent = records.note;
    wrapper.append(note);
  }
  if (records.rows.length === 0) {
    return wrapper;
  }
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const field of records.fields) {
    const th = document.createElement("th");
    th.textContent = field;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  for (const row of records.rows) {
    const tr = document.createElement("tr");
    for (const value of row) {
      const td = document.createElement("td");
      td.textContent = value === null ? "NULL" : String(value);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function formatAvroType(type: unknown): string {
  if (typeof type === "string") {
    return type;
  }
  if (Array.isArray(type)) {
    return type.map(formatAvroType).join(" | ");
  }
  if (type && typeof type === "object") {
    const value = type as { type?: unknown; name?: unknown; items?: unknown; values?: unknown };
    if (typeof value.name === "string") {
      return value.name;
    }
    if (value.type === "array") {
      return `array<${formatAvroType(value.items)}>`;
    }
    if (value.type === "map") {
      return `map<${formatAvroType(value.values)}>`;
    }
    return formatAvroType(value.type);
  }
  return "unknown";
}

function createKeyValueTable(titleText: string, rows: AvroMetadata[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-data-kv";
  const title = document.createElement("strong");
  title.textContent = titleText;
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  for (const row of rows.slice(0, 80)) {
    const tr = document.createElement("tr");
    const key = document.createElement("th");
    key.textContent = row.key;
    const value = document.createElement("td");
    value.textContent = row.value;
    tr.append(key, value);
    tbody.append(tr);
  }
  table.append(tbody);
  wrapper.append(title, table);
  return wrapper;
}

type PlistValue =
  | string
  | Uint8Array
  | PlistValue[]
  | { [key: string]: PlistValue }
  | boolean
  | number
  | null;

type WebArchivePreview = {
  valid: boolean;
  error?: string;
  binary?: boolean;
  url?: string;
  mimeType?: string;
  encoding?: string;
  mainBytes?: number;
  subresources?: number;
  subframeArchives?: number;
  snippet?: string;
};

function createWebArchivePreview(bytes: Uint8Array): HTMLElement {
  const preview = document.createElement("div");
  preview.className = "ofv-data-preview ofv-webarchive-preview";
  const heading = document.createElement("strong");
  heading.textContent = "WebArchive 结构";
  preview.append(heading);

  const parsed = parseWebArchive(bytes);
  if (!parsed.valid) {
    const error = document.createElement("p");
    error.className = "ofv-data-error";
    error.textContent = parsed.error || "不是有效的 WebArchive plist。";
    preview.append(error);
    return preview;
  }

  const summary = document.createElement("div");
  summary.className = "ofv-data-summary";
  appendMeta(summary, "格式", parsed.binary ? "Binary plist" : "XML plist");
  appendMeta(summary, "主资源", parsed.url || "未声明");
  appendMeta(summary, "MIME", parsed.mimeType || "未知");
  appendMeta(summary, "编码", parsed.encoding || "未声明");
  appendMeta(summary, "主资源大小", parsed.mainBytes !== undefined ? formatBytes(parsed.mainBytes) : "未知");
  appendMeta(summary, "子资源", String(parsed.subresources ?? 0));
  appendMeta(summary, "子归档", String(parsed.subframeArchives ?? 0));
  hideSupplementalInfo(summary);
  preview.append(summary);

  if (parsed.binary) {
    const note = document.createElement("p");
    note.className = "ofv-data-note";
    note.textContent = parsed.snippet
      ? "已在浏览器端解析 binary plist WebArchive，并展开主资源摘要。"
      : "已识别 binary plist WebArchive；当前文件未提取到可展示的主资源片段。";
    hideSupplementalInfo(note);
    preview.append(note);
  }

  if (parsed.snippet) {
    hideSupplementalInfo(heading);
    const snippet = document.createElement("pre");
    snippet.className = "ofv-text-block ofv-webarchive-snippet";
    snippet.textContent = parsed.snippet;
    preview.append(snippet);
  }
  return preview;
}

function parseWebArchive(bytes: Uint8Array): WebArchivePreview {
  if (bytes.length >= 8 && asciiAt(bytes, 0, 8) === "bplist00") {
    return parseBinaryWebArchive(bytes);
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 1024 * 1024)));
  if (!/<plist[\s>]/i.test(text) || !text.includes("WebMainResource")) {
    return { valid: false, error: "缺少 XML plist 或 WebMainResource 标记。" };
  }
  if (typeof DOMParser === "undefined") {
    return { valid: false, error: "当前环境缺少 DOMParser，无法解析 XML WebArchive。" };
  }

  const documentXml = new DOMParser().parseFromString(text, "application/xml");
  if (documentXml.querySelector("parsererror")) {
    return { valid: false, error: "XML plist 解析失败。" };
  }
  const rootDict = Array.from(documentXml.documentElement.children).find((child) => child.tagName === "dict");
  if (!rootDict) {
    return { valid: false, error: "XML plist 缺少根 dict。" };
  }

  const plist = parsePlistElement(rootDict);
  if (!isPlistDict(plist)) {
    return { valid: false, error: "XML plist 根节点不是 dict。" };
  }
  return webArchivePreviewFromPlist(plist);
}

function parseBinaryWebArchive(bytes: Uint8Array): WebArchivePreview {
  const plist = parseBinaryPlist(bytes);
  if (!plist.valid) {
    return { valid: true, binary: true, error: plist.error };
  }
  if (!isPlistDict(plist.value)) {
    return { valid: true, binary: true, error: "Binary plist 根节点不是 dict。" };
  }
  return webArchivePreviewFromPlist(plist.value, true);
}

function webArchivePreviewFromPlist(plist: { [key: string]: PlistValue }, binary = false): WebArchivePreview {
  const mainResource = plist.WebMainResource;
  if (!isPlistDict(mainResource)) {
    return { valid: false, binary, error: "WebArchive 缺少 WebMainResource dict。" };
  }

  const resourceData = mainResource.WebResourceData;
  const mimeType = plistString(mainResource.WebResourceMIMEType);
  const mainBytes = resourceData instanceof Uint8Array ? resourceData.length : undefined;
  return {
    valid: true,
    binary,
    url: plistString(mainResource.WebResourceURL),
    mimeType,
    encoding: plistString(mainResource.WebResourceTextEncodingName),
    mainBytes,
    subresources: Array.isArray(plist.WebSubresources) ? plist.WebSubresources.length : 0,
    subframeArchives: Array.isArray(plist.WebSubframeArchives) ? plist.WebSubframeArchives.length : 0,
    snippet: createWebArchiveSnippet(resourceData, mimeType)
  };
}

function parsePlistElement(element: Element): PlistValue {
  switch (element.tagName) {
    case "dict": {
      const result: Record<string, PlistValue> = {};
      const children = Array.from(element.children);
      for (let index = 0; index < children.length; index++) {
        const key = children[index];
        if (key.tagName !== "key") {
          continue;
        }
        const value = children[index + 1];
        if (value) {
          result[key.textContent || ""] = parsePlistElement(value);
          index++;
        }
      }
      return result;
    }
    case "array":
      return Array.from(element.children).map(parsePlistElement);
    case "data":
      return decodeBase64Data(element.textContent || "");
    case "integer":
    case "real":
      return Number(element.textContent || 0);
    case "true":
      return true;
    case "false":
      return false;
    case "string":
    case "date":
    default:
      return element.textContent || "";
  }
}

type BinaryPlistResult = {
  valid: boolean;
  value?: PlistValue;
  error?: string;
};

function parseBinaryPlist(bytes: Uint8Array): BinaryPlistResult {
  try {
    if (bytes.length < 40 || asciiAt(bytes, 0, 8) !== "bplist00") {
      return { valid: false, error: "缺少 bplist00 文件头。" };
    }
    const trailer = bytes.length - 32;
    const offsetIntSize = bytes[trailer + 6];
    const objectRefSize = bytes[trailer + 7];
    const objectCount = readBinaryPlistInt(bytes, trailer + 8, 8);
    const topObject = readBinaryPlistInt(bytes, trailer + 16, 8);
    const offsetTableOffset = readBinaryPlistInt(bytes, trailer + 24, 8);
    if (
      offsetIntSize <= 0 ||
      objectRefSize <= 0 ||
      objectCount <= 0 ||
      topObject < 0 ||
      topObject >= objectCount ||
      offsetTableOffset + objectCount * offsetIntSize > trailer
    ) {
      return { valid: false, error: "Binary plist trailer 或 offset table 异常。" };
    }
    const offsets: number[] = [];
    for (let index = 0; index < objectCount; index++) {
      offsets.push(readBinaryPlistInt(bytes, offsetTableOffset + index * offsetIntSize, offsetIntSize));
    }
    const seen = new Set<number>();
    return { valid: true, value: readBinaryPlistObject(bytes, offsets, topObject, objectRefSize, seen) };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Binary plist 解析失败。" };
  }
}

function readBinaryPlistObject(
  bytes: Uint8Array,
  offsets: number[],
  index: number,
  objectRefSize: number,
  seen: Set<number>
): PlistValue {
  const offset = offsets[index];
  if (offset === undefined || offset < 0 || offset >= bytes.length) {
    throw new Error(`Binary plist object #${index} 偏移异常。`);
  }
  if (seen.has(index)) {
    throw new Error(`Binary plist object #${index} 存在循环引用。`);
  }
  seen.add(index);

  const marker = bytes[offset];
  const type = marker >> 4;
  const info = marker & 0x0f;
  const payloadOffset = offset + 1;

  if (type === 0x0) {
    seen.delete(index);
    if (info === 0x8) return false;
    if (info === 0x9) return true;
    return null;
  }
  if (type === 0x1) {
    const value = readBinaryPlistInt(bytes, payloadOffset, 1 << info);
    seen.delete(index);
    return value;
  }
  if (type === 0x4) {
    const lengthInfo = readBinaryPlistLength(bytes, offset, info);
    const length = lengthInfo.length;
    const start = lengthInfo.offset;
    seen.delete(index);
    return bytes.slice(start, start + length);
  }
  if (type === 0x5 || type === 0x6) {
    const lengthInfo = readBinaryPlistLength(bytes, offset, info);
    const width = type === 0x6 ? 2 : 1;
    const data = bytes.slice(lengthInfo.offset, lengthInfo.offset + lengthInfo.length * width);
    seen.delete(index);
    return type === 0x6 ? decodeBinaryPlistUtf16Be(data) : new TextDecoder("utf-8", { fatal: false }).decode(data);
  }
  if (type === 0x3) {
    const seconds = readBinaryPlistFloat64(bytes, payloadOffset);
    seen.delete(index);
    return new Date(Date.UTC(2001, 0, 1) + seconds * 1000).toISOString();
  }
  if (type === 0xa || type === 0xc) {
    const lengthInfo = readBinaryPlistLength(bytes, offset, info);
    const values: PlistValue[] = [];
    for (let item = 0; item < lengthInfo.length; item++) {
      const ref = readBinaryPlistInt(bytes, lengthInfo.offset + item * objectRefSize, objectRefSize);
      values.push(readBinaryPlistObject(bytes, offsets, ref, objectRefSize, new Set(seen)));
    }
    seen.delete(index);
    return values;
  }
  if (type === 0xd) {
    const lengthInfo = readBinaryPlistLength(bytes, offset, info);
    const keyRefsStart = lengthInfo.offset;
    const valueRefsStart = keyRefsStart + lengthInfo.length * objectRefSize;
    const result: Record<string, PlistValue> = {};
    for (let item = 0; item < lengthInfo.length; item++) {
      const keyRef = readBinaryPlistInt(bytes, keyRefsStart + item * objectRefSize, objectRefSize);
      const valueRef = readBinaryPlistInt(bytes, valueRefsStart + item * objectRefSize, objectRefSize);
      const key = readBinaryPlistObject(bytes, offsets, keyRef, objectRefSize, new Set(seen));
      if (typeof key === "string") {
        result[key] = readBinaryPlistObject(bytes, offsets, valueRef, objectRefSize, new Set(seen));
      }
    }
    seen.delete(index);
    return result;
  }

  seen.delete(index);
  return null;
}

function readBinaryPlistLength(bytes: Uint8Array, objectOffset: number, info: number): { length: number; offset: number } {
  if (info < 0x0f) {
    return { length: info, offset: objectOffset + 1 };
  }
  const marker = bytes[objectOffset + 1];
  if ((marker >> 4) !== 0x1) {
    throw new Error("Binary plist extended length 缺少整数对象。");
  }
  const intSize = 1 << (marker & 0x0f);
  return {
    length: readBinaryPlistInt(bytes, objectOffset + 2, intSize),
    offset: objectOffset + 2 + intSize
  };
}

function readBinaryPlistInt(bytes: Uint8Array, offset: number, length: number): number {
  if (offset < 0 || offset + length > bytes.length || length <= 0 || length > 8) {
    throw new Error("Binary plist integer 超出文件范围。");
  }
  let value = 0;
  for (let index = 0; index < length; index++) {
    value = value * 256 + bytes[offset + index];
  }
  return value;
}

function readBinaryPlistFloat64(bytes: Uint8Array, offset: number): number {
  if (offset + 8 > bytes.length) {
    throw new Error("Binary plist date 超出文件范围。");
  }
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, false);
}

function decodeBinaryPlistUtf16Be(bytes: Uint8Array): string {
  let value = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
  }
  return value;
}

function decodeBase64Data(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) {
    return new Uint8Array();
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function createWebArchiveSnippet(value: PlistValue | undefined, mimeType?: string): string | undefined {
  if (!(value instanceof Uint8Array) || value.length === 0) {
    return undefined;
  }
  if (!mimeType || !/^(text\/|application\/(xhtml\+xml|xml|json)|image\/svg\+xml)/i.test(mimeType)) {
    return undefined;
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(value);
  return text.replace(/\s+/g, " ").trim().slice(0, 1600);
}

function isPlistDict(value: PlistValue | undefined): value is { [key: string]: PlistValue } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array);
}

function plistString(value: PlistValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) {
    return "";
  }
  return new TextDecoder("ascii").decode(bytes.slice(offset, offset + length));
}

type PostScriptPreview = {
  valid: boolean;
  error?: string;
  pdfCompatible?: boolean;
  pdfOffset?: number;
  format?: string;
  title?: string;
  creator?: string;
  creationDate?: string;
  pages?: string;
  boundingBox?: string;
  documentData?: string;
};

async function createPostScriptPreview(
  bytes: Uint8Array,
  url: string,
  fileName: string,
  size: { width: number; height: number },
  fit: string,
  toolbar?: { setZoom(value: number | undefined): void }
): Promise<{ element: HTMLElement; instance?: PreviewInstance; primaryRendered?: boolean }> {
  const parsed = parsePostScript(bytes);
  if (parsed.valid && parsed.pdfCompatible) {
    const embedded = await createPdfCompatibleAiPreview(bytes, url, fileName, size, fit, toolbar, parsed.pdfOffset || 0);
    return { element: embedded.element, instance: embedded.instance, primaryRendered: true };
  }

  const preview = document.createElement("div");
  preview.className = "ofv-data-preview";
  const heading = document.createElement("strong");
  heading.textContent = "PostScript 结构";
  preview.append(heading);

  if (!parsed.valid) {
    const error = document.createElement("p");
    error.className = "ofv-data-error";
    error.textContent = parsed.error || "不是有效的 PostScript/Illustrator 文档头。";
    preview.append(error);
    return { element: preview };
  }

  const summary = document.createElement("div");
  summary.className = "ofv-data-summary";
  appendMeta(summary, "格式", parsed.format || "PostScript");
  appendMeta(summary, "Title", parsed.title || "未声明");
  appendMeta(summary, "Creator", parsed.creator || "未声明");
  appendMeta(summary, "Pages", parsed.pages || "未知");
  appendMeta(summary, "BoundingBox", parsed.boundingBox || "未声明");
  appendMeta(summary, "Created", parsed.creationDate || "未声明");
  if (parsed.documentData) {
    appendMeta(summary, "Data", parsed.documentData);
  }
  preview.append(summary);
  return { element: preview };
}

async function createPdfCompatibleAiPreview(
  bytes: Uint8Array,
  url: string,
  fileName: string,
  size: { width: number; height: number },
  fit: string,
  toolbar?: { setZoom(value: number | undefined): void },
  pdfOffset = 0,
  zoom = 1
): Promise<{ element: HTMLElement; instance: PreviewInstance }> {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-ai-pdf-preview";
  let pdfUrl = url;
  let shouldRevokePdfUrl = false;
  if (pdfOffset > 0) {
    pdfUrl = createObjectUrl({ blob: new Blob([bytes.slice(pdfOffset)], { type: "application/pdf" }) });
    shouldRevokePdfUrl = true;
  }
  const instance = await renderPdfDocumentPreview({
    fileName,
    fileUrl: pdfUrl,
    viewport: wrapper,
    size,
    fit,
    zoom,
    toolbar,
    fallbackTitle: "AI PDF 兼容预览失败",
    revokeUrlOnDestroy: false
  });
  hideSuccessfulPdfCompatibleAiDiagnostics(wrapper);
  return {
    element: wrapper,
    instance: {
      canCommand(command) {
        return instance.canCommand(command);
      },
      command(command) {
        return instance.command(command);
      },
      resize(size) {
        instance.resize(size);
      },
      destroy() {
        instance.destroy();
        if (shouldRevokePdfUrl) {
          revokeObjectUrl(pdfUrl, false);
        }
      }
    }
  };
}

function hideSuccessfulPdfCompatibleAiDiagnostics(wrapper: HTMLElement): void {
  if (!wrapper.querySelector(".ofv-pdf-page-wrapper")) {
    return;
  }
  for (const element of wrapper.querySelectorAll<HTMLElement>(".ofv-pdf-summary")) {
    hideSupplementalInfo(element);
  }
}

function parsePostScript(bytes: Uint8Array): PostScriptPreview {
  const pdfOffset = findPdfHeaderOffset(bytes);
  const head = new TextDecoder("latin1").decode(bytes.slice(pdfOffset >= 0 ? pdfOffset : 0, Math.min(bytes.length, (pdfOffset >= 0 ? pdfOffset : 0) + 8192)));
  const firstLine = head.split(/\r?\n/, 1)[0] || "";
  const isPdfCompatible = firstLine.startsWith("%PDF-");
  const isPostScript = firstLine.startsWith("%!");
  if (!isPdfCompatible && !isPostScript) {
    return { valid: false, error: "缺少 PostScript %! 或 PDF-compatible %PDF 文件头。" };
  }

  const boundingBox = dscValue(head, "BoundingBox") || dscValue(head, "HiResBoundingBox");
  return {
    valid: true,
    pdfCompatible: isPdfCompatible,
    pdfOffset: isPdfCompatible ? Math.max(0, pdfOffset) : undefined,
    format: isPdfCompatible ? `PDF-compatible Illustrator (${firstLine.replace(/^%/, "")})` : firstLine.replace(/^%!/, "PostScript "),
    title: dscValue(head, "Title"),
    creator: dscValue(head, "Creator") || dscValue(head, "For"),
    creationDate: dscValue(head, "CreationDate"),
    pages: dscValue(head, "Pages"),
    boundingBox: normalizeBoundingBox(boundingBox),
    documentData: dscValue(head, "DocumentData")
  };
}

function findPdfHeaderOffset(bytes: Uint8Array): number {
  const max = Math.min(bytes.length - 4, 1024 * 1024);
  for (let index = 0; index <= max; index += 1) {
    if (bytes[index] === 0x25 && bytes[index + 1] === 0x50 && bytes[index + 2] === 0x44 && bytes[index + 3] === 0x46 && bytes[index + 4] === 0x2d) {
      return index;
    }
  }
  return -1;
}

function dscValue(text: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^%%${escaped}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim();
}

function normalizeBoundingBox(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.trim().split(/\s+/).map((part) => Number(part));
  if (parts.length < 4 || parts.some((part) => !Number.isFinite(part))) {
    return value;
  }
  const [x1, y1, x2, y2] = parts;
  return `${x1}, ${y1}, ${x2}, ${y2} (${Math.max(0, x2 - x1)} x ${Math.max(0, y2 - y1)} pt)`;
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

function shouldShowHexPreview(extension: string, hasPrimaryPreview = false): boolean {
  return !hasPrimaryPreview && !["ai", "eps", "ps"].includes(extension);
}

function hideSuccessfulSectionHeading(section: HTMLElement): void {
  const heading = section.querySelector<HTMLElement>("h3");
  if (heading) {
    hideSupplementalInfo(heading);
  }
}

function hideSuccessfulAssetDiagnostics(panel: HTMLElement): void {
  const hasPrimaryPreview = Boolean(
    panel.querySelector(
      ".ofv-ai-pdf-preview .ofv-pdf-page-wrapper, .ofv-psd-canvas, .ofv-font-preview, .ofv-wasm-preview, .ofv-sqlite-data, .ofv-parquet-records, .ofv-avro-records, .ofv-webarchive-snippet"
    )
  );
  if (!hasPrimaryPreview) {
    return;
  }
  for (const element of panel.querySelectorAll<HTMLElement>(
    ".ofv-section > h3, .ofv-asset-summary, .ofv-asset-download, .ofv-asset-hex, .ofv-data-preview, .ofv-pdf-summary"
  )) {
    hideSupplementalInfo(element);
  }
}

function hideSupplementalInfo(element: HTMLElement): void {
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.style.display = "none";
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
