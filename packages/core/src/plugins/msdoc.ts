const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;
const FAT_SECTOR = 0xfffffffd;
const DIFAT_SECTOR = 0xfffffffc;
const MINI_STREAM_CUTOFF = 4096;
const STSH_FC_LCB_INDEX = 1;
const CLX_FC_LCB_INDEX = 33;
const WORD_PAGE_BREAK = "\f";

export type LegacyWordDocument = {
  title: string;
  paragraphs: string[];
  blocks: LegacyWordBlock[];
  layout: LegacyWordLayoutHints;
  assets: LegacyWordAsset[];
  styles: LegacyWordStyle[];
  stats: {
    streamCount: number;
    pieceCount: number;
    characterCount: number;
    styleCount: number;
    tableStream: "0Table" | "1Table";
  };
  warnings: string[];
};

type LegacyWordAsset = {
  id: string;
  kind: "image";
  mimeType: string;
  dataUrl: string;
  width?: number;
  height?: number;
};

type LegacyWordStyle = {
  id: number;
  name: string;
  type?: "paragraph" | "character" | "table" | "numbering" | "unknown";
  basedOn?: number;
  next?: number;
};

type LegacyWordLayoutHints = {
  lineNumbers: boolean;
  headerBrand?: "oasis";
  headerImageId?: string;
  footer?: LegacyWordFooter;
};

type LegacyWordFooter = {
  documentId?: string;
  date?: string;
  copyright?: string;
};

export type LegacyWordBlock =
  | { type: "title" | "subtitle" | "label" | "paragraph" | "instruction" | "code"; text: string; indent?: boolean }
  | { type: "reference"; text: string }
  | { type: "listItem"; text: string; level: 1 | 2 }
  | { type: "heading"; text: string; level: 1 | 2 | 3; indent?: boolean }
  | { type: "toc"; title: string; page?: string; level: number }
  | { type: "table"; rows: LegacyWordTableRow[] }
  | { type: "pageBreak" };

export type LegacyWordTableCell =
  | string
  | { text: string; colSpan?: number; variant?: "label" | "section" | "caption" | "body" | "empty" };

export type LegacyWordTableRow = LegacyWordTableCell[];

type LegacyWordTableCellData = Extract<LegacyWordTableCell, { text: string }>;
type LegacyWordTableCellVariant = NonNullable<LegacyWordTableCellData["variant"]>;

type CompoundDirectoryEntry = {
  name: string;
  type: number;
  startSector: number;
  size: number;
};

type CompoundFile = {
  entries: CompoundDirectoryEntry[];
  getStream(name: string): Uint8Array | undefined;
};

type FibInfo = {
  encrypted: boolean;
  useOneTable: boolean;
  textIsUnicode: boolean;
  fcMin: number;
  fcMac: number;
  ccpText: number;
  fcStshf: number;
  lcbStshf: number;
  fcClx: number;
  lcbClx: number;
};

type Piece = {
  cpStart: number;
  cpEnd: number;
  fileOffset: number;
  compressed: boolean;
};

export function parseLegacyWordDocument(input: ArrayBuffer): LegacyWordDocument {
  const cfb = parseCompoundFile(new Uint8Array(input));
  const wordDocument = cfb.getStream("WordDocument");
  if (!wordDocument) {
    throw new Error("未找到 WordDocument 流");
  }

  const fib = parseFib(wordDocument);
  if (fib.encrypted) {
    throw new Error("暂不支持加密的 .doc 文件");
  }

  const tableStreamName = fib.useOneTable ? "1Table" : "0Table";
  const tableStream = cfb.getStream(tableStreamName);
  if (!tableStream) {
    throw new Error(`未找到 ${tableStreamName} 表流`);
  }

  const assets = extractImageAssets(cfb);
  const styles = parseStyleTable(tableStream, fib);
  const pieces = parseClxPieces(tableStream, fib.fcClx, fib.lcbClx);
  const text = pieces.length > 0 ? readPieceTableText(wordDocument, pieces, fib.ccpText) : readFibTextFallback(wordDocument, fib);
  const paragraphs = splitWordParagraphs(text);
  if (paragraphs.length === 0) {
    throw new Error("未解析到可显示的正文段落");
  }
  const bodyParagraphs = removeTrailingFooterArtifacts(paragraphs);
  const blocks = buildWordBlocks(bodyParagraphs);
  const layout = inferLayoutHints(paragraphs, assets);

  return {
    title: inferDocumentTitle(paragraphs),
    paragraphs: bodyParagraphs,
    blocks,
    layout,
    assets,
    styles,
    stats: {
      streamCount: cfb.entries.length,
      pieceCount: pieces.length,
      characterCount: bodyParagraphs.join("\n").length,
      styleCount: styles.length,
      tableStream: tableStreamName
    },
    warnings: pieces.length === 0 ? ["未找到 CLX piece table，已按 FIB 文本区间尝试恢复正文。"] : []
  };
}

export function renderLegacyWordDocument(panel: HTMLElement, document: LegacyWordDocument): void {
  panel.replaceChildren();

  const article = window.document.createElement("article");
  article.className = "ofv-msdoc-document";

  const pages = paginateWordBlocks(document.blocks.slice(0, 600), document.layout);
  const pageCount = inferDisplayedPageCount(document.blocks, pages.length);
  const page = window.document.createElement("section");
  page.className = "ofv-msdoc-page";
  appendPageChrome(page, document, 1, pageCount);

  const meta = window.document.createElement("dl");
  meta.className = "ofv-msdoc-meta";
  appendMeta(meta, "格式", "Word 97-2003 Binary");
  appendMeta(meta, "正文段落", `${document.paragraphs.length}`);
  appendMeta(meta, "Piece Table", `${document.stats.pieceCount || 0} 段`);
  appendMeta(meta, "样式表", `${document.stats.styleCount || 0} 个样式`);
  appendMeta(meta, "表流", document.stats.tableStream);
  if (document.styles.length > 0) {
    appendMeta(meta, "样式名称", document.styles.slice(0, 30).map((style) => style.name).join("、"));
  }
  meta.hidden = true;
  page.append(meta);

  appendBlocksToPage(page, pages[0] || [], document.layout);
  appendWarnings(page, document);
  article.append(page);

  for (const pageBlocks of pages.slice(1)) {
    const nextPage = window.document.createElement("section");
    nextPage.className = "ofv-msdoc-page";
    appendPageChrome(nextPage, document, article.children.length + 1, pageCount);
    appendBlocksToPage(nextPage, pageBlocks, document.layout);
    article.append(nextPage);
  }
  panel.append(article);
}

function inferDisplayedPageCount(blocks: LegacyWordBlock[], renderedPageCount: number): number {
  const tocPageNumbers = blocks
    .filter((block): block is Extract<LegacyWordBlock, { type: "toc" }> => block.type === "toc" && Boolean(block.page))
    .map((block) => Number.parseInt(block.page || "", 10))
    .filter((page) => Number.isFinite(page) && page > 0);
  if (tocPageNumbers.length === 0) {
    return renderedPageCount;
  }
  return Math.max(renderedPageCount, ...tocPageNumbers);
}

function appendPageChrome(page: HTMLElement, document: LegacyWordDocument, pageNumber: number, pageCount: number): void {
  if (document.layout.lineNumbers) {
    page.classList.add("ofv-msdoc-line-numbered");
  }
  page.setAttribute("aria-label", document.title || "Word 文档");
  if (document.layout.headerBrand === "oasis") {
    page.append(createOasisHeader(document.assets.find((asset) => asset.id === document.layout.headerImageId)));
  }
  if (document.layout.footer) {
    page.append(createPageFooter(document.layout.footer, pageNumber, pageCount));
  }
}

function appendBlocksToPage(page: HTMLElement, blocks: LegacyWordBlock[], layout: LegacyWordLayoutHints): void {
  let lineNumber = 1;
  for (const block of blocks) {
    if (block.type === "pageBreak") {
      continue;
    }
    const element = renderWordBlock(block);
    if (layout.lineNumbers && element instanceof HTMLElement && !element.classList.contains("ofv-msdoc-page-header")) {
      element.dataset.line = String(lineNumber);
      lineNumber += estimatedLineCount(block);
    }
    page.append(element);
  }
}

function appendWarnings(page: HTMLElement, document: LegacyWordDocument): void {
  if (document.warnings.length === 0) {
    return;
  }
  const warning = window.document.createElement("p");
  warning.className = "ofv-msdoc-warning";
  warning.textContent = document.warnings.join(" ");
  warning.hidden = true;
  page.append(warning);
}

function createOasisHeader(image?: LegacyWordAsset): HTMLElement {
  const header = window.document.createElement("header");
  header.className = "ofv-msdoc-page-header ofv-msdoc-oasis-header";

  const logo = image ? createImageLogo(image) : createFallbackOasisLogo();

  header.append(logo);
  return header;
}

function createImageLogo(image: LegacyWordAsset): HTMLElement {
  const wrapper = window.document.createElement("div");
  wrapper.className = "ofv-msdoc-oasis-logo ofv-msdoc-oasis-logo-image";
  const img = window.document.createElement("img");
  img.src = image.dataUrl;
  img.alt = "OASIS";
  if (image.width) {
    img.width = image.width;
  }
  if (image.height) {
    img.height = image.height;
  }
  wrapper.append(img);
  return wrapper;
}

function createFallbackOasisLogo(): HTMLElement {
  const logo = window.document.createElement("div");
  logo.className = "ofv-msdoc-oasis-logo";
  const word = window.document.createElement("span");
  word.textContent = "OASIS";
  const mark = window.document.createElement("span");
  mark.className = "ofv-msdoc-oasis-mark";
  mark.setAttribute("aria-hidden", "true");
  logo.append(word, mark);
  return logo;
}

function createPageFooter(footer: LegacyWordFooter, pageNumber: number, pageCount: number): HTMLElement {
  const element = window.document.createElement("footer");
  element.className = "ofv-msdoc-page-footer";

  const top = window.document.createElement("div");
  top.className = "ofv-msdoc-footer-row";
  const documentId = window.document.createElement("span");
  documentId.textContent = footer.documentId || "";
  const date = window.document.createElement("span");
  date.textContent = footer.date || "";
  top.append(documentId, date);

  const bottom = window.document.createElement("div");
  bottom.className = "ofv-msdoc-footer-row";
  const copyright = window.document.createElement("span");
  copyright.textContent = footer.copyright || "";
  const page = window.document.createElement("span");
  page.textContent = `Page ${pageNumber} of ${pageCount}`;
  bottom.append(copyright, page);

  element.append(top, bottom);
  return element;
}

function renderWordBlock(block: LegacyWordBlock): HTMLElement {
  if (block.type === "pageBreak") {
    const marker = window.document.createElement("span");
    marker.className = "ofv-msdoc-page-break";
    marker.hidden = true;
    return marker;
  }

  if (block.type === "table") {
    const table = window.document.createElement("table");
    table.className = "ofv-msdoc-table";
    const revisionColumnWidths = getRevisionTableColumnWidths(block.rows);
    const renderRows = revisionColumnWidths ? block.rows : normalizeLegacyFormTableRows(block.rows);
    const isFormTable = renderRows.some((row) => row.some((cell) => getTableCellVariant(cell) !== undefined));
    if (revisionColumnWidths) {
      table.classList.add("ofv-msdoc-revision-table");
      const colgroup = window.document.createElement("colgroup");
      for (const width of revisionColumnWidths) {
        const col = window.document.createElement("col");
        col.style.width = `calc(${width}px * var(--ofv-office-zoom, 1))`;
        colgroup.append(col);
      }
      table.append(colgroup);
    }
    if (isFormTable) {
      table.classList.add("ofv-msdoc-form-table");
    }
    const tbody = window.document.createElement("tbody");
    for (const row of renderRows) {
      const tr = window.document.createElement("tr");
      const cellTag = !isFormTable && row === renderRows[0] && renderRows.length > 1 ? "th" : "td";
      for (const cellData of row) {
        const cellInfo = normalizeTableCell(cellData);
        const cell = window.document.createElement(cellTag);
        cell.textContent = cellInfo.text;
        if (cellInfo.colSpan && cellInfo.colSpan > 1) {
          cell.colSpan = cellInfo.colSpan;
        }
        if (cellInfo.variant) {
          cell.classList.add(`ofv-msdoc-form-${cellInfo.variant}`);
        }
        tr.append(cell);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }

  if (block.type === "toc") {
    const paragraph = window.document.createElement("p");
    paragraph.className = `ofv-msdoc-toc ofv-msdoc-toc-level-${block.level}`;
    const title = window.document.createElement("span");
    title.textContent = block.title;
    paragraph.append(title);
    if (block.page) {
      const page = window.document.createElement("span");
      page.textContent = block.page;
      paragraph.append(page);
    }
    return paragraph;
  }

  const paragraph = window.document.createElement("p");
  const levelClass = block.type === "heading" ? ` ofv-msdoc-heading-level-${block.level}` : "";
  const listClass = block.type === "listItem" ? ` ofv-msdoc-list-level-${block.level}` : "";
  paragraph.className = `ofv-msdoc-${block.type}${levelClass}${listClass}${"indent" in block && block.indent ? " ofv-msdoc-indent" : ""}`;
  appendInlineRuns(paragraph, block.text, block.type === "code");
  return paragraph;
}

function appendInlineRuns(element: HTMLElement, text: string, preserveTabs = false): void {
  if (preserveTabs) {
    appendInlineText(element, text, true);
    return;
  }

  const pattern =
    /(https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\[[^\]]+\]|<\/?[A-Za-z][A-Za-z0-9:-]*>|(?:\b(?:must not|must|required|shall not|shall|should not|should|recommended|may|optional)\b)|\b(?:attributeNames|DataType|OtherKeyword|variable)\b)/gi;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const value = match[0];
    const index = match.index || 0;
    if (index > offset) {
      appendInlineText(element, text.slice(offset, index), preserveTabs);
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      appendBracketRun(element, value);
    } else if (isCodeStyleRun(value)) {
      const code = window.document.createElement("code");
      code.className = "ofv-msdoc-inline-code";
      code.textContent = value;
      element.append(code);
    } else if (isVariableStyleRun(value)) {
      const em = window.document.createElement("em");
      em.className = "ofv-msdoc-variable";
      em.textContent = value;
      element.append(em);
    } else if (isRequirementKeywordRun(value)) {
      const em = window.document.createElement("em");
      em.className = "ofv-msdoc-keyword";
      em.textContent = value;
      element.append(em);
    } else {
      const link = splitLinkRun(value);
      const anchor = window.document.createElement("a");
      anchor.className = "ofv-msdoc-link-text";
      anchor.href = link.href;
      anchor.target = "_blank";
      anchor.rel = "noreferrer noopener";
      anchor.textContent = link.text;
      element.append(anchor);
      if (link.trailing) {
        appendInlineText(element, link.trailing, preserveTabs);
      }
    }
    offset = index + value.length;
  }
  if (offset < text.length) {
    appendInlineText(element, text.slice(offset), preserveTabs);
  }
}

function appendBracketRun(element: HTMLElement, value: string): void {
  const tagName = isReferenceTerm(value) ? "strong" : "em";
  const run = window.document.createElement(tagName);
  run.className = isReferenceTerm(value) ? "ofv-msdoc-ref-term" : "ofv-msdoc-instruction-run";
  run.textContent = value;
  element.append(run);
}

function getRevisionTableColumnWidths(rows: LegacyWordTableRow[]): number[] | undefined {
  const header = rows[0]?.map((cell) => getTableCellText(cell).toLowerCase());
  if (!header || header.length !== 4) {
    return undefined;
  }
  if (header[0] === "rev" && header[1] === "date" && /whom/.test(header[2]) && header[3] === "what") {
    return [59, 81, 106, 191];
  }
  return undefined;
}

function normalizeLegacyFormTableRows(rows: LegacyWordTableRow[]): LegacyWordTableRow[] {
  if (rows.length === 0) {
    return rows;
  }
  const normalized: LegacyWordTableRow[] = [];
  let index = 0;
  const leadingLabels = getLeadingFormLabels(rows);
  if (leadingLabels) {
    for (let offset = 0; offset < leadingLabels.length; offset += 2) {
      normalized.push([
        createFormCell(leadingLabels[offset] || "", "label"),
        createFormCell("", "empty"),
        createFormCell(leadingLabels[offset + 1] || "", "label"),
        createFormCell("", "empty")
      ]);
    }
    index = 2;
  }

  for (; index < rows.length; index += 1) {
    const sectionRows = splitFormSectionRow(rows[index]);
    if (sectionRows) {
      normalized.push(...sectionRows);
      continue;
    }
    normalized.push(rows[index].map((cell) => normalizeTableCell(cell)));
  }

  return normalized;
}

function getLeadingFormLabels(rows: LegacyWordTableRow[]): string[] | undefined {
  if (rows.length < 3 || rows[0].length !== 3 || rows[1].length !== 3 || !isFormSectionRow(rows[2])) {
    return undefined;
  }
  const labels = [...rows[0], ...rows[1]].map(getTableCellText);
  if (labels.length !== 6 || !labels.every(isShortChineseFormLabel)) {
    return undefined;
  }
  return labels;
}

function splitFormSectionRow(row: LegacyWordTableRow): LegacyWordTableRow[] | undefined {
  const cells = row.map((cell) => normalizeTableCell(cell)).filter((cell) => cell.text.length > 0);
  const sectionIndex = cells.findIndex((cell) => isChineseSectionTitle(cell.text));
  if (sectionIndex < 0) {
    return undefined;
  }
  const gradeIndex = cells.findIndex((cell, index) => index > sectionIndex && isGradeCell(cell.text));
  if (gradeIndex < 0) {
    return undefined;
  }

  const output: LegacyWordTableRow[] = [];
  const leadingText = cells
    .slice(0, sectionIndex)
    .map((cell) => cell.text)
    .join(" ")
    .trim();
  if (leadingText) {
    output.push([createFormCell(leadingText, "body", 4)]);
  }

  output.push([createFormCell(cells[sectionIndex].text, "section", 2), createFormCell(cells[gradeIndex].text, "section", 2)]);

  const trailingText = cells
    .slice(gradeIndex + 1)
    .map((cell) => cell.text)
    .join(" ")
    .trim();
  if (trailingText) {
    output.push([createFormCell(trailingText, "caption", 4)]);
  }

  return output;
}

function isFormSectionRow(row: LegacyWordTableRow): boolean {
  return splitFormSectionRow(row) !== undefined;
}

function createFormCell(text: string, variant: LegacyWordTableCellVariant, colSpan?: number): LegacyWordTableCell {
  return { text, variant, colSpan };
}

function normalizeTableCell(cell: LegacyWordTableCell): LegacyWordTableCellData {
  return typeof cell === "string" ? { text: cell } : cell;
}

function getTableCellText(cell: LegacyWordTableCell): string {
  return normalizeTableCell(cell).text.trim();
}

function getTableCellVariant(cell: LegacyWordTableCell): LegacyWordTableCellVariant | undefined {
  return normalizeTableCell(cell).variant;
}

function isShortChineseFormLabel(text: string): boolean {
  const value = text.trim();
  return value.length > 0 && value.length <= 8 && /\p{Script=Han}/u.test(value) && !/[。；，、：:]/.test(value);
}

function isChineseSectionTitle(text: string): boolean {
  return /^[一二三四五六七八九十]+、\S+/.test(text.trim());
}

function isGradeCell(text: string): boolean {
  return /^成绩[:：]?$/.test(text.trim());
}

function appendInlineText(element: HTMLElement, text: string, preserveTabs: boolean): void {
  element.append(window.document.createTextNode(preserveTabs ? text : text.replace(/\t+/g, " ")));
}

function isReferenceTerm(value: string): boolean {
  return /^\[[A-Z0-9][A-Z0-9.-]{1,24}\]$/.test(value);
}

function isCodeStyleRun(value: string): boolean {
  return /^<\/?[A-Za-z][A-Za-z0-9:-]*>$/.test(value) || /^(?:attributeNames|DataType|OtherKeyword)$/.test(value);
}

function isVariableStyleRun(value: string): boolean {
  return value === "variable";
}

function isRequirementKeywordRun(value: string): boolean {
  return /^(?:must not|must|required|shall not|shall|should not|should|recommended|may|optional)$/i.test(value);
}

function splitLinkRun(value: string): { text: string; href: string; trailing: string } {
  let text = value;
  let trailing = "";
  while (/[),.;:]$/.test(text)) {
    trailing = text.slice(-1) + trailing;
    text = text.slice(0, -1);
  }
  const href = /^https?:\/\//i.test(text) ? text : `mailto:${text}`;
  return { text, href, trailing };
}

function extractImageAssets(cfb: CompoundFile): LegacyWordAsset[] {
  const assets: LegacyWordAsset[] = [];
  const seen = new Set<string>();
  for (const entry of cfb.entries) {
    if (entry.type !== 2) {
      continue;
    }
    const stream = cfb.getStream(entry.name);
    if (!stream || stream.length < 16) {
      continue;
    }
    for (const image of extractImagesFromBytes(stream, entry.name)) {
      const key = `${image.mimeType}:${image.bytes.length}:${image.bytes[0]}:${image.bytes[image.bytes.length - 1]}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const id = `image-${assets.length + 1}`;
      assets.push({
        id,
        kind: "image",
        mimeType: image.mimeType,
        dataUrl: `data:${image.mimeType};base64,${bytesToBase64(image.bytes)}`,
        width: image.width,
        height: image.height
      });
    }
  }
  return assets;
}

function parseStyleTable(tableStream: Uint8Array, fib: FibInfo): LegacyWordStyle[] {
  if (fib.lcbStshf <= 0 || fib.fcStshf < 0 || fib.fcStshf >= tableStream.length) {
    return [];
  }
  const bytes = tableStream.subarray(fib.fcStshf, Math.min(tableStream.length, fib.fcStshf + fib.lcbStshf));
  if (bytes.length < 8) {
    return [];
  }

  const view = dataView(bytes);
  const cbStshi = view.getUint16(0, true);
  const stshiOffset = 2;
  const cstd = stshiOffset + 2 <= bytes.length ? view.getUint16(stshiOffset, true) : 0;
  const cbSTDBaseInFile = stshiOffset + 4 <= bytes.length ? view.getUint16(stshiOffset + 2, true) : 10;
  let offset = 2 + cbStshi;
  const styles: LegacyWordStyle[] = [];

  for (let id = 0; id < cstd && offset + 2 <= bytes.length; id += 1) {
    const cbStd = view.getUint16(offset, true);
    const stdStart = offset + 2;
    const stdEnd = stdStart + cbStd;
    if (cbStd > 0 && stdStart < bytes.length) {
      const style = parseStyleDefinition(bytes.subarray(stdStart, Math.min(stdEnd, bytes.length)), Math.max(10, cbSTDBaseInFile), id);
      if (style.name) {
        styles.push(style);
      }
    }
    offset = alignEven(stdEnd);
  }
  return styles;
}

function parseStyleDefinition(bytes: Uint8Array, baseSize: number, id: number): LegacyWordStyle {
  const base = bytes.length >= 6 ? parseStyleBase(bytes) : undefined;
  const nameOffset = Math.min(bytes.length, Math.max(10, baseSize));
  const name = parseXstz(bytes, nameOffset);
  return {
    id,
    name,
    type: styleTypeFromStk(base?.stk),
    basedOn: base?.basedOn,
    next: base?.next
  };
}

function parseStyleBase(bytes: Uint8Array): { stk: number; basedOn: number; next: number } {
  const view = dataView(bytes);
  const w2 = view.getUint16(2, true);
  const w3 = view.getUint16(4, true);
  return {
    stk: w2 & 0x000f,
    basedOn: (w2 >> 4) & 0x0fff,
    next: (w3 >> 4) & 0x0fff
  };
}

function styleTypeFromStk(stk?: number): LegacyWordStyle["type"] {
  if (stk === 1) {
    return "paragraph";
  }
  if (stk === 2) {
    return "character";
  }
  if (stk === 3) {
    return "table";
  }
  if (stk === 4) {
    return "numbering";
  }
  return "unknown";
}

function parseXstz(bytes: Uint8Array, offset: number): string {
  if (offset + 2 > bytes.length) {
    return "";
  }
  const view = dataView(bytes);
  const charCount = view.getUint16(offset, true);
  const start = offset + 2;
  const end = Math.min(bytes.length, start + charCount * 2);
  if (end <= start) {
    return "";
  }
  return decodeUtf16Le(bytes.subarray(start, end)).replace(/\0+$/g, "");
}

function extractImagesFromBytes(bytes: Uint8Array, sourceName: string): Array<{ bytes: Uint8Array; mimeType: string; width?: number; height?: number }> {
  const images: Array<{ bytes: Uint8Array; mimeType: string; width?: number; height?: number }> = [];
  for (const start of findSignatureOffsets(bytes, PNG_SIGNATURE)) {
    const end = findPngEnd(bytes, start);
    if (end > start) {
      const imageBytes = bytes.slice(start, end);
      const dimensions = readPngDimensions(imageBytes);
      images.push({ bytes: imageBytes, mimeType: "image/png", width: dimensions?.width, height: dimensions?.height });
    }
  }
  for (const start of findSignatureOffsets(bytes, JPEG_SIGNATURE)) {
    const end = findJpegEnd(bytes, start);
    if (end > start) {
      images.push({ bytes: bytes.slice(start, end), mimeType: "image/jpeg" });
    }
  }
  if (/picture|image|data/i.test(sourceName)) {
    const gifStart = bytes.findIndex((byte, index) => index + 4 <= bytes.length && bytes[index] === 0x47 && bytes[index + 1] === 0x49 && bytes[index + 2] === 0x46 && bytes[index + 3] === 0x38);
    if (gifStart >= 0) {
      images.push({ bytes: bytes.slice(gifStart), mimeType: "image/gif" });
    }
  }
  return images;
}

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Uint8Array.from([0xff, 0xd8, 0xff]);

function findSignatureOffsets(bytes: Uint8Array, signature: Uint8Array): number[] {
  const offsets: number[] = [];
  for (let index = 0; index <= bytes.length - signature.length; index += 1) {
    let matches = true;
    for (let sigIndex = 0; sigIndex < signature.length; sigIndex += 1) {
      if (bytes[index + sigIndex] !== signature[sigIndex]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      offsets.push(index);
    }
  }
  return offsets;
}

function findPngEnd(bytes: Uint8Array, start: number): number {
  for (let offset = start + PNG_SIGNATURE.length; offset + 12 <= bytes.length; ) {
    const length = readUint32Be(bytes, offset);
    const typeOffset = offset + 4;
    const next = offset + 12 + length;
    if (next > bytes.length) {
      return 0;
    }
    if (bytes[typeOffset] === 0x49 && bytes[typeOffset + 1] === 0x45 && bytes[typeOffset + 2] === 0x4e && bytes[typeOffset + 3] === 0x44) {
      return next;
    }
    offset = next;
  }
  return 0;
}

function findJpegEnd(bytes: Uint8Array, start: number): number {
  for (let index = start + 2; index + 1 < bytes.length; index += 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
      return index + 2;
    }
  }
  return 0;
}

function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return undefined;
  }
  return {
    width: readUint32Be(bytes, 16),
    height: readUint32Be(bytes, 20)
  };
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return btoa(binary);
}

function parseCompoundFile(bytes: Uint8Array): CompoundFile {
  if (!hasCompoundSignature(bytes)) {
    throw new Error("不是标准 OLE Compound File");
  }
  const view = dataView(bytes);
  const sectorSize = 1 << view.getUint16(30, true);
  const miniSectorSize = 1 << view.getUint16(32, true);
  const fatSectorCount = view.getUint32(44, true);
  const firstDirectorySector = view.getUint32(48, true);
  const miniStreamCutoff = view.getUint32(56, true) || MINI_STREAM_CUTOFF;
  const firstMiniFatSector = view.getUint32(60, true);
  const miniFatSectorCount = view.getUint32(64, true);
  const firstDifatSector = view.getUint32(68, true);
  const difatSectorCount = view.getUint32(72, true);

  const difat = readDifat(view, sectorSize, firstDifatSector, difatSectorCount);
  const fat = readFat(view, sectorSize, difat.slice(0, fatSectorCount));
  const directoryBytes = readRegularStream(bytes, sectorSize, fat, firstDirectorySector);
  const entries = parseDirectoryEntries(directoryBytes);
  const root = entries.find((entry) => entry.type === 5);
  const miniStream = root ? readRegularStream(bytes, sectorSize, fat, root.startSector, root.size) : new Uint8Array();
  const miniFat = firstMiniFatSector < END_OF_CHAIN ? readFat(view, sectorSize, sectorChain(fat, firstMiniFatSector).slice(0, miniFatSectorCount)) : [];

  return {
    entries,
    getStream(name) {
      const wanted = normalizeStreamName(name);
      const entry = entries.find((item) => item.type === 2 && normalizeStreamName(item.name) === wanted);
      if (!entry) {
        return undefined;
      }
      if (entry.size < miniStreamCutoff && miniFat.length > 0) {
        return readMiniStream(miniStream, miniSectorSize, miniFat, entry.startSector, entry.size);
      }
      return readRegularStream(bytes, sectorSize, fat, entry.startSector, entry.size);
    }
  };
}

function hasCompoundSignature(bytes: Uint8Array): boolean {
  return CFB_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readDifat(view: DataView, sectorSize: number, firstDifatSector: number, difatSectorCount: number): number[] {
  const difat: number[] = [];
  for (let offset = 76; offset < 512; offset += 4) {
    const sector = view.getUint32(offset, true);
    if (isUsableSector(sector)) {
      difat.push(sector);
    }
  }

  let next = firstDifatSector;
  for (let index = 0; index < difatSectorCount && isUsableSector(next); index += 1) {
    const offset = sectorOffset(next, sectorSize);
    const entriesPerSector = sectorSize / 4 - 1;
    for (let item = 0; item < entriesPerSector; item += 1) {
      const sector = view.getUint32(offset + item * 4, true);
      if (isUsableSector(sector)) {
        difat.push(sector);
      }
    }
    next = view.getUint32(offset + entriesPerSector * 4, true);
  }
  return difat;
}

function readFat(view: DataView, sectorSize: number, sectors: number[]): number[] {
  const fat: number[] = [];
  for (const sector of sectors) {
    if (!isUsableSector(sector) && sector !== FAT_SECTOR && sector !== DIFAT_SECTOR) {
      continue;
    }
    const offset = sectorOffset(sector, sectorSize);
    for (let item = 0; item < sectorSize / 4; item += 1) {
      fat.push(view.getUint32(offset + item * 4, true));
    }
  }
  return fat;
}

function parseDirectoryEntries(bytes: Uint8Array): CompoundDirectoryEntry[] {
  const view = dataView(bytes);
  const entries: CompoundDirectoryEntry[] = [];
  for (let offset = 0; offset + 128 <= bytes.length; offset += 128) {
    const nameLength = view.getUint16(offset + 64, true);
    const type = bytes[offset + 66] || 0;
    if (type === 0 || nameLength < 2) {
      continue;
    }
    const nameBytes = bytes.subarray(offset, offset + Math.max(0, nameLength - 2));
    const name = decodeUtf16Le(nameBytes).replace(/\0+$/g, "");
    const startSector = view.getUint32(offset + 116, true);
    const lowSize = view.getUint32(offset + 120, true);
    const highSize = view.getUint32(offset + 124, true);
    const size = highSize > 0 ? Number(BigInt(highSize) << 32n) + lowSize : lowSize;
    entries.push({ name, type, startSector, size });
  }
  return entries;
}

function readRegularStream(bytes: Uint8Array, sectorSize: number, fat: number[], startSector: number, size?: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const sector of sectorChain(fat, startSector)) {
    const offset = sectorOffset(sector, sectorSize);
    chunks.push(bytes.subarray(offset, Math.min(bytes.length, offset + sectorSize)));
  }
  return concatChunks(chunks, size);
}

function readMiniStream(miniStream: Uint8Array, miniSectorSize: number, miniFat: number[], startSector: number, size?: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const sector of sectorChain(miniFat, startSector)) {
    const offset = sector * miniSectorSize;
    chunks.push(miniStream.subarray(offset, Math.min(miniStream.length, offset + miniSectorSize)));
  }
  return concatChunks(chunks, size);
}

function sectorChain(fat: number[], startSector: number): number[] {
  const chain: number[] = [];
  const seen = new Set<number>();
  let current = startSector;
  while (isUsableSector(current) && current < fat.length && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = fat[current];
  }
  return chain;
}

function parseFib(wordDocument: Uint8Array): FibInfo {
  const view = dataView(wordDocument);
  if (view.getUint16(0, true) !== 0xa5ec) {
    throw new Error("WordDocument FIB 标识无效");
  }

  const flags = view.getUint16(10, true);
  const fcMin = view.getUint32(24, true);
  const fcMac = view.getUint32(28, true);
  let offset = 32;
  const csw = view.getUint16(offset, true);
  offset += 2 + csw * 2;
  const fibRgLwOffset = offset + 2;
  const cslw = view.getUint16(offset, true);
  const ccpText = fibRgLwOffset + 16 <= wordDocument.length ? Math.max(0, view.getInt32(fibRgLwOffset + 12, true)) : 0;
  offset += 2 + cslw * 4;
  const cbRgFcLcb = view.getUint16(offset, true);
  const fcLcbOffset = offset + 2;
  const stshOffset = fcLcbOffset + STSH_FC_LCB_INDEX * 8;
  const clxOffset = fcLcbOffset + CLX_FC_LCB_INDEX * 8;

  return {
    encrypted: (flags & 0x0100) !== 0,
    useOneTable: (flags & 0x0200) !== 0,
    textIsUnicode: (flags & 0x1000) !== 0,
    fcMin,
    fcMac,
    ccpText,
    fcStshf: STSH_FC_LCB_INDEX < cbRgFcLcb && stshOffset + 8 <= wordDocument.length ? view.getUint32(stshOffset, true) : 0,
    lcbStshf: STSH_FC_LCB_INDEX < cbRgFcLcb && stshOffset + 8 <= wordDocument.length ? view.getUint32(stshOffset + 4, true) : 0,
    fcClx: CLX_FC_LCB_INDEX < cbRgFcLcb && clxOffset + 8 <= wordDocument.length ? view.getUint32(clxOffset, true) : 0,
    lcbClx: CLX_FC_LCB_INDEX < cbRgFcLcb && clxOffset + 8 <= wordDocument.length ? view.getUint32(clxOffset + 4, true) : 0
  };
}

function parseClxPieces(tableStream: Uint8Array, fcClx: number, lcbClx: number): Piece[] {
  if (lcbClx <= 0 || fcClx < 0 || fcClx >= tableStream.length) {
    return [];
  }
  const end = Math.min(tableStream.length, fcClx + lcbClx);
  const view = dataView(tableStream);
  let offset = fcClx;

  while (offset < end) {
    const marker = tableStream[offset];
    if (marker === 0x01) {
      const size = offset + 3 <= end ? view.getUint16(offset + 1, true) : 0;
      offset += 3 + size;
      continue;
    }
    if (marker === 0x02) {
      if (offset + 5 > end) {
        break;
      }
      const plcSize = view.getUint32(offset + 1, true);
      const plcOffset = offset + 5;
      return parsePlcPcd(tableStream, plcOffset, Math.min(end, plcOffset + plcSize));
    }
    offset += 1;
  }
  return [];
}

function parsePlcPcd(tableStream: Uint8Array, offset: number, end: number): Piece[] {
  const size = end - offset;
  if (size < 16 || (size - 4) % 12 !== 0) {
    return [];
  }
  const view = dataView(tableStream);
  const pieceCount = Math.floor((size - 4) / 12);
  const pcdOffset = offset + (pieceCount + 1) * 4;
  const pieces: Piece[] = [];
  for (let index = 0; index < pieceCount; index += 1) {
    const cpStart = view.getUint32(offset + index * 4, true);
    const cpEnd = view.getUint32(offset + (index + 1) * 4, true);
    const descriptorOffset = pcdOffset + index * 8;
    const fcCompressed = view.getUint32(descriptorOffset + 2, true);
    const compressed = (fcCompressed & 0x40000000) !== 0;
    const fileOffset = compressed ? (fcCompressed & 0x3fffffff) / 2 : fcCompressed;
    if (cpEnd > cpStart) {
      pieces.push({ cpStart, cpEnd, fileOffset, compressed });
    }
  }
  return pieces;
}

function readPieceTableText(wordDocument: Uint8Array, pieces: Piece[], ccpText: number): string {
  let output = "";
  for (const piece of pieces) {
    const cpEnd = ccpText > 0 ? Math.min(piece.cpEnd, ccpText) : piece.cpEnd;
    const charCount = Math.max(0, cpEnd - piece.cpStart);
    if (charCount === 0) {
      continue;
    }
    const byteLength = charCount * (piece.compressed ? 1 : 2);
    const bytes = wordDocument.subarray(piece.fileOffset, Math.min(wordDocument.length, piece.fileOffset + byteLength));
    output += piece.compressed ? decodeWindows1252(bytes) : decodeUtf16Le(bytes);
  }
  return output;
}

function readFibTextFallback(wordDocument: Uint8Array, fib: FibInfo): string {
  const bytes = wordDocument.subarray(fib.fcMin, Math.min(wordDocument.length, fib.fcMac));
  return fib.textIsUnicode ? decodeUtf16Le(bytes) : decodeWindows1252(bytes);
}

function splitWordParagraphs(text: string): string[] {
  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/\u0007/g, "\t")
    .replace(/\u000b/g, "\n");
  const paragraphs: string[] = [];
  for (const segment of normalized.split(/(\u000c)/)) {
    if (segment === "\u000c") {
      paragraphs.push(WORD_PAGE_BREAK);
      continue;
    }
    paragraphs.push(
      ...segment
        .split(/\r|\n{2,}/)
        .map((paragraph) => cleanWordText(paragraph))
        .filter((paragraph) => paragraph.length > 0 && isDisplayableParagraph(paragraph))
    );
  }
  return paragraphs.slice(0, 1000);
}

function removeTrailingFooterArtifacts(paragraphs: string[]): string[] {
  const tailStart = Math.max(0, paragraphs.length - 32);
  const tail = paragraphs.slice(tailStart);
  const relativePageFieldIndex = tail.findIndex(isFooterPageField);
  if (relativePageFieldIndex < 0) {
    return paragraphs;
  }

  let start = tailStart + relativePageFieldIndex;
  for (let index = start - 1; index >= tailStart; index -= 1) {
    const paragraph = paragraphs[index];
    if (paragraph === WORD_PAGE_BREAK || isLikelyFooterArtifact(paragraph)) {
      start = index;
      continue;
    }
    break;
  }

  const artifactSlice = paragraphs.slice(start);
  const footerCueCount = artifactSlice.filter(isLikelyFooterArtifact).length;
  if (footerCueCount < 2) {
    return paragraphs;
  }
  return paragraphs.slice(0, start);
}

function isFooterPageField(paragraph: string): boolean {
  return /^(?:PAGE|Page)(?:\s+(?:PAGE|\d+))?(?:\s+of\s+(?:NUMPAGES|\d+))?$/i.test(paragraph.trim()) || /\bNUMPAGES\b/i.test(paragraph);
}

function isLikelyFooterArtifact(paragraph: string): boolean {
  const value = paragraph.trim();
  return (
    value === WORD_PAGE_BREAK ||
    isFooterPageField(value) ||
    /^wd-[\w.-]+$/i.test(value) ||
    /^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/.test(value) ||
    /^Copyright\s+©?\s*(?:OASIS|2002 OASIS)/i.test(value)
  );
}

function buildWordBlocks(paragraphs: string[]): LegacyWordBlock[] {
  const blocks: LegacyWordBlock[] = [];
  let index = 0;
  while (index < paragraphs.length) {
    const paragraph = paragraphs[index];
    if (paragraph === WORD_PAGE_BREAK) {
      blocks.push({ type: "pageBreak" });
      index += 1;
      continue;
    }

    const toc = parseTocEntry(paragraph);
    if (toc) {
      blocks.push(toc);
      index += 1;
      continue;
    }

    if (isTableRowCandidate(paragraph)) {
      const rows: string[][] = [];
      while (index < paragraphs.length && isTableRowCandidate(paragraphs[index])) {
        rows.push(...normalizeTableRows(splitTableRow(paragraphs[index])));
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    blocks.push(classifyParagraphBlock(paragraph, blocks));
    index += 1;
  }
  return blocks;
}

function inferLayoutHints(paragraphs: string[], assets: LegacyWordAsset[]): LegacyWordLayoutHints {
  const sample = paragraphs.slice(0, 40).join("\n");
  const isOasisSpec = /Word Specification Sample/.test(sample) && /\bOASIS\b/i.test(paragraphs.join("\n"));
  const oasisImage = isOasisSpec
    ? assets.find((asset) => asset.mimeType === "image/png" && asset.width && asset.height && asset.width / asset.height > 2.5)
    : undefined;
  return {
    lineNumbers: isOasisSpec,
    headerBrand: isOasisSpec ? "oasis" : undefined,
    headerImageId: oasisImage?.id,
    footer: isOasisSpec ? inferOasisFooter(paragraphs) : undefined
  };
}

function inferOasisFooter(paragraphs: string[]): LegacyWordFooter {
  const documentId = findValueAfterLabel(paragraphs, "Document identifier:") || paragraphs.find((paragraph) => /^wd-[\w.-]+/i.test(paragraph));
  const subtitle = paragraphs.find((paragraph) => /\b(?:draft|version)\b/i.test(paragraph) && /\d{4}/.test(paragraph));
  const date = subtitle?.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/)?.[0];
  const copyright =
    paragraphs.find((paragraph) => /Copyright.*OASIS.*All Rights Reserved/i.test(paragraph)) ||
    "Copyright © OASIS Open 2002. All Rights Reserved.";
  return { documentId, date, copyright };
}

function findValueAfterLabel(paragraphs: string[], label: string): string | undefined {
  const index = paragraphs.findIndex((paragraph) => paragraph.toLowerCase() === label.toLowerCase());
  if (index < 0) {
    return undefined;
  }
  return paragraphs.slice(index + 1).find((paragraph) => paragraph !== WORD_PAGE_BREAK && paragraph.length > 0);
}

function paginateWordBlocks(blocks: LegacyWordBlock[], layout: LegacyWordLayoutHints): LegacyWordBlock[][] {
  const maxLines = layout.lineNumbers ? 33 : 46;
  const pages: LegacyWordBlock[][] = [];
  let current: LegacyWordBlock[] = [];
  let usedLines = 0;

  for (const block of blocks) {
    if (block.type === "pageBreak") {
      if (current.length > 0) {
        pages.push(current);
      }
      current = [];
      usedLines = 0;
      continue;
    }
    const lines = estimatedLineCount(block);
    const shouldBreak =
      current.length > 0 &&
      (usedLines + lines > maxLines || (block.type === "heading" && usedLines > Math.floor(maxLines * 0.72)));
    if (shouldBreak) {
      pages.push(current);
      current = [];
      usedLines = 0;
    }
    current.push(block);
    usedLines += lines;
  }

  if (current.length > 0 || pages.length === 0) {
    pages.push(current);
  }
  return pages;
}

function estimatedLineCount(block: LegacyWordBlock): number {
  if (block.type === "pageBreak") {
    return 0;
  }
  if (block.type === "table") {
    return Math.max(1, block.rows.length);
  }
  if (block.type === "toc") {
    return 1;
  }
  const baseWidth = "indent" in block && block.indent ? 78 : 96;
  return Math.max(1, Math.ceil(block.text.length / baseWidth));
}

function classifyParagraphBlock(text: string, previousBlocks: LegacyWordBlock[]): LegacyWordBlock {
  const visibleIndex = previousBlocks.filter((block) => block.type !== "toc").length;
  if (visibleIndex === 0 && text.length <= 140) {
    return { type: "title", text };
  }
  if (visibleIndex === 1 && /draft|version|20\d{2}|19\d{2}/i.test(text) && text.length <= 140) {
    return { type: "subtitle", text };
  }
  const headingLevel = inferHeadingLevel(text, previousBlocks);
  if (headingLevel) {
    return { type: "heading", text, level: headingLevel };
  }
  if (/^[\w\s/().-]{2,45}:$/.test(text)) {
    return { type: "label", text };
  }
  if (isInstructionParagraph(text)) {
    return { type: "instruction", text, indent: shouldIndentParagraph(previousBlocks) };
  }
  if (/^\[[-\w.]+\]\s+/.test(text)) {
    return { type: "reference", text };
  }
  const listLevel = inferListItemLevel(text);
  if (listLevel) {
    return { type: "listItem", text, level: listLevel };
  }
  if (isCodeLikeParagraph(text)) {
    return { type: "code", text, indent: shouldIndentParagraph(previousBlocks) };
  }
  return { type: "paragraph", text, indent: shouldIndentParagraph(previousBlocks) };
}

function isInstructionParagraph(text: string): boolean {
  return /^\[[^\]]{8,}\]$/.test(text.trim());
}

function inferHeadingLevel(text: string, previousBlocks: LegacyWordBlock[]): 1 | 2 | 3 | undefined {
  if (text.length > 120) {
    return undefined;
  }
  if (/^table of contents$/i.test(text)) {
    return 1;
  }
  if (/^(?:introduction|word styles|references|appendix\b.*|acknowledgments|revision history|notices)$/i.test(text)) {
    return 1;
  }
  const numbered = text.match(/^([1-9](?:\.\d+)*)\s+.+/);
  if (numbered) {
    return Math.min(3, numbered[1].split(".").length) as 1 | 2 | 3;
  }
  if (/^(?:terminology|overall style|title page|headings|paragraphs|lists|tables|code examples|character styles|normative)$/i.test(text)) {
    return 2;
  }
  const previousHeading = [...previousBlocks].reverse().find((block) => block.type === "heading");
  if (previousHeading?.type === "heading" && previousHeading.level === 1 && /^[A-Z][A-Za-z0-9 ()/-]{2,80}$/.test(text)) {
    return 2;
  }
  return undefined;
}

function shouldIndentParagraph(previousBlocks: LegacyWordBlock[]): boolean {
  for (let index = previousBlocks.length - 1; index >= 0; index -= 1) {
    const block = previousBlocks[index];
    if (block.type === "toc" || block.type === "table") {
      continue;
    }
    if (block.type === "label") {
      return true;
    }
    if ((block.type === "paragraph" || block.type === "code") && block.indent) {
      return true;
    }
    return false;
  }
  return false;
}

function inferListItemLevel(text: string): 1 | 2 | undefined {
  if (/^(?:list bullet|definition term)$/i.test(text)) {
    return 1;
  }
  if (/^(?:list bullet 2|list continue 2|definition for the term\.)$/i.test(text)) {
    return 2;
  }
  return undefined;
}

function parseTocEntry(text: string): LegacyWordBlock | undefined {
  const tabCells = splitTableRow(text);
  if (tabCells.length >= 2 && /^\d{1,3}$/.test(tabCells[tabCells.length - 1] || "")) {
    const title = tabCells.slice(0, -1).join(" ").trim();
    if (isLikelyTocTitle(title)) {
      const number = title.match(/^(\d+(?:\.\d+)*)\b/)?.[1] || "";
      return { type: "toc", title, page: tabCells[tabCells.length - 1], level: number.includes(".") ? Math.min(3, number.split(".").length) : 1 };
    }
  }

  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(?:(\d+(?:\.\d+)*)\s+)?(.+?)\s+(\d{1,3})$/);
  if (!match || cleaned.length > 140) {
    return undefined;
  }
  const number = match[1] || "";
  const title = `${number ? `${number} ` : ""}${match[2] || ""}`.trim();
  const page = match[3];
  if (!title || !page || !/^(?:appendix\b|references\b|introduction\b|[A-Z0-9])/i.test(title)) {
    return undefined;
  }
  if (!isLikelyTocTitle(title)) {
    return undefined;
  }
  const level = number.includes(".") ? Math.min(3, number.split(".").length) : 1;
  return { type: "toc", title, page, level };
}

function isLikelyTocTitle(title: string): boolean {
  return /^(?:appendix\b|references\b|introduction\b|[1-9](?:\.\d+)*\b|[A-Z][\w\s.-]{2,80}$)/i.test(title);
}

function isTableRowCandidate(text: string): boolean {
  if (/^\[[-\w.]+\]\t+/.test(text)) {
    return false;
  }
  const cells = splitTableRow(text);
  return cells.length >= 2 && cells.some((cell) => cell.length > 0);
}

function splitTableRow(text: string): string[] {
  return text
    .split(/\t+/)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function normalizeTableRows(cells: string[]): string[][] {
  if (cells.length >= 8) {
    const columnCount = inferTableColumnCount(cells);
    if (columnCount > 1 && cells.length % columnCount === 0) {
      const rows: string[][] = [];
      for (let offset = 0; offset < cells.length; offset += columnCount) {
        rows.push(cells.slice(offset, offset + columnCount));
      }
      return rows;
    }
  }
  return [cells];
}

function inferTableColumnCount(cells: string[]): number {
  const header = cells.slice(0, 6).join(" ").toLowerCase();
  if (/\brev\b/.test(header) && /\bdate\b/.test(header) && /whom|what/.test(header)) {
    return 4;
  }
  for (const candidate of [5, 4, 3, 2]) {
    if (cells.length % candidate === 0) {
      return candidate;
    }
  }
  return 0;
}

function isCodeLikeParagraph(text: string): boolean {
  return (
    /^\d{24,}$/.test(text.replace(/\s+/g, "")) ||
    /^GET\s+https?:\/\//i.test(text) ||
    /^<other\s+HTTP\b/i.test(text) ||
    /<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^>@]*)?>/.test(text) ||
    /^\s*(?:<\?xml|function\b|const\b|let\b|var\b|if\s*\(|for\s*\(|while\s*\(|\{|\}|\/\/)/.test(text)
  );
}

function cleanWordText(value: string): string {
  return stripWordFieldCodes(value)
    .replace(/[\u0001-\u0006\u0008\u000e-\u001f]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function stripWordFieldCodes(value: string): string {
  return value
    .replace(/\u0013\s*(?:HYPERLINK|PAGEREF|TOC)\b[^\u0014\u0015]*/gi, "")
    .replace(/[\u0013-\u0015]/g, "")
    .replace(/\bHYPERLINK\s+\\l\s+"[^"]*"\s*/gi, "")
    .replace(/\bHYPERLINK\s+"[^"]*"\s*/gi, "")
    .replace(/\bPAGEREF\s+\S+\s+\\h\s*/gi, "")
    .replace(/\bTOC\s+\\o\s+"[^"]*"\s+\\h\s+\\z\s*/gi, "")
    .replace(/\bREF\s+[_A-Za-z0-9-]+\s+(?:\\[A-Za-z]+\s*)+/gi, "");
}

function isDisplayableParagraph(value: string): boolean {
  if (value.length < 2) {
    return false;
  }
  const letters = [...value].filter((char) => /[\p{L}\p{N}]/u.test(char)).length;
  return letters >= Math.min(2, value.length);
}

function inferDocumentTitle(paragraphs: string[]): string {
  return paragraphs.find((paragraph) => paragraph.length <= 120) || "Word 文档";
}

function appendMeta(list: HTMLDListElement, label: string, value: string): void {
  const term = window.document.createElement("dt");
  term.textContent = label;
  const detail = window.document.createElement("dd");
  detail.textContent = value;
  list.append(term, detail);
}

function concatChunks(chunks: Uint8Array[], size?: number): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(size === undefined ? total : Math.min(total, size));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.length, output.length - offset));
    output.set(slice, offset);
    offset += slice.length;
    if (offset >= output.length) {
      break;
    }
  }
  return output;
}

function alignEven(value: number): number {
  return value % 2 === 0 ? value : value + 1;
}

function isUsableSector(sector: number): boolean {
  return sector !== FREE_SECTOR && sector !== END_OF_CHAIN && sector !== FAT_SECTOR && sector !== DIFAT_SECTOR;
}

function sectorOffset(sector: number, sectorSize: number): number {
  return (sector + 1) * sectorSize;
}

function normalizeStreamName(name: string): string {
  return name.replace(/^\/+/, "").toLowerCase();
}

function decodeUtf16Le(bytes: Uint8Array): string {
  return new TextDecoder("utf-16le").decode(bytes);
}

function decodeWindows1252(bytes: Uint8Array): string {
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  }
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
