import { normalizeFile } from "./detect";
import { applyBoxSize, createObjectUrl, getElementSize, resolveContainer, revokeObjectUrl } from "./dom";
import { resolveMessages } from "./messages";
import { fallbackPlugin } from "./plugins/fallback";
import type {
  FileViewer,
  PreviewFile,
  PreviewCommand,
  PreviewInstance,
  PreviewItem,
  PreviewOptions,
  PreviewPlugin,
  PreviewSource,
  PreviewToolbarActionId,
  PreviewToolbarBuiltInAction,
  PreviewToolbarCustomAction,
  PreviewToolbarOptions
} from "./types";

export function createViewer(options: PreviewOptions): FileViewer {
  const container = resolveContainer(options.container);
  applyBoxSize(container, options.width, options.height);

  container.classList.add("ofv-root");
  if (options.className) {
    container.classList.add(options.className);
  }
  const theme = applyTheme(container, options.theme || "light");

  const host = document.createElement("div");
  host.className = "ofv-host";

  const status = document.createElement("div");
  status.className = "ofv-status";
  status.hidden = true;

  const viewport = document.createElement("div");
  viewport.className = "ofv-viewport";

  const queue = normalizeQueue(options);
  let currentIndex = clampIndex(options.initialIndex || 0, queue.length);
  let currentInstance: PreviewInstance | undefined;

  const goTo = async (index: number) => {
    if (destroyed || queue.length === 0) {
      return;
    }
    currentIndex = clampIndex(index, queue.length);
    await renderQueueItem(currentIndex);
  };

  const toolbar = createToolbar(options.toolbar, viewport, {
    getLength: () => queue.length,
    next: () => goTo(currentIndex + 1),
    previous: () => goTo(currentIndex - 1),
    command: (command) => currentInstance?.command?.(command)
  });
  if (toolbar) {
    host.append(toolbar.element);
  }

  host.append(status, viewport);
  container.replaceChildren(host);

  const normalizedOptions = {
    ...options,
    fit: options.fit || "contain",
    fallback: options.fallback || "inline",
    zoom: normalizeInitialZoom(options.zoom),
    messages: resolveMessages(options)
  };

  let destroyed = false;
  let renderToken = 0;

  const setLoading = (loading: boolean) => {
    status.hidden = !loading;
    status.textContent = loading ? normalizedOptions.messages.loading : "";
  };

  const setError = (error: Error | string) => {
    status.hidden = false;
    status.textContent = typeof error === "string" ? error : error.message;
  };

  const resize = () => {
    if (destroyed) {
      return;
    }
    const size = getElementSize(viewport);
    currentInstance?.resize?.(size);
  };

  const resizeObserver = observeResize(container, resize);

  const renderFile = async (file: PreviewFile, token = ++renderToken) => {
    if (destroyed || token !== renderToken) {
      return;
    }
    destroyPreviewInstance(currentInstance);
    currentInstance = undefined;
    viewport.replaceChildren();
    setLoading(true);
    toolbar?.update(file, currentIndex, queue.length);

    const plugins = [...(options.plugins || []), fallbackPlugin()];
    const plugin = await findPlugin(plugins, file);
    if (destroyed || token !== renderToken) {
      return;
    }

    try {
      const nextInstance = await plugin.render({
        host,
        viewport,
        file,
        size: getElementSize(viewport),
        options: normalizedOptions,
        toolbar: toolbar?.getContext(),
        setLoading,
        setError
      });
      if (destroyed || token !== renderToken) {
        destroyPreviewInstance(nextInstance);
        return;
      }
      currentInstance = nextInstance;
      setLoading(false);
      toolbar?.setCommandSupport((command) =>
        Boolean(nextInstance.command) && (nextInstance.canCommand ? nextInstance.canCommand(command) : true)
      );
      options.onLoad?.(file);
      resize();
    } catch (error) {
      if (destroyed || token !== renderToken) {
        return;
      }
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      viewport.replaceChildren();
      setLoading(false);
      setError(normalizedError);
      options.onError?.(normalizedError, file);
    }
  };

  async function renderQueueItem(index: number) {
    const token = ++renderToken;
    const item = queue[index];
    const file = await normalizeFile(item.file, item.fileName, item.mimeType);
    if (destroyed || token !== renderToken) {
      return;
    }
    await renderFile(file, token);
  }

  void goTo(currentIndex);

  return {
    async reload(file) {
      if (destroyed) {
        return;
      }
      if (file !== undefined) {
        const currentItem = queue[currentIndex];
        queue.splice(currentIndex, 1, createReloadItem(file, currentItem, options));
      }
      await renderQueueItem(currentIndex);
    },
    async next() {
      await goTo(currentIndex + 1);
    },
    async previous() {
      await goTo(currentIndex - 1);
    },
    goTo,
    getCurrentIndex() {
      return currentIndex;
    },
    resize,
    destroy() {
      destroyed = true;
      renderToken += 1;
      resizeObserver.destroy();
      destroyPreviewInstance(currentInstance);
      toolbar?.destroy();
      theme.destroy();
      container.replaceChildren();
      container.classList.remove("ofv-root");
      if (options.className) {
        container.classList.remove(options.className);
      }
    }
  };
}

function destroyPreviewInstance(instance: PreviewInstance | undefined): void {
  if (!instance) {
    return;
  }
  try {
    instance.destroy();
  } catch (error) {
    console.error("Failed to destroy file preview instance:", error);
  }
}

function normalizeQueue(options: PreviewOptions): PreviewItem[] {
  if (options.files && options.files.length > 0) {
    return options.files.map((item) =>
      isPreviewItem(item)
        ? item
        : {
            file: item
          }
    );
  }
  if (options.file === undefined) {
    throw new Error("File viewer requires either file or files.");
  }
  return [
    {
      file: options.file,
      fileName: options.fileName,
      mimeType: options.mimeType
    }
  ];
}

function isPreviewItem(item: PreviewSource | PreviewItem): item is PreviewItem {
  return typeof item === "object" && item !== null && "file" in item;
}

function createReloadItem(
  file: PreviewSource,
  currentItem: PreviewItem | undefined,
  options: PreviewOptions
): PreviewItem {
  if (typeof File !== "undefined" && file instanceof File) {
    return { file };
  }
  return {
    file,
    fileName: currentItem?.fileName || options.fileName,
    mimeType: currentItem?.mimeType || options.mimeType
  };
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), length - 1);
}

function normalizeInitialZoom(zoom: PreviewOptions["zoom"]): number {
  return typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function applyTheme(
  container: HTMLElement,
  theme: NonNullable<PreviewOptions["theme"]>
): { destroy: () => void } {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const classes = ["ofv-theme-light", "ofv-theme-dark"];

  const setThemeClass = () => {
    container.classList.remove(...classes);
    const resolvedTheme = theme === "auto" && media?.matches ? "dark" : theme === "auto" ? "light" : theme;
    container.classList.add(`ofv-theme-${resolvedTheme}`);
  };

  setThemeClass();
  if (theme === "auto") {
    addMediaListener(media, setThemeClass);
  }

  return {
    destroy() {
      if (theme === "auto") {
        removeMediaListener(media, setThemeClass);
      }
      container.classList.remove(...classes);
    }
  };
}

function observeResize(element: HTMLElement, callback: () => void): { destroy: () => void } {
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(callback);
    observer.observe(element);
    return {
      destroy() {
        observer.disconnect();
      }
    };
  }

  window.addEventListener("resize", callback);
  return {
    destroy() {
      window.removeEventListener("resize", callback);
    }
  };
}

type CompatibleMediaQueryList = MediaQueryList & {
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};

function addMediaListener(media: CompatibleMediaQueryList | undefined, listener: () => void): void {
  if (!media) {
    return;
  }
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return;
  }
  media.addListener?.(listener);
}

function removeMediaListener(media: CompatibleMediaQueryList | undefined, listener: () => void): void {
  if (!media) {
    return;
  }
  if (typeof media.removeEventListener === "function") {
    media.removeEventListener("change", listener);
    return;
  }
  media.removeListener?.(listener);
}

function createToolbar(
  toolbar: PreviewOptions["toolbar"],
  viewport: HTMLElement,
  queue: {
    getLength: () => number;
    next: () => void | Promise<void>;
    previous: () => void | Promise<void>;
    command: (command: PreviewCommand) => void | boolean | undefined;
  }
):
  | {
      element: HTMLElement;
      update: (file: PreviewFile, index: number, length: number) => void;
      setCommandSupport: (isSupported: (command: PreviewCommand) => boolean) => void;
      getContext: () => ReturnType<typeof createToolbarContext>;
      setZoom: (zoom?: number) => void;
      destroy: () => void;
    }
  | undefined {
  if (!toolbar) {
    return undefined;
  }

  const options: PreviewToolbarOptions =
    typeof toolbar === "boolean"
      ? { zoom: true, rotate: true, download: true, fullscreen: true, print: true, search: true }
      : toolbar;

  const element = document.createElement("div");
  element.className = "ofv-toolbar";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", "File preview toolbar");

  let file: PreviewFile | undefined;
  let currentIndex = 0;
  let currentLength = queue.getLength();
  let queueLabel: HTMLSpanElement | undefined;
  let previousButton: HTMLButtonElement | undefined;
  let nextButton: HTMLButtonElement | undefined;
  let zoomResetButton: HTMLButtonElement | undefined;
  let currentZoom: number | undefined;
  const commandButtons: Array<{ button: HTMLButtonElement; command: PreviewCommand }> = [];
  const customButtons: Array<{ button: HTMLButtonElement; action: PreviewToolbarCustomAction }> = [];
  const disposers: Array<() => void> = [];
  const search = createSearchController(viewport);
  let searchInput: HTMLInputElement | undefined;
  let searchCount: HTMLSpanElement | undefined;
  let canRunCommand = (_command: PreviewCommand) => false;

  const getContext = () =>
    createToolbarContext({
      file,
      index: currentIndex,
      length: currentLength,
      viewport,
      queue,
      element,
      search,
      canCommand: canRunCommand,
      refreshCommandSupport,
      zoom: currentZoom,
      setZoom
    });

  const addButton = (
    label: string,
    title: string,
    action: () => void,
    className?: string,
    icon?: string | HTMLElement | SVGElement
  ) => {
    const button = document.createElement("button");
    button.type = "button";
    setToolbarButtonContent(button, label, icon);
    button.title = title;
    button.setAttribute("aria-label", title);
    if (className) {
      button.className = className;
    }
    button.addEventListener("click", action);
    element.append(button);
    disposers.push(() => button.removeEventListener("click", action));
    return button;
  };

  const addCommandButton = (
    id: PreviewToolbarBuiltInAction,
    label: string,
    title: string,
    command: PreviewCommand
  ) => {
    const button = addButton(label, title, () => {
      queue.command(command);
    }, undefined, options.icons?.[id]);
    button.disabled = true;
    commandButtons.push({ button, command });
  };

  const renderDefaultAction = (id: PreviewToolbarActionId) => {
    if (!isBuiltInToolbarAction(id)) {
      const customAction = options.actions?.find((action) => action.id === id);
      if (customAction) {
        renderCustomAction(customAction);
      }
      return;
    }

    if (id === "previous" && queue.getLength() > 1) {
      previousButton = addButton(
        getToolbarLabel(options, "previous"),
        getToolbarTitle(options, "previous"),
        () => void queue.previous(),
        undefined,
        options.icons?.previous
      );
      return;
    }
    if (id === "next" && queue.getLength() > 1) {
      nextButton = addButton(
        getToolbarLabel(options, "next"),
        getToolbarTitle(options, "next"),
        () => void queue.next(),
        undefined,
        options.icons?.next
      );
      return;
    }
    if (id === "queue" && queue.getLength() > 1) {
      queueLabel = document.createElement("span");
      queueLabel.className = "ofv-toolbar-queue";
      element.append(queueLabel);
      return;
    }
    if (id === "zoom-out" && options.zoom) {
      addCommandButton(id, getToolbarLabel(options, id), getToolbarTitle(options, id), "zoom-out");
      return;
    }
    if (id === "zoom-in" && options.zoom) {
      addCommandButton(id, getToolbarLabel(options, id), getToolbarTitle(options, id), "zoom-in");
      return;
    }
    if (id === "zoom-reset" && options.zoom) {
      addCommandButton(id, getToolbarLabel(options, id), getToolbarTitle(options, id), "zoom-reset");
      zoomResetButton = commandButtons[commandButtons.length - 1]?.button;
      updateZoomLabel();
      return;
    }
    if (id === "rotate-right" && options.rotate) {
      addCommandButton(id, getToolbarLabel(options, id), getToolbarTitle(options, id), "rotate-right");
      return;
    }
    if (id === "download" && options.download !== false) {
      addButton(
        getToolbarLabel(options, id),
        getToolbarTitle(options, id),
        () => getContext().download(),
        undefined,
        options.icons?.download
      );
      return;
    }
    if (id === "fullscreen" && options.fullscreen !== false) {
      addButton(
        getToolbarLabel(options, id),
        getToolbarTitle(options, id),
        () => getContext().fullscreen(),
        undefined,
        options.icons?.fullscreen
      );
      return;
    }
    if (id === "print" && options.print) {
      addButton(
        getToolbarLabel(options, id),
        getToolbarTitle(options, id),
        () => getContext().print(),
        undefined,
        options.icons?.print
      );
      return;
    }
    if (id === "search" && options.search !== false) {
      renderSearchControl();
      return;
    }

  };

  const renderCustomAction = (action: PreviewToolbarCustomAction) => {
    const button = addButton(
      action.label,
      action.title || action.label,
      () => void action.onClick(getContext()),
      action.className,
      action.icon
    );
    button.dataset.ofvToolbarAction = action.id;
    customButtons.push({ button, action });
  };

  const renderSearchControl = () => {
    const searchGroup = document.createElement("div");
    searchGroup.className = "ofv-toolbar-search";
    searchGroup.title = getToolbarTitle(options, "search");
    const nextSearchInput = document.createElement("input");
    nextSearchInput.type = "search";
    nextSearchInput.placeholder = getToolbarLabel(options, "search");
    nextSearchInput.setAttribute("aria-label", getToolbarTitle(options, "search"));
    const nextSearchCount = document.createElement("span");
    nextSearchCount.className = "ofv-toolbar-search-count";
    searchInput = nextSearchInput;
    searchCount = nextSearchCount;

    const runSearch = () => {
      const count = search.search(nextSearchInput.value);
      nextSearchCount.textContent = nextSearchInput.value ? String(count) : "";
    };

    nextSearchInput.addEventListener("input", runSearch);
    searchGroup.append(nextSearchInput, nextSearchCount);
    element.append(searchGroup);
    disposers.push(() => nextSearchInput.removeEventListener("input", runSearch));
  };

  const renderToolbar = () => {
    if (options.render) {
      element.replaceChildren();
      const customElement = options.render(getContext());
      if (customElement) {
        element.append(customElement);
      }
      return;
    }
    getToolbarOrder(options, queue.getLength()).forEach(renderDefaultAction);
    getImplicitCustomActions(options).forEach(renderCustomAction);
  };

  renderToolbar();

  const updateCustomButtons = () => {
    const context = getContext();
    for (const { button, action } of customButtons) {
      button.disabled = evaluateToolbarFlag(action.disabled, context);
      button.hidden = evaluateToolbarFlag(action.hidden, context);
    }
  };

  const resetSearch = () => {
    search.clear();
    if (searchInput) {
      searchInput.value = "";
    }
    if (searchCount) {
      searchCount.textContent = "";
    }
  };

  function setZoom(zoom?: number) {
    currentZoom = typeof zoom === "number" && Number.isFinite(zoom) && zoom > 0 ? zoom : undefined;
    updateZoomLabel();
    updateCustomButtons();
    refreshCustomRender();
  }

  function updateZoomLabel() {
    if (!zoomResetButton) {
      return;
    }
    setToolbarButtonContent(
      zoomResetButton,
      currentZoom === undefined ? getToolbarLabel(options, "zoom-reset") : formatToolbarZoom(currentZoom),
      options.icons?.["zoom-reset"]
    );
  }

  function refreshCommandSupport() {
    commandButtons.forEach(({ button, command }) => {
      button.disabled = !canRunCommand(command);
    });
    updateCustomButtons();
    refreshCustomRender();
  }

  const refreshCustomRender = () => {
    if (!options.render) {
      return;
    }
    element.replaceChildren();
    const customElement = options.render(getContext());
    if (customElement) {
      element.append(customElement);
    }
  };

  return {
    element,
    update(nextFile, index, length) {
      file = nextFile;
      currentIndex = index;
      currentLength = length;
      currentZoom = undefined;
      updateZoomLabel();
      resetSearch();
      commandButtons.forEach(({ button }) => {
        button.disabled = true;
      });
      if (queueLabel) {
        queueLabel.textContent = `${index + 1} / ${length}`;
      }
      if (previousButton) {
        previousButton.disabled = index <= 0;
      }
      if (nextButton) {
        nextButton.disabled = index >= length - 1;
      }
      updateCustomButtons();
      refreshCustomRender();
    },
    setCommandSupport(isSupported) {
      canRunCommand = isSupported;
      if (!canRunCommand("zoom-in") && !canRunCommand("zoom-out") && !canRunCommand("zoom-reset")) {
        currentZoom = undefined;
        updateZoomLabel();
      }
      refreshCommandSupport();
    },
    getContext,
    setZoom,
    destroy() {
      search.clear();
      for (const dispose of disposers) {
        dispose();
      }
      element.replaceChildren();
    }
  };
}

function createToolbarContext({
  file,
  index,
  length,
  viewport,
  queue,
  element,
  search,
  canCommand,
  refreshCommandSupport,
  zoom,
  setZoom
}: {
  file?: PreviewFile;
  index: number;
  length: number;
  viewport: HTMLElement;
  queue: {
    next: () => void | Promise<void>;
    previous: () => void | Promise<void>;
    command: (command: PreviewCommand) => void | boolean | undefined;
  };
  element: HTMLElement;
  search: ReturnType<typeof createSearchController>;
  canCommand: (command: PreviewCommand) => boolean;
  refreshCommandSupport: () => void;
  zoom?: number;
  setZoom: (zoom?: number) => void;
}) {
  return {
    file,
    index,
    length,
    viewport,
    canPrevious: index > 0,
    canNext: index < length - 1,
    zoom,
    zoomLabel: zoom === undefined ? undefined : formatToolbarZoom(zoom),
    async previous() {
      await queue.previous();
    },
    async next() {
      await queue.next();
    },
    command: queue.command,
    canCommand,
    refreshCommandSupport,
    setZoom,
    download() {
      if (file) {
        downloadFile(file);
      }
    },
    fullscreen() {
      void element.parentElement?.requestFullscreen?.();
    },
    print() {
      printPreview(viewport);
    },
    search: search.search,
    clearSearch: search.clear
  };
}

const defaultToolbarLabels: Record<PreviewToolbarBuiltInAction, string> = {
  previous: "Prev",
  next: "Next",
  queue: "",
  "zoom-out": "-",
  "zoom-in": "+",
  "zoom-reset": "100%",
  "rotate-right": "Rotate",
  download: "Download",
  fullscreen: "Fullscreen",
  print: "Print",
  search: "Search"
};

const defaultToolbarTitles: Record<PreviewToolbarBuiltInAction, string> = {
  previous: "Previous file",
  next: "Next file",
  queue: "Current file position",
  "zoom-out": "Zoom out",
  "zoom-in": "Zoom in",
  "zoom-reset": "Reset zoom",
  "rotate-right": "Rotate right",
  download: "Download file",
  fullscreen: "Open preview fullscreen",
  print: "Print preview",
  search: "Search preview text"
};

function getToolbarLabel(options: PreviewToolbarOptions, id: PreviewToolbarBuiltInAction): string {
  return options.labels?.[id] ?? defaultToolbarLabels[id];
}

function getToolbarTitle(options: PreviewToolbarOptions, id: PreviewToolbarBuiltInAction): string {
  return options.titles?.[id] ?? options.labels?.[id] ?? defaultToolbarTitles[id];
}

function formatToolbarZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

function getToolbarOrder(options: PreviewToolbarOptions, queueLength: number): PreviewToolbarActionId[] {
  if (options.order) {
    return options.order;
  }

  const actions: PreviewToolbarActionId[] = [];
  if (queueLength > 1) {
    actions.push("previous", "next", "queue");
  }
  if (options.zoom) {
    actions.push("zoom-out", "zoom-in", "zoom-reset");
  }
  if (options.rotate) {
    actions.push("rotate-right");
  }
  if (options.download !== false) {
    actions.push("download");
  }
  if (options.fullscreen !== false) {
    actions.push("fullscreen");
  }
  if (options.print) {
    actions.push("print");
  }
  if (options.search !== false) {
    actions.push("search");
  }
  return actions;
}

function getImplicitCustomActions(options: PreviewToolbarOptions): PreviewToolbarCustomAction[] {
  if (options.order || !options.actions) {
    return [];
  }
  return [...options.actions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function evaluateToolbarFlag(
  value: boolean | ((ctx: ReturnType<typeof createToolbarContext>) => boolean) | undefined,
  context: ReturnType<typeof createToolbarContext>
): boolean {
  return typeof value === "function" ? value(context) : Boolean(value);
}

function setToolbarButtonContent(
  button: HTMLButtonElement,
  label: string,
  icon?: string | HTMLElement | SVGElement
): void {
  button.replaceChildren();
  if (!icon) {
    button.textContent = label;
    return;
  }

  const iconElement = document.createElement("span");
  iconElement.className = "ofv-toolbar-icon";
  iconElement.setAttribute("aria-hidden", "true");
  if (typeof icon === "string") {
    iconElement.append(sanitizeToolbarIcon(icon));
  } else {
    iconElement.append(icon.cloneNode(true));
  }

  const labelElement = document.createElement("span");
  labelElement.className = "ofv-toolbar-label";
  labelElement.textContent = label;
  button.append(iconElement, labelElement);
}

const allowedToolbarIconTags = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "defs",
  "title",
  "desc"
]);

const allowedToolbarIconAttrs = new Set([
  "aria-hidden",
  "class",
  "cx",
  "cy",
  "d",
  "fill",
  "focusable",
  "height",
  "id",
  "points",
  "r",
  "rx",
  "ry",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-width",
  "transform",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2"
]);

function sanitizeToolbarIcon(icon: string): Node {
  const template = document.createElement("template");
  template.innerHTML = icon.trim();
  const fragment = document.createDocumentFragment();
  for (const child of Array.from(template.content.childNodes)) {
    const sanitized = sanitizeToolbarIconNode(child);
    if (sanitized) {
      fragment.append(sanitized);
    }
  }
  return fragment;
}

function sanitizeToolbarIconNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    return text.trim() ? document.createTextNode(text) : null;
  }

  if (!(node instanceof Element)) {
    return null;
  }

  const tagName = node.tagName.toLowerCase();
  if (!allowedToolbarIconTags.has(tagName)) {
    return null;
  }

  const sanitized = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  for (const attr of Array.from(node.attributes)) {
    if (isSafeToolbarIconAttribute(attr.name, attr.value)) {
      sanitized.setAttribute(attr.name, attr.value);
    }
  }

  for (const child of Array.from(node.childNodes)) {
    const sanitizedChild = sanitizeToolbarIconNode(child);
    if (sanitizedChild) {
      sanitized.append(sanitizedChild);
    }
  }

  return sanitized;
}

function isSafeToolbarIconAttribute(name: string, value: string): boolean {
  const attrName = name.toLowerCase();
  if (attrName.startsWith("on") || attrName.includes(":")) {
    return false;
  }
  if (!allowedToolbarIconAttrs.has(name) && !allowedToolbarIconAttrs.has(attrName) && !attrName.startsWith("data-")) {
    return false;
  }
  return !/^\s*(?:javascript|data:text\/html|vbscript):/i.test(value);
}

function isBuiltInToolbarAction(id: PreviewToolbarActionId): id is PreviewToolbarBuiltInAction {
  return id in defaultToolbarLabels;
}

function createSearchController(root: HTMLElement): {
  search: (query: string) => number;
  clear: () => void;
} {
  const markerClass = "ofv-search-match";

  const clear = () => {
    const markers = collectSearchRoots(root).flatMap((searchRoot) => [
      ...searchRoot.querySelectorAll(`mark.${markerClass}`)
    ]);
    for (const marker of markers) {
      marker.replaceWith(document.createTextNode(marker.textContent || ""));
    }
    collectSearchRoots(root).forEach((searchRoot) => searchRoot.normalize());
  };

  const search = (query: string): number => {
    clear();
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return 0;
    }

    const textNodes = collectSearchRoots(root).flatMap((searchRoot) => collectSearchableTextNodes(searchRoot));
    let count = 0;
    let firstMatch: HTMLElement | undefined;

    for (const node of textNodes) {
      const text = node.nodeValue || "";
      const lowerText = text.toLowerCase();
      const lowerQuery = normalizedQuery.toLowerCase();
      let start = 0;
      let index = lowerText.indexOf(lowerQuery, start);
      if (index < 0) {
        continue;
      }

      const fragment = document.createDocumentFragment();
      while (index >= 0) {
        if (index > start) {
          fragment.append(document.createTextNode(text.slice(start, index)));
        }
        const marker = document.createElement("mark");
        marker.className = markerClass;
        marker.textContent = text.slice(index, index + normalizedQuery.length);
        fragment.append(marker);
        firstMatch ||= marker;
        count += 1;
        start = index + normalizedQuery.length;
        index = lowerText.indexOf(lowerQuery, start);
      }
      if (start < text.length) {
        fragment.append(document.createTextNode(text.slice(start)));
      }
      node.replaceWith(fragment);
    }

    firstMatch?.scrollIntoView?.({ block: "center", inline: "nearest" });
    return count;
  };

  return { search, clear };
}

function collectSearchRoots(root: HTMLElement): HTMLElement[] {
  const roots = [root];
  for (const iframe of root.querySelectorAll<HTMLIFrameElement>("iframe")) {
    try {
      const body = iframe.contentDocument?.body;
      if (body) {
        roots.push(body);
      }
    } catch {
      // Cross-origin or sandboxed frames without DOM access are skipped.
    }
  }
  return roots;
}

function collectSearchableTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "BUTTON"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function printPreview(viewport: HTMLElement): void {
  const frame = document.createElement("iframe");
  frame.className = "ofv-print-frame";
  frame.setAttribute("aria-hidden", "true");
  document.body.append(frame);

  const clone = viewport.cloneNode(true) as HTMLElement;
  copyCanvasContent(viewport, clone);
  clone.classList.add("ofv-print-root", "ofv-root"); // Add ofv-root class so CSS variables can resolve

  // Handle PPTX printing layout adaptation
  const pptxViewer = clone.querySelector(".ofv-pptx-viewer") || (clone.classList.contains("ofv-pptx-viewer") ? clone : null);
  let intrinsicWidth = 960;
  let intrinsicHeight = 540;
  let hasSlides = false;

  if (pptxViewer) {
    const slides = pptxViewer.querySelectorAll("[data-slide-index]");
    if (slides.length > 0) {
      hasSlides = true;
      const firstWrapper = slides[0].firstElementChild as HTMLElement | null;
      const firstSlide = firstWrapper?.firstElementChild as HTMLElement | null;
      if (firstSlide) {
        intrinsicWidth = parseInt(firstSlide.style.width) || 960;
        intrinsicHeight = parseInt(firstSlide.style.height) || 540;
      }

      slides.forEach((slideEl) => {
        const item = slideEl as HTMLElement;
        item.style.width = "100%";
        item.style.margin = "0 0 20px 0";

        const wrapper = item.firstElementChild as HTMLElement | null;
        if (wrapper) {
          wrapper.style.width = `${intrinsicWidth}px`;
          wrapper.style.height = `${intrinsicHeight}px`;
          wrapper.style.boxShadow = "none";
          wrapper.style.margin = "0 auto";

          const slideContent = wrapper.firstElementChild as HTMLElement | null;
          if (slideContent) {
            slideContent.style.transform = "none";
            slideContent.style.width = `${intrinsicWidth}px`;
            slideContent.style.height = `${intrinsicHeight}px`;
          }
        }
      });
    }
  }

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  // 1. Write the basic HTML skeleton
  doc.open();
  doc.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Print preview</title>
      </head>
      <body></body>
    </html>`);
  doc.close();

  // 2. Copy all stylesheets from parent document to print iframe
  Array.from(document.querySelectorAll("style, link[rel='stylesheet']")).forEach((el) => {
    doc.head.appendChild(el.cloneNode(true));
  });

  // 3. Inject our base print style override element AFTER parent stylesheets
  const baseStyle = doc.createElement("style");
  baseStyle.textContent = `
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111827;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body { padding: 16px; }
    img, video, canvas, svg { max-width: 100%; }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .ofv-viewport, .ofv-print-root {
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
      background: #fff !important;
      color: #111827 !important;
      border: none !important;
      box-shadow: none !important;
    }
    .ofv-pdf {
      padding: 0;
      overflow: visible;
      background: #fff;
    }
    .ofv-pdf-page {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0 auto 16px;
      box-shadow: none;
    }
    .ofv-panel,
    .ofv-text,
    .ofv-text-block,
    .ofv-file-list {
      max-height: none;
      min-height: 0;
      overflow: visible;
    }
    .ofv-section {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  `;
  doc.head.appendChild(baseStyle);

  // 4. Inject PPTX-specific style overrides if slides are present
  if (hasSlides) {
    const pptxStyle = doc.createElement("style");
    pptxStyle.textContent = `
      @media print {
        @page {
          size: ${intrinsicWidth > intrinsicHeight ? "landscape" : "portrait"};
          margin: 0;
        }
        html, body {
          background: #fff;
        }
        body {
          width: ${intrinsicWidth}px !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .ofv-print-root {
          width: ${intrinsicWidth}px !important;
          padding: 0 !important;
        }
        .ofv-pptx-viewer {
          width: ${intrinsicWidth}px !important;
          padding: 0 !important;
          background: #fff !important;
          overflow: visible !important;
        }
        .ofv-pptx-viewer > div[data-slide-index] {
          page-break-after: always;
          break-after: page;
          break-inside: avoid;
          page-break-inside: avoid;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }
        .ofv-pptx-viewer > div[data-slide-index]:last-child {
          page-break-after: avoid;
          break-after: avoid;
        }
      }
    `;
    doc.head.appendChild(pptxStyle);
  }

  doc.body.append(clone);

  let printed = false;
  const printAndCleanup = () => {
    if (printed) {
      return;
    }
    printed = true;
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };

  frame.onload = () => {
    printAndCleanup();
  };

  window.setTimeout(() => {
    printAndCleanup();
  }, 100);
}

function copyCanvasContent(sourceRoot: HTMLElement, targetRoot: HTMLElement): void {
  const sourceCanvases = [...sourceRoot.querySelectorAll("canvas")];
  const targetCanvases = [...targetRoot.querySelectorAll("canvas")];

  sourceCanvases.forEach((sourceCanvas, index) => {
    const targetCanvas = targetCanvases[index];
    if (!targetCanvas) {
      return;
    }
    const image = document.createElement("img");
    image.className = targetCanvas.className;
    image.alt = "Canvas preview page";
    try {
      image.src = sourceCanvas.toDataURL("image/png");
    } catch {
      return;
    }
    image.width = sourceCanvas.width;
    image.height = sourceCanvas.height;
    targetCanvas.replaceWith(image);
  });
}

function downloadFile(file: PreviewFile): void {
  const url = createObjectUrl(file);
  const isExternal = Boolean(file.url);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  link.hidden = true;
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    revokeObjectUrl(url, isExternal);
  }, 0);
}

async function findPlugin(plugins: PreviewPlugin[], file: PreviewFile): Promise<PreviewPlugin> {
  for (const plugin of plugins) {
    if (await plugin.match(file)) {
      return plugin;
    }
  }
  return fallbackPlugin();
}
