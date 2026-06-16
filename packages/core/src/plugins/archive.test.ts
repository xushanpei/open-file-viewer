import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { archivePlugin } from "./archive";
import type { PreviewPlugin } from "../types";

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

  it("uses MIME type to parse extensionless zip blobs", async () => {
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
    expect(container.textContent).toContain("格式类型：.ZIP 压缩文件");
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

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-summary")));

    const summary = container.querySelector(".ofv-archive-summary");
    expect(summary?.textContent).toContain("总解压大小17 B");
    expect(summary?.textContent).toContain("最大文件assets/photo.png · 9 B");
    expect(summary?.textContent).toContain("类型分布png 1, sh 1, txt 1");
    expect(summary?.textContent).toContain("可预览条目3");
    expect(summary?.textContent).toContain("风险路径1");
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

    await waitFor(() => Boolean(container.querySelector(".ofv-archive-item")));

    const layout = container.querySelector(".ofv-archive-layout");
    const toggle = container.querySelector<HTMLButtonElement>(".ofv-archive-sidebar-toggle");
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    toggle?.click();
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    toggle?.click();
    expect(layout?.classList.contains("is-sidebar-collapsed")).toBe(false);

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

  it("renders bzip2 and xz stream signatures", async () => {
    const bzContainer = document.createElement("div");
    document.body.append(bzContainer);

    createViewer({
      container: bzContainer,
      file: new Uint8Array([0x42, 0x5a, 0x68, 0x39, 0x31, 0x41, 0x59]).buffer,
      fileName: "data.bz2",
      plugins: [archivePlugin()]
    });

    await waitFor(() => bzContainer.textContent?.includes("BZIP2 结构预览") || false);
    expect(bzContainer.textContent).toContain("块大小：900 KB");
    expect(bzContainer.querySelector(".ofv-fallback")).toBeNull();

    const xzContainer = document.createElement("div");
    document.body.append(xzContainer);

    createViewer({
      container: xzContainer,
      file: new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 0x00, 0x04]).buffer,
      fileName: "data.xz",
      plugins: [archivePlugin()]
    });

    await waitFor(() => xzContainer.textContent?.includes("XZ 结构预览") || false);
    expect(xzContainer.textContent).toContain("Stream flags：0x00 0x04");
    expect(xzContainer.querySelector(".ofv-fallback")).toBeNull();
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

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
