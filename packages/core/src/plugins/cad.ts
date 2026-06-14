import type { PreviewPlugin } from "../types";
import { createPanel, createSection, readArrayBuffer, readTextFile, resolveFormat } from "./utils";

interface LayeredValue<T> {
  layer: string;
  value: T;
}

const cadExtensions = new Set([
  "dxf",
  "dwg",
  "dwf",
  "step",
  "stp",
  "iges",
  "igs",
  "ifc",
  "sat",
  "sab",
  "x_t",
  "x_b",
  "3dm",
  "skp",
  "sldprt",
  "sldasm"
]);
const cadMimeTypes = new Set([
  "application/acad",
  "application/dxf",
  "application/x-dxf",
  "image/vnd.dxf",
  "model/vnd.dwf",
  "model/step",
  "application/step",
  "application/iges",
  "application/x-step",
  "application/sat",
  "application/sab",
  "application/x-parasolid",
  "model/vnd.3dm",
  "application/vnd.sketchup.skp",
  "application/sldworks"
]);
const cadMimeFormatMap: Record<string, string> = {
  "application/acad": "dwg",
  "application/dxf": "dxf",
  "application/x-dxf": "dxf",
  "image/vnd.dxf": "dxf",
  "model/vnd.dwf": "dwf",
  "model/step": "step",
  "application/step": "step",
  "application/iges": "iges",
  "application/x-step": "ifc",
  "application/sat": "sat",
  "application/sab": "sab",
  "application/x-parasolid": "x_t",
  "model/vnd.3dm": "3dm",
  "application/vnd.sketchup.skp": "skp",
  "application/sldworks": "sldprt"
};

export function cadPlugin(): PreviewPlugin {
  return {
    name: "cad",
    match(file) {
      return cadExtensions.has(file.extension) || cadMimeTypes.has(file.mimeType);
    },
    async render(ctx) {
      const panel = createPanel("ofv-cad");
      ctx.viewport.append(panel);

      const extension = resolveFormat(ctx.file, cadMimeFormatMap);
      if (extension === "step" || extension === "stp") {
        renderStep(panel, await readTextFile(ctx.file), extension);
        return { destroy: () => panel.remove() };
      }
      if (extension === "iges" || extension === "igs") {
        renderIges(panel, await readTextFile(ctx.file), extension);
        return { destroy: () => panel.remove() };
      }
      if (extension === "dwg" || extension === "dwf") {
        renderBinaryCad(panel, await readArrayBuffer(ctx.file), extension, ctx.file.name);
        return { destroy: () => panel.remove() };
      }
      if (extension !== "dxf") {
        const section = createSection("CAD 基础预览");
        section.append(`.${extension || "cad"} 已识别为图纸/工程格式，当前前端插件优先渲染 DXF。该格式建议接入服务端转换或 WASM 专用引擎。`);
        panel.append(section);
        return { destroy: () => panel.remove() };
      }

      const dxf = await readTextFile(ctx.file);
      const viewer = renderDxf(panel, dxf);
      return {
        canCommand(command) {
          return viewer.canCommand(command);
        },
        command(command) {
          return viewer.command(command);
        },
        destroy() {
          panel.remove();
        }
      };
    }
  };
}

function renderStep(panel: HTMLElement, text: string, extension: string): void {
  const records = parseStepRecords(text);
  const typeCounts = countBy(records.map((record) => record.type));
  const section = createSection(`${extension.toUpperCase()} 结构预览`);
  const note = document.createElement("p");
  note.textContent = "当前版本提取 STEP 文本实体、类型统计和关键几何参数。精确 B-Rep/曲面渲染建议后续接入 CAD 内核或服务端转换。";

  const meta = document.createElement("div");
  meta.className = "ofv-cad-summary";
  appendMeta(meta, "实体", records.length);
  appendMeta(meta, "类型", typeCounts.size);
  appendMeta(meta, "点", typeCounts.get("CARTESIAN_POINT") || 0);
  appendMeta(meta, "方向", typeCounts.get("DIRECTION") || 0);
  section.append(note, meta, createCadTypeList(typeCounts));

  const table = createCadEntityTable(
    records.slice(0, 200).map((record) => ({
      id: record.id,
      type: record.type,
      detail: summarizeStepRecord(record)
    }))
  );
  section.append(table);
  panel.append(section);
}

function renderIges(panel: HTMLElement, text: string, extension: string): void {
  const records = parseIgesRecords(text);
  const typeCounts = countBy(records.map((record) => record.type));
  const section = createSection(`${extension.toUpperCase()} 结构预览`);
  const note = document.createElement("p");
  note.textContent = "当前版本提取 IGES 参数区实体、类型统计和基础参数。精确曲线/曲面渲染建议后续接入 CAD 内核或服务端转换。";

  const meta = document.createElement("div");
  meta.className = "ofv-cad-summary";
  appendMeta(meta, "实体", records.length);
  appendMeta(meta, "类型", typeCounts.size);
  appendMeta(meta, "点实体", typeCounts.get("116") || 0);
  appendMeta(meta, "线实体", typeCounts.get("110") || 0);
  section.append(note, meta, createCadTypeList(typeCounts, "类型号统计"));

  const table = createCadEntityTable(
    records.slice(0, 200).map((record, index) => ({
      id: String(index + 1),
      type: igesTypeName(record.type),
      detail: record.params.slice(0, 8).join(", ")
    }))
  );
  section.append(table);
  panel.append(section);
}

type StepRecord = {
  id: string;
  type: string;
  args: string;
};

type IgesRecord = {
  type: string;
  params: string[];
};

function renderBinaryCad(panel: HTMLElement, arrayBuffer: ArrayBuffer, extension: string, fileName: string): void {
  const bytes = new Uint8Array(arrayBuffer);
  const section = createSection(`${extension.toUpperCase()} 文件预览`);
  const note = document.createElement("p");
  note.textContent =
    extension === "dwg"
      ? "DWG 是 AutoCAD 专有二进制格式，当前前端插件提供文件识别、版本提示和转换建议；几何渲染建议接入 ODA/LibreDWG/服务端转换。"
      : "DWF 是发布用图纸格式，当前前端插件提供容器识别和转换建议；高保真页面渲染建议接入专用解析器或服务端转换。";

  const meta = document.createElement("div");
  meta.className = "ofv-cad-summary";
  appendMeta(meta, "文件", fileName);
  appendMeta(meta, "格式", extension.toUpperCase());
  appendMeta(meta, "大小", formatBytes(bytes.byteLength));
  appendMeta(meta, "签名", byteSignature(bytes));
  appendMeta(meta, "版本", detectCadVersion(bytes, extension));
  appendMeta(meta, "容器", detectCadContainer(bytes));

  const actions = document.createElement("ol");
  actions.className = "ofv-cad-conversion";
  const suggestions =
    extension === "dwg"
      ? [
          "服务端使用 ODA File Converter / Teigha 将 DWG 转为 DXF、SVG 或 PDF。",
          "浏览器端可后续接入 LibreDWG WASM，但需处理字体、块参照、外部参照和许可证。",
          "若业务只需预览，建议转换为 PDF/SVG 后走现有 PDF 或图像预览链路。"
        ]
      : [
          "优先在服务端转换为 PDF/SVG，保留图层、页面和标注信息。",
          "若 DWF 为压缩容器，可后续读取 manifest/descriptor 再还原页面资源。",
          "若业务只需下载/归档，保留当前文件元信息和转换提示即可。"
        ];
  for (const suggestion of suggestions) {
    const item = document.createElement("li");
    item.textContent = suggestion;
    actions.append(item);
  }

  const preview = document.createElement("pre");
  preview.className = "ofv-text-block";
  preview.textContent = hexPreview(bytes);

  section.append(note, meta, actions, preview);
  panel.append(section);
}

function parseStepRecords(text: string): StepRecord[] {
  return [...text.matchAll(/#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(([\s\S]*?)\)\s*;/gi)].map((match) => ({
    id: `#${match[1]}`,
    type: (match[2] || "").toUpperCase(),
    args: (match[3] || "").replace(/\s+/g, " ").trim()
  }));
}

function parseIgesRecords(text: string): IgesRecord[] {
  const parameterText = text
    .split(/\r?\n/)
    .filter((line) => line.slice(72, 73).toUpperCase() === "P" || /^\s*\d+\s*,/.test(line))
    .map((line) => line.slice(0, 72).trim())
    .join("");
  if (!parameterText) {
    return [];
  }
  return parameterText
    .split(";")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const params = record.split(",").map((part) => part.trim()).filter(Boolean);
      return { type: params[0] || "UNKNOWN", params };
    });
}

function summarizeStepRecord(record: StepRecord): string {
  if (record.type === "CARTESIAN_POINT") {
    const point = record.args.match(/\(([-+0-9., E]+)\)/i)?.[1];
    return point ? `坐标 ${point.replace(/\s+/g, "")}` : record.args;
  }
  if (record.type === "DIRECTION" || record.type === "VECTOR") {
    const direction = record.args.match(/\(([-+0-9., E]+)\)/i)?.[1];
    return direction ? `向量 ${direction.replace(/\s+/g, "")}` : record.args;
  }
  if (record.type === "LINE" || record.type === "CIRCLE" || record.type === "ADVANCED_FACE") {
    return record.args.slice(0, 180);
  }
  return record.args.slice(0, 120);
}

function igesTypeName(type: string): string {
  const names: Record<string, string> = {
    "100": "100 Circular Arc",
    "110": "110 Line",
    "112": "112 Parametric Spline Curve",
    "114": "114 Parametric Spline Surface",
    "116": "116 Point",
    "118": "118 Ruled Surface",
    "120": "120 Surface of Revolution",
    "126": "126 Rational B-Spline Curve",
    "128": "128 Rational B-Spline Surface",
    "144": "144 Trimmed Surface"
  };
  return names[type] || type;
}

function createCadTypeList(counts: Map<string, number>, titleText = "类型统计"): HTMLElement {
  const details = document.createElement("details");
  details.className = "ofv-details ofv-cad-types";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = titleText;
  const list = document.createElement("ul");
  for (const [type, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80)) {
    const item = document.createElement("li");
    item.textContent = `${type}: ${count}`;
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function createCadEntityTable(rows: Array<{ id: string; type: string; detail: string }>): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ofv-table-scroll ofv-cad-entities";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["ID", "类型", "摘要"]) {
    const cell = document.createElement("th");
    cell.textContent = label;
    header.append(cell);
  }
  thead.append(header);
  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const value of [row.id, row.type, row.detail]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return counts;
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

function detectCadVersion(bytes: Uint8Array, extension: string): string {
  const header = new TextDecoder("ascii").decode(bytes.slice(0, Math.min(bytes.length, 32)));
  if (extension === "dwg") {
    const match = header.match(/AC\d{4}/);
    if (!match) {
      return "未知 DWG 版本";
    }
    const names: Record<string, string> = {
      AC1009: "AutoCAD R12",
      AC1012: "AutoCAD R13",
      AC1014: "AutoCAD R14",
      AC1015: "AutoCAD 2000/2002",
      AC1018: "AutoCAD 2004/2005/2006",
      AC1021: "AutoCAD 2007/2008/2009",
      AC1024: "AutoCAD 2010/2011/2012",
      AC1027: "AutoCAD 2013/2014/2015/2016/2017",
      AC1032: "AutoCAD 2018+"
    };
    return `${match[0]}${names[match[0]] ? ` · ${names[match[0]]}` : ""}`;
  }
  if (header.startsWith("(DWF") || header.includes("DWF")) {
    return header.split(/\s+/)[0] || "DWF";
  }
  return "未知版本";
}

function detectCadContainer(bytes: Uint8Array): string {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return "ZIP/PK 压缩容器";
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return "GZIP 压缩流";
  }
  if (bytes[0] === 0x28 && bytes[1] === 0x44 && bytes[2] === 0x57 && bytes[3] === 0x46) {
    return "DWF ASCII 头";
  }
  return "二进制流";
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
  return rows.join("\n") || "无可展示字节。";
}

function renderDxf(
  panel: HTMLElement,
  dxf: string
): {
  canCommand: (command: string) => boolean;
  command: (command: string) => boolean;
} {
  const pairs = dxf.split(/\r?\n/).map((line) => line.trim());
  const lines: Array<LayeredValue<[number, number, number, number]>> = [];
  const circles: Array<LayeredValue<[number, number, number]>> = [];
  const arcs: Array<LayeredValue<[number, number, number, number, number]>> = [];
  const points: Array<LayeredValue<[number, number]>> = [];
  const polylines: Array<LayeredValue<Array<[number, number]>>> = [];
  const texts: Array<LayeredValue<[number, number, string, number]>> = [];

  for (let index = 0; index < pairs.length; index += 2) {
    const code = pairs[index];
    const value = pairs[index + 1];
    if (code === "0" && value === "LINE") {
      const entity = readEntity(pairs, index + 2);
      lines.push({
        layer: normalizeLayerName(entity["8"]),
        value: [
          Number(entity["10"] || 0),
          Number(entity["20"] || 0),
          Number(entity["11"] || 0),
          Number(entity["21"] || 0)
        ]
      });
    }
    if (code === "0" && value === "CIRCLE") {
      const entity = readEntity(pairs, index + 2);
      circles.push({
        layer: normalizeLayerName(entity["8"]),
        value: [
          Number(entity["10"] || 0),
          Number(entity["20"] || 0),
          Number(entity["40"] || 0)
        ]
      });
    }
    if (code === "0" && value === "ARC") {
      const entity = readEntity(pairs, index + 2);
      arcs.push({
        layer: normalizeLayerName(entity["8"]),
        value: [
          Number(entity["10"] || 0),
          Number(entity["20"] || 0),
          Number(entity["40"] || 0),
          Number(entity["50"] || 0),
          Number(entity["51"] || 0)
        ]
      });
    }
    if (code === "0" && value === "POINT") {
      const entity = readEntity(pairs, index + 2);
      points.push({
        layer: normalizeLayerName(entity["8"]),
        value: [Number(entity["10"] || 0), Number(entity["20"] || 0)]
      });
    }
    if (code === "0" && value === "LWPOLYLINE") {
      const entity = readEntity(pairs, index + 2);
      const entityPairs = readEntityPairs(pairs, index + 2);
      const polyline = readPolylinePoints(entityPairs);
      if (polyline.length > 1) {
        polylines.push({ layer: normalizeLayerName(entity["8"]), value: polyline });
      }
    }
    if (code === "0" && value === "POLYLINE") {
      const result = readLegacyPolyline(pairs, index + 2);
      if (result.points.length > 1) {
        polylines.push({ layer: result.layer, value: result.points });
      }
      index = Math.max(index, result.endIndex - 2);
    }
    if (code === "0" && (value === "TEXT" || value === "MTEXT")) {
      const entity = readEntity(pairs, index + 2);
      const text = normalizeDxfText(entity["1"] || entity["3"] || "");
      if (text) {
        texts.push({
          layer: normalizeLayerName(entity["8"]),
          value: [
            Number(entity["10"] || 0),
            Number(entity["20"] || 0),
            text,
            Math.max(1, Number(entity["40"] || 12))
          ]
        });
      }
    }
  }

  const section = createSection(`DXF 基础预览`);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ofv-svg-stage");

  const bounds = computeBounds(lines, circles, arcs, points, polylines, texts);
  const initialViewBox = {
    x: bounds.minX,
    y: bounds.minY,
    width: bounds.width,
    height: bounds.height
  };
  let currentViewBox = { ...initialViewBox };
  const applyViewBox = () => {
    svg.setAttribute(
      "viewBox",
      `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`
    );
  };
  applyViewBox();

  for (const item of lines.slice(0, 3000)) {
    const [x1, y1, x2, y2] = item.value;
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(-y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(-y2));
    line.setAttribute("stroke", "#111827");
    line.setAttribute("stroke-width", String(bounds.stroke));
    applyLayer(line, item.layer);
    svg.append(line);
  }

  for (const item of circles.slice(0, 1000)) {
    const [cx, cy, radius] = item.value;
    const circle = document.createElementNS(svg.namespaceURI, "circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(-cy));
    circle.setAttribute("r", String(Math.abs(radius)));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "#2563eb");
    circle.setAttribute("stroke-width", String(bounds.stroke));
    applyLayer(circle, item.layer);
    svg.append(circle);
  }

  for (const item of arcs.slice(0, 1000)) {
    const [cx, cy, radius, startAngle, endAngle] = item.value;
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", arcPath(cx, -cy, Math.abs(radius), -startAngle, -endAngle));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#7c3aed");
    path.setAttribute("stroke-width", String(bounds.stroke));
    applyLayer(path, item.layer);
    svg.append(path);
  }

  for (const item of polylines.slice(0, 2000)) {
    const polyline = item.value;
    const path = document.createElementNS(svg.namespaceURI, "polyline");
    path.setAttribute("points", polyline.map(([x, y]) => `${x},${-y}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#0f766e");
    path.setAttribute("stroke-width", String(bounds.stroke));
    applyLayer(path, item.layer);
    svg.append(path);
  }

  for (const item of points.slice(0, 3000)) {
    const [x, y] = item.value;
    const point = document.createElementNS(svg.namespaceURI, "circle");
    point.setAttribute("cx", String(x));
    point.setAttribute("cy", String(-y));
    point.setAttribute("r", String(bounds.stroke * 2));
    point.setAttribute("fill", "#dc2626");
    applyLayer(point, item.layer);
    svg.append(point);
  }

  for (const item of texts.slice(0, 500)) {
    const [x, y, text, height] = item.value;
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(-y));
    label.setAttribute("font-size", String(Math.max(height, bounds.stroke * 8)));
    label.setAttribute("fill", "currentColor");
    label.textContent = text;
    applyLayer(label, item.layer);
    svg.append(label);
  }

  const layers = Array.from(
    new Set([...lines, ...circles, ...arcs, ...points, ...polylines, ...texts].map((item) => item.layer))
  ).sort((a, b) => a.localeCompare(b));
  if (layers.length > 0) {
    section.append(createLayerControls(svg, layers));
  }

  const note = document.createElement("p");
  note.textContent =
    `已提取 LINE ${lines.length} 个、CIRCLE ${circles.length} 个、ARC ${arcs.length} 个、POLYLINE ${polylines.length} 个、POINT ${points.length} 个、TEXT ${texts.length} 个。`
  section.append(note, svg);
  panel.append(section);

  return {
    canCommand(command) {
      return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
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
        applyViewBox();
        return true;
      }
      return false;
    }
  };
}

function applyLayer(element: Element, layer: string): void {
  element.setAttribute("data-layer", layer);
}

function createLayerControls(svg: SVGSVGElement, layers: string[]): HTMLElement {
  const controls = document.createElement("div");
  controls.className = "ofv-cad-layers";
  const title = document.createElement("strong");
  title.textContent = `图层 ${layers.length}`;
  controls.append(title);

  for (const layer of layers) {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.addEventListener("change", () => {
      for (const element of svg.querySelectorAll<SVGElement>(`[data-layer="${escapeCssAttribute(layer)}"]`)) {
        element.style.display = checkbox.checked ? "" : "none";
      }
    });
    const name = document.createElement("span");
    name.textContent = layer;
    label.append(checkbox, name);
    controls.append(label);
  }
  return controls;
}

function readEntity(pairs: string[], start: number): Record<string, string> {
  const entity: Record<string, string> = {};
  for (let index = start; index < pairs.length; index += 2) {
    const code = pairs[index];
    const value = pairs[index + 1];
    if (code === "0") {
      break;
    }
    entity[code] = value;
  }
  return entity;
}

function readEntityPairs(pairs: string[], start: number): Array<[string, string]> {
  const entityPairs: Array<[string, string]> = [];
  for (let index = start; index < pairs.length; index += 2) {
    const code = pairs[index];
    const value = pairs[index + 1];
    if (code === "0") {
      break;
    }
    entityPairs.push([code, value]);
  }
  return entityPairs;
}

function readPolylinePoints(entityPairs: Array<[string, string]>): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let x: number | undefined;
  for (const [code, value] of entityPairs) {
    if (code === "10") {
      x = Number(value);
    }
    if (code === "20" && x !== undefined) {
      points.push([x, Number(value)]);
      x = undefined;
    }
  }
  return points;
}

function readLegacyPolyline(
  pairs: string[],
  start: number
): { layer: string; points: Array<[number, number]>; endIndex: number } {
  let layer = "0";
  const points: Array<[number, number]> = [];
  for (let index = start; index < pairs.length; index += 2) {
    const code = pairs[index];
    const value = pairs[index + 1];
    if (code === "0" && value === "SEQEND") {
      return { layer, points, endIndex: index + 2 };
    }
    if (code === "8") {
      layer = normalizeLayerName(value);
    }
    if (code === "0" && value === "VERTEX") {
      const entity = readEntity(pairs, index + 2);
      points.push([Number(entity["10"] || 0), Number(entity["20"] || 0)]);
    }
  }
  return { layer, points, endIndex: pairs.length };
}

function normalizeLayerName(layer: string | undefined): string {
  return layer?.trim() || "0";
}

function escapeCssAttribute(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeDxfText(text: string): string {
  return text
    .replace(/\\P/g, "\n")
    .replace(/\{\\[^;]+;/g, "")
    .replace(/[{}]/g, "")
    .trim();
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const delta = Math.abs(endAngle - startAngle);
  const largeArc = delta <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDegrees: number): { x: number; y: number } {
  const angle = (angleDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle)
  };
}

function computeBounds(
  lines: Array<LayeredValue<[number, number, number, number]>>,
  circles: Array<LayeredValue<[number, number, number]>>,
  arcs: Array<LayeredValue<[number, number, number, number, number]>>,
  points: Array<LayeredValue<[number, number]>>,
  polylines: Array<LayeredValue<Array<[number, number]>>>,
  texts: Array<LayeredValue<[number, number, string, number]>>
): { minX: number; minY: number; width: number; height: number; stroke: number } {
  const xs = lines.flatMap(({ value: [x1, , x2] }) => [x1, x2]);
  const ys = lines.flatMap(({ value: [, y1, , y2] }) => [-y1, -y2]);
  for (const { value: [cx, cy, radius] } of circles) {
    xs.push(cx - radius, cx + radius);
    ys.push(-cy - radius, -cy + radius);
  }
  for (const { value: [cx, cy, radius] } of arcs) {
    xs.push(cx - radius, cx + radius);
    ys.push(-cy - radius, -cy + radius);
  }
  for (const { value: [x, y] } of points) {
    xs.push(x);
    ys.push(-y);
  }
  for (const { value: polyline } of polylines) {
    for (const [x, y] of polyline) {
      xs.push(x);
      ys.push(-y);
    }
  }
  for (const { value: [x, y, text, height] } of texts) {
    xs.push(x, x + text.length * height * 0.6);
    ys.push(-y, -y - height);
  }
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 100);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 100);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    minY,
    width,
    height,
    stroke: Math.max(width, height) / 600
  };
}
