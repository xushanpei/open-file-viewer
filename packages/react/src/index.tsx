import { createViewer } from "@open-file-viewer/core";
import type {
  FileViewer as CoreFileViewer,
  PreviewOptions,
  PreviewTheme,
  PreviewToolbarRenderContext
} from "@open-file-viewer/core";
import type { CSSProperties, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef } from "react";

export type FileViewerProps = Omit<PreviewOptions, "container"> & {
  className?: string;
  style?: CSSProperties;
  renderToolbar?: (ctx: PreviewToolbarRenderContext) => ReactNode;
};

export function FileViewer({
  className,
  style,
  width = "100%",
  height = "600px",
  renderToolbar,
  ...options
}: FileViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CoreFileViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let toolbarRoot: Root | null = null;
    let toolbarMount: HTMLDivElement | null = null;
    const toolbar =
      renderToolbar === undefined
        ? options.toolbar
        : {
            ...(typeof options.toolbar === "object" ? options.toolbar : {}),
            render(ctx: PreviewToolbarRenderContext) {
              if (!toolbarMount) {
                toolbarMount = document.createElement("div");
                toolbarMount.className = "ofv-react-toolbar";
                toolbarRoot = createRoot(toolbarMount);
              }
              toolbarRoot?.render(renderToolbar(ctx));
              return toolbarMount;
            }
          };

    viewerRef.current?.destroy();
    viewerRef.current = createViewer({
      ...options,
      container: containerRef.current,
      width,
      height,
      className,
      toolbar
    });

    return () => {
      const root = toolbarRoot;
      toolbarRoot = null;
      toolbarMount = null;
      viewerRef.current?.destroy();
      viewerRef.current = null;
      if (root) {
        queueMicrotask(() => root.unmount());
      }
    };
  }, [
    options.file,
    options.files,
    options.fileName,
    options.mimeType,
    options.fit,
    options.plugins,
    options.fallback,
    options.locale,
    options.messages,
    options.renderFallback,
    options.toolbar,
    renderToolbar,
    options.theme,
    options.onLoad,
    options.onError,
    options.onUnsupported,
    className,
    width,
    height
  ]);

  return <div ref={containerRef} className={className} style={style} />;
}

export type { CoreFileViewer, PreviewOptions, PreviewTheme, PreviewToolbarRenderContext };
