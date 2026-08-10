export type PreviewSource = File | Blob | string | ArrayBuffer;

export type PreviewFit =
  | "contain"
  | "cover"
  | "width"
  | "height"
  | "actual"
  | "scale-down";

export type PreviewFallback = "inline" | "download" | "custom";
export type PreviewTheme = "light" | "dark" | "auto";
export type PreviewLocale = "zh-CN" | "en-US";
export type PreviewToolbarBuiltInAction =
  | "previous"
  | "next"
  | "queue"
  | "zoom-out"
  | "zoom-in"
  | "zoom-reset"
  | "rotate-left"
  | "rotate-right"
  | "download"
  | "fullscreen"
  | "exit-fullscreen"
  | "print"
  | "search";
export type PreviewToolbarActionId = PreviewToolbarBuiltInAction | (string & {});

export interface PreviewFile {
  source: PreviewSource;
  name: string;
  extension: string;
  mimeType: string;
  size?: number;
  url?: string;
  blob?: Blob;
}

export interface PreviewItem {
  file: PreviewSource;
  fileName?: string;
  mimeType?: string;
}

export interface PreviewSize {
  width: number;
  height: number;
}

export interface PreviewToolbarOptions {
  zoom?: boolean;
  rotate?: boolean;
  download?: boolean;
  fullscreen?: boolean;
  print?: boolean;
  search?: boolean;
  order?: PreviewToolbarActionId[];
  labels?: Partial<Record<PreviewToolbarBuiltInAction, string>>;
  titles?: Partial<Record<PreviewToolbarBuiltInAction, string>>;
  icons?: Partial<Record<PreviewToolbarBuiltInAction, string | HTMLElement | SVGElement>>;
  actions?: PreviewToolbarCustomAction[];
  render?: (ctx: PreviewToolbarRenderContext) => HTMLElement | void;
}

export interface PreviewToolbarCustomAction {
  id: string;
  label: string;
  title?: string;
  icon?: string | HTMLElement | SVGElement;
  order?: number;
  disabled?: boolean | ((ctx: PreviewToolbarRenderContext) => boolean);
  hidden?: boolean | ((ctx: PreviewToolbarRenderContext) => boolean);
  className?: string;
  onClick: (ctx: PreviewToolbarRenderContext) => void | Promise<void>;
}

export interface PreviewToolbarRenderContext {
  file?: PreviewFile;
  index: number;
  length: number;
  viewport: HTMLElement;
  canPrevious: boolean;
  canNext: boolean;
  isFullscreen: boolean;
  zoom?: number;
  zoomLabel?: string;
  previous: () => Promise<void>;
  next: () => Promise<void>;
  command: (command: PreviewCommand) => void | boolean | undefined;
  canCommand: (command: PreviewCommand) => boolean;
  refreshCommandSupport: () => void;
  setZoom: (zoom?: number) => void;
  download: () => void;
  fullscreen: () => void;
  print: () => void;
  search: (query: string) => number;
  clearSearch: () => void;
}

export interface PreviewOptions {
  container: HTMLElement | string;
  file?: PreviewSource;
  files?: Array<PreviewSource | PreviewItem>;
  initialIndex?: number;
  fileName?: string;
  mimeType?: string;
  width?: number | string;
  height?: number | string;
  zoom?: number;
  fit?: PreviewFit;
  plugins?: PreviewPlugin[];
  fallback?: PreviewFallback;
  locale?: PreviewLocale;
  messages?: Partial<PreviewMessages>;
  renderFallback?: (ctx: PreviewContext) => Promise<PreviewInstance> | PreviewInstance;
  toolbar?: boolean | PreviewToolbarOptions;
  theme?: PreviewTheme;
  className?: string;
  onLoad?: (file: PreviewFile) => void;
  onError?: (error: Error, file?: PreviewFile) => void;
  onUnsupported?: (file: PreviewFile) => void;
}

export interface PreviewMessages {
  [key: string]: string | undefined;
  loading: string;
  unsupportedTitle: string;
  downloadTitle: string;
  downloadFile: string;
  file: string;
  unnamedFile: string;
  format: string;
  unknown: string;
  mime: string;
  undeclared: string;
  size: string;
  source: string;
  remoteUrl: string;
  localFile: string;
  textPlainLanguage: string;
  textLineCount: string;
  textWrap: string;
  textCopy: string;
  textCopied: string;
  textCopyFailed: string;
  textDownload: string;
  textDownloadReady: string;
  textLargeFileNotice: string;
  textHighlightSkipped: string;
  textPreviewFailedTitle: string;
  textPreviewFailedMessage: string;
  textOpenOriginal: string;
  lrcPreviewMode: string;
  lrcDisplayMode: string;
  lrcAnnotatedMode: string;
  lrcSourceMode: string;
  lrcWordTimestamp: string;
  lrcMale: string;
  lrcFemale: string;
  lrcDuet: string;
  lrcAuthor: string;
  lrcLyricist: string;
  lrcLrcBy: string;
  lrcAlbum: string;
  lrcLength: string;
  lrcOffset: string;
  lrcTool: string;
  lrcVersion: string;
  lrcTrackInformation: string;
  lrcEmpty: string;
  officeLegacyConversionTitle: string;
  officeLegacyBinaryNotice: string;
  officeLegacyMetaFormatType: string;
  officeLegacyMetaFileStructure: string;
  officeLegacyOleDetected: string;
  officeLegacyOleMissing: string;
  officeLegacyMetaTextFragments: string;
  officeLegacyTextFragmentCount: string;
  officeLegacyMetaParseStatus: string;
  officeLegacyReadableFragments: string;
  officeLegacyNoText: string;
  officeLegacyWordParseFailed: string;
  officeSheetParseFailed: string;
  officeUnsupportedTitle: string;
  officeUnsupportedLegacyMessage: string;
  officeUnsupportedGenericMessage: string;
  officeUnsupportedIntro: string;
  officeUnsupportedSupportedFormats: string;
  officeErrorWithMessage: string;
  officeErrorWithoutMessage: string;
  officeConvertedTitle: string;
  officeConvertedPdfFailed: string;
  pdfEncryptedTitle: string;
  pdfEncryptedMessage: string;
  pdfPreviewFailedTitle: string;
  pdfCorruptedMessage: string;
  pdfCannotLoadMessage: string;
  pdfDownload: string;
  pdfPageLoading: string;
  pdfPageEmpty: string;
  pdfPageRenderFailed: string;
  pdfPreviousPage: string;
  pdfNextPage: string;
  pdfPageInput: string;
  pdfPagePosition: string;
  pdfPageLabel: string;
  pdfSummaryPages: string;
  pdfSummaryPageSizes: string;
  pdfSummaryFit: string;
  pdfSummaryActualSize: string;
  pdfSummaryFitWidth: string;
  pdfSummaryZoom: string;
  imagePreviewFailedTitle: string;
  imagePreviewFailedMessage: string;
  imageDownload: string;
  imageZoomOut: string;
  imageZoomIn: string;
  imageRotate: string;
  imageReset: string;
}

export interface PreviewContext {
  host: HTMLElement;
  viewport: HTMLElement;
  file: PreviewFile;
  size: PreviewSize;
  options: Omit<PreviewOptions, "messages"> & Required<Pick<PreviewOptions, "fit" | "fallback" | "zoom">> & { messages: PreviewMessages };
  toolbar?: PreviewToolbarRenderContext;
  /** Aborted when this render is superseded or the viewer is destroyed. */
  signal?: AbortSignal;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | string) => void;
}

export interface PreviewInstance {
  resize?: (size: PreviewSize) => void;
  command?: (command: PreviewCommand) => void | boolean;
  canCommand?: (command: PreviewCommand) => boolean;
  /** Resolve once any lazily rendered content is ready to be captured for printing. */
  preparePrint?: () => void | Promise<void>;
  destroy: () => void;
}

export type PreviewCommand = "zoom-in" | "zoom-out" | "zoom-reset" | "rotate-right" | "rotate-left";

export interface PreviewPlugin {
  name: string;
  match: (file: PreviewFile) => boolean | Promise<boolean>;
  render: (ctx: PreviewContext) => Promise<PreviewInstance> | PreviewInstance;
}

export interface FileViewer {
  reload: (file?: PreviewSource) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  goTo: (index: number) => Promise<void>;
  getCurrentIndex: () => number;
  resize: () => void;
  destroy: () => void;
}
