/// <reference path="../shims-text.d.ts" />
import { isTextLike } from "../detect";
import { formatPreviewMessage } from "../messages";
import type { PreviewCommand, PreviewContext, PreviewInstance, PreviewMessages, PreviewPlugin } from "../types";
import { createLrcPreviewViews, parseLrc } from "./lrc";
import { decodeTextBuffer, getInitialZoom } from "./utils";

const langMap: Record<string, string> = {
  lrc: "none",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "tsx",
  jsx: "jsx",
  html: "markup",
  htm: "markup",
  vue: "markup",
  xml: "markup",
  css: "css",
  scss: "scss",
  less: "less",
  json: "json",
  jsonc: "json",
  json5: "json5",
  ipynb: "json",
  jsonl: "json",
  ndjson: "json",
  toml: "toml",
  ini: "ini",
  properties: "properties",
  proto: "protobuf",
  tf: "hcl",
  tfvars: "hcl",
  hcl: "hcl",
  tex: "latex",
  latex: "latex",
  bib: "latex",
  gv: "dot",
  http: "http",
  py: "python",
  java: "java",
  cpp: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  lua: "lua",
  r: "r",
  dart: "dart",
  svelte: "markup",
  astro: "markup",
  elm: "elm",
  ex: "elixir",
  exs: "elixir",
  clj: "clojure",
  cljs: "clojure",
  erl: "erlang",
  hrl: "erlang",
  fs: "fsharp",
  fsx: "fsharp",
  hs: "haskell",
  lhs: "haskell",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "powershell",
  bat: "batch",
  cmd: "batch",
  dockerfile: "docker",
  nginxconf: "nginx",
  gradle: "groovy",
  graphql: "graphql",
  gql: "graphql",
  yaml: "yaml",
  yml: "yaml",
  diff: "diff",
  patch: "diff",
  php: "php",
  md: "markdown",
  markdown: "markdown",
  mmd: "mermaid",
  mermaid: "mermaid"
};
const filenameLangMap: Record<string, string> = {
  dockerfile: "docker",
  makefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  procfile: "bash",
  jenkinsfile: "groovy",
  vagrantfile: "ruby",
  brewfile: "ruby",
  podfile: "ruby",
  "go.mod": "go",
  "go.sum": "go",
  "cargo.toml": "toml",
  "cargo.lock": "toml",
  ".gitignore": "none",
  ".dockerignore": "ignore",
  ".npmrc": "none",
  ".yarnrc": "none",
  ".pnpmrc": "none",
  ".editorconfig": "editorconfig",
  ".browserslistrc": "none",
  ".prettierrc": "json",
  ".eslintrc": "json",
  ".stylelintrc": "json",
  readme: "markdown",
  changelog: "markdown",
  changes: "markdown",
  history: "markdown",
  license: "none",
  licence: "none",
  copying: "none",
  notice: "none",
  authors: "none",
  contributors: "none",
  codeowners: "none"
};
const mimeLangMap: Record<string, string> = {
  "application/lrc": "none",
  "application/x-lrc": "none",
  "text/lrc": "none",
  "text/x-lrc": "none",
  "text/markdown": "markdown",
  "text/vnd.mermaid": "mermaid",
  "text/html": "markup",
  "application/xml": "markup",
  "text/xml": "markup",
  "application/json": "json",
  "application/json5": "json5",
  "application/x-ipynb+json": "json",
  "application/x-ndjson": "json",
  "application/yaml": "yaml",
  "application/x-yaml": "yaml",
  "text/yaml": "yaml",
  "application/javascript": "javascript",
  "application/x-javascript": "javascript",
  "text/javascript": "javascript",
  "application/typescript": "typescript",
  "application/x-typescript": "typescript",
  "text/typescript": "typescript",
  "application/sql": "sql",
  "application/x-sh": "bash",
  "application/graphql": "graphql",
  "text/calendar": "none",
  "text/vcard": "none",
  "application/x-pem-file": "none",
  "application/x-x509-ca-cert": "none",
  "application/pkix-cert": "none",
  "application/x-httpd-php": "php",
  "application/x-tex": "latex",
  "message/http": "http",
  "text/x-bibtex": "latex",
  "text/x-hcl": "hcl",
  "text/x-protobuf": "protobuf",
  "text/vnd.graphviz": "dot",
  "text/css": "css"
};

const MAX_HIGHLIGHT_CHARS = 180_000;
const MAX_RENDER_CHARS = 600_000;
const prismLanguageLoads = new Map<string, Promise<void>>();

export function textPlugin(): PreviewPlugin {
  return {
    name: "text",
    match(file) {
      return isTextLike(file);
    },
    async render(ctx) {
      const ext = ctx.file.extension.toLowerCase();
      const lang = getTextLanguage(ctx.file.name, ext, ctx.file.mimeType);
      const isLrc =
        ext === "lrc" || ["application/lrc", "application/x-lrc", "text/lrc", "text/x-lrc"].includes(ctx.file.mimeType);
      const defaultWrapped = lang === "none";
      const isMarkdown = lang === "markdown";
      const text = await readText(ctx.file.source).catch((error: unknown) => undefined);
      if (text === undefined) {
        const fallback = createTextFallback(ctx.file.name, ctx.options.messages, ctx.file.url);
        ctx.viewport.classList.add("ofv-center");
        ctx.viewport.append(fallback);
        return {
          destroy() {
            ctx.viewport.classList.remove("ofv-center");
            fallback.remove();
          }
        };
      }

      // 1. Standalone mermaid diagram path (.mmd / .mermaid)
      if (lang === "mermaid") {
        const diagram = await renderMermaidFile(ctx, text);
        if (diagram) {
          return diagram;
        }
        // Fall back to the plain source view below when the diagram cannot render.
      }

      // 2. Markdown path
      if (isMarkdown) {
        const [markedModule, PrismModule, DOMPurifyModule] = await Promise.all([
          import("marked"),
          import("prismjs"),
          import("dompurify")
        ]);

        const parseMarkdown =
          markedModule.marked?.parse || markedModule.parse || (markedModule as any).default?.parse;
        const Prism = PrismModule.default || PrismModule;
        const DOMPurify = DOMPurifyModule.default || DOMPurifyModule;

        const container = document.createElement("div");
        container.className = "ofv-markdown-body";
        const markdownContent = document.createElement("div");
        markdownContent.className = "ofv-markdown-content";
        markdownContent.innerHTML = DOMPurify.sanitize(parseMarkdown(text), {
          USE_PROFILES: { html: true },
          ADD_ATTR: ["target"]
        });
        container.append(markdownContent);
        secureMarkdownLinks(container);
        assignMarkdownHeadingAnchors(markdownContent);
        const destroyMarkdownAnchorNavigation = enableMarkdownAnchorNavigation(container);
        ctx.viewport.appendChild(container);

        // Render mermaid code fences as diagrams
        try {
          await renderMermaidBlocks(container, DOMPurify);
        } catch (e) {
          console.warn("Mermaid render for markdown failed:", e);
        }

        // Highlight code blocks inside markdown
        try {
          const codeBlocks = container.querySelectorAll("pre code");
          if (codeBlocks.length > 0) {
            const languages = new Set<string>();
            codeBlocks.forEach((block) => {
              const language = getPrismLanguageFromElement(block) || getPrismLanguageFromElement(block.parentElement);
              if (language) {
                languages.add(language);
              }
            });
            await Promise.all([...languages].map((language) => loadPrismLanguage(language)));
            codeBlocks.forEach((block) => {
              const parent = block.parentElement;
              if (parent && !parent.className.includes("language-")) {
                parent.className = "language-none";
              }
              Prism.highlightElement(block);
            });
          }
        } catch (e) {
          console.warn("Prism highlight for markdown failed:", e);
        }

        const markdownZoom = createTextZoomController(container, "--ofv-markdown-zoom", ctx, markdownContent);

        return {
          canCommand(command) {
            return markdownZoom.canCommand(command);
          },
          command(command) {
            return markdownZoom.command(command);
          },
          destroy() {
            destroyMarkdownAnchorNavigation();
            container.remove();
          }
        };
      }

      // 3. Syntax-highlighted code path
      const [PrismModule] = await Promise.all([import("prismjs")]);
      const Prism = PrismModule.default || PrismModule;

      // Load specific language component dynamically if needed
      if (lang !== "none") {
        try {
          await loadPrismLanguage(lang);
        } catch (e) {
          console.warn(`Prism failed to load language component for: ${lang}`, e);
        }
      }

      const codeText = text.length > MAX_RENDER_CHARS ? text.slice(0, MAX_RENDER_CHARS) : text;
      const totalLines = countLines(text);
      const shownLines = countLines(codeText);
      const truncated = codeText.length < text.length;
      const shouldHighlight = codeText.length <= MAX_HIGHLIGHT_CHARS;
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-code-container";
      if (isLrc) {
        wrapper.classList.add("is-lrc");
      }
      if (truncated) {
        wrapper.classList.add("is-truncated");
      }
      if (defaultWrapped) {
        wrapper.classList.add("is-wrapped");
      }

      const header = document.createElement("div");
      header.className = "ofv-code-header";

      const title = document.createElement("div");
      title.className = "ofv-code-title";
      const fileName = document.createElement("strong");
      fileName.textContent = ctx.file.name;
      const messages = ctx.options.messages;
      const meta = document.createElement("span");
      meta.textContent = [
        isLrc ? "LRC" : lang === "none" ? messages.textPlainLanguage : lang,
        formatPreviewMessage(messages.textLineCount, { count: totalLines.toLocaleString() }),
        formatBytes(ctx.file.size ?? (ctx.file.source instanceof Blob ? ctx.file.source.size : text.length))
      ].join(" · ");
      title.append(fileName, meta);

      const actions = document.createElement("div");
      actions.className = "ofv-code-actions";

      const status = document.createElement("span");
      status.className = "ofv-code-status";
      status.setAttribute("role", "status");

      const wrapButton = document.createElement("button");
      wrapButton.type = "button";
      wrapButton.className = "ofv-code-action";
      wrapButton.textContent = messages.textWrap;
      wrapButton.setAttribute("aria-pressed", String(defaultWrapped));
      wrapButton.addEventListener("click", () => {
        const wrapped = wrapper.classList.toggle("is-wrapped");
        wrapButton.setAttribute("aria-pressed", String(wrapped));
      });

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "ofv-code-action";
      copyButton.textContent = messages.textCopy;
      copyButton.addEventListener("click", async () => {
        copyButton.disabled = true;
        try {
          await copyToClipboard(text);
          status.textContent = messages.textCopied;
        } catch {
          status.textContent = messages.textCopyFailed;
        } finally {
          copyButton.disabled = false;
        }
      });

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "ofv-code-action";
      downloadButton.textContent = messages.textDownload;
      downloadButton.addEventListener("click", () => {
        downloadText(ctx.file.name, text);
        status.textContent = messages.textDownloadReady;
      });

      actions.append(wrapButton, copyButton, downloadButton, status);
      header.append(title, actions);
      const structureSummary = createTextStructureSummary(text, ext, lang, ctx.file.mimeType);

      const body = document.createElement("div");
      body.className = "ofv-code-body";

      const gutter = document.createElement("pre");
      gutter.className = "ofv-code-gutter";
      gutter.setAttribute("aria-hidden", "true");
      gutter.textContent = createLineNumbers(shownLines);

      const pre = document.createElement("pre");
      pre.className = `language-${lang}`;

      const code = document.createElement("code");
      code.className = `language-${lang}`;
      code.textContent = codeText;

      pre.appendChild(code);
      body.append(gutter, pre);
      wrapper.append(header);
      if (isLrc) {
        const lrcViews = createLrcPreviewViews(parseLrc(codeText), ctx.file.name, messages, body, wrapButton);
        wrapper.append(lrcViews.modeBar, lrcViews.annotatedView, lrcViews.displayView);
      }
      if (structureSummary) {
        wrapper.append(structureSummary);
      }
      if (truncated) {
        const notice = document.createElement("div");
        notice.className = "ofv-code-notice";
        notice.textContent = formatPreviewMessage(messages.textLargeFileNotice, { size: formatBytes(codeText.length) });
        wrapper.append(notice);
      }
      if (!shouldHighlight) {
        const notice = document.createElement("div");
        notice.className = "ofv-code-notice";
        notice.textContent = messages.textHighlightSkipped;
        wrapper.append(notice);
      }
      wrapper.appendChild(body);
      ctx.viewport.appendChild(wrapper);

      if (shouldHighlight) {
        try {
          Prism.highlightElement(code);
        } catch (err) {
          console.error("Prism syntax highlighting failed:", err);
        }
      }

      const codeZoom = createTextZoomController(wrapper, "--ofv-text-zoom", ctx);

      return {
        canCommand(command) {
          return codeZoom.canCommand(command);
        },
        command(command) {
          return codeZoom.command(command);
        },
        destroy() {
          wrapper.remove();
        }
      };
    }
  };
}

function getPrismLanguageFromElement(element: Element | null): string | undefined {
  if (!element) {
    return undefined;
  }
  for (const className of element.classList) {
    if (className.startsWith("language-") && className.length > 9) {
      return className.slice(9).toLowerCase();
    }
  }
  return undefined;
}

type MermaidApi = (typeof import("mermaid"))["default"];
type MarkdownSanitizer = { sanitize(source: string, config: Record<string, unknown>): string };

let mermaidLoad: Promise<MermaidApi> | undefined;
let mermaidRenderSeq = 0;

function loadMermaid(): Promise<MermaidApi> {
  mermaidLoad ||= import("mermaid")
    .then((module) => {
      const mermaid = (module.default || module) as MermaidApi;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "default",
        // Keep labels as plain SVG text: foreignObject html labels are stripped by DOMPurify.
        htmlLabels: false,
        flowchart: { htmlLabels: false },
        class: { htmlLabels: false }
      });
      return mermaid;
    })
    .catch((error) => {
      mermaidLoad = undefined;
      throw error;
    });
  return mermaidLoad;
}

// Mermaid's default maxTextSize: longer inputs are silently replaced with a
// "Maximum text size in diagram exceeded" placeholder instead of throwing.
const MERMAID_MAX_TEXT_CHARS = 50_000;

async function renderMermaidFile(ctx: PreviewContext, text: string): Promise<PreviewInstance | undefined> {
  if (text.length > MERMAID_MAX_TEXT_CHARS) {
    return undefined;
  }
  const renderId = `ofv-mermaid-${++mermaidRenderSeq}`;
  let svg: string;
  try {
    const [mermaid, DOMPurifyModule] = await Promise.all([loadMermaid(), import("dompurify")]);
    const DOMPurify = (DOMPurifyModule.default || DOMPurifyModule) as MarkdownSanitizer;
    const rendered = await mermaid.render(renderId, text);
    svg = DOMPurify.sanitize(rendered.svg, { USE_PROFILES: { svg: true, svgFilters: true } });
  } catch (error) {
    document.getElementById(renderId)?.remove();
    document.getElementById(`d${renderId}`)?.remove();
    console.warn("Mermaid file render failed, falling back to source view:", error);
    return undefined;
  }

  const container = document.createElement("div");
  container.className = "ofv-mermaid-file";
  const zoomLayer = document.createElement("div");
  zoomLayer.className = "ofv-mermaid-zoom-layer";
  const diagram = document.createElement("div");
  diagram.className = "ofv-mermaid";
  diagram.innerHTML = svg;
  zoomLayer.appendChild(diagram);
  container.appendChild(zoomLayer);
  ctx.viewport.appendChild(container);

  const zoom = createTextZoomController(container, "--ofv-mermaid-zoom", ctx, zoomLayer);

  return {
    canCommand(command) {
      return zoom.canCommand(command);
    },
    command(command) {
      return zoom.command(command);
    },
    destroy() {
      container.remove();
    }
  };
}

async function renderMermaidBlocks(container: HTMLElement, DOMPurify: MarkdownSanitizer): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>("pre > code.language-mermaid")).filter(
    (block) => (block.textContent ?? "").length <= MERMAID_MAX_TEXT_CHARS
  );
  if (blocks.length === 0) {
    return;
  }
  const mermaid = await loadMermaid();
  for (const block of blocks) {
    const pre = block.parentElement;
    if (!pre) {
      continue;
    }
    const renderId = `ofv-mermaid-${++mermaidRenderSeq}`;
    try {
      const { svg } = await mermaid.render(renderId, block.textContent ?? "");
      const diagram = document.createElement("div");
      diagram.className = "ofv-mermaid";
      diagram.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
      pre.replaceWith(diagram);
    } catch (error) {
      // Keep the source code block and drop any temp nodes mermaid left in document.body.
      document.getElementById(renderId)?.remove();
      document.getElementById(`d${renderId}`)?.remove();
      console.warn("Mermaid diagram render failed, keeping source block:", error);
    }
  }
}

async function loadPrismLanguage(language: string): Promise<void> {
  if (["none", "plain", "plaintext", "text", "markup", "css", "clike", "javascript"].includes(language)) {
    return;
  }

  const existing = prismLanguageLoads.get(language);
  if (existing) {
    return existing;
  }

  const loading = loadPrismLanguageComponent(language).catch((error) => {
    prismLanguageLoads.delete(language);
    throw error;
  });
  prismLanguageLoads.set(language, loading);
  return loading;
}

async function loadPrismLanguageComponent(language: string): Promise<void> {
  switch (language) {
    case "typescript": await import("prismjs/components/prism-typescript"); break;
    case "jsx": await import("prismjs/components/prism-jsx"); break;
    case "tsx":
      await import("./prism-languages/tsx");
      break;
    case "python": await import("prismjs/components/prism-python"); break;
    case "json": await import("prismjs/components/prism-json"); break;
    case "json5":
      await import("./prism-languages/json5");
      break;
    case "yaml": await import("prismjs/components/prism-yaml"); break;
    case "toml": await import("prismjs/components/prism-toml"); break;
    case "ini": await import("prismjs/components/prism-ini"); break;
    case "properties": await import("prismjs/components/prism-properties"); break;
    case "editorconfig": await import("prismjs/components/prism-editorconfig"); break;
    case "ignore": await import("prismjs/components/prism-ignore"); break;
    case "protobuf": await import("prismjs/components/prism-protobuf"); break;
    case "hcl": await import("prismjs/components/prism-hcl"); break;
    case "latex": await import("prismjs/components/prism-latex"); break;
    case "dot": await import("prismjs/components/prism-dot"); break;
    case "http": await import("prismjs/components/prism-http"); break;
    case "bash": await import("prismjs/components/prism-bash"); break;
    case "powershell": await import("prismjs/components/prism-powershell"); break;
    case "batch": await import("prismjs/components/prism-batch"); break;
    case "docker": await import("prismjs/components/prism-docker"); break;
    case "makefile": await import("prismjs/components/prism-makefile"); break;
    case "ruby": await import("prismjs/components/prism-ruby"); break;
    case "nginx": await import("prismjs/components/prism-nginx"); break;
    case "groovy": await import("prismjs/components/prism-groovy"); break;
    case "graphql": await import("prismjs/components/prism-graphql"); break;
    case "csharp": await import("prismjs/components/prism-csharp"); break;
    case "rust": await import("prismjs/components/prism-rust"); break;
    case "go": await import("prismjs/components/prism-go"); break;
    case "swift": await import("prismjs/components/prism-swift"); break;
    case "kotlin": await import("prismjs/components/prism-kotlin"); break;
    case "java": await import("prismjs/components/prism-java"); break;
    case "scala":
      await import("./prism-languages/scala");
      break;
    case "lua": await import("prismjs/components/prism-lua"); break;
    case "r": await import("prismjs/components/prism-r"); break;
    case "dart": await import("prismjs/components/prism-dart"); break;
    case "elm": await import("prismjs/components/prism-elm"); break;
    case "elixir": await import("prismjs/components/prism-elixir"); break;
    case "clojure": await import("prismjs/components/prism-clojure"); break;
    case "erlang": await import("prismjs/components/prism-erlang"); break;
    case "fsharp": await import("prismjs/components/prism-fsharp"); break;
    case "haskell": await import("prismjs/components/prism-haskell"); break;
    case "sql": await import("prismjs/components/prism-sql"); break;
    case "c": await import("prismjs/components/prism-c"); break;
    case "cpp":
      await import("./prism-languages/cpp");
      break;
    case "scss": await import("prismjs/components/prism-scss"); break;
    case "less": await import("prismjs/components/prism-less"); break;
    case "markup-templating": await import("prismjs/components/prism-markup-templating"); break;
    case "php":
      await import("./prism-languages/php");
      break;
  }
}

function createTextZoomController(
  target: HTMLElement,
  cssVariable: string,
  ctx: PreviewContext,
  pinnedLayer?: HTMLElement
) {
  let zoom = getInitialZoom(ctx, 0.5, 3);

  const apply = () => {
    const normalized = Math.round(zoom * 100) / 100;
    if (pinnedLayer) {
      // The layer scales via the CSS `zoom` property; pin it to its pre-zoom
      // width so the content magnifies past the scroller's edge (horizontal
      // scrollbar) instead of re-wrapping to the container width. Measure with
      // the zoom var at 1 — a zoomed layer reports divided client sizes.
      pinnedLayer.style.width = "";
      target.style.setProperty(cssVariable, "1");
      if (normalized !== 1) {
        const base = pinnedLayer.clientWidth;
        if (base > 0) {
          pinnedLayer.style.width = `${base}px`;
        }
      }
    }
    target.style.setProperty(cssVariable, String(normalized));
    ctx.toolbar?.setZoom(normalized === 1 ? undefined : normalized);
  };

  apply();

  return {
    canCommand(command: PreviewCommand) {
      return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
    },
    command(command: PreviewCommand) {
      if (command === "zoom-in") {
        zoom = Math.min(3, zoom * 1.15);
        apply();
        return true;
      }
      if (command === "zoom-out") {
        zoom = Math.max(0.5, zoom / 1.15);
        apply();
        return true;
      }
      if (command === "zoom-reset") {
        zoom = 1;
        apply();
        return true;
      }
      return false;
    }
  };
}

function getTextLanguage(fileName: string, extension: string, mimeType: string): string {
  const normalizedFileName = normalizeFileName(fileName);
  return (
    langMap[extension] ||
    filenameLangMap[normalizedFileName] ||
    filenameLangMap[normalizedFileName.split(".")[0]] ||
    mimeLangMap[mimeType.toLowerCase()] ||
    "none"
  );
}

function normalizeFileName(name: string): string {
  const baseName = name.split(/[\\/]/).pop() || name;
  return baseName.toLowerCase();
}

function createTextFallback(fileName: string, messages: PreviewMessages, url?: string): HTMLElement {
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";

  const title = document.createElement("strong");
  title.textContent = messages.textPreviewFailedTitle;

  const meta = document.createElement("span");
  meta.textContent = messages.textPreviewFailedMessage;

  fallback.append(title, meta);
  if (url) {
    const download = document.createElement("a");
    download.href = url;
    download.download = fileName;
    download.textContent = messages.textOpenOriginal;
    fallback.append(download);
  }
  return fallback;
}

function secureMarkdownLinks(container: HTMLElement): void {
  for (const link of container.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href") || "";
    if (!isSafeMarkdownHref(href)) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      continue;
    }
    if (/^(https?:)?\/\//i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }
}

function assignMarkdownHeadingAnchors(container: HTMLElement): void {
  const usedIds = new Set<string>(
    Array.from(container.querySelectorAll<HTMLElement>("[id]"))
      .map((element) => element.id)
      .filter(Boolean)
  );
  let fallbackIndex = 0;
  for (const heading of container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
    if (heading.id) {
      continue;
    }
    const baseId = createMarkdownAnchorId(heading.textContent || "") || `heading-${++fallbackIndex}`;
    heading.id = uniquifyMarkdownAnchorId(baseId, usedIds);
  }
}

function enableMarkdownAnchorNavigation(container: HTMLElement): () => void {
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || !container.contains(link)) {
      return;
    }
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("#") || href === "#") {
      return;
    }
    const target = findMarkdownAnchorTarget(container, href.slice(1));
    if (!target) {
      return;
    }
    event.preventDefault();
    target.scrollIntoView?.({ block: "start", inline: "nearest" });
    if (!target.hasAttribute("tabindex")) {
      target.setAttribute("tabindex", "-1");
    }
    target.focus?.({ preventScroll: true });
  };
  container.addEventListener("click", onClick);
  return () => container.removeEventListener("click", onClick);
}

function findMarkdownAnchorTarget(container: HTMLElement, rawAnchor: string): HTMLElement | null {
  const anchor = decodeMarkdownAnchor(rawAnchor);
  const byId = container.querySelector<HTMLElement>(`#${escapeCssIdentifier(anchor)}`);
  if (byId) {
    return byId;
  }
  const normalizedAnchor = createMarkdownAnchorId(anchor);
  return (
    Array.from(container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).find((heading) => {
      const text = heading.textContent || "";
      return text === anchor || createMarkdownAnchorId(text) === normalizedAnchor;
    }) || null
  );
}

function createMarkdownAnchorId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[`~!@#$%^&*()+=[\]{}\\|;:'",.<>/?，。！？、；：“”‘’（）【】《》]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function uniquifyMarkdownAnchorId(baseId: string, usedIds: Set<string>): string {
  let id = baseId;
  let index = 1;
  while (usedIds.has(id)) {
    id = `${baseId}-${index++}`;
  }
  usedIds.add(id);
  return id;
}

function decodeMarkdownAnchor(anchor: string): string {
  try {
    return decodeURIComponent(anchor);
  } catch {
    return anchor;
  }
}

function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\#.;,[\]()>/+~*^$|=!:\s]/g, "\\$&");
}

function isSafeMarkdownHref(href: string): boolean {
  const trimmed = href.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    /^(https?:|mailto:|tel:)/i.test(trimmed)
  );
}

function countLines(text: string): number {
  if (!text) {
    return 1;
  }
  return text.split(/\r\n|\r|\n/).length;
}

function createTextStructureSummary(text: string, extension: string, language: string, mimeType: string): HTMLElement | null {
  if (text.length > MAX_RENDER_CHARS) {
    return null;
  }
  const items = summarizeTextStructure(text, extension, language, mimeType);
  if (items.length === 0) {
    return null;
  }
  const summary = document.createElement("div");
  summary.className = "ofv-text-structure";
  summary.hidden = true;
  summary.setAttribute("aria-hidden", "true");
  summary.style.display = "none";
  for (const item of items) {
    const row = document.createElement("span");
    const label = document.createElement("span");
    label.textContent = item.label;
    const value = document.createElement("strong");
    value.textContent = item.value;
    row.append(label, value);
    summary.append(row);
  }
  return summary;
}

function summarizeTextStructure(
  text: string,
  extension: string,
  language: string,
  mimeType: string
): Array<{ label: string; value: string }> {
  if (extension === "ipynb" || mimeType === "application/x-ipynb+json") {
    return summarizeNotebook(text);
  }
  if (extension === "ndjson" || extension === "jsonl" || mimeType === "application/x-ndjson") {
    return summarizeNdjson(text);
  }
  if (language === "json" || language === "json5") {
    return summarizeJson(text);
  }
  return [];
}

function summarizeJson(text: string): Array<{ label: string; value: string }> {
  try {
    const data = JSON.parse(text) as unknown;
    if (Array.isArray(data)) {
      return [
        { label: "结构", value: "Array" },
        { label: "条目", value: String(data.length) }
      ];
    }
    if (data && typeof data === "object") {
      const keys = Object.keys(data as Record<string, unknown>);
      return [
        { label: "结构", value: "Object" },
        { label: "键", value: String(keys.length) },
        { label: "预览", value: keys.slice(0, 8).join(", ") || "无键" }
      ];
    }
    return [{ label: "结构", value: typeof data }];
  } catch {
    return [];
  }
}

function summarizeNotebook(text: string): Array<{ label: string; value: string }> {
  try {
    const notebook = JSON.parse(text) as {
      cells?: Array<{ cell_type?: string; source?: string | string[] }>;
      metadata?: { kernelspec?: { display_name?: string; name?: string }; language_info?: { name?: string } };
    };
    if (!Array.isArray(notebook.cells)) {
      return summarizeJson(text);
    }
    const counts = new Map<string, number>();
    for (const cell of notebook.cells) {
      const type = cell.cell_type || "unknown";
      counts.set(type, (counts.get(type) || 0) + 1);
    }
    const kernel = notebook.metadata?.kernelspec?.display_name || notebook.metadata?.kernelspec?.name || notebook.metadata?.language_info?.name;
    return [
      { label: "Notebook", value: `${notebook.cells.length} cells` },
      { label: "类型", value: [...counts.entries()].map(([type, count]) => `${type} ${count}`).join(", ") || "未知" },
      ...(kernel ? [{ label: "Kernel", value: kernel }] : [])
    ];
  } catch {
    return [];
  }
}

function summarizeNdjson(text: string): Array<{ label: string; value: string }> {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim());
  let parsed = 0;
  let objects = 0;
  let arrays = 0;
  for (const line of lines.slice(0, 1000)) {
    try {
      const value = JSON.parse(line);
      parsed++;
      if (Array.isArray(value)) {
        arrays++;
      } else if (value && typeof value === "object") {
        objects++;
      }
    } catch {
      // keep counting valid rows only
    }
  }
  return [
    { label: "NDJSON", value: `${lines.length} lines` },
    { label: "可解析", value: String(parsed) },
    { label: "类型", value: `object ${objects}, array ${arrays}` }
  ];
}

function createLineNumbers(lines: number): string {
  return Array.from({ length: Math.max(lines, 1) }, (_, index) => String(index + 1)).join("\n");
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand?.("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard API is not available.");
  }
}

function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readText(source: unknown): Promise<string> {
  if (typeof source === "string") {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch text file: ${response.status}`);
    }
    return decodeTextBuffer(await response.arrayBuffer());
  }
  if (source instanceof Blob) {
    return decodeTextBuffer(await source.arrayBuffer());
  }
  if (source instanceof ArrayBuffer) {
    return decodeTextBuffer(source);
  }
  return String(source);
}
