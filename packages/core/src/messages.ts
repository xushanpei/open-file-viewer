import type { PreviewLocale, PreviewMessages, PreviewMessagesInput, PreviewOptions } from "./types";

export const defaultMessages: Record<PreviewLocale, PreviewMessages> = {
  "zh-CN": {
    loading: "正在加载预览...",
    unsupportedTitle: "当前文件暂不支持在线预览",
    downloadTitle: "当前文件可下载后查看",
    downloadFile: "下载文件",
    file: "文件",
    unnamedFile: "未命名文件",
    format: "格式",
    unknown: "未知",
    mime: "MIME",
    undeclared: "未声明",
    size: "大小",
    source: "来源",
    remoteUrl: "远程 URL",
    localFile: "本地/内存文件",
    pdf: {
      pageLoading: "页面 {page} 加载中...",
      pageEmpty:
        "该页没有检测到可显示的 PDF 兼容内容。若这是 Illustrator/AI 文件，可能只包含私有编辑数据，建议导出为 PDF/SVG/PNG 后预览。",
      pageError: "无法渲染该页面。该页可能包含浏览器 PDF 引擎暂不支持的图形、字体或压缩特性。",
      summaryPages: "页数",
      summaryPageSize: "页面尺寸",
      summaryFit: "适配",
      summaryFitActual: "原始大小",
      summaryFitWidth: "适合宽度",
      summaryZoom: "缩放",
      fallbackTitle: "PDF 预览失败",
      download: "下载 PDF",
      errorCorrupted: "该 PDF 文件可能已损坏或格式无效。",
      errorUnsupported: "当前浏览器无法加载该 PDF。",
      encryptedTitle: "PDF 已加密，无法在线预览",
      encryptedMessage: "请下载后使用密码打开，或上传解密后的 PDF 文件。",
      encryptedAction: "下载 PDF"
    },
    image: {
      fallbackTitle: "图片预览失败",
      fallbackMessage: "当前浏览器无法直接显示该图片，文件可能已损坏或编码暂不受支持。",
      download: "下载图片",
      labelFormat: "格式",
      labelDimensions: "尺寸",
      labelBitDepth: "位深",
      labelColor: "颜色",
      labelFrames: "帧",
      labelImages: "图像",
      labelNote: "说明",
      noteUnreadableHeader: "无法读取本地头信息",
      noteUnrecognizedHeader: "暂未识别图片头结构",
      noteJpegMissingSof: "未在头部扫描到 SOF 尺寸段",
      noteWebpUnknownChunk: "未知 {chunk} 头",
      noteBmpHeaderTooShort: "DIB header 太短",
      noteTiffIfdOutOfRange: "IFD 偏移超出文件范围",
      tiffEmpty: "无法读取 TIFF 文件内容。",
      tiffNoImageDirectory: "TIFF 文件没有可解码的图像目录。",
      tiffIncompletePixels: "TIFF 图像像素数据不完整。",
      tiffCanvasUnsupported: "当前环境不支持 Canvas 2D，无法展示 TIFF。",
      tiffPagesLabel: "{name}，共 {total} 页",
      tiffPageCaption: "第 {page} / {total} 页 · {width} x {height}px",
      tiffPageLabel: "{name} 第 {page} 页"
    },
    text: {
      fallbackTitle: "文本预览失败",
      fallbackMessage: "无法读取该文本内容，可能是远程文件不可访问或响应状态异常。",
      openOriginal: "打开原文件",
      plainText: "纯文本",
      lines: "{count} 行",
      actionWrap: "换行",
      actionCopy: "复制",
      actionDownload: "下载",
      statusCopied: "已复制",
      statusCopyFailed: "复制失败",
      statusDownloadReady: "已开始下载",
      truncatedNotice: "文件较大，当前展示前 {size}，复制和下载仍会使用完整内容。",
      highlightSkippedNotice: "内容较大，已跳过语法高亮以保持滚动流畅。",
      labelStructure: "结构",
      labelEntries: "条目",
      labelKeys: "键",
      labelPreview: "预览",
      labelTypes: "类型",
      labelParsed: "可解析",
      labelNotebook: "Notebook",
      labelKernel: "Kernel",
      labelNdjson: "NDJSON",
      noKeys: "无键",
      unknown: "未知",
      notebookCells: "{count} 个单元格",
      ndjsonLines: "{count} 行"
    }
  },
  "en-US": {
    loading: "Loading preview...",
    unsupportedTitle: "Preview is not available for this file",
    downloadTitle: "This file can be downloaded and opened locally",
    downloadFile: "Download file",
    file: "File",
    unnamedFile: "Untitled file",
    format: "Format",
    unknown: "Unknown",
    mime: "MIME",
    undeclared: "Not declared",
    size: "Size",
    source: "Source",
    remoteUrl: "Remote URL",
    localFile: "Local or in-memory file",
    pdf: {
      pageLoading: "Loading page {page}...",
      pageEmpty:
        "No PDF-compatible content was found on this page. If this is an Illustrator/AI file it may only contain private editing data — export it to PDF/SVG/PNG before previewing.",
      pageError:
        "This page could not be rendered. It may use graphics, fonts, or compression features that the browser PDF engine does not support yet.",
      summaryPages: "Pages",
      summaryPageSize: "Page size",
      summaryFit: "Fit",
      summaryFitActual: "Actual size",
      summaryFitWidth: "Fit width",
      summaryZoom: "Zoom",
      fallbackTitle: "PDF preview failed",
      download: "Download PDF",
      errorCorrupted: "This PDF file may be corrupted or invalid.",
      errorUnsupported: "This PDF cannot be loaded in the current browser.",
      encryptedTitle: "This PDF is encrypted and cannot be previewed",
      encryptedMessage: "Download it and open it with the password, or upload a decrypted PDF file.",
      encryptedAction: "Download PDF"
    },
    image: {
      fallbackTitle: "Image preview failed",
      fallbackMessage:
        "The browser cannot display this image directly. The file may be corrupted or use an unsupported encoding.",
      download: "Download image",
      labelFormat: "Format",
      labelDimensions: "Dimensions",
      labelBitDepth: "Bit depth",
      labelColor: "Color",
      labelFrames: "Frames",
      labelImages: "Images",
      labelNote: "Note",
      noteUnreadableHeader: "Local header information is unavailable",
      noteUnrecognizedHeader: "Image header structure was not recognized",
      noteJpegMissingSof: "No SOF size segment was found in the header",
      noteWebpUnknownChunk: "Unknown {chunk} header",
      noteBmpHeaderTooShort: "DIB header is too short",
      noteTiffIfdOutOfRange: "IFD offset is out of file range",
      tiffEmpty: "The TIFF file content could not be read.",
      tiffNoImageDirectory: "The TIFF file has no decodable image directory.",
      tiffIncompletePixels: "The TIFF image pixel data is incomplete.",
      tiffCanvasUnsupported: "Canvas 2D is not supported in this environment, so the TIFF cannot be displayed.",
      tiffPagesLabel: "{name}, {total} pages",
      tiffPageCaption: "Page {page} / {total} · {width} x {height}px",
      tiffPageLabel: "{name} page {page}"
    },
    text: {
      fallbackTitle: "Text preview failed",
      fallbackMessage:
        "This text content could not be read. The remote file may be unreachable or the response status may be invalid.",
      openOriginal: "Open original file",
      plainText: "plain text",
      lines: "{count} lines",
      actionWrap: "Wrap",
      actionCopy: "Copy",
      actionDownload: "Download",
      statusCopied: "Copied",
      statusCopyFailed: "Copy failed",
      statusDownloadReady: "Download ready",
      truncatedNotice: "This file is large. Showing the first {size} — copy and download still use the full content.",
      highlightSkippedNotice: "Content is large, so syntax highlighting was skipped to keep scrolling smooth.",
      labelStructure: "Structure",
      labelEntries: "Entries",
      labelKeys: "Keys",
      labelPreview: "Preview",
      labelTypes: "Types",
      labelParsed: "Parsed",
      labelNotebook: "Notebook",
      labelKernel: "Kernel",
      labelNdjson: "NDJSON",
      noKeys: "No keys",
      unknown: "Unknown",
      notebookCells: "{count} cells",
      ndjsonLines: "{count} lines"
    }
  }
};

export function resolveMessages(options: Pick<PreviewOptions, "locale" | "messages">): PreviewMessages {
  const defaults = defaultMessages[options.locale || "en-US"];
  const overrides: PreviewMessagesInput = options.messages || {};
  return {
    ...defaults,
    ...overrides,
    pdf: { ...defaults.pdf, ...overrides.pdf },
    image: { ...defaults.image, ...overrides.image },
    text: { ...defaults.text, ...overrides.text }
  };
}

/**
 * Fills `{placeholder}` slots in a message template.
 *
 * Messages stay plain serializable strings (rather than functions) so that they
 * can be shipped in JSON locale files like any other i18n resource.
 */
export function formatMessage(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );
}
