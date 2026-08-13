import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { ofdPlugin } from "./ofd";

describe("ofdPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("extracts XML text and file structure from OFD packages", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="20 30 120 16" Size="12">
              <ofd:TextCode X="0" Y="0">发票标题</ofd:TextCode>
            </ofd:TextObject>
            <ofd:TextObject Boundary="20 56 120 16" Size="10">
              <ofd:TextCode X="0" Y="0">金额 100</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    zip.file("Doc_0/Res/image.dat", "data");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "invoice.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => container.textContent?.includes("发票标题") === true);

    expect(container.textContent).toContain("发票标题");
    expect(container.textContent).toContain("金额 100");
    expect(container.textContent).not.toContain("OFD 预览");
    expect(container.textContent).not.toContain("Content.xml");
    expect(container.querySelector(".ofv-ofd-summary")).toBeNull();
    expect(container.querySelector(".ofv-ofd-details")).toBeNull();
    expect(container.querySelector(".ofv-ofd-pages svg")).not.toBeNull();
    expect(container.querySelector(".ofv-ofd-page text")?.getAttribute("x")).toBe("20");
    expect(container.querySelector(".ofv-ofd-page text")?.getAttribute("y")).toBe("30");
    expect(container.querySelector(".ofv-ofd-page figcaption")).toBeNull();
  });

  it("uses Document.xml page order and preserves blank pages", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_2/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer>
        <ofd:TextObject Boundary="20 30 120 16" Size="12"><ofd:TextCode X="0" Y="12">第三页</ofd:TextCode></ofd:TextObject>
      </ofd:Layer></ofd:Content></ofd:Page>`
    );
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer>
        <ofd:TextObject Boundary="20 30 120 16" Size="12"><ofd:TextCode X="0" Y="12">第一页</ofd:TextCode></ofd:TextObject>
      </ofd:Layer></ofd:Content></ofd:Page>`
    );
    zip.file(
      "Doc_0/Pages/Page_1/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer/></ofd:Content></ofd:Page>`
    );
    zip.file(
      "Doc_0/Document.xml",
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData><ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea></ofd:CommonData>
        <ofd:Pages>
          <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
          <ofd:Page ID="2" BaseLoc="Pages/Page_1/Content.xml"/>
          <ofd:Page ID="3" BaseLoc="Pages/Page_2/Content.xml"/>
        </ofd:Pages>
      </ofd:Document>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({ container, file: buffer, fileName: "ordered.ofd", plugins: [ofdPlugin()] });

    await waitFor(() => container.querySelectorAll(".ofv-ofd-page").length === 3);
    const pages = container.querySelectorAll(".ofv-ofd-page");
    expect(pages[0]?.textContent).toContain("第一页");
    expect(pages[1]?.querySelector("text")).toBeNull();
    expect(pages[2]?.textContent).toContain("第三页");
    expect(viewer.goToPage(3)).toBe(true);
  });

  it("renders lightweight OFD vector layout with paths, lines, images and text styles", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 120 160</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="10 10 60 30" LineWidth="2" Fill="true">
              <ofd:FillColor Value="240 249 255"/>
              <ofd:StrokeColor Value="37 99 235"/>
              <ofd:AbbreviatedData>M 0 0 L 60 0 L 60 30 L 0 30 Z</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="58 153.500 4 4" LineWidth="0.5" CTM="0.350 0 0 0.350 0 0">
              <ofd:AbbreviatedData>M 10.070 5.540 B 10.070 3.040 8.040 1 5.530 1</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:LineObject Boundary="10 50 80 0" StartPoint="0 0" EndPoint="80 0" LineWidth="1.5">
              <ofd:StrokeColor Value="220 38 38"/>
            </ofd:LineObject>
            <ofd:ImageObject Boundary="10 64 32 24" ResourceID="img1"/>
            <ofd:TextObject Boundary="10 100 90 16" Size="12" Weight="700" DeltaX="1">
              <ofd:FillColor Value="22 163 74"/>
              <ofd:TextCode X="0" Y="0">彩色文本</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    zip.file("Doc_0/Res/img1.png", "pngdata");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "layout.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const svg = container.querySelector(".ofv-ofd-pages svg");
    expect(container.querySelector<HTMLElement>(".ofv-ofd-page")?.style.getPropertyValue("--ofv-ofd-page-width")).toBe(
      "120mm"
    );
    expect(svg?.getAttribute("viewBox")).toBe("0 0 120 160");
    expect(svg?.querySelector("path")?.getAttribute("d")).toBe("M 0 0 L 60 0 L 60 30 L 0 30 Z");
    expect(svg?.querySelector("path")?.getAttribute("transform")).toBe("translate(10 10)");
    expect(svg?.querySelectorAll("path")[1]?.getAttribute("transform")).toBe("translate(58 153.5) matrix(0.35 0 0 0.35 0 0)");
    expect(svg?.querySelector("path")?.getAttribute("fill")).toBe("rgb(240 249 255)");
    expect(svg?.querySelector("line")?.getAttribute("stroke")).toBe("rgb(220 38 38)");
    expect(svg?.querySelector("image")?.getAttribute("href")).toContain("data:image/png;base64,");
    expect(svg?.querySelector("text")?.getAttribute("fill")).toBe("rgb(22 163 74)");
    expect(svg?.querySelector("text")?.getAttribute("font-weight")).toBe("700");
    expect(svg?.querySelector("text")?.getAttribute("font-family")).toContain("Songti SC");
    expect(svg?.querySelector("text")?.getAttribute("letter-spacing")).toBe("0.5");
    expect(container.querySelector(".ofv-ofd-page figcaption")).toBeNull();
  });

  it("responds to shared toolbar zoom and rotate commands", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="20 30 120 16" Size="12">
              <ofd:TextCode X="0" Y="12">发票标题</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: buffer,
      fileName: "zoom.ofd",
      toolbar: true,
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const panel = container.querySelector<HTMLElement>(".ofv-ofd");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomOut = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');

    expect(zoomIn?.disabled).toBe(false);
    expect(zoomOut?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);
    expect(zoomReset?.textContent).toBe("100%");
    expect(panel?.style.getPropertyValue("--ofv-ofd-zoom")).toBe("1");
    expect(panel?.style.getPropertyValue("--ofv-ofd-rotation")).toBe("0deg");

    zoomIn?.click();
    await waitFor(() => zoomReset?.textContent === "115%");
    expect(panel?.style.getPropertyValue("--ofv-ofd-zoom")).toBe("1.15");

    rotate?.click();
    expect(panel?.style.getPropertyValue("--ofv-ofd-rotation")).toBe("90deg");
    expect(panel?.classList.contains("is-ofd-rotated-sideways")).toBe(true);

    rotate?.click();
    expect(panel?.style.getPropertyValue("--ofv-ofd-rotation")).toBe("180deg");
    expect(panel?.classList.contains("is-ofd-rotated-sideways")).toBe(false);

    zoomReset?.click();
    await waitFor(() => zoomReset?.textContent === "100%");
    expect(panel?.style.getPropertyValue("--ofv-ofd-zoom")).toBe("1");
    expect(panel?.style.getPropertyValue("--ofv-ofd-rotation")).toBe("0deg");
    expect(panel?.classList.contains("is-ofd-rotated-sideways")).toBe(false);

    viewer.destroy();
  });

  it("merges OFD background templates and resolves document resource image IDs", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Document.xml",
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>
          <ofd:TemplatePage ID="10" BaseLoc="Tpls/Tpl_0/Content.xml"/>
        </ofd:CommonData>
      </ofd:Document>`
    );
    zip.file(
      "Doc_0/DocumentRes.xml",
      `<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
        <ofd:MultiMedias>
          <ofd:MultiMedia Format="PNG" Type="Image" ID="11">
            <ofd:MediaFile>seal.png</ofd:MediaFile>
          </ofd:MultiMedia>
        </ofd:MultiMedias>
      </ofd:Res>`
    );
    zip.file(
      "Doc_0/Tpls/Tpl_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="4 10 200 0.3" LineWidth="0.25">
              <ofd:StrokeColor Value="128 0 0"/>
              <ofd:AbbreviatedData>M 0 0 L 200 0</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:TextObject Boundary="20 20 60 20" Size="4">
              <ofd:FillColor Value="128 0 0"/>
              <ofd:TextCode X="0" Y="4" DeltaY="g 4 4">购买方</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 195</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Template TemplateID="10"/>
        <ofd:Content>
          <ofd:Layer>
            <ofd:ImageObject Boundary="7 6 20 20" ResourceID="11"/>
            <ofd:TextObject Boundary="40 50 100 10" Size="5">
              <ofd:TextCode X="0" Y="5">正文内容</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    zip.file("Doc_0/Res/seal.png", "pngdata");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "templated.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const svg = container.querySelector(".ofv-ofd-pages svg");
    expect(container.textContent).toContain("正文内容");
    expect(container.textContent).toContain("购买方");
    expect(svg?.querySelector("image")?.getAttribute("href")).toContain("data:image/png;base64,");
    expect(svg?.querySelector("path")?.getAttribute("stroke")).toBe("rgb(128 0 0)");
    expect(svg?.querySelectorAll("text")).toHaveLength(4);
    expect(svg?.getAttribute("viewBox")).toBe("0 0 210 195");
    expect(container.querySelector("details.ofv-ofd-details")).toBeNull();
  });

  it("uses the page physical box before the document default page area", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Document.xml",
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:PageArea>
            <ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>
          </ofd:PageArea>
        </ofd:CommonData>
      </ofd:Document>`
    );
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 195</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="20 240 80 10" Size="5">
              <ofd:TextCode X="0" Y="5">开票人</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "page-area.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    expect(container.querySelector(".ofv-ofd-pages svg")?.getAttribute("viewBox")).toBe("0 0 210 195");
    expect(container.querySelector<HTMLElement>(".ofv-ofd-page")?.style.getPropertyValue("--ofv-ofd-page-height")).toBe(
      "195mm"
    );
    expect(container.textContent).toContain("开票人");
  });

  it("renders TextCode DeltaX with per-character offsets", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="175 11.780 35 3.622" Size="3.175">
              <ofd:TextCode X="0" Y="2.729" DeltaX="g 4 1.588">26327</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "deltax.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const spans = container.querySelectorAll(".ofv-ofd-page text tspan");
    expect(spans).toHaveLength(5);
    expect(spans[0]?.getAttribute("x")).toBe("175");
    expect(spans[0]?.getAttribute("y")).toBe("14.509");
    expect(spans[1]?.getAttribute("x")).toBe("176.588");
    expect(spans[1]?.getAttribute("dx")).toBeNull();
  });

  it("maps OFD font resource IDs to browser font stacks", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/PublicRes.xml",
      `<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Fonts>
          <ofd:Font ID="2" FontName="楷体" FamilyName="楷体"/>
          <ofd:Font ID="5" FontName="Courier New" FamilyName="Courier New"/>
          <ofd:Font ID="6" FontName="宋体" FamilyName="宋体"/>
          <ofd:Font ID="124" FontName="Times New Roman" FamilyName=""/>
        </ofd:Fonts>
      </ofd:Res>`
    );
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="10 10 80 10" Size="4" Font="2">
              <ofd:TextCode X="0" Y="4">价税合计</ofd:TextCode>
            </ofd:TextObject>
            <ofd:TextObject Boundary="10 24 80 10" Size="4" Font="5">
              <ofd:TextCode X="0" Y="4" DeltaX="g 4 2.54">91320</ofd:TextCode>
            </ofd:TextObject>
            <ofd:TextObject Boundary="10 38 80 10" Size="4" Font="6">
              <ofd:TextCode X="0" Y="4">陆佰叁拾陆圆柒角整</ofd:TextCode>
            </ofd:TextObject>
            <ofd:TextObject Boundary="10 52 10 10" Size="4" Font="124" CTM="0.3528 0 0 0.3528 0 0">
              <ofd:TextCode X="0" Y="4">·</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "fonts.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const texts = container.querySelectorAll(".ofv-ofd-page text");
    expect(texts[0]?.getAttribute("font-family")).toContain("STKaiti");
    expect(texts[1]?.getAttribute("font-family")).toContain("Courier New");
    expect(texts[2]?.getAttribute("font-family")).toContain("SimSong");
    expect(texts[3]?.textContent).toBe("·");
    expect(texts[3]?.getAttribute("font-family")).toContain("Times New Roman");
  });

  it("keeps adjacent digit runs at their explicit coordinates without overlap", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="133.9134 249.3927 5.2193 4.9918" Size="4.9565">
              <ofd:TextCode X="0.7488" Y="4.2686">2</ofd:TextCode>
            </ofd:TextObject>
            <ofd:TextObject Boundary="136.3688 249.3927 4.4317 4.9918" Size="4.9565">
              <ofd:TextCode X="0.7488" Y="4.2686">5</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "digits.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const texts = container.querySelectorAll(".ofv-ofd-page text");
    expect(texts).toHaveLength(2);
    expect(Number(texts[0]?.getAttribute("x"))).toBeCloseTo(134.6622, 4);
    expect(Number(texts[1]?.getAttribute("x"))).toBeCloseTo(137.1176, 4);
    expect(texts[0]?.getAttribute("text-anchor")).toBeNull();
    expect(texts[1]?.getAttribute("text-anchor")).toBeNull();
  });

  it("preserves leading TextCode spaces when DeltaX positions the text", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="76 250 40 8" Size="4">
              <ofd:TextCode X="0" Y="4" DeltaX="5 6 7">  25</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "leading-spaces.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const text = container.querySelector(".ofv-ofd-page text");
    const spans = text?.querySelectorAll("tspan");
    expect(text?.textContent).toBe("  25");
    expect(spans).toHaveLength(4);
    expect(spans?.[2]?.getAttribute("x")).toBe("87");
  });

  it("decodes escaped TextCode characters instead of rendering escape sequences", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="20 30 120 8" Size="4">
              <ofd:TextCode X="0" Y="4" DeltaX="g 6 4">名\\0x0020\\0x0020称:</ofd:TextCode>
            </ofd:TextObject>
            <ofd:TextObject Boundary="20 44 120 8" Size="4">
              <ofd:TextCode X="0" Y="4">价税\\u5408计\\\\备注</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "escaped.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const texts = container.querySelectorAll(".ofv-ofd-page text");
    expect(texts[0]?.textContent).toBe("名  称:");
    expect(texts[0]?.querySelectorAll("tspan")).toHaveLength(5);
    expect(texts[1]?.textContent).toBe("价税合计\\备注");
    expect(container.textContent).not.toContain("0x0020");
  });

  it("respects path Fill/Stroke switches and color Alpha instead of painting black boxes", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="10 10 90 30" LineWidth="0.25" Stroke="true" Fill="false">
              <ofd:FillColor Value="0 0 0"/>
              <ofd:StrokeColor Value="156 82 35"/>
              <ofd:AbbreviatedData>M 0 0 L 90 0 L 90 30 L 0 30 Z</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="10 50 90 30" LineWidth="0.25">
              <ofd:FillColor Value="0 0 0" Alpha="0"/>
              <ofd:StrokeColor Value="156 82 35"/>
              <ofd:AbbreviatedData>M 0 0 L 90 0 L 90 30 L 0 30 Z</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="10 90 90 30" Stroke="false" Fill="true">
              <ofd:FillColor Value="255 0 0" Alpha="127"/>
              <ofd:AbbreviatedData>M 0 0 L 90 0 L 90 30 L 0 30 Z</ofd:AbbreviatedData>
            </ofd:PathObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "cells.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const paths = container.querySelectorAll(".ofv-ofd-page path");
    expect(paths).toHaveLength(3);
    expect(paths[0]?.getAttribute("fill")).toBe("transparent");
    expect(paths[0]?.getAttribute("stroke")).toBe("rgb(156 82 35)");
    expect(paths[1]?.getAttribute("fill")).toBe("transparent");
    expect(paths[1]?.getAttribute("stroke")).toBe("rgb(156 82 35)");
    expect(paths[2]?.getAttribute("fill")).toBe("rgb(255 0 0 / 0.498)");
    expect(paths[2]?.getAttribute("stroke")).toBe("none");
  });

  it("keeps paths unfilled when Fill is absent even if FillColor is present", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="4.5 30 201 90" LineWidth="0.25">
              <ofd:StrokeColor Value="230 0 0"/>
              <ofd:FillColor Value="0 0 0"/>
              <ofd:AbbreviatedData>M 0 0 L 201 0 L 201 90 L 0 90 L 0 0 C</ofd:AbbreviatedData>
            </ofd:PathObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "grid.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const path = container.querySelector(".ofv-ofd-page path");
    expect(path?.getAttribute("fill")).toBe("transparent");
    expect(path?.getAttribute("stroke")).toBe("rgb(230 0 0)");
  });

  it("translates OFD path operators S/B/C into SVG M/C/Z commands", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="10 10 20 20" LineWidth="0.5">
              <ofd:StrokeColor Value="230 0 0"/>
              <ofd:AbbreviatedData>S 1 1 L 19 1 L 19 19 L 1 19 C M 5 5 B 5 3 7 1 9 1</ofd:AbbreviatedData>
            </ofd:PathObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "operators.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    expect(container.querySelector(".ofv-ofd-page path")?.getAttribute("d")).toBe(
      "M 1 1 L 19 1 L 19 19 L 1 19 Z M 5 5 C 5 3 7 1 9 1"
    );
  });

  it("does not render clip paths as visible OFD path geometry", async () => {
    const zip = createBasicOfdZip(
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="20 20 40 24" LineWidth="1">
              <ofd:StrokeColor Value="255 0 0"/>
              <ofd:Clips>
                <ofd:Clip>
                  <ofd:Area>
                    <ofd:Path Boundary="0 0 40 24" Stroke="false" Fill="true">
                      <ofd:AbbreviatedData>M 0 0 L 40 0 L 40 24 L 0 24 C</ofd:AbbreviatedData>
                    </ofd:Path>
                  </ofd:Area>
                </ofd:Clip>
              </ofd:Clips>
              <ofd:AbbreviatedData>M 2 12 B 2 6 12 2 20 2 B 28 2 38 6 38 12 C</ofd:AbbreviatedData>
            </ofd:PathObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "clip-path.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const path = container.querySelector(".ofv-ofd-page path");
    expect(path?.getAttribute("d")).toBe("M 2 12 C 2 6 12 2 20 2 C 28 2 38 6 38 12 Z");
    expect(path?.getAttribute("d")).not.toContain("L 40 24");
  });

  it("applies OFD image CTM without stretching the image to the full page boundary", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      ),
      (char) => char.charCodeAt(0)
    );
    const zip = createBasicOfdZip(
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:ImageObject Boundary="0 0 210 140" CTM="4 0 0 5 50 60" ResourceID="100"/>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`,
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:PageArea>
            <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
          </ofd:PageArea>
          <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>
        </ofd:CommonData>
        <ofd:Pages>
          <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
        </ofd:Pages>
      </ofd:Document>`,
      `<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
        <ofd:MultiMedias>
          <ofd:MultiMedia ID="100" Type="Image">
            <ofd:MediaFile>dot.png</ofd:MediaFile>
          </ofd:MultiMedia>
        </ofd:MultiMedias>
      </ofd:Res>`
    );
    zip.file("Doc_0/Res/dot.png", pngBytes);
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "image-ctm.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-page image")));

    const image = container.querySelector(".ofv-ofd-page image");
    expect(image?.getAttribute("x")).toBe("50");
    expect(image?.getAttribute("y")).toBe("60");
    expect(image?.getAttribute("width")).toBe("4");
    expect(image?.getAttribute("height")).toBe("5");
    expect(image?.getAttribute("transform")).toBeNull();
    expect(image?.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });

  it("keeps OFD template backgrounds behind page images and foreground vectors", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      ),
      (char) => char.charCodeAt(0)
    );
    const zip = createBasicOfdZip(
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Template TemplateID="10"/>
        <ofd:Content>
          <ofd:Layer>
            <ofd:ImageObject Boundary="30 30 20 20" ResourceID="100"/>
            <ofd:PathObject Boundary="35 35 10 10" Stroke="false" Fill="true">
              <ofd:FillColor Value="255 0 0"/>
              <ofd:AbbreviatedData>M 0 0 L 10 0 L 10 10 L 0 10 C</ofd:AbbreviatedData>
            </ofd:PathObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`,
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:PageArea>
            <ofd:PhysicalBox>0 0 100 80</ofd:PhysicalBox>
          </ofd:PageArea>
          <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>
          <ofd:TemplatePage ID="10" BaseLoc="Tpls/Tpl_0/Content.xml"/>
        </ofd:CommonData>
        <ofd:Pages>
          <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
        </ofd:Pages>
      </ofd:Document>`,
      `<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
        <ofd:MultiMedias>
          <ofd:MultiMedia ID="100" Type="Image">
            <ofd:MediaFile>qr.png</ofd:MediaFile>
          </ofd:MultiMedia>
        </ofd:MultiMedias>
      </ofd:Res>`
    );
    zip.file(
      "Doc_0/Tpls/Tpl_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="0 0 100 80" Stroke="false" Fill="true">
              <ofd:FillColor Value="255 255 255"/>
              <ofd:AbbreviatedData>M 0 0 L 100 0 L 100 80 L 0 80 C</ofd:AbbreviatedData>
            </ofd:PathObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    zip.file("Doc_0/Res/qr.png", pngBytes);
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "z-order.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-page image")));

    const children = Array.from(container.querySelector(".ofv-ofd-page svg")?.children || []);
    expect(children.map((child) => child.tagName.toLowerCase())).toEqual(["rect", "path", "image", "path"]);
  });

  it("applies layer-level DrawParam colors, widths and Relative inheritance", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Document.xml",
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>
        </ofd:CommonData>
      </ofd:Document>`
    );
    zip.file(
      "Doc_0/DocumentRes.xml",
      `<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
        <ofd:DrawParams>
          <ofd:DrawParam ID="8" LineWidth="0.25">
            <ofd:FillColor ColorSpace="1" Value="128 0 0"/>
            <ofd:StrokeColor ColorSpace="1" Value="128 0 0"/>
          </ofd:DrawParam>
          <ofd:DrawParam ID="9" Relative="8">
            <ofd:StrokeColor ColorSpace="1" Value="0 82 217"/>
          </ofd:DrawParam>
        </ofd:DrawParams>
      </ofd:Res>`
    );
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer DrawParam="8">
            <ofd:PathObject Boundary="4.5 30 201 0.3">
              <ofd:AbbreviatedData>M 0 0 L 201 0</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="4.5 52 201 0.3" DrawParam="9">
              <ofd:AbbreviatedData>M 0 0 L 201 0</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:TextObject Boundary="20 20 60 8" Size="4">
              <ofd:TextCode X="0" Y="4">购买方信息</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "drawparam.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const paths = container.querySelectorAll(".ofv-ofd-page path");
    expect(paths[0]?.getAttribute("stroke")).toBe("rgb(128 0 0)");
    expect(paths[0]?.getAttribute("stroke-width")).toBe("0.25");
    expect(paths[0]?.getAttribute("fill")).toBe("transparent");
    expect(paths[1]?.getAttribute("stroke")).toBe("rgb(0 82 217)");
    expect(paths[1]?.getAttribute("stroke-width")).toBe("0.25");
    expect(container.querySelector(".ofv-ofd-page text")?.getAttribute("fill")).toBe("rgb(128 0 0)");
  });

  it("follows spec defaults for fill color, grayscale values, even-odd rule and line width", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:PathObject Boundary="10 10 40 10" Stroke="false" Fill="true">
              <ofd:AbbreviatedData>M 0 0 L 40 0 L 40 10 L 0 10 C</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="10 24 40 10" Stroke="false" Fill="true">
              <ofd:FillColor Value="255"/>
              <ofd:AbbreviatedData>M 0 0 L 40 0 L 40 10 L 0 10 C</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="10 38 40 10" Stroke="false" Fill="true">
              <ofd:FillColor Index="2"/>
              <ofd:AbbreviatedData>M 0 0 L 40 0 L 40 10 L 0 10 C</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="10 52 40 10" Stroke="false" Fill="true" Rule="Even-Odd">
              <ofd:FillColor Value="10 20 30"/>
              <ofd:AbbreviatedData>M 0 0 L 40 0 L 40 10 L 0 10 C M 5 2 L 35 2 L 35 8 L 5 8 C</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:PathObject Boundary="10 66 40 10">
              <ofd:StrokeColor Value="10 20 30"/>
              <ofd:AbbreviatedData>M 0 0 L 40 0</ofd:AbbreviatedData>
            </ofd:PathObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "spec-defaults.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const paths = container.querySelectorAll(".ofv-ofd-page path");
    expect(paths).toHaveLength(5);
    expect(paths[0]?.getAttribute("fill")).toBe("#111827");
    expect(paths[0]?.getAttribute("fill-rule")).toBeNull();
    expect(paths[1]?.getAttribute("fill")).toBe("rgb(255 255 255)");
    expect(paths[2]?.getAttribute("fill")).toBe("transparent");
    expect(paths[3]?.getAttribute("fill")).toBe("rgb(10 20 30)");
    expect(paths[3]?.getAttribute("fill-rule")).toBe("evenodd");
    expect(paths[4]?.getAttribute("stroke-width")).toBe("0.353");
  });

  it("reads DrawParams from PublicRes and keeps CTM text inside auto-sized pages", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Document.xml",
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>
        </ofd:CommonData>
      </ofd:Document>`
    );
    zip.file(
      "Doc_0/PublicRes.xml",
      `<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
        <ofd:DrawParams>
          <ofd:DrawParam ID="8" LineWidth="0.25">
            <ofd:StrokeColor Value="128 0 0"/>
          </ofd:DrawParam>
        </ofd:DrawParams>
      </ofd:Res>`
    );
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer DrawParam="8">
            <ofd:PathObject Boundary="15 105 180 0.3">
              <ofd:AbbreviatedData>M 0 0 L 180 0</ofd:AbbreviatedData>
            </ofd:PathObject>
            <ofd:TextObject Boundary="250 40 30 8" Size="4" CTM="1 0 0 1 0 0">
              <ofd:TextCode X="1" Y="4">页边文本</ofd:TextCode>
            </ofd:TextObject>
            <ofd:TextObject Boundary="20 60 6 20" Size="4" CTM="1 0 0 1 0 0">
              <ofd:TextCode X="1" Y="4" DeltaY="g 2 4">竖排字</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "publicres-ctm.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const svg = container.querySelector(".ofv-ofd-pages svg");
    expect(svg?.querySelector("path")?.getAttribute("stroke")).toBe("rgb(128 0 0)");
    expect(svg?.querySelector("path")?.getAttribute("stroke-width")).toBe("0.25");
    // CTM 文本参与页面尺寸估算时使用 Boundary 原点：页面应长到 250+30+12
    expect(svg?.getAttribute("viewBox")).toBe("0 0 292 297");
    const texts = Array.from(svg?.querySelectorAll("text") || []);
    const edge = texts.find((text) => text.textContent === "页边文本");
    expect(edge?.getAttribute("transform")).toBe("translate(250 40) matrix(1 0 0 1 0 0)");
    expect(edge?.getAttribute("x")).toBe("1");
    const vertical = texts.filter((text) => "竖排字".includes(text.textContent || ""));
    expect(vertical.map((text) => text.getAttribute("y"))).toEqual(["4", "8", "12"]);
    expect(vertical.every((text) => text.getAttribute("transform") === "translate(20 60) matrix(1 0 0 1 0 0)")).toBe(true);
    expect(vertical.every((text) => text.getAttribute("x") === "1")).toBe(true);
  });

  it("applies TextObject CTM as an SVG transform with boundary-relative coordinates", async () => {
    const zip = new JSZip();
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Area>
          <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
        </ofd:Area>
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="30 40 60 8" Size="4" CTM="0 1 -1 0 0 0">
              <ofd:TextCode X="1" Y="4">竖排水印</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "ctm-text.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-ofd-pages svg")));

    const text = container.querySelector(".ofv-ofd-page text");
    expect(text?.getAttribute("transform")).toBe("translate(30 40) matrix(0 1 -1 0 0 0)");
    expect(text?.getAttribute("x")).toBe("1");
    expect(text?.getAttribute("y")).toBe("4");
  });

  it("renders signature stamp annotations on the referenced page", async () => {
    const pngBytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
      ),
      (char) => char.charCodeAt(0)
    );
    const signedValue = new Uint8Array(32 + pngBytes.length + 8);
    signedValue.set([0x30, 0x82, 0x36, 0x1a], 0);
    signedValue.set(pngBytes, 32);
    const zip = new JSZip();
    zip.file(
      "OFD.xml",
      `<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:DocBody>
          <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
          <ofd:Signatures>Doc_0/Signs/Signatures.xml</ofd:Signatures>
        </ofd:DocBody>
      </ofd:OFD>`
    );
    zip.file(
      "Doc_0/Document.xml",
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:PageArea>
            <ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox>
          </ofd:PageArea>
        </ofd:CommonData>
        <ofd:Pages>
          <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
          <ofd:Page ID="124" BaseLoc="Pages/Page_1/Content.xml"/>
        </ofd:Pages>
      </ofd:Document>`
    );
    zip.file(
      "Doc_0/Pages/Page_0/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="20 30 120 16" Size="12">
              <ofd:TextCode X="0" Y="12">正文首页</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    zip.file(
      "Doc_0/Pages/Page_1/Content.xml",
      `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:Content>
          <ofd:Layer>
            <ofd:TextObject Boundary="20 30 120 16" Size="12">
              <ofd:TextCode X="0" Y="12">落款页</ofd:TextCode>
            </ofd:TextObject>
          </ofd:Layer>
        </ofd:Content>
      </ofd:Page>`
    );
    zip.file(
      "Doc_0/Signs/Signatures.xml",
      `<ofd:Signatures xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:MaxSignId>2</ofd:MaxSignId>
        <ofd:Signature ID="1" Type="Seal" BaseLoc="Sign_0/Signature.xml"/>
        <ofd:Signature ID="2" Type="Seal" BaseLoc="Sign_1/Signature.xml"/>
      </ofd:Signatures>`
    );
    zip.file(
      "Doc_0/Signs/Sign_0/Signature.xml",
      `<ofd:Signature xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:SignedInfo>
          <ofd:StampAnnot PageRef="124" ID="1" Boundary="120.499 85.581 42 42"/>
        </ofd:SignedInfo>
        <ofd:SignedValue>SignedValue.dat</ofd:SignedValue>
      </ofd:Signature>`
    );
    zip.file("Doc_0/Signs/Sign_0/SignedValue.dat", signedValue);
    zip.file(
      "Doc_0/Signs/Sign_1/Signature.xml",
      `<ofd:Signature xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:SignedInfo>
          <ofd:StampAnnot PageRef="124" ID="2" Boundary="20 120 80 20"/>
        </ofd:SignedInfo>
        <ofd:SignedValue>SignedValue.dat</ofd:SignedValue>
      </ofd:Signature>`
    );
    zip.file("Doc_0/Signs/Sign_1/SignedValue.dat", Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x01]));
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "sealed.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => container.querySelectorAll(".ofv-ofd-page").length === 2);

    const pages = container.querySelectorAll(".ofv-ofd-page");
    expect(pages[0]?.querySelector("image")).toBeNull();
    const stamp = pages[1]?.querySelector("image");
    expect(pages[1]?.querySelectorAll("image")).toHaveLength(1);
    expect(pages[1]?.querySelector("rect[stroke-dasharray]")).toBeNull();
    expect(stamp).not.toBeNull();
    expect(stamp?.getAttribute("href")).toContain("data:image/png;base64,");
    expect(stamp?.getAttribute("x")).toBe("120.499");
    expect(stamp?.getAttribute("y")).toBe("85.581");
    expect(stamp?.getAttribute("width")).toBe("42");
    expect(stamp?.getAttribute("height")).toBe("42");
  });

  it("shows a local fallback for invalid OFD packages", async () => {
    const onError = vi.fn();
    const objectUrl = "blob:broken-ofd";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["not a zip"], { type: "application/ofd" }),
      fileName: "broken.ofd",
      plugins: [ofdPlugin()],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("OFD 解析失败");
    expect(container.textContent).toContain("broken.ofd");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe(objectUrl);
    expect(onError).not.toHaveBeenCalled();
  });

  it("shows the unified encrypted state for protected OFD packages", async () => {
    const objectUrl = "blob:locked-ofd";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    vi.spyOn(JSZip, "loadAsync").mockRejectedValueOnce(new Error("encrypted OFD requires password"));
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["locked"], { type: "application/ofd" }),
      fileName: "locked.ofd",
      plugins: [ofdPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-encrypted")));

    expect(container.textContent).toContain("OFD 文件已加密，无法在线预览");
    expect(container.textContent).toContain("上传解密后的 OFD 文件");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe(objectUrl);
  });
});

function createBasicOfdZip(pageXml: string, documentXml?: string, documentResXml?: string): JSZip {
  const zip = new JSZip();
  zip.file(
    "OFD.xml",
    `<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016">
      <ofd:DocBody>
        <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
      </ofd:DocBody>
    </ofd:OFD>`
  );
  zip.file(
    "Doc_0/Document.xml",
    documentXml ||
      `<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
        <ofd:CommonData>
          <ofd:PageArea>
            <ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox>
          </ofd:PageArea>
        </ofd:CommonData>
        <ofd:Pages>
          <ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/>
        </ofd:Pages>
      </ofd:Document>`
  );
  if (documentResXml) {
    zip.file("Doc_0/DocumentRes.xml", documentResXml);
  }
  zip.file("Doc_0/Pages/Page_0/Content.xml", pageXml);
  return zip;
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
