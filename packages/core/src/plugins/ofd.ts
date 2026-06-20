import JSZip from "jszip";
import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewFile, PreviewPlugin } from "../types";
import { createPanel, readArrayBuffer } from "./utils";
import { createEncryptedFallback, isEncryptedError } from "./encrypted";

export function ofdPlugin(): PreviewPlugin {
  return {
    name: "ofd",
    match(file) {
      return file.extension === "ofd" || file.mimeType === "application/ofd";
    },
    async render(ctx) {
      const panel = createPanel("ofv-ofd");
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      ctx.viewport.append(panel);
      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(await readArrayBuffer(ctx.file));
      } catch (error) {
        panel.append(createOfdFailure(ctx.file, url, error));
        return {
          destroy() {
            panel.remove();
            revokeObjectUrl(url, isExternal);
          }
        };
      }

      const entries = Object.values(zip.files).filter((entry) => !entry.dir);
      const textFragments: string[] = [];

      try {
        for (const entry of entries.filter((item) => item.name.endsWith(".xml")).slice(0, 40)) {
          const xml = await entry.async("text");
          const matches = [...xml.matchAll(/>([^<>]{2,})</g)]
            .map((match) => match[1]?.trim())
            .filter(Boolean) as string[];
          textFragments.push(...matches);
        }
      } catch (error) {
        panel.append(createOfdFailure(ctx.file, url, error));
        return {
          destroy() {
            panel.remove();
            revokeObjectUrl(url, isExternal);
          }
        };
      }

      const context = await readOfdContext(entries);
      const pages = await readOfdPages(entries, context);
      let zoom = 1;
      let rotation = 0;
      const applyZoom = () => {
        panel.style.setProperty("--ofv-ofd-zoom", formatOfdCssNumber(zoom));
        ctx.toolbar?.setZoom(zoom);
      };
      const applyRotation = () => {
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        panel.style.setProperty("--ofv-ofd-rotation", `${normalizedRotation}deg`);
        panel.classList.toggle("is-ofd-rotated-sideways", normalizedRotation === 90 || normalizedRotation === 270);
      };

      if (pages.length > 0) {
        const pagesWrap = document.createElement("div");
        pagesWrap.className = "ofv-ofd-pages";
        for (const page of pages) {
          pagesWrap.append(renderOfdPage(page));
        }
        panel.append(pagesWrap);
        applyZoom();
        applyRotation();
      }
      if (pages.length === 0) {
        const content = document.createElement("pre");
        content.className = "ofv-text-block";
        content.textContent = textFragments.slice(0, 300).join("\n") || "未提取到可读文本。";
        panel.append(content);
      }

      return {
        canCommand(command) {
          return (
            pages.length > 0 &&
            (command === "zoom-in" ||
              command === "zoom-out" ||
              command === "zoom-reset" ||
              command === "rotate-right" ||
              command === "rotate-left")
          );
        },
        command(command) {
          if (pages.length === 0) {
            return false;
          }
          if (command === "zoom-in") {
            zoom = Math.min(4, zoom + 0.15);
            applyZoom();
            return true;
          }
          if (command === "zoom-out") {
            zoom = Math.max(0.25, zoom - 0.15);
            applyZoom();
            return true;
          }
          if (command === "zoom-reset") {
            zoom = 1;
            rotation = 0;
            applyZoom();
            applyRotation();
            return true;
          }
          if (command === "rotate-right") {
            rotation += 90;
            applyRotation();
            return true;
          }
          if (command === "rotate-left") {
            rotation -= 90;
            applyRotation();
            return true;
          }
          return false;
        },
        destroy() {
          ctx.toolbar?.setZoom(undefined);
          panel.remove();
          revokeObjectUrl(url, isExternal);
        }
      };
    }
  };
}

type OfdTextObject = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  color: string;
  weight: string;
  fontFamily: string;
  letterSpacing?: number;
  deltaX?: number[];
  vertical?: boolean;
  align?: "start" | "end";
};

type OfdPathObject = {
  d: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  strokeWidth: number;
  transform: string;
};

type OfdLineObject = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
};

type OfdImageObject = {
  x: number;
  y: number;
  width: number;
  height: number;
  resourceId: string;
  href?: string;
};

type OfdPagePreview = {
  name: string;
  width: number;
  height: number;
  texts: OfdTextObject[];
  paths: OfdPathObject[];
  lines: OfdLineObject[];
  images: OfdImageObject[];
};

type OfdContext = {
  images: Map<string, string>;
  templates: Map<string, string>;
  fonts: Map<string, string>;
  pageSize?: { width: number; height: number };
};

async function readOfdPages(
  entries: JSZip.JSZipObject[],
  context: OfdContext
): Promise<OfdPagePreview[]> {
  const pages: OfdPagePreview[] = [];
  const pageEntries = entries
    .filter((entry) => /(^|\/)Pages\/Page_[^/]+\/Content\.xml$/i.test(entry.name) || /(^|\/)Page_[^/]+\/Content\.xml$/i.test(entry.name))
    .slice(0, 80);
  for (const entry of pageEntries) {
    const xml = await entry.async("text");
    const templates = await readPageTemplates(xml, context, entries);
    const page = parseOfdPage(entry.name, xml, context.images, context.fonts, templates, context.pageSize);
    if (page.texts.length > 0 || page.paths.length > 0 || page.lines.length > 0 || page.images.length > 0) {
      pages.push(page);
    }
  }
  return pages;
}

async function readPageTemplates(xml: string, context: OfdContext, entries: JSZip.JSZipObject[]): Promise<string[]> {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return [];
  }
  const templateIds = Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "Template")
    .map((element) => getOfdAttribute(element, "TemplateID") || getOfdAttribute(element, "ID"))
    .filter((id): id is string => Boolean(id));
  const templates: string[] = [];
  for (const id of templateIds) {
    const path = context.templates.get(id);
    const entry = path ? findOfdEntry(entries, path) : undefined;
    if (entry) {
      templates.push(await entry.async("text"));
    }
  }
  return templates;
}

function parseOfdPage(
  name: string,
  xml: string,
  images: Map<string, string>,
  fonts: Map<string, string>,
  templateXmls: string[] = [],
  defaultPageSize?: { width: number; height: number }
): OfdPagePreview {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return { name, width: 210, height: 297, texts: [], paths: [], lines: [], images: [] };
  }
  const pageSize = parseOfdPageSize(doc, defaultPageSize);
  const templatePages = templateXmls.map((templateXml) => {
    const templateDoc = new DOMParser().parseFromString(templateXml, "application/xml");
    return templateDoc.querySelector("parsererror") ? emptyOfdPageContent() : parseOfdPageContent(templateDoc, images, fonts);
  });
  const pageContent = parseOfdPageContent(doc, images, fonts);
  const texts = [...templatePages.flatMap((page) => page.texts), ...pageContent.texts];
  const paths = [...templatePages.flatMap((page) => page.paths), ...pageContent.paths];
  const lines = [...templatePages.flatMap((page) => page.lines), ...pageContent.lines];
  const imageObjects = [...templatePages.flatMap((page) => page.images), ...pageContent.images];
  if (pageSize.explicit) {
    return { name, width: pageSize.width, height: pageSize.height, texts, paths, lines, images: imageObjects };
  }
  const bounds = createOfdBounds(texts, paths, lines, imageObjects);
  const width = Math.max(pageSize.width, ...bounds.map((item) => item.x + item.width + 12));
  const height = Math.max(pageSize.height, ...bounds.map((item) => item.y + item.height + 12));
  return { name, width, height, texts, paths, lines, images: imageObjects };
}

function parseOfdPageContent(
  doc: Document,
  images: Map<string, string>,
  fonts: Map<string, string>
): Omit<OfdPagePreview, "name" | "width" | "height"> {
  const textObjects = Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "TextObject");
  const texts = textObjects.flatMap((element) => parseOfdTextObject(element, fonts));
  const paths = Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "PathObject")
    .flatMap((element) => parseOfdPathObject(element));
  const lines = Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "LineObject")
    .flatMap((element) => parseOfdLineObject(element));
  const imageObjects = Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "ImageObject")
    .flatMap((element) => parseOfdImageObject(element, images));
  return { texts, paths, lines, images: imageObjects };
}

function emptyOfdPageContent(): Omit<OfdPagePreview, "name" | "width" | "height"> {
  return { texts: [], paths: [], lines: [], images: [] };
}

function createOfdBounds(
  texts: OfdTextObject[],
  paths: OfdPathObject[],
  lines: OfdLineObject[],
  imageObjects: OfdImageObject[]
): Array<{ x: number; y: number; width: number; height: number }> {
  return [
    ...texts.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height })),
    ...paths.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height })),
    ...lines.map((item) => ({
      x: Math.min(item.x1, item.x2),
      y: Math.min(item.y1, item.y2),
      width: Math.abs(item.x2 - item.x1),
      height: Math.abs(item.y2 - item.y1)
    })),
    ...imageObjects.map((item) => ({ x: item.x, y: item.y, width: item.width, height: item.height }))
  ];
}

function parseOfdTextObject(element: Element, fonts: Map<string, string>): OfdTextObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const size = finiteNumber(getOfdAttribute(element, "Size"), Math.max(4, boundary.height || 5));
  const color = parseOfdColor(element, "#111827");
  const weight = finiteNumber(getOfdAttribute(element, "Weight"), 400) >= 600 ? "700" : "400";
  const fontFamily = fontStackForOfdFont(fonts.get(getOfdAttribute(element, "Font") || ""));
  const objectLetterSpacing = getOfdAttribute(element, "DeltaX") ? 0.5 : undefined;
  const textCodes = Array.from(element.getElementsByTagName("*")).filter((child) => child.localName === "TextCode");
  if (textCodes.length === 0) {
    return [];
  }
  return textCodes.flatMap((code): OfdTextObject[] => {
    const x = boundary.x + finiteNumber(getOfdAttribute(code, "X"), 0);
    const y = boundary.y + finiteNumber(getOfdAttribute(code, "Y"), 0);
    const text = code.textContent?.trim() || "";
    const deltaX = parseOfdDeltaX(getOfdAttribute(code, "DeltaX"));
    const align = deltaX ? "start" : inferOfdTextAlign(text, boundary);
    const deltaY = getOfdAttribute(code, "DeltaY");
    if (deltaY && text.length > 1) {
      const step = parseOfdDeltaStep(deltaY, size);
      return Array.from(text).map((char, index) => ({
        text: char,
        x,
        y: y + index * step,
        width: boundary.width,
        height: boundary.height,
        size,
        color,
        weight,
        fontFamily,
        letterSpacing: objectLetterSpacing,
        vertical: true,
        align
      }));
    }
    return [
      {
        text,
        x,
        y,
        width: boundary.width,
        height: boundary.height,
        size,
        color,
        weight,
        fontFamily,
        letterSpacing: deltaX ? undefined : objectLetterSpacing,
        deltaX,
        align
      }
    ];
  }).filter((item) => item.text);
}

function parseOfdPathObject(element: Element): OfdPathObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const ctm = parseOfdCtm(getOfdAttribute(element, "CTM"));
  const commands = Array.from(element.getElementsByTagName("*")).filter(
    (child) => child.localName === "AbbreviatedData" || child.localName === "PathData"
  );
  const raw = commands.map((child) => child.textContent || "").join(" ").trim();
  if (!raw) {
    return [];
  }
  return [
    {
      d: normalizeOfdPathData(raw),
      x: boundary.x,
      y: boundary.y,
      width: boundary.width,
      height: boundary.height,
      stroke: parseOfdColor(element, "#111827", "StrokeColor"),
      fill: parseOfdFill(element),
      strokeWidth: finiteNumber(getOfdAttribute(element, "LineWidth"), 1),
      transform: createOfdPathTransform(boundary.x, boundary.y, ctm)
    }
  ];
}

function parseOfdLineObject(element: Element): OfdLineObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const start = parsePoint(getOfdAttribute(element, "StartPoint"), { x: 0, y: 0 });
  const end = parsePoint(getOfdAttribute(element, "EndPoint"), {
    x: boundary.width,
    y: boundary.height
  });
  return [
    {
      x1: boundary.x + start.x,
      y1: boundary.y + start.y,
      x2: boundary.x + end.x,
      y2: boundary.y + end.y,
      stroke: parseOfdColor(element, "#111827"),
      strokeWidth: finiteNumber(getOfdAttribute(element, "LineWidth"), 1)
    }
  ];
}

function parseOfdImageObject(element: Element, images: Map<string, string>): OfdImageObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const resourceId = getOfdAttribute(element, "ResourceID") || getOfdAttribute(element, "ResourceId") || "";
  return [
    {
      x: boundary.x,
      y: boundary.y,
      width: boundary.width || 32,
      height: boundary.height || 32,
      resourceId,
      href: images.get(resourceId)
    }
  ];
}

function renderOfdPage(page: OfdPagePreview): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "ofv-ofd-page";
  figure.style.setProperty("--ofv-ofd-page-width", `${formatOfdCssNumber(page.width)}mm`);
  figure.style.setProperty("--ofv-ofd-page-height", `${formatOfdCssNumber(page.height)}mm`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${page.width} ${page.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", page.name);

  const paper = document.createElementNS(svg.namespaceURI, "rect");
  paper.setAttribute("x", "0");
  paper.setAttribute("y", "0");
  paper.setAttribute("width", String(page.width));
  paper.setAttribute("height", String(page.height));
  paper.setAttribute("fill", "white");
  svg.append(paper);

  for (const item of page.images) {
    if (item.href) {
      const image = document.createElementNS(svg.namespaceURI, "image");
      image.setAttribute("x", String(item.x));
      image.setAttribute("y", String(item.y));
      image.setAttribute("width", String(item.width));
      image.setAttribute("height", String(item.height));
      image.setAttribute("href", item.href);
      image.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.append(image);
    } else {
      const placeholder = document.createElementNS(svg.namespaceURI, "rect");
      placeholder.setAttribute("x", String(item.x));
      placeholder.setAttribute("y", String(item.y));
      placeholder.setAttribute("width", String(item.width));
      placeholder.setAttribute("height", String(item.height));
      placeholder.setAttribute("fill", "#f8fafc");
      placeholder.setAttribute("stroke", "#94a3b8");
      placeholder.setAttribute("stroke-dasharray", "4 3");
      svg.append(placeholder);
    }
  }

  for (const item of page.paths) {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", item.d);
    path.setAttribute("transform", item.transform);
    path.setAttribute("fill", item.fill);
    path.setAttribute("stroke", item.stroke);
    path.setAttribute("stroke-width", String(item.strokeWidth));
    svg.append(path);
  }

  for (const item of page.lines) {
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", String(item.x1));
    line.setAttribute("y1", String(item.y1));
    line.setAttribute("x2", String(item.x2));
    line.setAttribute("y2", String(item.y2));
    line.setAttribute("stroke", item.stroke);
    line.setAttribute("stroke-width", String(item.strokeWidth));
    line.setAttribute("stroke-linecap", "round");
    svg.append(line);
  }

  for (const item of page.texts) {
    const text = document.createElementNS(svg.namespaceURI, "text");
    text.setAttribute("x", String(item.align === "end" ? item.x + item.width : item.x));
    text.setAttribute("y", String(item.y));
    text.setAttribute("font-size", String(item.size));
    text.setAttribute("fill", item.color);
    text.setAttribute("font-weight", item.weight);
    text.setAttribute("font-family", item.fontFamily);
    if (item.letterSpacing !== undefined) {
      text.setAttribute("letter-spacing", String(item.letterSpacing));
    }
    if (item.deltaX && item.deltaX.length > 0 && item.align !== "end") {
      const chars = Array.from(item.text);
      let x = item.x;
      for (let index = 0; index < chars.length; index += 1) {
        const span = document.createElementNS(svg.namespaceURI, "tspan");
        span.setAttribute("x", String(x));
        span.setAttribute("y", String(item.y));
        if (index < chars.length - 1) {
          x += item.deltaX[Math.min(index, item.deltaX.length - 1)] || item.size;
        }
        span.textContent = chars[index];
        text.append(span);
      }
    } else {
      if (item.align === "end") {
        text.setAttribute("text-anchor", "end");
      }
      text.textContent = item.text;
    }
    svg.append(text);
  }

  figure.append(svg);
  return figure;
}

async function readOfdContext(entries: JSZip.JSZipObject[]): Promise<OfdContext> {
  const images = await readOfdImages(entries);
  const fonts = await readOfdFonts(entries);
  const { templates, pageSize } = await readOfdDocumentInfo(entries);
  return { images, templates, fonts, pageSize };
}

async function readOfdFonts(entries: JSZip.JSZipObject[]): Promise<Map<string, string>> {
  const fonts = new Map<string, string>();
  for (const entry of entries.filter((item) => /(?:^|\/)(?:DocumentRes|PublicRes)\.xml$/i.test(item.name))) {
    const xml = await entry.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) {
      continue;
    }
    for (const font of Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "Font")) {
      const id = getOfdAttribute(font, "ID");
      const name = getOfdAttribute(font, "FontName") || getOfdAttribute(font, "FamilyName");
      if (id && name) {
        fonts.set(id, name.trim());
      }
    }
  }
  return fonts;
}

async function readOfdImages(entries: JSZip.JSZipObject[]): Promise<Map<string, string>> {
  const images = new Map<string, string>();
  for (const entry of entries.filter((item) => /\.(?:png|jpe?g|gif|bmp|webp)$/i.test(item.name)).slice(0, 80)) {
    const id = entry.name.split("/").pop()?.replace(/\.[^.]+$/, "") || entry.name;
    const mimeType = mimeTypeFromPath(entry.name);
    if (!mimeType.startsWith("image/")) {
      continue;
    }
    const base64 = await entry.async("base64");
    const href = `data:${mimeType};base64,${base64}`;
    images.set(id, href);
    images.set(entry.name, href);
    images.set(entry.name.split("/").pop() || entry.name, href);
  }
  for (const entry of entries.filter((item) => /(?:^|\/)(?:DocumentRes|PublicRes)\.xml$/i.test(item.name))) {
    const xml = await entry.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) {
      continue;
    }
    const baseLoc = getOfdAttribute(doc.documentElement, "BaseLoc") || "";
    const resourceDir = joinOfdPath(directoryName(entry.name), baseLoc);
    for (const media of Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "MultiMedia")) {
      const id = getOfdAttribute(media, "ID");
      const mediaFile = findOfdChild(media, "MediaFile")?.textContent?.trim();
      if (!id || !mediaFile) {
        continue;
      }
      const imageEntry = findOfdEntry(entries, joinOfdPath(resourceDir, mediaFile)) || findOfdEntry(entries, mediaFile);
      const href = imageEntry ? images.get(imageEntry.name) || images.get(imageEntry.name.split("/").pop() || imageEntry.name) : undefined;
      if (href) {
        images.set(id, href);
      }
    }
  }
  return images;
}

async function readOfdDocumentInfo(entries: JSZip.JSZipObject[]): Promise<{ templates: Map<string, string>; pageSize?: { width: number; height: number } }> {
  const templates = new Map<string, string>();
  let pageSize: { width: number; height: number } | undefined;
  for (const entry of entries.filter((item) => /(?:^|\/)Document\.xml$/i.test(item.name))) {
    const xml = await entry.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) {
      continue;
    }
    const documentDir = directoryName(entry.name);
    const physicalBox = Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "PageArea")
      ?.getElementsByTagName("*");
    const pageAreaBox = physicalBox
      ? Array.from(physicalBox).find((element) => element.localName === "PhysicalBox")
      : undefined;
    if (pageAreaBox?.textContent) {
      const box = parseBoundary(pageAreaBox.textContent);
      if (box.width > 0 && box.height > 0) {
        pageSize = { width: box.width, height: box.height };
      }
    }
    for (const template of Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "TemplatePage")) {
      const id = getOfdAttribute(template, "ID");
      const baseLoc = getOfdAttribute(template, "BaseLoc");
      if (id && baseLoc) {
        templates.set(id, joinOfdPath(documentDir, baseLoc));
      }
    }
  }
  return { templates, pageSize };
}

function parseOfdPageSize(doc: Document, defaultPageSize?: { width: number; height: number }): { width: number; height: number; explicit: boolean } {
  if (defaultPageSize) {
    return { ...defaultPageSize, explicit: true };
  }
  const physicalBox = Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "PhysicalBox");
  if (physicalBox?.textContent) {
    const box = parseBoundary(physicalBox.textContent);
    if (box.width > 0 && box.height > 0) {
      return { width: box.width, height: box.height, explicit: true };
    }
  }
  return { width: 210, height: 297, explicit: false };
}

function parseOfdColor(element: Element, fallback: string, preferredLocalName = "FillColor"): string {
  const colorElement = findOfdChild(element, preferredLocalName) || findOfdChild(element, "StrokeColor") || findOfdChild(element, "FillColor");
  const value = colorElement ? getOfdAttribute(colorElement, "Value") : null;
  if (!value) {
    return fallback;
  }
  const parts = value.trim().split(/\s+/).map((part) => Number(part));
  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    return `rgb(${parts.slice(0, 3).map((part) => Math.max(0, Math.min(255, part))).join(" ")})`;
  }
  return fallback;
}

function parseOfdFill(element: Element): string {
  const fillElement = findOfdChild(element, "FillColor");
  return fillElement ? parseOfdColor(element, "transparent", "FillColor") : "transparent";
}

function findOfdChild(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => child.localName === localName);
}

function parsePoint(value: string | null, fallback: { x: number; y: number }): { x: number; y: number } {
  const parts = (value || "").trim().split(/\s+/).map((part) => Number(part));
  return {
    x: Number.isFinite(parts[0]) ? parts[0] : fallback.x,
    y: Number.isFinite(parts[1]) ? parts[1] : fallback.y
  };
}

function normalizeOfdPathData(value: string): string {
  return value
    .replace(/\bM\s+/gi, "M ")
    .replace(/\bL\s+/gi, "L ")
    .replace(/\bC\s+/gi, "C ")
    .replace(/\bQ\s+/gi, "Q ")
    .replace(/\bA\s+/gi, "A ")
    .replace(/\bB\s+/gi, "C ")
    .replace(/\bZ\b/gi, "Z")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOfdCtm(value: string | null): [number, number, number, number, number, number] | undefined {
  const parts = (value || "")
    .trim()
    .split(/\s+/)
    .map((part) => Number(part));
  if (parts.length !== 6 || parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }
  return parts as [number, number, number, number, number, number];
}

function createOfdPathTransform(x: number, y: number, ctm?: [number, number, number, number, number, number]): string {
  if (!ctm) {
    return `translate(${x} ${y})`;
  }
  const [a, b, c, d, e, f] = ctm;
  return `translate(${x} ${y}) matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
}

function parseOfdDeltaStep(value: string, fallback: number): number {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map((part) => Number(part)).filter((part) => Number.isFinite(part)) || [];
  return numbers.length > 0 ? numbers[numbers.length - 1] : fallback;
}

function parseOfdDeltaX(value: string | null): number[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.match(/[a-z]+|-?\d+(?:\.\d+)?/gi) || [];
  const deltas: number[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const token = parts[index];
    if (/^g$/i.test(token)) {
      const count = Number(parts[index + 1]);
      const step = Number(parts[index + 2]);
      if (Number.isFinite(count) && Number.isFinite(step)) {
        deltas.push(...Array.from({ length: Math.max(0, Math.floor(count)) }, () => step));
      }
      index += 2;
      continue;
    }
    const numeric = Number(token);
    if (Number.isFinite(numeric)) {
      deltas.push(numeric);
    }
  }
  return deltas.length > 0 ? deltas : undefined;
}

function fontStackForOfdFont(fontName: string | undefined): string {
  const normalized = (fontName || "").trim().toLowerCase();
  if (normalized.includes("courier")) {
    return '"Courier New", Courier, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  }
  if (normalized.includes("kaiti") || normalized.includes("kai") || normalized.includes("楷")) {
    return '"STKaiti", "Kaiti SC", "KaiTi", "楷体", serif';
  }
  if (normalized.includes("simsun") || normalized.includes("simsong") || normalized.includes("song") || normalized.includes("宋")) {
    return '"SimSong", "Songti SC", "STSong", SimSun, "宋体", serif';
  }
  if (normalized.includes("hei") || normalized.includes("黑")) {
    return '"PingFang SC", "Microsoft YaHei", SimHei, sans-serif';
  }
  return '"SimSong", "Songti SC", "STSong", SimSun, "Noto Serif CJK SC", serif';
}

function inferOfdTextAlign(text: string, boundary: { x: number; y: number; width: number; height: number }): "start" | "end" {
  const normalized = text.trim();
  if (!/^[¥￥]?\d+(?:\.\d+)?%?$/.test(normalized)) {
    return "start";
  }
  if (boundary.x >= 75 || boundary.width <= 30) {
    return "end";
  }
  return "start";
}

function findOfdEntry(entries: JSZip.JSZipObject[], path: string): JSZip.JSZipObject | undefined {
  const normalized = normalizeOfdPath(path);
  return entries.find((entry) => normalizeOfdPath(entry.name) === normalized || normalizeOfdPath(entry.name).endsWith(`/${normalized}`));
}

function joinOfdPath(...parts: string[]): string {
  const joined = parts.filter(Boolean).join("/");
  const segments: string[] = [];
  for (const segment of joined.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function directoryName(path: string): string {
  const normalized = normalizeOfdPath(path);
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function normalizeOfdPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function mimeTypeFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp"
  };
  return extension ? map[extension] || "application/octet-stream" : "application/octet-stream";
}

function parseBoundary(value: string | null): { x: number; y: number; width: number; height: number } {
  const parts = (value || "").trim().split(/\s+/).map((part) => Number(part));
  return {
    x: Number.isFinite(parts[0]) ? parts[0] : 0,
    y: Number.isFinite(parts[1]) ? parts[1] : 0,
    width: Number.isFinite(parts[2]) ? parts[2] : 0,
    height: Number.isFinite(parts[3]) ? parts[3] : 0
  };
}

function getOfdAttribute(element: Element, localName: string): string | null {
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

function finiteNumber(value: string | null, fallback: number): number {
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatOfdCssNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function createOfdFailure(file: PreviewFile, url: string, error: unknown): HTMLElement {
  if (isEncryptedError(error)) {
    return createEncryptedFallback(file, url, {
      title: "OFD 文件已加密，无法在线预览",
      message: "请下载后使用本地 OFD 阅读器输入密码打开，或上传解密后的 OFD 文件。",
      action: "下载 OFD"
    });
  }
  return createOfdFallback(file.name, url, normalizeOfdError(error));
}

function createOfdFallback(fileName: string, url: string, detail: string): HTMLElement {
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";

  const title = document.createElement("strong");
  title.textContent = "OFD 解析失败";

  const meta = document.createElement("span");
  meta.textContent = `${detail}。可下载 ${fileName} 后使用本地 OFD 阅读器查看。`;

  const download = document.createElement("a");
  download.href = url;
  download.download = fileName;
  download.textContent = "下载 OFD";

  fallback.append(title, meta, download);
  return fallback;
}

function normalizeOfdError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "文件可能已损坏，或不是有效的 OFD 包";
}
