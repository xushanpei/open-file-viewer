import pako from "pako";
import type { PreviewContext, PreviewInstance, PreviewPlugin } from "../types";
import { renderLibreDwgPreview, type LibreDwgPreviewOptions } from "./cad-dwg";
import { createPanel, createSection, readArrayBuffer, readTextFile, resolveFormat } from "./utils";

export interface CadBinaryPreviewContext {
  panel: HTMLElement;
  fileName: string;
  extension: "dwg" | "dwf";
  arrayBuffer: ArrayBuffer;
  bytes: Uint8Array;
  preview: PreviewContext;
}

export interface CadPluginOptions {
  /**
   * Optional high-fidelity renderer for proprietary binary CAD files. When it
   * returns a preview instance, it takes over DWG/DWF rendering completely.
   *
   * Use it for custom front-end engines or server-side CAD conversion services.
   */
  binaryRenderer?: (ctx: CadBinaryPreviewContext) => Promise<PreviewInstance | void> | PreviewInstance | void;
  /**
   * Built-in best-effort DWG preview powered by LibreDWG WASM.
   *
   * Pass `false` to keep the old metadata-only DWG behavior. Pass an object to
   * configure the public WASM asset path.
   */
  libreDwg?: false | LibreDwgPreviewOptions;
}

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
  "sldasm",
  "gds",
  "oas",
  "oasis"
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
  "application/sldworks",
  "application/vnd.gds",
  "application/x-gdsii",
  "application/vnd.oasis.layout",
  "application/x-oasis-layout"
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
  "application/sldworks": "sldprt",
  "application/vnd.gds": "gds",
  "application/x-gdsii": "gds",
  "application/vnd.oasis.layout": "oas",
  "application/x-oasis-layout": "oas"
};

export function cadPlugin(options: CadPluginOptions = {}): PreviewPlugin {
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
      if (extension === "ifc") {
        renderIfc(panel, await readTextFile(ctx.file));
        return { destroy: () => panel.remove() };
      }
      if (extension === "dwg" || extension === "dwf") {
        const arrayBuffer = await readArrayBuffer(ctx.file);
        const bytes = new Uint8Array(arrayBuffer);
        const enhancedInstance = await options.binaryRenderer?.({
          panel,
          fileName: ctx.file.name,
          extension,
          arrayBuffer,
          bytes,
          preview: ctx
        });
        if (enhancedInstance) {
          return {
            resize(size) {
              enhancedInstance.resize?.(size);
            },
            canCommand(command) {
              return enhancedInstance.canCommand?.(command) ?? false;
            },
            command(command) {
              return enhancedInstance.command?.(command);
            },
            destroy() {
              enhancedInstance.destroy();
              panel.remove();
            }
          };
        }
        if (extension === "dwg" && options.libreDwg !== false) {
          const libreDwgInstance = await renderLibreDwgPreview(
            {
              panel,
              fileName: ctx.file.name,
              extension,
              arrayBuffer,
              bytes,
              preview: ctx
            },
            typeof options.libreDwg === "object" ? options.libreDwg : undefined
          );
          if (libreDwgInstance) {
            return {
              resize(size) {
                libreDwgInstance.resize?.(size);
              },
              canCommand(command) {
                return libreDwgInstance.canCommand?.(command) ?? false;
              },
              command(command) {
                return libreDwgInstance.command?.(command);
              },
              destroy() {
                libreDwgInstance.destroy();
                panel.remove();
              }
            };
          }
        }
        renderBinaryCad(panel, bytes, extension, ctx.file.name);
        return { destroy: () => panel.remove() };
      }
      if (extension === "gds") {
        const viewer = renderLayoutPreview(panel, parseGdsLayout(new Uint8Array(await readArrayBuffer(ctx.file)), ctx.file.name), ctx);
        return {
          canCommand(command) {
            return viewer.canCommand(command);
          },
          command(command) {
            return viewer.command(command);
          },
          destroy() {
            viewer.destroy();
            panel.remove();
          }
        };
      }
      if (extension === "oas" || extension === "oasis") {
        const viewer = renderLayoutPreview(panel, parseOasisLayout(new Uint8Array(await readArrayBuffer(ctx.file)), ctx.file.name), ctx);
        return {
          canCommand(command) {
            return viewer.canCommand(command);
          },
          command(command) {
            return viewer.command(command);
          },
          destroy() {
            viewer.destroy();
            panel.remove();
          }
        };
      }
      if (extension !== "dxf") {
        const section = createSection("CAD 基础预览");
        section.append(`.${extension || "cad"} 已识别为图纸/工程格式，当前前端插件优先渲染 DXF。该格式建议接入服务端转换或 WASM 专用引擎。`);
        panel.append(section);
        return { destroy: () => panel.remove() };
      }

      const dxf = await readTextFile(ctx.file);
      const viewer = renderDxf(panel, dxf, ctx);
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

function renderIfc(panel: HTMLElement, text: string): void {
  const records = parseStepRecords(text);
  const typeCounts = countBy(records.map((record) => record.type));
  const section = createSection("IFC BIM 结构预览");
  const note = document.createElement("p");
  note.textContent = "当前版本提取 IFC STEP 实体、BIM 层级和常见构件统计。几何网格、材质和属性集可后续接入 IfcOpenShell/IFC.js 增强。";

  const meta = document.createElement("div");
  meta.className = "ofv-cad-summary";
  appendMeta(meta, "实体", records.length);
  appendMeta(meta, "类型", typeCounts.size);
  appendMeta(meta, "项目", typeCounts.get("IFCPROJECT") || 0);
  appendMeta(meta, "建筑", typeCounts.get("IFCBUILDING") || 0);
  appendMeta(meta, "楼层", typeCounts.get("IFCBUILDINGSTOREY") || 0);
  appendMeta(meta, "空间", typeCounts.get("IFCSPACE") || 0);
  appendMeta(meta, "构件", countIfcElements(typeCounts));
  section.append(note, meta, createCadTypeList(typeCounts, "IFC 实体统计"));

  const hierarchy = createIfcHierarchy(records);
  if (hierarchy) {
    section.append(hierarchy);
  }

  const table = createCadEntityTable(
    records.slice(0, 240).map((record) => ({
      id: record.id,
      type: record.type,
      detail: summarizeIfcRecord(record)
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

type LayoutPoint = [number, number];

type LayoutShape = {
  kind: "boundary" | "path" | "box";
  layer: string;
  datatype?: string;
  points: LayoutPoint[];
  width?: number;
};

type LayoutLabel = {
  layer: string;
  text: string;
  x: number;
  y: number;
};

type LayoutReference = {
  cell: string;
  x: number;
  y: number;
};

type LayoutPreviewData = {
  format: "GDSII" | "OASIS";
  fileName: string;
  libraryName?: string;
  version?: string;
  unit?: string;
  cells: string[];
  shapes: LayoutShape[];
  labels: LayoutLabel[];
  references: LayoutReference[];
  layers: Map<string, number>;
  metadata: Array<[string, string | number]>;
  notes: string[];
  warnings: string[];
};

type LayoutBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
  stroke: number;
};

const layoutPalette = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#be123c",
  "#4f46e5",
  "#15803d",
  "#a16207"
];

const gdsRecordNames: Record<number, string> = {
  0x00: "HEADER",
  0x01: "BGNLIB",
  0x02: "LIBNAME",
  0x03: "UNITS",
  0x04: "ENDLIB",
  0x05: "BGNSTR",
  0x06: "STRNAME",
  0x07: "ENDSTR",
  0x08: "BOUNDARY",
  0x09: "PATH",
  0x0a: "SREF",
  0x0b: "AREF",
  0x0c: "TEXT",
  0x0d: "LAYER",
  0x0e: "DATATYPE",
  0x0f: "WIDTH",
  0x10: "XY",
  0x11: "ENDEL",
  0x12: "SNAME",
  0x16: "TEXTTYPE",
  0x19: "STRING",
  0x2d: "BOX"
};

const oasisRecordNames: Record<number, string> = {
  0: "PAD",
  1: "START",
  2: "END",
  3: "CELLNAME",
  4: "CELLNAME-REF",
  5: "TEXTSTRING",
  6: "TEXTSTRING-REF",
  7: "PROPNAME",
  8: "PROPNAME-REF",
  9: "PROPSTRING",
  10: "PROPSTRING-REF",
  11: "LAYERNAME",
  12: "LAYERNAME-REF",
  13: "CELL",
  14: "XYABSOLUTE",
  15: "XYRELATIVE",
  16: "PLACEMENT",
  17: "PLACEMENT",
  18: "TEXT",
  19: "RECTANGLE",
  20: "POLYGON",
  21: "PATH",
  22: "TRAPEZOID",
  23: "TRAPEZOID",
  24: "TRAPEZOID",
  25: "CTRAPEZOID",
  26: "CIRCLE",
  27: "PROPERTY",
  28: "PROPERTY",
  29: "XNAME",
  30: "XNAME-REF",
  31: "XELEMENT",
  32: "XGEOMETRY",
  33: "CBLOCK"
};

function renderLayoutPreview(
  panel: HTMLElement,
  data: LayoutPreviewData,
  ctx: Pick<PreviewContext, "toolbar">
): {
  canCommand: (command: string) => boolean;
  command: (command: string) => boolean;
  destroy: () => void;
} {
  const section = createSection(`${data.format} 版图预览`);
  const summary = document.createElement("div");
  summary.className = "ofv-cad-summary ofv-layout-summary";
  appendMeta(summary, "文件", data.fileName);
  appendMeta(summary, "格式", data.format);
  if (data.libraryName) {
    appendMeta(summary, "库", data.libraryName);
  }
  if (data.version) {
    appendMeta(summary, "版本", data.version);
  }
  if (data.unit) {
    appendMeta(summary, "单位", data.unit);
  }
  appendMeta(summary, "Cell", data.cells.length);
  appendMeta(summary, "几何", data.shapes.length);
  appendMeta(summary, "引用", data.references.length);
  appendMeta(summary, "文字", data.labels.length);
  for (const [label, value] of data.metadata) {
    appendMeta(summary, label, value);
  }
  section.append(summary);

  for (const noteText of [...data.notes, ...data.warnings]) {
    const note = document.createElement("p");
    note.className = data.warnings.includes(noteText) ? "ofv-layout-warning" : "ofv-layout-note";
    note.textContent = noteText;
    section.append(note);
  }

  const bounds = computeLayoutBounds(data.shapes, data.labels, data.references);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ofv-svg-stage ofv-layout-stage");
  let currentViewBox = { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height };
  const initialViewBox = { ...currentViewBox };
  const applyViewBox = () => {
    svg.setAttribute("viewBox", `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
  };
  applyViewBox();

  if (data.shapes.length === 0) {
    const empty = document.createElementNS(svg.namespaceURI, "text");
    empty.setAttribute("x", String(bounds.minX + bounds.width * 0.5));
    empty.setAttribute("y", String(bounds.minY + bounds.height * 0.5));
    empty.setAttribute("text-anchor", "middle");
    empty.setAttribute("font-size", String(Math.max(bounds.width, bounds.height) / 34));
    empty.setAttribute("fill", "currentColor");
    empty.textContent = "已识别版图文件，当前文件未解析出可绘制几何";
    svg.append(empty);
  }

  const layerIndex = new Map([...data.layers.keys()].sort((a, b) => a.localeCompare(b)).map((layer, index) => [layer, index]));
  for (const shape of data.shapes.slice(0, 6000)) {
    const color = layoutPalette[(layerIndex.get(shape.layer) || 0) % layoutPalette.length];
    if (shape.kind === "path") {
      const polyline = document.createElementNS(svg.namespaceURI, "polyline");
      polyline.setAttribute("points", shape.points.map(([x, y]) => `${x},${-y}`).join(" "));
      polyline.setAttribute("fill", "none");
      polyline.setAttribute("stroke", color);
      polyline.setAttribute("stroke-width", String(Math.max(bounds.stroke, Math.abs(shape.width || 0))));
      polyline.setAttribute("stroke-linecap", "round");
      polyline.setAttribute("stroke-linejoin", "round");
      applyLayer(polyline, shape.layer);
      svg.append(polyline);
      continue;
    }
    const polygon = document.createElementNS(svg.namespaceURI, "polygon");
    polygon.setAttribute("points", shape.points.map(([x, y]) => `${x},${-y}`).join(" "));
    polygon.setAttribute("fill", color);
    polygon.setAttribute("fill-opacity", "0.18");
    polygon.setAttribute("stroke", color);
    polygon.setAttribute("stroke-width", String(bounds.stroke));
    polygon.setAttribute("vector-effect", "non-scaling-stroke");
    applyLayer(polygon, shape.layer);
    svg.append(polygon);
  }

  for (const label of data.labels.slice(0, 400)) {
    const text = document.createElementNS(svg.namespaceURI, "text");
    text.setAttribute("x", String(label.x));
    text.setAttribute("y", String(-label.y));
    text.setAttribute("font-size", String(Math.max(bounds.stroke * 12, Math.max(bounds.width, bounds.height) / 120)));
    text.setAttribute("fill", "currentColor");
    text.textContent = label.text;
    applyLayer(text, label.layer);
    svg.append(text);
  }

  const layers = [...data.layers.keys()].sort((a, b) => a.localeCompare(b));
  if (layers.length > 0) {
    section.append(createLayoutLayerControls(svg, layers, data.layers));
  }
  section.append(svg);
  if (data.cells.length > 0) {
    section.append(createLayoutCellList(data.cells, data.references));
  }
  panel.append(section);

  const updateToolbarZoom = () => ctx.toolbar?.setZoom(initialViewBox.width / currentViewBox.width);
  updateToolbarZoom();

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
        updateToolbarZoom();
        return true;
      }
      if (command === "zoom-reset") {
        currentViewBox = { ...initialViewBox };
        applyViewBox();
        updateToolbarZoom();
        return true;
      }
      return false;
    },
    destroy() {
      ctx.toolbar?.setZoom(undefined);
    }
  };
}

function parseGdsLayout(bytes: Uint8Array, fileName: string): LayoutPreviewData {
  const shapes: LayoutShape[] = [];
  const labels: LayoutLabel[] = [];
  const references: LayoutReference[] = [];
  const cells: string[] = [];
  const layers = new Map<string, number>();
  const recordCounts = new Map<string, number>();
  const warnings: string[] = [];
  let libraryName = "";
  let version = "";
  let unit = "";
  let offset = 0;
  let current: Partial<LayoutShape> & Partial<LayoutLabel> & { cell?: string } = {};
  let currentKind = "";

  while (offset + 4 <= bytes.length) {
    const length = readUInt16(bytes, offset);
    const recordType = bytes[offset + 2];
    const data = bytes.slice(offset + 4, offset + length);
    const name = gdsRecordNames[recordType] || `0x${recordType.toString(16).padStart(2, "0")}`;
    recordCounts.set(name, (recordCounts.get(name) || 0) + 1);
    if (length < 4 || offset + length > bytes.length) {
      warnings.push(`GDS 记录在 ${offset} 字节处长度异常，已停止解析。`);
      break;
    }

    if (recordType === 0x00 && data.length >= 2) {
      version = String(readUInt16(data, 0));
    } else if (recordType === 0x02) {
      libraryName = readGdsString(data);
    } else if (recordType === 0x03 && data.length >= 16) {
      unit = `${formatGdsReal(data, 0)} / ${formatGdsReal(data, 8)}`;
    } else if (recordType === 0x06) {
      cells.push(readGdsString(data));
    } else if (recordType === 0x08 || recordType === 0x09 || recordType === 0x2d) {
      currentKind = recordType === 0x09 ? "path" : recordType === 0x2d ? "box" : "boundary";
      current = { kind: currentKind as LayoutShape["kind"], layer: "0", datatype: "0", points: [] };
    } else if (recordType === 0x0c) {
      currentKind = "text";
      current = { layer: "0", text: "", x: 0, y: 0 };
    } else if (recordType === 0x0a || recordType === 0x0b) {
      currentKind = "reference";
      current = { cell: "", x: 0, y: 0 };
    } else if (recordType === 0x0d && data.length >= 2) {
      current.layer = String(readInt16(data, 0));
    } else if ((recordType === 0x0e || recordType === 0x16) && data.length >= 2) {
      current.datatype = String(readInt16(data, 0));
    } else if (recordType === 0x0f && data.length >= 4) {
      current.width = Math.abs(readInt32(data, 0));
    } else if (recordType === 0x10) {
      const points = readGdsPoints(data);
      if (currentKind === "text" && points[0]) {
        current.x = points[0][0];
        current.y = points[0][1];
      } else if (currentKind === "reference" && points[0]) {
        current.x = points[0][0];
        current.y = points[0][1];
      } else {
        current.points = points;
      }
    } else if (recordType === 0x12) {
      current.cell = readGdsString(data);
    } else if (recordType === 0x19) {
      current.text = readGdsString(data);
    } else if (recordType === 0x11) {
      if ((currentKind === "boundary" || currentKind === "path" || currentKind === "box") && current.points && current.points.length > 1) {
        const shape: LayoutShape = {
          kind: current.kind || "boundary",
          layer: String(current.layer || "0"),
          datatype: current.datatype,
          points: current.points,
          width: current.width
        };
        shapes.push(shape);
        layers.set(shape.layer, (layers.get(shape.layer) || 0) + 1);
      } else if (currentKind === "text" && current.text) {
        const label: LayoutLabel = {
          layer: String(current.layer || "0"),
          text: String(current.text),
          x: Number(current.x || 0),
          y: Number(current.y || 0)
        };
        labels.push(label);
        layers.set(label.layer, (layers.get(label.layer) || 0) + 1);
      } else if (currentKind === "reference" && current.cell) {
        references.push({ cell: String(current.cell), x: Number(current.x || 0), y: Number(current.y || 0) });
      }
      current = {};
      currentKind = "";
    }

    offset += length;
  }

  return {
    format: "GDSII",
    fileName,
    libraryName,
    version: version ? `Stream ${version}` : undefined,
    unit,
    cells,
    shapes,
    labels,
    references,
    layers,
    metadata: [
      ["大小", formatBytes(bytes.byteLength)],
      ["记录", sumCounts(recordCounts)],
      ["记录类型", recordCounts.size]
    ],
    notes: [
      `已从 GDSII Stream 中解析 ${shapes.length} 个几何、${references.length} 个 cell 引用和 ${labels.length} 段文字。`
    ],
    warnings
  };
}

function parseOasisLayout(bytes: Uint8Array, fileName: string): LayoutPreviewData {
  const chunks = extractOasisCblocks(bytes);
  const expanded = chunks.flatMap((chunk) => [...chunk.bytes]);
  const cellNames = uniqueHints([...extractAsciiRuns(bytes), ...chunks.flatMap((chunk) => extractAsciiRuns(chunk.bytes))])
    .filter((item) => /^[A-Za-z_][\w$.-]{1,80}$/.test(item))
    .filter((item) => !item.startsWith("S_"));
  const propertyNames = uniqueHints(chunks.flatMap((chunk) => extractAsciiRuns(chunk.bytes)).filter((item) => item.startsWith("S_")));
  const recordCounts = scanOasisRecordCounts(bytes);
  const expandedCounts = scanOasisRecordCounts(new Uint8Array(expanded));
  const layers = new Map<string, number>();
  const shapes: LayoutShape[] = [];
  const labels: LayoutLabel[] = [];
  const references: LayoutReference[] = [];

  for (const name of cellNames) {
    references.push({ cell: name, x: 0, y: 0 });
  }

  const pseudo = createOasisStructureShapes(cellNames, chunks.length || recordCounts.size || 1);
  for (const shape of pseudo) {
    shapes.push(shape);
    layers.set(shape.layer, (layers.get(shape.layer) || 0) + 1);
  }
  for (let index = 0; index < cellNames.length; index++) {
    labels.push({ layer: "cell", text: cellNames[index], x: 12, y: -(18 + index * 18) });
  }
  if (cellNames.length > 0) {
    layers.set("cell", (layers.get("cell") || 0) + cellNames.length);
  }

  const version = readOasisVersion(bytes);
  const cblockText = chunks.length
    ? `${chunks.length} 个，展开 ${formatBytes(chunks.reduce((sum, chunk) => sum + chunk.bytes.byteLength, 0))}`
    : "未发现";
  const notes = [
    "OASIS 是高压缩芯片版图格式，当前版本提供浏览器端识别、CBLOCK 解压、cell/属性结构和轻量结构示意；完整几何高保真渲染建议后续接入专用 OASIS 解析器。"
  ];
  if (propertyNames.length > 0) {
    notes.push(`识别到属性：${propertyNames.slice(0, 5).join("、")}`);
  }

  return {
    format: "OASIS",
    fileName,
    version,
    cells: cellNames,
    shapes,
    labels,
    references: [],
    layers,
    metadata: [
      ["大小", formatBytes(bytes.byteLength)],
      ["CBLOCK", cblockText],
      ["记录类型", recordCounts.size + expandedCounts.size],
      ["可读片段", cellNames.length + propertyNames.length]
    ],
    notes,
    warnings: cellNames.length === 0 ? ["当前 OASIS 文件未提取到 cell 名称，可能使用了更复杂的索引或加密/压缩布局。"] : []
  };
}

function computeLayoutBounds(shapes: LayoutShape[], labels: LayoutLabel[], references: LayoutReference[]): LayoutBounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const shape of shapes) {
    for (const [x, y] of shape.points) {
      xs.push(x);
      ys.push(-y);
    }
  }
  for (const label of labels) {
    xs.push(label.x, label.x + label.text.length * 12);
    ys.push(-label.y, -label.y - 16);
  }
  for (const reference of references) {
    xs.push(reference.x);
    ys.push(-reference.y);
  }
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 100);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 100);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padding = Math.max(width, height) * 0.06;
  return {
    minX: minX - padding,
    minY: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2,
    stroke: Math.max(width, height) / 900
  };
}

function createLayoutLayerControls(svg: SVGSVGElement, layers: string[], counts: Map<string, number>): HTMLElement {
  const controls = document.createElement("div");
  controls.className = "ofv-cad-layers ofv-layout-layers";
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
    name.textContent = `${layer} (${counts.get(layer) || 0})`;
    label.append(checkbox, name);
    controls.append(label);
  }
  return controls;
}

function createLayoutCellList(cells: string[], references: LayoutReference[]): HTMLElement {
  const details = document.createElement("details");
  details.className = "ofv-details ofv-layout-cells";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = `Cell 结构 ${cells.length}`;
  const list = document.createElement("ul");
  const refCounts = countBy(references.map((reference) => reference.cell));
  for (const cell of cells.slice(0, 120)) {
    const item = document.createElement("li");
    const count = refCounts.get(cell) || 0;
    item.textContent = count > 0 ? `${cell} · 引用 ${count}` : cell;
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function readUInt16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readInt16(bytes: Uint8Array, offset: number): number {
  const value = readUInt16(bytes, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

function readInt32(bytes: Uint8Array, offset: number): number {
  const value = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  return value | 0;
}

function readGdsString(bytes: Uint8Array): string {
  return new TextDecoder("ascii").decode(bytes).replace(/\0+$/g, "").trim();
}

function readGdsPoints(bytes: Uint8Array): LayoutPoint[] {
  const points: LayoutPoint[] = [];
  for (let offset = 0; offset + 7 < bytes.length; offset += 8) {
    points.push([readInt32(bytes, offset), readInt32(bytes, offset + 4)]);
  }
  return points;
}

function formatGdsReal(bytes: Uint8Array, offset: number): string {
  const value = readGdsReal(bytes, offset);
  if (!Number.isFinite(value) || value === 0) {
    return "0";
  }
  if (Math.abs(value) < 0.001 || Math.abs(value) >= 10000) {
    return value.toExponential(4);
  }
  return String(Number(value.toPrecision(6)));
}

function readGdsReal(bytes: Uint8Array, offset: number): number {
  const first = bytes[offset];
  if (!first) {
    return 0;
  }
  const sign = first & 0x80 ? -1 : 1;
  const exponent = (first & 0x7f) - 64;
  let mantissa = 0;
  for (let index = 1; index < 8; index++) {
    mantissa = mantissa * 256 + bytes[offset + index];
  }
  return sign * (mantissa / Math.pow(2, 56)) * Math.pow(16, exponent);
}

function sumCounts(counts: Map<string, number>): number {
  return [...counts.values()].reduce((sum, count) => sum + count, 0);
}

function extractOasisCblocks(bytes: Uint8Array): Array<{ offset: number; bytes: Uint8Array }> {
  const chunks: Array<{ offset: number; bytes: Uint8Array }> = [];
  const seen = new Set<string>();
  const limit = Math.min(bytes.length, 250000);
  for (let offset = 0; offset < limit; offset++) {
    try {
      const inflated = pako.inflateRaw(bytes.slice(offset));
      if (inflated.byteLength < 4) {
        continue;
      }
      const ascii = extractAsciiRuns(inflated);
      const hasLayoutSignal = ascii.some((item) => item.startsWith("S_") || /TOP|CELL|DIE|SIZE/i.test(item));
      const hasRecordSignal = inflated.some((byte) => byte >= 13 && byte <= 34);
      if (!hasLayoutSignal && !hasRecordSignal) {
        continue;
      }
      const signature = `${inflated.byteLength}:${Array.from(inflated.slice(0, 12)).join(",")}`;
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      chunks.push({ offset, bytes: inflated });
      if (chunks.length >= 12) {
        break;
      }
    } catch {
      // Most byte offsets are not deflate streams; keep scanning.
    }
  }
  return chunks;
}

function scanOasisRecordCounts(bytes: Uint8Array): Map<string, number> {
  const counts = new Map<string, number>();
  for (const byte of bytes.slice(0, Math.min(bytes.length, 12000))) {
    const name = oasisRecordNames[byte];
    if (name) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return counts;
}

function readOasisVersion(bytes: Uint8Array): string | undefined {
  const magic = "%SEMI-OASIS\r\n";
  const header = new TextDecoder("ascii").decode(bytes.slice(0, Math.min(bytes.length, 48)));
  if (!header.startsWith(magic)) {
    return undefined;
  }
  const start = magic.length;
  if (bytes[start] !== 1) {
    return "OASIS";
  }
  const length = bytes[start + 1];
  const version = new TextDecoder("ascii").decode(bytes.slice(start + 2, start + 2 + length));
  return version ? `OASIS ${version}` : "OASIS";
}

function createOasisStructureShapes(cellNames: string[], fallbackCount: number): LayoutShape[] {
  const rows = Math.max(1, cellNames.length || fallbackCount);
  const shapes: LayoutShape[] = [];
  for (let index = 0; index < rows; index++) {
    const top = -(index * 18);
    const height = 12;
    const width = 88 + Math.min((cellNames[index]?.length || 5) * 4, 90);
    shapes.push({
      kind: "box",
      layer: "cell",
      points: [
        [0, top],
        [width, top],
        [width, top - height],
        [0, top - height],
        [0, top]
      ]
    });
  }
  return shapes;
}

function renderBinaryCad(panel: HTMLElement, bytes: Uint8Array, extension: string, fileName: string): void {
  const section = createSection(`${extension.toUpperCase()} 文件预览`);
  const note = document.createElement("p");
  note.textContent =
    extension === "dwg"
      ? "已识别 DWG 专有二进制图纸。核心插件默认提供版本、容器、结构线索和接入建议；真实几何渲染可通过 cadPlugin({ binaryRenderer }) 接入可选前端引擎或转换服务。"
      : "已识别 DWF 发布图纸。核心插件默认提供容器线索和接入建议；高保真页面渲染可通过 cadPlugin({ binaryRenderer }) 接入专用解析器或转换服务。";

  const meta = document.createElement("div");
  meta.className = "ofv-cad-summary";
  appendMeta(meta, "文件", fileName);
  appendMeta(meta, "格式", extension.toUpperCase());
  appendMeta(meta, "大小", formatBytes(bytes.byteLength));
  appendMeta(meta, "签名", byteSignature(bytes));
  appendMeta(meta, "版本", detectCadVersion(bytes, extension));
  appendMeta(meta, "容器", detectCadContainer(bytes));

  const actions = document.createElement("div");
  actions.className = "ofv-cad-conversion";
  const actionTitle = document.createElement("h4");
  actionTitle.textContent = extension === "dwg" ? "推荐增强路线" : "推荐处理路线";
  const actionList = document.createElement("ol");
  const suggestions =
    extension === "dwg"
      ? [
          "产品默认链路：服务端将 DWG 转为 PDF/SVG/DXF，再复用现有 PDF、图像或 DXF 预览。",
          "纯前端增强：通过 binaryRenderer 接入 mlightcad / LibreDWG WASM 一类引擎，按需加载 worker 和字体资源。",
          "商用高保真：接入 ODA Drawings SDK / Web SDK，适合复杂图层、字体、外部参照和大图纸。"
        ]
      : [
          "优先在服务端转换为 PDF/SVG，保留图层、页面和标注信息。",
          "若 DWF 为压缩容器，可通过 binaryRenderer 读取 manifest/descriptor 再还原页面资源。",
          "若业务只需下载/归档，保留当前文件元信息和转换提示即可。"
        ];
  for (const suggestion of suggestions) {
    const item = document.createElement("li");
    item.textContent = suggestion;
    actionList.append(item);
  }
  actions.append(actionTitle, actionList);

  const raw = document.createElement("details");
  raw.className = "ofv-details ofv-cad-raw-preview";
  const rawSummary = document.createElement("summary");
  rawSummary.textContent = "原始字节预览";
  const preview = document.createElement("pre");
  preview.className = "ofv-text-block";
  preview.textContent = hexPreview(bytes);
  raw.append(rawSummary, preview);

  section.append(note, meta, actions, createBinaryCadProbe(bytes, extension), raw);
  panel.append(section);
}

function createBinaryCadProbe(bytes: Uint8Array, extension: string): HTMLElement {
  const probe = probeBinaryCad(bytes);
  const details = document.createElement("details");
  details.className = "ofv-details ofv-cad-binary-probe";
  const summary = document.createElement("summary");
  summary.textContent = "二进制结构探测";
  const meta = document.createElement("div");
  meta.className = "ofv-archive-probe-meta";
  appendMeta(meta, "可读片段", probe.tokens.length);
  appendMeta(meta, "实体关键词", formatCadKeywordCounts(probe.entityCounts));
  appendMeta(meta, "图层线索", String(probe.layerHints.length));
  appendMeta(meta, "块/引用线索", String(probe.blockHints.length));
  appendMeta(meta, "外部引用", String(probe.externalRefs.length));
  appendMeta(meta, "解析级别", extension === "dwg" ? "启发式扫描" : "容器/文本扫描");
  details.append(summary, meta);

  const hints = [...probe.layerHints, ...probe.blockHints, ...probe.externalRefs].slice(0, 18);
  if (hints.length > 0) {
    const list = document.createElement("ul");
    list.className = "ofv-cad-probe-list";
    for (const hint of hints) {
      const item = document.createElement("li");
      item.textContent = hint;
      list.append(item);
    }
    details.append(list);
  }

  if (probe.tokens.length > 0) {
    const preview = document.createElement("pre");
    preview.className = "ofv-text-block";
    preview.textContent = probe.tokens.slice(0, 80).join("\n");
    details.append(preview);
  }
  return details;
}

type BinaryCadProbe = {
  tokens: string[];
  entityCounts: Map<string, number>;
  layerHints: string[];
  blockHints: string[];
  externalRefs: string[];
};

function probeBinaryCad(bytes: Uint8Array): BinaryCadProbe {
  const text = extractAsciiRuns(bytes.slice(0, Math.min(bytes.length, 65536)));
  const tokens = text
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
    .slice(0, 240);
  const entityKeywords = ["LINE", "CIRCLE", "ARC", "LWPOLYLINE", "POLYLINE", "TEXT", "MTEXT", "INSERT", "BLOCK", "LAYER", "XREF", "DIMENSION"];
  const entityCounts = new Map<string, number>();
  for (const token of tokens) {
    const normalized = token.toUpperCase();
    for (const keyword of entityKeywords) {
      if (normalized.includes(keyword)) {
        entityCounts.set(keyword, (entityCounts.get(keyword) || 0) + 1);
      }
    }
  }
  return {
    tokens,
    entityCounts,
    layerHints: uniqueHints(tokens.filter((item) => /layer|图层/i.test(item))),
    blockHints: uniqueHints(tokens.filter((item) => /block|insert|块/i.test(item))),
    externalRefs: uniqueHints(tokens.filter((item) => /xref|\.dwg|\.dxf|\.pdf|\.png|\.jpe?g/i.test(item)))
  };
}

function extractAsciiRuns(bytes: Uint8Array): string[] {
  const result: string[] = [];
  let current = "";
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
      continue;
    }
    if (current.length >= 3) {
      result.push(current);
    }
    current = "";
  }
  if (current.length >= 3) {
    result.push(current);
  }
  return result;
}

function uniqueHints(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 12);
}

function formatCadKeywordCounts(counts: Map<string, number>): string {
  const text = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => `${type} ${count}`)
    .join(", ");
  return text || "未发现";
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

function summarizeIfcRecord(record: StepRecord): string {
  const strings = extractStepStrings(record.args);
  const globalId = strings[0];
  const name = strings[2] || strings[1];
  const label = [globalId, name].filter(Boolean).join(" · ");
  if (label) {
    return label;
  }
  return summarizeStepRecord(record);
}

function createIfcHierarchy(records: StepRecord[]): HTMLElement | null {
  const rows = records
    .filter((record) => ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCSPACE"].includes(record.type))
    .slice(0, 80)
    .map((record) => ({
      id: record.id,
      type: ifcTypeName(record.type),
      detail: summarizeIfcRecord(record)
    }));
  if (rows.length === 0) {
    return null;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "ofv-table-scroll ofv-cad-entities";
  const title = document.createElement("strong");
  title.textContent = "BIM 层级";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["ID", "层级", "名称"]) {
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
  wrapper.append(title, table);
  return wrapper;
}

function extractStepStrings(args: string): string[] {
  const values: string[] = [];
  const pattern = /'((?:''|[^'])*)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(args))) {
    values.push((match[1] || "").replace(/''/g, "'"));
  }
  return values;
}

function countIfcElements(counts: Map<string, number>): number {
  const elementTypes = [
    "IFCBEAM",
    "IFCBUILDINGELEMENTPROXY",
    "IFCCOLUMN",
    "IFCCOVERING",
    "IFCCURTAINWALL",
    "IFCDOOR",
    "IFCFLOWSEGMENT",
    "IFCFURNISHINGELEMENT",
    "IFCMEMBER",
    "IFCPLATE",
    "IFCRAILING",
    "IFCRAMP",
    "IFCRAMPFLIGHT",
    "IFCROOF",
    "IFCSLAB",
    "IFCSTAIR",
    "IFCSTAIRFLIGHT",
    "IFCWALL",
    "IFCWALLSTANDARDCASE",
    "IFCWINDOW"
  ];
  return elementTypes.reduce((sum, type) => sum + (counts.get(type) || 0), 0);
}

function ifcTypeName(type: string): string {
  const names: Record<string, string> = {
    IFCPROJECT: "项目",
    IFCSITE: "场地",
    IFCBUILDING: "建筑",
    IFCBUILDINGSTOREY: "楼层",
    IFCSPACE: "空间"
  };
  return names[type] || type;
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
  dxf: string,
  ctx: Pick<PreviewContext, "toolbar">
): {
  canCommand: (command: string) => boolean;
  command: (command: string) => boolean;
  destroy: () => void;
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
  const updateToolbarZoom = () => {
    ctx.toolbar?.setZoom(initialViewBox.width / currentViewBox.width);
  };
  updateToolbarZoom();

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
        updateToolbarZoom();
        return true;
      }
      if (command === "zoom-reset") {
        currentViewBox = { ...initialViewBox };
        applyViewBox();
        updateToolbarZoom();
        return true;
      }
      return false;
    },
    destroy() {
      ctx.toolbar?.setZoom(undefined);
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
