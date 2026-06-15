import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { cadPlugin } from "./cad";

describe("cadPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
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

  it("renders DWG metadata and conversion guidance", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const bytes = new Uint8Array(
      [..."AC1027\0\0DWGDATA\0LINE\0LAYER A-WALL\0BLOCK Door\0XREF site.dwg\0"].map((char) => char.charCodeAt(0))
    );

    createViewer({
      container,
      file: bytes.buffer,
      fileName: "plan.dwg",
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-conversion")));

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
    expect(container.textContent).toContain("ODA File Converter");
    expect(container.textContent).toContain("00000000");
    expect(container.textContent).toContain("AC1027");
  });

  it("uses MIME type to render extensionless DWG blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const bytes = new Uint8Array([..."AC1027\0\0DWGDATA"].map((char) => char.charCodeAt(0)));

    createViewer({
      container,
      file: new Blob([bytes.buffer], { type: "application/acad" }),
      plugins: [cadPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-cad-conversion")));

    expect(container.textContent).toContain("DWG 文件预览");
    expect(container.textContent).toContain("AutoCAD 2013");
    expect(container.textContent).toContain("ODA File Converter");
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

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
