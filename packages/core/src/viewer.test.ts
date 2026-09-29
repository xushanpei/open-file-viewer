import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "./viewer";
import type { PreviewPlugin } from "./types";

describe("createViewer", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders, dispatches toolbar commands, and destroys cleanly", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const command = vi.fn();
    const destroy = vi.fn();
    const plugin: PreviewPlugin = {
      name: "test",
      match: (file) => file.extension === "txt",
      render(ctx) {
        const content = document.createElement("div");
        content.textContent = ctx.file.name;
        ctx.viewport.append(content);
        return { command, destroy };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [plugin]
    });

    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    expect(zoomIn).not.toBeNull();
    await waitFor(() => zoomIn?.disabled === false);
    expect(zoomIn?.disabled).toBe(false);

    zoomIn?.click();
    expect(command).toHaveBeenCalledWith("zoom-in");

    viewer.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(container.childElementCount).toBe(0);
  });

  it("delegates 1-based page jumps through initial options, the viewer, and custom toolbar context", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const goToPage = vi.fn(() => true);
    let toolbarGoToPage: ((page: number) => boolean) | undefined;

    const viewer = createViewer({
      container,
      file: new Blob(["pages"], { type: "text/plain" }),
      fileName: "pages.txt",
      initialPage: 3,
      toolbar: {
        render(ctx) {
          toolbarGoToPage = ctx.goToPage;
        }
      },
      plugins: [
        {
          name: "paginated",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = "ready";
            return { goToPage, destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => goToPage.mock.calls.length === 1);
    expect(goToPage).toHaveBeenNthCalledWith(1, 3);
    expect(viewer.goToPage(5)).toBe(true);
    expect(toolbarGoToPage?.(2)).toBe(true);
    expect(goToPage.mock.calls).toEqual([[3], [5], [2]]);

    viewer.destroy();
    expect(viewer.goToPage(1)).toBe(false);
  });

  it("aborts an in-flight plugin render when the viewer is destroyed", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const onAbort = vi.fn();
    const destroy = vi.fn();
    const renderStarted = vi.fn();

    const viewer = createViewer({
      container,
      file: new Blob(["slow"], { type: "text/plain" }),
      fileName: "slow.txt",
      plugins: [
        {
          name: "abortable",
          match: () => true,
          render(ctx) {
            renderStarted();
            return new Promise((resolve) => {
              ctx.signal?.addEventListener(
                "abort",
                () => {
                  onAbort();
                  resolve({ destroy });
                },
                { once: true }
              );
            });
          }
        }
      ]
    });

    await waitFor(() => renderStarted.mock.calls.length === 1);
    viewer.destroy();
    await waitFor(() => onAbort.mock.calls.length === 1);

    expect(onAbort).toHaveBeenCalledTimes(1);
    await waitFor(() => destroy.mock.calls.length === 1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("supports multiple className tokens on the viewer container", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      className: "viewer-shell viewer-wide",
      plugins: [
        {
          name: "test",
          match: (file) => file.extension === "txt",
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    expect(container.classList.contains("viewer-shell")).toBe(true);
    expect(container.classList.contains("viewer-wide")).toBe(true);
    expect(container.classList.contains("ofv-root")).toBe(true);

    viewer.destroy();
    expect(container.classList.contains("viewer-shell")).toBe(false);
    expect(container.classList.contains("viewer-wide")).toBe(false);
    expect(container.classList.contains("ofv-root")).toBe(false);
  });

  it("disables toolbar commands unsupported by the active preview", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const command = vi.fn();
    const plugin: PreviewPlugin = {
      name: "selective",
      match: (file) => file.extension === "txt",
      render(ctx) {
        const content = document.createElement("div");
        content.textContent = ctx.file.name;
        ctx.viewport.append(content);
        return {
          canCommand: (nextCommand) => nextCommand === "zoom-in",
          command,
          destroy: vi.fn()
        };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [plugin]
    });

    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomOut = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom out"]');
    const rotate = container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');

    await waitFor(() => zoomIn?.disabled === false);
    expect(zoomIn?.disabled).toBe(false);
    expect(zoomOut?.disabled).toBe(true);
    expect(rotate?.disabled).toBe(true);

    zoomIn?.click();
    zoomOut?.click();
    rotate?.click();
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith("zoom-in");

    viewer.destroy();
  });

  it("updates the toolbar zoom percentage when plugins report zoom changes", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    let zoom = 1;
    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [
        {
          name: "zoom-state",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            ctx.toolbar?.setZoom(zoom);
            return {
              canCommand: (command) => command === "zoom-in" || command === "zoom-reset",
              command(command) {
                if (command === "zoom-in") {
                  zoom = 1.25;
                  ctx.toolbar?.setZoom(zoom);
                  return true;
                }
                if (command === "zoom-reset") {
                  zoom = 1;
                  ctx.toolbar?.setZoom(zoom);
                  return true;
                }
                return false;
              },
              destroy: vi.fn()
            };
          }
        }
      ]
    });

    const zoomIn = container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    await waitFor(() => zoomIn?.disabled === false);
    expect(zoomReset?.textContent).toBe("100%");

    zoomIn?.click();
    await waitFor(() => zoomReset?.textContent === "125%");

    zoomReset?.click();
    await waitFor(() => zoomReset?.textContent === "100%");

    viewer.destroy();
  });

  it("dispatches Ctrl or Command wheel gestures through the active preview zoom commands", async () => {
    const container = document.createElement("div");
    const command = vi.fn();
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["gesture"], { type: "text/plain" }),
      fileName: "gesture.txt",
      plugins: [
        {
          name: "gesture-zoom",
          match: () => true,
          render(ctx) {
            ctx.viewport.append(document.createElement("div"));
            return {
              canCommand: (nextCommand) => nextCommand === "zoom-in" || nextCommand === "zoom-out",
              command,
              destroy: vi.fn()
            };
          }
        }
      ]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-viewport > div")));
    const viewport = container.querySelector<HTMLElement>(".ofv-viewport")!;
    const ordinaryWheel = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
    viewport.dispatchEvent(ordinaryWheel);
    expect(ordinaryWheel.defaultPrevented).toBe(false);
    expect(command).not.toHaveBeenCalled();

    const zoomIn = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    viewport.dispatchEvent(zoomIn);
    const zoomOut = new WheelEvent("wheel", { deltaY: 100, metaKey: true, bubbles: true, cancelable: true });
    viewport.dispatchEvent(zoomOut);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(zoomOut.defaultPrevented).toBe(true);
    expect(command.mock.calls.map(([nextCommand]) => nextCommand)).toEqual(["zoom-in", "zoom-out"]);

    const handledByPreview = new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true });
    viewport.firstElementChild?.addEventListener("wheel", (event) => event.preventDefault(), { once: true });
    viewport.firstElementChild?.dispatchEvent(handledByPreview);
    expect(command).toHaveBeenCalledTimes(2);

    viewer.destroy();
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true, bubbles: true, cancelable: true }));
    expect(command).toHaveBeenCalledTimes(2);
  });

  it("dispatches two-finger pinch gestures without requiring the toolbar", async () => {
    const container = document.createElement("div");
    const command = vi.fn();
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["pinch"], { type: "text/plain" }),
      fileName: "pinch.txt",
      plugins: [
        {
          name: "pinch-zoom",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = "ready";
            return {
              canCommand: (nextCommand) => nextCommand === "zoom-in" || nextCommand === "zoom-out",
              command,
              destroy: vi.fn()
            };
          }
        }
      ]
    });

    await waitFor(() => container.querySelector(".ofv-viewport")?.textContent === "ready");
    const viewport = container.querySelector<HTMLElement>(".ofv-viewport")!;
    viewport.dispatchEvent(createTouchEvent("touchstart", [[0, 0], [100, 0]]));
    const pinchOut = createTouchEvent("touchmove", [[0, 0], [112, 0]]);
    viewport.dispatchEvent(pinchOut);
    const pinchIn = createTouchEvent("touchmove", [[0, 0], [90, 0]]);
    viewport.dispatchEvent(pinchIn);

    expect(pinchOut.defaultPrevented).toBe(true);
    expect(pinchIn.defaultPrevented).toBe(true);
    expect(command.mock.calls.map(([nextCommand]) => nextCommand)).toEqual(["zoom-in", "zoom-out"]);

    viewport.dispatchEvent(createTouchEvent("touchend", []));
    viewer.destroy();
  });

  it("passes a normalized initial zoom to plugins", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const render = vi.fn((ctx) => {
      ctx.viewport.textContent = String(ctx.options.zoom);
      return { destroy: vi.fn() };
    });

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      zoom: 1.5,
      plugins: [
        {
          name: "initial-zoom",
          match: () => true,
          render
        }
      ]
    });

    await waitFor(() => container.textContent === "1.5");
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ zoom: 1.5 }) }));

    viewer.destroy();
  });

  it("defaults invalid initial zoom values to 100%", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      zoom: 0,
      plugins: [
        {
          name: "default-zoom",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = String(ctx.options.zoom);
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => container.textContent === "1");

    viewer.destroy();
  });

  it("clears partial plugin output before showing render errors", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["broken"], { type: "application/octet-stream" }),
      fileName: "broken.bin",
      plugins: [
        {
          name: "partial-failure",
          match: () => true,
          async render(ctx) {
            const partial = document.createElement("div");
            partial.className = "partial-preview";
            ctx.viewport.append(partial);
            throw new Error("preview failed");
          }
        }
      ]
    });

    await waitFor(() => container.textContent?.includes("preview failed") === true);

    expect(container.querySelector(".partial-preview")).toBeNull();
    expect(container.querySelector(".ofv-status")?.textContent).toContain("preview failed");
  });

  it("renders fallback messages in English by default", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["unknown"], { type: "application/octet-stream" }),
      fileName: "unknown.bin"
    });

    await waitFor(() => container.textContent?.includes("Preview is not available for this file") === true);

    expect(container.textContent).toContain("Download file");
    expect(container.textContent).toContain("File");
    expect(container.textContent).toContain("Format");
    expect(container.textContent).toContain("Local or in-memory file");
    expect(container.textContent).not.toContain("当前文件暂不支持在线预览");
  });

  it("can render fallback messages in Simplified Chinese", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["unknown"], { type: "application/octet-stream" }),
      fileName: "unknown.bin",
      locale: "zh-CN"
    });

    await waitFor(() => container.textContent?.includes("当前文件暂不支持在线预览") === true);

    expect(container.textContent).toContain("下载文件");
    expect(container.textContent).not.toContain("Preview is not available for this file");
  });

  it("localizes the built-in toolbar with the viewer locale", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      locale: "zh-CN",
      toolbar: true,
      plugins: [
        {
          name: "localized-toolbar",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            return { command: vi.fn(), destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => container.textContent?.includes("hello.txt") === true);

    expect(container.querySelector('[role="toolbar"]')?.getAttribute("aria-label")).toBe("文件预览工具栏");
    expect(container.querySelector<HTMLInputElement>('.ofv-toolbar-search input')?.placeholder).toBe("搜索");
    expect(container.querySelector('button[aria-label="向右旋转"]')?.textContent).toBe("旋转");
    expect(container.querySelector('button[aria-label="下载文件"]')?.textContent).toBe("下载");
    expect(container.querySelector('button[aria-label="全屏查看预览"]')?.textContent).toBe("全屏");
    expect(container.querySelector('button[aria-label="打印预览"]')?.textContent).toBe("打印");
    expect(container.textContent).not.toContain("Download");

    viewer.destroy();
  });

  it("keeps toolbar label overrides ahead of localized defaults", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      locale: "zh-CN",
      toolbar: {
        download: true,
        fullscreen: false,
        search: false,
        labels: { download: "保存副本" }
      },
      plugins: [
        {
          name: "localized-toolbar-override",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => container.textContent?.includes("hello.txt") === true);

    expect(container.querySelector('button[aria-label="保存副本"]')?.textContent).toBe("保存副本");

    viewer.destroy();
  });

  it("allows fallback messages to be customized", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["unknown"], { type: "application/octet-stream" }),
      fileName: "unknown.bin",
      locale: "en-US",
      messages: {
        unsupportedTitle: "No inline preview",
        downloadFile: "Save locally"
      }
    });

    await waitFor(() => container.textContent?.includes("No inline preview") === true);

    expect(container.textContent).toContain("Save locally");
    expect(container.textContent).not.toContain("Preview is not available for this file");
  });

  it("customizes toolbar labels, order, icons, and business actions", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const approve = vi.fn();
    const command = vi.fn();
    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: {
        zoom: true,
        rotate: false,
        fullscreen: false,
        print: false,
        search: false,
        labels: {
          download: "下载",
          "zoom-in": "放大"
        },
        titles: {
          download: "下载文件"
        },
        icons: {
          download: "<svg data-icon=\"download\" viewBox=\"0 0 24 24\"><path d=\"M12 3v12\" /></svg>"
        },
        order: ["download", "approve", "zoom-in"],
        actions: [
          {
            id: "approve",
            label: "审批",
            onClick(ctx) {
              approve(ctx.file?.name);
            }
          }
        ]
      },
      plugins: [
        {
          name: "commands",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            return { command, destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => container.textContent?.includes("hello.txt") === true);
    await waitFor(() => container.querySelector<HTMLButtonElement>('button[aria-label="放大"]')?.disabled === false);

    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".ofv-toolbar button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["下载", "审批", "放大"]);
    expect(buttons[0].getAttribute("aria-label")).toBe("下载文件");
    expect(buttons[0].querySelector("[data-icon='download']")).not.toBeNull();
    expect(buttons[0].querySelector<HTMLElement>(".ofv-toolbar-icon")?.hidden).toBe(false);
    expect(buttons[0].querySelector("path")?.getAttribute("d")).toBe("M12 3v12");

    buttons[1].click();
    expect(approve).toHaveBeenCalledWith("hello.txt");

    buttons[2].click();
    expect(command).toHaveBeenCalledWith("zoom-in");

    viewer.destroy();
  });

  it("sanitizes toolbar icon strings before rendering them", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: {
        zoom: false,
        rotate: false,
        fullscreen: false,
        print: false,
        search: false,
        icons: {
          download:
            '<svg data-icon="download" viewBox="0 0 24 24" onload="alert(1)"><script>alert(1)</script><foreignObject><button>bad</button></foreignObject><path d="M12 3v12" onclick="alert(2)" style="background:url(javascript:alert(3))" href="javascript:alert(4)" /></svg>'
        },
        order: ["download"]
      },
      plugins: [
        {
          name: "safe-icon",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => container.textContent?.includes("hello.txt") === true);

    const icon = container.querySelector(".ofv-toolbar-icon");
    const svg = icon?.querySelector("svg");
    const path = icon?.querySelector("path");
    expect(svg).not.toBeNull();
    expect(path?.getAttribute("d")).toBe("M12 3v12");
    expect(icon?.querySelector("script")).toBeNull();
    expect(icon?.querySelector("foreignObject")).toBeNull();
    expect(svg?.getAttribute("onload")).toBeNull();
    expect(path?.getAttribute("onclick")).toBeNull();
    expect(path?.getAttribute("style")).toBeNull();
    expect(path?.getAttribute("href")).toBeNull();

    viewer.destroy();
  });

  it("supports a fully custom toolbar renderer", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      files: [
        { file: new Blob(["one"], { type: "text/plain" }), fileName: "one.txt" },
        { file: new Blob(["two"], { type: "text/plain" }), fileName: "two.txt" }
      ],
      toolbar: {
        render(ctx) {
          const shell = document.createElement("div");
          shell.className = "business-toolbar";
          const label = document.createElement("span");
          label.textContent = `${ctx.index + 1}/${ctx.length}:${ctx.file?.name ?? ""}`;
          const next = document.createElement("button");
          next.type = "button";
          next.textContent = "下一份";
          next.disabled = !ctx.canNext;
          next.addEventListener("click", () => void ctx.next());
          shell.append(label, next);
          return shell;
        }
      },
      plugins: [
        {
          name: "text",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    await waitFor(() => container.querySelector(".business-toolbar")?.textContent?.includes("1/2:one.txt") === true);
    container.querySelector<HTMLButtonElement>(".business-toolbar button")?.click();
    await waitFor(() => container.querySelector(".business-toolbar")?.textContent?.includes("2/2:two.txt") === true);
    expect(container.querySelector<HTMLButtonElement>(".business-toolbar button")?.disabled).toBe(true);

    viewer.destroy();
  });

  it("exposes zoom state to custom toolbar renderers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    let zoom = 1;
    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: {
        render(ctx) {
          const shell = document.createElement("div");
          shell.className = "business-toolbar";
          const zoomLabel = document.createElement("span");
          zoomLabel.textContent = ctx.zoomLabel || "none";
          const zoomIn = document.createElement("button");
          zoomIn.type = "button";
          zoomIn.textContent = "放大";
          zoomIn.onclick = () => ctx.command("zoom-in");
          shell.append(zoomLabel, zoomIn);
          return shell;
        }
      },
      plugins: [
        {
          name: "custom-zoom-state",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = ctx.file.name;
            ctx.toolbar?.setZoom(zoom);
            return {
              canCommand: (command) => command === "zoom-in",
              command(command) {
                if (command === "zoom-in") {
                  zoom = 1.5;
                  ctx.toolbar?.setZoom(zoom);
                  return true;
                }
                return false;
              },
              destroy: vi.fn()
            };
          }
        }
      ]
    });

    await waitFor(() => container.querySelector(".business-toolbar")?.textContent?.includes("100%") === true);
    container.querySelector<HTMLButtonElement>(".business-toolbar button")?.click();
    await waitFor(() => container.querySelector(".business-toolbar")?.textContent?.includes("150%") === true);

    viewer.destroy();
  });

  it("keeps current queue item metadata when reloading a Blob", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const renderedNames: string[] = [];
    const plugin: PreviewPlugin = {
      name: "named",
      match: (file) => file.extension === "custom",
      render(ctx) {
        renderedNames.push(`${ctx.file.name}:${ctx.file.extension}:${ctx.file.mimeType}`);
        const content = document.createElement("div");
        content.textContent = ctx.file.name;
        ctx.viewport.append(content);
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      files: [
        {
          file: new Blob(["one"], { type: "application/octet-stream" }),
          fileName: "one.custom",
          mimeType: "application/x-custom"
        },
        {
          file: new Blob(["two"], { type: "application/octet-stream" }),
          fileName: "two.custom",
          mimeType: "application/x-custom"
        }
      ],
      plugins: [plugin]
    });

    await waitFor(() => renderedNames.length === 1);
    await viewer.next();
    await waitFor(() => renderedNames.length === 2);
    await viewer.reload(new Blob(["replacement"], { type: "application/octet-stream" }));
    await waitFor(() => renderedNames.length === 3);

    expect(renderedNames).toEqual([
      "one.custom:custom:application/x-custom",
      "two.custom:custom:application/x-custom",
      "two.custom:custom:application/x-custom"
    ]);

    viewer.destroy();
  });

  it("clears search highlights when navigating between queued files", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const plugin: PreviewPlugin = {
      name: "searchable",
      match: (file) => file.extension === "txt",
      render(ctx) {
        const content = document.createElement("p");
        content.textContent = ctx.file.name === "first.txt" ? "alpha alpha" : "beta only";
        ctx.viewport.append(content);
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      files: [
        { file: new Blob(["first"], { type: "text/plain" }), fileName: "first.txt" },
        { file: new Blob(["second"], { type: "text/plain" }), fileName: "second.txt" }
      ],
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => container.textContent?.includes("alpha alpha") === true);

    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search preview text"]');
    expect(searchInput).not.toBeNull();
    searchInput!.value = "alpha";
    searchInput!.dispatchEvent(new InputEvent("input", { bubbles: true }));

    await waitFor(() => container.querySelectorAll("mark.ofv-search-match").length === 2);
    expect(container.querySelector(".ofv-toolbar-search-count")?.textContent).toBe("2");

    await viewer.next();
    await waitFor(() => container.textContent?.includes("beta only") === true);

    expect(container.querySelectorAll("mark.ofv-search-match")).toHaveLength(0);
    expect(container.querySelector(".ofv-toolbar-search-count")?.textContent).toBe("");

    viewer.destroy();
  });

  it("ignores hidden preview text when searching", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const plugin: PreviewPlugin = {
      name: "hidden-search",
      match: () => true,
      render(ctx) {
        const visible = document.createElement("p");
        visible.className = "visible-source";
        visible.textContent = "visible needle";

        const hidden = document.createElement("section");
        hidden.className = "hidden-source";
        hidden.hidden = true;
        hidden.setAttribute("aria-hidden", "true");
        hidden.style.display = "none";
        const hiddenText = document.createElement("span");
        hiddenText.textContent = "hidden needle";
        hidden.append(hiddenText);

        ctx.viewport.append(visible, hidden);
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => container.textContent?.includes("visible needle") === true);

    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search preview text"]');
    expect(searchInput).not.toBeNull();
    searchInput!.value = "needle";
    searchInput!.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(container.querySelector(".ofv-toolbar-search-count")?.textContent).toBe("1");
    expect(container.querySelectorAll("mark.ofv-search-match")).toHaveLength(1);
    expect(container.querySelector(".visible-source mark.ofv-search-match")?.textContent).toBe("needle");
    expect(container.querySelector(".hidden-source mark.ofv-search-match")).toBeNull();

    searchInput!.value = "hidden";
    searchInput!.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(container.querySelector(".ofv-toolbar-search-count")?.textContent).toBe("0");
    expect(container.querySelectorAll("mark.ofv-search-match")).toHaveLength(0);

    viewer.destroy();
  });

  it("resets command support and zoom state when navigating between different preview types", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const destroyed: string[] = [];
    const commandLog: string[] = [];
    const plugin: PreviewPlugin = {
      name: "mixed-queue",
      match: (file) => file.extension === "img" || file.extension === "doc",
      render(ctx) {
        ctx.viewport.textContent = ctx.file.name;
        if (ctx.file.extension === "img") {
          ctx.toolbar?.setZoom(1);
          return {
            canCommand: (command) =>
              command === "zoom-in" || command === "zoom-out" || command === "zoom-reset" || command === "rotate-right",
            command(command) {
              commandLog.push(`${ctx.file.name}:${command}`);
              if (command === "zoom-in") {
                ctx.toolbar?.setZoom(1.5);
              }
              return true;
            },
            destroy() {
              destroyed.push(ctx.file.name);
            }
          };
        }

        return {
          canCommand: (command) => command === "zoom-in" || command === "zoom-out" || command === "zoom-reset",
          command(command) {
            commandLog.push(`${ctx.file.name}:${command}`);
            if (command === "zoom-in") {
              ctx.toolbar?.setZoom(1.25);
            }
            return true;
          },
          destroy() {
            destroyed.push(ctx.file.name);
          }
        };
      }
    };

    const viewer = createViewer({
      container,
      files: [
        { file: new Blob(["image"], { type: "application/octet-stream" }), fileName: "preview.img" },
        { file: new Blob(["doc"], { type: "application/octet-stream" }), fileName: "preview.doc" }
      ],
      toolbar: true,
      plugins: [plugin]
    });

    const zoomIn = () => container.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]');
    const zoomReset = () => container.querySelector<HTMLButtonElement>('button[aria-label="Reset zoom"]');
    const rotate = () => container.querySelector<HTMLButtonElement>('button[aria-label="Rotate right"]');

    await waitFor(() => container.textContent?.includes("preview.img") === true && rotate()?.disabled === false);
    zoomIn()?.click();
    await waitFor(() => zoomReset()?.textContent === "150%");
    rotate()?.click();
    expect(commandLog).toContain("preview.img:rotate-right");

    await viewer.next();
    await waitFor(() => container.textContent?.includes("preview.doc") === true && rotate()?.disabled === true);

    expect(zoomReset()?.textContent).toBe("100%");
    expect(zoomIn()?.disabled).toBe(false);
    expect(rotate()?.disabled).toBe(true);
    expect(destroyed).toContain("preview.img");

    zoomIn()?.click();
    await waitFor(() => zoomReset()?.textContent === "125%");
    rotate()?.click();

    expect(commandLog).toContain("preview.doc:zoom-in");
    expect(commandLog).not.toContain("preview.doc:rotate-right");

    viewer.destroy();
    expect(destroyed).toContain("preview.doc");
  });

  it("continues queued navigation when the previous preview destroy hook throws", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const plugin: PreviewPlugin = {
      name: "fragile-destroy",
      match: (file) => file.extension === "txt",
      render(ctx) {
        ctx.viewport.textContent = ctx.file.name;
        return {
          destroy() {
            if (ctx.file.name === "first.txt") {
              throw new Error("destroy failed");
            }
          }
        };
      }
    };

    const viewer = createViewer({
      container,
      files: [
        { file: new Blob(["first"], { type: "text/plain" }), fileName: "first.txt" },
        { file: new Blob(["second"], { type: "text/plain" }), fileName: "second.txt" }
      ],
      plugins: [plugin]
    });

    await waitFor(() => container.textContent?.includes("first.txt") === true);

    await expect(viewer.next()).resolves.toBeUndefined();
    await waitFor(() => container.textContent?.includes("second.txt") === true);

    expect(viewer.getCurrentIndex()).toBe(1);
    expect(consoleError).toHaveBeenCalledWith("Failed to destroy file preview instance:", expect.any(Error));

    viewer.destroy();
  });

  it("searches accessible iframe body text", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    const plugin: PreviewPlugin = {
      name: "iframe-search",
      match: () => true,
      render(ctx) {
        const iframe = document.createElement("iframe");
        ctx.viewport.append(iframe);
        const doc = iframe.contentDocument;
        if (doc) {
          doc.open();
          doc.write("<!doctype html><body><p>inside iframe text</p></body>");
          doc.close();
        }
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => Boolean(container.querySelector("iframe")?.contentDocument?.body?.textContent?.includes("inside")));

    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search preview text"]');
    searchInput!.value = "iframe";
    searchInput!.dispatchEvent(new InputEvent("input", { bubbles: true }));

    const iframeBody = container.querySelector("iframe")?.contentDocument?.body;
    await waitFor(() => iframeBody?.querySelectorAll("mark.ofv-search-match").length === 1);
    expect(container.querySelector(".ofv-toolbar-search-count")?.textContent).toBe("1");

    searchInput!.value = "";
    searchInput!.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(iframeBody?.querySelectorAll("mark.ofv-search-match")).toHaveLength(0);

    viewer.destroy();
  });

  it("downloads files from the toolbar and cleans temporary links", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const objectUrl = "blob:download";
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => objectUrl),
      revokeObjectURL: vi.fn()
    });

    const clicked: string[] = [];
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function click(this: HTMLAnchorElement) {
      clicked.push(`${this.href}:${this.download}`);
    });

    const plugin: PreviewPlugin = {
      name: "downloadable",
      match: () => true,
      render(ctx) {
        const content = document.createElement("div");
        content.textContent = ctx.file.name;
        ctx.viewport.append(content);
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-viewport")?.textContent?.includes("hello.txt")));
    container.querySelector<HTMLButtonElement>('button[aria-label="Download file"]')?.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual([`${objectUrl}:hello.txt`]);
    expect(document.body.querySelector(`a[href="${objectUrl}"]`)).not.toBeNull();

    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.body.querySelector(`a[href="${objectUrl}"]`)).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(objectUrl);

    viewer.destroy();
  });

  it("prints the current viewport from the toolbar", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const print = vi.fn();
    const focus = vi.fn();
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({ focus, print } as unknown as Window);

    const plugin: PreviewPlugin = {
      name: "printable",
      match: () => true,
      render(ctx) {
        const content = document.createElement("div");
        content.textContent = "print me";
        ctx.viewport.append(content);
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-viewport")?.textContent?.includes("print me")));
    container.querySelector<HTMLButtonElement>('button[aria-label="Print preview"]')?.click();

    await waitFor(() => print.mock.calls.length === 1);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".ofv-print-frame")).not.toBeNull();

    viewer.destroy();
  });

  it("prints DOCX pages at their document size without preview padding or scaling", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const print = vi.fn();
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue({
      focus: vi.fn(),
      print
    } as unknown as Window);

    const plugin: PreviewPlugin = {
      name: "docx-print",
      match: () => true,
      render(ctx) {
        const panel = document.createElement("div");
        panel.className = "ofv-panel ofv-office ofv-office-docx";
        const documentView = document.createElement("div");
        documentView.className = "ofv-docx-document";
        const wrapper = document.createElement("div");
        wrapper.className = "ofv-docx-wrapper";
        wrapper.style.setProperty("--ofv-docx-scale", "0.5");
        const pageFrame = document.createElement("div");
        pageFrame.className = "ofv-docx-page-frame";
        pageFrame.style.cssText = "width: 397px; height: 562px; margin-bottom: 30px";
        const page = document.createElement("section");
        page.className = "ofv-docx";
        page.style.cssText = "width: 794px; height: 1123px; transform: scale(0.5)";
        page.textContent = "DOCX page";
        pageFrame.append(page);
        wrapper.append(pageFrame);
        documentView.append(wrapper);
        panel.append(documentView);
        ctx.viewport.append(panel);
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["docx"]),
      fileName: "document.docx",
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-docx-page-frame")));
    container.querySelector<HTMLButtonElement>('button[aria-label="Print preview"]')?.click();
    await waitFor(() => print.mock.calls.length === 1);

    const printFrame = document.querySelector<HTMLIFrameElement>(".ofv-print-frame");
    const printDocument = printFrame?.contentDocument;
    const printStyles = Array.from(printDocument?.head.querySelectorAll("style") || [])
      .map((style) => style.textContent || "")
      .join("\n");
    expect(printStyles).toContain("size: 794px 1123px");
    expect(printStyles).toContain("--ofv-docx-scale: 1 !important");
    expect(printStyles).toContain(".ofv-docx-page-frame > section.ofv-docx");
    expect(printDocument?.querySelectorAll("section.ofv-docx")).toHaveLength(1);
    expect(container.querySelector<HTMLElement>(".ofv-docx-wrapper")?.style.getPropertyValue("--ofv-docx-scale")).toBe(
      "0.5"
    );

    viewer.destroy();
  });

  it("keeps the print iframe until the browser finishes printing", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const print = vi.fn();
    const printWindow = Object.assign(new EventTarget(), { focus: vi.fn(), print });
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue(printWindow as unknown as Window);

    const plugin: PreviewPlugin = {
      name: "print-cleanup",
      match: () => true,
      render(ctx) {
        ctx.viewport.textContent = "print cleanup";
        return { destroy: vi.fn() };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-viewport")?.textContent?.includes("print cleanup")));
    container.querySelector<HTMLButtonElement>('button[aria-label="Print preview"]')?.click();

    await waitFor(() => print.mock.calls.length === 1);
    expect(document.querySelector(".ofv-print-frame")).not.toBeNull();

    printWindow.dispatchEvent(new Event("afterprint"));
    await waitFor(() => document.querySelector(".ofv-print-frame") === null);

    viewer.destroy();
  });

  it("waits for lazy preview content before creating the print snapshot", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const print = vi.fn();
    const printWindow = Object.assign(new EventTarget(), { focus: vi.fn(), print });
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockReturnValue(printWindow as unknown as Window);

    let finishPreparation: (() => void) | undefined;
    const preparePrint = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPreparation = resolve;
        })
    );
    const plugin: PreviewPlugin = {
      name: "lazy-printable",
      match: () => true,
      render(ctx) {
        ctx.viewport.textContent = "loading pages";
        return {
          preparePrint: async () => {
            await preparePrint();
            ctx.viewport.textContent = "all pages ready";
          },
          destroy: vi.fn()
        };
      }
    };

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "lazy.txt",
      toolbar: true,
      plugins: [plugin]
    });

    await waitFor(() => container.querySelector(".ofv-viewport")?.textContent === "loading pages");
    container.querySelector<HTMLButtonElement>('button[aria-label="Print preview"]')?.click();

    await waitFor(() => preparePrint.mock.calls.length === 1);
    expect(print).not.toHaveBeenCalled();
    expect(document.querySelector(".ofv-print-frame")).toBeNull();

    finishPreparation?.();
    await waitFor(() => print.mock.calls.length === 1);

    const printFrame = document.querySelector<HTMLIFrameElement>(".ofv-print-frame");
    expect(printFrame?.contentDocument?.body.textContent).toContain("all pages ready");
    printWindow.dispatchEvent(new Event("afterprint"));
    viewer.destroy();
  });

  it("cleans auto theme listeners on destroy", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener,
        removeEventListener
      }))
    );

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      theme: "auto",
      plugins: [
        {
          name: "noop",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = "ok";
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    expect(container.classList.contains("ofv-theme-dark")).toBe(true);
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    viewer.destroy();

    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(container.classList.contains("ofv-theme-dark")).toBe(false);
  });

  it("falls back to window resize events when ResizeObserver is unavailable", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const OriginalResizeObserver = globalThis.ResizeObserver;
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    const resize = vi.fn();

    try {
      const viewer = createViewer({
        container,
        file: new Blob(["hello"], { type: "text/plain" }),
        fileName: "hello.txt",
        plugins: [
          {
            name: "resize",
            match: () => true,
            render(ctx) {
              ctx.viewport.textContent = "resizable";
              return { resize, destroy: vi.fn() };
            }
          }
        ]
      });

      await waitFor(() => Boolean(container.textContent?.includes("resizable")));
      window.dispatchEvent(new Event("resize"));

      expect(addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(resize).toHaveBeenCalled();

      viewer.destroy();

      expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    } finally {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: OriginalResizeObserver
      });
    }
  });

  it("supports legacy matchMedia listeners", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const addListener = vi.fn();
    const removeListener = vi.fn();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addListener,
        removeListener
      }))
    );

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      theme: "auto",
      plugins: [
        {
          name: "noop",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = "ok";
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    expect(addListener).toHaveBeenCalledWith(expect.any(Function));

    viewer.destroy();

    expect(removeListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it("ignores stale async renders when reloading quickly", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    let releaseSlowRender: (() => void) | undefined;
    const slowRender = new Promise<void>((resolve) => {
      releaseSlowRender = resolve;
    });

    const rendered: string[] = [];
    const viewer = createViewer({
      container,
      file: "https://example.com/slow.txt",
      toolbar: true,
      plugins: [
        {
          name: "remote-text",
          match: (file) => file.extension === "txt",
          async render(ctx) {
            if (ctx.file.name === "slow.txt") {
              await slowRender;
            }
            rendered.push(ctx.file.name);
            ctx.viewport.textContent = ctx.file.name;
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    await viewer.reload("https://example.com/fast.txt");
    await waitFor(() => container.textContent?.includes("fast.txt") === true);
    releaseSlowRender?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.textContent).toContain("fast.txt");
    expect(container.textContent).not.toContain("slow.txt");
    expect(rendered).toEqual(["fast.txt"]);

    viewer.destroy();
  });

  it("toggles fullscreen from the toolbar and reflects the active state", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement
    });
    const exitFullscreen = vi.fn(() => {
      fullscreenElement = null;
      return Promise.resolve();
    });
    (document as unknown as { exitFullscreen: () => Promise<void> }).exitFullscreen = exitFullscreen;

    try {
      const viewer = createViewer({
        container,
        file: new Blob(["hello"], { type: "text/plain" }),
        fileName: "hello.txt",
        toolbar: true,
        plugins: [
          {
            name: "fullscreen-text",
            match: () => true,
            render(ctx) {
              ctx.viewport.textContent = ctx.file.name;
              return { destroy: vi.fn() };
            }
          }
        ]
      });

      await waitFor(() => container.textContent?.includes("hello.txt") === true);

      const host = container.querySelector<HTMLElement>(".ofv-host")!;
      const requestFullscreen = vi.fn(() => {
        fullscreenElement = host;
        return Promise.resolve();
      });
      host.requestFullscreen = requestFullscreen;

      const button = container.querySelector<HTMLButtonElement>('button[aria-label="Open preview fullscreen"]');
      expect(button).not.toBeNull();
      expect(button?.textContent).toBe("Fullscreen");
      expect(button?.getAttribute("aria-pressed")).toBe("false");

      button?.click();
      expect(requestFullscreen).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new Event("fullscreenchange"));
      await waitFor(() => button?.getAttribute("aria-label") === "Exit fullscreen");
      expect(button?.textContent).toBe("Exit fullscreen");
      expect(button?.getAttribute("aria-pressed")).toBe("true");

      button?.click();
      expect(exitFullscreen).toHaveBeenCalledTimes(1);

      document.dispatchEvent(new Event("fullscreenchange"));
      await waitFor(() => button?.getAttribute("aria-label") === "Open preview fullscreen");
      expect(button?.textContent).toBe("Fullscreen");
      expect(button?.getAttribute("aria-pressed")).toBe("false");

      viewer.destroy();
    } finally {
      delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
      delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
    }
  });

  it("honors custom labels, titles, and icons for the exit-fullscreen state", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement
    });

    try {
      const viewer = createViewer({
        container,
        file: new Blob(["hello"], { type: "text/plain" }),
        fileName: "hello.txt",
        toolbar: {
          zoom: false,
          rotate: false,
          download: false,
          print: false,
          search: false,
          labels: { fullscreen: "全屏", "exit-fullscreen": "退出全屏" },
          titles: { fullscreen: "进入全屏", "exit-fullscreen": "退出全屏模式" }
        },
        plugins: [
          {
            name: "fullscreen-custom",
            match: () => true,
            render(ctx) {
              ctx.viewport.textContent = ctx.file.name;
              return { destroy: vi.fn() };
            }
          }
        ]
      });

      await waitFor(() => container.textContent?.includes("hello.txt") === true);

      const host = container.querySelector<HTMLElement>(".ofv-host")!;
      const button = container.querySelector<HTMLButtonElement>('button[aria-label="进入全屏"]');
      expect(button?.textContent).toBe("全屏");

      fullscreenElement = host;
      document.dispatchEvent(new Event("fullscreenchange"));

      await waitFor(() => button?.getAttribute("aria-label") === "退出全屏模式");
      expect(button?.textContent).toBe("退出全屏");

      viewer.destroy();
    } finally {
      delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
    }
  });

  it("exposes fullscreen state to custom toolbar renderers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement
    });

    try {
      const viewer = createViewer({
        container,
        file: new Blob(["hello"], { type: "text/plain" }),
        fileName: "hello.txt",
        toolbar: {
          render(ctx) {
            const shell = document.createElement("div");
            shell.className = "business-toolbar";
            shell.textContent = ctx.isFullscreen ? "fs:on" : "fs:off";
            return shell;
          }
        },
        plugins: [
          {
            name: "fullscreen-render",
            match: () => true,
            render(ctx) {
              ctx.viewport.textContent = ctx.file.name;
              return { destroy: vi.fn() };
            }
          }
        ]
      });

      await waitFor(() => container.querySelector(".business-toolbar")?.textContent === "fs:off");

      const host = container.querySelector<HTMLElement>(".ofv-host")!;
      fullscreenElement = host;
      document.dispatchEvent(new Event("fullscreenchange"));

      await waitFor(() => container.querySelector(".business-toolbar")?.textContent === "fs:on");

      viewer.destroy();
    } finally {
      delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
    }
  });

  it("removes the fullscreenchange listener on destroy", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const addEventListener = vi.spyOn(document, "addEventListener");
    const removeEventListener = vi.spyOn(document, "removeEventListener");

    const viewer = createViewer({
      container,
      file: new Blob(["hello"], { type: "text/plain" }),
      fileName: "hello.txt",
      toolbar: true,
      plugins: [
        {
          name: "fullscreen-listener",
          match: () => true,
          render(ctx) {
            ctx.viewport.textContent = "ok";
            return { destroy: vi.fn() };
          }
        }
      ]
    });

    expect(addEventListener).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));

    viewer.destroy();

    expect(removeEventListener).toHaveBeenCalledWith("fullscreenchange", expect.any(Function));
  });
});

function createTouchEvent(type: string, points: Array<[number, number]>): TouchEvent {
  const values = points.map(([clientX, clientY]) => ({ clientX, clientY })) as Touch[];
  const touches = Object.assign(values, {
    item(index: number) {
      return values[index] ?? null;
    }
  }) as unknown as TouchList;
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, "touches", { value: touches });
  return event;
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
