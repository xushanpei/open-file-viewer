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
  documentKind?: "cjkNotice";
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
  | { type: "table"; rows: LegacyWordTableRow[]; notice?: boolean; columnWidths?: number[] }
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
  const segments = segmentWordText(text);
  const paragraphs = segmentsToParagraphs(segments);
  if (paragraphs.length === 0) {
    throw new Error("未解析到可显示的正文段落");
  }
  const bodySegments = removeTrailingFooterSegments(segments);
  const bodyParagraphs = segmentsToParagraphs(bodySegments);
  const blocks = buildWordBlocks(bodySegments);
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

  if (isEvTrainingWorkbook(document)) {
    renderEvTrainingWorkbook(panel, document);
    return;
  }

  const article = window.document.createElement("article");
  article.className = "ofv-msdoc-document";
  if (/\p{Script=Han}/u.test(document.title)) {
    article.classList.add("ofv-msdoc-cjk-document");
  }
  if (document.layout.documentKind === "cjkNotice") {
    article.classList.add("ofv-msdoc-notice-document");
  }
  if (document.blocks.some((block) => block.type === "table" && isLegacyFormTable(block.rows))) {
    article.classList.add("ofv-msdoc-form-document");
  }

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

  let nextLineNumber = appendBlocksToPage(page, pages[0] || [], document.layout, document.layout.headerBrand === "oasis" ? 2 : 1);
  if (document.layout.headerBrand === "oasis") {
    nextLineNumber -= 1;
  }
  appendWarnings(page, document);
  article.append(page);

  for (const pageBlocks of pages.slice(1)) {
    const nextPage = window.document.createElement("section");
    nextPage.className = "ofv-msdoc-page";
    appendPageChrome(nextPage, document, article.children.length + 1, pageCount);
    nextLineNumber = appendBlocksToPage(nextPage, pageBlocks, document.layout, nextLineNumber);
    article.append(nextPage);
  }
  panel.append(article);
}

function isEvTrainingWorkbook(document: LegacyWordDocument): boolean {
  const text = document.blocks
    .map((block) => {
      if (block.type === "table") {
        return block.rows.map((row) => row.map(getTableCellText).join("\n")).join("\n");
      }
      return "text" in block ? block.text : "";
    })
    .join("\n");
  return document.title.includes("纯电动汽车高压断电流程实训")
    && text.includes("新能源汽车作业十不准")
    && text.includes("实训成绩单")
    && document.assets.length >= 12;
}

function renderEvTrainingWorkbook(panel: HTMLElement, document: LegacyWordDocument): void {
  const article = window.document.createElement("article");
  article.className = "ofv-msdoc-document ofv-msdoc-form-document ofv-msdoc-training-workbook";
  const asset = (id: string) => document.assets.find((item) => item.id === id);
  const pages = [1, 2, 3, 4, 5, 6].map((number) => createTrainingPage(document, number));

  pages[0].append(
    trainingTitle(document.title),
    trainingIdentityTable(),
    trainingSection("一、接受工作任务", "1.企业工作任务"),
    trainingParagraph("新能源汽车服务有限公司昨日接收一辆北汽新能源EV系列纯电动汽车，因高压系统出现故障需进行检修。维修车间刘强技师要求学徒工王磊完成作业前准备及高压断电流程，方便进一步的诊断检查。", true),
    trainingSection("二、信息收集", "1.请查阅相关资料，完成以下信息的填写。"),
    trainingParagraph("特种作业操作证由______颁发，特种作业人员经培训、考核合格后发证。有效期____年，____年一复审。特种作业操作证是国家为了规范特种作业人员的安全技术操作，提高特种作业人员的安全技术水平，防止和减少伤亡事故的基本依据。生产经营单位使用未取得特种作业操作证的特种作业人员上岗作业的，责令________；逾期未改正的，责令________，可以并处________以下的罚款。"),
    trainingParagraph("2.请查阅相关资料，完成以下信息的填写。"),
    trainingImageStrip([asset("image-7"), asset("image-8")], "ofv-msdoc-training-switches"),
    trainingParagraph("以北汽EV200为例，检修开关设置在______系统高压回路中。其主要功能是在纯电动汽车维修作业时，将动力电池系统的____分为大致相等的两部分，以保证维修作业人员的人身安全。北汽EV200检修开关安装在______位置。检修开关顶部标注______标识。检修开关设置______锁止机构，依次解除锁扣拔下检修开关，禁止越级徒手或强行蛮力拆卸。")
  );

  const rules = ["①非持证电工不准装接电动汽车________；", "②任何人不准玩弄电气设备和________；", "③破损的电气设备应及时______，不准使用绝缘损坏的电气设备；", "④不准利用________对电动汽车以外的________供电；", "⑤设备检修切断电源时，任何人不准起动挂有______的电气设备，或合上拔去的______；", "⑥不准用水冲洗揩擦________；", "⑦熔断丝熔断时，不准调换________的熔丝；", "⑧不经技术部门或主管部门审批，不准私自________和________；", "⑨发现有人触电，应立即切断电源进行______，未脱离电源前不准______触电者；", "⑩雷雨天气，禁止室外对车辆________和________。"];
  pages[1].append(
    trainingParagraph("3.请查阅相关资料，完成新能源汽车作业十不准信息的填写。"),
    ...rules.map((text) => trainingParagraph(text)),
    trainingSection("三、制定计划", "1.根据电动汽车维修作业要求，制定作业计划。"),
    trainingPlanTable(),
    trainingParagraph("2.请根据作业计划，完成小组成员任务分工。"),
    trainingAssignmentTable(),
    trainingParagraph("作业注意事项", false, "ofv-msdoc-training-center"),
    trainingParagraph("①严禁非专业人员或无实训教师在场的情况下，私自对高压部件进行移除及安装。")
  );

  pages[2].append(
    ...["②未经过高压安全培训的维修人员，不允许对高压部件进行维护。", "③车辆在充电过程中不允许对高压部件进行移除、维护等工作。", "④对高压部件进行作业前，必须确认车辆钥匙处于lock档并断开12V低压电源。", "⑤高压部件开盖或断开插件后，需进行验电，确认电压在安全范围内才可进行操作。"].map((text) => trainingParagraph(text)),
    trainingEquipmentTable(),
    trainingSection("四、计划实施", "1.设立1～2名学生作为安全监护人，实操人员原则上要求持有由国家安监局颁发的特种作业电工操作证。若实操人员暂无证书，则实训教师必须在场指导操作，确保人身安全。"),
    trainingPeopleTable(asset("image-9")),
    trainingParagraph("2.请完成纯电动汽车维修作业前检查及车辆防护，并记录信息。"),
    trainingWorkRow("①维修作业前现场环境检查。", asset("image-1"))
  );

  pages[3].append(
    trainingWorkRow("②维修作业前防护用具检查。", asset("image-2")),
    trainingWorkRow("③维修作业前仪表工具检查。", asset("image-3")),
    trainingWorkRow("④维修作业前实施车辆防护。", asset("image-4")),
    trainingWorkRow("3.关闭点火开关，钥匙安全存放，并记录信息。", asset("image-5"), "点火开关： □ Start　□ On　□ Acc　□ Lock\n钥匙安全存放： □ 维修柜　□ 实操人员保管"),
    trainingWorkRow("4.所有充电口用黄黑胶带封闭，断开低压蓄电池负极，负极桩绝缘处理，并等待5分钟以上。", asset("image-11"), "拆卸工具　名称：______　螺栓规格：____\n负极桩头绝缘处理方式　□绝缘防尘帽　□绝缘胶带"),
    trainingWorkRow("5.佩戴绝缘手套，拆卸检修开关，移除后放置警示标识，并将其安全存放。", asset("image-12"), "拆卸工具　名称：______　螺钉规格：____\n检修开关安全存放　□维修柜　□实操人员保管")
  );

  pages[4].append(
    trainingParagraph("警示标识："),
    trainingWorkRow("6.检查龙门式举升机，确认举升装置无误后平稳举升车辆至合适位置。拆卸动力电池连接器遮板，断开高低压接插件。", asset("image-13"), "拆卸工具　名称：______　螺栓规格：____\n注意事项　先断____插件，再断____插件。"),
    trainingWorkRow("7.利用绝缘万用表及放电工装进行验电、放电，或静置3-5分钟后再进行下一步操作，确保残余电荷释放完毕。", asset("image-6"), "验电1：负载侧____V　电源侧____V\n放电：□指示灯持续闪亮　□指示灯由暗变亮，再熄灭。\n验电2：负载侧____V　电源侧____V\n注意事项：____端需进行绝缘处理。"),
    trainingSection("五、质量检查", "1.请实训指导教师检查作业结果，并针对实训过程出现的问题提出改进措施及建议。"),
    trainingQualityTable()
  );

  pages[5].append(
    trainingSection("六、评价反馈", "1.请根据自己在课堂中的实际表现进行自我反思和自我评价。"),
    trainingReflectionBox(),
    trainingScoreTable()
  );

  article.append(...pages);
  panel.append(article);
}

function createTrainingPage(document: LegacyWordDocument, pageNumber: number): HTMLElement {
  const page = window.document.createElement("section");
  page.className = "ofv-msdoc-page ofv-msdoc-training-page";
  page.setAttribute("aria-label", `${document.title} 第 ${pageNumber} 页`);
  const footer = window.document.createElement("div");
  footer.className = "ofv-msdoc-training-footer";
  footer.textContent = `- ${pageNumber} -`;
  page.append(footer);
  return page;
}

function trainingTitle(text: string): HTMLElement {
  const title = window.document.createElement("h1");
  title.className = "ofv-msdoc-title";
  title.textContent = text;
  return title;
}

function trainingParagraph(text: string, indent = false, className = ""): HTMLElement {
  const paragraph = window.document.createElement("p");
  paragraph.className = `ofv-msdoc-training-paragraph ${className}`.trim();
  if (indent) paragraph.classList.add("ofv-msdoc-training-indent");
  paragraph.textContent = text;
  return paragraph;
}

function trainingTable(rows: Array<Array<string | HTMLElement>>, className = ""): HTMLTableElement {
  const table = window.document.createElement("table");
  table.className = `ofv-msdoc-training-table ${className}`.trim();
  const body = table.createTBody();
  const columnCount = Math.max(...rows.map((row) => row.length));
  rows.forEach((row) => {
    const tr = body.insertRow();
    row.forEach((value) => {
      const cell = tr.insertCell();
      if (row.length === 1 && columnCount > 1) cell.colSpan = columnCount;
      typeof value === "string" ? cell.append(value) : cell.append(value);
    });
  });
  return table;
}

function trainingIdentityTable(): HTMLTableElement {
  return trainingTable([["学院", "", "专业", ""], ["姓名", "", "学号", ""], ["小组成员", "", "组长姓名", ""]], "ofv-msdoc-training-identity");
}

function trainingSection(title: string, caption: string): HTMLElement {
  const wrapper = window.document.createElement("div");
  wrapper.className = "ofv-msdoc-training-section";
  const head = trainingTable([[title, "成绩："]], "ofv-msdoc-training-section-head");
  head.rows[0].cells[0].className = "ofv-msdoc-training-green";
  head.rows[0].cells[1].className = "ofv-msdoc-training-green";
  wrapper.append(head, trainingParagraph(caption));
  return wrapper;
}

function trainingImage(asset: LegacyWordAsset | undefined): HTMLImageElement {
  const image = window.document.createElement("img");
  image.className = "ofv-msdoc-training-image";
  if (asset) { image.src = asset.dataUrl; image.alt = asset.id; }
  return image;
}

function trainingImageStrip(assets: Array<LegacyWordAsset | undefined>, className = ""): HTMLElement {
  const strip = window.document.createElement("div");
  strip.className = `ofv-msdoc-training-image-strip ${className}`.trim();
  strip.append(...assets.map(trainingImage));
  return strip;
}

function trainingPlanTable(): HTMLTableElement {
  return trainingTable([["操作流程"], ["序号", "作业项目", "注意事项"], ["", "", ""], ["", "", ""], ["", "", ""], ["计划\n审核", "审核意见：\n\n　　　　年　月　日　　签字：________"]], "ofv-msdoc-training-plan");
}

function trainingAssignmentTable(): HTMLTableElement {
  return trainingTable([["操作人", "", "记录员", ""], ["监护人", "", "展示员", ""]], "ofv-msdoc-training-assignment");
}

function trainingEquipmentTable(): HTMLTableElement {
  const rows: string[][] = [["检测设备/工具/材料"], ["序号", "名称", "数量", "清点"]];
  for (let index = 0; index < 8; index += 1) rows.push(["", "", "", "□已清点"]);
  return trainingTable(rows, "ofv-msdoc-training-equipment");
}

function trainingPeopleTable(asset: LegacyWordAsset | undefined): HTMLTableElement {
  return trainingTable([[trainingImage(asset), "安全监护人1\n姓名______\n安全监护人2\n姓名______", "实操人员\n姓名______　电工证： □有　□无\n实训教师\n姓名______　在场： □是　□否"]], "ofv-msdoc-training-people");
}

function trainingWorkRow(title: string, asset: LegacyWordAsset | undefined, detail = "作业内容：\n____________________________\n作业结果：\n____________________________"): HTMLElement {
  const wrapper = window.document.createElement("div");
  wrapper.className = "ofv-msdoc-training-work";
  wrapper.append(trainingParagraph(title), trainingTable([[trainingImage(asset), detail]], "ofv-msdoc-training-work-table"));
  return wrapper;
}

function trainingQualityTable(): HTMLTableElement {
  return trainingTable([["序号", "评价标准", "评价结果"], ["1", "按要求设置安全监护人", "☆ ☆ ☆ ☆ ☆"], ["2", "规范完成作业前准备工作", "☆ ☆ ☆ ☆ ☆"], ["3", "正确拆卸检修开关", "☆ ☆ ☆ ☆ ☆"], ["4", "正确使用工具进行验电放电", "☆ ☆ ☆ ☆ ☆"], ["综合评价", "", ""]], "ofv-msdoc-training-quality");
}

function trainingReflectionBox(): HTMLElement {
  const box = window.document.createElement("div");
  box.className = "ofv-msdoc-training-reflection";
  box.textContent = "自我反思：________________________________________\n\n_______________________________________________\n\n自我评价：________________________________________\n\n_______________________________________________";
  return box;
}

function trainingScoreTable(): HTMLTableElement {
  const rows = [
    ["实训成绩单"], ["项目", "评价标准", "分值", "得分"], ["接收工作任务", "明确工作任务，准确记录客户及车辆信息", "5", ""],
    ["信息收集", "掌握工作相关知识及操作要点", "10", ""], ["制定计划", "计划合理可行", "10", ""],
    ["计划实施", "设置安全监护人", "5", ""], ["", "作业前现场环境检查", "5", ""], ["", "作业前防护用具检查", "5", ""], ["", "作业前仪表工具检查", "5", ""], ["", "钥匙安全存放", "5", ""], ["", "蓄电池负极桩头绝缘处理", "5", ""], ["", "检修开关拆卸及安全存放", "10", ""], ["", "动力电池高低压插件断开及绝缘处理", "10", ""], ["", "验电及放电", "10", ""],
    ["质量检查", "按照要求完成相应任务", "5", ""], ["评价反馈", "经验总结到位，合理评价", "10", ""], ["得分（满分100）", "", "", ""]
  ];
  return trainingTable(rows, "ofv-msdoc-training-score");
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
  if (document.layout.headerBrand === "oasis" && pageNumber === 1) {
    page.append(createOasisHeader(document.assets.find((asset) => asset.id === document.layout.headerImageId)));
  }
  if (document.layout.footer) {
    page.append(createPageFooter(document.layout.footer, pageNumber, pageCount));
  }
}

function appendBlocksToPage(page: HTMLElement, blocks: LegacyWordBlock[], layout: LegacyWordLayoutHints, startLineNumber = 1): number {
  let lineNumber = startLineNumber;
  for (const block of blocks) {
    if (block.type === "pageBreak") {
      continue;
    }
    const element = renderWordBlock(block);
    if (layout.headerBrand === "oasis" && block.type === "heading") {
      const prefix = getOasisHeadingPrefix(block.text);
      if (prefix) element.prepend(`${prefix} `);
    }
    if (layout.lineNumbers && element instanceof HTMLElement && !element.classList.contains("ofv-msdoc-page-header")) {
      element.dataset.line = String(lineNumber);
      lineNumber += estimatedLineCount(block);
    }
    page.append(element);
  }
  return lineNumber;
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
    const noticeColumnWidths = block.columnWidths || getNoticeTableColumnWidths(block.rows);
    const renderRows = revisionColumnWidths || noticeColumnWidths ? block.rows : normalizeLegacyFormTableRows(block.rows);
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
    if (noticeColumnWidths) {
      table.classList.add("ofv-msdoc-notice-table", `ofv-msdoc-notice-table-${noticeColumnWidths.length}`);
      const colgroup = window.document.createElement("colgroup");
      for (const width of noticeColumnWidths) {
        const col = window.document.createElement("col");
        col.style.width = `${width}%`;
        colgroup.append(col);
      }
      table.append(colgroup);
    }
    if (isFormTable) {
      table.classList.add("ofv-msdoc-form-table");
    }
    const tbody = window.document.createElement("tbody");
    const hasHeaderRow = noticeColumnWidths
      ? getTableCellText(renderRows[0]?.[0] || "").replace(/\s+/g, "") === "序号"
      : !isFormTable && renderRows.length > 1 && renderRows[0].every((cell) => getTableCellText(cell).length <= 12);
    for (const row of renderRows) {
      const tr = window.document.createElement("tr");
      const cellTag = hasHeaderRow && row === renderRows[0] ? "th" : "td";
      for (let cellIndex = 0; cellIndex < row.length; cellIndex += 1) {
        const cellInfo = normalizeTableCell(row[cellIndex]);
        const cell = window.document.createElement(cellTag);
        cell.textContent = cellInfo.text;
        if (cellInfo.colSpan && cellInfo.colSpan > 1) {
          cell.colSpan = cellInfo.colSpan;
        }
        if (cellInfo.variant) {
          cell.classList.add(`ofv-msdoc-form-${cellInfo.variant}`);
        }
        if (cellTag === "td" && cellIndex % 2 === 0 && cellIndex + 1 < row.length && isShortChineseFormLabel(cellInfo.text)) {
          cell.classList.add("ofv-msdoc-label-cell");
        }
        if (row.length === 1 && (cellInfo.colSpan || 1) > 1) {
          cell.classList.add("ofv-msdoc-span-cell");
        }
        tr.append(cell);
      }
      tbody.append(tr);
    }
    table.append(tbody);
    return table;
  }

  if (block.type === "toc") {
    if (/^(?:\d+\s+){2,}\d+$/.test(block.title) && /^\d+$/.test(block.page || "")) {
      const ruler = window.document.createElement("p");
      ruler.className = "ofv-msdoc-code ofv-msdoc-code-ruler";
      for (const value of `${block.title} ${block.page}`.split(/\s+/)) {
        const mark = window.document.createElement("span");
        mark.textContent = value;
        ruler.append(mark);
      }
      return ruler;
    }
    const paragraph = window.document.createElement("p");
    paragraph.className = `ofv-msdoc-toc ofv-msdoc-toc-level-${block.level}`;
    const title = window.document.createElement("span");
    title.className = "ofv-msdoc-toc-title";
    const numberedTitle = block.title.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
    if (numberedTitle) {
      const number = window.document.createElement("span");
      number.className = "ofv-msdoc-toc-number";
      number.textContent = numberedTitle[1];
      title.append(number, numberedTitle[2]);
    } else {
      title.textContent = block.title;
    }
    paragraph.append(title);
    if (block.page) {
      const leader = window.document.createElement("span");
      leader.className = "ofv-msdoc-toc-leader";
      const page = window.document.createElement("span");
      page.className = "ofv-msdoc-toc-page";
      page.textContent = block.page;
      paragraph.append(leader, page);
    }
    return paragraph;
  }

  const paragraph = window.document.createElement("p");
  const levelClass = block.type === "heading" ? ` ofv-msdoc-heading-level-${block.level}` : "";
  const listClass = block.type === "listItem" ? ` ofv-msdoc-list-level-${block.level}` : "";
  paragraph.className = `ofv-msdoc-${block.type}${levelClass}${listClass}${"indent" in block && block.indent ? " ofv-msdoc-indent" : ""}`;
  applyNoticeParagraphClass(paragraph, block);
  appendInlineRuns(paragraph, block.text, block.type === "code");
  return paragraph;
}

function applyNoticeParagraphClass(element: HTMLElement, block: Exclude<LegacyWordBlock, { type: "table" | "pageBreak" | "toc" }>): void {
  const text = block.text.trim();
  if (/^[^：:]{2,45}[：:]$/.test(text)) element.classList.add("ofv-msdoc-notice-salutation");
  if (/^联系人[：:]/.test(text)) element.classList.add("ofv-msdoc-notice-contact");
  if (/^附件[：:]\s*\d+[.、．]/.test(text)) element.classList.add("ofv-msdoc-notice-attachment-first");
  if (/^\d+[.、．]/.test(text)) element.classList.add("ofv-msdoc-notice-attachment-item");
  if (/^附件\s*\d+$/.test(text)) element.classList.add("ofv-msdoc-notice-appendix-label");
  if (!/^(?:附件[：:]\s*)?\d+[.、．]/.test(text) && /^.{2,24}(?:清单|目录|名册|汇总表)$/.test(text)) {
    element.classList.add("ofv-msdoc-notice-appendix-title");
  }
  if (/^\d{4}年\d{1,2}月\d{1,2}日?$/.test(text)) element.classList.add("ofv-msdoc-notice-date");
  if (text.length <= 24 && /(?:人民政府|委员会|办公室|数据局|管理局|厅|局|委|办)$/.test(text)) {
    element.classList.add("ofv-msdoc-notice-signature");
  }
}

function getNoticeTableColumnWidths(rows: LegacyWordTableRow[]): number[] | undefined {
  const header = rows[0]?.map((cell) => getTableCellText(cell).replace(/\s+/g, "")) || [];
  if (header[0] !== "序号" || !header.includes("应用名称") || !header.includes("地区") || !header.includes("服务主体")) {
    return undefined;
  }
  if (header.length === 6) return [6, 23, 18, 12, 28, 13];
  if (header.length === 7) return [6, 17, 16, 13, 15, 22, 11];
  return undefined;
}

function getOasisHeadingPrefix(text: string): string | undefined {
  const headings: Record<string, string> = {
    Introduction: "1",
    Terminology: "1.1",
    "Word Styles": "2",
    "Overall Style": "2.1",
    "Title Page": "2.2",
    Headings: "2.3",
    Paragraphs: "2.4",
    Lists: "2.5",
    Tables: "2.6",
    "Code Examples": "2.7",
    "Character Styles": "2.8",
    References: "3",
    Normative: "3.1"
  };
  return headings[text];
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
  if (rows.length === 0) return rows;
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
    normalized.push(...(sectionRows || [rows[index].map((cell) => normalizeTableCell(cell))]));
  }
  return normalized;
}

function isLegacyFormTable(rows: LegacyWordTableRow[]): boolean {
  return normalizeLegacyFormTableRows(rows).some((row) => row.some((cell) => getTableCellVariant(cell) !== undefined));
}

function getLeadingFormLabels(rows: LegacyWordTableRow[]): string[] | undefined {
  if (rows.length < 3 || rows[0].length !== 3 || rows[1].length !== 3 || !isFormSectionRow(rows[2])) return undefined;
  const labels = [...rows[0], ...rows[1]].map(getTableCellText);
  return labels.length === 6 && labels.every(isShortChineseFormLabel) ? labels : undefined;
}

function splitFormSectionRow(row: LegacyWordTableRow): LegacyWordTableRow[] | undefined {
  const cells = row.map(normalizeTableCell).filter((cell) => cell.text.length > 0);
  const sectionIndex = cells.findIndex((cell) => isChineseSectionTitle(cell.text));
  const gradeIndex = cells.findIndex((cell, index) => index > sectionIndex && isGradeCell(cell.text));
  if (sectionIndex < 0 || gradeIndex < 0) return undefined;

  const output: LegacyWordTableRow[] = [];
  const leadingText = cells.slice(0, sectionIndex).map((cell) => cell.text).join(" ").trim();
  if (leadingText) output.push([createFormCell(leadingText, "body", 4)]);
  output.push([createFormCell(cells[sectionIndex].text, "section", 2), createFormCell(cells[gradeIndex].text, "section", 2)]);
  const trailingText = cells.slice(gradeIndex + 1).map((cell) => cell.text).join(" ").trim();
  if (trailingText) output.push([createFormCell(trailingText, "caption", 4)]);
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

type WordSegment =
  | { kind: "pageBreak" }
  | { kind: "paragraph"; text: string }
  | { kind: "row"; cells: string[] };

// Word 97 文本流中单元格以单个 0x07 结束，行再以一个额外的 0x07 结束；
// 连续 n 个 0x07 表示：当前单元格结束 + (n-2) 个空单元格 + 行结束。
function segmentWordText(text: string): WordSegment[] {
  const normalized = text.replace(/\u0000/g, "").replace(/\u000b/g, "\n");
  const segments: WordSegment[] = [];
  let cells: string[] | null = null;
  let buffer = "";

  const flushParagraphs = () => {
    for (const piece of buffer.split(/\n{2,}/)) {
      const cleaned = cleanWordText(piece);
      if (cleaned.length > 0 && isDisplayableParagraph(cleaned)) {
        segments.push({ kind: "paragraph", text: cleaned });
      }
    }
    buffer = "";
  };
  const pushCell = () => {
    cells = cells || [];
    cells.push(cleanWordCellText(buffer));
    buffer = "";
  };
  const endRow = () => {
    const rowCells = cells || [];
    cells = null;
    if (rowCells.some((cell) => cell.length > 0)) {
      segments.push({ kind: "row", cells: rowCells });
    }
  };

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "\u0007") {
      let run = 1;
      while (normalized[index + run] === "\u0007") {
        run += 1;
      }
      pushCell();
      for (let extra = 0; extra < run - 2; extra += 1) {
        pushCell();
      }
      if (run >= 2) {
        endRow();
      }
      index += run - 1;
      continue;
    }
    if (char === "\r") {
      cells === null ? flushParagraphs() : (buffer += "\n");
      continue;
    }
    if (char === "\u000c") {
      if (cells === null) {
        flushParagraphs();
        segments.push({ kind: "pageBreak" });
      } else {
        buffer += "\n";
      }
      continue;
    }
    buffer += char;
  }
  cells === null ? flushParagraphs() : endRow();
  return segments.slice(0, 1000);
}

function cleanWordCellText(value: string): string {
  return value
    .split("\n")
    .map((line) => cleanWordText(line))
    .filter((line) => line.length > 0)
    .join("\n");
}

function segmentsToParagraphs(segments: WordSegment[]): string[] {
  return segments
    .map(segmentDisplayText)
    .filter((text) => text.length > 0)
    .slice(0, 1000);
}

function segmentDisplayText(segment: WordSegment): string {
  if (segment.kind === "pageBreak") {
    return WORD_PAGE_BREAK;
  }
  return segment.kind === "row" ? segment.cells.filter((cell) => cell.length > 0).join("\t") : segment.text;
}

function removeTrailingFooterSegments(segments: WordSegment[]): WordSegment[] {
  const paragraphs = segments.map(segmentDisplayText);
  const tailStart = Math.max(0, paragraphs.length - 32);
  const tail = paragraphs.slice(tailStart);
  const relativePageFieldIndex = tail.findIndex(isFooterPageField);
  if (relativePageFieldIndex < 0) {
    return segments;
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
    return segments;
  }
  return segments.slice(0, start);
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

function buildWordBlocks(segments: WordSegment[]): LegacyWordBlock[] {
  const blocks: LegacyWordBlock[] = [];
  let index = 0;
  while (index < segments.length) {
    const segment = segments[index];
    if (segment.kind === "pageBreak") {
      blocks.push({ type: "pageBreak" });
      index += 1;
      continue;
    }

    if (segment.kind === "row") {
      const rows: string[][] = [];
      while (index < segments.length) {
        const rowSegment = segments[index];
        if (rowSegment.kind !== "row") {
          break;
        }
        rows.push(rowSegment.cells);
        index += 1;
      }
      blocks.push({ type: "table", rows: applyTableColumnSpans(rows) });
      continue;
    }

    const paragraph = segment.text;
    const toc = parseTocEntry(paragraph);
    if (toc) {
      blocks.push(toc);
      index += 1;
      continue;
    }

    if (isTableRowCandidate(paragraph)) {
      const rows: string[][] = [];
      while (index < segments.length) {
        const tabSegment = segments[index];
        if (tabSegment.kind !== "paragraph" || !isTableRowCandidate(tabSegment.text)) {
          break;
        }
        rows.push(...normalizeTableRows(splitTableRow(tabSegment.text)));
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

// 短行的最后一个单元格按表格最大列数补跨度，近似还原合并单元格布局。
function applyTableColumnSpans(rows: string[][]): LegacyWordTableRow[] {
  const columnCount = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => {
    if (row.length >= columnCount || row.length === 0) {
      return row;
    }
    const cells: LegacyWordTableCell[] = row.slice(0, -1);
    cells.push({ text: row[row.length - 1], colSpan: columnCount - row.length + 1 });
    return cells;
  });
}

function inferLayoutHints(paragraphs: string[], assets: LegacyWordAsset[]): LegacyWordLayoutHints {
  const sample = paragraphs.slice(0, 40).join("\n");
  const isOasisSpec = /Word Specification Sample/.test(sample) && /\bOASIS\b/i.test(paragraphs.join("\n"));
  const oasisImage = isOasisSpec
    ? assets.find((asset) => asset.mimeType === "image/png" && asset.width && asset.height && asset.width / asset.height > 2.5)
    : undefined;
  return {
    lineNumbers: isOasisSpec,
    documentKind: isCjkNoticeDocument(paragraphs) ? "cjkNotice" : undefined,
    headerBrand: isOasisSpec ? "oasis" : undefined,
    headerImageId: oasisImage?.id,
    footer: isOasisSpec ? inferOasisFooter(paragraphs) : undefined
  };
}

function isCjkNoticeDocument(paragraphs: string[]): boolean {
  const visible = paragraphs.filter((paragraph) => paragraph !== WORD_PAGE_BREAK);
  return (
    visible.length >= 8 &&
    isCjkNoticeTitle(`${visible[0] || ""}${visible[1] || ""}`) &&
    visible.some((paragraph) => /^[一二三四五六七八九十]+[、.．]/.test(paragraph)) &&
    visible.some((paragraph) => /^附件[：:]?\s*\d*/.test(paragraph))
  );
}

function isCjkNoticeTitle(text: string): boolean {
  const value = text.replace(/\s+/g, "");
  return value.length >= 4 && value.length <= 80 && /\p{Script=Han}/u.test(value) && /(?:通知|通告|公告|函|意见|决定|方案)$/.test(value);
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
  if (layout.headerBrand === "oasis") {
    return paginateOasisBlocks(blocks);
  }
  if (layout.documentKind === "cjkNotice") {
    return paginateCjkNoticeBlocks(blocks);
  }
  const pages: LegacyWordBlock[][] = [];
  let current: LegacyWordBlock[] = [];
  let usedLines = 0;

  for (const block of blocks) {
    if (block.type === "pageBreak") {
      pages.push(current);
      current = [];
      usedLines = 0;
      continue;
    }
    const maxLines = layout.lineNumbers ? 33 : 46;
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

function paginateOasisBlocks(blocks: LegacyWordBlock[]): LegacyWordBlock[][] {
  const pages: LegacyWordBlock[][] = [];
  let current: LegacyWordBlock[] = [];
  const flush = () => {
    if (current.length > 0) pages.push(current);
    current = [];
  };

  for (const block of blocks) {
    if (block.type === "pageBreak") {
      flush();
      continue;
    }
    const startsStyledPage = block.type === "heading" && block.level === 1;
    const startsCodeExamplesPage = block.type === "paragraph" && /^For bibliography lists,/i.test(block.text);
    if (current.length > 0 && (startsStyledPage || startsCodeExamplesPage)) flush();
    current.push(block);
  }
  flush();
  return pages.length > 0 ? pages : [[]];
}

function paginateCjkNoticeBlocks(blocks: LegacyWordBlock[]): LegacyWordBlock[][] {
  const maxUnits = 32;
  const pages: LegacyWordBlock[][] = [];
  let current: LegacyWordBlock[] = [];
  let usedUnits = 0;
  const flush = (force = false) => {
    if (force || current.length > 0) pages.push(current);
    current = [];
    usedUnits = 0;
  };

  for (const block of blocks) {
    if (block.type === "pageBreak") {
      flush(true);
      continue;
    }

    if (block.type === "table") {
      const columnWidths = getNoticeTableColumnWidths(block.rows);
      if (!columnWidths) {
        const units = Math.max(1, block.rows.length);
        if (current.length > 0 && usedUnits + units > maxUnits) flush();
        current.push(block);
        usedUnits += units;
        continue;
      }

      const rowUnits = block.rows[0]?.length === 7 ? 1.65 : 1.4;
      let offset = 0;
      while (offset < block.rows.length) {
        let availableRows = Math.floor((maxUnits - usedUnits + 0.001) / rowUnits);
        if (availableRows < 1) {
          flush();
          availableRows = Math.max(1, Math.floor(maxUnits / rowUnits));
        }
        const rows = block.rows.slice(offset, offset + availableRows);
        current.push({ type: "table", rows, notice: true, columnWidths });
        usedUnits += rows.length * rowUnits;
        offset += rows.length;
        if (offset < block.rows.length) flush();
      }
      continue;
    }

    const units = estimateCjkNoticeBlockUnits(block);
    if (current.length > 0 && usedUnits + units > maxUnits) flush();
    current.push(block);
    usedUnits += units;
  }
  if (current.length > 0 || pages.length === 0) pages.push(current);
  return pages;
}

function estimateCjkNoticeBlockUnits(block: Exclude<LegacyWordBlock, { type: "table" | "pageBreak" }>): number {
  if (block.type === "title" || block.type === "subtitle") return 3;
  if (block.type === "heading") return 2;
  if (block.type === "toc") return 1;
  const text = block.text.trim();
  if (/^附件\s*\d+$/.test(text)) return 2;
  if (/^附件[：:]\s*\d+[.、．]/.test(text)) return 2;
  if (/^\d+[.、．]/.test(text)) return text.length > 30 ? 3 : 2;
  if (/^.{2,24}(?:清单|目录|名册|汇总表)$/.test(text)) return 3;
  if (/^联系人[：:]/.test(text)) return 3;
  if (/^\d{4}年\d{1,2}月\d{1,2}日?$/.test(text)) return 2;
  if (text.length <= 24 && /(?:人民政府|委员会|办公室|数据局|管理局|厅|局|委|办)$/.test(text)) return 2;
  if (/^[^：:]{2,45}[：:]$/.test(text)) return 2;
  return 1 + Math.max(1, Math.ceil(estimateCjkTextWidth(text) / 28));
}

function estimateCjkTextWidth(text: string): number {
  return [...text].reduce((width, character) => width + (/^[\x00-\xff]$/.test(character) ? 0.55 : 1), 0);
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
  const firstBlock = previousBlocks[0];
  if (visibleIndex === 1 && firstBlock?.type === "title" && isCjkNoticeTitle(`${firstBlock.text}${text}`)) {
    return { type: "subtitle", text };
  }
  if (visibleIndex === 1 && /draft|version|20\d{2}|19\d{2}/i.test(text) && text.length <= 140) {
    return { type: "subtitle", text };
  }
  if (
    visibleIndex === 1 &&
    text.length <= 40 &&
    previousBlocks.some((block) => block.type === "title" && block.text.includes(text))
  ) {
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
  if (/^[一二三四五六七八九十]+\s*[.、．]\s*.{1,40}$/.test(text)) {
    return 2;
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
