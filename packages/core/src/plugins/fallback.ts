import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin } from "../types";

export function fallbackPlugin(): PreviewPlugin {
  return {
    name: "fallback",
    match() {
      return true;
    },
    render(ctx) {
      ctx.options.onUnsupported?.(ctx.file);
      if (ctx.options.fallback === "custom" && ctx.options.renderFallback) {
        return ctx.options.renderFallback(ctx);
      }

      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      const panel = document.createElement("div");
      panel.className = "ofv-fallback";

      const title = document.createElement("strong");
      title.textContent =
        ctx.options.fallback === "download"
          ? ctx.options.messages.downloadTitle
          : ctx.options.messages.unsupportedTitle;

      const meta = createFallbackMeta(ctx.file, ctx.options.messages);

      const download = document.createElement("a");
      download.href = url;
      download.download = ctx.file.name;
      download.textContent = ctx.options.messages.downloadFile;

      panel.append(title, meta, download);
      ctx.viewport.classList.add("ofv-center");
      ctx.viewport.append(panel);

      if (ctx.options.fallback === "download") {
        download.focus();
      }

      return {
        destroy() {
          ctx.viewport.classList.remove("ofv-center");
          revokeObjectUrl(url, isExternal);
        }
      };
    }
  };
}

function createFallbackMeta(
  file: { name: string; extension: string; mimeType: string; size?: number; url?: string },
  messages: {
    file: string;
    unnamedFile: string;
    format: string;
    unknown: string;
    mime: string;
    undeclared: string;
    size: string;
    source: string;
    remoteUrl: string;
    localFile: string;
  }
): HTMLElement {
  const meta = document.createElement("dl");
  meta.className = "ofv-fallback-meta";
  appendFallbackMeta(meta, messages.file, file.name || messages.unnamedFile);
  appendFallbackMeta(meta, messages.format, file.extension ? `.${file.extension}` : messages.unknown);
  appendFallbackMeta(meta, messages.mime, file.mimeType || messages.undeclared);
  appendFallbackMeta(meta, messages.size, file.size === undefined ? messages.unknown : formatFallbackBytes(file.size));
  appendFallbackMeta(meta, messages.source, file.url ? messages.remoteUrl : messages.localFile);
  return meta;
}

function appendFallbackMeta(parent: HTMLElement, label: string, value: string): void {
  const key = document.createElement("dt");
  key.textContent = label;
  const content = document.createElement("dd");
  content.textContent = value;
  parent.append(key, content);
}

function formatFallbackBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
