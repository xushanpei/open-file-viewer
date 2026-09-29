import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewContext } from "../types";
import type { CadBinaryPreviewContext } from "./cad";
import { renderWebglDwgPreview, type WebglDwgPreviewOptions } from "./cad-webgl";

describe("WebGL DWG engine loading", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("loads the optional engine through the host-provided loader", async () => {
    const camera = {
      zoom: 1,
      updateProjectionMatrix: vi.fn()
    };
    const view = {
      internalCamera: camera,
      isDirty: false,
      zoomToFitDrawing: vi.fn()
    };
    const manager = {
      areWorkersReady: vi.fn(async () => true),
      openDocument: vi.fn(async () => true),
      curView: view,
      destroy: vi.fn(async () => undefined)
    };
    const createInstance = vi.fn(() => manager);
    const engineLoader = vi.fn(async () => ({
      AcApDocManager: { createInstance },
      AcEdOpenMode: { Read: "read" },
      AcApOpenViewMode: { Extents: "extents" }
    }));
    const context = createContext();

    const instance = await renderWebglDwgPreview(context, {
      workerBaseUrl: "/vendor/cad-engine/",
      engineLoader
    });

    expect(engineLoader).toHaveBeenCalledTimes(1);
    expect(createInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        container: context.panel.querySelector(".ofv-dwg-webgl-stage"),
        busyIndicatorHost: context.panel.querySelector(".ofv-dwg-webgl-preview"),
        webworkerFileUrls: {
          dwgParser: expect.stringMatching(/\/vendor\/cad-engine\/libredwg-parser-worker\.js$/),
          mtextRender: expect.stringMatching(/\/vendor\/cad-engine\/mtext-renderer-worker\.js$/)
        }
      })
    );
    expect(manager.openDocument).toHaveBeenCalledWith(
      "drawing.dwg",
      expect.any(ArrayBuffer),
      expect.objectContaining({ mode: "read", openViewMode: "extents" })
    );
    expect(context.preview.setLoading).toHaveBeenCalledWith(false);
    expect(vi.mocked(context.preview.setLoading).mock.invocationCallOrder[0]).toBeLessThan(
      manager.openDocument.mock.invocationCallOrder[0]
    );
    expect(context.panel.querySelector(".ofv-dwg-webgl-status")).toBeNull();
    expect(instance.command?.("zoom-in")).toBe(true);
    expect(camera.zoom).toBeCloseTo(1.22);
    expect(context.preview.toolbar?.setZoom).toHaveBeenLastCalledWith(1.22);

    instance.destroy();
    expect(manager.destroy).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid engine loader with an actionable error", async () => {
    const context = createContext();

    await expect(
      renderWebglDwgPreview(context, {
        workerBaseUrl: "/vendor/cad-engine",
        engineLoader: async () => ({})
      })
    ).rejects.toThrow("configured WebGL DWG engine module is invalid");

    expect(context.panel.querySelector(".ofv-dwg-webgl-preview")).toBeNull();
  });

  it("reports the required loader to untyped callers", async () => {
    const context = createContext();

    await expect(
      renderWebglDwgPreview(context, { workerBaseUrl: "/vendor/cad-engine" } as WebglDwgPreviewOptions)
    ).rejects.toThrow("webglDwg.engineLoader");
  });
});

function createContext(): CadBinaryPreviewContext {
  const panel = document.createElement("div");
  document.body.append(panel);
  return {
    panel,
    fileName: "drawing.dwg",
    extension: "dwg",
    arrayBuffer: new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x32, 0x37]).buffer,
    bytes: new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x32, 0x37]),
    preview: {
      setLoading: vi.fn(),
      toolbar: {
        setZoom: vi.fn()
      }
    } as unknown as PreviewContext
  };
}
