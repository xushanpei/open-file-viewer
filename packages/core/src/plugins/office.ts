import JSZip from "jszip";
import type { WorkBook } from "xlsx";
import type { PreviewPlugin } from "../types";
import { createPanel, createSection, escapeHtml, readArrayBuffer } from "./utils";

const wordExtensions = new Set(["docx", "doc", "dotx", "dot", "rtf", "odt", "fodt", "wps"]);
const sheetExtensions = new Set(["xlsx", "xls", "xlsm", "xlsb", "csv", "tsv", "ods", "fods", "numbers", "et"]);
const presentationExtensions = new Set(["pptx", "ppt", "pps", "ppsx", "odp", "fodp", "key", "dps"]);

export function officePlugin(): PreviewPlugin {
  return {
    name: "office",
    match(file) {
      return (
        wordExtensions.has(file.extension) ||
        sheetExtensions.has(file.extension) ||
        presentationExtensions.has(file.extension)
      );
    },
    async render(ctx) {
      const panel = createPanel("ofv-office");
      ctx.viewport.append(panel);

      if (fileIsDocx(ctx.file.extension)) {
        await renderDocx(panel, await readArrayBuffer(ctx.file));
      } else if (ctx.file.extension === "rtf") {
        renderPlainDocument(panel, "RTF 文档", rtfToText(await readTextFromBuffer(await readArrayBuffer(ctx.file))));
      } else if (ctx.file.extension === "odt") {
        await renderOdt(panel, await readArrayBuffer(ctx.file));
      } else if (ctx.file.extension === "fodt") {
        renderOpenDocumentXml(panel, "FODT 文档", await readTextFromBuffer(await readArrayBuffer(ctx.file)));
      } else if (sheetExtensions.has(ctx.file.extension)) {
        await renderSheet(panel, await readArrayBuffer(ctx.file), ctx.file.extension);
      } else if (ctx.file.extension === "pptx" || ctx.file.extension === "ppsx") {
        await renderPptx(panel, await readArrayBuffer(ctx.file));
      } else if (ctx.file.extension === "odp") {
        await renderOdp(panel, await readArrayBuffer(ctx.file));
      } else if (ctx.file.extension === "fodp") {
        renderOpenDocumentPresentationXml(panel, await readTextFromBuffer(await readArrayBuffer(ctx.file)));
      } else {
        renderUnsupportedOffice(panel, ctx.file.extension);
      }

      return {
        destroy() {
          panel.remove();
        }
      };
    }
  };
}

function fileIsDocx(extension: string): boolean {
  return extension === "docx" || extension === "dotx";
}

async function renderDocx(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => ({
        src: `data:${image.contentType};base64,${await image.read("base64")}`
      }))
    }
  );
  const section = createSection("Word 文档");
  const content = document.createElement("article");
  content.className = "ofv-document";
  content.innerHTML = result.value || "<p>未解析到可展示内容。</p>";
  section.append(content);

  if (result.messages.length > 0) {
    const notes = document.createElement("details");
    notes.className = "ofv-details";
    notes.innerHTML = `<summary>解析提示 ${result.messages.length}</summary>`;
    const list = document.createElement("ul");
    for (const message of result.messages) {
      const item = document.createElement("li");
      item.textContent = message.message;
      list.append(item);
    }
    notes.append(list);
    section.append(notes);
  }

  panel.append(section);

  const zip = await JSZip.loadAsync(arrayBuffer);
  await Promise.all([
    renderDocxSupplement(panel, zip, /^word\/header\d*\.xml$/, "页眉"),
    renderDocxSupplement(panel, zip, /^word\/footer\d*\.xml$/, "页脚"),
    renderDocxSupplement(panel, zip, /^word\/comments\d*\.xml$/, "批注")
  ]);
}

async function renderDocxSupplement(
  panel: HTMLElement,
  zip: JSZip,
  pattern: RegExp,
  title: string
): Promise<void> {
  const entries = Object.values(zip.files).filter((entry) => pattern.test(entry.name));
  const fragments: string[] = [];
  for (const entry of entries) {
    const xml = await entry.async("text");
    fragments.push(...extractOpenXmlText(xml));
  }
  if (fragments.length === 0) {
    return;
  }
  const section = createSection(`Word ${title}`);
  const content = document.createElement("div");
  content.className = "ofv-document-extra";
  content.textContent = fragments.join("\n");
  section.append(content);
  panel.append(section);
}

async function renderOdt(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const content = zip.file("content.xml");
  if (!content) {
    renderPlainDocument(panel, "ODT 文档", "未找到 content.xml。");
    return;
  }
  renderOpenDocumentXml(panel, "ODT 文档", await content.async("text"));
}

function renderOpenDocumentXml(panel: HTMLElement, title: string, xml: string): void {
  const section = createSection(title);
  const article = document.createElement("article");
  article.className = "ofv-document";
  const blocks = extractOpenDocumentBlocks(xml);
  article.innerHTML =
    blocks.length > 0
      ? blocks.map((block) => `<p>${escapeHtml(block)}</p>`).join("")
      : "<p>未提取到可展示文本。</p>";
  section.append(article);
  panel.append(section);
}

function renderPlainDocument(panel: HTMLElement, title: string, text: string): void {
  const section = createSection(title);
  const pre = document.createElement("pre");
  pre.className = "ofv-text-block";
  pre.textContent = text || "未提取到可展示文本。";
  section.append(pre);
  panel.append(section);
}

async function renderSheet(
  panel: HTMLElement,
  arrayBuffer: ArrayBuffer,
  extension: string
): Promise<void> {
  const xlsx = await import("xlsx");
  const workbook = xlsx.read(arrayBuffer, { type: "array" }) as WorkBook;
  const tabs = document.createElement("div");
  tabs.className = "ofv-tabs";
  const content = document.createElement("div");
  content.className = "ofv-sheet";

  const renderSheetByName = (sheetName: string) => {
    content.replaceChildren();
    const heading = document.createElement("h3");
    heading.textContent = sheetName;
    const sheet = workbook.Sheets[sheetName];
    const html = xlsx.utils.sheet_to_html(sheet, { id: `ofv-sheet-${sheetName}` });
    const tableWrapper = document.createElement("div");
    tableWrapper.className = "ofv-table-scroll";
    tableWrapper.innerHTML = html;
    content.append(heading, tableWrapper);
  };

  if (workbook.SheetNames.length === 0) {
    content.textContent = extension === "numbers" ? "Numbers 文件需要服务端转换后高保真预览。" : "未解析到表格。";
  } else {
    for (const [index, sheetName] of workbook.SheetNames.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = sheetName;
      button.addEventListener("click", () => renderSheetByName(sheetName));
      tabs.append(button);
      if (index === 0) {
        renderSheetByName(sheetName);
      }
    }
  }

  panel.append(tabs, content);
}

async function renderPptx(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideSize = await readPptxSlideSize(zip);
  const slideEntries = Object.values(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (slideEntries.length === 0) {
    panel.textContent = "未解析到 PPTX 幻灯片内容。";
    return;
  }

  for (const [index, entry] of slideEntries.entries()) {
    const xml = await entry.async("text");
    const relationships = await readPptxRelationships(zip, entry.name);
    const elements = await extractPptxSlideElements(zip, xml, relationships, slideSize);
    const slide = createSection(`Slide ${index + 1}`);
    const body = document.createElement("div");
    body.className = "ofv-slide ofv-slide-stage";
    body.style.aspectRatio = `${slideSize.width} / ${slideSize.height}`;
    if (elements.length === 0) {
      body.innerHTML = "<p>这一页没有可提取内容。</p>";
    } else {
      for (const element of elements) {
        body.append(renderPptxSlideElement(element, slideSize));
      }
    }
    slide.append(body);
    panel.append(slide);
  }
}

async function renderOdp(panel: HTMLElement, arrayBuffer: ArrayBuffer): Promise<void> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const content = zip.file("content.xml");
  if (!content) {
    panel.textContent = "未解析到 ODP 内容。";
    return;
  }
  const xml = await content.async("text");
  const images = await extractZipImages(zip, /^Pictures\//);
  renderOpenDocumentPresentation(panel, "ODP 演示文稿", xml, images);
}

function renderOpenDocumentPresentationXml(panel: HTMLElement, xml: string): void {
  renderOpenDocumentPresentation(panel, "FODP 演示文稿", xml, []);
}

function renderOpenDocumentPresentation(
  panel: HTMLElement,
  title: string,
  xml: string,
  images: Array<{ name: string; src: string }>
): void {
  const pages = xml.split(/<draw:page\b/).slice(1);
  const pageSources = pages.length > 0 ? pages : [xml];
  for (const [index, pageXml] of pageSources.entries()) {
    const section = createSection(`${title} ${index + 1}`);
    const body = document.createElement("div");
    body.className = "ofv-slide";
    const texts = extractOpenDocumentBlocks(pageXml);
    const textHtml =
      texts.length > 0 ? texts.map((text) => `<p>${escapeHtml(text)}</p>`).join("") : "<p>这一页没有可提取文本。</p>";
    const imageHtml = images
      .slice(index === 0 ? 0 : images.length, index === 0 ? images.length : images.length)
      .map(
        (image) =>
          `<figure class="ofv-slide-image"><img src="${image.src}" alt="${escapeHtml(image.name)}" /><figcaption>${escapeHtml(image.name)}</figcaption></figure>`
      )
      .join("");
    body.innerHTML = `${textHtml}${imageHtml}`;
    section.append(body);
    panel.append(section);
  }
}

function renderUnsupportedOffice(panel: HTMLElement, extension: string): void {
  const legacyBinary = new Set(["doc", "dot", "wps", "ppt", "pps", "key", "dps"]);
  const message = legacyBinary.has(extension)
    ? "该格式属于老二进制或专有格式，浏览器内无法可靠解析；建议接入 LibreOffice/OnlyOffice 服务端转换为 PDF/HTML 后预览。"
    : "该格式通常需要服务端转换或专用解析器才能高保真预览。";
  panel.innerHTML = `
    <section class="ofv-section">
      <h3>Office 基础预览</h3>
      <p><strong>.${escapeHtml(extension)}</strong> 已进入 Office 插件。${message}</p>
      <p>当前版本优先支持 docx、rtf、odt/fodt、xlsx/xls/csv/ods、pptx/ppsx、odp/fodp 的基础内容预览。</p>
    </section>
  `;
}

interface PptxSlideSize {
  width: number;
  height: number;
}

interface PptxElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type PptxSlideElement =
  | {
      type: "text";
      text: string;
      box: PptxElementBox;
    }
  | {
      type: "image";
      name: string;
      src: string;
      box: PptxElementBox;
    };

async function readPptxSlideSize(zip: JSZip): Promise<PptxSlideSize> {
  const presentation = zip.file("ppt/presentation.xml");
  if (!presentation) {
    return { width: 9144000, height: 5143500 };
  }
  const xml = await presentation.async("text");
  const match = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xml);
  return {
    width: Number(match?.[1] || 9144000),
    height: Number(match?.[2] || 5143500)
  };
}

async function readPptxRelationships(zip: JSZip, slidePath: string): Promise<Map<string, string>> {
  const relsPath = slidePath.replace("ppt/slides/", "ppt/slides/_rels/") + ".rels";
  const rels = zip.file(relsPath);
  const relationships = new Map<string, string>();
  if (!rels) {
    return relationships;
  }
  const relsXml = await rels.async("text");
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = match[1] || "";
    const id = /Id="([^"]+)"/.exec(attrs)?.[1];
    const target = /Target="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) {
      relationships.set(id, normalizeZipPath("ppt/slides", target));
    }
  }
  return relationships;
}

async function extractPptxSlideElements(
  zip: JSZip,
  xml: string,
  relationships: Map<string, string>,
  slideSize: PptxSlideSize
): Promise<PptxSlideElement[]> {
  const elements: PptxSlideElement[] = [];
  for (const match of xml.matchAll(/<p:(sp|pic)\b[\s\S]*?<\/p:\1>/g)) {
    const type = match[1];
    const source = match[0];
    const box = parsePptxBox(source) || defaultPptxBox(elements.length, slideSize);
    if (type === "sp") {
      const text = extractOpenXmlText(source).join("\n");
      if (text.trim()) {
        elements.push({ type: "text", text, box });
      }
      continue;
    }

    const embedId = /r:embed="([^"]+)"/.exec(source)?.[1];
    const imagePath = embedId ? relationships.get(embedId) : undefined;
    const entry = imagePath ? zip.file(imagePath) : undefined;
    if (!entry) {
      continue;
    }
    elements.push({
      type: "image",
      name: entry.name.split("/").pop() || entry.name,
      src: `data:${mimeTypeFromPath(entry.name)};base64,${await entry.async("base64")}`,
      box
    });
  }
  return elements;
}

function renderPptxSlideElement(element: PptxSlideElement, slideSize: PptxSlideSize): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `ofv-slide-element ${element.type === "image" ? "ofv-slide-picture" : "ofv-slide-text"}`;
  wrapper.style.left = `${(element.box.x / slideSize.width) * 100}%`;
  wrapper.style.top = `${(element.box.y / slideSize.height) * 100}%`;
  wrapper.style.width = `${(element.box.width / slideSize.width) * 100}%`;
  wrapper.style.height = `${(element.box.height / slideSize.height) * 100}%`;

  if (element.type === "text") {
    wrapper.textContent = element.text;
  } else {
    const image = document.createElement("img");
    image.src = element.src;
    image.alt = element.name;
    wrapper.append(image);
  }
  return wrapper;
}

function parsePptxBox(source: string): PptxElementBox | undefined {
  const xfrm = /<a:xfrm\b[\s\S]*?<\/a:xfrm>/.exec(source)?.[0];
  if (!xfrm) {
    return undefined;
  }
  const offset = /<a:off[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(xfrm);
  const extent = /<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xfrm);
  if (!offset || !extent) {
    return undefined;
  }
  return {
    x: Number(offset[1]),
    y: Number(offset[2]),
    width: Number(extent[1]),
    height: Number(extent[2])
  };
}

function defaultPptxBox(index: number, slideSize: PptxSlideSize): PptxElementBox {
  return {
    x: slideSize.width * 0.08,
    y: slideSize.height * (0.08 + index * 0.12),
    width: slideSize.width * 0.84,
    height: slideSize.height * 0.1
  };
}

async function extractZipImages(
  zip: JSZip,
  pattern: RegExp
): Promise<Array<{ name: string; src: string }>> {
  const images: Array<{ name: string; src: string }> = [];
  for (const entry of Object.values(zip.files).filter((item) => !item.dir && pattern.test(item.name))) {
    const mimeType = mimeTypeFromPath(entry.name);
    if (!mimeType.startsWith("image/")) {
      continue;
    }
    images.push({
      name: entry.name.split("/").pop() || entry.name,
      src: `data:${mimeType};base64,${await entry.async("base64")}`
    });
  }
  return images;
}

function extractOpenXmlText(xml: string): string[] {
  return [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1] || match[2] || "").trim())
    .filter(Boolean);
}

function extractOpenDocumentBlocks(xml: string): string[] {
  return [...xml.matchAll(/<(?:text:p|text:h)[^>]*>([\s\S]*?)<\/(?:text:p|text:h)>/g)]
    .map((match) => stripXmlTags(match[1] || ""))
    .map((text) => decodeXml(text).trim())
    .filter(Boolean);
}

function stripXmlTags(value: string): string {
  return value
    .replace(/<text:line-break\s*\/>/g, "\n")
    .replace(/<text:tab\s*\/>/g, "\t")
    .replace(/<[^>]+>/g, "");
}

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\[a-zA-Z]+\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function readTextFromBuffer(arrayBuffer: ArrayBuffer): Promise<string> {
  return new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer);
}

function normalizeZipPath(base: string, target: string): string {
  if (target.startsWith("/")) {
    return target.slice(1);
  }
  const parts = `${base}/${target}`.split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      normalized.pop();
    } else {
      normalized.push(part);
    }
  }
  return normalized.join("/");
}

function mimeTypeFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    webp: "image/webp"
  };
  return extension ? map[extension] || "application/octet-stream" : "application/octet-stream";
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}
