/// <reference path="../shims-text.d.ts" />
import { isTextLike } from "../detect";
import type { PreviewPlugin } from "../types";

const langMap: Record<string, string> = {
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
  markdown: "markdown"
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
  "text/markdown": "markdown",
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
const MONACO_LOADER_KEY = "__OFV_MONACO_LOADER__";

type MonacoModel = {
  dispose?: () => void;
};

type MonacoEditor = {
  dispose?: () => void;
  layout?: () => void;
  updateOptions?: (options: Record<string, unknown>) => void;
};

type MonacoModule = {
  editor?: {
    create?: (container: HTMLElement, options: Record<string, unknown>) => MonacoEditor;
    createModel?: (value: string, language?: string) => MonacoModel;
    setTheme?: (theme: string) => void;
  };
};

function loadPrismCss(theme: "light" | "dark"): Promise<void> {
  const lightId = "ofv-prism-css-light";
  const darkId = "ofv-prism-css-dark";

  const activeId = theme === "dark" ? darkId : lightId;
  const inactiveId = theme === "dark" ? lightId : darkId;

  document.getElementById(inactiveId)?.remove();

  if (document.getElementById(activeId)) {
    return Promise.resolve();
  }

  const href =
    theme === "dark"
      ? "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css"
      : "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css";

  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.id = activeId;
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load Prism CSS: ${href}`));
    document.head.appendChild(link);
  });
}

export function textPlugin(): PreviewPlugin {
  return {
    name: "text",
    match(file) {
      return isTextLike(file);
    },
    async render(ctx) {
      const ext = ctx.file.extension.toLowerCase();
      const lang = getTextLanguage(ctx.file.name, ext, ctx.file.mimeType);
      const defaultWrapped = lang === "none";
      const isMarkdown = lang === "markdown";
      const text = await readText(ctx.file.source).catch((error: unknown) => undefined);
      if (text === undefined) {
        const fallback = createTextFallback(ctx.file.name, ctx.file.url);
        ctx.viewport.classList.add("ofv-center");
        ctx.viewport.append(fallback);
        return {
          destroy() {
            ctx.viewport.classList.remove("ofv-center");
            fallback.remove();
          }
        };
      }

      // Detect dark theme active state
      const isDark =
        ctx.host.parentElement?.classList.contains("ofv-theme-dark") ||
        document.body.classList.contains("ofv-theme-dark") ||
        (ctx.options.theme === "auto" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) ||
        ctx.options.theme === "dark";

      // 1. Markdown path
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
        container.innerHTML = DOMPurify.sanitize(parseMarkdown(text), {
          USE_PROFILES: { html: true },
          ADD_ATTR: ["target"]
        });
        secureMarkdownLinks(container);
        ctx.viewport.appendChild(container);

        // Highlight code blocks inside markdown
        try {
          const codeBlocks = container.querySelectorAll("pre code");
          if (codeBlocks.length > 0) {
            await loadPrismCss(isDark ? "dark" : "light");
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

        return {
          destroy() {
            container.remove();
          }
        };
      }

      // 2. Syntax-highlighted code path
      const [PrismModule] = await Promise.all([import("prismjs")]);
      const Prism = PrismModule.default || PrismModule;

      // Load specific language component dynamically if needed
      if (lang !== "none") {
        try {
          if (lang === "typescript" || lang === "tsx") {
            await import("prismjs/components/prism-typescript");
          } else if (lang === "python") {
            await import("prismjs/components/prism-python");
          } else if (lang === "json") {
            await import("prismjs/components/prism-json");
          } else if (lang === "json5") {
            await import("prismjs/components/prism-json5");
          } else if (lang === "yaml") {
            await import("prismjs/components/prism-yaml");
          } else if (lang === "toml") {
            await import("prismjs/components/prism-toml");
          } else if (lang === "ini") {
            await import("prismjs/components/prism-ini");
          } else if (lang === "properties") {
            await import("prismjs/components/prism-properties");
          } else if (lang === "editorconfig") {
            await import("prismjs/components/prism-editorconfig");
          } else if (lang === "ignore") {
            await import("prismjs/components/prism-ignore");
          } else if (lang === "protobuf") {
            await import("prismjs/components/prism-protobuf");
          } else if (lang === "hcl") {
            await import("prismjs/components/prism-hcl");
          } else if (lang === "latex") {
            await import("prismjs/components/prism-latex");
          } else if (lang === "dot") {
            await import("prismjs/components/prism-dot");
          } else if (lang === "http") {
            await import("prismjs/components/prism-http");
          } else if (lang === "bash") {
            await import("prismjs/components/prism-bash");
          } else if (lang === "powershell") {
            await import("prismjs/components/prism-powershell");
          } else if (lang === "batch") {
            await import("prismjs/components/prism-batch");
          } else if (lang === "docker") {
            await import("prismjs/components/prism-docker");
          } else if (lang === "makefile") {
            await import("prismjs/components/prism-makefile");
          } else if (lang === "ruby") {
            await import("prismjs/components/prism-ruby");
          } else if (lang === "nginx") {
            await import("prismjs/components/prism-nginx");
          } else if (lang === "groovy") {
            await import("prismjs/components/prism-groovy");
          } else if (lang === "graphql") {
            await import("prismjs/components/prism-graphql");
          } else if (lang === "csharp") {
            await import("prismjs/components/prism-csharp");
          } else if (lang === "rust") {
            await import("prismjs/components/prism-rust");
          } else if (lang === "go") {
            await import("prismjs/components/prism-go");
          } else if (lang === "ruby") {
            await import("prismjs/components/prism-ruby");
          } else if (lang === "swift") {
            await import("prismjs/components/prism-swift");
          } else if (lang === "kotlin") {
            await import("prismjs/components/prism-kotlin");
          } else if (lang === "scala") {
            await import("prismjs/components/prism-scala");
          } else if (lang === "lua") {
            await import("prismjs/components/prism-lua");
          } else if (lang === "r") {
            await import("prismjs/components/prism-r");
          } else if (lang === "dart") {
            await import("prismjs/components/prism-dart");
          } else if (lang === "elm") {
            await import("prismjs/components/prism-elm");
          } else if (lang === "elixir") {
            await import("prismjs/components/prism-elixir");
          } else if (lang === "clojure") {
            await import("prismjs/components/prism-clojure");
          } else if (lang === "erlang") {
            await import("prismjs/components/prism-erlang");
          } else if (lang === "fsharp") {
            await import("prismjs/components/prism-fsharp");
          } else if (lang === "haskell") {
            await import("prismjs/components/prism-haskell");
          } else if (lang === "sql") {
            await import("prismjs/components/prism-sql");
          } else if (lang === "cpp") {
            await import("prismjs/components/prism-c");
            await import("prismjs/components/prism-cpp");
          } else if (lang === "java") {
            await import("prismjs/components/prism-java");
          } else if (lang === "php") {
            await import("prismjs/components/prism-markup-templating");
            await import("prismjs/components/prism-php");
          }
        } catch (e) {
          console.warn(`Prism failed to load language component for: ${lang}`, e);
        }
      }

      await loadPrismCss(isDark ? "dark" : "light").catch((error) => {
        console.warn("Prism CSS failed to load; rendering code without external theme:", error);
      });

      const codeText = text.length > MAX_RENDER_CHARS ? text.slice(0, MAX_RENDER_CHARS) : text;
      const totalLines = countLines(text);
      const shownLines = countLines(codeText);
      const truncated = codeText.length < text.length;
      const shouldHighlight = codeText.length <= MAX_HIGHLIGHT_CHARS;
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-code-container";
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
      const meta = document.createElement("span");
      meta.textContent = [
        lang === "none" ? "plain text" : lang,
        `${totalLines.toLocaleString()} lines`,
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
      wrapButton.textContent = "Wrap";
      wrapButton.setAttribute("aria-pressed", String(defaultWrapped));
      wrapButton.addEventListener("click", () => {
        const wrapped = wrapper.classList.toggle("is-wrapped");
        wrapButton.setAttribute("aria-pressed", String(wrapped));
        monacoEditor?.updateOptions?.({ wordWrap: wrapped ? "on" : "off" });
        if (fallbackEditor) {
          fallbackEditor.wrap = wrapped ? "soft" : "off";
        }
      });

      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "ofv-code-action";
      copyButton.textContent = "Copy";
      copyButton.addEventListener("click", async () => {
        copyButton.disabled = true;
        try {
          await copyToClipboard(text);
          status.textContent = "Copied";
        } catch {
          status.textContent = "Copy failed";
        } finally {
          copyButton.disabled = false;
        }
      });

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "ofv-code-action";
      downloadButton.textContent = "Download";
      downloadButton.addEventListener("click", () => {
        downloadText(ctx.file.name, text);
        status.textContent = "Download ready";
      });

      const editorButton = document.createElement("button");
      editorButton.type = "button";
      editorButton.className = "ofv-code-action";
      editorButton.textContent = "Editor";
      editorButton.setAttribute("aria-pressed", "false");

      actions.append(status, editorButton, wrapButton, copyButton, downloadButton);
      header.append(title, actions);

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
      const editorHost = document.createElement("div");
      editorHost.className = "ofv-code-editor";
      editorHost.hidden = true;

      let monacoEditor: MonacoEditor | undefined;
      let monacoModel: MonacoModel | undefined;
      let fallbackEditor: HTMLTextAreaElement | undefined;
      let editorReady = false;
      let editorLoading: Promise<void> | undefined;

      const showReader = () => {
        editorHost.hidden = true;
        body.hidden = false;
        wrapper.classList.remove("is-editor");
        editorButton.textContent = "Editor";
        editorButton.setAttribute("aria-pressed", "false");
      };

      const showEditor = async () => {
        if (text.length > MAX_RENDER_CHARS) {
          status.textContent = "Editor skipped for large file";
          return;
        }
        if (editorReady) {
          body.hidden = true;
          editorHost.hidden = false;
          wrapper.classList.add("is-editor");
          editorButton.textContent = "Reader";
          editorButton.setAttribute("aria-pressed", "true");
          monacoEditor?.layout?.();
          return;
        }
        if (!editorLoading) {
          editorLoading = (async () => {
            editorButton.disabled = true;
            status.textContent = "Loading editor";
            try {
              const monaco = await loadMonaco();
              if (!monaco.editor?.create) {
                throw new Error("Monaco editor API is unavailable.");
              }
              const monacoLanguage = toMonacoLanguage(ext, lang);
              monaco.editor.setTheme?.(isDark ? "vs-dark" : "vs");
              monacoModel = monaco.editor.createModel?.(text, monacoLanguage);
              monacoEditor = monaco.editor.create(editorHost, {
                ...(monacoModel ? { model: monacoModel } : { value: text, language: monacoLanguage }),
                automaticLayout: true,
                fontFamily: "var(--ofv-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
                fontSize: 13,
                lineNumbers: "on",
                minimap: { enabled: text.length <= 80_000 },
                readOnly: true,
                renderLineHighlight: "line",
                scrollBeyondLastLine: false,
                wordWrap: wrapper.classList.contains("is-wrapped") ? "on" : "off"
              });
              editorReady = true;
              status.textContent = "Editor ready";
              body.hidden = true;
              editorHost.hidden = false;
              wrapper.classList.add("is-editor");
              editorButton.textContent = "Reader";
              editorButton.setAttribute("aria-pressed", "true");
              monacoEditor.layout?.();
            } catch (error) {
              console.warn("Monaco editor failed to load; using built-in code editor fallback:", error);
              fallbackEditor = createBasicCodeEditor(text, wrapper.classList.contains("is-wrapped"));
              editorHost.replaceChildren(fallbackEditor);
              editorReady = true;
              status.textContent = "Basic editor";
              body.hidden = true;
              editorHost.hidden = false;
              wrapper.classList.add("is-editor");
              editorButton.textContent = "Reader";
              editorButton.setAttribute("aria-pressed", "true");
            } finally {
              editorButton.disabled = false;
            }
          })();
        }
        await editorLoading;
      };

      editorButton.addEventListener("click", () => {
        if (editorHost.hidden) {
          void showEditor();
        } else {
          showReader();
          status.textContent = "Reader mode";
        }
      });

      wrapper.append(header);
      if (truncated) {
        const notice = document.createElement("div");
        notice.className = "ofv-code-notice";
        notice.textContent = `文件较大，当前展示前 ${formatBytes(codeText.length)}，复制和下载仍会使用完整内容。`;
        wrapper.append(notice);
      }
      if (!shouldHighlight) {
        const notice = document.createElement("div");
        notice.className = "ofv-code-notice";
        notice.textContent = "内容较大，已跳过语法高亮以保持滚动流畅。";
        wrapper.append(notice);
      }
      wrapper.appendChild(body);
      wrapper.appendChild(editorHost);
      ctx.viewport.appendChild(wrapper);

      if (shouldHighlight) {
        try {
          Prism.highlightElement(code);
        } catch (err) {
          console.error("Prism syntax highlighting failed:", err);
        }
      }

      return {
        resize() {
          monacoEditor?.layout?.();
        },
        destroy() {
          monacoEditor?.dispose?.();
          monacoModel?.dispose?.();
          wrapper.remove();
        }
      };
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

async function loadMonaco(): Promise<MonacoModule> {
  const injectedLoader = (globalThis as Record<string, unknown>)[MONACO_LOADER_KEY];
  if (typeof injectedLoader === "function") {
    return (await (injectedLoader as () => Promise<MonacoModule> | MonacoModule)()) as MonacoModule;
  }
  const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<MonacoModule>;
  return importer("monaco-editor");
}

function toMonacoLanguage(ext: string, prismLanguage: string): string {
  if (ext === "vue") {
    return "html";
  }
  if (ext === "tsx") {
    return "typescript";
  }
  if (ext === "jsx") {
    return "javascript";
  }
  if (prismLanguage === "markup") {
    return ext === "xml" ? "xml" : "html";
  }
  if (prismLanguage === "bash") {
    return "shell";
  }
  if (prismLanguage === "none") {
    return "plaintext";
  }
  return prismLanguage;
}

function createBasicCodeEditor(text: string, wrapped: boolean): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.className = "ofv-code-editor-fallback";
  textarea.readOnly = true;
  textarea.spellcheck = false;
  textarea.wrap = wrapped ? "soft" : "off";
  textarea.value = text;
  textarea.setAttribute("aria-label", "Code editor preview");
  return textarea;
}

function createTextFallback(fileName: string, url?: string): HTMLElement {
  const fallback = document.createElement("div");
  fallback.className = "ofv-fallback";

  const title = document.createElement("strong");
  title.textContent = "文本预览失败";

  const meta = document.createElement("span");
  meta.textContent = "无法读取该文本内容，可能是远程文件不可访问或响应状态异常。";

  fallback.append(title, meta);
  if (url) {
    const download = document.createElement("a");
    download.href = url;
    download.download = fileName;
    download.textContent = "打开原文件";
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
    return response.text();
  }
  if (source instanceof Blob) {
    return source.text();
  }
  if (source instanceof ArrayBuffer) {
    return new TextDecoder().decode(source);
  }
  return String(source);
}
