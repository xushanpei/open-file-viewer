import { describe, expect, it } from "vitest";
import type { PreviewFile } from "../types";
import { archivePlugin } from "./archive";
import { assetPlugin } from "./asset";
import { cadPlugin } from "./cad";
import { drawingPlugin } from "./drawing";
import { emailPlugin } from "./email";
import { epubPlugin } from "./epub";
import { gisPlugin } from "./gis";
import { model3dPlugin } from "./model3d";
import { officePlugin } from "./office";
import { ofdPlugin } from "./ofd";
import { videoPlugin } from "./video";
import { xpsPlugin } from "./xps";

describe("plugin MIME matching", () => {
  it("matches complex preview plugins when a Blob has no useful extension", async () => {
    expect(await officePlugin().match(file("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.ms-word.document.macroenabled.12"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.oasis.opendocument.text-flat-xml"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.ms-works"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.openxmlformats-officedocument.spreadsheetml.template"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.oasis.opendocument.spreadsheet-flat-xml"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.apple.numbers"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.openxmlformats-officedocument.presentationml.presentation"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.openxmlformats-officedocument.presentationml.template"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.oasis.opendocument.presentation-flat-xml"))).toBe(true);
    expect(await officePlugin().match(file("application/vnd.apple.keynote"))).toBe(true);
    expect(await archivePlugin().match(file("application/zip"))).toBe(true);
    expect(await emailPlugin().match(file("message/rfc822"))).toBe(true);
    expect(await gisPlugin().match(file("application/vnd.google-earth.kml+xml"))).toBe(true);
    expect(await epubPlugin().match(file("application/epub+zip"))).toBe(true);
    expect(await xpsPlugin().match(file("application/vnd.ms-xpsdocument"))).toBe(true);
    expect(await xpsPlugin().match(file("application/oxps"))).toBe(true);
    expect(await ofdPlugin().match(file("application/ofd"))).toBe(true);
    expect(await cadPlugin().match(file("application/acad"))).toBe(true);
    expect(await cadPlugin().match(file("image/vnd.dxf"))).toBe(true);
    expect(await drawingPlugin().match(file("application/vnd.jgraph.mxfile"))).toBe(true);
    expect(await drawingPlugin().match(file("application/vnd.excalidraw+json"))).toBe(true);
    expect(await model3dPlugin().match(file("model/gltf-binary"))).toBe(true);
    expect(await model3dPlugin().match(file("model/3mf"))).toBe(true);
    expect(await model3dPlugin().match(file("application/ply"))).toBe(true);
    expect(await model3dPlugin().match(file("application/vnd.autodesk.fbx"))).toBe(true);
    expect(await model3dPlugin().match(file("application/octet-stream"))).toBe(false);
    expect(await videoPlugin().match(file("application/vnd.apple.mpegurl"))).toBe(true);
    expect(await videoPlugin().match(file("video/x-matroska"))).toBe(true);
    expect(await videoPlugin().match(file("video/mp2t"))).toBe(true);
    expect(await videoPlugin().match({ ...file("text/typescript"), name: "code.ts", extension: "ts" })).toBe(false);
    expect(await assetPlugin().match(file("font/woff2"))).toBe(true);
    expect(await assetPlugin().match(file("image/vnd.adobe.photoshop"))).toBe(true);
    expect(await assetPlugin().match(file("application/vnd.sqlite3"))).toBe(true);
    expect(await assetPlugin().match(file("application/wasm"))).toBe(true);
  });
});

function file(mimeType: string): PreviewFile {
  return {
    source: new Blob(["x"], { type: mimeType }),
    name: "blob",
    extension: "",
    mimeType,
    size: 1,
    blob: new Blob(["x"], { type: mimeType })
  };
}
