import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { epubPlugin } from "./epub";

describe("epubPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders EPUB metadata, spine chapters and embedded images", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalEpub(),
      fileName: "book.epub",
      plugins: [epubPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-epub-reader")));

    expect(container.textContent).toContain("测试书名");
    expect(container.textContent).toContain("作者 A");
    const summary = container.querySelector(".ofv-epub-meta");
    expect((summary as HTMLElement | null)?.hidden).toBe(true);
    expect(summary?.textContent).toContain("出版方测试出版社");
    expect(summary?.textContent).toContain("标识urn:isbn:9780000000000");
    expect(summary?.textContent).toContain("修改时间2026-06-15T00:00:00Z");
    expect(summary?.textContent).toContain("章节2");
    expect(summary?.textContent).toContain("Manifest7");
    expect(summary?.textContent).toContain("Spine2");
    expect(summary?.textContent).toContain("导航2");
    expect(summary?.textContent).toContain("封面1");
    expect(summary?.textContent).toContain("图片1");
    expect(summary?.textContent).toContain("样式1");
    expect(summary?.textContent).toContain("字体1");
    expect(visibleText(container)).not.toContain("EPUB 图书信息");
    expect(visibleText(container)).not.toContain("EPUB 正文预览");
    expect(container.textContent).toContain("第一章");
    expect(container.textContent).toContain("Hello EPUB");
    expect(container.textContent).toContain("第二章");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });

  it("responds to shared toolbar zoom commands as reader font scaling", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: await createMinimalEpub(),
      fileName: "toolbar.epub",
      toolbar: true,
      plugins: [epubPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-epub-reader")));

    const reader = container.querySelector<HTMLElement>(".ofv-epub-reader");
    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomOut = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');
    expect(zoomIn?.disabled).toBe(false);
    expect(zoomOut?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(true);

    zoomIn?.click();
    expect(reader?.style.getPropertyValue("--ofv-epub-zoom")).toBe("1.12");
    expect(zoomReset?.textContent).toBe("112%");

    zoomOut?.click();
    expect(reader?.style.getPropertyValue("--ofv-epub-zoom")).toBe("1");

    zoomReset?.click();
    expect(reader?.style.getPropertyValue("--ofv-epub-zoom")).toBe("1");
    expect(zoomReset?.textContent).toBe("100%");
  });

  it("shows a local fallback for invalid EPUB packages", async () => {
    const container = document.createElement("div");
    const onError = vi.fn();
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["not a zip"], { type: "application/epub+zip" }),
      fileName: "broken.epub",
      plugins: [epubPlugin()],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("EPUB 解析失败");
    expect(onError).not.toHaveBeenCalled();
  });
});

async function createMinimalEpub(): Promise<Blob> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles>
        <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml" />
      </rootfiles>
    </container>`
  );
  zip.file(
    "OPS/package.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>测试书名</dc:title>
        <dc:creator>作者 A</dc:creator>
        <dc:language>zh-CN</dc:language>
        <dc:identifier>urn:isbn:9780000000000</dc:identifier>
        <dc:publisher>测试出版社</dc:publisher>
        <meta property="dcterms:modified">2026-06-15T00:00:00Z</meta>
      </metadata>
      <manifest>
        <item id="c1" href="chapters/chapter1.xhtml" media-type="application/xhtml+xml" />
        <item id="c2" href="chapters/chapter2.xhtml" media-type="application/xhtml+xml" />
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
        <item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml" />
        <item id="style" href="styles/book.css" media-type="text/css" />
        <item id="font" href="fonts/book.woff2" media-type="font/woff2" />
        <item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image" />
      </manifest>
      <spine>
        <itemref idref="c1" />
        <itemref idref="c2" />
      </spine>
    </package>`
  );
  zip.file(
    "OPS/chapters/chapter1.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head><title>第一章</title></head>
      <body>
        <h1>第一章</h1>
        <p>Hello EPUB</p>
        <img src="../images/cover.png" />
        <script>alert(1)</script>
      </body>
    </html>`
  );
  zip.file(
    "OPS/chapters/chapter2.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章</h1><p>Next</p></body></html>`
  );
  zip.file("OPS/nav.xhtml", `<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol><li>第一章</li></ol></nav></body></html>`);
  zip.file("OPS/toc.ncx", `<ncx><navMap /></ncx>`);
  zip.file("OPS/styles/book.css", "body { color: #111; }");
  zip.file("OPS/fonts/book.woff2", Uint8Array.from([0x77, 0x4f, 0x46, 0x32]));
  zip.file("OPS/images/cover.png", Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
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
