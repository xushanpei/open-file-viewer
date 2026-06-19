import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { renderLibreDwgPreview } from "./cad-dwg";
import { cadPlugin } from "./cad";

vi.mock("./cad-dwg", () => ({
  renderLibreDwgPreview: vi.fn()
}));

describe("cadPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("renders common DXF entities and responds to zoom commands", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([sampleDxf()], { type: "application/dxf" }),
      fileName: "drawing.dxf",
      toolbar: true,
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const svg = container.querySelector<SVGSVGElement>(".ofv-svg-stage");
    const initialViewBox = svg?.getAttribute("viewBox");
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    expect(zoomReset?.textContent).toBe("100%");
    container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click();

    expect(svg?.querySelectorAll("line")).toHaveLength(1);
    expect(svg?.querySelectorAll("circle")).toHaveLength(1);
    expect(svg?.querySelectorAll("path")).toHaveLength(1);
    expect(svg?.querySelectorAll("polyline")).toHaveLength(1);
    expect(svg?.querySelector("text")?.textContent).toBe("HELLO");
    expect(svg?.getAttribute("viewBox")).not.toBe(initialViewBox);
    expect(zoomReset?.textContent).toBe("122%");
    expect(container.textContent).toContain("ARC 1");
    expect(container.textContent).toContain("POLYLINE 1");
  });

  it("uses MIME type to render extensionless DXF blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([sampleDxf()], { type: "image/vnd.dxf" }),
      toolbar: true,
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    expect(container.querySelector("line")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.disabled).toBe(false);
  });

  it("renders DXF layer toggles and hides entities by layer", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([sampleLayeredDxf()], { type: "application/dxf" }),
      fileName: "layers.dxf",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-layers")));

    expect(container.textContent).toContain("图层 2");
    expect(container.textContent).toContain("A-WALL");
    expect(container.textContent).toContain("A-NOTE");

    const wallLine = container.querySelector<SVGElement>('[data-layer="A-WALL"]');
    const noteText = container.querySelector<SVGElement>('[data-layer="A-NOTE"]');
    const wallToggle = [...container.querySelectorAll<HTMLInputElement>(".ofv-cad-layers input")].find(
      (input) => input.nextElementSibling?.textContent === "A-WALL"
    );

    expect(wallToggle).toBeDefined();
    wallToggle!.click();

    expect(wallLine?.style.display).toBe("none");
    expect(noteText?.style.display).toBe("");
  });

  it("renders STEP entity statistics and summaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([sampleStep()], { type: "model/step" }),
      fileName: "part.step",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-entities")));

    expect(container.textContent).toContain("STEP 结构预览");
    expect(container.textContent).toContain("实体3");
    expect(container.textContent).toContain("类型3");
    expect(container.textContent).toContain("CARTESIAN_POINT: 1");
    expect(container.textContent).toContain("#1");
    expect(container.textContent).toContain("坐标 1.,2.,3.");
    expect(container.querySelector(".ofv-svg-stage")).toBeNull();
  });

  it("renders IGES parameter entity statistics and summaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([sampleIges()], { type: "application/iges" }),
      fileName: "part.igs",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-entities")));

    expect(container.textContent).toContain("IGS 结构预览");
    expect(container.textContent).toContain("实体2");
    expect(container.textContent).toContain("点实体1");
    expect(container.textContent).toContain("线实体1");
    expect(container.textContent).toContain("116 Point");
    expect(container.textContent).toContain("110 Line");
  });

  it("tries built-in LibreDWG before DWG metadata fallback by default", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const bytes = new Uint8Array([..."AC1027\0\0DWGDATA"].map((char) => char.charCodeAt(0)));
    vi.mocked(renderLibreDwgPreview).mockResolvedValueOnce(undefined);

    createViewer({
      container,
      file: bytes.buffer,
      fileName: "default.dwg",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-conversion")));

    expect(renderLibreDwgPreview).toHaveBeenCalledTimes(1);
    expect(vi.mocked(renderLibreDwgPreview).mock.calls[0]?.[0]).toMatchObject({
      fileName: "default.dwg",
      extension: "dwg"
    });
    expect(vi.mocked(renderLibreDwgPreview).mock.calls[0]?.[1]).toBeUndefined();
    expect(container.textContent).toContain("DWG 文件预览");
    expect(container.textContent).toContain("binaryRenderer");
  });

  it("renders DWG metadata and conversion guidance when LibreDWG is disabled", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const bytes = new Uint8Array(
      [..."AC1027\0\0DWGDATA\0LINE\0LAYER A-WALL\0BLOCK Door\0XREF site.dwg\0"].map((char) => char.charCodeAt(0))
    );

    createViewer({
      container,
      file: bytes.buffer,
      fileName: "plan.dwg",
      plugins: [cadPlugin({ libreDwg: false })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-conversion")));

    expect(renderLibreDwgPreview).not.toHaveBeenCalled();
    expect(container.textContent).toContain("DWG 文件预览");
    expect(container.textContent).toContain("plan.dwg");
    expect(container.textContent).toContain("AC1027");
    expect(container.textContent).toContain("AutoCAD 2013");
    expect(container.textContent).toContain("二进制结构探测");
    expect(container.textContent).toContain("实体关键词LINE 1");
    expect(container.textContent).toContain("图层线索1");
    expect(container.textContent).toContain("块/引用线索1");
    expect(container.textContent).toContain("外部引用1");
    expect(container.textContent).toContain("LAYER A-WALL");
    expect(container.textContent).toContain("XREF site.dwg");
    expect(container.textContent).toContain("binaryRenderer");
    expect(container.textContent).toContain("ODA Drawings SDK");
    expect(container.textContent).toContain("00000000");
    expect(container.textContent).toContain("AC1027");
    expect(container.querySelector<HTMLDetailsElement>(".ofv-cad-raw-preview")?.open).toBe(false);
  });

  it("uses MIME type to render extensionless DWG blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const bytes = new Uint8Array([..."AC1027\0\0DWGDATA"].map((char) => char.charCodeAt(0)));

    createViewer({
      container,
      file: new Blob([bytes.buffer], { type: "application/acad" }),
      plugins: [cadPlugin({ libreDwg: false })]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-conversion")));

    expect(renderLibreDwgPreview).not.toHaveBeenCalled();
    expect(container.textContent).toContain("DWG 文件预览");
    expect(container.textContent).toContain("AutoCAD 2013");
    expect(container.textContent).toContain("binaryRenderer");
  });

  it("allows an optional binary CAD renderer to take over DWG preview", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const destroy = vi.fn();
    const bytes = new Uint8Array([..."AC1027\0\0DWGDATA"].map((char) => char.charCodeAt(0)));

    const viewer = createViewer({
      container,
      file: bytes.buffer,
      fileName: "enhanced.dwg",
      plugins: [
        cadPlugin({
          binaryRenderer({ panel, fileName, extension, bytes: renderBytes }) {
            const stage = document.createElement("div");
            stage.className = "custom-dwg-stage";
            stage.textContent = `${extension}:${fileName}:${renderBytes.byteLength}`;
            panel.append(stage);
            return { destroy };
          }
        })
      ]
    });

    await waitFor(() => Boolean(container.querySelector(".custom-dwg-stage")));

    expect(renderLibreDwgPreview).not.toHaveBeenCalled();
    expect(container.textContent).toContain("dwg:enhanced.dwg");
    expect(container.textContent).not.toContain("推荐增强路线");

    viewer.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("renders DWF container hints for compressed files", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x44, 0x57, 0x46]);

    createViewer({
      container,
      file: bytes.buffer,
      fileName: "publish.dwf",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-conversion")));

    expect(container.textContent).toContain("DWF 文件预览");
    expect(container.textContent).toContain("publish.dwf");
    expect(container.textContent).toContain("ZIP/PK 压缩容器");
    expect(container.textContent).toContain("manifest");
    expect(container.textContent).toContain("50 4B 03 04");
  });

  it("renders IFC BIM entity statistics and hierarchy summaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([sampleIfc()], { type: "application/x-step" }),
      fileName: "building.ifc",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-entities")));

    expect(container.textContent).toContain("IFC BIM 结构预览");
    expect(container.textContent).toContain("实体7");
    expect(container.textContent).toContain("项目1");
    expect(container.textContent).toContain("建筑1");
    expect(container.textContent).toContain("楼层1");
    expect(container.textContent).toContain("空间1");
    expect(container.textContent).toContain("构件2");
    expect(container.textContent).toContain("BIM 层级");
    expect(container.textContent).toContain("Demo Project");
    expect(container.textContent).toContain("Level 1");
    expect(container.textContent).toContain("IFCWALL: 1");
    expect(container.textContent).toContain("IFCDOOR: 1");
    expect(container.querySelector(".ofv-svg-stage")).toBeNull();
  });

  it("renders GDSII layout geometry with layer controls and zoom commands", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: sampleGds(),
      fileName: "chip.gds",
      toolbar: true,
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-layout-stage")));

    const svg = container.querySelector<SVGSVGElement>(".ofv-layout-stage");
    const initialViewBox = svg?.getAttribute("viewBox");
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    expect(container.textContent).toContain("GDSII 版图预览");
    expect(container.textContent).toContain("LIB");
    expect(container.textContent).toContain("TOP");
    expect(container.textContent).toContain("几何1");
    expect(container.textContent).toContain("图层 1");
    expect(svg?.querySelectorAll("polygon")).toHaveLength(1);

    container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')?.click();
    expect(svg?.getAttribute("viewBox")).not.toBe(initialViewBox);
    expect(zoomReset?.textContent).toBe("122%");
  });

  it("renders OASIS structure preview and decompresses CBLOCK strings", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: sampleOasis(),
      fileName: "chip.oas",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-layout-stage")));

    expect(container.textContent).toContain("OASIS 版图预览");
    expect(container.textContent).toContain("OASIS 1.0");
    expect(container.textContent).toContain("TOP");
    expect(container.textContent).toContain("DIE_SIZE");
    expect(container.textContent).toContain("CBLOCK");
    expect(container.querySelector(".ofv-layout-stage polygon")).not.toBeNull();
  });

  it("routes unsupported mechanical CAD files to a dedicated CAD guidance panel", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["solid"], { type: "application/sldworks" }),
      fileName: "part.sldprt",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad")));

    expect(container.textContent).toContain("CAD 基础预览");
    expect(container.textContent).toContain(".sldprt");
    expect(container.textContent).toContain("已识别为图纸/工程格式");
  });
});

function sampleDxf(): string {
  return [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "LINE",
    "10",
    "0",
    "20",
    "0",
    "11",
    "100",
    "21",
    "0",
    "0",
    "CIRCLE",
    "10",
    "50",
    "20",
    "50",
    "40",
    "20",
    "0",
    "ARC",
    "10",
    "50",
    "20",
    "50",
    "40",
    "30",
    "50",
    "0",
    "51",
    "90",
    "0",
    "LWPOLYLINE",
    "10",
    "0",
    "20",
    "0",
    "10",
    "20",
    "20",
    "20",
    "10",
    "40",
    "20",
    "0",
    "0",
    "TEXT",
    "10",
    "10",
    "20",
    "10",
    "40",
    "12",
    "1",
    "HELLO",
    "0",
    "ENDSEC",
    "0",
    "EOF"
  ].join("\n");
}

function sampleLayeredDxf(): string {
  return [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "LINE",
    "8",
    "A-WALL",
    "10",
    "0",
    "20",
    "0",
    "11",
    "100",
    "21",
    "0",
    "0",
    "TEXT",
    "8",
    "A-NOTE",
    "10",
    "10",
    "20",
    "10",
    "40",
    "12",
    "1",
    "Layer note",
    "0",
    "ENDSEC",
    "0",
    "EOF"
  ].join("\n");
}

function sampleStep(): string {
  return [
    "ISO-10303-21;",
    "DATA;",
    "#1 = CARTESIAN_POINT('P1',(1.,2.,3.));",
    "#2 = DIRECTION('D1',(0.,0.,1.));",
    "#3 = LINE('L1',#1,#2);",
    "ENDSEC;",
    "END-ISO-10303-21;"
  ].join("\n");
}

function sampleIges(): string {
  return [
    "                                                                        S      1",
    "116,1.0,2.0,3.0;                                                        P      1",
    "110,0.0,0.0,0.0,10.0,0.0,0.0;                                           P      2"
  ].join("\n");
}

function sampleIfc(): string {
  return [
    "ISO-10303-21;",
    "DATA;",
    "#1 = IFCPROJECT('0PROJECT',$,'Demo Project',$,$,$,$,$);",
    "#2 = IFCSITE('0SITE',$,'Main Site',$,$,$,$,$,$,$,$,$,$,$);",
    "#3 = IFCBUILDING('0BLDG',$,'HQ Building',$,$,$,$,$,$,$,$,$);",
    "#4 = IFCBUILDINGSTOREY('0STOREY',$,'Level 1',$,$,$,$,$,$);",
    "#5 = IFCSPACE('0SPACE',$,'Lobby',$,$,$,$,$,$,$);",
    "#6 = IFCWALL('0WALL',$,'Lobby Wall',$,$,$,$,$);",
    "#7 = IFCDOOR('0DOOR',$,'Entry Door',$,$,$,$,$);",
    "ENDSEC;",
    "END-ISO-10303-21;"
  ].join("\n");
}

function sampleGds(): ArrayBuffer {
  const bytes: number[] = [];
  const record = (type: number, dataType: number, data: number[] = []) => {
    const length = data.length + 4;
    bytes.push((length >> 8) & 0xff, length & 0xff, type, dataType, ...data);
  };
  const int2 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
  const int4 = (value: number) => [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
  const ascii = (value: string) => {
    const data = [...value].map((char) => char.charCodeAt(0));
    if (data.length % 2) {
      data.push(0);
    }
    return data;
  };
  const date = [0x07, 0xe9, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  record(0x00, 0x02, int2(600));
  record(0x01, 0x02, date.concat(date));
  record(0x02, 0x06, ascii("LIB"));
  record(0x03, 0x05, [0x3e, 0x41, 0x89, 0x37, 0x4b, 0xc6, 0xa7, 0xf0, 0x39, 0x44, 0xb8, 0x2f, 0xa0, 0x9b, 0x5a, 0x54]);
  record(0x05, 0x02, date.concat(date));
  record(0x06, 0x06, ascii("TOP"));
  record(0x08, 0x00);
  record(0x0d, 0x02, int2(1));
  record(0x0e, 0x02, int2(0));
  record(
    0x10,
    0x03,
    [
      ...int4(0),
      ...int4(0),
      ...int4(100),
      ...int4(0),
      ...int4(100),
      ...int4(80),
      ...int4(0),
      ...int4(80),
      ...int4(0),
      ...int4(0)
    ]
  );
  record(0x11, 0x00);
  record(0x07, 0x00);
  record(0x04, 0x00);
  return new Uint8Array(bytes).buffer;
}

function sampleOasis(): ArrayBuffer {
  const compressed = new Uint8Array([0x63, 0x66, 0x0e, 0xf1, 0x0f, 0x60, 0xe6, 0x70, 0xf1, 0x74, 0x8d, 0x0f, 0xf6, 0x8c, 0x72, 0x05, 0x00]);
  const prefix = [..."%SEMI-OASIS\r\n"].map((char) => char.charCodeAt(0));
  return new Uint8Array([...prefix, 0x01, 0x03, 0x31, 0x2e, 0x30, 0x00, 0x21, ...compressed, 0x02]).buffer;
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
