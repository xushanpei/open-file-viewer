import JSZip from "jszip";
import pako from "pako";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { archivePlugin } from "./archive";
import { textPlugin } from "./text";
import type { PreviewCommand, PreviewPlugin } from "../types";

describe("archivePlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("previews inner files with async plugin matching and blob metadata", async () => {
    const zip = new JSZip();
    zip.file("nested/readme.custom", "inside zip");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const render = vi.fn((ctx) => {
      const result = document.createElement("div");
      result.className = "custom-preview";
      result.textContent = `${ctx.file.name}:${ctx.file.size}:${ctx.file.blob instanceof Blob}`;
      ctx.viewport.append(result);
      return { destroy: vi.fn() };
    });

    const asyncPlugin: PreviewPlugin = {
      name: "custom",
      async match(file) {
        await Promise.resolve();
        return file.extension === "custom";
      },
      render
    };

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin(), asyncPlugin]
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    const item = container.querySelector<HTMLButtonElement>(".ofv-archive-item");
    expect(item?.textContent).toContain("nested/readme.custom");
    expect(item?.type).toBe("button");

    item?.click();
    await waitFor(() => render.mock.calls.length === 1 && Boolean(container.querySelector(".custom-preview")));

    expect(render).toHaveBeenCalledTimes(1);
    expect(item?.getAttribute("aria-current")).toBe("true");
    expect(container.querySelector(".custom-preview")?.textContent).toBe("readme.custom:10:true");
  });

  it("uses shared MIME inference for archive entry previews", async () => {
    const zip = new JSZip();
    zip.file("assets/photo.heic", "heic");
    zip.file("cad/plan.dwg", "AC1027\0\0DWGDATA");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const render = vi.fn((ctx) => {
      const result = document.createElement("div");
      result.className = "metadata-preview";
      result.textContent = `${ctx.file.name}:${ctx.file.extension}:${ctx.file.mimeType}:${ctx.file.blob instanceof Blob}`;
      ctx.viewport.append(result);
      return { destroy: vi.fn() };
    });

    const metadataPlugin: PreviewPlugin = {
      name: "metadata",
      match: (file) => file.extension === "heic" || file.extension === "dwg",
      render
    };

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin(), metadataPlugin]
    });

    await waitFor(() => container.querySelectorAll(".ofv-archive-item").length === 2);
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-archive-item"));

    items[0].click();
    await waitFor(() => render.mock.calls.length === 1);
    expect(container.querySelector(".metadata-preview")?.textContent).toBe("photo.heic:heic:image/heic:true");

    items[1].click();
    await waitFor(() => render.mock.calls.length === 2);
    expect(container.querySelector(".metadata-preview")?.textContent).toBe("plan.dwg:dwg:application/acad:true");
  });

  it("uses MIME type to parse extensionless zip blobs without exposing the default archive summary", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "hello");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([buffer], { type: "application/zip" }),
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));

    expect(container.textContent).toContain("readme.txt");
    expect(visibleText(container)).not.toContain("格式类型：.ZIP 压缩文件");
    const info = container.querySelector<HTMLElement>(".ofv-archive-info");
    if (info) {
      expect(info.hidden).toBe(true);
      expect(info.getAttribute("aria-hidden")).toBe("true");
      expect(info.style.display).toBe("none");
    }
  });

  it("decodes Windows GBK encoded zip entry names", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: minimalStoredZipWithRawName(new Uint8Array([0xce, 0xc4, 0xbc, 0xfe, 0x2e, 0x74, 0x78, 0x74]), "hello"),
      fileName: "windows.zip",
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));

    const item = container.querySelector<HTMLButtonElement>(".ofv-archive-item");
    expect(item?.textContent).toContain("文件.txt");
    expect(item?.textContent).not.toContain("ÎÄ¼þ");
    expect(item?.title).toBe("文件.txt");
  });

  it("renders archive default summary with size, type distribution and risky paths", async () => {
    const zip = new JSZip();
    zip.file("docs/readme.txt", "hello");
    zip.file("assets/photo.png", "123456789");
    zip.file("../escape.sh", "bad");
    zip.folder("empty");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item.is-active")));

    const info = container.querySelector<HTMLElement>(".ofv-archive-info");
    if (info) {
      expect(info.hidden).toBe(true);
      expect(info.getAttribute("aria-hidden")).toBe("true");
      expect(info.style.display).toBe("none");
      const summary = info.querySelector(".ofv-archive-summary");
      expect(summary?.textContent).toContain("总解压大小17 B");
      expect(summary?.textContent).toContain("最大文件assets/photo.png · 9 B");
      expect(summary?.textContent).toContain("类型分布png 1, sh 1, txt 1");
      expect(summary?.textContent).toContain("可预览条目3");
      expect(summary?.textContent).toContain("风险路径1");
    }
    expect(visibleText(container)).not.toContain("总解压大小17 B");
  });

  it("keeps archive sidebar collapsible and auto-collapses after selecting files in narrow containers", async () => {
    const zip = new JSZip();
    for (let index = 0; index < 30; index += 1) {
      zip.file(`Visual Studio Code - Insiders very long file name ${index}.txt`, `file ${index}`);
    }
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const container = document.createElement("div");
    container.style.width = "320px";
    container.style.height = "520px";
    document.body.append(container);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);

    createViewer({
      container,
      file: buffer,
      fileName: "many-files.zip",
      width: "320px",
      height: "520px",
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item.is-active")));

    const layout = container.querySelector(".ofv-archive-layout");
    const toggle = container.querySelector<HTMLButtonElement>(".ofv-archive-sidebar-toggle");
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    toggle?.click();
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item.is-active")));
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    expect(container.querySelector(".ofv-archive-sidebar-panel")).not.toBeNull();
    expect(container.querySelector(".ofv-archive-main")).not.toBeNull();
    expect(container.querySelector<HTMLElement>(".ofv-archive-item-name")?.textContent).toContain(
      "Visual Studio Code"
    );
  });

  it("forwards shared toolbar commands to the selected inner preview", async () => {
    const zip = new JSZip();
    zip.file("preview.inner", "content");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const commandState = {
      zoom: 0,
      rotate: 0
    };
    const commandPlugin: PreviewPlugin = {
      name: "command-child",
      match: (file) => file.extension === "inner",
      render(ctx) {
        const result = document.createElement("div");
        result.className = "command-preview";
        const update = () => {
          result.textContent = `zoom:${commandState.zoom};rotate:${commandState.rotate}`;
        };
        update();
        ctx.viewport.append(result);
        return {
          canCommand(command: PreviewCommand) {
            return command === "zoom-in" || command === "rotate-right";
          },
          command(command: PreviewCommand) {
            if (command === "zoom-in") {
              commandState.zoom += 1;
              update();
              return true;
            }
            if (command === "rotate-right") {
              commandState.rotate += 90;
              update();
              return true;
            }
            return false;
          },
          destroy: vi.fn()
        };
      }
    };
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      toolbar: true,
      plugins: [archivePlugin(), commandPlugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")) && Boolean(container.querySelector(".command-preview")));

    const zoomIn = container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]');
    const zoomOut = container.querySelector<HTMLButtonElement>('[aria-label="Zoom out"]');
    const rotate = container.querySelector<HTMLButtonElement>('[aria-label="Rotate right"]');
    expect(zoomIn?.disabled).toBe(false);
    expect(rotate?.disabled).toBe(false);
    expect(zoomOut?.disabled).toBe(true);
    expect(container.querySelector(".ofv-archive-item")?.getAttribute("aria-current")).toBe("true");

    zoomIn?.click();
    rotate?.click();

    expect(container.querySelector(".command-preview")?.textContent).toBe("zoom:1;rotate:90");
  });

  it("keeps the archive sidebar toggle effective in wide containers", async () => {
    const zip = new JSZip();
    zip.file("docs/readme.txt", "hello");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const container = document.createElement("div");
    document.body.append(container);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(960);

    createViewer({
      container,
      file: buffer,
      fileName: "wide.zip",
      width: "960px",
      height: "520px",
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));

    const layout = container.querySelector(".ofv-archive-layout");
    const toggle = container.querySelector<HTMLButtonElement>(".ofv-archive-sidebar-toggle");
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(false);
    toggle?.click();
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item.is-active")));
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(true);
  });

  it("shows the unified encrypted state for password protected archives", async () => {
    const objectUrl = "blob:locked-zip";
    vi.spyOn(URL, "createObjectURL").mockReturnValue(objectUrl);
    vi.spyOn(JSZip, "loadAsync").mockRejectedValueOnce(new Error("encrypted zip requires password"));
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["locked"], { type: "application/zip" }),
      fileName: "locked.zip",
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-encrypted")));

    expect(container.textContent).toContain("压缩包已加密，无法在线预览");
    expect(container.textContent).toContain("上传解密后的压缩包");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe(objectUrl);
  });

  it("renders RAR4 header entries without falling back to unsupported copy", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: minimalRar4(),
      fileName: "bundle.rar",
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-probe-table")));

    expect(container.textContent).toContain("RAR 结构预览");
    expect(container.textContent).toContain("版本：RAR4");
    expect(container.textContent).toContain("可见条目：1");
    expect(container.textContent).toContain("docs/readme.txt");
    expect(container.textContent).toContain("5 B");
    expect(container.querySelector(".ofv-fallback")).toBeNull();
  });

  it("renders 7z container header boundaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: minimal7z(),
      fileName: "bundle.7z",
      plugins: [archivePlugin()]
    });

    await waitFor(() => container.textContent?.includes("7Z 结构预览") || false);

    expect(container.textContent).toContain("版本：0.4");
    expect(container.textContent).toContain("Next header offset：32");
    expect(container.textContent).toContain("Next header size：16");
    expect(container.textContent).toContain("目录和解压需要 LZMA/7z");
    expect(container.querySelector(".ofv-fallback")).toBeNull();
  });

  it("decompresses bzip2 streams into previewable single-file entries", async () => {
    const bzContainer = document.createElement("div");
    document.body.append(bzContainer);

    createViewer({
      container: bzContainer,
      file: sampleBzip2Text(),
      fileName: "readme.txt.bz2",
      plugins: [archivePlugin(), textPlugin()]
    });

    await waitFor(() => bzContainer.textContent?.includes("hello from bz2") === true);
    expect(bzContainer.textContent).toContain("readme.txt");
    expect(visibleText(bzContainer)).not.toContain("包含文件数：1 个");
    expect(bzContainer.querySelector(".ofv-fallback")).toBeNull();
  });

  it("decompresses xz streams into previewable single-file entries", async () => {
    const xzContainer = document.createElement("div");
    document.body.append(xzContainer);

    createViewer({
      container: xzContainer,
      file: sampleXzText(),
      fileName: "readme.txt.xz",
      plugins: [archivePlugin(), textPlugin()]
    });

    await waitFor(() => xzContainer.textContent?.includes("hello from xz") === true, 1000, () => xzContainer.textContent || "");
    expect(xzContainer.textContent).toContain("readme.txt");
    expect(visibleText(xzContainer)).not.toContain("包含文件数：1 个");
    expect(xzContainer.querySelector(".ofv-fallback")).toBeNull();
  });

  it("decompresses tgz streams into previewable tar entries", async () => {
    const tgzContainer = document.createElement("div");
    document.body.append(tgzContainer);

    createViewer({
      container: tgzContainer,
      file: minimalTgz(),
      fileName: "bundle.tgz",
      plugins: [archivePlugin(), textPlugin()]
    });

    await waitFor(
      () => tgzContainer.textContent?.includes("hello from tgz") === true && !tgzContainer.querySelector(".ofv-fallback"),
      1000,
      () => tgzContainer.textContent || ""
    );
    expect(tgzContainer.textContent).toContain("readme.txt");
    expect(visibleText(tgzContainer)).not.toContain("包含文件数：1 个");
    expect(tgzContainer.textContent).toContain("hello from tgz");
    expect(tgzContainer.querySelector(".ofv-fallback")).toBeNull();
  });

  it("renders archive entries as accessible buttons", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "hello");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));

    const item = container.querySelector<HTMLButtonElement>(".ofv-archive-item");
    expect(item?.tagName).toBe("BUTTON");
    expect(item?.type).toBe("button");
    expect(item?.title).toBe("readme.txt");
  });

  it("does not render an inner preview after the archive viewer is destroyed", async () => {
    const zip = new JSZip();
    zip.file("inside.custom", "inside");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    let resolveMatch: ((value: boolean) => void) | undefined;
    const render = vi.fn((ctx) => {
      const result = document.createElement("div");
      result.className = "late-preview";
      result.textContent = ctx.file.name;
      ctx.viewport.append(result);
      return { destroy: vi.fn() };
    });
    const delayedEntryPlugin: PreviewPlugin = {
      name: "delayed",
      match: (file) =>
        file.extension === "custom"
          ? new Promise<boolean>((resolve) => {
              resolveMatch = resolve;
            })
          : false,
      render
    };

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin(), delayedEntryPlugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));

    container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();
    await waitFor(() => Boolean(resolveMatch));
    viewer.destroy();
    resolveMatch?.(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(render).not.toHaveBeenCalled();
    expect(container.querySelector(".late-preview")).toBeNull();
  });

  it("keeps the newest inner preview instance when earlier async render completes later", async () => {
    const zip = new JSZip();
    zip.file("a.custom", "first");
    zip.file("b.custom", "second");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    let resolveFirstRender: (() => void) | undefined;
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const asyncPlugin: PreviewPlugin = {
      name: "custom",
      match: (file) => file.extension === "custom",
      async render(ctx) {
        const node = document.createElement("div");
        node.className = "custom-preview";
        node.textContent = ctx.file.name;
        ctx.viewport.append(node);

        if (ctx.file.name === "a.custom") {
          await new Promise<void>((resolve) => {
            resolveFirstRender = resolve;
          });
          return { destroy: firstDestroy };
        }
        return { destroy: secondDestroy };
      }
    };

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin(), asyncPlugin]
    });

    await waitFor(() => container.querySelectorAll(".ofv-archive-item").length === 2);

    const items = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-archive-item"));
    items[0].click();
    await waitFor(() => Boolean(resolveFirstRender));
    items[1].click();
    await waitFor(() => container.querySelector(".custom-preview")?.textContent === "b.custom");
    resolveFirstRender?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.querySelector(".custom-preview")?.textContent).toBe("b.custom");

    viewer.destroy();

    expect(firstDestroy).toHaveBeenCalledTimes(1);
    expect(secondDestroy).toHaveBeenCalledTimes(1);
  });

  it("shows an inner preview error when a matched plugin throws", async () => {
    const zip = new JSZip();
    zip.file("broken.custom", "broken");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const throwingPlugin: PreviewPlugin = {
      name: "throwing",
      match: (file) => file.extension === "custom",
      render() {
        throw new Error("renderer exploded");
      }
    };
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin(), throwingPlugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));
    container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();

    await waitFor(() => container.textContent?.includes("renderer exploded") || false);

    expect(container.textContent).toContain("文件预览失败");
    expect(container.textContent).not.toContain("解压加载失败");
  });

  it("keeps setError failures local to the selected inner preview", async () => {
    const zip = new JSZip();
    zip.file("bad.custom", "bad");
    const buffer = await zip.generateAsync({ type: "arraybuffer" });
    const destroy = vi.fn();
    const setErrorPlugin: PreviewPlugin = {
      name: "set-error",
      match: (file) => file.extension === "custom",
      render(ctx) {
        ctx.setError(new Error("cannot decode inner file"));
        return { destroy };
      }
    };
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: buffer,
      fileName: "bundle.zip",
      plugins: [archivePlugin(), setErrorPlugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));
    container.querySelector<HTMLButtonElement>(".ofv-archive-item")?.click();

    await waitFor(() => container.textContent?.includes("cannot decode inner file") || false);

    expect(container.textContent).toContain("文件预览失败");
    viewer.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

function minimalRar4(): ArrayBuffer {
  const name = new TextEncoder().encode("docs/readme.txt");
  const headerSize = 32 + name.length;
  const bytes = new Uint8Array(7 + 13 + headerSize);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00], 0);
  let offset = 7;
  view.setUint16(offset, 0, true);
  bytes[offset + 2] = 0x73;
  view.setUint16(offset + 3, 0, true);
  view.setUint16(offset + 5, 13, true);
  view.setUint16(offset + 7, 0, true);
  view.setUint32(offset + 9, 0, true);
  offset += 13;
  view.setUint16(offset, 0, true);
  bytes[offset + 2] = 0x74;
  view.setUint16(offset + 3, 0, true);
  view.setUint16(offset + 5, headerSize, true);
  view.setUint32(offset + 7, 5, true);
  view.setUint32(offset + 11, 5, true);
  bytes[offset + 15] = 2;
  view.setUint32(offset + 16, 0, true);
  bytes[offset + 20] = 0x30;
  view.setUint32(offset + 21, 0, true);
  view.setUint16(offset + 25, 0, true);
  view.setUint16(offset + 26, name.length, true);
  view.setUint32(offset + 28, 0, true);
  bytes.set(name, offset + 32);
  return bytes.buffer;
}

function minimalStoredZipWithRawName(name: Uint8Array, content: string): ArrayBuffer {
  const payload = new TextEncoder().encode(content);
  const localHeaderSize = 30 + name.length;
  const centralHeaderSize = 46 + name.length;
  const totalSize = localHeaderSize + payload.length + centralHeaderSize + 22;
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  view.setUint32(offset, 0x04034b50, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, 0, true);
  view.setUint16(offset + 10, 0, true);
  view.setUint16(offset + 12, 0, true);
  view.setUint32(offset + 14, 0, true);
  view.setUint32(offset + 18, payload.length, true);
  view.setUint32(offset + 22, payload.length, true);
  view.setUint16(offset + 26, name.length, true);
  view.setUint16(offset + 28, 0, true);
  bytes.set(name, offset + 30);
  bytes.set(payload, offset + localHeaderSize);
  const centralOffset = localHeaderSize + payload.length;
  offset = centralOffset;

  view.setUint32(offset, 0x02014b50, true);
  view.setUint16(offset + 4, 20, true);
  view.setUint16(offset + 6, 20, true);
  view.setUint16(offset + 8, 0, true);
  view.setUint16(offset + 10, 0, true);
  view.setUint16(offset + 12, 0, true);
  view.setUint16(offset + 14, 0, true);
  view.setUint32(offset + 16, 0, true);
  view.setUint32(offset + 20, payload.length, true);
  view.setUint32(offset + 24, payload.length, true);
  view.setUint16(offset + 28, name.length, true);
  view.setUint16(offset + 30, 0, true);
  view.setUint16(offset + 32, 0, true);
  view.setUint16(offset + 34, 0, true);
  view.setUint16(offset + 36, 0, true);
  view.setUint32(offset + 38, 0, true);
  view.setUint32(offset + 42, 0, true);
  bytes.set(name, offset + 46);
  offset += centralHeaderSize;

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, 1, true);
  view.setUint16(offset + 10, 1, true);
  view.setUint32(offset + 12, centralHeaderSize, true);
  view.setUint32(offset + 16, centralOffset, true);
  view.setUint16(offset + 20, 0, true);
  return bytes.buffer;
}

function minimal7z(): ArrayBuffer {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  bytes.set([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x04], 0);
  view.setUint32(8, 0, true);
  view.setUint32(12, 32, true);
  view.setUint32(16, 0, true);
  view.setUint32(20, 16, true);
  view.setUint32(24, 0, true);
  view.setUint32(28, 0x12345678, true);
  return bytes.buffer;
}

function sampleBzip2Text(): ArrayBuffer {
  return new Uint8Array([
    0x42, 0x5a, 0x68, 0x39, 0x31, 0x41, 0x59, 0x26, 0x53, 0x59, 0x91, 0x38,
    0x45, 0x8f, 0x00, 0x00, 0x03, 0xd9, 0x80, 0x00, 0x10, 0x40, 0x00, 0x10,
    0x00, 0x13, 0x46, 0x90, 0x10, 0x20, 0x00, 0x22, 0x1a, 0x00, 0x68, 0x40,
    0xd0, 0x34, 0x1b, 0x34, 0xce, 0x8a, 0xce, 0xa0, 0x49, 0xf1, 0x77, 0x24,
    0x53, 0x85, 0x09, 0x09, 0x13, 0x84, 0x58, 0xf0
  ]).buffer;
}

function sampleXzText(): ArrayBuffer {
  return new Uint8Array([
    253, 55, 122, 88, 90, 0, 0, 4, 230, 214, 180, 70, 2, 0, 33, 1, 22, 0,
    0, 0, 116, 47, 229, 163, 1, 0, 13, 104, 101, 108, 108, 111, 32, 102, 114,
    111, 109, 32, 120, 122, 10, 0, 0, 0, 91, 249, 134, 221, 230, 39, 122,
    230, 0, 1, 38, 14, 8, 27, 224, 4, 31, 182, 243, 125, 1, 0, 0, 0, 0, 4,
    89, 90
  ]).buffer;
}

function minimalTgz(): ArrayBuffer {
  return toExactArrayBuffer(pako.gzip(new Uint8Array(minimalTar("readme.txt", "hello from tgz"))));
}

function minimalTar(fileName: string, contentText: string): ArrayBuffer {
  const content = new TextEncoder().encode(contentText);
  const header = new Uint8Array(512);
  header.set(ascii(fileName), 0);
  header.set(ascii("0000644\0"), 100);
  header.set(ascii("0000000\0"), 108);
  header.set(ascii("0000000\0"), 116);
  header.set(ascii(content.length.toString(8).padStart(11, "0") + "\0"), 124);
  header.set(ascii("00000000000\0"), 136);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.set(ascii("ustar\0"), 257);
  header.set(ascii("00"), 263);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.set(ascii(checksum.toString(8).padStart(6, "0") + "\0 "), 148);
  const paddedSize = Math.ceil(content.length / 512) * 512;
  const fileBlock = new Uint8Array(paddedSize);
  fileBlock.set(content);
  return new Uint8Array([...header, ...fileBlock, ...new Uint8Array(1024)]).buffer;
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function visibleText(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node, hidden: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text && !hidden) {
        parts.push(text);
      }
      return;
    }
    if (node instanceof HTMLElement) {
      const isHidden =
        hidden ||
        node.hidden ||
        node.getAttribute("aria-hidden") === "true" ||
        node.style.display === "none" ||
        node.style.visibility === "hidden";
      node.childNodes.forEach((child) => walk(child, isHidden));
      return;
    }
    node.childNodes.forEach((child) => walk(child, hidden));
  };
  walk(root, false);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function waitFor(predicate: () => boolean, timeout = 1000, describe?: () => string): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timed out waiting for condition.${describe ? ` ${describe()}` : ""}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
