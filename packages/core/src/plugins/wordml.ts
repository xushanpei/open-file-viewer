const WORDML_NS = "http://schemas.microsoft.com/office/word/2003/wordml";

type WordMlRunStyle = {
  fontFamily?: string;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  backgroundColor?: string;
};

type WordMlParagraphStyle = {
  alignment?: "left" | "center" | "right" | "justify";
  marginTopPt?: number;
  marginRightPt?: number;
  marginBottomPt?: number;
  marginLeftPt?: number;
  textIndentPt?: number;
  lineHeight?: string;
};

type WordMlRun = {
  text: string;
  style: WordMlRunStyle;
};

type WordMlParagraph = {
  type: "paragraph";
  runs: WordMlRun[];
  style: WordMlParagraphStyle;
  breakBefore: boolean;
  breakAfter: boolean;
};

type WordMlTableCell = {
  paragraphs: WordMlParagraph[];
  colSpan: number;
  widthPt?: number;
  verticalAlign?: string;
  backgroundColor?: string;
};

type WordMlTable = {
  type: "table";
  rows: WordMlTableCell[][];
  columns: number[];
  widthPt?: number;
};

type WordMlBlock = WordMlParagraph | WordMlTable | { type: "pageBreak" };

type WordMlPageLayout = {
  widthPt: number;
  heightPt: number;
  marginTopPt: number;
  marginRightPt: number;
  marginBottomPt: number;
  marginLeftPt: number;
  footerDistancePt: number;
};

type WordMlNamedStyle = {
  basedOn?: string;
  paragraph: WordMlParagraphStyle;
  run: WordMlRunStyle;
};

export type Word2003XmlDocument = {
  blocks: WordMlBlock[];
  layout: WordMlPageLayout;
  footerTemplate?: string;
};

export function parseWord2003XmlDocument(source: string): Word2003XmlDocument | undefined {
  const normalized = source.replace(/^\uFEFF/, "");
  if (!/<(?:\w+:)?wordDocument\b/i.test(normalized) || !normalized.includes(WORDML_NS)) {
    return undefined;
  }

  const xml = new DOMParser().parseFromString(normalized, "application/xml");
  if (xml.querySelector("parsererror") || xml.documentElement.localName !== "wordDocument") {
    return undefined;
  }

  const body = descendants(xml.documentElement, "body")[0];
  if (!body) {
    return undefined;
  }

  const styles = parseNamedStyles(xml);
  const blocks: WordMlBlock[] = [];
  for (const child of collectBodyChildren(body)) {
    if (isWordElement(child, "p")) {
      const paragraph = parseParagraph(child, styles);
      if (paragraph.breakBefore) blocks.push({ type: "pageBreak" });
      blocks.push(paragraph);
      if (paragraph.breakAfter) blocks.push({ type: "pageBreak" });
    } else if (isWordElement(child, "tbl")) {
      blocks.push(parseTable(child, styles));
    }
  }

  const sectionProperties = [...descendants(body, "sectPr")].at(-1);
  return {
    blocks,
    layout: parsePageLayout(sectionProperties),
    footerTemplate: sectionProperties ? parseFooterTemplate(sectionProperties) : undefined
  };
}

export function renderWord2003XmlDocument(panel: HTMLElement, wordDocument: Word2003XmlDocument): void {
  panel.replaceChildren();
  panel.classList.add("ofv-office-wordml");
  const article = document.createElement("article");
  article.className = "ofv-wordml-document";
  const pages = paginateBlocks(wordDocument.blocks);

  for (const [pageIndex, blocks] of pages.entries()) {
    const page = document.createElement("section");
    page.className = "ofv-wordml-page";
    page.setAttribute("aria-label", `Word 2003 XML 第 ${pageIndex + 1} 页`);
    applyPageLayout(page, wordDocument.layout);

    const content = document.createElement("div");
    content.className = "ofv-wordml-page-content";
    for (const block of blocks) {
      content.append(block.type === "paragraph" ? renderParagraph(block) : renderTable(block));
    }
    page.append(content);

    if (wordDocument.footerTemplate) {
      const footer = document.createElement("footer");
      footer.className = "ofv-wordml-footer";
      footer.style.bottom = scaledPt(Math.max(6, wordDocument.layout.footerDistancePt - 12));
      footer.style.left = scaledPt(wordDocument.layout.marginLeftPt);
      footer.style.right = scaledPt(wordDocument.layout.marginRightPt);
      footer.textContent = wordDocument.footerTemplate
        .replaceAll("{PAGE}", String(pageIndex + 1))
        .replaceAll("{NUMPAGES}", String(pages.length));
      page.append(footer);
    }
    article.append(page);
  }
  panel.append(article);
}

function collectBodyChildren(body: Element): Element[] {
  const output: Element[] = [];
  for (const child of elementChildren(body)) {
    if (isWordElement(child, "p") || isWordElement(child, "tbl")) {
      output.push(child);
      continue;
    }
    if (child.localName === "sect") {
      output.push(...elementChildren(child).filter((element) => isWordElement(element, "p") || isWordElement(element, "tbl")));
    }
  }
  return output;
}

function parseNamedStyles(xml: XMLDocument): Map<string, WordMlNamedStyle> {
  const raw = new Map<string, WordMlNamedStyle>();
  for (const style of descendants(xml.documentElement, "style")) {
    if (style.namespaceURI !== WORDML_NS) continue;
    const id = wordAttribute(style, "styleId");
    if (!id) continue;
    const paragraphProperties = directWordChild(style, "pPr");
    raw.set(id, {
      basedOn: wordAttribute(directWordChild(style, "basedOn"), "val"),
      paragraph: parseParagraphProperties(paragraphProperties),
      run: parseRunProperties(directWordChild(style, "rPr"))
    });
  }

  const resolved = new Map<string, WordMlNamedStyle>();
  const resolve = (id: string, seen = new Set<string>()): WordMlNamedStyle | undefined => {
    if (resolved.has(id)) return resolved.get(id);
    const own = raw.get(id);
    if (!own || seen.has(id)) return own;
    seen.add(id);
    const base = own.basedOn ? resolve(own.basedOn, seen) : undefined;
    const value = {
      basedOn: own.basedOn,
      paragraph: { ...(base?.paragraph || {}), ...own.paragraph },
      run: { ...(base?.run || {}), ...own.run }
    };
    resolved.set(id, value);
    return value;
  };
  for (const id of raw.keys()) resolve(id);
  return resolved;
}

function parseParagraph(element: Element, styles: Map<string, WordMlNamedStyle>): WordMlParagraph {
  const paragraphProperties = directWordChild(element, "pPr");
  const styleId = wordAttribute(directWordChild(paragraphProperties, "pStyle"), "val");
  const namedStyle = styleId ? styles.get(styleId) : undefined;
  const paragraphRunStyle = parseRunProperties(directWordChild(paragraphProperties, "rPr"));
  const runs: WordMlRun[] = [];

  const appendRuns = (container: Element) => {
    for (const child of elementChildren(container)) {
      if (isWordElement(child, "r")) {
        const runStyle = {
          ...(namedStyle?.run || {}),
          ...paragraphRunStyle,
          ...parseRunProperties(directWordChild(child, "rPr"))
        };
        const text = readRunText(child);
        if (text) runs.push({ text, style: runStyle });
      } else if (child.namespaceURI === WORDML_NS && ["hlink", "smartTag", "proofErr"].includes(child.localName)) {
        appendRuns(child);
      }
    }
  };
  appendRuns(element);

  const pageBreakBefore = directWordChild(paragraphProperties, "pageBreakBefore");
  const hasRunPageBreak = descendants(element, "br").some(
    (br) => br.namespaceURI === WORDML_NS && wordAttribute(br, "type") === "page"
  );
  return {
    type: "paragraph",
    runs,
    style: { ...(namedStyle?.paragraph || {}), ...parseParagraphProperties(paragraphProperties) },
    breakBefore: Boolean(pageBreakBefore && wordBoolean(pageBreakBefore)),
    breakAfter: hasRunPageBreak
  };
}

function parseTable(element: Element, styles: Map<string, WordMlNamedStyle>): WordMlTable {
  const tableProperties = directWordChild(element, "tblPr");
  const tableWidth = directWordChild(tableProperties, "tblW");
  const grid = directWordChild(element, "tblGrid");
  const columns = grid
    ? elementChildren(grid)
        .filter((child) => isWordElement(child, "gridCol"))
        .map((column) => twipsToPt(wordNumber(column, "w")))
        .filter((width) => width > 0)
    : [];
  const rows = elementChildren(element)
    .filter((child) => isWordElement(child, "tr"))
    .map((row) =>
      elementChildren(row)
        .filter((child) => isWordElement(child, "tc"))
        .map((cell) => parseTableCell(cell, styles))
    );
  return {
    type: "table",
    rows,
    columns,
    widthPt: wordAttribute(tableWidth, "type") === "dxa" ? twipsToPt(wordNumber(tableWidth, "w")) : undefined
  };
}

function parseTableCell(element: Element, styles: Map<string, WordMlNamedStyle>): WordMlTableCell {
  const properties = directWordChild(element, "tcPr");
  const width = directWordChild(properties, "tcW");
  const shading = directWordChild(properties, "shd");
  const paragraphs = elementChildren(element)
    .filter((child) => isWordElement(child, "p"))
    .map((paragraph) => parseParagraph(paragraph, styles));
  return {
    paragraphs,
    colSpan: Math.max(1, wordNumber(directWordChild(properties, "gridSpan"), "val") || 1),
    widthPt: wordAttribute(width, "type") === "dxa" ? twipsToPt(wordNumber(width, "w")) : undefined,
    verticalAlign: wordAttribute(directWordChild(properties, "vAlign"), "val"),
    backgroundColor: normalizeColor(wordAttribute(shading, "fill"))
  };
}

function parseParagraphProperties(properties?: Element): WordMlParagraphStyle {
  if (!properties) return {};
  const alignment = wordAttribute(directWordChild(properties, "jc"), "val");
  const spacing = directWordChild(properties, "spacing");
  const indentation = directWordChild(properties, "ind");
  const hanging = wordNumber(indentation, "hanging");
  const firstLine = wordNumber(indentation, "first-line") || wordNumber(indentation, "firstLine");
  const line = wordNumber(spacing, "line");
  const lineRule = wordAttribute(spacing, "line-rule") || wordAttribute(spacing, "lineRule");
  return compactObject({
    alignment:
      alignment === "center" || alignment === "right" || alignment === "left"
        ? alignment
        : alignment === "both" || alignment === "distribute"
          ? "justify"
          : undefined,
    marginTopPt: optionalTwipsToPt(wordAttribute(spacing, "before")),
    marginRightPt: optionalTwipsToPt(wordAttribute(indentation, "right")),
    marginBottomPt: optionalTwipsToPt(wordAttribute(spacing, "after")),
    marginLeftPt: optionalTwipsToPt(wordAttribute(indentation, "left")),
    textIndentPt: firstLine ? twipsToPt(firstLine) : hanging ? -twipsToPt(hanging) : undefined,
    lineHeight: line > 0 ? (lineRule === "exact" || lineRule === "at-least" ? `${twipsToPt(line)}pt` : String(line / 240)) : undefined
  });
}

function parseRunProperties(properties?: Element): WordMlRunStyle {
  if (!properties) return {};
  const fonts = directWordChild(properties, "rFonts");
  const size = wordNumber(directWordChild(properties, "sz"), "val");
  const underline = directWordChild(properties, "u");
  const color = wordAttribute(directWordChild(properties, "color"), "val");
  const highlight = wordAttribute(directWordChild(properties, "highlight"), "val");
  const bold = directWordChild(properties, "b");
  const italic = directWordChild(properties, "i");
  return compactObject({
    fontFamily:
      wordAttribute(fonts, "fareast") || wordAttribute(fonts, "ascii") || wordAttribute(fonts, "h-ansi") || wordAttribute(fonts, "hAnsi"),
    fontSizePt: size > 0 ? size / 2 : undefined,
    bold: bold ? wordBoolean(bold) : undefined,
    italic: italic ? wordBoolean(italic) : undefined,
    underline: underline ? !["none", "off", "0"].includes((wordAttribute(underline, "val") || "single").toLowerCase()) : undefined,
    color: normalizeColor(color),
    backgroundColor: normalizeHighlight(highlight)
  });
}

function readRunText(run: Element): string {
  let text = "";
  for (const child of elementChildren(run)) {
    if (isWordElement(child, "t")) text += child.textContent || "";
    else if (isWordElement(child, "tab")) text += "\t";
    else if (isWordElement(child, "br") && wordAttribute(child, "type") !== "page") text += "\n";
  }
  return text;
}

function parsePageLayout(sectionProperties?: Element): WordMlPageLayout {
  const pageSize = directWordChild(sectionProperties, "pgSz");
  const margins = directWordChild(sectionProperties, "pgMar");
  return {
    widthPt: twipsToPt(wordNumber(pageSize, "w") || 11906),
    heightPt: twipsToPt(wordNumber(pageSize, "h") || 16838),
    marginTopPt: twipsToPt(wordNumber(margins, "top") || 1440),
    marginRightPt: twipsToPt(wordNumber(margins, "right") || 1440),
    marginBottomPt: twipsToPt(wordNumber(margins, "bottom") || 1440),
    marginLeftPt: twipsToPt(wordNumber(margins, "left") || 1440),
    footerDistancePt: twipsToPt(wordNumber(margins, "footer") || 720)
  };
}

function parseFooterTemplate(sectionProperties: Element): string | undefined {
  const footer = descendants(sectionProperties, "ftr").find((element) => element.namespaceURI === WORDML_NS);
  if (!footer) return undefined;
  const paragraphs = descendants(footer, "p")
    .filter((element) => element.namespaceURI === WORDML_NS)
    .map(readFieldAwareText)
    .map((value) => value.trim())
    .filter(Boolean);
  return paragraphs.at(-1);
}

function readFieldAwareText(paragraph: Element): string {
  type Field = { instruction: string; separated: boolean; recognized: boolean };
  const fields: Field[] = [];
  let output = "";
  const walk = (node: Node) => {
    if (!(node instanceof Element)) {
      for (const child of node.childNodes) walk(child);
      return;
    }
    if (isWordElement(node, "fldChar")) {
      const type = wordAttribute(node, "fldCharType");
      if (type === "begin") fields.push({ instruction: "", separated: false, recognized: false });
      else if (type === "separate" && fields.length > 0) {
        const field = fields.at(-1)!;
        field.separated = true;
        const name = field.instruction.trim().split(/\s+/)[0]?.toUpperCase();
        field.recognized = name === "PAGE" || name === "NUMPAGES";
        if (field.recognized) output += `{${name}}`;
      } else if (type === "end") fields.pop();
      return;
    }
    if (isWordElement(node, "instrText")) {
      if (fields.length > 0) fields.at(-1)!.instruction += node.textContent || "";
      return;
    }
    if (isWordElement(node, "t")) {
      const field = fields.at(-1);
      if (!field || (field.separated && !field.recognized)) output += node.textContent || "";
      return;
    }
    if (isWordElement(node, "tab")) output += "\t";
    else if (isWordElement(node, "br")) output += "\n";
    for (const child of node.childNodes) walk(child);
  };
  walk(paragraph);
  return output;
}

function paginateBlocks(blocks: WordMlBlock[]): Exclude<WordMlBlock, { type: "pageBreak" }>[][] {
  const pages: Exclude<WordMlBlock, { type: "pageBreak" }>[][] = [];
  let current: Exclude<WordMlBlock, { type: "pageBreak" }>[] = [];
  for (const block of blocks) {
    if (block.type === "pageBreak") {
      pages.push(current);
      current = [];
    } else {
      current.push(block);
    }
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

function renderParagraph(paragraph: WordMlParagraph): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = "ofv-wordml-paragraph";
  applyParagraphStyle(element, paragraph.style);
  for (const run of paragraph.runs) {
    const span = document.createElement("span");
    span.textContent = run.text;
    applyRunStyle(span, run.style);
    element.append(span);
  }
  if (paragraph.runs.length === 0) element.append(document.createElement("br"));
  return element;
}

function renderTable(tableModel: WordMlTable): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "ofv-wordml-table";
  if (tableModel.widthPt) table.style.width = scaledPt(tableModel.widthPt);
  if (tableModel.columns.length > 0) {
    const colgroup = document.createElement("colgroup");
    for (const width of tableModel.columns) {
      const column = document.createElement("col");
      column.style.width = scaledPt(width);
      colgroup.append(column);
    }
    table.append(colgroup);
  }
  const body = table.createTBody();
  for (const rowModel of tableModel.rows) {
    const row = body.insertRow();
    for (const cellModel of rowModel) {
      const cell = row.insertCell();
      cell.colSpan = cellModel.colSpan;
      if (cellModel.widthPt) cell.style.width = scaledPt(cellModel.widthPt);
      if (cellModel.verticalAlign) cell.style.verticalAlign = cellModel.verticalAlign === "center" ? "middle" : cellModel.verticalAlign;
      if (cellModel.backgroundColor) cell.style.backgroundColor = cellModel.backgroundColor;
      for (const paragraph of cellModel.paragraphs) cell.append(renderParagraph(paragraph));
    }
  }
  return table;
}

function applyPageLayout(page: HTMLElement, layout: WordMlPageLayout): void {
  page.style.width = scaledPt(layout.widthPt);
  page.style.height = scaledPt(layout.heightPt);
  page.style.padding = [layout.marginTopPt, layout.marginRightPt, layout.marginBottomPt, layout.marginLeftPt].map(scaledPt).join(" ");
}

function applyParagraphStyle(element: HTMLElement, style: WordMlParagraphStyle): void {
  if (style.alignment) element.style.textAlign = style.alignment;
  if (style.marginTopPt !== undefined) element.style.marginTop = scaledPt(style.marginTopPt);
  if (style.marginRightPt !== undefined) element.style.marginRight = scaledPt(style.marginRightPt);
  if (style.marginBottomPt !== undefined) element.style.marginBottom = scaledPt(style.marginBottomPt);
  if (style.marginLeftPt !== undefined) element.style.marginLeft = scaledPt(style.marginLeftPt);
  if (style.textIndentPt !== undefined) element.style.textIndent = scaledPt(style.textIndentPt);
  if (style.lineHeight) element.style.lineHeight = style.lineHeight.includes("pt") ? `calc(${style.lineHeight} * var(--ofv-office-zoom, 1))` : style.lineHeight;
}

function applyRunStyle(element: HTMLElement, style: WordMlRunStyle): void {
  if (style.fontFamily) element.style.fontFamily = `"${style.fontFamily.replaceAll('"', '\\"')}"`;
  if (style.fontSizePt) element.style.fontSize = scaledPt(style.fontSizePt);
  if (style.bold !== undefined) element.style.fontWeight = style.bold ? "700" : "400";
  if (style.italic !== undefined) element.style.fontStyle = style.italic ? "italic" : "normal";
  if (style.underline !== undefined) element.style.textDecoration = style.underline ? "underline" : "none";
  if (style.color) element.style.color = style.color;
  if (style.backgroundColor) element.style.backgroundColor = style.backgroundColor;
}

function directWordChild(parent: Element | undefined, localName: string): Element | undefined {
  return parent ? elementChildren(parent).find((child) => isWordElement(child, localName)) : undefined;
}

function descendants(parent: Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", localName));
}

function elementChildren(parent: Element): Element[] {
  return Array.from(parent.children);
}

function isWordElement(element: Element, localName: string): boolean {
  return element.namespaceURI === WORDML_NS && element.localName === localName;
}

function wordAttribute(element: Element | undefined, name: string): string | undefined {
  if (!element) return undefined;
  return element.getAttributeNS(WORDML_NS, name) || element.getAttribute(`w:${name}`) || element.getAttribute(name) || undefined;
}

function wordNumber(element: Element | undefined, name: string): number {
  return Number.parseFloat(wordAttribute(element, name) || "0") || 0;
}

function wordBoolean(element: Element): boolean {
  return !["off", "false", "0", "none"].includes((wordAttribute(element, "val") || "on").toLowerCase());
}

function twipsToPt(value: number): number {
  return value / 20;
}

function optionalTwipsToPt(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? twipsToPt(number) : undefined;
}

function scaledPt(value: number): string {
  return `calc(${Number(value.toFixed(3))}pt * var(--ofv-office-zoom, 1))`;
}

function normalizeColor(value?: string): string | undefined {
  return value && /^[0-9a-f]{6}$/i.test(value) ? `#${value}` : undefined;
}

function normalizeHighlight(value?: string): string | undefined {
  const colors: Record<string, string> = {
    black: "#000000",
    blue: "#0000ff",
    cyan: "#00ffff",
    green: "#008000",
    magenta: "#ff00ff",
    red: "#ff0000",
    yellow: "#ffff00"
  };
  return value ? colors[value.toLowerCase()] : undefined;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
