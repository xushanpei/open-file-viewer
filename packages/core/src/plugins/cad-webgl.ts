import type { PreviewCommand, PreviewInstance } from "../types";
import type { CadBinaryPreviewContext } from "./cad";

export interface WebglDwgPreviewOptions {
  /** Directory containing the DWG parser and MTEXT worker bundles. */
  workerBaseUrl: string;
  /**
   * Loads the optional WebGL CAD engine.
   *
   * Keeping this import in the host application lets strict bundlers resolve
   * the peer only when WebGL DWG preview is enabled.
   *
   * @example `() => import("@mlightcad/cad-simple-viewer")`
   */
  engineLoader: WebglDwgEngineLoader;
  /** Optional base URL for CAD fonts and other runtime resources. */
  baseUrl?: string;
  /**
   * Skip loading the engine's default font set. Defaults to false.
   *
   * Mapped to the engine's inverted `preloadDefaultFonts` option, which replaced
   * `notLoadDefaultFonts` in `@mlightcad/cad-simple-viewer` 1.5.10. Keeping this
   * name preserves the public API and the 1.5.9 eager-preload behavior.
   */
  notLoadDefaultFonts?: boolean;
  /** Verify both worker URLs before opening a drawing. Defaults to true. */
  checkWorkers?: boolean;
  /** Paint converted entities incrementally while parsing. Defaults to true. */
  progressiveRendering?: boolean;
  /** Render converted entities on the main thread. Defaults to false. */
  useMainThreadDraw?: boolean;
}

export type WebglDwgEngineLoader = () => Promise<unknown>;

type CadEngineModule = typeof import("@mlightcad/cad-simple-viewer");

const engineModulePromises = new WeakMap<WebglDwgEngineLoader, Promise<CadEngineModule>>();
let pendingDestroy: Promise<void> = Promise.resolve();

function loadCadEngine(engineLoader: WebglDwgEngineLoader | undefined): Promise<CadEngineModule> {
  if (!engineLoader) {
    throw new Error(
      'WebGL DWG preview requires webglDwg.engineLoader, for example () => import("@mlightcad/cad-simple-viewer").'
    );
  }

  let engineModulePromise = engineModulePromises.get(engineLoader);
  if (!engineModulePromise) {
    engineModulePromise = engineLoader().then(resolveCadEngineModule);
    engineModulePromises.set(engineLoader, engineModulePromise);
  }
  return engineModulePromise;
}

export async function renderWebglDwgPreview(
  ctx: CadBinaryPreviewContext,
  options: WebglDwgPreviewOptions
): Promise<PreviewInstance> {
  await pendingDestroy.catch(() => undefined);

  const shell = document.createElement("div");
  shell.className = "ofv-dwg-webgl-preview";

  const stage = document.createElement("div");
  stage.className = "ofv-dwg-webgl-stage";

  shell.append(stage);
  ctx.panel.append(shell);

  let manager: ReturnType<CadEngineModule["AcApDocManager"]["createInstance"]>;
  try {
    const engine = await loadCadEngine(options.engineLoader);
    const workerBaseUrl = normalizeBaseUrl(options.workerBaseUrl);
    const workerUrls = {
      dwgParser: resolveRuntimeUrl(`${workerBaseUrl}/libredwg-parser-worker.js`),
      mtextRender: resolveRuntimeUrl(`${workerBaseUrl}/mtext-renderer-worker.js`)
    };

    manager = engine.AcApDocManager.createInstance({
      container: stage,
      autoResize: true,
      baseUrl: options.baseUrl,
      busyIndicatorHost: shell,
      builtinOpenFileDialog: false,
      preloadDefaultFonts: !(options.notLoadDefaultFonts ?? false),
      useMainThreadDraw: options.useMainThreadDraw ?? false,
      webworkerFileUrls: workerUrls
    });
    if (!manager) {
      throw new Error("CAD rendering engine could not be initialized.");
    }

    if ((options.checkWorkers ?? true) && !(await manager.areWorkersReady())) {
      throw new Error("DWG worker resources are unavailable.");
    }

    ctx.preview.setLoading(false);
    const opened = await manager.openDocument(ctx.fileName, ctx.arrayBuffer.slice(0), {
      mode: engine.AcEdOpenMode.Read,
      openViewMode: engine.AcApOpenViewMode.Extents,
      progressiveRendering: options.progressiveRendering ?? true
    });
    if (!opened) {
      throw new Error("The DWG document could not be opened.");
    }

    manager.curView.zoomToFitDrawing();
    ctx.preview.toolbar?.setZoom(1);
  } catch (error) {
    if (manager) {
      await manager.destroy().catch(() => undefined);
    }
    shell.remove();
    throw error instanceof Error ? error : new Error("DWG WebGL preview failed.");
  }

  const activeManager = manager;
  let destroyed = false;
  let toolbarZoom = 1;

  function zoom(factor: number): void {
    const view = activeManager.curView;
    const camera = view.internalCamera;
    camera.zoom = clamp(camera.zoom * factor, 0.02, 64);
    camera.updateProjectionMatrix();
    view.isDirty = true;
    toolbarZoom = clamp(toolbarZoom * factor, 0.02, 64);
    ctx.preview.toolbar?.setZoom(toolbarZoom);
  }

  return {
    resize() {
      activeManager.curView.isDirty = true;
    },
    canCommand(command: PreviewCommand) {
      return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
    },
    command(command: PreviewCommand) {
      if (command === "zoom-in") {
        zoom(1.22);
        return true;
      }
      if (command === "zoom-out") {
        zoom(1 / 1.22);
        return true;
      }
      if (command === "zoom-reset") {
        activeManager.curView.zoomToFitDrawing();
        toolbarZoom = 1;
        ctx.preview.toolbar?.setZoom(toolbarZoom);
        return true;
      }
      return false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ctx.preview.toolbar?.setZoom(undefined);
      shell.remove();
      pendingDestroy = activeManager.destroy().catch((error) => {
        console.warn("Failed to release the DWG WebGL preview.", error);
      });
    }
  };
}

function resolveCadEngineModule(value: unknown): CadEngineModule {
  const engine = value as Partial<CadEngineModule> | null;
  if (!engine?.AcApDocManager || !engine.AcEdOpenMode || !engine.AcApOpenViewMode) {
    throw new Error("The configured WebGL DWG engine module is invalid.");
  }
  return engine as CadEngineModule;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveRuntimeUrl(value: string): string {
  return new URL(value, document.baseURI).href;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
