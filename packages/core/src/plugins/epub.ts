import JSZip from "jszip";
import DOMPurify from "dompurify";
import type { PreviewCommand, PreviewContext, PreviewPlugin } from "../types";
import { createPanel, createSection, readArrayBuffer } from "./utils";

const epubMimeTypes = new Set(["application/epub+zip", "application/x-epub+zip"]);

type EpubManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
};

type EpubMetadata = {
  title: string;
  creator: string;
  language: string;
  identifier: string;
  publisher: string;
  modified: string;
};

type EpubStructureSummary = {
  manifestItems: number;
  spineItems: number;
  chapters: number;
  images: number;
  styles: number;
  fonts: number;
  audio: number;
  video: number;
  navItems: number;
  tocItems: number;
  coverItems: number;
  otherItems: number;
  missingSpineItems: number;
};

export function epubPlugin(): PreviewPlugin {
  return {
    name: "epub",
    match(file) {
      return file.extension === "epub" || epubMimeTypes.has(file.mimeType);
    },
    async render(ctx) {
      const panel = createPanel("ofv-epub");
      ctx.viewport.append(panel);

      try {
        const zip = await JSZip.loadAsync(await readArrayBuffer(ctx.file));
        await renderEpub(panel, zip);
      } catch (error) {
        renderEpubFallback(panel, error);
      }
      const controller = createEpubReaderController(panel, ctx);

      return {
        canCommand(command) {
          return controller?.canCommand(command) ?? false;
        },
        command(command) {
          return controller?.command(command) ?? false;
        },
        destroy() {
          controller?.destroy();
          panel.remove();
        }
      };
    }
  };
}

function createEpubReaderController(
  panel: HTMLElement,
  ctx: Pick<PreviewContext, "toolbar">
): {
  canCommand: (command: PreviewCommand) => boolean;
  command: (command: PreviewCommand) => boolean;
  destroy: () => void;
} | undefined {
  const reader = panel.querySelector<HTMLElement>(".ofv-epub-reader");
  if (!reader) {
    return undefined;
  }

  let zoom = 1;
  const apply = () => {
    reader.style.setProperty("--ofv-epub-zoom", String(zoom));
    ctx.toolbar?.setZoom(zoom);
  };
  apply();

  return {
    canCommand(command) {
      return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
    },
    command(command) {
      if (command === "zoom-in") {
        zoom = Math.min(2.5, Number((zoom + 0.12).toFixed(2)));
        apply();
        return true;
      }
      if (command === "zoom-out") {
        zoom = Math.max(0.6, Number((zoom - 0.12).toFixed(2)));
        apply();
        return true;
      }
      if (command === "zoom-reset") {
        zoom = 1;
        apply();
        return true;
      }
      return false;
    },
    destroy() {
      ctx.toolbar?.setZoom(undefined);
    }
  };
}

async function renderEpub(panel: HTMLElement, zip: JSZip): Promise<void> {
  const opfPath = await resolvePackagePath(zip);
  const opfText = await zip.file(opfPath)?.async("text");
  if (!opfText) {
    throw new Error("EPUB 缺少 OPF package 文件。");
  }

  const opf = parseXml(opfText, "EPUB package 文件解析失败。");
  const basePath = directoryName(opfPath);
  const manifest = readManifest(opf);
  const spine = readSpine(opf, manifest);
  const metadata = readMetadata(opf);
  const structure = summarizeEpubStructure(opf, manifest, spine);
  const assets = await readEpubAssets(zip, basePath, manifest);

  const summary = createSection("EPUB 图书信息");
  summary.hidden = spine.length > 0;
  if (spine.length > 0) {
    summary.setAttribute("aria-hidden", "true");
    summary.style.display = "none";
  }
  const meta = document.createElement("div");
  meta.className = "ofv-epub-meta";
  meta.hidden = spine.length > 0;
  if (spine.length > 0) {
    meta.setAttribute("aria-hidden", "true");
    meta.style.display = "none";
  }
  appendMeta(meta, "标题", metadata.title || "未命名 EPUB");
  appendMeta(meta, "作者", metadata.creator || "未知");
  appendMeta(meta, "语言", metadata.language || "未声明");
  if (metadata.publisher) {
    appendMeta(meta, "出版方", metadata.publisher);
  }
  if (metadata.identifier) {
    appendMeta(meta, "标识", metadata.identifier);
  }
  if (metadata.modified) {
    appendMeta(meta, "修改时间", metadata.modified);
  }
  appendMeta(meta, "章节", spine.length || "未解析到阅读顺序");
  appendMeta(meta, "Manifest", structure.manifestItems);
  appendMeta(meta, "Spine", structure.spineItems);
  appendMeta(meta, "导航", structure.navItems + structure.tocItems);
  appendMeta(meta, "封面", structure.coverItems);
  appendMeta(meta, "图片", structure.images);
  appendMeta(meta, "样式", structure.styles);
  appendMeta(meta, "字体", structure.fonts);
  if (structure.audio || structure.video) {
    appendMeta(meta, "音视频", `${structure.audio} / ${structure.video}`);
  }
  if (structure.otherItems) {
    appendMeta(meta, "其他资源", structure.otherItems);
  }
  if (structure.missingSpineItems) {
    appendMeta(meta, "缺失章节引用", structure.missingSpineItems);
  }
  summary.append(meta);
  panel.append(summary);

  const chapters = createSection("EPUB 正文预览");
  if (spine.length > 0) {
    hideSupplementalInfo(chapters.querySelector<HTMLElement>("h3"));
  }
  const article = document.createElement("article");
  article.className = "ofv-epub-reader";

  if (spine.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "未解析到可展示章节。";
    article.append(empty);
  } else {
    for (const [index, item] of spine.slice(0, 40).entries()) {
      const chapterPath = joinZipPath(basePath, item.href);
      const chapterText = await zip.file(chapterPath)?.async("text");
      if (!chapterText) {
        continue;
      }
      const section = document.createElement("section");
      section.className = "ofv-epub-chapter";
      const heading = document.createElement("h3");
      heading.textContent = chapterTitle(chapterText) || `章节 ${index + 1}`;
      const content = document.createElement("div");
      content.className = "ofv-epub-content";
      content.innerHTML = sanitizeChapterHtml(rewriteAssetReferences(chapterText, assets, directoryName(chapterPath)));
      section.append(heading, content);
      article.append(section);
    }
  }

  chapters.append(article);
  panel.append(chapters);
}

async function resolvePackagePath(zip: JSZip): Promise<string> {
  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (containerXml) {
    const container = parseXml(containerXml, "EPUB container.xml 解析失败。");
    const rootfile = Array.from(container.getElementsByTagName("*")).find(
      (element) => element.localName === "rootfile" && getXmlAttribute(element, "full-path")
    );
    const fullPath = rootfile ? getXmlAttribute(rootfile, "full-path") : null;
    if (fullPath && zip.file(fullPath)) {
      return fullPath;
    }
  }

  const fallback = Object.values(zip.files).find((entry) => !entry.dir && entry.name.endsWith(".opf"));
  if (!fallback) {
    throw new Error("EPUB 未找到 package OPF 文件。");
  }
  return fallback.name;
}

function readManifest(opf: Document): Map<string, EpubManifestItem> {
  const manifest = new Map<string, EpubManifestItem>();
  for (const item of Array.from(opf.getElementsByTagName("*")).filter((element) => element.localName === "item")) {
    const id = getXmlAttribute(item, "id");
    const href = getXmlAttribute(item, "href");
    if (!id || !href) {
      continue;
    }
    manifest.set(id, {
      id,
      href,
      mediaType: getXmlAttribute(item, "media-type") || "",
      properties: getXmlAttribute(item, "properties") || ""
    });
  }
  return manifest;
}

function readSpine(opf: Document, manifest: Map<string, EpubManifestItem>): EpubManifestItem[] {
  const items: EpubManifestItem[] = [];
  for (const itemref of Array.from(opf.getElementsByTagName("*")).filter((element) => element.localName === "itemref")) {
    const idref = getXmlAttribute(itemref, "idref");
    const item = idref ? manifest.get(idref) : undefined;
    if (item && isChapterMediaType(item.mediaType)) {
      items.push(item);
    }
  }
  if (items.length > 0) {
    return items;
  }
  return Array.from(manifest.values()).filter((item) => isChapterMediaType(item.mediaType));
}

function readMetadata(opf: Document): EpubMetadata {
  return {
    title: textByLocalName(opf, "title"),
    creator: textByLocalName(opf, "creator"),
    language: textByLocalName(opf, "language"),
    identifier: textByLocalName(opf, "identifier"),
    publisher: textByLocalName(opf, "publisher"),
    modified: metaPropertyText(opf, "dcterms:modified")
  };
}

function summarizeEpubStructure(opf: Document, manifest: Map<string, EpubManifestItem>, spine: EpubManifestItem[]): EpubStructureSummary {
  const items = Array.from(manifest.values());
  const chapters = spine.length;
  const images = items.filter((item) => item.mediaType.startsWith("image/")).length;
  const styles = items.filter((item) => item.mediaType === "text/css").length;
  const fonts = items.filter((item) => item.mediaType.startsWith("font/") || /font|opentype|truetype/i.test(item.mediaType)).length;
  const audio = items.filter((item) => item.mediaType.startsWith("audio/")).length;
  const video = items.filter((item) => item.mediaType.startsWith("video/")).length;
  const navItems = items.filter((item) => propertyTokens(item.properties).has("nav")).length;
  const tocItems = items.filter((item) => item.mediaType === "application/x-dtbncx+xml" || propertyTokens(item.properties).has("toc")).length;
  const coverItems = items.filter((item) => item.id.toLowerCase().includes("cover") || propertyTokens(item.properties).has("cover-image")).length;
  const otherItems = items.filter((item) => !isKnownEpubResource(item)).length;
  return {
    manifestItems: items.length,
    spineItems: spine.length,
    chapters,
    images,
    styles,
    fonts,
    audio,
    video,
    navItems,
    tocItems,
    coverItems,
    otherItems,
    missingSpineItems: Math.max(0, readSpineRefCount(opf) - spine.length)
  };
}

function isKnownEpubResource(item: EpubManifestItem): boolean {
  const properties = propertyTokens(item.properties);
  return (
    isChapterMediaType(item.mediaType) ||
    item.mediaType.startsWith("image/") ||
    item.mediaType === "text/css" ||
    item.mediaType.startsWith("font/") ||
    /font|opentype|truetype/i.test(item.mediaType) ||
    item.mediaType.startsWith("audio/") ||
    item.mediaType.startsWith("video/") ||
    item.mediaType === "application/x-dtbncx+xml" ||
    properties.has("nav") ||
    properties.has("toc")
  );
}

async function readEpubAssets(
  zip: JSZip,
  basePath: string,
  manifest: Map<string, EpubManifestItem>
): Promise<Map<string, string>> {
  const assets = new Map<string, string>();
  for (const item of manifest.values()) {
    if (!item.mediaType.startsWith("image/")) {
      continue;
    }
    const path = joinZipPath(basePath, item.href);
    const entry = zip.file(path);
    if (!entry) {
      continue;
    }
    assets.set(path, `data:${item.mediaType};base64,${await entry.async("base64")}`);
  }
  return assets;
}

function rewriteAssetReferences(html: string, assets: Map<string, string>, chapterDir: string): string {
  const documentHtml = new DOMParser().parseFromString(html, "text/html");
  for (const image of Array.from(documentHtml.querySelectorAll<HTMLImageElement>("img[src], image[href], image[xlink\\:href]"))) {
    const raw = image.getAttribute("src") || image.getAttribute("href") || image.getAttribute("xlink:href") || "";
    const path = joinZipPath(chapterDir, raw.split("#")[0] || raw);
    const src = assets.get(path);
    if (!src) {
      continue;
    }
    image.setAttribute("src", src);
    image.setAttribute("href", src);
    image.setAttribute("xlink:href", src);
  }
  return documentHtml.body.innerHTML;
}

function sanitizeChapterHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: false },
    ADD_ATTR: ["target", "xlink:href"]
  });
}

function chapterTitle(html: string): string {
  const documentHtml = new DOMParser().parseFromString(html, "text/html");
  const heading = documentHtml.querySelector("h1, h2, h3, title");
  return heading?.textContent?.trim() || "";
}

function renderEpubFallback(panel: HTMLElement, error: unknown): void {
  panel.replaceChildren();
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";
  const title = document.createElement("strong");
  title.textContent = "EPUB 解析失败";
  const meta = document.createElement("span");
  meta.textContent = error instanceof Error ? error.message : "文件可能已损坏，或不是有效的 EPUB。";
  fallback.append(title, meta);
  panel.append(fallback);
}

function parseXml(xml: string, message: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error(message);
  }
  return doc;
}

function appendMeta(parent: HTMLElement, label: string, value: string | number): void {
  const row = document.createElement("div");
  row.className = "ofv-meta-row";
  const key = document.createElement("span");
  key.textContent = label;
  const content = document.createElement("strong");
  content.textContent = String(value);
  row.append(key, content);
  parent.append(row);
}

function textByLocalName(doc: Document, localName: string): string {
  return (
    Array.from(doc.getElementsByTagName("*"))
      .find((element) => element.localName === localName)
      ?.textContent?.trim() || ""
  );
}

function metaPropertyText(doc: Document, property: string): string {
  return (
    Array.from(doc.getElementsByTagName("*"))
      .find((element) => element.localName === "meta" && getXmlAttribute(element, "property") === property)
      ?.textContent?.trim() || ""
  );
}

function propertyTokens(value: string): Set<string> {
  return new Set(value.split(/\s+/).map((item) => item.trim()).filter(Boolean));
}

function readSpineRefCount(opf: Document): number {
  return Array.from(opf.getElementsByTagName("*")).filter((element) => element.localName === "itemref").length;
}

function getXmlAttribute(element: Element, localName: string): string | null {
  const direct = element.getAttribute(localName);
  if (direct !== null) {
    return direct;
  }
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) {
      return attribute.value;
    }
  }
  return null;
}

function hideSupplementalInfo(element: HTMLElement | null): void {
  if (!element) {
    return;
  }
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.style.display = "none";
}

function isChapterMediaType(mediaType: string): boolean {
  return mediaType === "application/xhtml+xml" || mediaType === "text/html" || mediaType === "application/xml";
}

function directoryName(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

function joinZipPath(basePath: string, path: string): string {
  const parts = `${basePath}${path}`.split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      normalized.pop();
    } else {
      normalized.push(part);
    }
  }
  return normalized.join("/");
}
