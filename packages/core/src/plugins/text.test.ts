import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { textPlugin } from "./text";

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

    expect(container.textContent).toContain("文本预览失败");
    expect(container.querySelector<HTMLAnchorElement>(".ofv-fallback a")?.href).toBe("https://example.com/missing.txt");
    expect(onError).not.toHaveBeenCalled();
  });

  it("renders code even when Prism CSS fails to load", async () => {
    const container = document.createElement("div");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["const value = 1;"], { type: "text/javascript" }),
      fileName: "sample.js",
      plugins: [textPlugin()]
    });

    const link = await waitFor(() => document.querySelector<HTMLLinkElement>("link[id^='ofv-prism-css']"));
    link.dispatchEvent(new Event("error"));

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.textContent).toContain("value");
  });

  it("renders extensionless application code MIME blobs as text", async () => {
    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["const answer = 42;"], { type: "application/javascript" }),
      plugins: [textPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-code-container code")));

    expect(container.textContent).toContain("const answer");
    expect(container.querySelector(".ofv-code-title")?.textContent).toContain("javascript");
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

    expect(container.textContent).toContain("结构Object");
    expect(container.textContent).toContain("键3");
    expect(container.textContent).toContain("name, plugins, enabled");
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

    expect(container.textContent).toContain("Notebook3 cells");
    expect(container.textContent).toContain("markdown 1, code 2");
    expect(container.textContent).toContain("KernelPython 3");
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

    expect(container.textContent).toContain("NDJSON4 lines");
    expect(container.textContent).toContain("可解析3");
    expect(container.textContent).toContain("object 2, array 1");
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

    expect(container.querySelector(".ofv-code-notice")?.textContent).toContain("文件较大");
    expect(container.querySelector(".ofv-code-container code")?.textContent).not.toContain("TAIL");

    const copy = Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-code-action")).find(
      (button) => button.textContent === "Copy"
    );
    copy?.click();
    await waitFor(() => writeText.mock.calls.length > 0);
    expect(writeText).toHaveBeenCalledWith(source);
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
