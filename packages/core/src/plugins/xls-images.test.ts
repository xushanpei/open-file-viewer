import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readLegacyWorkbookSheetImages } from "./xls-images";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

describe("readLegacyWorkbookSheetImages", () => {
  it("reads BIFF8 drawing images and associates them with worksheet anchors", () => {
    const stream = createLegacyWorkbookStream();
    const cfb = XLSX.CFB.utils.cfb_new();
    XLSX.CFB.utils.cfb_add(cfb, "Workbook", stream, { unsafe: true });
    const file = toArrayBuffer(XLSX.CFB.write(cfb, { type: "array" }));

    const images = readLegacyWorkbookSheetImages(file, XLSX);
    const sheetImages = images?.get(0);

    expect(sheetImages).toHaveLength(1);
    expect(sheetImages?.[0]).toMatchObject({
      row: 2,
      column: 3,
      endRow: 4,
      endColumn: 4,
      fileName: "legacy-image-1.png",
      mimeType: "image/png",
      title: "Legacy Excel embedded image"
    });
    expect(sheetImages?.[0].dataUrl).toContain("data:image/png;base64,");
  });
});

function createLegacyWorkbookStream(): Uint8Array {
  const groupPayload = new Uint8Array(PNG_BYTES.byteLength + 4);
  groupPayload.set([0xde, 0xad, 0xbe, 0xef]);
  groupPayload.set(PNG_BYTES, 4);

  const sheetBof = biffRecord(0x0809, new Uint8Array(16));
  const drawingPayload = escherRecord(
    0xf002,
    0x0f,
    escherRecord(0xf010, 0x00, clientAnchorPayload(3, 2, 4, 4))
  );
  const drawing = biffRecord(0x00ec, drawingPayload);
  const sheetEof = biffRecord(0x000a, new Uint8Array());
  const sheetStream = concatBytes([sheetBof, drawing, sheetEof]);

  const group = biffRecord(0x00eb, groupPayload);
  const globalBof = biffRecord(0x0809, new Uint8Array(16));
  const boundsheetPayload = new Uint8Array(8);
  const sheetOffset = globalBof.byteLength + 12 + group.byteLength + 4;
  new DataView(boundsheetPayload.buffer).setUint32(0, sheetOffset, true);
  boundsheetPayload[5] = 0;
  const boundsheet = biffRecord(0x0085, boundsheetPayload);
  const globalEof = biffRecord(0x000a, new Uint8Array());

  return concatBytes([globalBof, boundsheet, group, globalEof, sheetStream]);
}

function clientAnchorPayload(column: number, row: number, endColumn: number, endRow: number): Uint8Array {
  const payload = new Uint8Array(18);
  const view = new DataView(payload.buffer);
  const values = [column, 0, row, 0, endColumn, 0, endRow, 0];
  values.forEach((value, index) => view.setInt16(2 + index * 2, value, true));
  return payload;
}

function biffRecord(type: number, payload: Uint8Array): Uint8Array {
  const record = new Uint8Array(4 + payload.byteLength);
  const view = new DataView(record.buffer);
  view.setUint16(0, type, true);
  view.setUint16(2, payload.byteLength, true);
  record.set(payload, 4);
  return record;
}

function escherRecord(type: number, version: number, payload: Uint8Array, instance = 0): Uint8Array {
  const record = new Uint8Array(8 + payload.byteLength);
  const view = new DataView(record.buffer);
  view.setUint16(0, (instance << 4) | version, true);
  view.setUint16(2, type, true);
  view.setUint32(4, payload.byteLength, true);
  record.set(payload, 8);
  return record;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
