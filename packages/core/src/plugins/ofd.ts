import JSZip from "jszip";
import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewFile, PreviewPlugin } from "../types";
import { createPanel, goToRenderedPage, readArrayBuffer } from "./utils";
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
      // Pages wider than the panel are fitted down in JS; the user zoom then
      // multiplies on top of that fit. The old CSS min(100%) cap cannot work
      // here: against the pages grid's max-content width the percentage is
      // cyclic, so zooming past the container width used to be a no-op.
      const OFD_MM_TO_PX = 96 / 25.4;
      const computeFitScale = () => {
        if (pages.length === 0) {
          return 1;
        }
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        const sideways = normalizedRotation === 90 || normalizedRotation === 270;
        const widestMm = Math.max(...pages.map((page) => (sideways ? page.height : page.width)));
        const available = panel.clientWidth - 32;
        const widestPx = widestMm * OFD_MM_TO_PX;
        if (!(widestPx > 0) || !(available > 0)) {
          return 1;
        }
        return Math.min(1, available / widestPx);
      };
      const applyZoom = () => {
        panel.style.setProperty("--ofv-ofd-zoom", formatOfdCssNumber(computeFitScale() * zoom));
        ctx.toolbar?.setZoom(zoom);
      };
      const applyRotation = () => {
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        panel.style.setProperty("--ofv-ofd-rotation", `${normalizedRotation}deg`);
        panel.classList.toggle("is-ofd-rotated-sideways", normalizedRotation === 90 || normalizedRotation === 270);
        applyZoom();
      };
      let resizeObserver: ResizeObserver | undefined;

      if (pages.length > 0) {
        const pagesWrap = document.createElement("div");
        pagesWrap.className = "ofv-ofd-pages";
        for (const page of pages) {
          pagesWrap.append(renderOfdPage(page));
        }
        panel.append(pagesWrap);
        applyZoom();
        applyRotation();
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => applyZoom());
          resizeObserver.observe(panel);
        }
      }
      if (pages.length === 0) {
        const content = document.createElement("pre");
        content.className = "ofv-text-block";
        content.textContent = textFragments.slice(0, 300).join("\n") || "未提取到可读文本。";
        panel.append(content);
      }

      return {
        goToPage(page) {
          return goToRenderedPage(panel, ".ofv-ofd-page", page, panel);
        },
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
          resizeObserver?.disconnect();
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
  transform?: string;
  // CTM 文本的 x/y 是 Boundary 内相对坐标，页面尺寸估算需用 Boundary 原点
  boundsX?: number;
  boundsY?: number;
};

type OfdPathObject = {
  d: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  fillRule?: "evenodd";
  strokeWidth: number;
  transform: string;
};

type OfdDrawParam = {
  lineWidth?: number;
  strokeColor?: string;
  fillColor?: string;
};

type OfdPageResources = {
  images: Map<string, string>;
  fonts: Map<string, string>;
  drawParams: Map<string, OfdDrawParam>;
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
  transform?: string;
};

type OfdPagePreview = {
  name: string;
  width: number;
  height: number;
  objects: OfdPageObject[];
  texts: OfdTextObject[];
  paths: OfdPathObject[];
  lines: OfdLineObject[];
  images: OfdImageObject[];
  stamps: OfdImageObject[];
};

type OfdPageObject =
  | { type: "text"; item: OfdTextObject }
  | { type: "path"; item: OfdPathObject }
  | { type: "line"; item: OfdLineObject }
  | { type: "image"; item: OfdImageObject };

type OfdContext = {
  images: Map<string, string>;
  templates: Map<string, string>;
  fonts: Map<string, string>;
  drawParams: Map<string, OfdDrawParam>;
  pageOrder: string[];
  pageSize?: { width: number; height: number };
  stampsByPage: Map<string, OfdImageObject[]>;
};

async function readOfdPages(
  entries: JSZip.JSZipObject[],
  context: OfdContext
): Promise<OfdPagePreview[]> {
  const pages: OfdPagePreview[] = [];
  const discoveredPageEntries = entries.filter(
    (entry) => /(^|\/)Pages\/Page_[^/]+\/Content\.xml$/i.test(entry.name) || /(^|\/)Page_[^/]+\/Content\.xml$/i.test(entry.name)
  );
  const documentPageEntries = context.pageOrder
    .map((path) => findOfdEntry(discoveredPageEntries, path))
    .filter((entry): entry is JSZip.JSZipObject => Boolean(entry));
  const pageEntries = (documentPageEntries.length > 0 ? documentPageEntries : discoveredPageEntries).slice(0, 80);
  for (const entry of pageEntries) {
    const xml = await entry.async("text");
    const templates = await readPageTemplates(xml, context, entries);
    const stamps = context.stampsByPage.get(normalizeOfdPath(entry.name)) || [];
    const resources: OfdPageResources = {
      images: context.images,
      fonts: context.fonts,
      drawParams: context.drawParams
    };
    const page = parseOfdPage(entry.name, xml, resources, templates, context.pageSize, stamps);
    pages.push(page);
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
  resources: OfdPageResources,
  templateXmls: string[] = [],
  defaultPageSize?: { width: number; height: number },
  stamps: OfdImageObject[] = []
): OfdPagePreview {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return { name, width: 210, height: 297, objects: [], texts: [], paths: [], lines: [], images: [], stamps };
  }
  const pageSize = parseOfdPageSize(doc, defaultPageSize);
  const templatePages = templateXmls.map((templateXml) => {
    const templateDoc = new DOMParser().parseFromString(templateXml, "application/xml");
    return templateDoc.querySelector("parsererror") ? emptyOfdPageContent() : parseOfdPageContent(templateDoc, resources);
  });
  const pageContent = parseOfdPageContent(doc, resources);
  const texts = [...templatePages.flatMap((page) => page.texts), ...pageContent.texts];
  const paths = [...templatePages.flatMap((page) => page.paths), ...pageContent.paths];
  const lines = [...templatePages.flatMap((page) => page.lines), ...pageContent.lines];
  const imageObjects = [...templatePages.flatMap((page) => page.images), ...pageContent.images];
  const objects = [...templatePages.flatMap((page) => page.objects), ...pageContent.objects];
  if (pageSize.explicit) {
    return { name, width: pageSize.width, height: pageSize.height, objects, texts, paths, lines, images: imageObjects, stamps };
  }
  const bounds = createOfdBounds(texts, paths, lines, [...imageObjects, ...stamps]);
  const width = Math.max(pageSize.width, ...bounds.map((item) => item.x + item.width + 12));
  const height = Math.max(pageSize.height, ...bounds.map((item) => item.y + item.height + 12));
  return { name, width, height, objects, texts, paths, lines, images: imageObjects, stamps };
}

function parseOfdPageContent(
  doc: Document,
  resources: OfdPageResources
): Omit<OfdPagePreview, "name" | "width" | "height" | "stamps"> {
  const objects: OfdPageObject[] = [];
  for (const element of Array.from(doc.getElementsByTagName("*"))) {
    if (element.localName === "TextObject") {
      objects.push(...parseOfdTextObject(element, resources).map((item): OfdPageObject => ({ type: "text", item })));
      continue;
    }
    if (element.localName === "PathObject") {
      objects.push(...parseOfdPathObject(element, resources).map((item): OfdPageObject => ({ type: "path", item })));
      continue;
    }
    if (element.localName === "LineObject") {
      objects.push(...parseOfdLineObject(element, resources).map((item): OfdPageObject => ({ type: "line", item })));
      continue;
    }
    if (element.localName === "ImageObject") {
      objects.push(...parseOfdImageObject(element, resources.images).map((item): OfdPageObject => ({ type: "image", item })));
    }
  }
  return {
    objects,
    texts: objects.filter((object): object is { type: "text"; item: OfdTextObject } => object.type === "text").map((object) => object.item),
    paths: objects.filter((object): object is { type: "path"; item: OfdPathObject } => object.type === "path").map((object) => object.item),
    lines: objects.filter((object): object is { type: "line"; item: OfdLineObject } => object.type === "line").map((object) => object.item),
    images: objects.filter((object): object is { type: "image"; item: OfdImageObject } => object.type === "image").map((object) => object.item)
  };
}

function emptyOfdPageContent(): Omit<OfdPagePreview, "name" | "width" | "height" | "stamps"> {
  return { objects: [], texts: [], paths: [], lines: [], images: [] };
}

function createOfdBounds(
  texts: OfdTextObject[],
  paths: OfdPathObject[],
  lines: OfdLineObject[],
  imageObjects: OfdImageObject[]
): Array<{ x: number; y: number; width: number; height: number }> {
  return [
    ...texts.map((item) => ({ x: item.boundsX ?? item.x, y: item.boundsY ?? item.y, width: item.width, height: item.height })),
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

function parseOfdTextObject(element: Element, resources: OfdPageResources): OfdTextObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const drawParam = resolveOfdDrawParam(element, resources.drawParams);
  const size = finiteNumber(getOfdAttribute(element, "Size"), Math.max(4, boundary.height || 5));
  const color =
    parseOfdColorElement(findOfdChild(element, "FillColor")) ||
    parseOfdColorElement(findOfdChild(element, "StrokeColor")) ||
    drawParam?.fillColor ||
    "#111827";
  const weight = finiteNumber(getOfdAttribute(element, "Weight"), 400) >= 600 ? "700" : "400";
  const fontFamily = fontStackForOfdFont(resources.fonts.get(getOfdAttribute(element, "Font") || ""));
  const objectLetterSpacing = getOfdAttribute(element, "DeltaX") ? 0.5 : undefined;
  const ctm = parseOfdCtm(getOfdAttribute(element, "CTM"));
  const transform = ctm ? createOfdPathTransform(boundary.x, boundary.y, ctm) : undefined;
  const textCodes = Array.from(element.getElementsByTagName("*")).filter((child) => child.localName === "TextCode");
  if (textCodes.length === 0) {
    return [];
  }
  return textCodes.flatMap((code): OfdTextObject[] => {
    // CTM 存在时坐标保持相对 Boundary，由 transform 完成平移与矩阵变换
    const x = (transform ? 0 : boundary.x) + finiteNumber(getOfdAttribute(code, "X"), 0);
    const y = (transform ? 0 : boundary.y) + finiteNumber(getOfdAttribute(code, "Y"), 0);
    // TextCode whitespace is layout data. In particular, leading spaces can
    // carry explicit DeltaX positions before a trailing date or number.
    const text = decodeOfdTextEscapes(code.textContent || "");
    const deltaX = parseOfdDeltaX(getOfdAttribute(code, "DeltaX"));
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
        transform,
        boundsX: transform ? boundary.x : undefined,
        boundsY: transform ? boundary.y : undefined
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
        transform,
        boundsX: transform ? boundary.x : undefined,
        boundsY: transform ? boundary.y : undefined
      }
    ];
  }).filter((item) => item.text);
}

// OFD 规范：LineWidth 缺省 0.353mm；Stroke 缺省 true；Fill 缺省 false——
// 发票类文件常给描边网格线附带 FillColor，若据其存在就填充会把表格涂成大色块
const OFD_DEFAULT_LINE_WIDTH = 0.353;

function parseOfdPathObject(element: Element, resources: OfdPageResources): OfdPathObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const ctm = parseOfdCtm(getOfdAttribute(element, "CTM"));
  const drawParam = resolveOfdDrawParam(element, resources.drawParams);
  const commands = getDirectOfdChildren(element, "AbbreviatedData", "PathData");
  const raw = commands.map((child) => child.textContent || "").join(" ").trim();
  if (!raw) {
    return [];
  }
  const stroke =
    parseOfdBoolean(getOfdAttribute(element, "Stroke")) === false
      ? "none"
      : parseOfdColorElement(findOfdChild(element, "StrokeColor")) || drawParam?.strokeColor || "#111827";
  // FillColor 存在但无法解析（如调色板 Index 引用）时宁可不填充，避免误涂深色块
  const fillColorChild = findOfdChild(element, "FillColor");
  const fill =
    parseOfdBoolean(getOfdAttribute(element, "Fill")) === true
      ? fillColorChild
        ? parseOfdColorElement(fillColorChild) || "transparent"
        : drawParam?.fillColor || "#111827"
      : "transparent";
  return [
    {
      d: normalizeOfdPathData(raw),
      x: boundary.x,
      y: boundary.y,
      width: boundary.width,
      height: boundary.height,
      stroke,
      fill,
      fillRule: /even/i.test(getOfdAttribute(element, "Rule") || "") ? "evenodd" : undefined,
      strokeWidth: finiteNumber(getOfdAttribute(element, "LineWidth"), drawParam?.lineWidth ?? OFD_DEFAULT_LINE_WIDTH),
      transform: createOfdPathTransform(boundary.x, boundary.y, ctm)
    }
  ];
}

function parseOfdLineObject(element: Element, resources: OfdPageResources): OfdLineObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const drawParam = resolveOfdDrawParam(element, resources.drawParams);
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
      stroke:
        parseOfdColorElement(findOfdChild(element, "StrokeColor")) ||
        parseOfdColorElement(findOfdChild(element, "FillColor")) ||
        drawParam?.strokeColor ||
        "#111827",
      strokeWidth: finiteNumber(getOfdAttribute(element, "LineWidth"), drawParam?.lineWidth ?? OFD_DEFAULT_LINE_WIDTH)
    }
  ];
}

function parseOfdImageObject(element: Element, images: Map<string, string>): OfdImageObject[] {
  const boundary = parseBoundary(getOfdAttribute(element, "Boundary"));
  const ctm = parseOfdCtm(getOfdAttribute(element, "CTM"));
  const simpleCtmBounds = ctm ? createSimpleOfdImageCtmBounds(boundary, ctm) : undefined;
  const resourceId = getOfdAttribute(element, "ResourceID") || getOfdAttribute(element, "ResourceId") || "";
  return [
    {
      x: simpleCtmBounds?.x ?? (ctm ? 0 : boundary.x),
      y: simpleCtmBounds?.y ?? (ctm ? 0 : boundary.y),
      width: simpleCtmBounds?.width ?? (ctm ? 1 : boundary.width || 32),
      height: simpleCtmBounds?.height ?? (ctm ? 1 : boundary.height || 32),
      resourceId,
      href: images.get(resourceId),
      transform: ctm && !simpleCtmBounds ? createOfdPathTransform(boundary.x, boundary.y, ctm) : undefined
    }
  ];
}

function createSimpleOfdImageCtmBounds(
  boundary: { x: number; y: number; width: number; height: number },
  ctm: [number, number, number, number, number, number]
): { x: number; y: number; width: number; height: number } | undefined {
  const [a, b, c, d, e, f] = ctm;
  if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6 || a <= 0 || d <= 0) {
    return undefined;
  }
  return {
    x: boundary.x + e,
    y: boundary.y + f,
    width: a,
    height: d
  };
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

  for (const object of page.objects) {
    if (object.type === "path") {
      appendOfdPath(svg, object.item);
      continue;
    }
    if (object.type === "line") {
      appendOfdLine(svg, object.item);
      continue;
    }
    if (object.type === "text") {
      appendOfdText(svg, object.item);
      continue;
    }
    appendOfdImage(svg, object.item);
  }

  for (const item of page.stamps) {
    appendOfdImage(svg, item);
  }

  figure.append(svg);
  return figure;
}

function appendOfdPath(svg: SVGElement, item: OfdPathObject): void {
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", item.d);
  path.setAttribute("transform", item.transform);
  path.setAttribute("fill", item.fill);
  if (item.fillRule) {
    path.setAttribute("fill-rule", item.fillRule);
  }
  path.setAttribute("stroke", item.stroke);
  path.setAttribute("stroke-width", String(item.strokeWidth));
  svg.append(path);
}

function appendOfdLine(svg: SVGElement, item: OfdLineObject): void {
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

function appendOfdText(svg: SVGElement, item: OfdTextObject): void {
  const text = document.createElementNS(svg.namespaceURI, "text");
  text.setAttribute("x", String(item.x));
  text.setAttribute("y", String(item.y));
  if (item.transform) {
    text.setAttribute("transform", item.transform);
  }
  text.setAttribute("font-size", String(item.size));
  text.setAttribute("fill", item.color);
  text.setAttribute("font-weight", item.weight);
  text.setAttribute("font-family", item.fontFamily);
  if (item.letterSpacing !== undefined) {
    text.setAttribute("letter-spacing", String(item.letterSpacing));
  }
  if (item.deltaX && item.deltaX.length > 0) {
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
    text.textContent = item.text;
  }
  svg.append(text);
}

function appendOfdImage(svg: SVGElement, item: OfdImageObject): void {
  if (item.href) {
    const image = document.createElementNS(svg.namespaceURI, "image");
    image.setAttribute("x", String(item.x));
    image.setAttribute("y", String(item.y));
    image.setAttribute("width", String(item.width));
    image.setAttribute("height", String(item.height));
    image.setAttribute("href", item.href);
    if (item.transform) {
      image.setAttribute("transform", item.transform);
    }
    image.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.append(image);
  } else {
    const placeholder = document.createElementNS(svg.namespaceURI, "rect");
    placeholder.setAttribute("x", String(item.x));
    placeholder.setAttribute("y", String(item.y));
    placeholder.setAttribute("width", String(item.width));
    placeholder.setAttribute("height", String(item.height));
    if (item.transform) {
      placeholder.setAttribute("transform", item.transform);
    }
    placeholder.setAttribute("fill", "#f8fafc");
    placeholder.setAttribute("stroke", "#94a3b8");
    placeholder.setAttribute("stroke-dasharray", "4 3");
    svg.append(placeholder);
  }
}

async function readOfdContext(entries: JSZip.JSZipObject[]): Promise<OfdContext> {
  const images = await readOfdImages(entries);
  const fonts = await readOfdFonts(entries);
  const drawParams = await readOfdDrawParams(entries);
  const { templates, pageOrder, pageSize, pagePaths } = await readOfdDocumentInfo(entries);
  const stampsByPage = await readOfdStamps(entries, pagePaths);
  return { images, templates, fonts, drawParams, pageOrder, pageSize, stampsByPage };
}

async function readOfdDrawParams(entries: JSZip.JSZipObject[]): Promise<Map<string, OfdDrawParam>> {
  const raw = new Map<string, { relative?: string; own: OfdDrawParam }>();
  for (const entry of entries.filter((item) => /(?:^|\/)(?:DocumentRes|PublicRes)\.xml$/i.test(item.name))) {
    const doc = new DOMParser().parseFromString(await entry.async("text"), "application/xml");
    if (doc.querySelector("parsererror")) {
      continue;
    }
    for (const param of Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "DrawParam")) {
      const id = getOfdAttribute(param, "ID");
      if (!id) {
        continue;
      }
      const lineWidthAttr = getOfdAttribute(param, "LineWidth");
      const lineWidth = lineWidthAttr === null ? Number.NaN : Number(lineWidthAttr);
      raw.set(id, {
        relative: getOfdAttribute(param, "Relative") || undefined,
        own: {
          lineWidth: Number.isFinite(lineWidth) ? lineWidth : undefined,
          strokeColor: parseOfdColorElement(findOfdChild(param, "StrokeColor")),
          fillColor: parseOfdColorElement(findOfdChild(param, "FillColor"))
        }
      });
    }
  }
  const resolved = new Map<string, OfdDrawParam>();
  const resolve = (id: string, seen: Set<string>): OfdDrawParam => {
    const cached = resolved.get(id);
    if (cached) {
      return cached;
    }
    const item = raw.get(id);
    if (!item || seen.has(id)) {
      return {};
    }
    seen.add(id);
    const base = item.relative ? resolve(item.relative, seen) : {};
    const merged: OfdDrawParam = {
      lineWidth: item.own.lineWidth ?? base.lineWidth,
      strokeColor: item.own.strokeColor ?? base.strokeColor,
      fillColor: item.own.fillColor ?? base.fillColor
    };
    resolved.set(id, merged);
    return merged;
  };
  for (const id of raw.keys()) {
    resolve(id, new Set());
  }
  return resolved;
}

// DrawParam 可挂在图元自身，也可挂在其所属 Layer/PageBlock 上，就近生效
function resolveOfdDrawParam(element: Element, drawParams: Map<string, OfdDrawParam>): OfdDrawParam | undefined {
  if (drawParams.size === 0) {
    return undefined;
  }
  let current: Element | null = element;
  while (current) {
    const id = getOfdAttribute(current, "DrawParam");
    if (id) {
      return drawParams.get(id);
    }
    current = current.parentElement;
  }
  return undefined;
}

async function readOfdStamps(
  entries: JSZip.JSZipObject[],
  pagePaths: Map<string, string>
): Promise<Map<string, OfdImageObject[]>> {
  const stamps = new Map<string, OfdImageObject[]>();
  for (const entry of entries.filter((item) => /(?:^|\/)Signatures\.xml$/i.test(item.name))) {
    const doc = new DOMParser().parseFromString(await entry.async("text"), "application/xml");
    if (doc.querySelector("parsererror")) {
      continue;
    }
    const signaturesDir = directoryName(entry.name);
    for (const signature of Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "Signature")) {
      const baseLoc = getOfdAttribute(signature, "BaseLoc");
      const signatureEntry = baseLoc
        ? findOfdEntry(entries, joinOfdPath(signaturesDir, baseLoc)) || findOfdEntry(entries, baseLoc)
        : undefined;
      if (!signatureEntry) {
        continue;
      }
      const signatureDoc = new DOMParser().parseFromString(await signatureEntry.async("text"), "application/xml");
      if (signatureDoc.querySelector("parsererror")) {
        continue;
      }
      const signatureElements = Array.from(signatureDoc.getElementsByTagName("*"));
      const signatureDir = directoryName(signatureEntry.name);
      const signedValueLoc = signatureElements.find((element) => element.localName === "SignedValue")?.textContent?.trim() || "SignedValue.dat";
      const signedValueEntry =
        findOfdEntry(entries, joinOfdPath(signatureDir, signedValueLoc)) || findOfdEntry(entries, signedValueLoc);
      const href = signedValueEntry ? extractOfdStampImage(await signedValueEntry.async("uint8array")) : undefined;
      // Certificate-only signatures have a placement boundary but no visual
      // seal payload. Do not turn that boundary into a broken-image box.
      if (!href) {
        continue;
      }
      for (const annot of signatureElements.filter((element) => element.localName === "StampAnnot")) {
        const boundary = parseBoundary(getOfdAttribute(annot, "Boundary"));
        const pageRef = getOfdAttribute(annot, "PageRef");
        const pagePath = pageRef ? pagePaths.get(pageRef) : undefined;
        const pageEntry = pagePath ? findOfdEntry(entries, pagePath) : undefined;
        if (!pageEntry || boundary.width <= 0 || boundary.height <= 0) {
          continue;
        }
        const key = normalizeOfdPath(pageEntry.name);
        const list = stamps.get(key) || [];
        list.push({ x: boundary.x, y: boundary.y, width: boundary.width, height: boundary.height, resourceId: "", href });
        stamps.set(key, list);
      }
    }
  }
  return stamps;
}

function extractOfdStampImage(bytes: Uint8Array): string | undefined {
  const pngStart = indexOfOfdBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (pngStart >= 0) {
    const iend = indexOfOfdBytes(bytes, [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], pngStart);
    const end = iend >= 0 ? iend + 8 : bytes.length;
    return ofdBytesToDataUrl("image/png", bytes.subarray(pngStart, end));
  }
  const jpegStart = indexOfOfdBytes(bytes, [0xff, 0xd8, 0xff]);
  if (jpegStart >= 0) {
    let end = bytes.length;
    for (let index = bytes.length - 2; index > jpegStart; index -= 1) {
      if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
        end = index + 2;
        break;
      }
    }
    return ofdBytesToDataUrl("image/jpeg", bytes.subarray(jpegStart, end));
  }
  return undefined;
}

function indexOfOfdBytes(bytes: Uint8Array, pattern: number[], fromIndex = 0): number {
  outer: for (let index = fromIndex; index <= bytes.length - pattern.length; index += 1) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) {
        continue outer;
      }
    }
    return index;
  }
  return -1;
}

function ofdBytesToDataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
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

async function readOfdDocumentInfo(entries: JSZip.JSZipObject[]): Promise<{
  templates: Map<string, string>;
  pageOrder: string[];
  pageSize?: { width: number; height: number };
  pagePaths: Map<string, string>;
}> {
  const templates = new Map<string, string>();
  const pageOrder: string[] = [];
  const pagePaths = new Map<string, string>();
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
    for (const pageElement of Array.from(doc.getElementsByTagName("*")).filter((element) => element.localName === "Page")) {
      const id = getOfdAttribute(pageElement, "ID");
      const baseLoc = getOfdAttribute(pageElement, "BaseLoc");
      if (id && baseLoc) {
        const pagePath = joinOfdPath(documentDir, baseLoc);
        pagePaths.set(id, pagePath);
        pageOrder.push(pagePath);
      }
    }
  }
  return { templates, pageOrder, pageSize, pagePaths };
}

function parseOfdPageSize(doc: Document, defaultPageSize?: { width: number; height: number }): { width: number; height: number; explicit: boolean } {
  const physicalBox = Array.from(doc.getElementsByTagName("*")).find((element) => element.localName === "PhysicalBox");
  if (physicalBox?.textContent) {
    const box = parseBoundary(physicalBox.textContent);
    if (box.width > 0 && box.height > 0) {
      return { width: box.width, height: box.height, explicit: true };
    }
  }
  if (defaultPageSize) {
    return { ...defaultPageSize, explicit: true };
  }
  return { width: 210, height: 297, explicit: false };
}

function parseOfdColorElement(colorElement: Element | undefined): string | undefined {
  const value = colorElement ? getOfdAttribute(colorElement, "Value") : null;
  if (!colorElement || !value) {
    return undefined;
  }
  const parts = value.trim().split(/\s+/).map((part) => Number(part));
  // 单通道为灰度色（GB/T 33190 允许 1 通道颜色空间）
  const rgbParts = parts.length === 1 && Number.isFinite(parts[0]) ? [parts[0], parts[0], parts[0]] : parts;
  if (rgbParts.length >= 3 && rgbParts.every((part) => Number.isFinite(part))) {
    const channels = rgbParts.slice(0, 3).map((part) => Math.max(0, Math.min(255, part))).join(" ");
    const alpha = parseOfdAlpha(getOfdAttribute(colorElement, "Alpha"));
    if (alpha <= 0) {
      return "transparent";
    }
    return alpha >= 1 ? `rgb(${channels})` : `rgb(${channels} / ${formatOfdCssNumber(alpha)})`;
  }
  return undefined;
}

function parseOfdAlpha(value: string | null): number {
  const parsed = value === null ? Number.NaN : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(0, Math.min(255, parsed)) / 255;
}

function parseOfdBoolean(value: string | null): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return undefined;
}

function findOfdChild(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => child.localName === localName);
}

function getDirectOfdChildren(element: Element, ...localNames: string[]): Element[] {
  const allowed = new Set(localNames);
  return Array.from(element.children).filter((child) => allowed.has(child.localName));
}

function parsePoint(value: string | null, fallback: { x: number; y: number }): { x: number; y: number } {
  const parts = (value || "").trim().split(/\s+/).map((part) => Number(part));
  return {
    x: Number.isFinite(parts[0]) ? parts[0] : fallback.x,
    y: Number.isFinite(parts[1]) ? parts[1] : fallback.y
  };
}

// OFD 图形操作符与 SVG 不同：S=起始点(等价 moveto)、B=三次贝塞尔、C=闭合子路径
const OFD_PATH_COMMAND_MAP: Record<string, string> = {
  S: "M",
  M: "M",
  L: "L",
  Q: "Q",
  B: "C",
  A: "A",
  C: "Z",
  Z: "Z"
};

function normalizeOfdPathData(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => (/^[a-zA-Z]$/.test(token) ? OFD_PATH_COMMAND_MAP[token.toUpperCase()] || token : token))
    .join(" ");
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

function decodeOfdTextEscapes(value: string): string {
  if (!value.includes("\\")) {
    return value;
  }
  return value.replace(/\\(?:0[xX]([0-9a-fA-F]{4})|u([0-9a-fA-F]{4})|\\)/g, (match, hex: string | undefined, unicode: string | undefined) => {
    const digits = hex || unicode;
    if (!digits) {
      return "\\";
    }
    return String.fromCodePoint(Number.parseInt(digits, 16));
  });
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
  if (normalized.includes("times")) {
    return '"Times New Roman", Times, "Songti SC", STSong, serif';
  }
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
