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
            <ofd:PathObject Boundary="10 10 60 30" LineWidth="2">
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

  it("uses the document default page area when a page content box is shorter", async () => {
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

    expect(container.querySelector(".ofv-ofd-pages svg")?.getAttribute("viewBox")).toBe("0 0 210 297");
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

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
