import { render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewPlugin } from "@open-file-viewer/core";
import OpenFileViewer from "../src/OpenFileViewer.svelte";
import ToolbarHarness from "./ToolbarHarness.test.svelte";

describe("OpenFileViewer Svelte adapter", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("recreates the core viewer when plugins change", async () => {
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    const firstPlugin = createPlugin("first", firstDestroy);
    const secondPlugin = createPlugin("second", secondDestroy);

    const view = render(OpenFileViewer, {
      props: {
        file: new Blob(["demo"], { type: "text/plain" }),
        fileName: "demo.txt",
        plugins: [firstPlugin]
      }
    });

    expect(await screen.findByText("first:demo.txt")).toBeTruthy();

    await view.rerender({
      file: new Blob(["demo"], { type: "text/plain" }),
      fileName: "demo.txt",
      plugins: [secondPlugin]
    });

    await waitFor(() => expect(firstDestroy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("second:demo.txt")).toBeTruthy();

    view.unmount();
    expect(secondDestroy).toHaveBeenCalledTimes(1);
  });

  it("passes fallback callbacks through to the core viewer", async () => {
    const unsupported = vi.fn();

    render(OpenFileViewer, {
      props: {
        file: new Blob(["unknown"], { type: "application/octet-stream" }),
        fileName: "unknown.bin",
        fallback: "inline",
        onUnsupported: unsupported
      }
    });

    await waitFor(() => expect(unsupported).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("当前文件暂不支持在线预览")).toBeTruthy();
  });

  it("passes locale and messages through to the core viewer", async () => {
    render(OpenFileViewer, {
      props: {
        file: new Blob(["unknown"], { type: "application/octet-stream" }),
        fileName: "unknown.bin",
        fallback: "inline",
        locale: "en-US",
        messages: {
          unsupportedTitle: "No preview available"
        }
      }
    });

    expect(await screen.findByText("No preview available")).toBeTruthy();
    expect(await screen.findByText("Download file")).toBeTruthy();
  });

  it("applies and cleans the className style hook", async () => {
    const view = render(OpenFileViewer, {
      props: {
        file: new Blob(["demo"], { type: "text/plain" }),
        fileName: "demo.txt",
        plugins: [createPlugin("styled", vi.fn())],
        className: "viewer-shell"
      }
    });

    expect(await screen.findByText("styled:demo.txt")).toBeTruthy();

    const root = view.container.firstElementChild as HTMLElement;
    expect(root.classList.contains("viewer-shell")).toBe(true);
    expect(root.classList.contains("ofv-root")).toBe(true);

    view.unmount();
    expect(root.classList.contains("viewer-shell")).toBe(false);
  });

  it("renders a custom toolbar through the toolbar slot", async () => {
    const view = render(ToolbarHarness, {
      props: {
        files: [
          { file: new Blob(["one"], { type: "text/plain" }), fileName: "one.txt" },
          { file: new Blob(["two"], { type: "text/plain" }), fileName: "two.txt" }
        ],
        plugins: [createPlugin("slot", vi.fn())]
      }
    });

    const button = (await screen.findByRole("button", { name: "1/2 one.txt" })) as HTMLButtonElement;
    button.click();

    await waitFor(() => {
      const nextButton = screen.getByRole("button", { name: "2/2 two.txt" }) as HTMLButtonElement;
      expect(nextButton.disabled).toBe(true);
    });

    view.unmount();
  });
});

function createPlugin(name: string, destroy: () => void): PreviewPlugin {
  return {
    name,
    match: () => true,
    render(ctx) {
      const element = document.createElement("div");
      element.textContent = `${name}:${ctx.file.name}`;
      ctx.viewport.append(element);
      return { destroy };
    }
  };
}
