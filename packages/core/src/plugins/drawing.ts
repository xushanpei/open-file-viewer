import pako from "pako";
import type { PreviewCommand, PreviewContext, PreviewPlugin } from "../types";
import { createPanel, createSection, readTextFile, resolveFormat } from "./utils";

const drawingExtensions = new Set(["drawio", "dio", "excalidraw", "tldraw"]);
const drawingMimeFormatMap: Record<string, string> = {
  "application/vnd.jgraph.mxfile": "drawio",
  "application/vnd.excalidraw+json": "excalidraw",
  "application/x-excalidraw+json": "excalidraw"
};
const SVG_NS = "http://www.w3.org/2000/svg";

export function drawingPlugin(): PreviewPlugin {
  return {
    name: "drawing",
    match(file) {
      return drawingExtensions.has(file.extension) || Boolean(drawingMimeFormatMap[file.mimeType]);
    },
    async render(ctx) {
      const panel = createPanel("ofv-drawing");
      ctx.viewport.append(panel);
      const text = await readTextFile(ctx.file);
      const extension = resolveFormat(ctx.file, drawingMimeFormatMap);

      let controller: ReturnType<typeof createSvgViewportController> | undefined;
      try {
        if (extension === "excalidraw") {
          renderExcalidraw(panel, text);
        } else if (extension === "tldraw") {
          renderTldraw(panel, text);
        } else if (extension === "drawio" || extension === "dio") {
          renderDrawio(panel, text);
        } else {
          renderRawDrawing(panel, extension || "drawing", text);
        }
        controller = createSvgViewportController(panel, ctx);
      } catch (error) {
        renderDrawingParseFallback(panel, extension || "drawing", text, error);
      }

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

function createSvgViewportController(
  panel: HTMLElement,
  ctx: Pick<PreviewContext, "toolbar">
): {
  canCommand: (command: PreviewCommand) => boolean;
  command: (command: PreviewCommand) => boolean;
  destroy: () => void;
} | undefined {
  const svg = panel.querySelector<SVGSVGElement>(".ofv-svg-stage");
  const initialViewBox = parseSvgViewBox(svg);
  if (!svg || !initialViewBox) {
    return undefined;
  }

  let currentViewBox = { ...initialViewBox };
  let rotation = 0;
  const applyViewBox = () => {
    svg.setAttribute(
      "viewBox",
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
    );
    ctx.toolbar?.setZoom(initialViewBox.width / currentViewBox.width);
  };
  const applyRotation = () => {
    svg.style.transformOrigin = "center center";
    svg.style.transform = rotation === 0 ? "" : `rotate(${rotation}deg)`;
  };
  applyViewBox();

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
      if (command === "zoom-in" || command === "zoom-out") {
        const factor = command === "zoom-in" ? 0.82 : 1.18;
        const centerX = currentViewBox.x + currentViewBox.width / 2;
        const centerY = currentViewBox.y + currentViewBox.height / 2;
        currentViewBox.width *= factor;
        currentViewBox.height *= factor;
        currentViewBox.x = centerX - currentViewBox.width / 2;
        currentViewBox.y = centerY - currentViewBox.height / 2;
        applyViewBox();
        return true;
      }
      if (command === "zoom-reset") {
        currentViewBox = { ...initialViewBox };
        rotation = 0;
        applyViewBox();
        applyRotation();
        return true;
      }
      if (command === "rotate-right" || command === "rotate-left") {
        rotation += command === "rotate-right" ? 90 : -90;
        applyRotation();
        return true;
      }
      return false;
    },
    destroy() {
      ctx.toolbar?.setZoom(undefined);
    }
  };
}

function parseSvgViewBox(svg: SVGSVGElement | null): { x: number; y: number; width: number; height: number } | undefined {
  const parts = svg
    ?.getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!parts || parts.length !== 4 || parts.some((part) => !Number.isFinite(part)) || parts[2] <= 0 || parts[3] <= 0) {
    return undefined;
  }
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3]
  };
}

type DrawingSummaryItem = {
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  image?: boolean;
  embed?: boolean;
  edge?: boolean;
};

function createDrawingSummary(items: DrawingSummaryItem[]): HTMLElement {
  const summary = document.createElement("div");
  summary.className = "ofv-drawing-summary";
  summary.hidden = items.length > 0;
  if (items.length > 0) {
    summary.setAttribute("aria-hidden", "true");
    summary.style.display = "none";
  }
  const typeCounts = countDrawingTypes(items);
  appendDrawingSummary(summary, "对象", String(items.length));
  appendDrawingSummary(summary, "类型", formatDrawingTypes(typeCounts));
  appendDrawingSummary(summary, "文本", String(items.filter((item) => item.text && item.text.trim()).length));
  appendDrawingSummary(summary, "连线", String(items.filter((item) => item.edge).length));
  const media = items.filter((item) => item.image || item.embed).length;
  if (media > 0) {
    appendDrawingSummary(summary, "媒体/嵌入", String(media));
  }
  const bounds = drawingBounds(items);
  if (bounds) {
    appendDrawingSummary(summary, "范围", `${Math.round(bounds[0])}, ${Math.round(bounds[1])}, ${Math.round(bounds[2])}, ${Math.round(bounds[3])}`);
  }
  return summary;
}

function appendDrawingSummary(parent: HTMLElement, label: string, value: string): void {
  const item = document.createElement("span");
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  item.append(key, content);
  parent.append(item);
}

function hideSuccessfulSectionHeading(section: HTMLElement): void {
  const heading = section.querySelector<HTMLElement>("h3");
  if (heading) {
    hideSupplementalInfo(heading);
  }
}

function hideSupplementalInfo(element: HTMLElement): void {
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.style.display = "none";
}

function countDrawingTypes(items: DrawingSummaryItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
  }
  return counts;
}

function formatDrawingTypes(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ") || "无";
}

function drawingBounds(items: DrawingSummaryItem[]): [number, number, number, number] | undefined {
  const boxes = items
    .map((item) => {
      if (!Number.isFinite(item.x) || !Number.isFinite(item.y)) {
        return undefined;
      }
      const x = item.x as number;
      const y = item.y as number;
      const width = Math.max(0, finiteNumber(item.width, 0));
      const height = Math.max(0, finiteNumber(item.height, 0));
      return [x, y, x + width, y + height] as [number, number, number, number];
    })
    .filter((item): item is [number, number, number, number] => Boolean(item));
  if (boxes.length === 0) {
    return undefined;
  }
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3]))
  ];
}

function excalidrawSummaryItem(element: Record<string, unknown>): DrawingSummaryItem {
  return {
    type: String(element.type || "unknown"),
    x: finiteNumber(element.x, 0),
    y: finiteNumber(element.y, 0),
    width: finiteNumber(element.width, 0),
    height: finiteNumber(element.height, 0),
    text: String(element.text || element.name || ""),
    image: element.type === "image",
    embed: element.type === "embeddable",
    edge: element.type === "arrow" || element.type === "line"
  };
}

function tldrawSummaryItem(shape: TldrawShape): DrawingSummaryItem {
  const props = shape.props || {};
  return {
    type: String(shape.type || props.type || "unknown"),
    x: finiteNumber(shape.x, 0),
    y: finiteNumber(shape.y, 0),
    width: finiteNumber(props.w, finiteNumber(props.width, 0)),
    height: finiteNumber(props.h, finiteNumber(props.height, 0)),
    text: String(props.text || ""),
    edge: shape.type === "arrow" || shape.type === "line"
  };
}

function drawioSummaryItem(shape: DrawioShape): DrawingSummaryItem {
  return {
    type: shape.edge ? "edge" : drawioShapeName(shape.style),
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    text: shape.value,
    image: drawioShapeName(shape.style) === "image",
    edge: shape.edge
  };
}

function renderExcalidraw(panel: HTMLElement, text: string): void {
  const data = JSON.parse(text) as {
    elements?: Array<Record<string, unknown>>;
    files?: Record<string, { dataURL?: string; mimeType?: string; id?: string }>;
  };
  const files = data.files || {};
  const elements = (data.elements || []).filter((element) => !element.isDeleted);
  const section = createSection(`Excalidraw ${elements.length} elements`);
  if (elements.length > 0) {
    hideSuccessfulSectionHeading(section);
  }
  section.append(createDrawingSummary(elements.map(excalidrawSummaryItem)));
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "ofv-svg-stage");
  svg.setAttribute("viewBox", createExcalidrawViewBox(elements));
  const defs = document.createElementNS(SVG_NS, "defs");
  svg.append(defs);

  for (const element of elements) {
    const type = String(element.type || "");
    const x = Number(element.x || 0);
    const y = Number(element.y || 0);
    const width = Number(element.width || 80);
    const height = Number(element.height || 40);
    const stroke = String(element.strokeColor || "#111827");
    const fill = excalidrawFill(svg, defs, element, stroke);
    const common = getExcalidrawCommonAttrs(element);
    const transform = excalidrawTransform(element, x, y, width, height);

    if (type === "frame") {
      const frame = document.createElementNS(SVG_NS, "rect");
      applySvgAttrs(frame, {
        x,
        y,
        width,
        height,
        rx: 4,
        fill: "transparent",
        stroke: "#94a3b8",
        "stroke-width": 2,
        "stroke-dasharray": "8 6",
        opacity: common.opacity,
        transform
      });
      svg.append(frame);
      appendSvgMultilineText(svg, String(element.name || "Frame"), x + 12, y + 24, "#64748b", {
        fontSize: 14,
        transform
      });
    } else if (type === "image") {
      renderExcalidrawImage(svg, element, files, x, y, width, height, common, transform);
    } else if (type === "embeddable") {
      renderExcalidrawEmbeddable(svg, element, x, y, width, height, common, transform);
    } else if (type === "rectangle" || type === "diamond") {
      if (type === "diamond") {
        const polygon = document.createElementNS(SVG_NS, "polygon");
        polygon.setAttribute(
          "points",
          `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`
        );
        applySvgAttrs(polygon, { fill, stroke, ...common, transform });
        svg.append(polygon);
      } else {
        const rect = document.createElementNS(SVG_NS, "rect");
        applySvgAttrs(rect, {
          x,
          y,
          width,
          height,
          rx: finiteNumber(element.roundness && typeof element.roundness === "object" ? (element.roundness as Record<string, unknown>).value : undefined, 0),
          fill,
          stroke,
          ...common,
          transform
        });
        svg.append(rect);
      }
    } else if (type === "ellipse") {
      const ellipse = document.createElementNS(SVG_NS, "ellipse");
      applySvgAttrs(ellipse, {
        cx: x + width / 2,
        cy: y + height / 2,
        rx: Math.abs(width / 2),
        ry: Math.abs(height / 2),
        fill,
        stroke,
        ...common,
        transform
      });
      svg.append(ellipse);
    } else if (type === "line" || type === "arrow") {
      const points = excalidrawPoints(element, x, y, width, height);
      if (points.length > 2) {
        const polyline = document.createElementNS(SVG_NS, "polyline");
        applySvgAttrs(polyline, {
          points: points.map((point) => `${point.x},${point.y}`).join(" "),
          fill: "none",
          stroke,
          ...common,
          transform
        });
        svg.append(polyline);
        appendExcalidrawArrowHeads(svg, element, points, stroke);
      } else {
        const start = points[0] || { x, y };
        const end = points[points.length - 1] || { x: x + width, y: y + height };
        const line = document.createElementNS(SVG_NS, "line");
        applySvgAttrs(line, {
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          stroke,
          ...common,
          transform
        });
        svg.append(line);
        appendExcalidrawArrowHeads(svg, element, [start, end], stroke);
      }
    } else if (type === "freedraw") {
      const path = createExcalidrawFreedrawPath(element, x, y);
      if (path) {
        applySvgAttrs(path, { fill: "none", stroke, ...common, transform });
        svg.append(path);
      }
    } else if (type === "text") {
      const fontSize = finiteNumber(element.fontSize, 18);
      const lines = String(element.text || "").split(/\r?\n/);
      const textAlign = String(element.textAlign || "left");
      const verticalAlign = String(element.verticalAlign || "top");
      const anchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
      const textX = textAlign === "center" ? x + width / 2 : textAlign === "right" ? x + width : x;
      const textY =
        verticalAlign === "middle"
          ? y + height / 2 - ((lines.length - 1) * fontSize * 1.25) / 2
          : verticalAlign === "bottom"
            ? y + height - (lines.length - 1) * fontSize * 1.25
            : y + fontSize;
      appendSvgMultilineText(svg, String(element.text || ""), textX, textY, stroke, {
        fontSize,
        fontFamily: String(element.fontFamily || "Inter, ui-sans-serif, system-ui, sans-serif"),
        anchor,
        dominantBaseline: verticalAlign === "middle" ? "middle" : "auto",
        opacity: common.opacity,
        transform
      });
    }
  }

  section.append(svg);
  panel.append(section);
}

function renderExcalidrawImage(
  svg: SVGSVGElement,
  element: Record<string, unknown>,
  files: Record<string, { dataURL?: string; mimeType?: string; id?: string }>,
  x: number,
  y: number,
  width: number,
  height: number,
  common: Record<string, string | number>,
  transform: string
): void {
  const fileId = String(element.fileId || "");
  const file = fileId ? files[fileId] : undefined;
  const dataUrl = file?.dataURL || "";
  if (isSafeExcalidrawImageDataUrl(dataUrl)) {
    const image = document.createElementNS(SVG_NS, "image");
    applySvgAttrs(image, {
      x,
      y,
      width,
      height,
      href: dataUrl,
      preserveAspectRatio: "xMidYMid meet",
      opacity: common.opacity,
      transform
    });
    svg.append(image);
    return;
  }

  const rect = document.createElementNS(SVG_NS, "rect");
  applySvgAttrs(rect, {
    x,
    y,
    width,
    height,
    rx: 8,
    fill: "#f8fafc",
    stroke: "#94a3b8",
    "stroke-width": 1.5,
    "stroke-dasharray": "6 4",
    opacity: common.opacity,
    transform
  });
  svg.append(rect);
  appendSvgMultilineText(svg, fileId ? `Image\n${fileId}` : "Image", x + width / 2, y + height / 2 - 8, "#64748b", {
    fontSize: 13,
    anchor: "middle",
    transform
  });
}

function renderExcalidrawEmbeddable(
  svg: SVGSVGElement,
  element: Record<string, unknown>,
  x: number,
  y: number,
  width: number,
  height: number,
  common: Record<string, string | number>,
  transform: string
): void {
  const rect = document.createElementNS(SVG_NS, "rect");
  applySvgAttrs(rect, {
    x,
    y,
    width,
    height,
    rx: 10,
    fill: "#eef2ff",
    stroke: "#6366f1",
    "stroke-width": 1.5,
    "stroke-dasharray": "8 5",
    opacity: common.opacity,
    transform
  });
  svg.append(rect);
  const link = String(element.link || element.url || "Embedded content");
  appendSvgMultilineText(svg, `Embed\n${shortenText(link, 48)}`, x + width / 2, y + height / 2 - 10, "#4338ca", {
    fontSize: 13,
    anchor: "middle",
    transform
  });
}

function appendSvgMultilineText(
  svg: SVGSVGElement,
  text: string,
  x: number,
  y: number,
  fill: string,
  options: {
    fontSize?: number;
    fontFamily?: string;
    anchor?: string;
    dominantBaseline?: string;
    opacity?: string | number;
    transform?: string;
  } = {}
): SVGTextElement {
  const textNode = document.createElementNS(SVG_NS, "text");
  applySvgAttrs(textNode, {
    x,
    y,
    fill,
    "font-size": options.fontSize || 18,
    "font-family": options.fontFamily || "Inter, ui-sans-serif, system-ui, sans-serif",
    "text-anchor": options.anchor,
    "dominant-baseline": options.dominantBaseline,
    opacity: options.opacity,
    transform: options.transform
  });
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const span = document.createElementNS(SVG_NS, "tspan");
    span.setAttribute("x", String(x));
    span.setAttribute("dy", index === 0 ? "0" : "1.25em");
    span.textContent = line;
    textNode.append(span);
  }
  svg.append(textNode);
  return textNode;
}

function isSafeExcalidrawImageDataUrl(value: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(value);
}

function shortenText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function createExcalidrawViewBox(elements: Array<Record<string, unknown>>): string {
  if (elements.length === 0) {
    return "0 0 1200 800";
  }
  const bounds = elements.map((element) => {
    const x = finiteNumber(element.x, 0);
    const y = finiteNumber(element.y, 0);
    const points = Array.isArray(element.points) ? element.points.map((point) => pointFromValue(point, { x: 0, y: 0 })) : [];
    const width = Math.max(1, finiteNumber(element.width, Math.max(80, ...points.map((point) => point.x))));
    const height = Math.max(1, finiteNumber(element.height, Math.max(40, ...points.map((point) => point.y))));
    return { x, y, width, height };
  });
  const minX = Math.min(...bounds.map((bound) => bound.x)) - 40;
  const minY = Math.min(...bounds.map((bound) => bound.y)) - 40;
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width)) + 40;
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height)) + 40;
  return `${minX} ${minY} ${Math.max(320, maxX - minX)} ${Math.max(240, maxY - minY)}`;
}

function getExcalidrawCommonAttrs(element: Record<string, unknown>): Record<string, string | number> {
  const strokeWidth = finiteNumber(element.strokeWidth, 1.5);
  const opacity = Math.max(0, Math.min(1, finiteNumber(element.opacity, 100) / 100));
  const style = String(element.strokeStyle || "solid");
  return {
    "stroke-width": strokeWidth,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "stroke-dasharray": style === "dashed" ? `${strokeWidth * 6} ${strokeWidth * 4}` : style === "dotted" ? `${strokeWidth} ${strokeWidth * 4}` : "",
    opacity
  };
}

function excalidrawFill(
  svg: SVGSVGElement,
  defs: SVGDefsElement,
  element: Record<string, unknown>,
  stroke: string
): string {
  const value = String(element.backgroundColor || "transparent");
  if (!value || value === "transparent") {
    return "transparent";
  }
  const fillStyle = String(element.fillStyle || "solid");
  if (fillStyle === "solid") {
    return value;
  }
  const id = `ofv-excalidraw-${fillStyle}-${defs.children.length}`;
  const pattern = document.createElementNS(SVG_NS, "pattern");
  applySvgAttrs(pattern, {
    id,
    width: 10,
    height: 10,
    patternUnits: "userSpaceOnUse"
  });
  const background = document.createElementNS(SVG_NS, "rect");
  applySvgAttrs(background, { width: 10, height: 10, fill: value, opacity: 0.35 });
  pattern.append(background);
  if (fillStyle === "cross-hatch") {
    pattern.append(createPatternLine(svg, "M 0 10 L 10 0", stroke));
    pattern.append(createPatternLine(svg, "M 0 0 L 10 10", stroke));
  } else if (fillStyle === "dots") {
    const dot = document.createElementNS(SVG_NS, "circle");
    applySvgAttrs(dot, { cx: 5, cy: 5, r: 1.2, fill: stroke, opacity: 0.48 });
    pattern.append(dot);
  } else {
    pattern.append(createPatternLine(svg, "M 0 10 L 10 0", stroke));
  }
  defs.append(pattern);
  return `url(#${id})`;
}

function createPatternLine(svg: SVGSVGElement, d: string, stroke: string): SVGPathElement {
  const path = document.createElementNS(SVG_NS, "path");
  applySvgAttrs(path, {
    d,
    stroke,
    "stroke-width": 1,
    "stroke-linecap": "round",
    opacity: 0.42
  });
  return path;
}

function excalidrawTransform(
  element: Record<string, unknown>,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  const angle = finiteNumber(element.angle, 0);
  if (!angle) {
    return "";
  }
  return `rotate(${(angle * 180) / Math.PI} ${x + width / 2} ${y + height / 2})`;
}

function excalidrawPoints(
  element: Record<string, unknown>,
  x: number,
  y: number,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  if (!Array.isArray(element.points)) {
    return [
      { x, y },
      { x: x + width, y: y + height }
    ];
  }
  return element.points.map((point) => {
    const parsed = pointFromValue(point, { x: 0, y: 0 });
    return { x: x + parsed.x, y: y + parsed.y };
  });
}

function createExcalidrawFreedrawPath(element: Record<string, unknown>, x: number, y: number): SVGPathElement | null {
  const points = excalidrawPoints(element, x, y, 0, 0);
  if (points.length < 2) {
    return null;
  }
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ")
  );
  return path;
}

function appendExcalidrawArrowHeads(
  svg: SVGSVGElement,
  element: Record<string, unknown>,
  points: Array<{ x: number; y: number }>,
  stroke: string
): void {
  if (String(element.type || "") !== "arrow" || points.length < 2) {
    return;
  }
  const startHead = String(element.startArrowhead || "");
  const endHead = String(element.endArrowhead || "arrow");
  if (startHead && startHead !== "none") {
    appendArrowHead(svg, points[1].x, points[1].y, points[0].x, points[0].y, stroke, startHead);
  }
  if (endHead && endHead !== "none") {
    const previous = points[points.length - 2];
    const end = points[points.length - 1];
    appendArrowHead(svg, previous.x, previous.y, end.x, end.y, stroke, endHead);
  }
}

function applySvgAttrs(element: SVGElement, attributes: Record<string, string | number | undefined>): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === "") {
      continue;
    }
    element.setAttribute(key, String(value));
  }
}

type TldrawShape = Record<string, unknown> & {
  props?: Record<string, unknown>;
};

function renderTldraw(panel: HTMLElement, text: string): void {
  const data = JSON.parse(text) as unknown;
  const shapes = extractTldrawShapes(data);
  const section = createSection(`tldraw 基础预览 ${shapes.length} shapes`);
  if (shapes.length > 0) {
    hideSuccessfulSectionHeading(section);
  }
  section.append(createDrawingSummary(shapes.map(tldrawSummaryItem)));
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ofv-svg-stage");
  svg.setAttribute("viewBox", createTldrawViewBox(shapes));

  if (shapes.length === 0) {
    const empty = document.createElementNS(svg.namespaceURI, "text");
    empty.setAttribute("x", "24");
    empty.setAttribute("y", "40");
    empty.setAttribute("fill", "#64748b");
    empty.textContent = "未解析到可展示的 tldraw 图形。";
    svg.append(empty);
  } else {
    for (const shape of shapes) {
      renderTldrawShape(svg, shape);
    }
  }

  section.append(svg);
  panel.append(section);
}

function extractTldrawShapes(data: unknown): TldrawShape[] {
  if (!data || typeof data !== "object") {
    return [];
  }
  const source = data as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (Array.isArray(source.records)) {
    candidates.push(...source.records);
  }
  if (Array.isArray(source.shapes)) {
    candidates.push(...source.shapes);
  }
  if (source.store && typeof source.store === "object") {
    candidates.push(...Object.values(source.store as Record<string, unknown>));
  }
  if (source.document && typeof source.document === "object") {
    const documentRecord = source.document as Record<string, unknown>;
    if (Array.isArray(documentRecord.shapes)) {
      candidates.push(...documentRecord.shapes);
    }
  }

  return candidates.filter((item): item is TldrawShape => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    return record.typeName === "shape" || String(record.id || "").startsWith("shape:");
  });
}

function renderTldrawShape(svg: SVGSVGElement, shape: TldrawShape): void {
  const props = shape.props || {};
  const type = String(shape.type || props.type || "");
  const x = finiteNumber(shape.x, 0);
  const y = finiteNumber(shape.y, 0);
  const width = Math.max(1, finiteNumber(props.w, finiteNumber(props.width, 120)));
  const height = Math.max(1, finiteNumber(props.h, finiteNumber(props.height, 80)));
  const stroke = tldrawColor(String(props.color || shape.color || "black"));
  const fill = tldrawFill(String(props.fill || "none"), stroke);

  if (type === "geo" || type === "frame" || type === "highlight") {
    const geo = String(props.geo || (type === "frame" ? "rectangle" : "rectangle"));
    if (geo === "ellipse" || geo === "oval") {
      const ellipse = document.createElementNS(svg.namespaceURI, "ellipse");
      ellipse.setAttribute("cx", String(x + width / 2));
      ellipse.setAttribute("cy", String(y + height / 2));
      ellipse.setAttribute("rx", String(width / 2));
      ellipse.setAttribute("ry", String(height / 2));
      ellipse.setAttribute("fill", fill);
      ellipse.setAttribute("stroke", stroke);
      ellipse.setAttribute("stroke-width", "2");
      svg.append(ellipse);
    } else if (geo === "diamond") {
      const polygon = document.createElementNS(svg.namespaceURI, "polygon");
      polygon.setAttribute(
        "points",
        `${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`
      );
      polygon.setAttribute("fill", fill);
      polygon.setAttribute("stroke", stroke);
      polygon.setAttribute("stroke-width", "2");
      svg.append(polygon);
    } else if (geo === "triangle") {
      const polygon = document.createElementNS(svg.namespaceURI, "polygon");
      polygon.setAttribute("points", `${x + width / 2},${y} ${x + width},${y + height} ${x},${y + height}`);
      polygon.setAttribute("fill", fill);
      polygon.setAttribute("stroke", stroke);
      polygon.setAttribute("stroke-width", "2");
      svg.append(polygon);
    } else {
      const rect = document.createElementNS(svg.namespaceURI, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", String(height));
      rect.setAttribute("rx", type === "frame" ? "0" : "8");
      rect.setAttribute("fill", fill);
      rect.setAttribute("stroke", stroke);
      rect.setAttribute("stroke-width", "2");
      svg.append(rect);
    }
    appendTldrawText(svg, String(props.text || ""), x + 12, y + 24, stroke);
  } else if (type === "text" || type === "note") {
    if (type === "note") {
      const note = document.createElementNS(svg.namespaceURI, "rect");
      note.setAttribute("x", String(x));
      note.setAttribute("y", String(y));
      note.setAttribute("width", String(width));
      note.setAttribute("height", String(height));
      note.setAttribute("rx", "6");
      note.setAttribute("fill", tldrawColor(String(props.color || "yellow"), 0.24));
      note.setAttribute("stroke", stroke);
      svg.append(note);
    }
    appendTldrawText(svg, String(props.text || ""), x, y + 18, stroke);
  } else if (type === "arrow" || type === "line") {
    renderTldrawLine(svg, shape, stroke);
  } else if (type === "draw") {
    renderTldrawDraw(svg, shape, stroke);
  } else {
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", "transparent");
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-dasharray", "6 4");
    svg.append(rect);
    appendTldrawText(svg, type || "shape", x + 8, y + 20, stroke);
  }
}

function renderTldrawLine(svg: SVGSVGElement, shape: TldrawShape, stroke: string): void {
  const props = shape.props || {};
  const x = finiteNumber(shape.x, 0);
  const y = finiteNumber(shape.y, 0);
  const start = pointFromValue(props.start, { x: 0, y: 0 });
  const end = pointFromValue(props.end, {
    x: finiteNumber(props.w, finiteNumber(props.width, 120)),
    y: finiteNumber(props.h, finiteNumber(props.height, 0))
  });
  const line = document.createElementNS(svg.namespaceURI, "line");
  line.setAttribute("x1", String(x + start.x));
  line.setAttribute("y1", String(y + start.y));
  line.setAttribute("x2", String(x + end.x));
  line.setAttribute("y2", String(y + end.y));
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", "3");
  line.setAttribute("stroke-linecap", "round");
  svg.append(line);
  if (String(shape.type || "") === "arrow") {
    appendArrowHead(svg, x + start.x, y + start.y, x + end.x, y + end.y, stroke);
  }
}

function renderTldrawDraw(svg: SVGSVGElement, shape: TldrawShape, stroke: string): void {
  const props = shape.props || {};
  const x = finiteNumber(shape.x, 0);
  const y = finiteNumber(shape.y, 0);
  const points = extractTldrawDrawPoints(props.segments);
  if (points.length < 2) {
    return;
  }
  const polyline = document.createElementNS(svg.namespaceURI, "polyline");
  polyline.setAttribute("points", points.map((point) => `${x + point.x},${y + point.y}`).join(" "));
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", stroke);
  polyline.setAttribute("stroke-width", "3");
  polyline.setAttribute("stroke-linecap", "round");
  polyline.setAttribute("stroke-linejoin", "round");
  svg.append(polyline);
}

function appendTldrawText(svg: SVGSVGElement, text: string, x: number, y: number, fill: string): void {
  if (!text.trim()) {
    return;
  }
  const textNode = document.createElementNS(svg.namespaceURI, "text");
  textNode.setAttribute("x", String(x));
  textNode.setAttribute("y", String(y));
  textNode.setAttribute("fill", fill);
  textNode.setAttribute("font-size", "16");
  textNode.setAttribute("font-family", "Inter, ui-sans-serif, system-ui, sans-serif");
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const span = document.createElementNS(svg.namespaceURI, "tspan");
    span.setAttribute("x", String(x));
    span.setAttribute("dy", index === 0 ? "0" : "1.3em");
    span.textContent = line;
    textNode.append(span);
  }
  svg.append(textNode);
}

function appendArrowHead(
  svg: SVGSVGElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fill: string,
  type = "arrow"
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 10;
  if (type === "bar") {
    const line = document.createElementNS(SVG_NS, "line");
    const dx = Math.sin(angle) * size * 0.65;
    const dy = Math.cos(angle) * size * 0.65;
    applySvgAttrs(line, {
      x1: x2 - dx,
      y1: y2 + dy,
      x2: x2 + dx,
      y2: y2 - dy,
      stroke: fill,
      "stroke-width": 2,
      "stroke-linecap": "round"
    });
    svg.append(line);
    return;
  }
  if (type === "dot" || type === "circle") {
    const circle = document.createElementNS(SVG_NS, "circle");
    applySvgAttrs(circle, { cx: x2, cy: y2, r: size * 0.42, fill });
    svg.append(circle);
    return;
  }
  const points = [
    [x2, y2],
    [x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)],
    [x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)]
  ];
  const polygon = document.createElementNS(svg.namespaceURI, "polygon");
  polygon.setAttribute("points", points.map((point) => point.join(",")).join(" "));
  polygon.setAttribute("fill", type === "triangle_outline" || type === "arrow_outline" ? "transparent" : fill);
  polygon.setAttribute("stroke", fill);
  svg.append(polygon);
}

function createTldrawViewBox(shapes: TldrawShape[]): string {
  if (shapes.length === 0) {
    return "0 0 800 500";
  }
  const bounds = shapes.map((shape) => {
    const props = shape.props || {};
    const x = finiteNumber(shape.x, 0);
    const y = finiteNumber(shape.y, 0);
    const width = Math.max(1, finiteNumber(props.w, finiteNumber(props.width, 120)));
    const height = Math.max(1, finiteNumber(props.h, finiteNumber(props.height, 80)));
    return { x, y, width, height };
  });
  const minX = Math.min(...bounds.map((bound) => bound.x)) - 40;
  const minY = Math.min(...bounds.map((bound) => bound.y)) - 40;
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width)) + 40;
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height)) + 40;
  return `${minX} ${minY} ${Math.max(240, maxX - minX)} ${Math.max(180, maxY - minY)}`;
}

function extractTldrawDrawPoints(value: unknown): Array<{ x: number; y: number }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((segment) => {
    if (!segment || typeof segment !== "object") {
      return [];
    }
    const points = (segment as Record<string, unknown>).points;
    if (!Array.isArray(points)) {
      return [];
    }
    return points.map((point) => pointFromValue(point, { x: 0, y: 0 }));
  });
}

function pointFromValue(value: unknown, fallback: { x: number; y: number }): { x: number; y: number } {
  if (Array.isArray(value)) {
    return {
      x: finiteNumber(value[0], fallback.x),
      y: finiteNumber(value[1], fallback.y)
    };
  }
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const point = value as Record<string, unknown>;
  return {
    x: finiteNumber(point.x, fallback.x),
    y: finiteNumber(point.y, fallback.y)
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tldrawFill(fill: string, stroke: string): string {
  return fill === "solid" || fill === "semi" || fill === "pattern" ? tldrawColor(stroke, 0.14) : "transparent";
}

function tldrawColor(value: string, alpha = 1): string {
  const colors: Record<string, [number, number, number]> = {
    black: [17, 24, 39],
    grey: [100, 116, 139],
    light: [203, 213, 225],
    red: [220, 38, 38],
    orange: [234, 88, 12],
    yellow: [202, 138, 4],
    green: [22, 163, 74],
    blue: [37, 99, 235],
    violet: [124, 58, 237],
    purple: [147, 51, 234],
    pink: [219, 39, 119]
  };
  if (value.startsWith("#") || value.startsWith("rgb")) {
    return value;
  }
  const color = colors[value] || colors.black;
  return alpha >= 1 ? `rgb(${color.join(" ")})` : `rgb(${color.join(" ")} / ${alpha})`;
}

function renderDrawio(panel: HTMLElement, text: string): void {
  const diagrams = extractDrawioDiagrams(text);
  if (diagrams.length === 0) {
    renderRawDrawing(panel, "Draw.io", text);
    return;
  }

  for (const [index, diagram] of diagrams.entries()) {
    const section = createSection(`Draw.io 图形预览 ${index + 1}`);
    const shapes = parseDrawioShapes(diagram);
    if (shapes.length > 0) {
      hideSuccessfulSectionHeading(section);
      section.append(createDrawingSummary(shapes.map(drawioSummaryItem)));
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("class", "ofv-svg-stage");
      svg.setAttribute("viewBox", createDrawioViewBox(shapes));
      for (const shape of shapes) {
        renderDrawioShape(svg, shape);
      }
      section.append(svg);
    }

    const details = document.createElement("details");
    details.className = "ofv-details";
    const summary = document.createElement("summary");
    summary.textContent = shapes.length > 0 ? `原始 XML 摘要（${shapes.length} cells）` : "Draw.io 原始内容";
    const pre = document.createElement("pre");
    pre.className = "ofv-text-block";
    pre.textContent = diagram.slice(0, 30000);
    details.append(summary, pre);
    if (shapes.length > 0) {
      details.hidden = true;
      details.setAttribute("aria-hidden", "true");
      details.style.display = "none";
    }
    section.append(details);
    panel.append(section);
  }
}

type DrawioShape = {
  id: string;
  value: string;
  style: Record<string, string>;
  vertex: boolean;
  edge: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  source?: string;
  target?: string;
  points?: Array<{ x: number; y: number }>;
};

function extractDrawioDiagrams(text: string): string[] {
  const matches = [...text.matchAll(/<diagram[^>]*>([\s\S]*?)<\/diagram>/g)].map((match) => decodeDrawioDiagram(match[1] || ""));
  if (matches.length > 0) {
    return matches;
  }
  return text.includes("<mxGraphModel") ? [text] : [];
}

function parseDrawioShapes(xml: string): DrawioShape[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return [];
  }
  return Array.from(doc.querySelectorAll("mxCell")).flatMap((cell) => {
    const geometry = Array.from(cell.children).find((child) => child.localName === "mxGeometry");
    const vertex = cell.getAttribute("vertex") === "1";
    const edge = cell.getAttribute("edge") === "1";
    if (!vertex && !edge) {
      return [];
    }
    const shape: DrawioShape = {
      id: cell.getAttribute("id") || "",
      value: decodeXmlText(cell.getAttribute("value") || ""),
      style: parseDrawioStyle(cell.getAttribute("style") || ""),
      vertex,
      edge,
      x: finiteNumber(geometry?.getAttribute("x"), 0),
      y: finiteNumber(geometry?.getAttribute("y"), 0),
      width: Math.max(1, finiteNumber(geometry?.getAttribute("width"), 120)),
      height: Math.max(1, finiteNumber(geometry?.getAttribute("height"), edge ? 1 : 60)),
      source: cell.getAttribute("source") || undefined,
      target: cell.getAttribute("target") || undefined
    };

    if (edge && geometry) {
      const points = Array.from(geometry.children)
        .filter((child) => child.localName === "mxPoint")
        .map((point) => ({
          x: finiteNumber(point.getAttribute("x"), 0),
          y: finiteNumber(point.getAttribute("y"), 0)
        }));
      if (points.length >= 2) {
        shape.x = points[0].x;
        shape.y = points[0].y;
        shape.width = points[points.length - 1].x - points[0].x;
        shape.height = points[points.length - 1].y - points[0].y;
        shape.points = points;
      }
    }
    return [shape];
  });
}

function parseDrawioStyle(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  const imageMatch = style.match(/(?:^|;)image=(data:image\/[^;]+;base64,[^;]+)/i);
  const protectedStyle = imageMatch ? style.replace(imageMatch[0], imageMatch[0].startsWith(";") ? ";image=__OFV_IMAGE__" : "image=__OFV_IMAGE__") : style;
  for (const part of protectedStyle.split(";")) {
    if (!part) {
      continue;
    }
    const separator = part.indexOf("=");
    const key = separator >= 0 ? part.slice(0, separator) : part;
    const value = separator >= 0 ? part.slice(separator + 1) : "1";
    if (key) {
      result[key] = value === "__OFV_IMAGE__" && imageMatch ? imageMatch[1] : value;
    }
  }
  return result;
}

function createDrawioViewBox(shapes: DrawioShape[]): string {
  const bounds = shapes.map((shape) => ({
    x: Math.min(shape.x, shape.x + shape.width),
    y: Math.min(shape.y, shape.y + shape.height),
    width: Math.abs(shape.width),
    height: Math.abs(shape.height)
  }));
  const minX = Math.min(...bounds.map((bound) => bound.x)) - 40;
  const minY = Math.min(...bounds.map((bound) => bound.y)) - 40;
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width)) + 40;
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height)) + 40;
  return `${minX} ${minY} ${Math.max(320, maxX - minX)} ${Math.max(240, maxY - minY)}`;
}

function renderDrawioShape(svg: SVGSVGElement, shape: DrawioShape): void {
  const stroke = drawioColor(shape.style.strokeColor, "#334155");
  const fill = shape.style.fillColor === "none" ? "transparent" : drawioColor(shape.style.fillColor, "#f8fafc");
  const strokeWidth = finiteNumber(shape.style.strokeWidth, 1.5);
  const opacity = Math.max(0, Math.min(1, finiteNumber(shape.style.opacity, 100) / 100));
  const strokeAttrs = drawioStrokeAttrs(shape.style, strokeWidth);
  const transform = drawioTransform(shape);

  if (shape.edge) {
    const points = shape.points || [
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height }
    ];
    if (points.length > 2) {
      const polyline = document.createElementNS(SVG_NS, "polyline");
      applySvgAttrs(polyline, {
        points: points.map((point) => `${point.x},${point.y}`).join(" "),
        fill: "none",
        stroke,
        ...strokeAttrs,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity
      });
      svg.append(polyline);
    } else {
      const line = document.createElementNS(SVG_NS, "line");
      applySvgAttrs(line, {
        x1: points[0].x,
        y1: points[0].y,
        x2: points[1].x,
        y2: points[1].y,
        stroke,
        ...strokeAttrs,
        "stroke-linecap": "round",
        opacity
      });
      svg.append(line);
    }
    if (shape.style.endArrow && shape.style.endArrow !== "none") {
      const tail = points[Math.max(0, points.length - 2)];
      const head = points[points.length - 1];
      appendArrowHead(svg, tail.x, tail.y, head.x, head.y, stroke);
    }
    return;
  }

  const shapeName = drawioShapeName(shape.style);
  if (shapeName === "image") {
    renderDrawioImage(svg, shape, opacity, transform);
  } else if (shapeName === "ellipse") {
    const ellipse = document.createElementNS(SVG_NS, "ellipse");
    applySvgAttrs(ellipse, {
      cx: shape.x + shape.width / 2,
      cy: shape.y + shape.height / 2,
      rx: shape.width / 2,
      ry: shape.height / 2,
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(ellipse);
  } else if (shapeName === "rhombus" || shapeName === "diamond") {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    applySvgAttrs(polygon, {
      points: `${shape.x + shape.width / 2},${shape.y} ${shape.x + shape.width},${shape.y + shape.height / 2} ${shape.x + shape.width / 2},${shape.y + shape.height} ${shape.x},${shape.y + shape.height / 2}`,
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(polygon);
  } else if (shapeName === "hexagon" || shapeName === "process") {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    const inset = shapeName === "process" ? shape.width * 0.12 : shape.width * 0.22;
    applySvgAttrs(polygon, {
      points:
        shapeName === "process"
          ? `${shape.x},${shape.y} ${shape.x + shape.width - inset},${shape.y} ${shape.x + shape.width},${shape.y + shape.height / 2} ${shape.x + shape.width - inset},${shape.y + shape.height} ${shape.x},${shape.y + shape.height}`
          : `${shape.x + inset},${shape.y} ${shape.x + shape.width - inset},${shape.y} ${shape.x + shape.width},${shape.y + shape.height / 2} ${shape.x + shape.width - inset},${shape.y + shape.height} ${shape.x + inset},${shape.y + shape.height} ${shape.x},${shape.y + shape.height / 2}`,
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(polygon);
  } else if (shapeName === "triangle") {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    applySvgAttrs(polygon, {
      points: `${shape.x + shape.width / 2},${shape.y} ${shape.x + shape.width},${shape.y + shape.height} ${shape.x},${shape.y + shape.height}`,
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(polygon);
  } else if (shapeName === "actor" || shapeName === "umlActor") {
    renderDrawioActor(svg, shape, stroke, strokeAttrs, opacity, transform);
  } else if (shapeName === "document") {
    const path = document.createElementNS(SVG_NS, "path");
    applySvgAttrs(path, {
      d: createDrawioDocumentPath(shape.x, shape.y, shape.width, shape.height),
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(path);
  } else if (shapeName === "cylinder") {
    const group = document.createElementNS(SVG_NS, "g");
    applySvgAttrs(group, { transform });
    const body = document.createElementNS(SVG_NS, "rect");
    applySvgAttrs(body, {
      x: shape.x,
      y: shape.y + Math.min(18, shape.height * 0.18) / 2,
      width: shape.width,
      height: shape.height - Math.min(18, shape.height * 0.18),
      fill,
      stroke,
      ...strokeAttrs,
      opacity
    });
    const top = document.createElementNS(SVG_NS, "ellipse");
    const bottom = document.createElementNS(SVG_NS, "ellipse");
    const capHeight = Math.min(18, shape.height * 0.18);
    applySvgAttrs(top, {
      cx: shape.x + shape.width / 2,
      cy: shape.y + capHeight / 2,
      rx: shape.width / 2,
      ry: capHeight / 2,
      fill,
      stroke,
      ...strokeAttrs,
      opacity
    });
    applySvgAttrs(bottom, {
      cx: shape.x + shape.width / 2,
      cy: shape.y + shape.height - capHeight / 2,
      rx: shape.width / 2,
      ry: capHeight / 2,
      fill: "none",
      stroke,
      ...strokeAttrs,
      opacity
    });
    group.append(body, top, bottom);
    svg.append(group);
  } else if (shapeName === "cloud") {
    const path = document.createElementNS(SVG_NS, "path");
    applySvgAttrs(path, {
      d: createDrawioCloudPath(shape.x, shape.y, shape.width, shape.height),
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(path);
  } else if (shapeName === "swimlane") {
    const rect = document.createElementNS(SVG_NS, "rect");
    applySvgAttrs(rect, {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rx: shape.style.rounded === "1" ? Math.min(12, shape.height / 5) : 0,
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    const header = document.createElementNS(SVG_NS, "rect");
    const headerHeight = Math.min(shape.height, finiteNumber(shape.style.startSize, 30));
    applySvgAttrs(header, {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: headerHeight,
      rx: shape.style.rounded === "1" ? Math.min(12, headerHeight / 3) : 0,
      fill: drawioColor(shape.style.swimlaneFillColor || shape.style.fillColor, "#e2e8f0"),
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(rect, header);
  } else {
    const rect = document.createElementNS(SVG_NS, "rect");
    applySvgAttrs(rect, {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      rx: shape.style.rounded === "1" ? Math.min(12, shape.height / 5) : 0,
      fill,
      stroke,
      ...strokeAttrs,
      opacity,
      transform
    });
    svg.append(rect);
  }

  appendDrawioText(
    svg,
    shape.value,
    shape.x + shape.width / 2,
    shape.y + shape.height / 2,
    drawioColor(shape.style.fontColor, "#111827"),
    shape.style,
    transform
  );
}

function drawioShapeName(style: Record<string, string>): string {
  if (style.shape) {
    return style.shape;
  }
  if (style.image) {
    return "image";
  }
  if (style.ellipse === "1") {
    return "ellipse";
  }
  if (style.rhombus === "1") {
    return "rhombus";
  }
  if (style.swimlane === "1") {
    return "swimlane";
  }
  if (style.text === "1") {
    return "text";
  }
  return "rectangle";
}

function renderDrawioImage(svg: SVGSVGElement, shape: DrawioShape, opacity: number, transform: string): void {
  const src = shape.style.image || "";
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(src)) {
    const image = document.createElementNS(SVG_NS, "image");
    applySvgAttrs(image, {
      x: shape.x,
      y: shape.y,
      width: shape.width,
      height: shape.height,
      href: src,
      preserveAspectRatio: "xMidYMid meet",
      opacity,
      transform
    });
    svg.append(image);
    return;
  }
  const rect = document.createElementNS(SVG_NS, "rect");
  applySvgAttrs(rect, {
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    rx: 6,
    fill: "#f8fafc",
    stroke: "#94a3b8",
    "stroke-dasharray": "6 4",
    opacity,
    transform
  });
  svg.append(rect);
}

function renderDrawioActor(
  svg: SVGSVGElement,
  shape: DrawioShape,
  stroke: string,
  strokeAttrs: Record<string, string | number>,
  opacity: number,
  transform: string
): void {
  const group = document.createElementNS(SVG_NS, "g");
  applySvgAttrs(group, { opacity, transform });
  const cx = shape.x + shape.width / 2;
  const headRadius = Math.min(shape.width, shape.height) * 0.15;
  const head = document.createElementNS(SVG_NS, "circle");
  applySvgAttrs(head, {
    cx,
    cy: shape.y + headRadius * 1.4,
    r: headRadius,
    fill: "transparent",
    stroke,
    ...strokeAttrs
  });
  const body = createSvgLine(cx, shape.y + headRadius * 2.4, cx, shape.y + shape.height * 0.68, stroke, strokeAttrs);
  const arms = createSvgLine(shape.x + shape.width * 0.22, shape.y + shape.height * 0.42, shape.x + shape.width * 0.78, shape.y + shape.height * 0.42, stroke, strokeAttrs);
  const leftLeg = createSvgLine(cx, shape.y + shape.height * 0.68, shape.x + shape.width * 0.25, shape.y + shape.height, stroke, strokeAttrs);
  const rightLeg = createSvgLine(cx, shape.y + shape.height * 0.68, shape.x + shape.width * 0.75, shape.y + shape.height, stroke, strokeAttrs);
  group.append(head, body, arms, leftLeg, rightLeg);
  svg.append(group);
}

function createSvgLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeAttrs: Record<string, string | number>
): SVGLineElement {
  const line = document.createElementNS(SVG_NS, "line");
  applySvgAttrs(line, {
    x1,
    y1,
    x2,
    y2,
    stroke,
    ...strokeAttrs,
    "stroke-linecap": "round"
  });
  return line;
}

function createDrawioDocumentPath(x: number, y: number, width: number, height: number): string {
  const wave = Math.min(18, height * 0.18);
  return [
    `M ${x} ${y}`,
    `H ${x + width}`,
    `V ${y + height - wave}`,
    `C ${x + width * 0.72} ${y + height - wave * 2}, ${x + width * 0.58} ${y + height + wave * 0.5}, ${x + width * 0.34} ${y + height - wave * 0.4}`,
    `C ${x + width * 0.18} ${y + height - wave}, ${x + width * 0.08} ${y + height - wave * 0.2}, ${x} ${y + height - wave * 0.45}`,
    "Z"
  ].join(" ");
}

function drawioStrokeAttrs(style: Record<string, string>, strokeWidth: number): Record<string, string | number> {
  const attrs: Record<string, string | number> = {
    "stroke-width": strokeWidth
  };
  if (style.dashed === "1") {
    attrs["stroke-dasharray"] = style.dashPattern || `${strokeWidth * 4} ${strokeWidth * 3}`;
  }
  return attrs;
}

function drawioTransform(shape: DrawioShape): string {
  const rotation = finiteNumber(shape.style.rotation, 0);
  if (!rotation) {
    return "";
  }
  return `rotate(${rotation} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`;
}

function createDrawioCloudPath(x: number, y: number, width: number, height: number): string {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return [
    `M ${x + width * 0.24} ${y + height * 0.72}`,
    `C ${x - width * 0.02} ${y + height * 0.68}, ${x + width * 0.02} ${y + height * 0.34}, ${x + width * 0.28} ${y + height * 0.38}`,
    `C ${x + width * 0.32} ${y + height * 0.12}, ${cx} ${y + height * 0.06}, ${x + width * 0.62} ${y + height * 0.26}`,
    `C ${x + width * 0.86} ${y + height * 0.2}, ${x + width * 1.02} ${y + height * 0.42}, ${x + width * 0.88} ${y + height * 0.62}`,
    `C ${x + width * 0.86} ${y + height * 0.84}, ${x + width * 0.42} ${y + height * 0.9}, ${x + width * 0.24} ${y + height * 0.72}`,
    "Z"
  ].join(" ");
}

function appendDrawioText(
  svg: SVGSVGElement,
  text: string,
  x: number,
  y: number,
  fill: string,
  style: Record<string, string> = {},
  transform = ""
): void {
  if (!text.trim()) {
    return;
  }
  const lines = normalizeDrawioLabel(text).split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return;
  }
  const textNode = document.createElementNS(SVG_NS, "text");
  const align = style.align || "center";
  const fontStyle = Number.parseInt(style.fontStyle || "0", 10);
  applySvgAttrs(textNode, {
    x: align === "left" ? x - finiteNumber(style.spacingLeft, 0) : align === "right" ? x + finiteNumber(style.spacingRight, 0) : x,
    y,
    fill,
    "font-size": finiteNumber(style.fontSize, 14),
    "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
    "font-weight": fontStyle & 1 ? "700" : undefined,
    "font-style": fontStyle & 2 ? "italic" : undefined,
    "text-decoration": fontStyle & 4 ? "underline" : undefined,
    "text-anchor": align === "left" ? "start" : align === "right" ? "end" : "middle",
    "dominant-baseline": "middle",
    transform
  });
  const firstDy = lines.length > 1 ? `${-0.55 * (lines.length - 1)}em` : "0";
  for (const [index, line] of lines.entries()) {
    const span = document.createElementNS(SVG_NS, "tspan");
    span.setAttribute("x", String(x));
    span.setAttribute("dy", index === 0 ? firstDy : "1.2em");
    span.textContent = line;
    textNode.append(span);
  }
  svg.append(textNode);
}

function normalizeDrawioLabel(text: string): string {
  const decoded = decodeXmlText(text);
  return decoded
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => decodeXmlText(line).replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function drawioColor(value: string | undefined, fallback: string): string {
  if (!value || value === "default") {
    return fallback;
  }
  return value.startsWith("#") ? value : `#${value}`;
}

function decodeXmlText(value: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function renderRawDrawing(panel: HTMLElement, extension: string, text: string): void {
  const section = createSection(`${extension} 基础预览`);
  const pre = document.createElement("pre");
  pre.className = "ofv-text-block";
  pre.textContent = text.slice(0, 30000);
  section.append(pre);
  panel.append(section);
}

function renderDrawingParseFallback(panel: HTMLElement, extension: string, text: string, error: unknown): void {
  panel.replaceChildren();
  const section = createSection(`${extension} 解析失败`);
  const message = document.createElement("p");
  message.textContent = error instanceof Error ? error.message : String(error);
  const pre = document.createElement("pre");
  pre.className = "ofv-text-block";
  pre.textContent = text.slice(0, 30000) || "文件内容为空。";
  section.append(message, pre);
  panel.append(section);
}

function decodeDrawioDiagram(value: string): string {
  try {
    const decoded = decodeURIComponent(escape(atob(value)));
    return pako.inflateRaw(Uint8Array.from(decoded, (char) => char.charCodeAt(0)), {
      to: "string"
    }) as string;
  } catch {
    return value;
  }
}
