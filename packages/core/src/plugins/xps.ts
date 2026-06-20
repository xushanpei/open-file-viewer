import JSZip from "jszip";
import type { PreviewCommand, PreviewContext, PreviewPlugin } from "../types";
import { createPanel, createSection, readArrayBuffer } from "./utils";

const xpsMimeTypes = new Set([
  "application/oxps",
  "application/vnd.ms-xpsdocument"
]);

export function xpsPlugin(): PreviewPlugin {
  return {
    name: "xps",
    match(file) {
      return file.extension === "xps" || file.extension === "oxps" || xpsMimeTypes.has(file.mimeType);
    },
    async render(ctx) {
      const panel = createPanel("ofv-xps");
      ctx.viewport.append(panel);

      try {
        const zip = await JSZip.loadAsync(await readArrayBuffer(ctx.file));
        await renderXps(panel, zip);
      } catch (error) {
        renderXpsFallback(panel, error);
      }
      const controller = createXpsCanvasController(panel, ctx);

      return {
        canCommand(command) {
          return controller?.canCommand(command) ?? false;
        },
        command(command) {
          return controller?.command(command) ?? false;
        },
        destroy() {
          controller?.destroy();
          panel.remove();
        }
      };
    }
  };
}

function createXpsCanvasController(
  panel: HTMLElement,
  ctx: Pick<PreviewContext, "toolbar">
): {
  canCommand: (command: PreviewCommand) => boolean;
  command: (command: PreviewCommand) => boolean;
  destroy: () => void;
} | undefined {
  const canvases = Array.from(panel.querySelectorAll<SVGSVGElement>(".ofv-xps-canvas"))
    .map((svg) => ({ svg, initialViewBox: parseSvgViewBox(svg) }))
    .filter((item): item is { svg: SVGSVGElement; initialViewBox: SvgViewBox } => Boolean(item.initialViewBox));
  if (canvases.length === 0) {
    return undefined;
  }

  let zoom = 1;
  let rotation = 0;
  const apply = () => {
    for (const { svg, initialViewBox } of canvases) {
      const width = initialViewBox.width / zoom;
      const height = initialViewBox.height / zoom;
      const x = initialViewBox.x + (initialViewBox.width - width) / 2;
      const y = initialViewBox.y + (initialViewBox.height - height) / 2;
      svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
      svg.style.transformOrigin = "center center";
      svg.style.transform = rotation === 0 ? "" : `rotate(${rotation}deg)`;
    }
    ctx.toolbar?.setZoom(zoom);
  };
  apply();

  return {
    canCommand(command) {
      return (
        command === "zoom-in" ||
        command === "zoom-out" ||
        command === "zoom-reset" ||
        command === "rotate-right" ||
        command === "rotate-left"
      );
    },
    command(command) {
      if (command === "zoom-in") {
        zoom = Math.min(8, zoom * 1.18);
        apply();
        return true;
      }
      if (command === "zoom-out") {
        zoom = Math.max(0.25, zoom / 1.18);
        apply();
        return true;
      }
      if (command === "zoom-reset") {
        zoom = 1;
        rotation = 0;
        apply();
        return true;
      }
      if (command === "rotate-right" || command === "rotate-left") {
        rotation += command === "rotate-right" ? 90 : -90;
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

type SvgViewBox = { x: number; y: number; width: number; height: number };

function parseSvgViewBox(svg: SVGSVGElement): SvgViewBox | undefined {
  const parts = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!parts || parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0) {
    return undefined;
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

async function renderXps(panel: HTMLElement, zip: JSZip): Promise<void> {
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const fixedPages = entries
    .filter((entry) => /(?:^|\/)Pages\/[^/]+\.fpage$/i.test(entry.name) || entry.name.endsWith(".fpage"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const resourceEntries = entries.filter((entry) => /\.(?:png|jpe?g|tiff?|wdp|bmp|gif|odttf|ttf)$/i.test(entry.name));
  const pagePreviews = await Promise.all(
    fixedPages.slice(0, 80).map(async (entry, index) => {
      const xml = await entry.async("text");
      return {
        entry,
        index,
        xml,
        info: parseXpsPageInfo(xml)
      };
    })
  );

  const summary = createSection("XPS 版式预览");
  summary.hidden = fixedPages.length > 0;
  if (fixedPages.length > 0) {
    summary.setAttribute("aria-hidden", "true");
    summary.style.display = "none";
  }
  const note = document.createElement("p");
  note.textContent = "当前版本会在前端解析 XPS/OXPS 包内 FixedPage 文本、路径和资源结构，并生成轻量 SVG 页面预览；复杂画刷、字体子集和透明混合可接入专用渲染器增强。";
  summary.append(note);
  summary.append(createXpsSummary(entries, fixedPages, resourceEntries, pagePreviews.map((page) => page.info)));
  panel.append(summary);

  const pages = createSection(`页面文本 ${fixedPages.length}`);
  if (fixedPages.length > 0) {
    hideSupplementalInfo(pages.querySelector<HTMLElement>("h3") as HTMLElement);
  }
  const reader = document.createElement("div");
  reader.className = "ofv-xps-pages";

  if (fixedPages.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "未解析到 FixedPage 页面。";
    reader.append(empty);
  } else {
    for (const page of pagePreviews) {
      reader.append(renderXpsPage(page.xml, page.entry.name, page.index));
    }
  }
  pages.append(reader);
  if (fixedPages.length > 0 && reader.querySelector(".ofv-xps-canvas")) {
    for (const textLayer of reader.querySelectorAll<HTMLElement>(".ofv-xps-text")) {
      hideSupplementalInfo(textLayer);
    }
  }
  panel.append(pages);

  const structure = createSection(`文件结构 ${entries.length}`);
  structure.hidden = fixedPages.length > 0;
  if (fixedPages.length > 0) {
    structure.setAttribute("aria-hidden", "true");
    structure.style.display = "none";
  }
  const list = document.createElement("ul");
  for (const entry of entries.slice(0, 240)) {
    const item = document.createElement("li");
    item.textContent = entry.name;
    list.append(item);
  }
  structure.append(list);
  panel.append(structure);
}

type XpsPageInfo = {
  width?: number;
  height?: number;
  glyphs: number;
  imageBrushes: number;
  canvases: number;
  paths: number;
};

function createXpsSummary(
  entries: JSZip.JSZipObject[],
  fixedPages: JSZip.JSZipObject[],
  resourceEntries: JSZip.JSZipObject[],
  pageInfos: XpsPageInfo[]
): HTMLElement {
  const meta = document.createElement("div");
  meta.className = "ofv-xps-meta ofv-xps-summary";
  meta.hidden = fixedPages.length > 0;
  if (fixedPages.length > 0) {
    meta.setAttribute("aria-hidden", "true");
    meta.style.display = "none";
  }
  appendMeta(meta, "页面", fixedPages.length);
  appendMeta(meta, "文件", entries.length);
  appendMeta(meta, "FixedDocument", entries.filter((entry) => /\.fdoc$/i.test(entry.name)).length);
  appendMeta(meta, "FixedDocSeq", entries.filter((entry) => /\.fdseq$/i.test(entry.name)).length);
  appendMeta(meta, "关系文件", entries.filter((entry) => /(?:^|\/)_rels\/[^/]+\.rels$/i.test(entry.name) || entry.name.endsWith(".rels")).length);
  appendMeta(meta, "资源", resourceEntries.length);
  appendMeta(meta, "图片资源", resourceEntries.filter((entry) => /\.(?:png|jpe?g|tiff?|wdp|bmp|gif)$/i.test(entry.name)).length);
  appendMeta(meta, "字体资源", resourceEntries.filter((entry) => /\.(?:odttf|ttf)$/i.test(entry.name)).length);
  const glyphs = pageInfos.reduce((count, page) => count + page.glyphs, 0);
  appendMeta(meta, "Glyphs", glyphs);
  const pageSizes = formatXpsPageSizes(pageInfos);
  if (pageSizes) {
    appendMeta(meta, "页面尺寸", pageSizes);
  }
  const pageObjects = formatXpsPageObjects(pageInfos);
  if (pageObjects) {
    appendMeta(meta, "页面对象", pageObjects);
  }
  return meta;
}

function parseXpsPageInfo(xml: string): XpsPageInfo {
  const fallback = parseXpsPageInfoByRegex(xml);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return fallback;
  }
  const root = doc.documentElement;
  const elements = Array.from(doc.getElementsByTagName("*"));
  return {
    width: finiteNumber(getXmlAttribute(root, "Width"), fallback.width),
    height: finiteNumber(getXmlAttribute(root, "Height"), fallback.height),
    glyphs: elements.filter((element) => element.localName === "Glyphs").length,
    imageBrushes: elements.filter((element) => element.localName === "ImageBrush").length,
    canvases: elements.filter((element) => element.localName === "Canvas").length,
    paths: elements.filter((element) => element.localName === "Path").length
  };
}

function parseXpsPageInfoByRegex(xml: string): XpsPageInfo {
  return {
    width: finiteNumber(firstAttributeValue(xml, "Width"), undefined),
    height: finiteNumber(firstAttributeValue(xml, "Height"), undefined),
    glyphs: countMatches(xml, /<[\w:.-]*Glyphs\b/g),
    imageBrushes: countMatches(xml, /<[\w:.-]*ImageBrush\b/g),
    canvases: countMatches(xml, /<[\w:.-]*Canvas\b/g),
    paths: countMatches(xml, /<[\w:.-]*Path\b/g)
  };
}

function formatXpsPageSizes(pageInfos: XpsPageInfo[]): string {
  const counts = new Map<string, number>();
  for (const page of pageInfos) {
    if (!Number.isFinite(page.width) || !Number.isFinite(page.height)) {
      continue;
    }
    const key = `${Math.round(page.width as number)} x ${Math.round(page.height as number)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([size, count]) => (count > 1 ? `${size} (${count})` : size))
    .join(", ");
}

function formatXpsPageObjects(pageInfos: XpsPageInfo[]): string {
  const totals = pageInfos.reduce(
    (result, page) => ({
      imageBrushes: result.imageBrushes + page.imageBrushes,
      canvases: result.canvases + page.canvases,
      paths: result.paths + page.paths
    }),
    { imageBrushes: 0, canvases: 0, paths: 0 }
  );
  return [
    totals.imageBrushes ? `ImageBrush ${totals.imageBrushes}` : "",
    totals.canvases ? `Canvas ${totals.canvases}` : "",
    totals.paths ? `Path ${totals.paths}` : ""
  ].filter(Boolean).join(", ");
}

function renderXpsPage(xml: string, path: string, index: number): HTMLElement {
  const page = document.createElement("article");
  page.className = "ofv-xps-page";
  const heading = document.createElement("h4");
  heading.textContent = `Page ${index + 1}`;
  const pathMeta = document.createElement("span");
  pathMeta.textContent = path;
  hideSupplementalInfo(pathMeta);

  const canvas = createXpsPageCanvas(xml);
  const text = document.createElement("div");
  text.className = "ofv-xps-text";
  const fragments = extractXpsText(xml);
  if (fragments.length > 0) {
    for (const fragment of fragments) {
      const paragraph = document.createElement("p");
      paragraph.textContent = fragment;
      text.append(paragraph);
    }
  } else {
    const empty = document.createElement("p");
    empty.textContent = "这一页未提取到 Glyphs 文本。";
    text.append(empty);
  }

  page.append(heading, pathMeta);
  if (canvas) {
    hideSupplementalInfo(heading);
    page.append(canvas);
  }
  page.append(text);
  return page;
}

function createXpsPageCanvas(xml: string): Element | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return null;
  }
  const info = parseXpsPageInfo(xml);
  const width = info.width || 816;
  const height = info.height || 1056;
  const elements = Array.from(doc.getElementsByTagName("*"));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("ofv-xps-canvas");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "XPS page layout preview");

  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("x", "0");
  background.setAttribute("y", "0");
  background.setAttribute("width", String(width));
  background.setAttribute("height", String(height));
  background.setAttribute("fill", "#ffffff");
  svg.append(background);

  let drawn = 0;
  for (const element of elements) {
    if (element.localName === "Path") {
      const pathData = getXmlAttribute(element, "Data");
      if (pathData) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", parseXpsBrush(getXmlAttribute(element, "Fill"), "none"));
        path.setAttribute("stroke", parseXpsBrush(getXmlAttribute(element, "Stroke"), "#334155"));
        path.setAttribute("stroke-width", getXmlAttribute(element, "StrokeThickness") || "1");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        svg.append(path);
        drawn++;
      }
    } else if (element.localName === "Glyphs") {
      const label = getXmlAttribute(element, "UnicodeString");
      if (label) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.textContent = label;
        text.setAttribute("x", String(finiteNumber(getXmlAttribute(element, "OriginX"), 24) || 24));
        text.setAttribute("y", String(finiteNumber(getXmlAttribute(element, "OriginY"), 36) || 36));
        text.setAttribute("fill", parseXpsBrush(getXmlAttribute(element, "Fill"), "#111827"));
        text.setAttribute("font-size", String(finiteNumber(getXmlAttribute(element, "FontRenderingEmSize"), 16) || 16));
        text.setAttribute("font-family", "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif");
        svg.append(text);
        drawn++;
      }
    }
  }
  return drawn > 0 ? svg : null;
}

function parseXpsBrush(value: string | null, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim();
  if (/^#[0-9a-f]{6,8}$/i.test(normalized)) {
    return normalized.length === 9 ? `#${normalized.slice(3)}` : normalized;
  }
  if (/^[a-z]+$/i.test(normalized)) {
    return normalized;
  }
  return fallback;
}

function extractXpsText(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return extractXpsTextByRegex(xml);
  }
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "Glyphs")
    .map((glyph) => getXmlAttribute(glyph, "UnicodeString") || "")
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractXpsTextByRegex(xml: string): string[] {
  return [...xml.matchAll(/\bUnicodeString=(?:"([^"]*)"|'([^']*)')/g)]
    .map((match) => decodeXml(match[1] || match[2] || ""))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function firstAttributeValue(xml: string, name: string): string | undefined {
  const match = xml.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`));
  return match?.[1] || match?.[2];
}

function countMatches(value: string, pattern: RegExp): number {
  return [...value.matchAll(pattern)].length;
}

function renderXpsFallback(panel: HTMLElement, error: unknown): void {
  panel.replaceChildren();
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";
  const title = document.createElement("strong");
  title.textContent = "XPS 解析失败";
  const meta = document.createElement("span");
  meta.textContent = error instanceof Error ? error.message : "文件可能已损坏，或不是有效的 XPS/OXPS 包。";
  fallback.append(title, meta);
  panel.append(fallback);
}

function appendMeta(parent: HTMLElement, label: string, value: string | number): void {
  const row = document.createElement("div");
  row.className = "ofv-meta-row";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = String(value);
  row.append(key, content);
  parent.append(row);
}

function hideSupplementalInfo(element: HTMLElement | null): void {
  if (!element) {
    return;
  }
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.style.display = "none";
}

function getXmlAttribute(element: Element, localName: string): string | null {
  const direct = element.getAttribute(localName);
  if (direct !== null) {
    return direct;
  }
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) {
      return attribute.value;
    }
  }
  return null;
}

function finiteNumber(value: unknown, fallback: number | undefined): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}
