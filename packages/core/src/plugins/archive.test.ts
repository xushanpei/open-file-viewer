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

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
