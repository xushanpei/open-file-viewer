type XlsxCfbApi = {
  CFB: typeof import("xlsx").CFB;
};

export type WorkbookSheetImage = {
  row: number;
  column: number;
  endRow?: number;
  endColumn?: number;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  title?: string;
};

type BitmapImage = {
  mimeType: string;
  extension: string;
  bytes: Uint8Array;
};

type SheetAnchor = {
  row: number;
  column: number;
  endRow?: number;
  endColumn?: number;
};

type BiffRecord = {
  start: number;
  payloadStart: number;
  end: number;
  type: number;
};

type EscherRecord = {
  payloadStart: number;
  end: number;
  version: number;
  instance: number;
  type: number;
};

const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const BIFF_BOUNDSHEET = 0x0085;
const BIFF_CONTINUE = 0x003c;
const BIFF_MSODRAWING_GROUP = 0x00eb;
const BIFF_MSODRAWING = 0x00ec;
const ESCHER_CLIENT_ANCHOR = 0xf010;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_END = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const JPEG_END = [0xff, 0xd9];

/**
 * Reads images from legacy BIFF8 workbooks stored in an OLE compound file.
 * WPS and Excel may keep an old .xls package behind a .xlsx extension.
 */
export function readLegacyWorkbookSheetImages(
  arrayBuffer: ArrayBuffer,
  xlsx: XlsxCfbApi
): Map<number, WorkbookSheetImage[]> | undefined {
  const fileBytes = new Uint8Array(arrayBuffer);
  if (!hasBytesAt(fileBytes, 0, CFB_SIGNATURE)) {
    return undefined;
  }

  const cfb = xlsx.CFB.read(fileBytes, { type: "array" });
  const workbookEntry = xlsx.CFB.find(cfb, "Workbook") || xlsx.CFB.find(cfb, "Book");
  if (!workbookEntry?.content) {
    return new Map();
  }

  const stream = toUint8Array(workbookEntry.content);
  const sheetOffsets = readWorksheetOffsets(stream);
  const images = readMsoDrawingImages(stream);
  if (images.length === 0) {
    return new Map();
  }

  const result = new Map<number, WorkbookSheetImage[]>();
  for (const [sheetIndex, sheetOffset] of sheetOffsets.entries()) {
    const nextSheetOffset = sheetOffsets[sheetIndex + 1] ?? stream.byteLength;
    const anchors = readSheetDrawingAnchors(stream, sheetOffset, nextSheetOffset);
    const count = Math.min(images.length, anchors.length);
    if (count === 0) {
      continue;
    }
    result.set(
      sheetIndex,
      anchors.slice(0, count).map((anchor, index) => {
        const image = images[index];
        return {
          ...anchor,
          fileName: `legacy-image-${index + 1}.${image.extension}`,
          mimeType: image.mimeType,
          dataUrl: `data:${image.mimeType};base64,${bytesToBase64(image.bytes)}`,
          title: "Legacy Excel embedded image"
        };
      })
    );
  }
  return result;
}

function readWorksheetOffsets(stream: Uint8Array): number[] {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const offsets: number[] = [];
  walkBiffRecords(stream, 0, stream.byteLength, (record) => {
    if (record.type !== BIFF_BOUNDSHEET || record.end - record.payloadStart < 7) {
      return;
    }
    const sheetOffset = view.getUint32(record.payloadStart, true);
    const sheetType = view.getUint8(record.payloadStart + 5);
    if (sheetType === 0 && sheetOffset > 0 && sheetOffset < stream.byteLength) {
      offsets.push(sheetOffset);
    }
  });
  return offsets;
}

function readMsoDrawingImages(stream: Uint8Array): BitmapImage[] {
  const images: BitmapImage[] = [];
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  let offset = 0;
  while (offset + 4 <= stream.byteLength) {
    const record = readBiffRecord(view, offset, stream.byteLength);
    if (!record) {
      break;
    }
    if (record.type !== BIFF_MSODRAWING_GROUP) {
      offset = record.end;
      continue;
    }

    const segments = [stream.subarray(record.payloadStart, record.end)];
    let nextOffset = record.end;
    while (nextOffset + 4 <= stream.byteLength) {
      const next = readBiffRecord(view, nextOffset, stream.byteLength);
      if (!next || next.type !== BIFF_CONTINUE) {
        break;
      }
      segments.push(stream.subarray(next.payloadStart, next.end));
      nextOffset = next.end;
    }
    images.push(...readEmbeddedBitmaps(concatBytes(segments)));
    offset = nextOffset;
  }
  return images;
}

function readEmbeddedBitmaps(records: Uint8Array): BitmapImage[] {
  const images: BitmapImage[] = [];
  let offset = 0;
  while (offset < records.byteLength) {
    const pngStart = findBytes(records, PNG_SIGNATURE, offset);
    const jpegStart = findBytes(records, JPEG_SIGNATURE, offset);
    if (pngStart < 0 && jpegStart < 0) {
      break;
    }
    const isPng = pngStart >= 0 && (jpegStart < 0 || pngStart < jpegStart);
    const start = isPng ? pngStart : jpegStart;
    const image = isPng
      ? extractBitmap(records.subarray(start), "image/png", "png", PNG_SIGNATURE, PNG_END)
      : extractBitmap(records.subarray(start), "image/jpeg", "jpg", JPEG_SIGNATURE, JPEG_END);
    if (!image) {
      break;
    }
    images.push(image);
    offset = start + image.bytes.byteLength;
  }
  return images;
}

function readSheetDrawingAnchors(stream: Uint8Array, start: number, end: number): SheetAnchor[] {
  const anchors: SheetAnchor[] = [];
  walkBiffRecords(stream, start, end, (record) => {
    if (record.type === BIFF_MSODRAWING) {
      collectEscherAnchors(stream.subarray(record.payloadStart, record.end), anchors);
    }
  });
  return anchors;
}

function collectEscherAnchors(records: Uint8Array, target: SheetAnchor[]): void {
  const view = new DataView(records.buffer, records.byteOffset, records.byteLength);
  walkEscherRecords(records, 0, records.byteLength, (record) => {
    if (record.type !== ESCHER_CLIENT_ANCHOR) {
      return;
    }
    const length = record.end - record.payloadStart;
    if (length >= 18) {
      const coordinate = (index: number) => view.getInt16(record.payloadStart + 2 + index * 2, true);
      target.push({
        column: Math.max(0, coordinate(0)),
        row: Math.max(0, coordinate(2)),
        endColumn: Math.max(0, coordinate(4)),
        endRow: Math.max(0, coordinate(6))
      });
    } else if (length >= 8) {
      const coordinate = (index: number) => view.getInt16(record.payloadStart + index * 2, true);
      target.push({
        column: Math.max(0, coordinate(0)),
        row: Math.max(0, coordinate(1)),
        endColumn: Math.max(0, coordinate(2)),
        endRow: Math.max(0, coordinate(3))
      });
    }
  });
}

function walkBiffRecords(
  bytes: Uint8Array,
  start: number,
  end: number,
  visitor: (record: BiffRecord) => void
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset + 4 <= end) {
    const record = readBiffRecord(view, offset, end);
    if (!record) {
      return;
    }
    visitor(record);
    offset = record.end;
  }
}

function readBiffRecord(view: DataView, offset: number, end: number): BiffRecord | undefined {
  if (offset < 0 || offset + 4 > end || offset + 4 > view.byteLength) {
    return undefined;
  }
  const type = view.getUint16(offset, true);
  const length = view.getUint16(offset + 2, true);
  const payloadStart = offset + 4;
  const recordEnd = payloadStart + length;
  if (recordEnd > end || recordEnd > view.byteLength) {
    return undefined;
  }
  return { start: offset, payloadStart, end: recordEnd, type };
}

function walkEscherRecords(
  bytes: Uint8Array,
  start: number,
  end: number,
  visitor: (record: EscherRecord) => void
): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset + 8 <= end) {
    const versionAndInstance = view.getUint16(offset, true);
    const type = view.getUint16(offset + 2, true);
    const length = view.getUint32(offset + 4, true);
    const payloadStart = offset + 8;
    const recordEnd = payloadStart + length;
    if (recordEnd > end || recordEnd > bytes.byteLength || recordEnd < payloadStart) {
      return;
    }
    const record = {
      payloadStart,
      end: recordEnd,
      version: versionAndInstance & 0x0f,
      instance: versionAndInstance >>> 4,
      type
    };
    visitor(record);
    if (record.version === 0x0f && payloadStart < recordEnd) {
      walkEscherRecords(bytes, payloadStart, recordEnd, visitor);
    }
    offset = recordEnd;
  }
}

function extractBitmap(
  payload: Uint8Array,
  mimeType: string,
  extension: string,
  signature: number[],
  endMarker: number[]
): BitmapImage | undefined {
  const start = findBytes(payload, signature);
  if (start < 0) {
    return undefined;
  }
  const marker = findBytes(payload, endMarker, start + signature.length);
  const end = marker >= 0 ? marker + endMarker.length : payload.byteLength;
  return { mimeType, extension, bytes: payload.slice(start, end) };
}

function findBytes(bytes: Uint8Array, signature: number[], start = 0): number {
  for (let offset = start; offset + signature.length <= bytes.byteLength; offset += 1) {
    let matches = true;
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[offset + index] !== signature[index]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return offset;
    }
  }
  return -1;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function toUint8Array(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function hasBytesAt(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  return (
    bytes.byteLength >= offset + signature.length &&
    signature.every((value, index) => bytes[offset + index] === value)
  );
}
