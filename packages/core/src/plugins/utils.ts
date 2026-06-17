import type { PreviewFile } from "../types";

export async function readArrayBuffer(file: PreviewFile): Promise<ArrayBuffer> {
  if (file.source instanceof ArrayBuffer) {
    return file.source;
  }
  if (file.blob) {
    return file.blob.arrayBuffer();
  }
  if (typeof file.source === "string") {
    const response = await fetch(file.source);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status}`);
    }
    return response.arrayBuffer();
  }
  throw new Error("Unsupported file source.");
}

export async function readTextFile(file: PreviewFile): Promise<string> {
  const decode = (buffer: ArrayBuffer) => decodeTextBuffer(buffer);
  if (typeof file.source === "string") {
    const response = await fetch(file.source);
    if (!response.ok) {
      throw new Error(`Failed to fetch text file: ${response.status}`);
    }
    return decode(await response.arrayBuffer());
  }
  if (file.blob) {
    return decode(await file.blob.arrayBuffer());
  }
  if (file.source instanceof ArrayBuffer) {
    return decode(file.source);
  }
  return String(file.source);
}

export function createPanel(className = ""): HTMLElement {
  const panel = document.createElement("div");
  panel.className = `ofv-panel ${className}`.trim();
  return panel;
}

export function createSection(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "ofv-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

export function appendMeta(parent: HTMLElement, label: string, value: string | number): void {
  const row = document.createElement("div");
  row.className = "ofv-meta-row";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = String(value);
  row.append(key, content);
  parent.append(row);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function bytesToText(bytes: Uint8Array): string {
  return decodeTextBytes(bytes);
}

export function decodeTextBuffer(buffer: ArrayBuffer): string {
  return decodeTextBytes(new Uint8Array(buffer));
}

export function decodeTextBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder("utf-16le").decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder("utf-16be").decode(bytes.subarray(2));
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return decodeWithFallback(bytes, "gb18030") || decodeWithFallback(bytes, "gbk") || new TextDecoder("utf-8").decode(bytes);
  }
}

function decodeWithFallback(bytes: Uint8Array, encoding: string): string | undefined {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return undefined;
  }
}

export function resolveFormat(
  file: Pick<PreviewFile, "extension" | "mimeType">,
  mimeMap: Record<string, string>
): string {
  return file.extension || mimeMap[file.mimeType] || "";
}
