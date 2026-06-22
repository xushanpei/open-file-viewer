import type { CadBinaryPreviewContext } from "./cad";
import type { PreviewInstance } from "../types";

type LibreDwgModule = {
  Dwg_File_Type: {
    DWG: number;
  };
  LibreDwg: {
    create(filepath?: string): Promise<LibreDwgValue>;
  };
};

type LibreDwgValue = {
  dwg_read_data(fileContent: ArrayBuffer, fileType: number): number;
  dwg_bmp(data: number): DwgThumbnail | null;
  convertEx(data: number): {
    database: DwgDatabase;
    stats: {
      unknownEntityCount: number;
    };
  };
  dwg_to_svg(database: DwgDatabase): string;
  dwg_free(data: number): void;
};

type DwgThumbnail = {
  data: Uint8Array;
  type: number;
};

type DwgDatabase = {
  entities: Array<{
    isInPaperSpace?: boolean;
  }>;
  tables: {
    LAYER: {
      entries: Array<{
        off?: boolean;
        frozen?: boolean;
      }>;
    };
  };
  objects: {
    LAYOUT: Array<{
      layoutName?: string;
    }>;
  };
};

export interface LibreDwgPreviewOptions {
  /**
   * Enable the built-in LibreDWG WASM preview for DWG files.
   *
   * It is best-effort and intentionally lower priority than `binaryRenderer`.
   */
  enabled?: boolean;
  /**
   * Public URL that contains libredwg-web.wasm.
   *
   * Example: `/vendor/libredwg-web`
   */
  wasmBaseUrl?: string;
}

type DwgPreviewStats = {
  entityCount: number;
  layerCount: number;
  layoutCount: number;
  unknownEntityCount: number;
  visibleLayerCount: number;
  paperSpaceEntityCount: number;
  hasThumbnail: boolean;
};

type DwgSvgBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

type DwgSvgReliability = {
  isReliable: boolean;
  reason?: string;
};

let libreDwgPromise: Promise<LibreDwgModule> | undefined;

const defaultLibreDwgWasmBaseUrl = "/vendor/libredwg-web";
const minReadableDrawingHeight = 420;
const libreDwgPackageName = "@mlightcad/libredwg-web";
const svgNumberPattern = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

export async function renderLibreDwgPreview(
  ctx: CadBinaryPreviewContext,
  options: LibreDwgPreviewOptions = {}
): Promise<PreviewInstance | void> {
  if (ctx.extension !== "dwg" || options.enabled === false) {
    return undefined;
  }

  const shell = document.createElement("div");
  shell.className = "ofv-dwg-preview";
  const status = document.createElement("div");
  status.className = "ofv-dwg-preview-status";
  status.textContent = "Loading DWG rendering engine...";
  shell.append(status);
  ctx.panel.append(shell);

  try {
    const { LibreDwg, Dwg_File_Type } = await loadLibreDwg();
    const libredwg = await LibreDwg.create(options.wasmBaseUrl || defaultLibreDwgWasmBaseUrl);
    const data = libredwg.dwg_read_data(ctx.arrayBuffer, Dwg_File_Type.DWG);
    if (!data) {
      throw new Error("DWG parser did not return drawing data.");
    }

    let svg = "";
    let stats: DwgPreviewStats;
    let thumbnailUrl: string | undefined;
    try {
      thumbnailUrl = createDwgThumbnailUrl(readDwgThumbnail(libredwg, data));
      try {
        const result = libredwg.convertEx(data);
        const database = result.database;
        stats = createDwgPreviewStats(database, result.stats.unknownEntityCount, Boolean(thumbnailUrl));
        svg = libredwg.dwg_to_svg(database);
      } catch (error) {
        if (thumbnailUrl) {
          const fallbackThumbnailUrl = thumbnailUrl;
          status.replaceChildren(createDwgThumbnailFallbackStatus(ctx.fileName, error));
          shell.append(createDwgThumbnailPreview(fallbackThumbnailUrl, ctx.fileName));
          return {
            destroy() {
              URL.revokeObjectURL(fallbackThumbnailUrl);
              shell.remove();
            }
          };
        }
        throw error;
      }
    } finally {
      libredwg.dwg_free(data);
    }

    if (!svg || !/<svg[\s>]/i.test(svg)) {
      if (thumbnailUrl) {
        const fallbackThumbnailUrl = thumbnailUrl;
        status.replaceChildren(createDwgThumbnailFallbackStatus(ctx.fileName, "DWG parser finished but did not produce SVG output."));
        shell.append(createDwgThumbnailPreview(fallbackThumbnailUrl, ctx.fileName));
        return {
          destroy() {
            URL.revokeObjectURL(fallbackThumbnailUrl);
            shell.remove();
          }
        };
      }
      throw new Error("DWG parser finished but did not produce SVG output.");
    }

    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    const svgElement = doc.documentElement;
    if (!(svgElement instanceof SVGElement) || svgElement.nodeName.toLowerCase() !== "svg" || svgElement.querySelector("parsererror")) {
      throw new Error("DWG SVG output is invalid.");
    }

    svgElement.classList.add("ofv-dwg-preview-svg");
    svgElement.setAttribute("role", "img");
    svgElement.setAttribute("aria-label", ctx.fileName);
    normalizeDwgSvg(svgElement);
    const reliability = assessDwgSvgReliability(svgElement);
    status.replaceChildren(createDwgStatusTitle(ctx.fileName, stats, reliability));

    if (!reliability.isReliable && thumbnailUrl) {
      shell.append(createDwgThumbnailPreview(thumbnailUrl, ctx.fileName));
      return {
        destroy() {
          URL.revokeObjectURL(thumbnailUrl);
          shell.remove();
        }
      };
    }

    const drawing = createDwgDrawingViewport(svgElement);
    if (thumbnailUrl) {
      shell.append(createDwgThumbnailPanel(thumbnailUrl));
    }
    shell.append(drawing.frame);
    return {
      resize() {
        drawing.update();
      },
      canCommand(command) {
        return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
      },
      command(command) {
        if (command === "zoom-in") {
          drawing.setZoom(drawing.zoom * 1.18);
          return true;
        }
        if (command === "zoom-out") {
          drawing.setZoom(drawing.zoom / 1.18);
          return true;
        }
        if (command === "zoom-reset") {
          drawing.setZoom(1);
          return true;
        }
        return false;
      },
      destroy() {
        if (thumbnailUrl) {
          URL.revokeObjectURL(thumbnailUrl);
        }
        shell.remove();
      }
    };
  } catch (error) {
    shell.remove();
    console.warn("DWG LibreDWG preview failed, falling back to metadata preview:", error);
    return undefined;
  }
}

function loadLibreDwg(): Promise<LibreDwgModule> {
  libreDwgPromise ||= importOptionalModule<LibreDwgModule>(libreDwgPackageName);
  return libreDwgPromise;
}

function importOptionalModule<T>(packageName: string): Promise<T> {
  return new Function("packageName", "return import(packageName)")(packageName) as Promise<T>;
}

function createDwgStatusTitle(fileName: string, stats: DwgPreviewStats, reliability: DwgSvgReliability): HTMLElement {
  const wrapper = document.createElement("span");
  const title = document.createElement("strong");
  const note = document.createElement("small");
  title.textContent = reliability.isReliable ? `实验性 DWG 模型空间预览 · ${fileName}` : `DWG 内置预览图 · ${fileName}`;
  note.textContent = [
    `${stats.entityCount.toLocaleString()} 个实体`,
    `${stats.visibleLayerCount}/${stats.layerCount} 个可见图层`,
    `${stats.layoutCount} 个布局`,
    stats.paperSpaceEntityCount ? `${stats.paperSpaceEntityCount.toLocaleString()} 个图纸空间实体` : "模型空间线稿",
    stats.unknownEntityCount ? `${stats.unknownEntityCount} 个未知实体` : "实体解析完整",
    stats.hasThumbnail ? "包含内置缩略图" : "无内置缩略图"
  ].join(" · ");
  const warning = document.createElement("small");
  warning.textContent = reliability.isReliable
    ? "当前为 LibreDWG WASM 线稿预览，复杂布局/打印空间/字体/填充与专业 CAD 仍可能存在差异。"
    : `LibreDWG 线稿检测到异常图元，已优先显示文件内置预览图。${reliability.reason ?? ""}`;
  wrapper.append(title, note, warning);
  return wrapper;
}

function createDwgThumbnailFallbackStatus(fileName: string, error: unknown): HTMLElement {
  const wrapper = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = `DWG 内置预览图 · ${fileName}`;
  const note = document.createElement("small");
  note.textContent = "LibreDWG 已读取到文件内置缩略图，但线稿预览未能生成，已自动切换为缩略图兜底。";
  const detail = document.createElement("small");
  detail.textContent = error instanceof Error ? error.message : String(error || "未知解析错误");
  wrapper.append(title, note, detail);
  return wrapper;
}

function createDwgPreviewStats(database: DwgDatabase, unknownEntityCount: number, hasThumbnail: boolean): DwgPreviewStats {
  const layers = database.tables.LAYER.entries;
  return {
    entityCount: database.entities.length,
    layerCount: layers.length,
    layoutCount: database.objects.LAYOUT.length,
    unknownEntityCount,
    visibleLayerCount: layers.filter((layer) => !layer.off && !layer.frozen).length,
    paperSpaceEntityCount: database.entities.filter((entity) => entity.isInPaperSpace).length,
    hasThumbnail
  };
}

function readDwgThumbnail(libredwg: LibreDwgValue, data: number): DwgThumbnail | undefined {
  try {
    const thumbnail = libredwg.dwg_bmp(data);
    if (!thumbnail?.data?.length) {
      return undefined;
    }
    return thumbnail;
  } catch {
    return undefined;
  }
}

function createDwgThumbnailUrl(thumbnail: DwgThumbnail | undefined): string | undefined {
  if (!thumbnail) {
    return undefined;
  }
  if (thumbnail.type === 6) {
    return URL.createObjectURL(new Blob([toArrayBuffer(thumbnail.data)], { type: "image/png" }));
  }
  if (thumbnail.type === 2) {
    return URL.createObjectURL(new Blob([toArrayBuffer(createBmpFileBytes(thumbnail.data))], { type: "image/bmp" }));
  }
  return undefined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function createBmpFileBytes(dibBytes: Uint8Array): Uint8Array {
  const view = new DataView(dibBytes.buffer, dibBytes.byteOffset, dibBytes.byteLength);
  const headerSize = view.getUint32(0, true);
  const bitCount = view.getUint16(14, true);
  const paletteBytes = bitCount <= 8 ? 2 ** bitCount * 4 : 0;
  const pixelOffset = 14 + headerSize + paletteBytes;
  const bytes = new Uint8Array(14 + dibBytes.byteLength);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  const fileView = new DataView(bytes.buffer);
  fileView.setUint32(2, bytes.byteLength, true);
  fileView.setUint32(10, pixelOffset, true);
  bytes.set(dibBytes, 14);
  return bytes;
}

function createDwgThumbnailPanel(thumbnailUrl: string): HTMLElement {
  const panel = document.createElement("figure");
  panel.className = "ofv-dwg-thumbnail";
  const image = document.createElement("img");
  image.src = thumbnailUrl;
  image.alt = "DWG 文件内置缩略图";
  const caption = document.createElement("figcaption");
  caption.textContent = "文件内置缩略图";
  panel.append(image, caption);
  return panel;
}

function createDwgThumbnailPreview(thumbnailUrl: string, fileName: string): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "ofv-dwg-thumbnail-preview";
  const image = document.createElement("img");
  image.src = thumbnailUrl;
  image.alt = `${fileName} 内置预览图`;
  const caption = document.createElement("figcaption");
  caption.textContent = "DWG 文件内置预览图。若需要接近 CAD 布局/打印空间的高保真效果，请使用同名 PNG、SVG、PDF 导出图，或通过 binaryRenderer 接入专业 CAD 渲染/转换服务。";
  figure.append(image, caption);
  return figure;
}

function normalizeDwgSvg(svgElement: SVGElement): void {
  svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  removeInheritedDwgFills(svgElement);
  focusDwgSvgOnMainDrawing(svgElement);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .ofv-dwg-preview-svg { background: #020617; }
    .ofv-dwg-preview-svg g {
      fill: none !important;
    }
    .ofv-dwg-preview-svg line,
    .ofv-dwg-preview-svg path,
    .ofv-dwg-preview-svg polyline,
    .ofv-dwg-preview-svg polygon,
    .ofv-dwg-preview-svg circle,
    .ofv-dwg-preview-svg ellipse,
    .ofv-dwg-preview-svg rect {
      fill: none !important;
      vector-effect: non-scaling-stroke;
      stroke-width: 0.7px !important;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .ofv-dwg-preview-svg [stroke="rgb(0,255,0)"] {
      stroke: #34d399 !important;
      stroke-opacity: 0.58 !important;
    }
    .ofv-dwg-preview-svg text {
      vector-effect: non-scaling-stroke;
      stroke-width: 0 !important;
      fill: currentColor !important;
    }
  `;
  svgElement.prepend(style);
}

function removeInheritedDwgFills(svgElement: SVGElement): void {
  const shapeSelector = "line,path,polyline,polygon,circle,ellipse,rect";
  for (const group of svgElement.querySelectorAll<SVGGElement>("g[fill]")) {
    group.setAttribute("fill", "none");
  }
  for (const styledElement of svgElement.querySelectorAll<SVGElement>("[style]")) {
    styledElement.style.fill = "none";
  }
  for (const shape of svgElement.querySelectorAll<SVGElement>(shapeSelector)) {
    shape.setAttribute("fill", "none");
  }
}

function assessDwgSvgReliability(svgElement: SVGElement): DwgSvgReliability {
  const bounds = readSvgViewBox(svgElement);
  if (!bounds) {
    return { isReliable: true };
  }

  const largePathCount = countLargeSvgPaths(svgElement, bounds);
  const totalPathCount = svgElement.querySelectorAll("path").length;
  if (largePathCount >= 24 && totalPathCount > 0 && largePathCount / totalPathCount > 0.08) {
    return {
      isReliable: false,
      reason: "该文件包含大量超出主体视口的大路径/块参照，线稿模式会明显偏离 CAD 布局。"
    };
  }

  return { isReliable: true };
}

function countLargeSvgPaths(svgElement: SVGElement, bounds: DwgSvgBounds): number {
  let count = 0;
  const viewportArea = bounds.width * bounds.height;
  if (!Number.isFinite(viewportArea) || viewportArea <= 0) {
    return count;
  }

  for (const path of svgElement.querySelectorAll<SVGPathElement>("path")) {
    if (path.closest("defs")) {
      continue;
    }
    const pathBounds = estimatePathBounds(path);
    if (!pathBounds) {
      continue;
    }
    const pathArea = pathBounds.width * pathBounds.height;
    const crossesViewport = pathBounds.minX <= bounds.minX + bounds.width * 0.02 || pathBounds.minY <= bounds.minY + bounds.height * 0.02;
    if (pathArea > viewportArea * 0.28 || (crossesViewport && pathArea > viewportArea * 0.12)) {
      count += 1;
    }
  }

  return count;
}

function estimatePathBounds(path: SVGPathElement): DwgSvgBounds | undefined {
  const numbers = readNumbers(path.getAttribute("d") ?? "");
  if (numbers.length < 4) {
    return undefined;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    const x = numbers[index];
    const y = numbers[index + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1_000_000_000 || Math.abs(y) > 1_000_000_000) {
      continue;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return undefined;
  }

  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

function focusDwgSvgOnMainDrawing(svgElement: SVGElement): void {
  const originalBounds = readSvgViewBox(svgElement);
  const mainBounds = estimateMainDrawingBounds(svgElement);
  if (!originalBounds || !mainBounds || !shouldUseMainDrawingBounds(originalBounds, mainBounds)) {
    return;
  }

  const paddedBounds = padBounds(mainBounds, 0.05);
  svgElement.dataset.originalViewBox = formatViewBox(originalBounds);
  svgElement.dataset.focusViewBox = formatViewBox(paddedBounds);
  svgElement.setAttribute("viewBox", formatViewBox(paddedBounds));
}

function shouldUseMainDrawingBounds(original: DwgSvgBounds, candidate: DwgSvgBounds): boolean {
  const originalAspectRatio = original.width / original.height;
  const candidateAspectRatio = candidate.width / candidate.height;
  const originalArea = original.width * original.height;
  const candidateArea = candidate.width * candidate.height;
  if (!Number.isFinite(originalArea) || !Number.isFinite(candidateArea) || candidateArea <= 0) {
    return false;
  }

  return (
    originalAspectRatio > 8 ||
    originalAspectRatio < 0.125 ||
    candidateArea / originalArea < 0.55 ||
    Math.abs(Math.log(originalAspectRatio / candidateAspectRatio)) > Math.log(4)
  );
}

function estimateMainDrawingBounds(svgElement: SVGElement): DwgSvgBounds | undefined {
  const points: Array<[number, number]> = [];
  const addPoint = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1_000_000_000 && Math.abs(y) < 1_000_000_000) {
      points.push([x, y]);
    }
  };

  for (const element of svgElement.querySelectorAll<SVGGeometryElement>("line,path,polyline,polygon,circle,ellipse,rect,text,use")) {
    if (element.closest("defs")) {
      continue;
    }
    collectElementPoints(element, addPoint);
  }

  if (points.length < 16) {
    return undefined;
  }

  const xs = points.map(([x]) => x).sort((a, b) => a - b);
  const ys = points.map(([, y]) => y).sort((a, b) => a - b);
  const minX = quantile(xs, 0.005);
  const maxX = quantile(xs, 0.995);
  const minY = quantile(ys, 0.005);
  const maxY = quantile(ys, 0.995);
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return undefined;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0 || height <= 0) {
    return undefined;
  }

  return { minX, minY, width, height };
}

function collectElementPoints(element: SVGElement, addPoint: (x: number, y: number) => void): void {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "line") {
    addPoint(readNumberAttribute(element, "x1"), readNumberAttribute(element, "y1"));
    addPoint(readNumberAttribute(element, "x2"), readNumberAttribute(element, "y2"));
  } else if (tagName === "circle") {
    const cx = readNumberAttribute(element, "cx");
    const cy = readNumberAttribute(element, "cy");
    const r = readNumberAttribute(element, "r");
    addPoint(cx - r, cy - r);
    addPoint(cx + r, cy + r);
  } else if (tagName === "ellipse") {
    const cx = readNumberAttribute(element, "cx");
    const cy = readNumberAttribute(element, "cy");
    const rx = readNumberAttribute(element, "rx");
    const ry = readNumberAttribute(element, "ry");
    addPoint(cx - rx, cy - ry);
    addPoint(cx + rx, cy + ry);
  } else if (tagName === "rect") {
    const x = readNumberAttribute(element, "x");
    const y = readNumberAttribute(element, "y");
    addPoint(x, y);
    addPoint(x + readNumberAttribute(element, "width"), y + readNumberAttribute(element, "height"));
  } else if (tagName === "text") {
    addPoint(readNumberAttribute(element, "x"), readNumberAttribute(element, "y"));
  } else if (tagName === "path") {
    collectNumberPairs(element.getAttribute("d"), addPoint);
  } else if (tagName === "polyline" || tagName === "polygon") {
    collectNumberPairs(element.getAttribute("points"), addPoint);
  }

  collectTranslatePoints(element.getAttribute("transform"), addPoint);
}

function collectNumberPairs(value: string | null, addPoint: (x: number, y: number) => void): void {
  if (!value) {
    return;
  }

  const numbers = readNumbers(value);
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    addPoint(numbers[index], numbers[index + 1]);
  }
}

function collectTranslatePoints(value: string | null, addPoint: (x: number, y: number) => void): void {
  if (!value) {
    return;
  }

  const translatePattern = /translate\(\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)(?:[\s,]+(-?\d*\.?\d+(?:e[-+]?\d+)?))?/gi;
  for (const match of value.matchAll(translatePattern)) {
    addPoint(Number(match[1]), Number(match[2] ?? 0));
  }
}

function readNumbers(value: string): number[] {
  const matches = value.match(svgNumberPattern);
  return matches ? matches.map((item) => Number(item)).filter(Number.isFinite) : [];
}

function readNumberAttribute(element: SVGElement, name: string): number {
  const value = Number(element.getAttribute(name) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function quantile(values: number[], ratio: number): number {
  const index = Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * ratio)));
  return values[index];
}

function padBounds(bounds: DwgSvgBounds, ratio: number): DwgSvgBounds {
  const paddingX = bounds.width * ratio;
  const paddingY = bounds.height * ratio;
  return {
    minX: bounds.minX - paddingX,
    minY: bounds.minY - paddingY,
    width: bounds.width + paddingX * 2,
    height: bounds.height + paddingY * 2
  };
}

function formatViewBox(bounds: DwgSvgBounds): string {
  return [bounds.minX, bounds.minY, bounds.width, bounds.height].map((value) => Number(value.toFixed(4))).join(" ");
}

function createDwgDrawingViewport(svgElement: SVGElement) {
  const frame = document.createElement("div");
  frame.className = "ofv-dwg-preview-frame";
  const importedSvg = document.importNode(svgElement, true);
  frame.append(importedSvg);
  const aspectRatio = readSvgAspectRatio(svgElement);
  let zoom = 1;

  const update = () => {
    const frameWidth = Math.max(frame.clientWidth, 1);
    const readableWidth = aspectRatio ? minReadableDrawingHeight * aspectRatio : frameWidth;
    const width = Math.max(frameWidth, readableWidth) * zoom;
    importedSvg.style.width = `${Math.round(width)}px`;
    importedSvg.style.minWidth = `${Math.round(width)}px`;
  };

  const setZoom = (nextZoom: number) => {
    zoom = Math.min(Math.max(nextZoom, 0.2), 8);
    update();
  };

  requestAnimationFrame(update);

  return {
    frame,
    get zoom() {
      return zoom;
    },
    setZoom,
    update
  };
}

function readSvgAspectRatio(svgElement: SVGElement): number | undefined {
  const viewBox = readSvgViewBox(svgElement);
  return viewBox ? viewBox.width / viewBox.height : undefined;
}

function readSvgViewBox(svgElement: SVGElement): DwgSvgBounds | undefined {
  const viewBox = svgElement.getAttribute("viewBox");
  if (!viewBox) {
    return undefined;
  }

  const [minX, minY, width, height] = viewBox
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  return { minX, minY, width, height };
}
