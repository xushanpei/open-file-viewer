/// <reference path="../shims-heic.d.ts" />
import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin, PreviewSize } from "../types";

const imageExtensions = new Set([
  "jpg",
  "jpeg",
  "jfif",
  "pjpe",
  "pjpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "jxl",
  "svg",
  "bmp",
  "ico",
  "cur",
  "tif",
  "tiff",
  "apng",
  "heic",
  "heif"
]);
const nonRasterImageExtensions = new Set(["dxf"]);
const nonRasterImageMimeTypes = new Set(["image/vnd.dxf", "image/vnd.adobe.photoshop"]);
const heicMimeTypes = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

export function imagePlugin(): PreviewPlugin {
  return {
    name: "image",
    match(file) {
      if (nonRasterImageExtensions.has(file.extension) || nonRasterImageMimeTypes.has(file.mimeType)) {
        return false;
      }
      return file.mimeType.startsWith("image/") || imageExtensions.has(file.extension);
    },
    async render(ctx) {
      const ext = ctx.file.extension.toLowerCase();
      const isHeic = ext === "heic" || ext === "heif" || heicMimeTypes.has(ctx.file.mimeType.toLowerCase());

      let url = "";
      let convertedBlob: Blob | null = null;
      let isExternal = Boolean(ctx.file.url);

      if (isHeic) {
        ctx.setLoading(true);
        try {
          let blob = ctx.file.blob;
          if (!blob && typeof ctx.file.source === "string") {
            const res = await fetch(ctx.file.source);
            if (!res.ok) {
              throw new Error(`Failed to fetch HEIC file: ${res.status}`);
            }
            blob = await res.blob();
          }
          if (!blob) {
            throw new Error("HEIC file source cannot be resolved to a Blob.");
          }

          const heic2anyModule = await import("heic2any");
          const heic2any = heic2anyModule.default || heic2anyModule;
          const converted = await heic2any({
            blob,
            toType: "image/jpeg",
            quality: 0.8
          });

          convertedBlob = Array.isArray(converted) ? converted[0] : converted;
          url = URL.createObjectURL(convertedBlob);
          isExternal = false;
        } catch (err: any) {
          console.error("HEIC image conversion failed:", err);
          // Fallback to raw object URL
          url = createObjectUrl(ctx.file);
          isExternal = Boolean(ctx.file.url);
        } finally {
          ctx.setLoading(false);
        }
      } else {
        url = createObjectUrl(ctx.file);
      }

      const wrapper = document.createElement("div");
      wrapper.className = "ofv-image-viewer";

      const showInlineControls = !ctx.options.toolbar;
      const controls = document.createElement("div");
      controls.className = "ofv-image-controls";

      const stage = document.createElement("div");
      stage.className = "ofv-image-stage";

      const image = document.createElement("img");
      image.className = "ofv-media ofv-image-content";
      image.alt = ctx.file.name;
      image.draggable = false;
      image.src = url;
      image.style.objectFit = objectFit(ctx.options.fit);

      let scale = 1;
      let rotation = 0;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let startOffsetX = 0;
      let startOffsetY = 0;

      const zoomLabel = document.createElement("span");
      zoomLabel.className = "ofv-image-zoom";

      const updateTransform = () => {
        image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotation}deg)`;
        zoomLabel.textContent = `${Math.round(scale * 100)}%`;
      };

      const showImageFallback = () => {
        stage.replaceChildren(createImageFallback(ctx.file.name, url));
      };

      const setScale = (nextScale: number) => {
        scale = Math.min(8, Math.max(0.1, nextScale));
        updateTransform();
      };

      const reset = () => {
        scale = 1;
        rotation = 0;
        offsetX = 0;
        offsetY = 0;
        updateTransform();
      };

      const addButton = (label: string, title: string, action: () => void) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        button.addEventListener("click", action);
        controls.append(button);
        return () => button.removeEventListener("click", action);
      };

      const disposers = showInlineControls
        ? [
            addButton("-", "Zoom out", () => setScale(scale - 0.25)),
            addButton("+", "Zoom in", () => setScale(scale + 0.25)),
            addButton("Rotate", "Rotate image", () => {
              rotation += 90;
              updateTransform();
            }),
            addButton("Reset", "Reset image view", reset)
          ]
        : [];
      if (showInlineControls) {
        controls.append(zoomLabel);
      }

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) {
          return;
        }
        dragging = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
        stage.classList.add("is-dragging");
        stage.setPointerCapture(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) {
          return;
        }
        offsetX = startOffsetX + event.clientX - dragStartX;
        offsetY = startOffsetY + event.clientY - dragStartY;
        updateTransform();
      };

      const onPointerUp = (event: PointerEvent) => {
        dragging = false;
        stage.classList.remove("is-dragging");
        if (stage.hasPointerCapture(event.pointerId)) {
          stage.releasePointerCapture(event.pointerId);
        }
      };

      const onWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        event.preventDefault();
        setScale(scale + (event.deltaY > 0 ? -0.1 : 0.1));
      };

      stage.addEventListener("pointerdown", onPointerDown);
      stage.addEventListener("pointermove", onPointerMove);
      stage.addEventListener("pointerup", onPointerUp);
      stage.addEventListener("pointercancel", onPointerUp);
      stage.addEventListener("wheel", onWheel, { passive: false });
      image.addEventListener("error", showImageFallback);

      stage.append(image);
      wrapper.append(...(showInlineControls ? [controls, stage] : [stage]));
      ctx.viewport.append(wrapper);
      updateTransform();

      return {
        canCommand(command) {
          return (
            command === "zoom-in" ||
            command === "zoom-out" ||
            command === "zoom-reset" ||
            command === "rotate-right" ||
            command === "rotate-left"
          );
        },
        command(command) {
          if (command === "zoom-in") {
            setScale(scale + 0.25);
            return true;
          }
          if (command === "zoom-out") {
            setScale(scale - 0.25);
            return true;
          }
          if (command === "zoom-reset") {
            reset();
            return true;
          }
          if (command === "rotate-right") {
            rotation += 90;
            updateTransform();
            return true;
          }
          if (command === "rotate-left") {
            rotation -= 90;
            updateTransform();
            return true;
          }
          return false;
        },
        resize(size: PreviewSize) {
          image.style.maxWidth = `${size.width}px`;
          image.style.maxHeight = `${Math.max(0, size.height - controls.offsetHeight)}px`;
        },
        destroy() {
          for (const dispose of disposers) {
            dispose();
          }
          stage.removeEventListener("pointerdown", onPointerDown);
          stage.removeEventListener("pointermove", onPointerMove);
          stage.removeEventListener("pointerup", onPointerUp);
          stage.removeEventListener("pointercancel", onPointerUp);
          stage.removeEventListener("wheel", onWheel);
          image.removeEventListener("error", showImageFallback);
          wrapper.remove();
          if (convertedBlob) {
            URL.revokeObjectURL(url);
          } else {
            revokeObjectUrl(url, isExternal);
          }
        }
      };
    }
  };
}

function createImageFallback(fileName: string, url: string): HTMLElement {
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";

  const title = document.createElement("strong");
  title.textContent = "图片预览失败";

  const meta = document.createElement("span");
  meta.textContent = "当前浏览器无法直接显示该图片，文件可能已损坏或编码暂不受支持。";

  const download = document.createElement("a");
  download.href = url;
  download.download = fileName;
  download.textContent = "下载图片";

  fallback.append(title, meta, download);
  return fallback;
}

function objectFit(fit: string): string {
  if (fit === "cover") {
    return "cover";
  }
  if (fit === "actual") {
    return "none";
  }
  if (fit === "scale-down") {
    return "scale-down";
  }
  return "contain";
}
