/// <reference path="../shims-heic.d.ts" />
import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin, PreviewSize } from "../types";
import { getInitialZoom } from "./utils";

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
      const isTiff = ext === "tif" || ext === "tiff" || ctx.file.mimeType.toLowerCase() === "image/tiff";
      const sourceBytesPromise = readImageBytes(ctx.file);

      let url = "";
      let convertedBlob: Blob | null = null;
      let isExternal = Boolean(ctx.file.url);
      let canvasSource: HTMLCanvasElement | null = null;

      if (isTiff) {
        ctx.setLoading(true);
        try {
          const bytes = await sourceBytesPromise;
          canvasSource = await createTiffCanvas(bytes);
        } catch (err: any) {
          console.error("TIFF image conversion failed:", err);
          url = createObjectUrl(ctx.file);
        } finally {
          ctx.setLoading(false);
        }
      } else if (isHeic) {
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
      const infoBar = createImageInfoBar(await sourceBytesPromise, ext, ctx.file.mimeType, ctx.file.name);
      infoBar.hidden = true;
      infoBar.setAttribute("aria-hidden", "true");
      infoBar.style.display = "none";

      const image = document.createElement("img");
      image.className = "ofv-media ofv-image-content";
      image.alt = ctx.file.name;
      image.draggable = false;
      image.style.objectFit = objectFit(ctx.options.fit);
      if (url) {
        image.src = url;
      }

      const visual: HTMLElement = canvasSource || image;
      if (canvasSource) {
        canvasSource.classList.add("ofv-media", "ofv-image-content", "ofv-tiff-canvas");
        canvasSource.setAttribute("role", "img");
        canvasSource.setAttribute("aria-label", ctx.file.name);
      }

      let scale = getInitialZoom(ctx);
      let rotation = 0;
      let offsetX = 0;
      let offsetY = 0;
      let dragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let startOffsetX = 0;
      let startOffsetY = 0;
      let activePointerId: number | null = null;
      let previewAvailable = true;

      const zoomLabel = document.createElement("span");
      zoomLabel.className = "ofv-image-zoom";

      const updateTransform = () => {
        visual.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotation}deg)`;
        zoomLabel.textContent = `${Math.round(scale * 100)}%`;
        ctx.toolbar?.setZoom(previewAvailable ? scale : undefined);
      };

      const showImageFallback = () => {
        previewAvailable = false;
        ctx.toolbar?.setZoom(undefined);
        infoBar.hidden = false;
        infoBar.removeAttribute("aria-hidden");
        infoBar.style.removeProperty("display");
        stage.replaceChildren(createImageFallback(ctx.file.name, url));
        ctx.toolbar?.refreshCommandSupport();
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
        if (activePointerId !== null && activePointerId !== event.pointerId) {
          finishDrag(activePointerId);
        }
        dragging = true;
        activePointerId = event.pointerId;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
        stage.classList.add("is-dragging");
        try {
          stage.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture can fail if the pointer was already released by the browser.
        }
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!dragging || event.pointerId !== activePointerId) {
          return;
        }
        offsetX = startOffsetX + event.clientX - dragStartX;
        offsetY = startOffsetY + event.clientY - dragStartY;
        updateTransform();
      };

      const finishDrag = (pointerId?: number | null) => {
        const captureId = pointerId ?? activePointerId;
        dragging = false;
        activePointerId = null;
        stage.classList.remove("is-dragging");
        if (captureId !== null && captureId !== undefined) {
          try {
            if (stage.hasPointerCapture(captureId)) {
              stage.releasePointerCapture(captureId);
            }
          } catch {
            // Ignore stale pointer ids.
          }
        }
      };

      const onPointerUp = (event: PointerEvent) => {
        if (event.pointerId === activePointerId) {
          finishDrag(event.pointerId);
        }
      };

      const onLostPointerCapture = (event: PointerEvent) => {
        if (event.pointerId === activePointerId) {
          finishDrag(null);
        }
      };

      const onPointerLeave = (event: PointerEvent) => {
        if (event.pointerId === activePointerId && event.buttons === 0) {
          finishDrag(event.pointerId);
        }
      };

      const onWindowBlur = () => {
        finishDrag();
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
      stage.addEventListener("lostpointercapture", onLostPointerCapture);
      stage.addEventListener("pointerleave", onPointerLeave);
      stage.addEventListener("wheel", onWheel, { passive: false });
      if (!canvasSource) {
        image.addEventListener("error", showImageFallback);
      }
      window.addEventListener("blur", onWindowBlur);

      stage.append(visual);
      wrapper.append(...(showInlineControls ? [controls, stage, infoBar] : [stage, infoBar]));
      ctx.viewport.append(wrapper);
      updateTransform();

      return {
        canCommand(command) {
          return (
            previewAvailable &&
            (command === "zoom-in" ||
              command === "zoom-out" ||
              command === "zoom-reset" ||
              command === "rotate-right" ||
              command === "rotate-left")
          );
        },
        command(command) {
          if (!previewAvailable) {
            return false;
          }
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
          visual.style.maxWidth = `${size.width}px`;
          visual.style.maxHeight = `${Math.max(0, size.height - controls.offsetHeight)}px`;
        },
        destroy() {
          ctx.toolbar?.setZoom(undefined);
          for (const dispose of disposers) {
            dispose();
          }
          stage.removeEventListener("pointerdown", onPointerDown);
          stage.removeEventListener("pointermove", onPointerMove);
          stage.removeEventListener("pointerup", onPointerUp);
          stage.removeEventListener("pointercancel", onPointerUp);
          stage.removeEventListener("lostpointercapture", onLostPointerCapture);
          stage.removeEventListener("pointerleave", onPointerLeave);
          stage.removeEventListener("wheel", onWheel);
          image.removeEventListener("error", showImageFallback);
          window.removeEventListener("blur", onWindowBlur);
          finishDrag();
          wrapper.remove();
          if (convertedBlob) {
            URL.revokeObjectURL(url);
          } else if (url) {
            revokeObjectUrl(url, isExternal);
          }
        }
      };
    }
  };
}

async function createTiffCanvas(bytes: Uint8Array): Promise<HTMLCanvasElement> {
  if (bytes.byteLength === 0) {
    throw new Error("无法读取 TIFF 文件内容。");
  }
  const UTIF = await import("utif");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const ifds = UTIF.decode(buffer);
  const ifd = ifds.find((item) => Number(item.width || 0) > 0 || Number(item.t256 || 0) > 0) || ifds[0];
  if (!ifd) {
    throw new Error("TIFF 文件没有可解码的图像目录。");
  }
  UTIF.decodeImage(buffer, ifd);
  const rgba = UTIF.toRGBA8(ifd);
  const width = Number(ifd.width || ifd.t256 || 0);
  const height = Number(ifd.height || ifd.t257 || 0);
  if (!width || !height || rgba.length < width * height * 4) {
    throw new Error("TIFF 图像像素数据不完整。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前环境不支持 Canvas 2D，无法展示 TIFF。");
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvas;
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

type ImageInfo = {
  format: string;
  width?: number;
  height?: number;
  bitDepth?: string;
  color?: string;
  frames?: number;
  count?: number;
  note?: string;
};

async function readImageBytes(file: { blob?: Blob; url?: string; source?: unknown }): Promise<Uint8Array> {
  if (file.blob) {
    return new Uint8Array(await file.blob.arrayBuffer().catch(() => new ArrayBuffer(0)));
  }
  const url = file.url || (typeof file.source === "string" ? file.source : "");
  if (!url) {
    return new Uint8Array();
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return new Uint8Array();
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return new Uint8Array();
  }
}

function createImageInfoBar(bytes: Uint8Array, extension: string, mimeType: string, fileName: string): HTMLElement {
  const info = parseImageInfo(bytes, extension, mimeType, fileName);
  const bar = document.createElement("div");
  bar.className = "ofv-image-info";
  appendImageInfo(bar, "格式", info.format);
  if (info.width && info.height) {
    appendImageInfo(bar, "尺寸", `${info.width} x ${info.height}px`);
  }
  if (info.bitDepth) {
    appendImageInfo(bar, "位深", info.bitDepth);
  }
  if (info.color) {
    appendImageInfo(bar, "颜色", info.color);
  }
  if (info.frames !== undefined) {
    appendImageInfo(bar, "帧", String(info.frames));
  }
  if (info.count !== undefined) {
    appendImageInfo(bar, "图像", String(info.count));
  }
  if (info.note) {
    appendImageInfo(bar, "说明", info.note);
  }
  return bar;
}

function appendImageInfo(parent: HTMLElement, label: string, value: string): void {
  const row = document.createElement("span");
  row.className = "ofv-image-info-item";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value;
  row.append(key, content);
  parent.append(row);
}

function parseImageInfo(bytes: Uint8Array, extension: string, mimeType: string, fileName: string): ImageInfo {
  const fallbackFormat = (extension || mimeType || fileName.split(".").pop() || "image").toUpperCase();
  if (bytes.length === 0) {
    return { format: fallbackFormat, note: "无法读取本地头信息" };
  }
  return (
    parsePngInfo(bytes) ||
    parseJpegInfo(bytes) ||
    parseGifInfo(bytes) ||
    parseWebpInfo(bytes) ||
    parseAvifInfo(bytes) ||
    parseBmpInfo(bytes) ||
    parseIcoInfo(bytes) ||
    parseTiffInfo(bytes) ||
    parseSvgInfo(bytes) ||
    { format: fallbackFormat, note: "暂未识别图片头结构" }
  );
}

function parsePngInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 33 || !bytesMatch(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return null;
  }
  const view = dataView(bytes);
  const frames = countPngChunks(bytes, "fcTL");
  return {
    format: frames > 0 ? "APNG" : "PNG",
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    bitDepth: `${bytes[24]} bit`,
    color: pngColorType(bytes[25]),
    frames: frames > 0 ? frames : undefined
  };
}

function parseJpegInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    while (bytes[offset] === 0xff) {
      offset++;
    }
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > bytes.length) {
      break;
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) {
      break;
    }
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        format: "JPEG",
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        bitDepth: `${bytes[offset + 2]} bit`,
        color: `${bytes[offset + 7]} component`
      };
    }
    offset += length;
  }
  return { format: "JPEG", note: "未在头部扫描到 SOF 尺寸段" };
}

function parseGifInfo(bytes: Uint8Array): ImageInfo | null {
  const header = asciiAt(bytes, 0, 6);
  if (header !== "GIF87a" && header !== "GIF89a") {
    return null;
  }
  const packed = bytes[10] || 0;
  return {
    format: header,
    width: readUint16Le(bytes, 6),
    height: readUint16Le(bytes, 8),
    bitDepth: `${(packed & 0x07) + 1} bit`,
    color: (packed & 0x80) ? "Global color table" : "No global color table",
    frames: countGifFrames(bytes)
  };
}

function parseWebpInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 16 || asciiAt(bytes, 0, 4) !== "RIFF" || asciiAt(bytes, 8, 4) !== "WEBP") {
    return null;
  }
  const chunk = asciiAt(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) {
    const flags = bytes[20];
    return {
      format: "WebP",
      width: 1 + readUint24Le(bytes, 24),
      height: 1 + readUint24Le(bytes, 27),
      frames: (flags & 0x02) !== 0 ? countWebpAnimationFrames(bytes) : undefined,
      color: (flags & 0x10) !== 0 ? "Alpha" : undefined
    };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    const start = 20;
    if (bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) {
      return {
        format: "WebP",
        width: readUint16Le(bytes, start + 6) & 0x3fff,
        height: readUint16Le(bytes, start + 8) & 0x3fff
      };
    }
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      format: "WebP",
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      color: "Lossless"
    };
  }
  return { format: "WebP", note: `未知 ${chunk || "chunk"} 头` };
}

function parseAvifInfo(bytes: Uint8Array): ImageInfo | null {
  const boxes = collectBmffBoxes(bytes, 0, bytes.length);
  const ftyp = boxes.find((box) => box.type === "ftyp");
  if (!ftyp) {
    return null;
  }
  const majorBrand = asciiAt(bytes, ftyp.dataStart, 4);
  const compatibleBrands = asciiAt(bytes, ftyp.dataStart + 8, Math.max(0, ftyp.dataEnd - ftyp.dataStart - 8));
  if (!/\b(avif|avis|mif1|msf1|heic|heix|hevc|hevx)\b/.test(`${majorBrand} ${compatibleBrands}`)) {
    return null;
  }
  const ispe = findBmffBox(bytes, boxes, "ispe");
  return {
    format: majorBrand === "avis" || compatibleBrands.includes("avis") ? "AVIF Sequence" : majorBrand.startsWith("hei") ? "HEIF" : "AVIF",
    width: ispe && ispe.dataStart + 12 <= ispe.dataEnd ? readUint32Be(bytes, ispe.dataStart + 4) : undefined,
    height: ispe && ispe.dataStart + 12 <= ispe.dataEnd ? readUint32Be(bytes, ispe.dataStart + 8) : undefined,
    note: `brand ${majorBrand}${compatibleBrands.trim() ? ` · ${formatBmffBrands(compatibleBrands)}` : ""}`
  };
}

type BmffBox = {
  type: string;
  start: number;
  dataStart: number;
  dataEnd: number;
  end: number;
};

function collectBmffBoxes(bytes: Uint8Array, start: number, end: number): BmffBox[] {
  const boxes: BmffBox[] = [];
  let offset = start;
  while (offset + 8 <= end && boxes.length < 512) {
    let size = readUint32Be(bytes, offset);
    const type = asciiAt(bytes, offset + 4, 4);
    let headerSize = 8;
    if (!/^[A-Za-z0-9 _-]{4}$/.test(type)) {
      break;
    }
    if (size === 1 && offset + 16 <= end) {
      const high = readUint32Be(bytes, offset + 8);
      const low = readUint32Be(bytes, offset + 12);
      size = high > 0 ? end - offset : low;
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end) {
      break;
    }
    boxes.push({
      type,
      start: offset,
      dataStart: offset + headerSize,
      dataEnd: offset + size,
      end: offset + size
    });
    offset += size;
  }
  return boxes;
}

function findBmffBox(bytes: Uint8Array, boxes: BmffBox[], type: string): BmffBox | undefined {
  for (const box of boxes) {
    if (box.type === type) {
      return box;
    }
    if (["meta", "iprp", "ipco", "moov", "trak", "mdia", "minf", "stbl"].includes(box.type)) {
      const childStart = box.type === "meta" ? box.dataStart + 4 : box.dataStart;
      const found = findBmffBox(bytes, collectBmffBoxes(bytes, childStart, box.dataEnd), type);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

function formatBmffBrands(value: string): string {
  const brands = value.match(/.{1,4}/g)?.map((brand) => brand.trim()).filter(Boolean) || [];
  return brands.slice(0, 6).join(", ");
}

function parseBmpInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 30 || asciiAt(bytes, 0, 2) !== "BM") {
    return null;
  }
  const dibSize = readUint32Le(bytes, 14);
  if (dibSize < 12) {
    return { format: "BMP", note: "DIB header 太短" };
  }
  if (dibSize === 12 && bytes.length >= 26) {
    return {
      format: "BMP",
      width: readUint16Le(bytes, 18),
      height: readUint16Le(bytes, 20),
      bitDepth: `${readUint16Le(bytes, 24)} bit`
    };
  }
  return {
    format: "BMP",
    width: readInt32Le(bytes, 18),
    height: Math.abs(readInt32Le(bytes, 22)),
    bitDepth: `${readUint16Le(bytes, 28)} bit`
  };
}

function parseIcoInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 6 || readUint16Le(bytes, 0) !== 0 || ![1, 2].includes(readUint16Le(bytes, 2))) {
    return null;
  }
  const count = readUint16Le(bytes, 4);
  if (count < 1 || bytes.length < 6 + count * 16) {
    return { format: "ICO/CUR", count };
  }
  const width = bytes[6] || 256;
  const height = bytes[7] || 256;
  return {
    format: readUint16Le(bytes, 2) === 1 ? "ICO" : "CUR",
    width,
    height,
    bitDepth: `${readUint16Le(bytes, 12)} bit`,
    count
  };
}

function parseSvgInfo(bytes: Uint8Array): ImageInfo | null {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, Math.min(bytes.length, 8192)));
  if (!/<svg[\s>]/i.test(text)) {
    return null;
  }
  const tag = text.match(/<svg\b[^>]*>/i)?.[0] || "";
  const width = numberAttribute(tag, "width");
  const height = numberAttribute(tag, "height");
  const viewBox = tag.match(/\bviewBox=["']([^"']+)["']/i)?.[1]?.trim();
  const viewBoxParts = viewBox?.split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return {
    format: "SVG",
    width: width || (viewBoxParts?.length === 4 ? viewBoxParts[2] : undefined),
    height: height || (viewBoxParts?.length === 4 ? viewBoxParts[3] : undefined),
    note: viewBox ? `viewBox ${viewBox}` : undefined
  };
}

function parseTiffInfo(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 8) {
    return null;
  }
  const littleEndian = asciiAt(bytes, 0, 2) === "II";
  const bigEndian = asciiAt(bytes, 0, 2) === "MM";
  if (!littleEndian && !bigEndian) {
    return null;
  }
  const magic = readTiffUint16(bytes, 2, littleEndian);
  if (magic !== 42 && magic !== 43) {
    return null;
  }
  const ifdOffset = magic === 43 ? readTiffUint64AsNumber(bytes, 8, littleEndian) : readTiffUint32(bytes, 4, littleEndian);
  if (!Number.isFinite(ifdOffset) || ifdOffset + 2 > bytes.length) {
    return { format: magic === 43 ? "BigTIFF" : "TIFF", note: "IFD 偏移超出文件范围" };
  }
  const count = magic === 43 ? readTiffUint64AsNumber(bytes, ifdOffset, littleEndian) : readTiffUint16(bytes, ifdOffset, littleEndian);
  const entrySize = magic === 43 ? 20 : 12;
  const entriesStart = ifdOffset + (magic === 43 ? 8 : 2);
  let width: number | undefined;
  let height: number | undefined;
  let bitDepth: number | undefined;
  let compression: number | undefined;
  for (let index = 0; index < Math.min(count, 256); index++) {
    const offset = entriesStart + index * entrySize;
    if (offset + entrySize > bytes.length) {
      break;
    }
    const tag = readTiffUint16(bytes, offset, littleEndian);
    const type = readTiffUint16(bytes, offset + 2, littleEndian);
    const valueOffset = magic === 43 ? offset + 12 : offset + 8;
    const value = readTiffInlineValue(bytes, valueOffset, type, littleEndian);
    if (tag === 256) width = value;
    if (tag === 257) height = value;
    if (tag === 258) bitDepth = value;
    if (tag === 259) compression = value;
  }
  return {
    format: magic === 43 ? "BigTIFF" : "TIFF",
    width,
    height,
    bitDepth: bitDepth ? `${bitDepth} bit` : undefined,
    color: compression ? tiffCompressionName(compression) : undefined,
    count: Number.isFinite(count) ? count : undefined
  };
}

function readTiffInlineValue(bytes: Uint8Array, offset: number, type: number, littleEndian: boolean): number | undefined {
  if (offset + 4 > bytes.length) {
    return undefined;
  }
  if (type === 3) {
    return readTiffUint16(bytes, offset, littleEndian);
  }
  if (type === 4 || type === 13) {
    return readTiffUint32(bytes, offset, littleEndian);
  }
  return readTiffUint16(bytes, offset, littleEndian);
}

function tiffCompressionName(value: number): string {
  const names: Record<number, string> = {
    1: "Uncompressed",
    3: "CCITT Group 3",
    4: "CCITT Group 4",
    5: "LZW",
    6: "Old JPEG",
    7: "JPEG",
    8: "Deflate",
    32773: "PackBits"
  };
  return names[value] || `Compression ${value}`;
}

function countPngChunks(bytes: Uint8Array, chunkType: string): number {
  let offset = 8;
  let count = 0;
  while (offset + 12 <= bytes.length) {
    const length = readUint32Be(bytes, offset);
    const type = asciiAt(bytes, offset + 4, 4);
    if (type === chunkType) {
      count++;
    }
    offset += 12 + length;
  }
  return count;
}

function countGifFrames(bytes: Uint8Array): number {
  let count = 0;
  for (let index = 13; index < bytes.length; index++) {
    if (bytes[index] === 0x2c) {
      count++;
    }
  }
  return count || 1;
}

function countWebpAnimationFrames(bytes: Uint8Array): number {
  let count = 0;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const type = asciiAt(bytes, offset, 4);
    const size = readUint32Le(bytes, offset + 4);
    if (type === "ANMF") {
      count++;
    }
    offset += 8 + size + (size % 2);
  }
  return count || 1;
}

function pngColorType(value: number): string {
  const colors: Record<number, string> = {
    0: "Grayscale",
    2: "Truecolor",
    3: "Indexed color",
    4: "Grayscale + alpha",
    6: "Truecolor + alpha"
  };
  return colors[value] || `Unknown (${value})`;
}

function numberAttribute(tag: string, name: string): number | undefined {
  const value = tag.match(new RegExp(`\\b${name}=["']([0-9.]+)`, "i"))?.[1];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bytesMatch(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) {
    return "";
  }
  return new TextDecoder("ascii").decode(bytes.slice(offset, offset + length));
}

function readUint16Le(bytes: Uint8Array, offset: number): number {
  return dataView(bytes).getUint16(offset, true);
}

function readUint24Le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return dataView(bytes).getUint32(offset, true);
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return dataView(bytes).getUint32(offset, false);
}

function readInt32Le(bytes: Uint8Array, offset: number): number {
  return dataView(bytes).getInt32(offset, true);
}

function readTiffUint16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return dataView(bytes).getUint16(offset, littleEndian);
}

function readTiffUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return dataView(bytes).getUint32(offset, littleEndian);
}

function readTiffUint64AsNumber(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 8 > bytes.length) {
    return Number.NaN;
  }
  const view = dataView(bytes);
  const low = view.getUint32(offset + (littleEndian ? 0 : 4), littleEndian);
  const high = view.getUint32(offset + (littleEndian ? 4 : 0), littleEndian);
  return high * 2 ** 32 + low;
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
