import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { assetPlugin } from "./asset";

vi.mock("ag-psd", () => ({
  readPsd: vi.fn()
}));

describe("assetPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders font asset metadata and download fallback", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:font";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: minimalSfntFont(),
      fileName: "brand.ttf",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-asset")));

    expect(container.textContent).toContain("字体文件预览");
    expect(container.textContent).toContain("brand.ttf");
    expect(container.textContent).toContain(".ttf");
    expect(container.textContent).toContain("字体样张");
    expect(container.textContent).toContain("Open File Viewer 预览 1234567890");
    expect(container.textContent).toContain("FontFace");
    expect(container.textContent).toContain("字体结构");
    expect(container.textContent).toContain("TrueType");
    expect(container.textContent).toContain("表数量1");
    expect(container.textContent).toContain("Full name");
    expect(container.textContent).toContain("Open File Viewer Test");
    expect(container.textContent).toContain("Version 1.000");
    expect(container.textContent).toContain("name");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-asset-download")?.href).toBe(objectUrl);

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);
  });

  it("renders WOFF table directory metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalWoffFont(),
      fileName: "brand.woff",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-font-info")));

    expect(container.textContent).toContain("容器WOFF");
    expect(container.textContent).toContain("FlavorTrueType");
    expect(container.textContent).toContain("展开大小");
    expect(container.textContent).toContain("Open File Viewer Test");
    expect(container.textContent).toContain("Tables");
    expect(container.textContent).toContain("Compressed");

    viewer.destroy();
  });

  it("renders WOFF2 container metadata and table directory", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalWoff2Font(),
      fileName: "brand.woff2",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-font-info")));

    expect(container.textContent).toContain("容器WOFF2");
    expect(container.textContent).toContain("FlavorTrueType");
    expect(container.textContent).toContain("表数量2");
    expect(container.textContent).toContain("压缩数据0 B");
    expect(container.textContent).toContain("head");
    expect(container.textContent).toContain("name");
    expect(container.textContent).toContain("Brotli 解压");

    viewer.destroy();
  });

  it("renders EOT container metadata and embedded sfnt tables", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalEotFont(),
      fileName: "brand.eot",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-font-info")));

    expect(container.textContent).toContain("容器EOT");
    expect(container.textContent).toContain("FlavorTrueType");
    expect(container.textContent).toContain("EOT 大小");
    expect(container.textContent).toContain("Weight400");
    expect(container.textContent).toContain("sfnt 偏移0x");
    expect(container.textContent).toContain("Open File Viewer Test");
    expect(container.textContent).toContain("name");

    viewer.destroy();
  });

  it("loads font samples with FontFace when supported", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const loadedFonts: unknown[] = [];
    const load = vi.fn(async function load(this: unknown) {
      return this;
    });
    const FontFaceMock = vi.fn(function FontFace(this: unknown) {
      Object.assign(this as object, { load });
    });
    vi.stubGlobal("FontFace", FontFaceMock);
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        add(font: unknown) {
          loadedFonts.push(font);
        }
      }
    });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fontface"),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["font"], { type: "font/woff2" }),
      fileName: "brand.woff2",
      plugins: [assetPlugin()]
    });

    await waitFor(() => container.textContent?.includes("已使用浏览器 FontFace API 加载字体样张。") || false);

    expect(FontFaceMock).toHaveBeenCalledWith(expect.stringContaining("brand-woff2"), 'url("blob:fontface") format("woff2")');
    expect(load).toHaveBeenCalledTimes(1);
    expect(loadedFonts).toHaveLength(1);
    expect(container.querySelector<HTMLElement>(".ofv-font-sample")?.style.fontFamily).toContain("ofv-brand-woff2");

    viewer.destroy();
  });

  it("renders SQLite header metadata and schema entries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalSqliteDatabase(),
      fileName: "data.sqlite",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sqlite-preview")));

    expect(container.textContent).toContain("数据文件预览");
    expect(container.textContent).toContain(".sqlite");
    expect(container.textContent).toContain("SQLite 结构");
    expect(container.textContent).toContain("页大小512 B");
    expect(container.textContent).toContain("读写版本rollback / rollback");
    expect(container.textContent).toContain("编码UTF-8");
    expect(container.textContent).toContain("Schema 对象 1");
    expect(container.textContent).toContain("table");
    expect(container.textContent).toContain("users");
    expect(container.textContent).toContain("CREATE TABLE users");

    viewer.destroy();
  });

  it("shows a local SQLite parse error for invalid databases", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["not sqlite"], { type: "application/vnd.sqlite3" }),
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-sqlite-preview")));

    expect(container.textContent).toContain("文件太短，无法读取 SQLite 数据库头");

    viewer.destroy();
  });

  it("renders Parquet container footer metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalParquetFile(),
      fileName: "events.parquet",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-data-preview")));

    expect(container.textContent).toContain("Parquet 结构");
    expect(container.textContent).toContain("MagicPAR1");
    expect(container.textContent).toContain("Footer4 B");
    expect(container.textContent).toContain("Footer offset0x8");
    expect(container.textContent).toContain("数据区4 B");

    viewer.destroy();
  });

  it("shows a local Parquet parse error for invalid containers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["no parquet"]),
      fileName: "broken.parquet",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-data-preview")));

    expect(container.textContent).toContain("文件太短，无法读取 Parquet 头尾信息");

    viewer.destroy();
  });

  it("renders Avro container metadata and schema summaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalAvroFile(),
      fileName: "events.avro",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-data-preview")));

    expect(container.textContent).toContain("Avro 结构");
    expect(container.textContent).toContain("Codecnull");
    expect(container.textContent).toContain("Metadata2");
    expect(container.textContent).toContain("com.example.Event");
    expect(container.textContent).toContain("id: long");
    expect(container.textContent).toContain("name: string");
    expect(container.textContent).toContain("avro.schema");

    viewer.destroy();
  });

  it("shows a local Avro parse error for invalid containers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["not avro"]),
      fileName: "broken.avro",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-data-preview")));

    expect(container.textContent).toContain("缺少 Avro Object Container magic header");

    viewer.destroy();
  });

  it("renders XML WebArchive metadata and a safe main resource snippet", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalWebArchiveFile(),
      fileName: "page.webarchive",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-webarchive-preview")));

    expect(container.textContent).toContain("网页归档预览");
    expect(container.textContent).toContain("WebArchive 结构");
    expect(container.textContent).toContain("XML plist");
    expect(container.textContent).toContain("https://example.com/article");
    expect(container.textContent).toContain("text/html");
    expect(container.textContent).toContain("UTF-8");
    expect(container.textContent).toContain("主资源大小");
    expect(container.textContent).toContain("子资源2");
    expect(container.textContent).toContain("<html><body><h1>Hello WebArchive</h1></body></html>");

    viewer.destroy();
  });

  it("recognizes binary WebArchive plists without expanding them", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Uint8Array([0x62, 0x70, 0x6c, 0x69, 0x73, 0x74, 0x30, 0x30]).buffer,
      fileName: "page.webarchive",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-webarchive-preview")));

    expect(container.textContent).toContain("Binary plist");
    expect(container.textContent).toContain("需要 binary plist 解码器");

    viewer.destroy();
  });

  it("renders Illustrator/PostScript DSC metadata", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob([
        [
          "%!PS-Adobe-3.0 EPSF-3.0",
          "%%Title: Brand Mark",
          "%%Creator: Adobe Illustrator",
          "%%CreationDate: 2026-06-15",
          "%%Pages: 1",
          "%%BoundingBox: 0 0 320 180",
          "%%DocumentData: Clean7Bit",
          "%%EOF"
        ].join("\n")
      ]),
      fileName: "brand.eps",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-data-preview")));

    expect(container.textContent).toContain("PostScript 结构");
    expect(container.textContent).toContain("PostScript PS-Adobe-3.0 EPSF-3.0");
    expect(container.textContent).toContain("Brand Mark");
    expect(container.textContent).toContain("Adobe Illustrator");
    expect(container.textContent).toContain("0, 0, 320, 180 (320 x 180 pt)");
    expect(container.textContent).toContain("Clean7Bit");

    viewer.destroy();
  });

  it("recognizes PDF-compatible Illustrator headers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["%PDF-1.7\n%%Title: PDF AI\n%%Creator: Illustrator\n"]),
      fileName: "poster.ai",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-data-preview")));

    expect(container.textContent).toContain("PDF-compatible Illustrator (PDF-1.7)");
    expect(container.textContent).toContain("PDF AI");

    viewer.destroy();
  });

  it("shows a local PostScript parse error for invalid design files", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["not postscript"]),
      fileName: "broken.eps",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-data-preview")));

    expect(container.textContent).toContain("缺少 PostScript %! 或 PDF-compatible %PDF 文件头");

    viewer.destroy();
  });

  it("renders Photoshop documents as a direct composite preview", async () => {
    const { readPsd } = await import("ag-psd");
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    vi.mocked(readPsd).mockReturnValueOnce({
      width: 1920,
      height: 1080,
      channels: 4,
      bitsPerChannel: 8,
      colorMode: 3,
      canvas,
      children: [{}, { children: [{}] }]
    });

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: photoshopHeader({ width: 1920, height: 1080, channels: 4, depth: 8, colorMode: 3 }),
      fileName: "poster.psd",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-psd-preview")));

    expect(container.querySelector(".ofv-psd-canvas")).toBe(canvas);
    expect(container.textContent?.trim()).toBe("");
    expect(container.querySelector(".ofv-asset-summary")).toBeNull();
    expect(container.querySelector(".ofv-asset-download")).toBeNull();
    expect(container.querySelector(".ofv-asset-hex")).toBeNull();

    viewer.destroy();
  });

  it("recognizes PSB large document headers", async () => {
    const { readPsd } = await import("ag-psd");
    vi.mocked(readPsd).mockImplementationOnce(() => {
      throw new Error("unsupported large document composite");
    });

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: photoshopHeader({ version: 2, width: 32000, height: 18000, channels: 5, depth: 16, colorMode: 4 }),
      fileName: "large.psb",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-psd-preview")));

    expect(container.textContent).toContain("PSD 合成图解析失败：unsupported large document composite");
    expect(container.querySelector(".ofv-asset-summary")).toBeNull();
    expect(container.querySelector(".ofv-asset-hex")).toBeNull();

    viewer.destroy();
  });

  it("shows a local Photoshop parse error for invalid headers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["nope"], { type: "image/vnd.adobe.photoshop" }),
      fileName: "broken.psd",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-psd-preview")));

    expect(container.textContent).toContain("文件太短，无法读取 PSD/PSB 头信息");

    viewer.destroy();
  });

  it("renders WebAssembly module sections, imports, and exports", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: minimalWasmModule(),
      fileName: "module.wasm",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-wasm-preview")));

    expect(container.textContent).toContain("WebAssembly 文件预览");
    expect(container.textContent).toContain("WASM 结构");
    expect(container.textContent).toContain("版本1");
    expect(container.textContent).toContain("custom (name)");
    expect(container.textContent).toContain("import");
    expect(container.textContent).toContain("export");
    expect(container.textContent).toContain("env.log · function");
    expect(container.textContent).toContain("run · function #1");

    viewer.destroy();
  });

  it("shows a local WebAssembly parse error for invalid binaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Uint8Array([0x00, 0x61, 0x73]).buffer,
      fileName: "broken.wasm",
      plugins: [assetPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-wasm-preview")));

    expect(container.textContent).toContain("缺少 WebAssembly magic header");

    viewer.destroy();
  });
});

function minimalWasmModule(): ArrayBuffer {
  const bytes = [
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,
    ...wasmSection(1, [
      0x01,
      0x60,
      0x00,
      0x00
    ]),
    ...wasmSection(2, [
      0x01,
      ...wasmName("env"),
      ...wasmName("log"),
      0x00,
      0x00
    ]),
    ...wasmSection(3, [
      0x01,
      0x00
    ]),
    ...wasmSection(7, [
      0x01,
      ...wasmName("run"),
      0x00,
      0x01
    ]),
    ...wasmSection(10, [
      0x01,
      0x02,
      0x00,
      0x0b
    ]),
    ...wasmSection(0, [
      ...wasmName("name")
    ])
  ];
  return new Uint8Array(bytes).buffer;
}

function minimalSfntFont(): ArrayBuffer {
  const nameTable = minimalNameTable();
  const tableOffset = 28;
  const bytes = new Uint8Array(tableOffset + nameTable.length);
  const view = new DataView(bytes.buffer);
  bytes.set([0x00, 0x01, 0x00, 0x00], 0);
  view.setUint16(4, 1, false);
  view.setUint16(6, 16, false);
  view.setUint16(8, 0, false);
  view.setUint16(10, 0, false);
  bytes.set(new TextEncoder().encode("name"), 12);
  view.setUint32(16, 0, false);
  view.setUint32(20, tableOffset, false);
  view.setUint32(24, nameTable.length, false);
  bytes.set(nameTable, tableOffset);
  return bytes.buffer;
}

function minimalWoffFont(): ArrayBuffer {
  const nameTable = minimalNameTable();
  const tableOffset = 64;
  const bytes = new Uint8Array(tableOffset + nameTable.length);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("wOFF"), 0);
  bytes.set([0x00, 0x01, 0x00, 0x00], 4);
  view.setUint32(8, bytes.length, false);
  view.setUint16(12, 1, false);
  view.setUint16(14, 0, false);
  view.setUint32(16, 28 + nameTable.length, false);
  view.setUint16(20, 1, false);
  view.setUint16(22, 0, false);
  bytes.set(new TextEncoder().encode("name"), 44);
  view.setUint32(48, tableOffset, false);
  view.setUint32(52, nameTable.length, false);
  view.setUint32(56, nameTable.length, false);
  view.setUint32(60, 0, false);
  bytes.set(nameTable, tableOffset);
  return bytes.buffer;
}

function minimalWoff2Font(): ArrayBuffer {
  const bytes = new Uint8Array(52);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("wOF2"), 0);
  bytes.set([0x00, 0x01, 0x00, 0x00], 4);
  view.setUint32(8, bytes.length, false);
  view.setUint16(12, 2, false);
  view.setUint16(14, 0, false);
  view.setUint32(16, 128, false);
  view.setUint32(20, 0, false);
  view.setUint16(24, 1, false);
  view.setUint16(26, 0, false);
  view.setUint32(28, 0, false);
  view.setUint32(32, 0, false);
  view.setUint32(36, 0, false);
  view.setUint32(40, 0, false);
  view.setUint32(44, 0, false);
  bytes[48] = 1;
  bytes[49] = 54;
  bytes[50] = 5;
  bytes[51] = 90;
  return bytes.buffer;
}

function minimalEotFont(): ArrayBuffer {
  const sfnt = new Uint8Array(minimalSfntFont());
  const strings = [
    utf16LeNull("OFV Test"),
    utf16LeNull("Regular"),
    utf16LeNull("Version 1.000"),
    utf16LeNull("Open File Viewer Test"),
    new Uint8Array()
  ];
  const stringsLength = strings.reduce((sum, item, index) => sum + item.length + (index < 4 ? 4 : 2), 0);
  const sfntOffset = 68 + stringsLength + 4;
  const bytes = new Uint8Array(sfntOffset + sfnt.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length, true);
  view.setUint32(4, sfnt.length, true);
  view.setUint32(8, 0x00020001, true);
  view.setUint32(12, 0, true);
  bytes.set([2, 11, 6, 4, 2, 2, 2, 2, 2, 4], 16);
  bytes[26] = 1;
  bytes[27] = 0;
  view.setUint32(28, 400, true);
  let offset = 68;
  strings.forEach((value, index) => {
    if (index < 4) {
      view.setUint16(offset, 0, true);
      offset += 2;
    }
    view.setUint16(offset, value.length, true);
    offset += 2;
    bytes.set(value, offset);
    offset += value.length;
  });
  view.setUint32(offset, 0, true);
  bytes.set(sfnt, sfntOffset);
  return bytes.buffer;
}

function minimalNameTable(): Uint8Array {
  const records = [
    { id: 1, value: "OFV Test" },
    { id: 4, value: "Open File Viewer Test" },
    { id: 5, value: "Version 1.000" }
  ];
  const encoded = records.map((record) => ({
    ...record,
    bytes: utf16Be(record.value)
  }));
  const storageOffset = 6 + encoded.length * 12;
  const length = storageOffset + encoded.reduce((sum, record) => sum + record.bytes.length, 0);
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, false);
  view.setUint16(2, encoded.length, false);
  view.setUint16(4, storageOffset, false);
  let stringOffset = 0;
  encoded.forEach((record, index) => {
    const offset = 6 + index * 12;
    view.setUint16(offset, 3, false);
    view.setUint16(offset + 2, 1, false);
    view.setUint16(offset + 4, 0x0409, false);
    view.setUint16(offset + 6, record.id, false);
    view.setUint16(offset + 8, record.bytes.length, false);
    view.setUint16(offset + 10, stringOffset, false);
    bytes.set(record.bytes, storageOffset + stringOffset);
    stringOffset += record.bytes.length;
  });
  return bytes;
}

function utf16Be(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2);
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    bytes[index * 2] = (code >>> 8) & 0xff;
    bytes[index * 2 + 1] = code & 0xff;
  }
  return bytes;
}

function utf16LeNull(value: string): Uint8Array {
  const bytes = new Uint8Array((value.length + 1) * 2);
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    bytes[index * 2] = code & 0xff;
    bytes[index * 2 + 1] = (code >>> 8) & 0xff;
  }
  return bytes;
}

function photoshopHeader({
  version = 1,
  channels,
  height,
  width,
  depth,
  colorMode
}: {
  version?: number;
  channels: number;
  height: number;
  width: number;
  depth: number;
  colorMode: number;
}): ArrayBuffer {
  const buffer = new ArrayBuffer(26);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x38, 0x42, 0x50, 0x53], 0);
  const view = new DataView(buffer);
  view.setUint16(4, version, false);
  view.setUint16(12, channels, false);
  view.setUint32(14, height, false);
  view.setUint32(18, width, false);
  view.setUint16(22, depth, false);
  view.setUint16(24, colorMode, false);
  return buffer;
}

function minimalSqliteDatabase(): ArrayBuffer {
  const pageSize = 512;
  const bytes = new Uint8Array(pageSize);
  bytes.set(new TextEncoder().encode("SQLite format 3\0"), 0);
  bytes[16] = 0x02;
  bytes[17] = 0x00;
  bytes[18] = 0x01;
  bytes[19] = 0x01;
  bytes[20] = 0x00;
  bytes[21] = 0x40;
  bytes[22] = 0x20;
  bytes[23] = 0x20;
  setUint32(bytes, 28, 1);
  setUint32(bytes, 40, 1);
  setUint32(bytes, 56, 1);

  const record = sqliteRecord([
    { type: 23, value: "table" },
    { type: 23, value: "users" },
    { type: 23, value: "users" },
    { type: 1, value: 2 },
    { type: 13 + 2 * "CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT)".length, value: "CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT)" }
  ]);
  const cell = [...sqliteVarUint(record.length), ...sqliteVarUint(1), ...record];
  const cellOffset = pageSize - cell.length;
  bytes[100] = 0x0d;
  setUint16(bytes, 101, 0);
  setUint16(bytes, 103, 1);
  setUint16(bytes, 105, cellOffset);
  bytes[107] = 0;
  setUint16(bytes, 108, cellOffset);
  bytes.set(cell, cellOffset);
  return bytes.buffer;
}

function minimalParquetFile(): ArrayBuffer {
  return new Uint8Array([
    0x50, 0x41, 0x52, 0x31,
    0xde, 0xad, 0xbe, 0xef,
    0x01, 0x02, 0x03, 0x04,
    0x04, 0x00, 0x00, 0x00,
    0x50, 0x41, 0x52, 0x31
  ]).buffer;
}

function minimalAvroFile(): ArrayBuffer {
  const schema = JSON.stringify({
    type: "record",
    namespace: "com.example",
    name: "Event",
    fields: [
      { name: "id", type: "long" },
      { name: "name", type: "string" }
    ]
  });
  const metadata = [
    { key: "avro.schema", value: schema },
    { key: "avro.codec", value: "null" }
  ];
  const bytes = [
    0x4f, 0x62, 0x6a, 0x01,
    ...avroLong(metadata.length),
    ...metadata.flatMap((item) => [...avroBytes(item.key), ...avroBytes(item.value)]),
    ...avroLong(0),
    ...Array.from({ length: 16 }, (_, index) => index)
  ];
  return new Uint8Array(bytes).buffer;
}

function minimalWebArchiveFile(): Blob {
  const mainHtml = "<html><body><h1>Hello WebArchive</h1></body></html>";
  const mainData = btoa(mainHtml);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>WebMainResource</key>
  <dict>
    <key>WebResourceURL</key>
    <string>https://example.com/article</string>
    <key>WebResourceMIMEType</key>
    <string>text/html</string>
    <key>WebResourceTextEncodingName</key>
    <string>UTF-8</string>
    <key>WebResourceData</key>
    <data>${mainData}</data>
  </dict>
  <key>WebSubresources</key>
  <array>
    <dict><key>WebResourceURL</key><string>https://example.com/style.css</string></dict>
    <dict><key>WebResourceURL</key><string>https://example.com/app.js</string></dict>
  </array>
</dict>
</plist>`;
  return new Blob([xml], { type: "application/x-webarchive" });
}

function avroBytes(value: string): number[] {
  const encoded = new TextEncoder().encode(value);
  return [...avroLong(encoded.length), ...encoded];
}

function avroLong(value: number): number[] {
  let next = (value << 1) ^ (value >> 31);
  const bytes: number[] = [];
  while ((next & ~0x7f) !== 0) {
    bytes.push((next & 0x7f) | 0x80);
    next >>>= 7;
  }
  bytes.push(next);
  return bytes;
}

function sqliteRecord(values: Array<{ type: number; value: string | number }>): number[] {
  const serialTypes = values.map((item) => sqliteVarUint(item.type)).flat();
  const headerSize = sqliteVarUint(1 + serialTypes.length);
  const body = values.map((item) => sqliteRecordValue(item)).flat();
  return [...headerSize, ...serialTypes, ...body];
}

function sqliteRecordValue(item: { type: number; value: string | number }): number[] {
  if (typeof item.value === "number") {
    return [item.value & 0xff];
  }
  return [...new TextEncoder().encode(item.value)];
}

function sqliteVarUint(value: number): number[] {
  if (value <= 0x7f) {
    return [value];
  }
  const bytes: number[] = [];
  const stack: number[] = [value & 0x7f];
  value >>>= 7;
  while (value > 0) {
    stack.push(0x80 | (value & 0x7f));
    value >>>= 7;
  }
  while (stack.length > 0) {
    bytes.push(stack.pop() as number);
  }
  return bytes;
}

function setUint16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function setUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function wasmSection(id: number, payload: number[]): number[] {
  return [id, ...wasmVarUint(payload.length), ...payload];
}

function wasmName(value: string): number[] {
  const encoded = new TextEncoder().encode(value);
  return [...wasmVarUint(encoded.length), ...encoded];
}

function wasmVarUint(value: number): number[] {
  const bytes: number[] = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (value !== 0);
  return bytes;
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
