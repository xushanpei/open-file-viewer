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
    const toolbar =
      renderToolbar === undefined
        ? options.toolbar
        : {
            ...(typeof options.toolbar === "object" ? options.toolbar : {}),
            render(ctx: PreviewToolbarRenderContext) {
              toolbarRoot?.unmount();
              const mount = document.createElement("div");
              mount.className = "ofv-react-toolbar";
              toolbarRoot = createRoot(mount);
              toolbarRoot.render(renderToolbar(ctx));
              return mount;
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
      toolbarRoot?.unmount();
      toolbarRoot = null;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [
    options.file,
    options.files,
    options.fileName,
    options.mimeType,
    options.fit,
    options.plugins,
    options.fallback,
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
