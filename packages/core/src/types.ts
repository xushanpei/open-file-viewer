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
export type PreviewToolbarBuiltInAction =
  | "previous"
  | "next"
  | "queue"
  | "zoom-out"
  | "zoom-in"
  | "zoom-reset"
  | "rotate-right"
  | "download"
  | "fullscreen"
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
  zoom?: number;
  zoomLabel?: string;
  previous: () => Promise<void>;
  next: () => Promise<void>;
  command: (command: PreviewCommand) => void | boolean | undefined;
  canCommand: (command: PreviewCommand) => boolean;
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
  fit?: PreviewFit;
  plugins?: PreviewPlugin[];
  fallback?: PreviewFallback;
  renderFallback?: (ctx: PreviewContext) => Promise<PreviewInstance> | PreviewInstance;
  toolbar?: boolean | PreviewToolbarOptions;
  theme?: PreviewTheme;
  className?: string;
  onLoad?: (file: PreviewFile) => void;
  onError?: (error: Error, file?: PreviewFile) => void;
  onUnsupported?: (file: PreviewFile) => void;
}

export interface PreviewContext {
  host: HTMLElement;
  viewport: HTMLElement;
  file: PreviewFile;
  size: PreviewSize;
  options: Required<Pick<PreviewOptions, "fit" | "fallback">> & PreviewOptions;
  toolbar?: PreviewToolbarRenderContext;
  setLoading: (loading: boolean) => void;
  setError: (error: Error | string) => void;
}

export interface PreviewInstance {
  resize?: (size: PreviewSize) => void;
  command?: (command: PreviewCommand) => void | boolean;
  canCommand?: (command: PreviewCommand) => boolean;
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
