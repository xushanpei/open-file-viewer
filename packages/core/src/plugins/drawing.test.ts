import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { drawingPlugin } from "./drawing";

describe("drawingPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders basic Excalidraw shapes as SVG", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      elements: [
        { type: "rectangle", x: 10, y: 20, width: 120, height: 60, strokeColor: "#111111" },
        { type: "ellipse", x: 40, y: 70, width: 80, height: 40, backgroundColor: "#eeeeee" },
        { type: "text", x: 20, y: 130, text: "Hello" }
      ]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/json" }),
      fileName: "board.excalidraw",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const summary = container.querySelector(".ofv-drawing-summary");
    expect((summary as HTMLElement | null)?.hidden).toBe(true);
    expect(summary?.textContent).toContain("对象3");
    expect(summary?.textContent).toContain("rectangle 1");
    expect(summary?.textContent).toContain("ellipse 1");
    expect(summary?.textContent).toContain("文本1");
    expect(summary?.textContent).toContain("范围10, 20, 130, 130");
    const svg = container.querySelector(".ofv-svg-stage");
    expect(svg?.querySelectorAll("rect")).toHaveLength(1);
    expect(svg?.querySelectorAll("ellipse")).toHaveLength(1);
    expect(svg?.querySelector("text")?.textContent).toBe("Hello");
  });

  it("responds to shared toolbar zoom and rotate commands", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      elements: [{ type: "rectangle", x: 10, y: 20, width: 120, height: 60, strokeColor: "#111111" }]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/json" }),
      fileName: "toolbar.excalidraw",
      toolbar: true,
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const svg = container.querySelector<SVGSVGElement>(".ofv-svg-stage");
    const initialViewBox = svg?.getAttribute("viewBox");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');
    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);

    zoomIn?.click();
    expect(svg?.getAttribute("viewBox")).not.toBe(initialViewBox);
    expect(zoomReset?.textContent).toBe("122%");

    rotate?.click();
    rotate?.click();
    rotate?.click();
    rotate?.click();
    rotate?.click();
    expect(svg?.style.transform).toBe("rotate(450deg)");

    zoomReset?.click();
    expect(svg?.getAttribute("viewBox")).toBe(initialViewBox);
    expect(svg?.style.transform).toBe("");
    expect(zoomReset?.textContent).toBe("100%");
  });

  it("uses alternate Excalidraw MIME type to render extensionless blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      elements: [{ type: "rectangle", x: 10, y: 20, width: 120, height: 60, strokeColor: "#111111" }]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/x-excalidraw+json" }),
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    expect(container.querySelector(".ofv-svg-stage rect")).not.toBeNull();
  });

  it("preserves common Excalidraw styles and freehand paths", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      elements: [
        {
          type: "rectangle",
          x: 10,
          y: 20,
          width: 120,
          height: 60,
          strokeColor: "#334155",
          backgroundColor: "#dbeafe",
          strokeWidth: 4,
          strokeStyle: "dashed",
          opacity: 72,
          angle: Math.PI / 8,
          roundness: { type: 3, value: 10 }
        },
        {
          type: "diamond",
          x: 180,
          y: 20,
          width: 90,
          height: 70,
          strokeColor: "#0f766e",
          backgroundColor: "#ccfbf1"
        },
        {
          type: "arrow",
          x: 40,
          y: 130,
          points: [
            [0, 0],
            [80, 20],
            [130, 10]
          ],
          strokeWidth: 3,
          strokeColor: "#dc2626"
        },
        {
          type: "freedraw",
          x: 20,
          y: 190,
          points: [
            [0, 0],
            [20, 12],
            [46, 4]
          ],
          strokeColor: "#7c3aed"
        },
        {
          type: "text",
          x: 220,
          y: 150,
          text: "Line 1\nLine 2",
          fontSize: 24,
          opacity: 80
        }
      ]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/json" }),
      fileName: "styled.excalidraw",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const svg = container.querySelector(".ofv-svg-stage");
    const rect = svg?.querySelector("rect");
    expect(svg?.getAttribute("viewBox")).not.toBe("0 0 1200 800");
    expect(rect?.getAttribute("rx")).toBe("10");
    expect(rect?.getAttribute("stroke-width")).toBe("4");
    expect(rect?.getAttribute("stroke-dasharray")).toBe("24 16");
    expect(rect?.getAttribute("opacity")).toBe("0.72");
    expect(rect?.getAttribute("transform")).toContain("rotate(");
    expect(svg?.querySelector("polygon")?.getAttribute("points")).toContain("225");
    expect(svg?.querySelector("polyline")?.getAttribute("points")).toBe("40,130 120,150 170,140");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBe("M 20 190 L 40 202 L 66 194");
    expect(svg?.querySelectorAll("text tspan")).toHaveLength(2);
    expect(svg?.textContent).toContain("Line 2");
  });

  it("restores Excalidraw fill patterns, arrowheads, and text alignment", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      elements: [
        {
          type: "rectangle",
          x: 10,
          y: 20,
          width: 120,
          height: 70,
          strokeColor: "#1d4ed8",
          backgroundColor: "#bfdbfe",
          fillStyle: "cross-hatch"
        },
        {
          type: "ellipse",
          x: 170,
          y: 20,
          width: 90,
          height: 70,
          strokeColor: "#be123c",
          backgroundColor: "#fecdd3",
          fillStyle: "dots"
        },
        {
          type: "arrow",
          x: 30,
          y: 140,
          points: [
            [0, 0],
            [80, 0],
            [130, 40]
          ],
          strokeColor: "#0f766e",
          startArrowhead: "dot",
          endArrowhead: "bar"
        },
        {
          type: "text",
          x: 300,
          y: 40,
          width: 180,
          height: 80,
          text: "Centered\nLabel",
          textAlign: "center",
          verticalAlign: "middle",
          fontSize: 20
        }
      ]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/json" }),
      fileName: "rich.excalidraw",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const svg = container.querySelector(".ofv-svg-stage");
    expect(svg?.querySelectorAll("defs pattern")).toHaveLength(2);
    expect(svg?.querySelector(":scope > rect")?.getAttribute("fill")).toContain("url(#ofv-excalidraw-cross-hatch");
    expect(svg?.querySelector(":scope > ellipse")?.getAttribute("fill")).toContain("url(#ofv-excalidraw-dots");
    expect(svg?.querySelector(":scope > circle")?.getAttribute("fill")).toBe("#0f766e");
    expect(svg?.querySelectorAll(":scope > line")).toHaveLength(1);
    const textNode = svg?.querySelector(":scope > text");
    expect(textNode?.getAttribute("text-anchor")).toBe("middle");
    expect(textNode?.getAttribute("dominant-baseline")).toBe("middle");
    expect(textNode?.querySelector("tspan")?.getAttribute("x")).toBe("390");
    expect(svg?.textContent).toContain("Centered");
    expect(svg?.textContent).toContain("Label");
  });

  it("renders Excalidraw frames, images, embeddables, and skips deleted elements", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      elements: [
        {
          type: "frame",
          x: 0,
          y: 0,
          width: 260,
          height: 180,
          name: "Sprint board"
        },
        {
          type: "image",
          x: 20,
          y: 40,
          width: 80,
          height: 60,
          fileId: "logo"
        },
        {
          type: "image",
          x: 120,
          y: 40,
          width: 80,
          height: 60,
          fileId: "unsafe"
        },
        {
          type: "embeddable",
          x: 20,
          y: 120,
          width: 180,
          height: 60,
          link: "https://example.com/roadmap?query=<script>"
        },
        {
          type: "rectangle",
          x: 300,
          y: 20,
          width: 90,
          height: 40,
          isDeleted: true
        }
      ],
      files: {
        logo: { dataURL: "data:image/png;base64,AAAA" },
        unsafe: { dataURL: "javascript:alert(1)" }
      }
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/json" }),
      fileName: "media.excalidraw",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const svg = container.querySelector(".ofv-svg-stage");
    expect(visibleText(container)).not.toContain("Excalidraw 4 elements");
    expect(svg?.querySelector("image")?.getAttribute("href")).toBe("data:image/png;base64,AAAA");
    expect(svg?.querySelectorAll("rect")).toHaveLength(3);
    expect(svg?.querySelector("rect")?.getAttribute("stroke-dasharray")).toBe("8 6");
    expect(svg?.textContent).toContain("Sprint board");
    expect(svg?.textContent).toContain("Image");
    expect(svg?.textContent).toContain("unsafe");
    expect(svg?.textContent).toContain("Embed");
    expect(svg?.textContent).toContain("https://example.com/roadmap");
    expect(container.querySelector("script")).toBeNull();
  });

  it("uses MIME type to render extensionless Excalidraw blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      elements: [{ type: "rectangle", x: 0, y: 0, width: 40, height: 20 }]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/vnd.excalidraw+json" }),
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    expect(container.querySelector("rect")).not.toBeNull();
  });

  it("uses MIME type to render extensionless Draw.io blobs", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["<mxfile><diagram>plain</diagram></mxfile>"], { type: "application/vnd.jgraph.mxfile" }),
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-drawing")));

    expect(container.textContent).toContain("Draw.io 图形预览");
    expect(container.textContent).toContain("plain");
  });

  it("renders common Draw.io mxGraphModel cells as SVG shapes", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([createDrawioGraphModel()], { type: "application/vnd.jgraph.mxfile" }),
      fileName: "flow.drawio",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const summary = container.querySelector(".ofv-drawing-summary");
    expect((summary as HTMLElement | null)?.hidden).toBe(true);
    expect(summary?.textContent).toContain("对象4");
    expect(summary?.textContent).toContain("rectangle 1");
    expect(summary?.textContent).toContain("ellipse 1");
    expect(summary?.textContent).toContain("rhombus 1");
    expect(summary?.textContent).toContain("edge 1");
    expect(summary?.textContent).toContain("文本3");
    const svg = container.querySelector(".ofv-svg-stage");
    expect(visibleText(container)).not.toContain("Draw.io 图形预览 1");
    const rawDetails = container.querySelector<HTMLElement>(".ofv-details");
    expect(rawDetails?.hidden).toBe(true);
    expect(visibleText(container)).not.toContain("原始 XML 摘要");
    expect(svg?.querySelectorAll("rect")).toHaveLength(1);
    expect(svg?.querySelector("rect")?.getAttribute("rx")).toBe("12");
    expect(svg?.querySelectorAll("ellipse")).toHaveLength(1);
    expect(svg?.querySelectorAll("polygon")).toHaveLength(2);
    expect(svg?.querySelector("line")?.getAttribute("x1")).toBe("80");
    expect(svg?.textContent).toContain("Start");
    expect(svg?.textContent).toContain("Check");
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders additional Draw.io shapes, HTML labels, and routed edges", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([createAdvancedDrawioGraphModel()], { type: "application/vnd.jgraph.mxfile" }),
      fileName: "advanced.drawio",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const svg = container.querySelector(".ofv-svg-stage");
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThanOrEqual(4);
    expect(svg?.querySelectorAll("ellipse").length).toBeGreaterThanOrEqual(2);
    expect(svg?.querySelectorAll("path")).toHaveLength(1);
    expect(svg?.querySelectorAll("polygon").length).toBeGreaterThanOrEqual(2);
    expect(svg?.querySelector("polyline")?.getAttribute("points")).toBe("80,250 220,250 220,320");
    expect(svg?.textContent).toContain("Lane");
    expect(svg?.textContent).toContain("Title");
    expect(svg?.textContent).toContain("DB");
    expect(svg?.textContent).toContain("Hex");
    expect(svg?.textContent).toContain("Cloud");
    expect(svg?.textContent).toContain("Plain text");
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders Draw.io media, document, actor, triangle and text style details", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([createRichDrawioGraphModel()], { type: "application/vnd.jgraph.mxfile" }),
      fileName: "rich.drawio",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const svg = container.querySelector(".ofv-svg-stage");
    expect(svg?.querySelector("image")?.getAttribute("href")).toBe("data:image/png;base64,AAAA==");
    expect(svg?.querySelector("path")?.getAttribute("d")).toContain("C ");
    expect(svg?.querySelectorAll("circle")).toHaveLength(1);
    expect(svg?.querySelectorAll("polygon").length).toBeGreaterThanOrEqual(2);
    expect(svg?.querySelector("rect")?.getAttribute("transform")).toContain("rotate(15");
    expect(svg?.querySelector("rect")?.getAttribute("stroke-dasharray")).toBe("2 6");
    const text = Array.from(svg?.querySelectorAll("text") || []).find((node) => node.textContent?.includes("Styled"));
    expect(text?.getAttribute("font-weight")).toBe("700");
    expect(text?.getAttribute("font-style")).toBe("italic");
    expect(text?.getAttribute("text-decoration")).toBe("underline");
    expect(text?.getAttribute("text-anchor")).toBe("start");
    expect(svg?.textContent).toContain("Doc");
    expect(svg?.textContent).toContain("Actor");
    expect(svg?.textContent).toContain("Process");
    expect(container.querySelector("script")).toBeNull();
  });

  it("renders basic tldraw records as SVG shapes", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      records: [
        {
          typeName: "shape",
          id: "shape:box",
          type: "geo",
          x: 20,
          y: 30,
          props: { geo: "rectangle", w: 160, h: 80, color: "blue", fill: "solid", text: "Roadmap" }
        },
        {
          typeName: "shape",
          id: "shape:arrow",
          type: "arrow",
          x: 220,
          y: 70,
          props: { start: { x: 0, y: 0 }, end: { x: 140, y: 60 }, color: "red" }
        },
        {
          typeName: "shape",
          id: "shape:note",
          type: "note",
          x: 400,
          y: 20,
          props: { w: 120, h: 90, color: "yellow", text: "Ship it" }
        }
      ]
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/json" }),
      fileName: "board.tldraw",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    const summary = container.querySelector(".ofv-drawing-summary");
    expect((summary as HTMLElement | null)?.hidden).toBe(true);
    expect(summary?.textContent).toContain("对象3");
    expect(summary?.textContent).toContain("geo 1");
    expect(summary?.textContent).toContain("arrow 1");
    expect(summary?.textContent).toContain("note 1");
    expect(summary?.textContent).toContain("连线1");
    const svg = container.querySelector(".ofv-svg-stage");
    expect(visibleText(container)).not.toContain("tldraw 基础预览 3 shapes");
    expect(svg?.querySelectorAll("rect")).toHaveLength(2);
    expect(svg?.querySelectorAll("line")).toHaveLength(1);
    expect(svg?.querySelectorAll("polygon")).toHaveLength(1);
    expect(svg?.textContent).toContain("Roadmap");
    expect(svg?.textContent).toContain("Ship it");
  });

  it("renders tldraw store exports and does not inject shape text as HTML", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const data = {
      store: {
        "shape:text": {
          id: "shape:text",
          type: "text",
          x: 10,
          y: 10,
          props: { text: "<script>alert(1)</script>" }
        }
      }
    };

    createViewer({
      container,
      file: new Blob([JSON.stringify(data)], { type: "application/json" }),
      fileName: "store.tldraw",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-svg-stage")));

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("renders raw Draw.io text without injecting HTML", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["<mxfile><script>alert(1)</script></mxfile>"], { type: "text/xml" }),
      fileName: "diagram.drawio",
      plugins: [drawingPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-drawing")));

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("renders a local parse fallback for invalid Excalidraw JSON", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onError = vi.fn();

    createViewer({
      container,
      file: new Blob(["not json"], { type: "application/json" }),
      fileName: "broken.excalidraw",
      plugins: [drawingPlugin()],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-drawing")));

    expect(onError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("excalidraw 解析失败");
    expect(container.textContent).toContain("not json");
    expect(container.querySelector<HTMLElement>(".ofv-status")?.hidden).toBe(true);
  });
});

function createDrawioGraphModel(): string {
  return `<mxfile>
    <diagram name="Page-1">
      <mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="start" value="Start" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
            <mxGeometry x="20" y="30" width="120" height="60" as="geometry"/>
          </mxCell>
          <mxCell id="check" value="Check" style="ellipse;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
            <mxGeometry x="210" y="30" width="100" height="70" as="geometry"/>
          </mxCell>
          <mxCell id="decision" value="Go?" style="shape=rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
            <mxGeometry x="390" y="20" width="100" height="90" as="geometry"/>
          </mxCell>
          <mxCell id="edge" value="" style="endArrow=block;strokeWidth=2;strokeColor=#9673a6;" edge="1" parent="1" source="start" target="check">
            <mxGeometry relative="1" as="geometry">
              <mxPoint x="80" y="60" as="sourcePoint"/>
              <mxPoint x="260" y="65" as="targetPoint"/>
            </mxGeometry>
          </mxCell>
        </root>
      </mxGraphModel>
    </diagram>
  </mxfile>`;
}

function createAdvancedDrawioGraphModel(): string {
  return `<mxfile>
    <diagram name="Advanced">
      <mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="lane" value="&lt;div&gt;Lane&lt;br&gt;Title&lt;/div&gt;" style="swimlane;rounded=1;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;startSize=34;" vertex="1" parent="1">
            <mxGeometry x="20" y="20" width="180" height="120" as="geometry"/>
          </mxCell>
          <mxCell id="db" value="DB" style="shape=cylinder;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
            <mxGeometry x="250" y="30" width="90" height="100" as="geometry"/>
          </mxCell>
          <mxCell id="hex" value="Hex" style="shape=hexagon;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
            <mxGeometry x="390" y="40" width="120" height="80" as="geometry"/>
          </mxCell>
          <mxCell id="cloud" value="Cloud" style="shape=cloud;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
            <mxGeometry x="560" y="35" width="130" height="90" as="geometry"/>
          </mxCell>
          <mxCell id="text" value="&lt;b&gt;Plain&lt;/b&gt;&amp;nbsp;text" style="text;html=1;strokeColor=none;fillColor=none;fontColor=#0f172a;" vertex="1" parent="1">
            <mxGeometry x="20" y="170" width="160" height="40" as="geometry"/>
          </mxCell>
          <mxCell id="route" value="" style="edgeStyle=orthogonalEdgeStyle;rounded=0;endArrow=block;strokeWidth=2;strokeColor=#0f766e;" edge="1" parent="1">
            <mxGeometry relative="1" as="geometry">
              <mxPoint x="80" y="250" as="sourcePoint"/>
              <mxPoint x="220" y="250" as="wayPoint"/>
              <mxPoint x="220" y="320" as="targetPoint"/>
            </mxGeometry>
          </mxCell>
        </root>
      </mxGraphModel>
    </diagram>
  </mxfile>`;
}

function createRichDrawioGraphModel(): string {
  return `<mxfile>
    <diagram name="Rich">
      <mxGraphModel>
        <root>
          <mxCell id="0"/>
          <mxCell id="1" parent="0"/>
          <mxCell id="image" value="" style="shape=image;image=data:image/png;base64,AAAA==;strokeColor=none;fillColor=none;" vertex="1" parent="1">
            <mxGeometry x="20" y="20" width="90" height="70" as="geometry"/>
          </mxCell>
          <mxCell id="document" value="Doc" style="shape=document;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
            <mxGeometry x="150" y="20" width="110" height="80" as="geometry"/>
          </mxCell>
          <mxCell id="actor" value="Actor" style="shape=umlActor;whiteSpace=wrap;html=1;strokeColor=#0f766e;fontColor=#0f766e;" vertex="1" parent="1">
            <mxGeometry x="300" y="20" width="80" height="120" as="geometry"/>
          </mxCell>
          <mxCell id="triangle" value="Tri" style="shape=triangle;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
            <mxGeometry x="430" y="30" width="100" height="90" as="geometry"/>
          </mxCell>
          <mxCell id="process" value="Process" style="shape=process;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
            <mxGeometry x="570" y="35" width="130" height="80" as="geometry"/>
          </mxCell>
          <mxCell id="styled" value="Styled" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;dashed=1;dashPattern=2 6;rotation=15;fontStyle=7;fontSize=18;align=left;fontColor=#7f1d1d;" vertex="1" parent="1">
            <mxGeometry x="20" y="170" width="150" height="70" as="geometry"/>
          </mxCell>
        </root>
      </mxGraphModel>
    </diagram>
  </mxfile>`;
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

function visibleText(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node, hidden: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!hidden) {
        parts.push(node.textContent || "");
      }
      return;
    }
    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach((child) => walk(child, hidden));
      return;
    }
    const isHidden =
      hidden ||
      node.hidden ||
      node.getAttribute("aria-hidden") === "true" ||
      node.style.display === "none" ||
      node.style.visibility === "hidden";
    node.childNodes.forEach((child) => walk(child, isHidden));
  };
  walk(root, false);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
