import { describe, expect, it } from "vitest";
import { CFB } from "xlsx";
import { parseLegacyWordDocument, renderLegacyWordDocument } from "./msdoc";

// Generated documents keep regression coverage independent of private user files.
function wordFile(images: Uint8Array[], text = ""): ArrayBuffer {
  const cfb = CFB.utils.cfb_new();
  const word = new Uint8Array(512 + text.length * 2);
  const view = new DataView(word.buffer);
  view.setUint16(0, 0xa5ec, true);
  view.setUint16(10, 0x1000, true);
  view.setUint32(24, 512, true);
  view.setUint32(28, word.length, true);
  for (let i = 0; i < text.length; i++) view.setUint16(512 + i * 2, text.charCodeAt(i), true);
  CFB.utils.cfb_add(cfb, "WordDocument", word);
  CFB.utils.cfb_add(cfb, "0Table", new Uint8Array(16));
  CFB.utils.cfb_add(cfb, "Data", Buffer.concat(images));
  const bytes = Uint8Array.from(CFB.write(cfb, { type: "buffer" }));
  return bytes.buffer;
}

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64"));

describe("legacy Word embedded images", () => {
  it("renders an image-only document without requiring body paragraphs", () => {
    const model = parseLegacyWordDocument(wordFile([png]));
    expect(model.paragraphs).toEqual([]);
    expect(model.assets).toHaveLength(1);
    const panel = document.createElement("div");
    renderLegacyWordDocument(panel, model);
    expect(panel.querySelectorAll(".ofv-msdoc-page")).toHaveLength(1);
    expect(panel.querySelector("img")?.src).toBe(`data:image/png;base64,${Buffer.from(png).toString("base64")}`);
  });

  it("keeps body text and displays recovered images", () => {
    const model = parseLegacyWordDocument(wordFile([png], "Photo caption\r"));
    const panel = document.createElement("div");
    renderLegacyWordDocument(panel, model);
    expect(panel.textContent).toContain("Photo caption");
    expect(panel.querySelectorAll(".ofv-msdoc-page")).toHaveLength(1);
    const page = panel.querySelector(".ofv-msdoc-page")!;
    expect(page.textContent).toContain("Photo caption");
    expect(page.querySelector(".ofv-msdoc-body-image")).not.toBeNull();
    expect(panel.querySelectorAll(".ofv-msdoc-body-image")).toHaveLength(1);
  });

  it("deduplicates identical bytes without dropping different images of equal length", () => {
    // A second PNG-shaped payload with equal length exercises the old size-only key.
    const different = png.slice();
    different[45] ^= 1;
    const model = parseLegacyWordDocument(wordFile([png, different, png]));
    expect(model.assets).toHaveLength(2);
    const panel = document.createElement("div");
    renderLegacyWordDocument(panel, model);
    expect(panel.querySelectorAll("img")).toHaveLength(2);
  });

  it("still rejects documents with neither readable text nor images", () => {
    expect(() => parseLegacyWordDocument(wordFile([]))).toThrow("未解析到可显示的正文段落");
  });
});

// Minimal FIB + piece table + CHPX FKP + PICF, generated rather than copying a
// user's document. Each picture character refers to the same Data record.
function inlineWordFile(text = "test\u0001\r", compressed = false, invalidPicture = false): ArrayBuffer {
  const word = new Uint8Array(4096);
  const view = new DataView(word.buffer);
  const table = new Uint8Array(53);
  const tv = new DataView(table.buffer);
  view.setUint16(0, 0xa5ec, true);
  view.setUint16(10, 0x1000, true);
  view.setUint32(24, 512, true);
  view.setUint32(28, 512 + text.length * (compressed ? 1 : 2), true);
  view.setUint16(32, 14, true);
  view.setUint16(62, 22, true);
  view.setInt32(76, text.length, true);
  view.setUint16(152, 34, true);
  for (const [index, offset, length] of [[12, 0, 12], [33, 12, 21], [6, 33, 20]]) {
    view.setUint32(154 + index * 8, offset, true);
    view.setUint32(158 + index * 8, length, true);
  }
  for (let i = 0; i < text.length; i++) {
    if (compressed) word[512 + i] = text.charCodeAt(i);
    else view.setUint16(512 + i * 2, text.charCodeAt(i), true);
  }
  tv.setUint32(0, 512, true);
  tv.setUint32(4, view.getUint32(28, true), true);
  tv.setUint32(8, 2, true); // CHPX page 2
  table[12] = 2;
  tv.setUint32(13, 16, true);
  tv.setUint32(21, text.length, true);
  tv.setUint32(27, compressed ? 0x40000400 : 512, true);
  tv.setUint32(37, text.length, true);
  tv.setUint32(43, 2048, true); // SED.fcSepx
  const section = Uint8Array.from([0x1f, 0xb0, 0x82, 0x2e, 0x20, 0xb0, 0xc6, 0x41,
    0x21, 0xb0, 0x08, 0x07, 0x22, 0xb0, 0x08, 0x07, 0x23, 0x90, 0xa0, 0x05, 0x24, 0x90, 0xa0, 0x05]);
  view.setUint16(2048, section.length, true);
  word.set(section, 2050);
  word[1535] = text.length;
  let propertyOffset = 510;
  for (let i = 0; i < text.length; i++) {
    view.setUint32(1024 + i * 4, 512 + i * (compressed ? 1 : 2), true);
    const props = text[i] === "\u0001"
      ? [0x03, 0x6a, ...(invalidPicture ? [255, 255, 255, 127] : [0, 0, 0, 0]), 0x55, 0x08, 1]
      : [0x35, 0x08, 1, 0x43, 0x4a, 21, 0];
    propertyOffset = (propertyOffset - props.length - 1) & ~1;
    word[1024 + (text.length + 1) * 4 + i] = propertyOffset / 2;
    word[1024 + propertyOffset] = props.length;
    word.set(props, 1024 + propertyOffset + 1);
  }
  view.setUint32(1024 + text.length * 4, view.getUint32(28, true), true);
  const data = new Uint8Array(68 + png.length);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, data.length, true);
  dv.setUint16(4, 68, true);
  dv.setUint16(6, 100, true);
  dv.setInt16(28, 14120, true);
  dv.setInt16(30, 12640, true);
  dv.setUint16(32, 500, true);
  dv.setUint16(34, 500, true);
  data.set(png, 68);
  const cfb = CFB.utils.cfb_new();
  for (const [name, bytes] of [["WordDocument", word], ["0Table", table], ["Data", data]]) CFB.utils.cfb_add(cfb, name, bytes);
  return Uint8Array.from(CFB.write(cfb, { type: "buffer" })).buffer;
}

describe("legacy Word inline picture layout", () => {
  it.each([false, true])("keeps a picture on the text baseline with stored scaling (compressed=%s)", (compressed) => {
    const model = parseLegacyWordDocument(inlineWordFile("test\u0001\r", compressed));
    const panel = document.createElement("div");
    renderLegacyWordDocument(panel, model);
    expect(model.blocks[0].type).toBe("paragraph");
    expect(panel.querySelector(".ofv-msdoc-title")).toBeNull();
    const paragraph = panel.querySelector(".ofv-msdoc-inline-paragraph")!;
    expect(paragraph.children[0].textContent).toBe("test");
    expect((paragraph.children[0] as HTMLElement).style.fontWeight).toBe("700");
    expect((paragraph.children[0] as HTMLElement).style.fontSize).toContain("10.5pt");
    const image = paragraph.children[1] as HTMLImageElement;
    expect(image.tagName).toBe("IMG");
    expect(image.style.width).toContain("470.666");
    expect(image.style.height).toContain("421.333");
    expect(panel.querySelectorAll("img")).toHaveLength(1);
    expect(model.layout.pageGeometry).toMatchObject({ left: 120, right: 120, top: 96, bottom: 96 });
    expect(panel.querySelector<HTMLElement>(".ofv-msdoc-page")?.style.padding).toContain("120px");
  });

  it("preserves repeated references and picture-only paragraphs in source order", () => {
    const model = parseLegacyWordDocument(inlineWordFile("\u0001\rAfter\u0001\r"));
    const panel = document.createElement("div");
    renderLegacyWordDocument(panel, model);
    const paragraphs = panel.querySelectorAll(".ofv-msdoc-inline-paragraph");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].firstElementChild?.tagName).toBe("IMG");
    expect(paragraphs[1].firstElementChild?.textContent).toBe("After");
    expect(panel.querySelectorAll("img")).toHaveLength(2);
    expect(model.assets).toHaveLength(1);
  });

  it("falls back safely when a picture reference points outside the Data stream", () => {
    const model = parseLegacyWordDocument(inlineWordFile("test\u0001\r", false, true));
    const panel = document.createElement("div");
    renderLegacyWordDocument(panel, model);
    expect(panel.textContent).toContain("test");
    expect(panel.querySelectorAll(".ofv-msdoc-body-image")).toHaveLength(1);
    expect(panel.querySelector(".ofv-msdoc-inline-image")).toBeNull();
  });
});
