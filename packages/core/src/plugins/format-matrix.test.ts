import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createViewer } from "../viewer";
import type { PreviewFile, PreviewPlugin } from "../types";
import { archivePlugin } from "./archive";
import { assetPlugin } from "./asset";
import { audioPlugin } from "./audio";
import { cadPlugin } from "./cad";
import { drawingPlugin } from "./drawing";
import { emailPlugin } from "./email";
import { epubPlugin } from "./epub";
import { gisPlugin } from "./gis";
import { imagePlugin } from "./image";
import { model3dPlugin } from "./model3d";
import { officePlugin } from "./office";
import { ofdPlugin } from "./ofd";
import { pdfPlugin } from "./pdf";
import { textPlugin } from "./text";
import { videoPlugin } from "./video";
import { xpsPlugin } from "./xps";

type FormatCase = {
  plugin: PreviewPlugin;
  extensions: string[];
  mimeType?: string;
};

const matrix: FormatCase[] = [
  {
    plugin: textPlugin(),
    extensions: [
      "txt",
      "log",
      "env",
      "gitignore",
      "dockerignore",
      "npmrc",
      "yarnrc",
      "pnpmrc",
      "editorconfig",
      "browserslistrc",
      "prettierrc",
      "eslintrc",
      "stylelintrc",
      "conf",
      "config",
      "properties",
      "lock",
      "json",
      "jsonc",
      "json5",
      "ipynb",
      "jsonl",
      "ndjson",
      "xml",
      "yaml",
      "yml",
      "csv",
      "tsv",
      "md",
      "markdown",
      "toml",
      "ini",
      "proto",
      "tf",
      "tfvars",
      "hcl",
      "tex",
      "latex",
      "bib",
      "gv",
      "http",
      "css",
      "scss",
      "less",
      "js",
      "mjs",
      "cjs",
      "ts",
      "tsx",
      "jsx",
      "html",
      "htm",
      "vue",
      "py",
      "java",
      "go",
      "rs",
      "rb",
      "swift",
      "kt",
      "kts",
      "scala",
      "lua",
      "r",
      "dart",
      "svelte",
      "astro",
      "elm",
      "ex",
      "exs",
      "clj",
      "cljs",
      "erl",
      "hrl",
      "fs",
      "fsx",
      "hs",
      "lhs",
      "php",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "sql",
      "sh",
      "bash",
      "zsh",
      "fish",
      "ps1",
      "bat",
      "cmd",
      "dockerfile",
      "nginxconf",
      "gradle",
      "graphql",
      "gql",
      "pem",
      "crt",
      "cer",
      "ics",
      "vcf",
      "diff",
      "patch"
    ],
    mimeType: "text/plain"
  },
  {
    plugin: imagePlugin(),
    extensions: [
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
    ],
    mimeType: "image/png"
  },
  {
    plugin: audioPlugin(),
    extensions: [
      "mp3",
      "wav",
      "aif",
      "aiff",
      "aifc",
      "ogg",
      "oga",
      "aac",
      "m4a",
      "flac",
      "opus",
      "weba",
      "amr",
      "mid",
      "midi",
      "caf",
      "au",
      "snd",
      "wma"
    ],
    mimeType: "audio/mpeg"
  },
  {
    plugin: videoPlugin(),
    extensions: [
      "mp4",
      "mpg",
      "mpeg",
      "mpe",
      "mpv",
      "webm",
      "ogv",
      "mov",
      "m4v",
      "avi",
      "mkv",
      "flv",
      "wmv",
      "3gp",
      "3g2",
      "m2ts",
      "m3u8"
    ],
    mimeType: "video/mp4"
  },
  { plugin: pdfPlugin({ pdfjs: fakePdfJs() as any }), extensions: ["pdf"], mimeType: "application/pdf" },
  { plugin: epubPlugin(), extensions: ["epub"], mimeType: "application/epub+zip" },
  { plugin: xpsPlugin(), extensions: ["xps", "oxps"], mimeType: "application/vnd.ms-xpsdocument" },
  { plugin: ofdPlugin(), extensions: ["ofd"], mimeType: "application/ofd" },
  { plugin: archivePlugin(), extensions: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"], mimeType: "application/zip" },
  { plugin: emailPlugin(), extensions: ["eml", "msg", "mbox"], mimeType: "message/rfc822" },
  {
    plugin: drawingPlugin(),
    extensions: ["drawio", "dio", "excalidraw", "tldraw"],
    mimeType: "application/vnd.jgraph.mxfile"
  },
  { plugin: gisPlugin(), extensions: ["geojson", "topojson", "kml", "kmz", "gpx", "shp"], mimeType: "application/geo+json" },
  {
    plugin: model3dPlugin(),
    extensions: ["gltf", "glb", "obj", "stl", "fbx", "dae", "ply", "3mf", "3ds", "usd", "usda", "usdc", "usdz", "wrl", "vrml"],
    mimeType: "model/gltf-binary"
  },
  {
    plugin: cadPlugin(),
    extensions: ["dxf", "dwg", "dwf", "step", "stp", "iges", "igs", "ifc", "sat", "sab", "x_t", "x_b", "3dm", "skp", "sldprt", "sldasm", "gds", "oas", "oasis"],
    mimeType: "image/vnd.dxf"
  },
  {
    plugin: officePlugin(),
    extensions: [
      "docx",
      "docm",
      "doc",
      "dotx",
      "dotm",
      "dot",
      "rtf",
      "odt",
      "fodt",
      "wps",
      "xlsx",
      "xls",
      "xlt",
      "xlsm",
      "xlsb",
      "xltx",
      "xltm",
      "ods",
      "fods",
      "numbers",
      "et",
      "pptx",
      "pptm",
      "ppt",
      "pps",
      "ppsx",
      "ppsm",
      "potx",
      "potm",
      "odp",
      "fodp",
      "key",
      "dps"
    ],
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  },
  {
    plugin: assetPlugin(),
    extensions: [
      "ttf",
      "otf",
      "woff",
      "woff2",
      "eot",
      "psd",
      "psb",
      "ai",
      "eps",
      "ps",
      "webarchive",
      "sqlite",
      "sqlite3",
      "db",
      "wasm",
      "parquet",
      "avro"
    ],
    mimeType: "application/octet-stream"
  }
];

describe("format support matrix", () => {
  it("routes every extension that core MIME detection knows about", () => {
    const detectedExtensions = readDetectedExtensions();
    const routedExtensions = new Set(routingCases().map((item) => item.extension));
    const missing = detectedExtensions.filter((extension) => !routedExtensions.has(extension));

    expect(missing).toEqual([]);
  });

  it("documents every extension that core MIME detection knows about", () => {
    const detectedExtensions = readDetectedExtensions();
    const documentedExtensions = new Set(matrix.flatMap((item) => item.extensions));
    const missing = detectedExtensions.filter((extension) => !documentedExtensions.has(extension));

    expect(missing).toEqual([]);
  });

  it("keeps every documented extension covered by core MIME detection", () => {
    const detectedExtensions = new Set(readDetectedExtensions());
    const documentedExtensions = [...new Set(matrix.flatMap((item) => item.extensions))].sort();
    const missing = documentedExtensions.filter((extension) => !detectedExtensions.has(extension));

    expect(missing).toEqual([]);
  });

  it("keeps plugin-declared extensions covered by core MIME detection", () => {
    const detectedExtensions = new Set(readDetectedExtensions());
    const declaredExtensions = readPluginDeclaredExtensions();
    const missing = declaredExtensions.filter((extension) => !detectedExtensions.has(extension));

    expect(missing).toEqual([]);
  });

  it("routes every specific MIME type that core MIME detection knows about", () => {
    const detectedMimeTypes = readDetectedMimeTypes().filter((mimeType) => mimeType !== "application/octet-stream");
    const routedMimeTypes = new Set(mimeOnlyRoutingCases().map((item) => item.mimeType));
    const missing = detectedMimeTypes.filter((mimeType) => !routedMimeTypes.has(mimeType));

    expect(missing).toEqual([]);
  });

  it("routes every specific MIME type declared by positive plugin match lists", () => {
    const declaredMimeTypes = readPluginDeclaredMimeTypes();
    const routedMimeTypes = new Set(mimeOnlyRoutingCases().map((item) => item.mimeType));
    const missing = declaredMimeTypes.filter((mimeType) => !routedMimeTypes.has(mimeType));

    expect(missing).toEqual([]);
  });

  it.each(matrix)("$plugin.name claims every documented extension", async ({ plugin, extensions, mimeType }) => {
    for (const extension of extensions) {
      expect(await matches(plugin, file(`sample.${extension}`, mimeType || "")), extension).toBe(true);
    }
  });

  it("does not let ambiguous .ogg audio get claimed by the video plugin without a video MIME type", async () => {
    await expect(matches(videoPlugin(), file("track.ogg", ""))).resolves.toBe(false);
    await expect(matches(audioPlugin(), file("track.ogg", ""))).resolves.toBe(true);
    await expect(matches(videoPlugin(), file("movie.ogg", "video/ogg"))).resolves.toBe(true);
  });

  it("keeps raster image matching from claiming CAD image MIME files", async () => {
    await expect(matches(imagePlugin(), file("drawing.dxf", "image/vnd.dxf"))).resolves.toBe(false);
    await expect(matches(cadPlugin(), file("drawing.dxf", "image/vnd.dxf"))).resolves.toBe(true);
  });

  it("keeps raster image matching from claiming Photoshop documents", async () => {
    await expect(matches(imagePlugin(), file("poster.psd", "image/vnd.adobe.photoshop"))).resolves.toBe(false);
    await expect(matches(assetPlugin(), file("poster.psd", "image/vnd.adobe.photoshop"))).resolves.toBe(true);
  });

  it("keeps TypeScript source files out of the video plugin despite the .ts extension", async () => {
    await expect(matches(videoPlugin(), file("source.ts", "text/typescript"))).resolves.toBe(false);
    await expect(matches(textPlugin(), file("source.ts", "text/typescript"))).resolves.toBe(true);
    await expect(matches(videoPlugin(), file("stream.ts", "video/mp2t"))).resolves.toBe(true);
    await expect(matches(videoPlugin(), file("movie.mp4", ""))).resolves.toBe(true);
  });

  it("lets model MIME types recover generic binary filenames without stealing text-like files", async () => {
    await expect(matches(model3dPlugin(), file("upload.bin", "model/gltf-binary"))).resolves.toBe(true);
    await expect(matches(model3dPlugin(), file("scene.json", "model/gltf+json"))).resolves.toBe(false);
    await expect(matches(textPlugin(), file("scene.json", "model/gltf+json"))).resolves.toBe(true);
  });

  it.each(filenameRoutingCases())("routes extensionless $fileName files to $expected in the default viewer order", async ({ fileName, expected }) => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["sample"], { type: "" }),
      fileName,
      plugins: defaultOrderPlugins().map(markerPlugin)
    });

    await waitFor(() => Boolean(container.querySelector("[data-plugin]")));

    expect(container.querySelector("[data-plugin]")?.getAttribute("data-plugin")).toBe(expected);

    viewer.destroy();
    container.remove();
  });

  it.each(routingCases())("routes .$extension files to $expected in the default viewer order", async ({ extension, mimeType, expected }) => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob([samplePayload(extension)], { type: mimeType }),
      fileName: `sample.${extension}`,
      plugins: defaultOrderPlugins().map(markerPlugin)
    });

    await waitFor(() => Boolean(container.querySelector("[data-plugin]")));

    expect(container.querySelector("[data-plugin]")?.getAttribute("data-plugin")).toBe(expected);

    viewer.destroy();
    container.remove();
  });

  it.each(mimeOnlyRoutingCases())("routes $mimeType blobs to $expected without a file extension", async ({ mimeType, expected }) => {
    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob([samplePayload("")], { type: mimeType }),
      plugins: defaultOrderPlugins().map(markerPlugin)
    });

    await waitFor(() => Boolean(container.querySelector("[data-plugin]")));

    expect(container.querySelector("[data-plugin]")?.getAttribute("data-plugin")).toBe(expected);

    viewer.destroy();
    container.remove();
  });
});

async function matches(plugin: PreviewPlugin, previewFile: PreviewFile): Promise<boolean> {
  return Promise.resolve(plugin.match(previewFile));
}

function file(name: string, mimeType: string): PreviewFile {
  return {
    source: new Blob(["x"], { type: mimeType }),
    name,
    extension: name.split(".").pop() || "",
    mimeType,
    size: 1,
    blob: new Blob(["x"], { type: mimeType })
  };
}

function fakePdfJs() {
  return {
    version: "4.0.0-test",
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument: () => ({ promise: Promise.resolve({ numPages: 0, getPage: async () => undefined }) })
  };
}

function defaultOrderPlugins(): PreviewPlugin[] {
  return [
    imagePlugin(),
    videoPlugin(),
    audioPlugin(),
    pdfPlugin({ pdfjs: fakePdfJs() as any }),
    epubPlugin(),
    xpsPlugin(),
    officePlugin(),
    ofdPlugin(),
    archivePlugin(),
    emailPlugin(),
    drawingPlugin(),
    cadPlugin(),
    model3dPlugin(),
    gisPlugin(),
    assetPlugin(),
    textPlugin()
  ];
}

function markerPlugin(plugin: PreviewPlugin): PreviewPlugin {
  return {
    name: plugin.name,
    match: plugin.match,
    render(ctx) {
      const marker = document.createElement("div");
      marker.dataset.plugin = plugin.name;
      marker.textContent = `${plugin.name}:${ctx.file.name}`;
      ctx.viewport.append(marker);
      return {
        destroy() {
          marker.remove();
        }
      };
    }
  };
}

function routingCases(): Array<{ extension: string; mimeType: string; expected: string }> {
  return [
    ...casesFor("text", [
      "txt",
      "log",
      "env",
      "gitignore",
      "dockerignore",
      "npmrc",
      "yarnrc",
      "pnpmrc",
      "editorconfig",
      "browserslistrc",
      "prettierrc",
      "eslintrc",
      "stylelintrc",
      "conf",
      "config",
      "properties",
      "lock",
      "json",
      "jsonc",
      "json5",
      "ipynb",
      "jsonl",
      "ndjson",
      "xml",
      "yaml",
      "yml",
      "md",
      "markdown",
      "toml",
      "ini",
      "proto",
      "tf",
      "tfvars",
      "hcl",
      "tex",
      "latex",
      "bib",
      "gv",
      "http",
      "css",
      "scss",
      "less",
      "js",
      "mjs",
      "cjs",
      "ts",
      "tsx",
      "jsx",
      "html",
      "htm",
      "vue",
      "py",
      "java",
      "go",
      "rs",
      "rb",
      "swift",
      "kt",
      "kts",
      "scala",
      "lua",
      "r",
      "dart",
      "svelte",
      "astro",
      "elm",
      "ex",
      "exs",
      "clj",
      "cljs",
      "erl",
      "hrl",
      "fs",
      "fsx",
      "hs",
      "lhs",
      "php",
      "c",
      "cpp",
      "h",
      "hpp",
      "cs",
      "sql",
      "sh",
      "bash",
      "zsh",
      "fish",
      "ps1",
      "bat",
      "cmd",
      "dockerfile",
      "nginxconf",
      "gradle",
      "graphql",
      "gql",
      "pem",
      "crt",
      "cer",
      "ics",
      "vcf",
      "diff",
      "patch"
    ]),
    ...casesFor("image", ["jpg", "jpeg", "jfif", "pjpe", "pjpeg", "png", "gif", "webp", "avif", "jxl", "svg", "bmp", "ico", "cur", "tif", "tiff", "apng", "heic", "heif"], "image/png"),
    ...casesFor("audio", ["mp3", "wav", "aif", "aiff", "aifc", "ogg", "oga", "aac", "m4a", "flac", "opus", "weba", "amr", "mid", "midi", "caf", "au", "snd", "wma"], "audio/mpeg"),
    ...casesFor("video", ["mp4", "mpg", "mpeg", "mpe", "mpv", "webm", "ogv", "mov", "m4v", "avi", "mkv", "flv", "wmv", "3gp", "3g2", "m2ts"], "video/mp4"),
    { extension: "m3u8", mimeType: "application/vnd.apple.mpegurl", expected: "video" },
    { extension: "pdf", mimeType: "application/pdf", expected: "pdf" },
    { extension: "epub", mimeType: "application/epub+zip", expected: "epub" },
    ...casesFor("xps", ["xps", "oxps"], "application/vnd.ms-xpsdocument"),
    { extension: "ofd", mimeType: "application/ofd", expected: "ofd" },
    ...casesFor("archive", ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"], "application/zip"),
    ...casesFor("email", ["eml", "msg", "mbox"], "message/rfc822"),
    ...casesFor("drawing", ["drawio", "dio", "excalidraw", "tldraw"], "application/vnd.jgraph.mxfile"),
    { extension: "dxf", mimeType: "image/vnd.dxf", expected: "cad" },
    { extension: "dwg", mimeType: "application/acad", expected: "cad" },
    { extension: "dwf", mimeType: "model/vnd.dwf", expected: "cad" },
    { extension: "step", mimeType: "model/step", expected: "cad" },
    { extension: "stp", mimeType: "model/step", expected: "cad" },
    { extension: "iges", mimeType: "application/iges", expected: "cad" },
    { extension: "igs", mimeType: "application/iges", expected: "cad" },
    { extension: "ifc", mimeType: "application/x-step", expected: "cad" },
    { extension: "sat", mimeType: "application/sat", expected: "cad" },
    { extension: "sab", mimeType: "application/sab", expected: "cad" },
    { extension: "x_t", mimeType: "application/x-parasolid", expected: "cad" },
    { extension: "x_b", mimeType: "application/x-parasolid", expected: "cad" },
    { extension: "3dm", mimeType: "model/vnd.3dm", expected: "cad" },
    { extension: "skp", mimeType: "application/vnd.sketchup.skp", expected: "cad" },
    { extension: "sldprt", mimeType: "application/sldworks", expected: "cad" },
    { extension: "sldasm", mimeType: "application/sldworks", expected: "cad" },
    { extension: "gds", mimeType: "application/vnd.gds", expected: "cad" },
    { extension: "oas", mimeType: "application/vnd.oasis.layout", expected: "cad" },
    { extension: "oasis", mimeType: "application/vnd.oasis.layout", expected: "cad" },
    ...casesFor("model3d", ["gltf", "glb", "obj", "stl", "fbx", "dae", "ply", "3mf", "3ds", "usd", "usda", "usdc", "usdz", "wrl", "vrml"], "model/gltf-binary"),
    ...casesFor("gis", ["geojson", "topojson", "kml", "kmz", "gpx", "shp"], "application/geo+json"),
    ...casesFor("asset", ["ttf", "otf", "woff", "woff2", "eot", "psd", "psb", "ai", "eps", "ps", "webarchive", "sqlite", "sqlite3", "db", "wasm", "parquet", "avro"], "application/octet-stream"),
    ...casesFor("office", [
      "docx",
      "docm",
      "doc",
      "dotx",
      "dotm",
      "dot",
      "rtf",
      "odt",
      "fodt",
      "wps",
      "xlsx",
      "xls",
      "xlt",
      "xlsm",
      "xlsb",
      "xltx",
      "xltm",
      "csv",
      "tsv",
      "ods",
      "fods",
      "numbers",
      "et",
      "pptx",
      "pptm",
      "ppt",
      "pps",
      "ppsx",
      "ppsm",
      "potx",
      "potm",
      "odp",
      "fodp",
      "key",
      "dps"
    ], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  ];
}

function mimeOnlyRoutingCases(): Array<{ mimeType: string; expected: string }> {
  return [
    ...mimeCasesFor("text", [
      "text/plain",
      "text/markdown",
      "text/css",
      "text/csv",
      "text/html",
      "text/javascript",
      "text/rust",
      "text/tab-separated-values",
      "text/typescript",
      "text/vnd.graphviz",
      "text/x-c",
      "text/x-c++hdr",
      "text/x-c++src",
      "text/x-csharp",
      "text/x-clojure",
      "text/x-dart",
      "text/x-elixir",
      "text/x-elm",
      "text/x-erlang",
      "text/x-fsharp",
      "text/x-diff",
      "text/x-go",
      "text/x-haskell",
      "text/x-hcl",
      "text/x-java-source",
      "text/x-kotlin",
      "text/x-lua",
      "text/x-python",
      "text/x-protobuf",
      "text/x-r",
      "text/x-ruby",
      "text/x-scala",
      "text/x-swift",
      "text/yaml",
      "text/xml",
      "text/calendar",
      "text/vcard",
      "text/x-bibtex",
      "application/json",
      "application/json5",
      "application/x-ipynb+json",
      "application/xml",
      "application/yaml",
      "application/x-yaml",
      "application/sql",
      "application/javascript",
      "application/x-javascript",
      "application/typescript",
      "application/x-typescript",
      "application/toml",
      "application/x-toml",
      "application/x-ndjson",
      "application/graphql",
      "application/x-httpd-php",
      "application/x-sh",
      "application/x-pem-file",
      "application/x-x509-ca-cert",
      "application/pkix-cert",
      "application/x-tex",
      "message/http"
    ]),
    ...mimeCasesFor("image", [
      "image/png",
      "image/jpeg",
      "image/pjpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "image/jxl",
      "image/svg+xml",
      "image/bmp",
      "image/x-icon",
      "image/tiff",
      "image/apng",
      "image/heic",
      "image/heif",
      "image/heic-sequence",
      "image/heif-sequence"
    ]),
    { mimeType: "image/vnd.dxf", expected: "cad" },
    ...mimeCasesFor("audio", [
      "audio/mpeg",
      "audio/wav",
      "audio/aiff",
      "audio/aac",
      "audio/mp4",
      "audio/flac",
      "audio/opus",
      "audio/ogg",
      "audio/webm",
      "audio/amr",
      "audio/midi",
      "audio/x-caf",
      "audio/basic",
      "audio/x-ms-wma"
    ]),
    ...mimeCasesFor("video", [
      "video/mp4",
      "video/mpeg",
      "video/mpv",
      "video/webm",
      "video/ogg",
      "video/quicktime",
      "video/x-m4v",
      "video/x-msvideo",
      "video/x-matroska",
      "video/x-flv",
      "video/x-ms-wmv",
      "video/3gpp",
      "video/3gpp2",
      "video/mp2t",
      "application/vnd.apple.mpegurl",
      "application/x-mpegurl",
      "application/mpegurl",
      "application/dash+xml"
    ]),
    { mimeType: "application/pdf", expected: "pdf" },
    { mimeType: "application/epub+zip", expected: "epub" },
    { mimeType: "application/x-epub+zip", expected: "epub" },
    { mimeType: "application/vnd.ms-xpsdocument", expected: "xps" },
    { mimeType: "application/oxps", expected: "xps" },
    { mimeType: "application/ofd", expected: "ofd" },
    { mimeType: "application/zip", expected: "archive" },
    { mimeType: "application/x-zip-compressed", expected: "archive" },
    { mimeType: "application/vnd.rar", expected: "archive" },
    { mimeType: "application/x-rar-compressed", expected: "archive" },
    { mimeType: "application/x-7z-compressed", expected: "archive" },
    { mimeType: "application/x-tar", expected: "archive" },
    { mimeType: "application/gzip", expected: "archive" },
    { mimeType: "application/x-gzip", expected: "archive" },
    { mimeType: "application/x-bzip2", expected: "archive" },
    { mimeType: "application/x-xz", expected: "archive" },
    { mimeType: "message/rfc822", expected: "email" },
    { mimeType: "application/vnd.ms-outlook", expected: "email" },
    { mimeType: "application/mbox", expected: "email" },
    { mimeType: "application/vnd.jgraph.mxfile", expected: "drawing" },
    { mimeType: "application/vnd.excalidraw+json", expected: "drawing" },
    { mimeType: "application/x-excalidraw+json", expected: "drawing" },
    { mimeType: "application/geo+json", expected: "gis" },
    { mimeType: "application/vnd.geo+json", expected: "gis" },
    { mimeType: "application/topo+json", expected: "gis" },
    { mimeType: "application/vnd.google-earth.kml+xml", expected: "gis" },
    { mimeType: "application/vnd.google-earth.kmz", expected: "gis" },
    { mimeType: "application/gpx+xml", expected: "gis" },
    { mimeType: "model/gltf-binary", expected: "model3d" },
    { mimeType: "model/3mf", expected: "model3d" },
    { mimeType: "model/3ds", expected: "model3d" },
    { mimeType: "model/stl", expected: "model3d" },
    { mimeType: "model/obj", expected: "model3d" },
    { mimeType: "model/vnd.collada+xml", expected: "model3d" },
    { mimeType: "model/vnd.usd", expected: "model3d" },
    { mimeType: "model/vnd.usdz+zip", expected: "model3d" },
    { mimeType: "model/vrml", expected: "model3d" },
    { mimeType: "application/sla", expected: "model3d" },
    { mimeType: "application/vnd.ms-pki.stl", expected: "model3d" },
    { mimeType: "application/ply", expected: "model3d" },
    { mimeType: "application/vnd.autodesk.fbx", expected: "model3d" },
    { mimeType: "model/gltf+json", expected: "model3d" },
    { mimeType: "model/step", expected: "cad" },
    { mimeType: "application/acad", expected: "cad" },
    { mimeType: "application/dxf", expected: "cad" },
    { mimeType: "application/x-dxf", expected: "cad" },
    { mimeType: "model/vnd.dwf", expected: "cad" },
    { mimeType: "application/step", expected: "cad" },
    { mimeType: "application/iges", expected: "cad" },
    { mimeType: "application/x-step", expected: "cad" },
    { mimeType: "application/sat", expected: "cad" },
    { mimeType: "application/sab", expected: "cad" },
    { mimeType: "application/x-parasolid", expected: "cad" },
    { mimeType: "model/vnd.3dm", expected: "cad" },
    { mimeType: "application/vnd.sketchup.skp", expected: "cad" },
    { mimeType: "application/sldworks", expected: "cad" },
    { mimeType: "application/vnd.gds", expected: "cad" },
    { mimeType: "application/x-gdsii", expected: "cad" },
    { mimeType: "application/vnd.oasis.layout", expected: "cad" },
    { mimeType: "application/x-oasis-layout", expected: "cad" },
    ...mimeCasesFor("office", [
      "application/msword",
      "application/rtf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-word.document.macroenabled.12",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
      "application/vnd.ms-word.template.macroenabled.12",
      "application/vnd.oasis.opendocument.text",
      "application/vnd.oasis.opendocument.text-flat-xml",
      "application/vnd.ms-works",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
      "application/vnd.ms-excel.sheet.macroenabled.12",
      "application/vnd.ms-excel.sheet.binary.macroenabled.12",
      "application/vnd.ms-excel.template.macroenabled.12",
      "application/vnd.oasis.opendocument.spreadsheet",
      "application/vnd.oasis.opendocument.spreadsheet-flat-xml",
      "application/vnd.apple.numbers",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint.presentation.macroenabled.12",
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
      "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
      "application/vnd.openxmlformats-officedocument.presentationml.template",
      "application/vnd.ms-powerpoint.template.macroenabled.12",
      "application/vnd.oasis.opendocument.presentation",
      "application/vnd.oasis.opendocument.presentation-flat-xml",
      "application/vnd.apple.keynote"
    ]),
    { mimeType: "font/ttf", expected: "asset" },
    { mimeType: "font/otf", expected: "asset" },
    { mimeType: "font/woff", expected: "asset" },
    { mimeType: "font/woff2", expected: "asset" },
    { mimeType: "application/vnd.ms-fontobject", expected: "asset" },
    { mimeType: "image/vnd.adobe.photoshop", expected: "asset" },
    { mimeType: "application/postscript", expected: "asset" },
    { mimeType: "application/x-webarchive", expected: "asset" },
    { mimeType: "application/vnd.sqlite3", expected: "asset" },
    { mimeType: "application/x-sqlite3", expected: "asset" },
    { mimeType: "application/wasm", expected: "asset" },
    { mimeType: "application/vnd.apache.parquet", expected: "asset" },
    { mimeType: "application/avro", expected: "asset" }
  ];
}

function filenameRoutingCases(): Array<{ fileName: string; expected: string }> {
  return [
    { fileName: "Dockerfile", expected: "text" },
    { fileName: "Makefile", expected: "text" },
    { fileName: "Gemfile", expected: "text" },
    { fileName: "Rakefile", expected: "text" },
    { fileName: "Procfile", expected: "text" },
    { fileName: "Jenkinsfile", expected: "text" },
    { fileName: "Vagrantfile", expected: "text" },
    { fileName: "Brewfile", expected: "text" },
    { fileName: "Podfile", expected: "text" },
    { fileName: "go.mod", expected: "text" },
    { fileName: "go.sum", expected: "text" },
    { fileName: "Cargo.toml", expected: "text" },
    { fileName: "Cargo.lock", expected: "text" },
    { fileName: "README", expected: "text" },
    { fileName: "README.zh-CN", expected: "text" },
    { fileName: "CHANGELOG", expected: "text" },
    { fileName: "LICENSE", expected: "text" },
    { fileName: "NOTICE", expected: "text" },
    { fileName: "AUTHORS", expected: "text" },
    { fileName: "CONTRIBUTORS", expected: "text" },
    { fileName: "CODEOWNERS", expected: "text" }
  ];
}

function casesFor(expected: string, extensions: string[], mimeType = "text/plain") {
  return extensions.map((extension) => ({ extension, mimeType, expected }));
}

function mimeCasesFor(expected: string, mimeTypes: string[]) {
  return mimeTypes.map((mimeType) => ({ mimeType, expected }));
}

function samplePayload(extension: string): string {
  if (extension === "geojson") {
    return '{"type":"FeatureCollection","features":[]}';
  }
  if (extension === "excalidraw") {
    return '{"type":"excalidraw","elements":[]}';
  }
  return "sample";
}

function readDetectedExtensions(): string[] {
  const source = readFileSync(resolve(process.cwd(), "packages/core/src/detect.ts"), "utf8");
  const mapBody = source.match(/const extensionMimeMap: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1];
  if (!mapBody) {
    throw new Error("Unable to find extensionMimeMap in detect.ts.");
  }
  return [...mapBody.matchAll(/^\s*(?:"([^"]+)"|([a-zA-Z0-9_]+)):\s*"/gm)]
    .map((match) => match[1] || match[2])
    .sort();
}

function readDetectedMimeTypes(): string[] {
  const source = readFileSync(resolve(process.cwd(), "packages/core/src/detect.ts"), "utf8");
  const mapBody = source.match(/const extensionMimeMap: Record<string, string> = \{([\s\S]*?)\n\};/)?.[1];
  if (!mapBody) {
    throw new Error("Unable to find extensionMimeMap in detect.ts.");
  }
  return [...new Set([...mapBody.matchAll(/^\s*(?:"[^"]+"|[a-zA-Z0-9_]+):\s*"([^"]+)"/gm)].map((match) => match[1]))].sort();
}

function readPluginDeclaredMimeTypes(): string[] {
  const declarations: Array<{ file: string; sets?: string[]; maps?: string[] }> = [
    { file: "archive.ts", sets: ["archiveMimeTypes"], maps: ["archiveMimeFormatMap"] },
    { file: "asset.ts", maps: ["assetMimeFormatMap"] },
    { file: "cad.ts", sets: ["cadMimeTypes"], maps: ["cadMimeFormatMap"] },
    { file: "drawing.ts", maps: ["drawingMimeFormatMap"] },
    { file: "email.ts", sets: ["emailMimeTypes"], maps: ["emailMimeFormatMap"] },
    { file: "epub.ts", sets: ["epubMimeTypes"] },
    { file: "gis.ts", maps: ["gisMimeFormatMap"] },
    { file: "image.ts", sets: ["heicMimeTypes"] },
    { file: "model3d.ts", sets: ["modelMimeTypes"], maps: ["modelMimeFormatMap"] },
    { file: "office.ts", sets: ["officeMimeTypes"], maps: ["officeMimeFormatMap"] },
    { file: "text.ts", maps: ["mimeLangMap"] },
    { file: "video.ts", sets: ["videoMimeTypes"] },
    { file: "xps.ts", sets: ["xpsMimeTypes"] }
  ];
  const mimeTypes = new Set<string>();

  for (const declaration of declarations) {
    const source = readFileSync(resolve(process.cwd(), "packages/core/src/plugins", declaration.file), "utf8");
    for (const setName of declaration.sets || []) {
      for (const mimeType of readStringSetValues(source, setName)) {
        mimeTypes.add(mimeType);
      }
    }
    for (const mapName of declaration.maps || []) {
      for (const mimeType of readRecordKeys(source, mapName)) {
        mimeTypes.add(mimeType);
      }
    }
  }

  return [...mimeTypes].sort();
}

function readPluginDeclaredExtensions(): string[] {
  const declarations: Array<{ file: string; sets: string[] }> = [
    { file: "archive.ts", sets: ["archiveExtensions"] },
    { file: "asset.ts", sets: ["assetExtensions"] },
    { file: "audio.ts", sets: ["audioExtensions"] },
    { file: "cad.ts", sets: ["cadExtensions"] },
    { file: "drawing.ts", sets: ["drawingExtensions"] },
    { file: "email.ts", sets: ["emailExtensions"] },
    { file: "image.ts", sets: ["imageExtensions", "nonRasterImageExtensions"] },
    { file: "model3d.ts", sets: ["modelExtensions"] },
    { file: "office.ts", sets: ["wordExtensions", "sheetExtensions", "presentationExtensions"] }
  ];
  const extensions = new Set<string>();

  for (const declaration of declarations) {
    const source = readFileSync(resolve(process.cwd(), "packages/core/src/plugins", declaration.file), "utf8");
    for (const setName of declaration.sets) {
      for (const extension of readStringSetValues(source, setName)) {
        extensions.add(extension);
      }
    }
  }

  return [...extensions].sort();
}

function readStringSetValues(source: string, setName: string): string[] {
  const body = source.match(new RegExp(`const ${setName} = new Set\\(\\[([\\s\\S]*?)\\]\\);`))?.[1];
  if (!body) {
    throw new Error(`Unable to find ${setName}.`);
  }
  return [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function readRecordKeys(source: string, recordName: string): string[] {
  const body = source.match(new RegExp(`const ${recordName}(?:: Record<string, string>)? = \\{([\\s\\S]*?)\\n\\};`))?.[1];
  if (!body) {
    throw new Error(`Unable to find ${recordName}.`);
  }
  return [...body.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]);
}

async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
