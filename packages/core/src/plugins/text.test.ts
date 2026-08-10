import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { textPlugin } from "./text";

const { mermaidInitialize, mermaidRender } = vi.hoisted(() => ({
  mermaidInitialize: vi.fn(),
  mermaidRender: vi.fn()
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitialize,
    render: mermaidRender
  }
}));

describe("textPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("sanitizes markdown html before rendering", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["# Safe\n\n[site](https://example.com)\n\n<img src=x onerror=alert(1)><script>alert(2)</script>"], {
        type: "text/markdown"
      }),
      fileName: "note.md",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-markdown-body")));

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("target")).toBe("_blank");
    expect(container.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).toContain("Safe");
  });

  it("keeps only safe markdown link protocols", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["[bad](javascript:alert(1)) [local](./guide.md) [mail](mailto:test@example.com)"], {
        type: "text/markdown"
      }),
      fileName: "links.md",
      plugins: [textPlugin()]
    });

    await waitFor(() => container.querySelectorAll(".ofv-markdown-body a").length === 3);

    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>(".ofv-markdown-body a"));
    expect(links[0].getAttribute("href")).toBeNull();
    expect(links[1].getAttribute("href")).toBe("./guide.md");
    expect(links[2].getAttribute("href")).toBe("mailto:test@example.com");
  });

  it("adds heading anchors and scrolls markdown table-of-contents links inside the preview", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    const container = document.createElement("div");
    document.body.append(container);

    try {
      createViewer({
        container,
        file: new Blob(["# 文档标题\n\n- [跳到章节](#章节一)\n\n## 章节一\n\n正文"], { type: "text/markdown" }),
        fileName: "toc.md",
        plugins: [textPlugin()]
      });

      await waitFor(() => Boolean(container.querySelector(".ofv-markdown-body")));

      const heading = container.querySelector<HTMLElement>(".ofv-markdown-body h2");
      const link = Array.from(container.querySelectorAll<HTMLAnchorElement>(".ofv-markdown-body a")).find(
        (anchor) => anchor.textContent === "跳到章节"
      );
      expect(heading?.id).toBe("章节一");
      expect(link).toBeTruthy();

      link?.click();

      expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", inline: "nearest" });
      expect(document.activeElement).toBe(heading);
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it("renders extensionless Markdown MIME blobs as markdown", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["# MIME Markdown\n\n**bold**"], { type: "text/markdown" }),
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-markdown-body")));

    expect(container.querySelector(".ofv-markdown-body h1")?.textContent).toBe("MIME Markdown");
    expect(container.querySelector(".ofv-markdown-body strong")?.textContent).toBe("bold");
  });

  it("supports shared toolbar zoom for markdown previews", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["# Zoomable\n\nMarkdown body"], { type: "text/markdown" }),
      fileName: "zoom.md",
      plugins: [textPlugin()],
      toolbar: true
    });

    const markdown = await waitFor(() => container.querySelector<HTMLElement>(".ofv-markdown-body"));
    const zoomIn = await waitFor(() => {
      const button = findToolbarButton(container, "Zoom in");
      return button && !button.disabled ? button : false;
    });
    const reset = await waitFor(() => findToolbarButton(container, "Reset zoom"));
    const rotate = await waitFor(() => findToolbarButton(container, "Rotate right"));

    expect(zoomIn.disabled).toBe(false);
    expect(rotate.disabled).toBe(true);

    zoomIn.click();
    await waitFor(() => markdown.style.getPropertyValue("--ofv-markdown-zoom") === "1.15");
    expect(reset.textContent).toBe("115%");

    reset.click();
    await waitFor(() => markdown.style.getPropertyValue("--ofv-markdown-zoom") === "1");
    expect(reset.textContent).toBe("100%");
  });

  it("applies the initial zoom option to markdown previews", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["# Zoomable\n\nMarkdown body"], { type: "text/markdown" }),
      fileName: "zoom.md",
      zoom: 1.5,
      plugins: [textPlugin()],
      toolbar: true
    });

    const markdown = await waitFor(() => container.querySelector<HTMLElement>(".ofv-markdown-body"));
    const reset = await waitFor(() => findToolbarButton(container, "Reset zoom"));

    expect(markdown.style.getPropertyValue("--ofv-markdown-zoom")).toBe("1.5");
    expect(reset.textContent).toBe("150%");
  });

  it("renders mermaid code fences as diagrams", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg><g><text>A to B</text></g></svg>" });
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["# Diagram\n\n```mermaid\ngraph TD;\nA-->B;\n```\n\n```js\nconst a = 1;\n```\n"], {
        type: "text/markdown"
      }),
      fileName: "diagram.md",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-mermaid svg")));

    expect(mermaidRender).toHaveBeenCalledWith(
      expect.stringContaining("ofv-mermaid-"),
      expect.stringContaining("graph TD;")
    );
    expect(container.querySelector("code.language-mermaid")).toBeNull();
    expect(container.querySelector("code.language-js")).not.toBeNull();
  });

  it("sanitizes mermaid svg output before inserting it", async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg><g onclick="alert(1)"></g><script>alert(2)</script><text>node label</text></svg>'
    });
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["```mermaid\ngraph TD;\nA-->B;\n```\n"], { type: "text/markdown" }),
      fileName: "diagram.md",
      plugins: [textPlugin()]
    });

    const diagram = await waitFor(() => container.querySelector<HTMLElement>(".ofv-mermaid"));

    expect(diagram.querySelector("script")).toBeNull();
    expect(diagram.querySelector("g")?.getAttribute("onclick")).toBeNull();
    expect(diagram.textContent).toContain("node label");
  });

  it("keeps the mermaid source block when diagram rendering fails", async () => {
    mermaidRender.mockRejectedValue(new Error("parse error"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["```mermaid\nnot a diagram\n```\n"], { type: "text/markdown" }),
      fileName: "broken.md",
      plugins: [textPlugin()]
    });

    await waitFor(() =>
      warn.mock.calls.some((call) => String(call[0]).includes("Mermaid diagram render failed"))
    );

    expect(container.querySelector(".ofv-mermaid")).toBeNull();
    expect(container.querySelector("code.language-mermaid")?.textContent).toContain("not a diagram");
  });

  it("renders standalone mermaid files as diagrams", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg><g><text>flow</text></g></svg>" });
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["graph TD;\nA-->B;\n"], { type: "text/vnd.mermaid" }),
      fileName: "flow.mmd",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-mermaid-file .ofv-mermaid svg")));

    expect(mermaidRender).toHaveBeenCalledWith(
      expect.stringContaining("ofv-mermaid-"),
      expect.stringContaining("graph TD;")
    );
    expect(container.querySelector(".ofv-code-container")).toBeNull();
  });

  it("sanitizes standalone mermaid svg output before inserting it", async () => {
    mermaidRender.mockResolvedValue({
      svg: '<svg><g onclick="alert(1)"></g><script>alert(2)</script><text>node label</text></svg>'
    });
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["graph TD;\nA-->B;\n"], { type: "text/vnd.mermaid" }),
      fileName: "flow.mermaid",
      plugins: [textPlugin()]
    });

    const diagram = await waitFor(() => container.querySelector<HTMLElement>(".ofv-mermaid-file .ofv-mermaid"));

    expect(diagram.querySelector("script")).toBeNull();
    expect(diagram.querySelector("g")?.getAttribute("onclick")).toBeNull();
    expect(diagram.textContent).toContain("node label");
  });

  it("falls back to the source view when a standalone mermaid file cannot render", async () => {
    mermaidRender.mockRejectedValue(new Error("parse error"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["not a diagram"], { type: "text/vnd.mermaid" }),
      fileName: "broken.mmd",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container")));

    expect(warn.mock.calls.some((call) => String(call[0]).includes("Mermaid file render failed"))).toBe(true);
    expect(container.querySelector(".ofv-mermaid")).toBeNull();
    expect(container.textContent).toContain("not a diagram");
  });

  it("falls back to the source view for oversized standalone mermaid files", async () => {
    mermaidRender.mockClear();
    const container = document.createElement("div");
    document.body.append(container);
    const oversized = `graph TD;\nA-->B;\n${"%% padding\n".repeat(5000)}`;

    createViewer({
      container,
      file: new Blob([oversized], { type: "text/vnd.mermaid" }),
      fileName: "huge.mmd",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container")));

    expect(mermaidRender).not.toHaveBeenCalled();
    expect(container.querySelector(".ofv-mermaid")).toBeNull();
  });

  it("keeps oversized mermaid fences as source blocks in markdown", async () => {
    mermaidRender.mockClear();
    const container = document.createElement("div");
    document.body.append(container);
    const oversized = `graph TD;\nA-->B;\n${"%% padding\n".repeat(5000)}`;

    createViewer({
      container,
      file: new Blob([`# Big\n\n\`\`\`mermaid\n${oversized}\`\`\`\n`], { type: "text/markdown" }),
      fileName: "big.md",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-markdown-body code.language-mermaid")));

    expect(mermaidRender).not.toHaveBeenCalled();
    expect(container.querySelector(".ofv-mermaid")).toBeNull();
  });

  it("supports toolbar zoom for standalone mermaid previews", async () => {
    mermaidRender.mockResolvedValue({ svg: "<svg><g><text>flow</text></g></svg>" });
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["graph TD;\nA-->B;\n"], { type: "text/vnd.mermaid" }),
      fileName: "flow.mmd",
      plugins: [textPlugin()],
      toolbar: true
    });

    const view = await waitFor(() => container.querySelector<HTMLElement>(".ofv-mermaid-file"));
    const zoomIn = await waitFor(() => {
      const button = findToolbarButton(container, "Zoom in");
      return button && !button.disabled ? button : false;
    });

    zoomIn.click();
    await waitFor(() => view.style.getPropertyValue("--ofv-mermaid-zoom") === "1.15");
  });

  it("shows a local fallback when remote text cannot be fetched", async () => {
    const container = document.createElement("div");
    const onError = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response))
    );
    document.body.append(container);

    createViewer({
      container,
      file: "https://example.com/missing.txt",
      fileName: "missing.txt",
      plugins: [textPlugin()],
      onError
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("Text preview failed");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe("https://example.com/missing.txt");
    expect(onError).not.toHaveBeenCalled();
  });

  it("localizes the remote text fallback", async () => {
    const container = document.createElement("div");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response))
    );
    document.body.append(container);

    createViewer({
      container,
      file: "https://example.com/error.txt",
      fileName: "error.txt",
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-fallback")));

    expect(container.textContent).toContain("Text preview failed");
    expect(container.textContent).toContain("Open original file");
    expect(container.textContent).not.toContain("文本预览失败");
  });

  it("renders remote text sources and keeps shared toolbar commands working", async () => {
    const container = document.createElement("div");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new TextEncoder().encode("# Remote Markdown\n\nLoaded over URL").buffer)
        } as Response)
      )
    );
    document.body.append(container);

    createViewer({
      container,
      file: "https://example.com/docs/remote.md?download=1",
      plugins: [textPlugin()],
      toolbar: true
    });

    const markdown = await waitFor(() => container.querySelector<HTMLElement>(".ofv-markdown-body"));
    const zoomIn = await waitFor(() => {
      const button = findToolbarButton(container, "Zoom in");
      return button && !button.disabled ? button : false;
    });
    const reset = await waitFor(() => findToolbarButton(container, "Reset zoom"));

    expect(fetch).toHaveBeenCalledWith("https://example.com/docs/remote.md?download=1");
    expect(container.textContent).toContain("Remote Markdown");

    zoomIn.click();
    await waitFor(() => markdown.style.getPropertyValue("--ofv-markdown-zoom") === "1.15");
    reset?.click();
    await waitFor(() => markdown.style.getPropertyValue("--ofv-markdown-zoom") === "1");
  });

  it("renders highlighted code without injecting external Prism stylesheets", async () => {
    const container = document.createElement("div");
    const hostPre = document.createElement("pre");
    hostPre.textContent = "outside viewer";
    document.head.querySelectorAll("link[id^='ofv-prism-css']").forEach((link) => link.remove());
    document.body.append(hostPre);
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["const value = 1; // comment"], { type: "text/javascript" }),
      fileName: "sample.js",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.textContent).toContain("value");
    expect(container.querySelector(".token.comment")?.textContent).toBe("// comment");
    expect(document.querySelector("link[id^='ofv-prism-css']")).toBeNull();
    expect(hostPre.className).toBe("");
  });

  it("loads Prism language dependencies in order for concurrent Scala previews", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);

    createViewer({
      container: first,
      file: new Blob(["object First extends App"], { type: "text/plain" }),
      fileName: "First.scala",
      plugins: [textPlugin()]
    });
    createViewer({
      container: second,
      file: new Blob(["class Second extends App"], { type: "text/plain" }),
      fileName: "Second.scala",
      plugins: [textPlugin()]
    });

    await waitFor(() => first.querySelector(".token.keyword")?.textContent === "object");
    await waitFor(() => second.querySelector(".token.keyword")?.textContent === "class");

    expect(warning).not.toHaveBeenCalled();
  });

  it("loads complete TSX and JSON5 grammars instead of only their parent languages", async () => {
    const tsxContainer = document.createElement("div");
    const json5Container = document.createElement("div");
    document.body.append(tsxContainer, json5Container);

    createViewer({
      container: tsxContainer,
      file: new Blob(["const view = <section>{value}</section>;"], { type: "text/plain" }),
      fileName: "View.tsx",
      plugins: [textPlugin()]
    });
    createViewer({
      container: json5Container,
      file: new Blob(["{ unquoted: 'value' }"], { type: "text/plain" }),
      fileName: "config.json5",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(tsxContainer.querySelector(".token.tag")));
    await waitFor(() => Boolean(json5Container.querySelector(".token.property")));
  });

  it("renders extensionless application code MIME blobs as text", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["const answer = 42;"], { type: "application/javascript" }),
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.textContent).toContain("const answer");
    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("javascript");
  });

  it("supports shared toolbar zoom for code previews", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["const answer = 42;"], { type: "application/javascript" }),
      fileName: "zoom.js",
      plugins: [textPlugin()],
      toolbar: true
    });

    const code = await waitFor(() => container.querySelector<HTMLElement>(".ofv-code-container"));
    const zoomIn = await waitFor(() => {
      const button = findToolbarButton(container, "Zoom in");
      return button && !button.disabled ? button : false;
    });
    const zoomOut = await waitFor(() => {
      const button = findToolbarButton(container, "Zoom out");
      return button && !button.disabled ? button : false;
    });
    const rotate = await waitFor(() => findToolbarButton(container, "Rotate right"));

    expect(zoomIn.disabled).toBe(false);
    expect(zoomOut.disabled).toBe(false);
    expect(rotate.disabled).toBe(true);

    zoomIn.click();
    await waitFor(() => code.style.getPropertyValue("--ofv-text-zoom") === "1.15");

    zoomOut.click();
    await waitFor(() => code.style.getPropertyValue("--ofv-text-zoom") === "1");
  });

  it("renders JSON structure summaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([JSON.stringify({ name: "Open File Viewer", plugins: ["pdf", "text"], enabled: true }, null, 2)], {
        type: "application/json"
      }),
      fileName: "config.json",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-text-structure")));

    const summary = container.querySelector<HTMLElement>(".ofv-text-structure");
    expect(summary?.hidden).toBe(true);
    expect(summary?.textContent).toContain("结构Object");
    expect(summary?.textContent).toContain("键3");
    expect(visibleText(container)).not.toContain("结构Object");
    expect(visibleText(container)).not.toContain("键3");
  });

  it("renders notebook cell summaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([
        JSON.stringify({
          cells: [
            { cell_type: "markdown", source: ["# Title"] },
            { cell_type: "code", source: ["print('hi')"] },
            { cell_type: "code", source: ["1 + 1"] }
          ],
          metadata: { kernelspec: { display_name: "Python 3" } }
        })
      ], { type: "application/x-ipynb+json" }),
      fileName: "analysis.ipynb",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-text-structure")));

    const summary = container.querySelector<HTMLElement>(".ofv-text-structure");
    expect(summary?.hidden).toBe(true);
    expect(summary?.textContent).toContain("Notebook3 cells");
    expect(summary?.textContent).toContain("markdown 1, code 2");
    expect(summary?.textContent).toContain("KernelPython 3");
    expect(visibleText(container)).not.toContain("Notebook3 cells");
    expect(visibleText(container)).not.toContain("KernelPython 3");
  });

  it("renders NDJSON record summaries", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(['{"id":1}\n{"id":2}\n[3]\nnot json'], { type: "application/x-ndjson" }),
      fileName: "events.ndjson",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-text-structure")));

    const summary = container.querySelector<HTMLElement>(".ofv-text-structure");
    expect(summary?.hidden).toBe(true);
    expect(summary?.textContent).toContain("NDJSON4 lines");
    expect(summary?.textContent).toContain("可解析3");
    expect(summary?.textContent).toContain("object 2, array 1");
    expect(visibleText(container)).not.toContain("NDJSON4 lines");
    expect(visibleText(container)).not.toContain("可解析3");
  });

  it.each([
    { type: "text/xml", text: "<root><item>XML</item></root>", language: "markup" },
    { type: "application/x-yaml", text: "name: Open File Viewer", language: "yaml" }
  ])("renders extensionless $type blobs with MIME-derived language", async ({ type, text, language }) => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([text], { type }),
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.textContent).toContain(text.split("\n")[0]);
    expect(container.querySelector(".ofv-code-title")?.textContent).toContain(language);
  });

  it.each([
    { name: ".env", type: "", text: "API_URL=https://example.com", language: "plain text" },
    {
      name: "lyrics.lrc",
      type: "application/octet-stream",
      text: "[ar:Open File Viewer]\n[00:01.00]Hello\n[00:03.50]你好",
      language: "LRC"
    },
    { name: ".gitignore", type: "", text: "node_modules", language: "plain text" },
    { name: ".dockerignore", type: "", text: "node_modules", language: "ignore" },
    { name: ".npmrc", type: "", text: "registry=https://registry.npmjs.org/", language: "plain text" },
    { name: ".editorconfig", type: "", text: "root = true", language: "editorconfig" },
    { name: ".prettierrc", type: "", text: "{\"printWidth\": 120}", language: "json" },
    { name: "app.properties", type: "", text: "server.port=8080", language: "properties" },
    { name: "settings.jsonc", type: "", text: "{ // comment\n  \"editor\": true\n}", language: "json" },
    { name: "config.json5", type: "", text: "{ trailing: 'comma', }", language: "json5" },
    { name: "analysis.ipynb", type: "", text: "{\"cells\":[],\"metadata\":{}}", language: "json" },
    { name: "Dockerfile", type: "", text: "FROM node:22\nRUN pnpm install", language: "docker" },
    { name: "Jenkinsfile", type: "", text: "pipeline { agent any }", language: "groovy" },
    { name: "Vagrantfile", type: "", text: "Vagrant.configure(\"2\")", language: "ruby" },
    { name: "go.mod", type: "", text: "module github.com/open/file-viewer", language: "go" },
    { name: "Cargo.lock", type: "", text: "# This file is automatically @generated by Cargo.", language: "toml" },
    { name: "schema.proto", type: "", text: "message User { string id = 1; }", language: "protobuf" },
    { name: "main.tf", type: "", text: "resource \"aws_s3_bucket\" \"demo\" {}", language: "hcl" },
    { name: "prod.tfvars", type: "", text: "region = \"us-east-1\"", language: "hcl" },
    { name: "paper.tex", type: "", text: "\\section{Open File Viewer}", language: "latex" },
    { name: "refs.bib", type: "", text: "@article{viewer,title={Open File Viewer}}", language: "latex" },
    { name: "graph.gv", type: "", text: "digraph G { A -> B }", language: "dot" },
    { name: "request.http", type: "", text: "GET https://example.com/api\nAccept: application/json", language: "http" },
    { name: "app.rb", type: "", text: "puts \"hello\"", language: "ruby" },
    { name: "View.swift", type: "", text: "import SwiftUI", language: "swift" },
    { name: "Main.kt", type: "", text: "fun main() = println(\"hi\")", language: "kotlin" },
    { name: "App.scala", type: "", text: "object App extends App", language: "scala" },
    { name: "init.lua", type: "", text: "local value = 1", language: "lua" },
    { name: "chart.r", type: "", text: "print(\"hi\")", language: "r" },
    { name: "widget.dart", type: "", text: "void main() {}", language: "dart" },
    { name: "Component.svelte", type: "", text: "<script>let count = 0;</script>", language: "markup" },
    { name: "Page.astro", type: "", text: "---\nconst title = 'Hi';\n---", language: "markup" },
    { name: "router.ex", type: "", text: "defmodule Router do", language: "elixir" },
    { name: "core.clj", type: "", text: "(ns app.core)", language: "clojure" },
    { name: "server.erl", type: "", text: "-module(server).", language: "erlang" },
    { name: "script.fsx", type: "", text: "printfn \"hi\"", language: "fsharp" },
    { name: "Main.hs", type: "", text: "main = putStrLn \"hi\"", language: "haskell" },
    { name: "LICENSE", type: "", text: "MIT License", language: "plain text" },
    { name: "CODEOWNERS", type: "", text: "* @open-file-viewer/core", language: "plain text" },
    { name: "schema.graphql", type: "application/graphql", text: "type Query { viewer: String }", language: "graphql" },
    { name: "calendar.ics", type: "text/calendar", text: "BEGIN:VCALENDAR\nEND:VCALENDAR", language: "plain text" },
    { name: "contact.vcf", type: "text/vcard", text: "BEGIN:VCARD\nFN:Open File Viewer\nEND:VCARD", language: "plain text" },
    { name: "cert.pem", type: "application/x-pem-file", text: "-----BEGIN CERTIFICATE-----", language: "plain text" }
  ])("renders $name as a text preview", async ({ name, type, text, language }) => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([text], { type }),
      fileName: name,
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.textContent).toContain(text.split("\n")[0]);
    expect(container.querySelector(".ofv-code-title")?.textContent).toContain(language);
  });

  it.each([
    { name: "README", text: "# Open File Viewer" },
    { name: "CHANGELOG.zh-CN", text: "# Changelog" }
  ])("renders $name as extensionless Markdown", async ({ name, text }) => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([text], { type: "" }),
      fileName: name,
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-markdown-body h1")));

    expect(container.querySelector(".ofv-markdown-body h1")?.textContent).toBe(text.replace(/^#\s*/, ""));
  });

  it("uses MIME-derived GraphQL for extensionless code previews", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["type Query { viewer: String }"], { type: "application/graphql" }),
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("graphql");
    expect(container.querySelector(".ofv-code-container code")?.className).toContain("language-graphql");
  });

  it("renders code with line numbers and reader actions", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["const one = 1;\nconst two = 2;"], { type: "text/javascript" }),
      fileName: "sample.mjs",
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("sample.mjs");
    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("javascript");
    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("2 lines");
    expect(container.querySelector(".ofv-code-gutter")?.textContent).toBe("1\n2");
    expect(Array.from(container.querySelectorAll(".ofv-code-action")).map((button) => button.textContent)).toEqual([
      "Wrap",
      "Copy",
      "Download"
    ]);
    expect(container.querySelector(".ofv-code-editor")).toBeNull();
    expect(container.querySelector(".ofv-code-container")?.classList.contains("is-wrapped")).toBe(false);
  });

  it("wraps plain text by default for narrow containers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["Open File Viewer\n\n请选择一个本地文件。"], { type: "text/plain" }),
      fileName: "welcome.txt",
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.querySelector(".ofv-code-container")?.classList.contains("is-wrapped")).toBe(true);
    expect(
      Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
        (button) => button.textContent === "Wrap"
      )?.getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("decodes GBK text blobs before rendering", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(
        [
          Uint8Array.from([
            0xca, 0xd3, 0xc6, 0xb5, 0xc3, 0xfb, 0xb3, 0xc6, 0x2c, 0xbf, 0xaa, 0xca, 0xbc, 0xca, 0xb1, 0xbc,
            0xe4, 0x28, 0xc3, 0xeb, 0x29
          ])
        ],
        { type: "text/csv" }
      ),
      fileName: "action.csv",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.textContent).toContain("视频名称");
    expect(container.textContent).toContain("开始时间(秒)");
    expect(container.textContent).not.toContain("��");
  });

  it("copies the full code text from the preview action", async () => {
    const container = document.createElement("div");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["line one\nline two"], { type: "text/plain" }),
      fileName: "notes.txt",
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));
    const copy = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
      (button) => button.textContent === "Copy"
    );
    copy?.click();

    await waitFor(() => writeText.mock.calls.length > 0);
    expect(writeText).toHaveBeenCalledWith("line one\nline two");
    await waitFor(() => container.querySelector(".ofv-code-status")?.textContent === "Copied");
  });

  it("uses custom messages for code preview controls and status text", async () => {
    const container = document.createElement("div");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["one\ntwo"], { type: "text/plain" }),
      fileName: "custom.txt",
      plugins: [textPlugin()],
      messages: {
        textPlainLanguage: "raw text",
        textLineCount: "{count} rows",
        textWrap: "Fold",
        textCopy: "Duplicate",
        textCopied: "Done",
        textDownload: "Save"
      }
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("raw text");
    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("2 rows");
    expect(Array.from(container.querySelectorAll(".ofv-code-action")).map((button) => button.textContent)).toEqual([
      "Fold",
      "Duplicate",
      "Save"
    ]);

    const copy = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
      (button) => button.textContent === "Duplicate"
    );
    copy?.click();

    await waitFor(() => writeText.mock.calls.length > 0);
    await waitFor(() => container.querySelector(".ofv-code-status")?.textContent === "Done");
  });

  it("downloads the full text from the preview action", async () => {
    const container = document.createElement("div");
    const createObjectURL = vi.fn(() => "blob:preview");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["download me"], { type: "text/plain" }),
      fileName: "download.txt",
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));
    const download = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
      (button) => button.textContent === "Download"
    );
    download?.click();

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
    expect(container.querySelector(".ofv-code-status")?.textContent).toBe("Download ready");
  });

  it("limits very large code rendering but keeps the original copy source", async () => {
    const container = document.createElement("div");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const source = `${"a".repeat(600_000)}TAIL`;
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([source], { type: "text/plain" }),
      fileName: "large.log",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container.is-truncated")));

    expect(container.querySelector(".ofv-code-notice")?.textContent).toContain("Large file");
    expect(container.querySelector(".ofv-code-container code")?.textContent).not.toContain("TAIL");

    const copy = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
      (button) => button.textContent === "Copy"
    );
    copy?.click();
    await waitFor(() => writeText.mock.calls.length > 0);
    expect(writeText).toHaveBeenCalledWith(source);
  });

  it("renders LRC files with display, annotated, and source modes", async () => {
    const container = document.createElement("div");
    const source = [
      "[ti:夜航]",
      "[ar:示例歌手]",
      "[al:测试专辑]",
      "[lr:写词的人]",
      "[by:校时的人]",
      "[offset:120]",
      "[tool:OpenLRC]",
      "[00:01.20]M:<00:01.20>第一 <00:01.80>句",
      "[00:03.00]仍是男声",
      "[00:05.40]D:一起唱"
    ].join("\n");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([source], { type: "application/x-lrc" }),
      fileName: "song.lrc",
      locale: "zh-CN",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-lrc-display")));

    const displayButton = container.querySelector<HTMLButtonElement>('[data-mode="display"]');
    const annotatedButton = container.querySelector<HTMLButtonElement>('[data-mode="annotated"]');
    const sourceButton = container.querySelector<HTMLButtonElement>('[data-mode="source"]');
    const sourceView = container.querySelector<HTMLElement>(".ofv-code-body");
    const wrapButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
      (button) => button.textContent === "换行"
    );

    expect(displayButton?.textContent).toBe("");
    expect(displayButton?.getAttribute("aria-label")).toBe("展示模式");
    expect(displayButton?.title).toBe("展示模式");
    expect(displayButton?.querySelector(".ofv-lrc-mode-icon path")).not.toBeNull();
    expect(displayButton?.getAttribute("role")).toBe("tab");
    expect(displayButton?.getAttribute("aria-selected")).toBe("true");
    expect(displayButton?.tabIndex).toBe(0);
    expect(displayButton?.parentElement?.getAttribute("role")).toBe("tablist");
    expect(displayButton?.getAttribute("aria-controls")).toBe(container.querySelector(".ofv-lrc-display")?.id);
    expect(container.querySelector(".ofv-lrc-display")?.getAttribute("role")).toBe("tabpanel");
    expect(container.querySelector(".ofv-lrc-display")?.getAttribute("aria-labelledby")).toBe(displayButton?.id);
    expect(sourceView?.hidden).toBe(true);
    expect(wrapButton?.hidden).toBe(true);
    const displayHeader = container.querySelector(".ofv-lrc-display-header");
    expect(displayHeader?.tagName).toBe("DIV");
    expect(displayHeader?.querySelector("h2")?.textContent).toBe("夜航");
    expect(container.querySelector(".ofv-lrc-display-details")).toBeNull();
    expect(container.querySelector(".ofv-lrc-display-artist")?.textContent).toBe("示例歌手");
    const trackInformation = container.querySelector(".ofv-lrc-display-track-info");
    expect(trackInformation?.getAttribute("aria-label")).toBe("音乐作品信息");
    expect(trackInformation?.textContent).toContain("专辑测试专辑");
    expect(trackInformation?.textContent).toContain("作词写词的人");
    expect(trackInformation?.textContent).not.toContain("歌词制作校时的人");
    const fileInformation = container.querySelector(".ofv-lrc-display-file-info");
    expect(fileInformation?.tagName).toBe("DIV");
    expect(fileInformation?.querySelector("h3")).toBeNull();
    expect(fileInformation?.textContent).toContain("歌词制作校时的人");
    expect(fileInformation?.textContent).toContain("时间偏移120");
    expect(fileInformation?.textContent).toContain("制作工具OpenLRC");
    expect(fileInformation?.previousElementSibling?.classList.contains("ofv-lrc-display-lyrics")).toBe(true);
    const displayRole = container.querySelector(".ofv-lrc-display-line > .ofv-lrc-role");
    expect(displayRole?.tagName).toBe("SUP");
    expect(displayRole?.textContent).toBe("M");
    expect(displayRole?.nextElementSibling?.classList.contains("ofv-lrc-display-content")).toBe(true);
    expect(container.querySelector(".ofv-lrc-display-lyrics")?.classList.contains("has-role-markers")).toBe(false);
    expect(visibleText(container)).not.toContain("[00:01.20]");
    expect(visibleText(container)).not.toContain("<00:01.80>");
    expect(visibleText(container)).not.toContain("M:");

    annotatedButton?.click();
    expect(annotatedButton?.getAttribute("aria-selected")).toBe("true");
    expect(annotatedButton?.tabIndex).toBe(0);
    expect(displayButton?.tabIndex).toBe(-1);
    expect(container.querySelector<HTMLElement>(".ofv-lrc-display")?.hidden).toBe(true);
    expect(container.querySelector<HTMLElement>(".ofv-lrc-annotated")?.hidden).toBe(false);
    expect(Array.from(container.querySelectorAll(".ofv-lrc-meta-label")).map((tag) => tag.textContent)).toEqual([
      "ti",
      "ar",
      "al",
      "lr",
      "by",
      "offset",
      "tool"
    ]);
    expect(container.querySelector(".ofv-lrc-time")?.textContent).toBe("00:01.20");
    const annotatedRole = container.querySelector(".ofv-lrc-annotated-text > .ofv-lrc-role");
    expect(annotatedRole?.tagName).toBe("SUP");
    expect(annotatedRole?.textContent).toBe("M");
    expect(annotatedRole?.nextElementSibling?.textContent).toBe("第一00:01.20 句00:01.80");
    expect(container.querySelector(".ofv-lrc-timed-word")?.tagName).toBe("RUBY");
    expect(container.querySelector(".ofv-lrc-timed-word .ofv-lrc-word-text")?.textContent).toBe("第一");
    expect(container.querySelector(".ofv-lrc-timed-word rt")?.textContent).toBe("00:01.20");
    expect(Array.from(container.querySelectorAll(".ofv-lrc-word-text"), (word) => word.textContent)).toEqual([
      "第一",
      "句"
    ]);
    expect(container.querySelectorAll(".ofv-lrc-word-separator")).toHaveLength(1);
    expect(container.querySelector(".ofv-lrc-word-separator")?.textContent).toBe(" ");
    expect(container.querySelector(".ofv-lrc-annotated-row.is-title .ofv-lrc-meta-value")?.textContent).toBe("夜航");
    expect(container.querySelectorAll(".ofv-lrc-annotated-row.is-secondary")).toHaveLength(6);
    expect(visibleText(container)).not.toContain("<00:01.20>");

    sourceButton?.click();
    expect(sourceButton?.getAttribute("aria-selected")).toBe("true");
    expect(sourceView?.hidden).toBe(false);
    expect(wrapButton?.hidden).toBe(false);
    expect(visibleText(container)).toContain("[00:01.20]M:<00:01.20>第一 <00:01.80>句");
  });

  it("localizes the complete LRC preview in English", async () => {
    const container = document.createElement("div");
    const source = [
      "[ti:Night Flight]",
      "[ar:Example Artist]",
      "[al:Example Album]",
      "[lr:Example Lyricist]",
      "[by:Timing Editor]",
      "[offset:80]",
      "[tool:OpenLRC]",
      "[ve:1.0]",
      "[00:01.00]M:<00:01.00>Hello <00:01.60>world"
    ].join("\n");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob([source], { type: "application/x-lrc" }),
      fileName: "night-flight.lrc",
      locale: "en-US",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-lrc-display")));

    expect(container.querySelector(".ofv-lrc-mode-label")).toBeNull();
    expect(container.querySelector('[data-mode="display"]')?.getAttribute("aria-label")).toBe("Lyrics mode");
    expect(container.querySelector('[data-mode="annotated"]')?.getAttribute("aria-label")).toBe("Annotated mode");
    expect(container.querySelector('[data-mode="source"]')?.getAttribute("aria-label")).toBe("Source mode");
    expect(container.querySelector(".ofv-lrc-display-track-info")?.getAttribute("aria-label")).toBe(
      "Music information"
    );
    expect(container.querySelector(".ofv-lrc-display-track-info")?.textContent).toContain("AlbumExample Album");
    expect(container.querySelector(".ofv-lrc-display-track-info")?.textContent).toContain(
      "Lyrics byExample Lyricist"
    );
    const fileInformation = container.querySelector(".ofv-lrc-display-file-info");
    expect(fileInformation?.textContent).toContain("LRC byTiming Editor");
    expect(fileInformation?.textContent).toContain("Timing offset80");
    expect(fileInformation?.textContent).toContain("Created withOpenLRC");
    expect(fileInformation?.textContent).toContain("Version1.0");
    expect(container.querySelector<HTMLElement>(".ofv-lrc-role")?.title).toBe("Male vocal");

    container.querySelector<HTMLButtonElement>('[data-mode="annotated"]')?.click();
    expect(container.querySelector(".ofv-lrc-timed-word")?.getAttribute("aria-label")).toBe(
      "Hello, Word timestamp: 00:01.00"
    );
    expect(Array.from(container.querySelectorAll(".ofv-lrc-meta-label"), (label) => label.textContent)).toEqual([
      "ti",
      "ar",
      "al",
      "lr",
      "by",
      "offset",
      "tool",
      "ve"
    ]);

    container.querySelector<HTMLButtonElement>('[data-mode="source"]')?.click();
    const wrapButton = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
      (button) => button.textContent === "Wrap"
    );
    expect(wrapButton?.hidden).toBe(false);
  });

  it("supports keyboard navigation across LRC preview tabs", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["[00:01.00]A line"], { type: "application/x-lrc" }),
      fileName: "keyboard.lrc",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector('[data-mode="display"]')));
    const displayButton = container.querySelector<HTMLButtonElement>('[data-mode="display"]')!;
    const annotatedButton = container.querySelector<HTMLButtonElement>('[data-mode="annotated"]')!;
    displayButton.focus();
    displayButton.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));

    expect(annotatedButton.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(annotatedButton);
    expect(container.querySelector<HTMLElement>(".ofv-lrc-annotated")?.hidden).toBe(false);
  });

  it("does not reserve a vocal-role column when an LRC file has no role markers", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["[ti:Solo]\n[ar:Singer]\n[00:01.00]First line\n[00:02.00]Second line"], {
        type: "application/x-lrc"
      }),
      fileName: "solo.lrc",
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-lrc-display")));

    expect(container.querySelector(".ofv-lrc-display .ofv-lrc-role")).toBeNull();

    container.querySelector<HTMLButtonElement>('[data-mode="annotated"]')?.click();
    expect(container.querySelector(".ofv-lrc-annotated .ofv-lrc-role")).toBeNull();
  });
});

async function waitFor<T>(predicate: () => T | false | null | undefined, timeout = 1000): Promise<T> {
  const start = Date.now();
  let result = predicate();
  while (!result) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    result = predicate();
  }
  return result;
}

function findToolbarButton(container: HTMLElement, title: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-toolbar button")).find(
    (button) => button.getAttribute("aria-label") === title
  );
}

function visibleText(root: HTMLElement): string {
  const parts: string[] = [];
  const walk = (node: Node, hidden: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!hidden) {
        parts.push(node.textContent || "");
      }
      return;
    }
    if (!(node instanceof HTMLElement)) {
      node.childNodes.forEach((child) => walk(child, hidden));
      return;
    }
    const isHidden =
      hidden ||
      node.hidden ||
      node.getAttribute("aria-hidden") === "true" ||
      node.style.display === "none" ||
      node.style.visibility === "hidden";
    node.childNodes.forEach((child) => walk(child, isHidden));
  };
  walk(root, false);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
