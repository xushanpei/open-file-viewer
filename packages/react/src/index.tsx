import { createViewer } from "@open-file-viewer/core";
import type { FileViewer as CoreFileViewer, PreviewOptions, PreviewTheme } from "@open-file-viewer/core";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";

export type FileViewerProps = Omit<PreviewOptions, "container"> & {
  className?: string;
  style?: CSSProperties;
};

export function FileViewer({
  className,
  style,
  width = "100%",
  height = "600px",
  ...options
}: FileViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CoreFileViewer | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    viewerRef.current?.destroy();
    viewerRef.current = createViewer({
      ...options,
      container: containerRef.current,
      width,
      height
    });

    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [
    options.file,
    options.files,
    options.fileName,
    options.mimeType,
    options.fit,
    options.toolbar,
    options.theme,
    width,
    height
  ]);

  return <div ref={containerRef} className={className} style={style} />;
}

export type { CoreFileViewer, PreviewOptions, PreviewTheme };
