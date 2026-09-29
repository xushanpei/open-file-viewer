import { normalizeFile } from "./detect";
import { applyBoxSize, createObjectUrl, getElementSize, resolveContainer, revokeObjectUrl } from "./dom";
import { resolveMessages } from "./messages";
import { ensureSafeAsyncScheduling } from "./sandbox-compat";
import { fallbackPlugin } from "./plugins/fallback";
import type {
  FileViewer,
  PreviewFile,
  PreviewCommand,
  PreviewInstance,
  PreviewItem,
  PreviewLocale,
  PreviewOptions,
  PreviewPlugin,
  PreviewSource,
  PreviewToolbarActionId,
  PreviewToolbarBuiltInAction,
  PreviewToolbarCustomAction,
  PreviewToolbarOptions
} from "./types";

export function createViewer(options: PreviewOptions): FileViewer {
  ensureSafeAsyncScheduling();
  const container = resolveContainer(options.container);
  applyBoxSize(container, options.width, options.height);

  const customClassNames = parseClassNameTokens(options.className);
  container.classList.add("ofv-root");
  if (customClassNames.length > 0) {
    container.classList.add(...customClassNames);
  }
  const theme = applyTheme(container, options.theme || "light");

  const host = document.createElement("div");
  host.className = "ofv-host";

  const status = document.createElement("div");
  status.className = "ofv-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  const statusChip = document.createElement("div");
  statusChip.className = "ofv-status-chip";
  const statusSpinner = document.createElement("span");
  statusSpinner.className = "ofv-status-spinner";
  statusSpinner.setAttribute("aria-hidden", "true");
  const statusText = document.createElement("span");
  statusText.className = "ofv-status-text";
  statusChip.append(statusSpinner, statusText);
  status.append(statusChip);

  const viewport = document.createElement("div");
  viewport.className = "ofv-viewport";

  const queue = normalizeQueue(options);
  let currentIndex = clampIndex(options.initialIndex || 0, queue.length);
  let currentInstance: PreviewInstance | undefined;
  let printPreparationPending = false;

  const goTo = async (index: number) => {
    if (destroyed || queue.length === 0) {
      return;
    }
    currentIndex = clampIndex(index, queue.length);
    await renderQueueItem(currentIndex);
  };

  const toolbar = createToolbar(
    options.toolbar,
    viewport,
    {
      getLength: () => queue.length,
      next: () => goTo(currentIndex + 1),
      previous: () => goTo(currentIndex - 1),
      goToPage: (page) => currentInstance?.goToPage?.(page) ?? false,
      command: (command) => currentInstance?.command?.(command),
      print: async () => {
        if (printPreparationPending) {
          return;
        }
        printPreparationPending = true;
        const instance = currentInstance;
        try {
          await instance?.preparePrint?.();
        } catch (error) {
          console.error("Failed to prepare file preview for printing:", error);
          printPreparationPending = false;
          return;
        }
        printPreparationPending = false;
        if (destroyed || instance !== currentInstance) {
          return;
        }
        printPreview(viewport);
      }
    },
    options.locale || "en-US"
  );
  if (toolbar) {
    host.append(toolbar.element);
  }

  host.append(status, viewport);
  container.replaceChildren(host);

  const normalizedOptions = {
    ...options,
    fit: options.fit || "contain",
    fitWasProvided: options.fit !== undefined,
    fallback: options.fallback || "inline",
    zoom: normalizeInitialZoom(options.zoom),
    messages: resolveMessages(options)
  };

  let destroyed = false;
  let renderToken = 0;
  let renderAbortController: AbortController | undefined;
  const gestureZoom = installGestureZoom(
    viewport,
    (command) =>
      !destroyed &&
      Boolean(currentInstance?.command) &&
      (currentInstance?.canCommand ? currentInstance.canCommand(command) : true),
    (command) => currentInstance?.command?.(command)
  );

  const setLoading = (loading: boolean) => {
    status.hidden = !loading;
    status.classList.remove("ofv-status-error");
    statusText.textContent = loading ? normalizedOptions.messages.loading : "";
  };

  const setError = (error: Error | string) => {
    status.hidden = false;
    status.classList.add("ofv-status-error");
    statusText.textContent = typeof error === "string" ? error : error.message;
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
    renderAbortController?.abort();
    const abortController = new AbortController();
    renderAbortController = abortController;
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
        signal: abortController.signal,
        setLoading,
        setError
      });
      if (destroyed || token !== renderToken) {
        destroyPreviewInstance(nextInstance);
        return;
      }
      if (renderAbortController === abortController) {
        renderAbortController = undefined;
      }
      currentInstance = nextInstance;
      if (normalizedOptions.initialPage !== undefined) {
        nextInstance.goToPage?.(normalizedOptions.initialPage);
      }
      setLoading(false);
      toolbar?.setCommandSupport((command) =>
        Boolean(nextInstance.command) && (nextInstance.canCommand ? nextInstance.canCommand(command) : true)
      );
      options.onLoad?.(file);
      resize();
    } catch (error) {
      if (renderAbortController === abortController) {
        renderAbortController = undefined;
      }
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
    renderAbortController?.abort();
    renderAbortController = undefined;
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
    goToPage(page) {
      return destroyed ? false : currentInstance?.goToPage?.(page) ?? false;
    },
    getCurrentIndex() {
      return currentIndex;
    },
    resize,
    destroy() {
      destroyed = true;
      renderToken += 1;
      renderAbortController?.abort();
      renderAbortController = undefined;
      resizeObserver.destroy();
      gestureZoom.destroy();
      destroyPreviewInstance(currentInstance);
      toolbar?.destroy();
      theme.destroy();
      container.replaceChildren();
      container.classList.remove("ofv-root");
      if (customClassNames.length > 0) {
        container.classList.remove(...customClassNames);
      }
    }
  };
}

function installGestureZoom(
  viewport: HTMLElement,
  canCommand: (command: "zoom-in" | "zoom-out") => boolean,
  command: (command: "zoom-in" | "zoom-out") => void | boolean | undefined
): { destroy: () => void } {
  const wheelThreshold = 40;
  const pinchThreshold = 1.08;
  let accumulatedWheelDelta = 0;
  let pinchDistance: number | undefined;

  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || (!event.ctrlKey && !event.metaKey) || event.deltaY === 0) {
      return;
    }
    const zoomCommand = event.deltaY < 0 ? "zoom-in" : "zoom-out";
    if (!canCommand(zoomCommand)) {
      accumulatedWheelDelta = 0;
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    const delta = event.deltaY * (event.deltaMode === 0 ? 1 : wheelThreshold);
    if (accumulatedWheelDelta !== 0 && Math.sign(accumulatedWheelDelta) !== Math.sign(delta)) {
      accumulatedWheelDelta = 0;
    }
    accumulatedWheelDelta += delta;
    if (Math.abs(accumulatedWheelDelta) < wheelThreshold) {
      return;
    }
    command(zoomCommand);
    accumulatedWheelDelta = 0;
  };

  const onTouchStart = (event: TouchEvent) => {
    pinchDistance = event.touches.length === 2 ? touchDistance(event.touches) : undefined;
  };

  const onTouchMove = (event: TouchEvent) => {
    if (event.defaultPrevented || event.touches.length !== 2) {
      pinchDistance = undefined;
      return;
    }
    const nextDistance = touchDistance(event.touches);
    if (!(nextDistance > 0)) {
      return;
    }
    if (!(pinchDistance && pinchDistance > 0)) {
      pinchDistance = nextDistance;
      return;
    }
    const zoomCommand = nextDistance > pinchDistance ? "zoom-in" : "zoom-out";
    if (!canCommand(zoomCommand)) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    const ratio = nextDistance / pinchDistance;
    if (ratio < pinchThreshold && ratio > 1 / pinchThreshold) {
      return;
    }
    command(zoomCommand);
    pinchDistance = nextDistance;
  };

  const onTouchEnd = (event: TouchEvent) => {
    pinchDistance = event.touches.length === 2 ? touchDistance(event.touches) : undefined;
  };

  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("touchstart", onTouchStart, { passive: true });
  viewport.addEventListener("touchmove", onTouchMove, { passive: false });
  viewport.addEventListener("touchend", onTouchEnd, { passive: true });
  viewport.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return {
    destroy() {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
      viewport.removeEventListener("touchcancel", onTouchEnd);
    }
  };
}

function touchDistance(touches: TouchList): number {
  const first = touches.item(0);
  const second = touches.item(1);
  return first && second ? Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) : 0;
}

function parseClassNameTokens(className: string | undefined): string[] {
  return className?.trim().split(/\s+/).filter(Boolean) ?? [];
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
    goToPage: (page: number) => boolean;
    command: (command: PreviewCommand) => void | boolean | undefined;
    print: () => void | Promise<void>;
  },
  locale: PreviewLocale
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
  element.setAttribute("aria-label", defaultToolbarText[locale].ariaLabel);

  let file: PreviewFile | undefined;
  let currentIndex = 0;
  let currentLength = queue.getLength();
  let queueLabel: HTMLSpanElement | undefined;
  let previousButton: HTMLButtonElement | undefined;
  let nextButton: HTMLButtonElement | undefined;
  let zoomResetButton: HTMLButtonElement | undefined;
  let fullscreenButton: HTMLButtonElement | undefined;
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
    icon?: string | HTMLElement | SVGElement,
    iconOnly = false
  ) => {
    const button = document.createElement("button");
    button.type = "button";
    setToolbarButtonContent(button, label, icon, iconOnly);
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
    }, undefined, getToolbarIcon(options, id), id !== "zoom-reset");
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
        getToolbarLabel(options, locale, "previous"),
        getToolbarTitle(options, locale, "previous"),
        () => void queue.previous(),
        undefined,
        getToolbarIcon(options, "previous"),
        true
      );
      return;
    }
    if (id === "next" && queue.getLength() > 1) {
      nextButton = addButton(
        getToolbarLabel(options, locale, "next"),
        getToolbarTitle(options, locale, "next"),
        () => void queue.next(),
        undefined,
        getToolbarIcon(options, "next"),
        true
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
      addCommandButton(id, getToolbarLabel(options, locale, id), getToolbarTitle(options, locale, id), "zoom-out");
      return;
    }
    if (id === "zoom-in" && options.zoom) {
      addCommandButton(id, getToolbarLabel(options, locale, id), getToolbarTitle(options, locale, id), "zoom-in");
      return;
    }
    if (id === "zoom-reset" && options.zoom) {
      addCommandButton(id, getToolbarLabel(options, locale, id), getToolbarTitle(options, locale, id), "zoom-reset");
      zoomResetButton = commandButtons[commandButtons.length - 1]?.button;
      updateZoomLabel();
      return;
    }
    if (id === "rotate-left" && options.rotate) {
      addCommandButton(id, getToolbarLabel(options, locale, id), getToolbarTitle(options, locale, id), "rotate-left");
      return;
    }
    if (id === "rotate-right" && options.rotate) {
      addCommandButton(id, getToolbarLabel(options, locale, id), getToolbarTitle(options, locale, id), "rotate-right");
      return;
    }
    if (id === "download" && options.download !== false) {
      addButton(
        getToolbarLabel(options, locale, id),
        getToolbarTitle(options, locale, id),
        () => getContext().download(),
        undefined,
        getToolbarIcon(options, "download"),
        true
      );
      return;
    }
    if (id === "fullscreen" && options.fullscreen !== false) {
      fullscreenButton = addButton(
        getToolbarLabel(options, locale, id),
        getToolbarTitle(options, locale, id),
        () => getContext().fullscreen(),
        undefined,
        getToolbarIcon(options, "fullscreen"),
        true
      );
      updateFullscreenButton();
      return;
    }
    if (id === "print" && options.print) {
      addButton(
        getToolbarLabel(options, locale, id),
        getToolbarTitle(options, locale, id),
        () => getContext().print(),
        undefined,
        getToolbarIcon(options, "print"),
        true
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
    searchGroup.title = getToolbarTitle(options, locale, "search");
    const searchIcon = document.createElement("span");
    searchIcon.className = "ofv-toolbar-search-icon";
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.append(sanitizeToolbarIcon(defaultToolbarIcons.search ?? ""));
    searchGroup.append(searchIcon);
    const nextSearchInput = document.createElement("input");
    nextSearchInput.type = "search";
    nextSearchInput.placeholder = getToolbarLabel(options, locale, "search");
    nextSearchInput.setAttribute("aria-label", getToolbarTitle(options, locale, "search"));
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
    const order = getToolbarOrder(options, queue.getLength());
    if (options.order) {
      order.forEach(renderDefaultAction);
    } else {
      const rendered = new Set<PreviewToolbarActionId>();
      for (const group of defaultToolbarGroups) {
        const ids = group.filter((id) => order.includes(id));
        if (ids.length === 0) {
          continue;
        }
        const before = element.childElementCount;
        for (const id of ids) {
          rendered.add(id);
          renderDefaultAction(id);
        }
        if (before > 0 && element.childElementCount > before) {
          const separator = document.createElement("span");
          separator.className = "ofv-toolbar-sep";
          separator.setAttribute("aria-hidden", "true");
          element.insertBefore(separator, element.children[before]);
        }
      }
      order.filter((id) => !rendered.has(id)).forEach(renderDefaultAction);
    }
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
      currentZoom === undefined ? getToolbarLabel(options, locale, "zoom-reset") : formatToolbarZoom(currentZoom),
      options.icons?.["zoom-reset"]
    );
    zoomResetButton.classList.add("ofv-toolbar-zoom-reset");
  }

  function refreshCommandSupport() {
    commandButtons.forEach(({ button, command }) => {
      button.disabled = !canRunCommand(command);
    });
    updateCustomButtons();
    refreshCustomRender();
  }

  function isFullscreenActive(): boolean {
    return Boolean(
      typeof document !== "undefined" && element.parentElement && document.fullscreenElement === element.parentElement
    );
  }

  function updateFullscreenButton() {
    if (!fullscreenButton) {
      return;
    }
    const active = isFullscreenActive();
    const id: PreviewToolbarBuiltInAction = active ? "exit-fullscreen" : "fullscreen";
    const icon = active
      ? options.icons?.["exit-fullscreen"] ?? options.icons?.fullscreen ?? defaultToolbarIcons["exit-fullscreen"]
      : getToolbarIcon(options, "fullscreen");
    setToolbarButtonContent(fullscreenButton, getToolbarLabel(options, locale, id), icon, true);
    const title = getToolbarTitle(options, locale, id);
    fullscreenButton.title = title;
    fullscreenButton.setAttribute("aria-label", title);
    fullscreenButton.setAttribute("aria-pressed", String(active));
  }

  const handleFullscreenChange = () => {
    updateFullscreenButton();
    refreshCustomRender();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    disposers.push(() => document.removeEventListener("fullscreenchange", handleFullscreenChange));
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
    goToPage: (page: number) => boolean;
    command: (command: PreviewCommand) => void | boolean | undefined;
    print: () => void | Promise<void>;
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
    isFullscreen: Boolean(
      typeof document !== "undefined" && element.parentElement && document.fullscreenElement === element.parentElement
    ),
    zoom,
    zoomLabel: zoom === undefined ? undefined : formatToolbarZoom(zoom),
    async previous() {
      await queue.previous();
    },
    async next() {
      await queue.next();
    },
    goToPage: queue.goToPage,
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
      const target = element.parentElement;
      if (!target) {
        return;
      }
      if (typeof document !== "undefined" && document.fullscreenElement === target) {
        void document.exitFullscreen?.();
      } else {
        void target.requestFullscreen?.();
      }
    },
    print() {
      void queue.print();
    },
    search: search.search,
    clearSearch: search.clear
  };
}

const toolbarIcon = (content: string): string =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${content}</svg>`;

const defaultToolbarIcons: Partial<Record<PreviewToolbarBuiltInAction, string>> = {
  previous: toolbarIcon('<path d="M9.8 3.8 5.6 8l4.2 4.2"/>'),
  next: toolbarIcon('<path d="M6.2 3.8 10.4 8l-4.2 4.2"/>'),
  "zoom-out": toolbarIcon(
    '<circle cx="7.2" cy="7.2" r="4.4"/><path d="M13.5 13.5l-3.2-3.2"/><path d="M5.4 7.2h3.6"/>'
  ),
  "zoom-in": toolbarIcon(
    '<circle cx="7.2" cy="7.2" r="4.4"/><path d="M13.5 13.5l-3.2-3.2"/><path d="M5.4 7.2h3.6"/><path d="M7.2 5.4v3.6"/>'
  ),
  "rotate-left": toolbarIcon(
    '<path d="M2.2 8a5.8 5.8 0 1 0 1.7-4.1L2.2 5.6"/><path d="M2.2 2.2v3.4h3.4"/>'
  ),
  "rotate-right": toolbarIcon(
    '<path d="M13.8 8a5.8 5.8 0 1 1-1.7-4.1l1.7 1.7"/><path d="M13.8 2.2v3.4h-3.4"/>'
  ),
  download: toolbarIcon(
    '<path d="M8 2.6v6.9"/><path d="m4.9 6.6 3.1 3.1 3.1-3.1"/><path d="M2.9 11.2v1a1.3 1.3 0 0 0 1.3 1.3h7.6a1.3 1.3 0 0 0 1.3-1.3v-1"/>'
  ),
  fullscreen: toolbarIcon(
    '<path d="M6 2.9H4.2A1.3 1.3 0 0 0 2.9 4.2V6"/><path d="M10 2.9h1.8a1.3 1.3 0 0 1 1.3 1.3V6"/><path d="M6 13.1H4.2a1.3 1.3 0 0 1-1.3-1.3V10"/><path d="M10 13.1h1.8a1.3 1.3 0 0 0 1.3-1.3V10"/>'
  ),
  "exit-fullscreen": toolbarIcon(
    '<path d="M2.9 6h1.8A1.3 1.3 0 0 0 6 4.7V2.9"/><path d="M13.1 6h-1.8A1.3 1.3 0 0 1 10 4.7V2.9"/><path d="M2.9 10h1.8A1.3 1.3 0 0 1 6 11.3v1.8"/><path d="M13.1 10h-1.8a1.3 1.3 0 0 0-1.3 1.3v1.8"/>'
  ),
  print: toolbarIcon(
    '<path d="M4.7 5.8V2.9h6.6v2.9"/><path d="M4.7 11.4H3.5a1.3 1.3 0 0 1-1.3-1.3V7.2a1.4 1.4 0 0 1 1.4-1.4h8.8a1.4 1.4 0 0 1 1.4 1.4v2.9a1.3 1.3 0 0 1-1.3 1.3h-1.2"/><path d="M4.7 9.5h6.6v3.6H4.7z"/>'
  ),
  search: toolbarIcon('<circle cx="7.2" cy="7.2" r="4.4"/><path d="M13.5 13.5l-3.2-3.2"/>')
};

function getToolbarIcon(
  options: PreviewToolbarOptions,
  id: PreviewToolbarBuiltInAction
): string | HTMLElement | SVGElement | undefined {
  return options.icons?.[id] ?? defaultToolbarIcons[id];
}

const defaultToolbarGroups: PreviewToolbarActionId[][] = [
  ["previous", "next", "queue"],
  ["zoom-out", "zoom-in", "zoom-reset", "rotate-left", "rotate-right"],
  ["download", "fullscreen", "print"]
];

const defaultToolbarText: Record<
  PreviewLocale,
  {
    ariaLabel: string;
    labels: Record<PreviewToolbarBuiltInAction, string>;
    titles: Record<PreviewToolbarBuiltInAction, string>;
  }
> = {
  "zh-CN": {
    ariaLabel: "文件预览工具栏",
    labels: {
      previous: "上一个",
      next: "下一个",
      queue: "",
      "zoom-out": "-",
      "zoom-in": "+",
      "zoom-reset": "100%",
      "rotate-left": "左旋",
      "rotate-right": "旋转",
      download: "下载",
      fullscreen: "全屏",
      "exit-fullscreen": "退出全屏",
      print: "打印",
      search: "搜索"
    },
    titles: {
      previous: "上一个文件",
      next: "下一个文件",
      queue: "当前文件位置",
      "zoom-out": "缩小",
      "zoom-in": "放大",
      "zoom-reset": "重置缩放",
      "rotate-left": "向左旋转",
      "rotate-right": "向右旋转",
      download: "下载文件",
      fullscreen: "全屏查看预览",
      "exit-fullscreen": "退出全屏",
      print: "打印预览",
      search: "搜索预览文本"
    }
  },
  "en-US": {
    ariaLabel: "File preview toolbar",
    labels: {
      previous: "Prev",
      next: "Next",
      queue: "",
      "zoom-out": "-",
      "zoom-in": "+",
      "zoom-reset": "100%",
      "rotate-left": "Rotate left",
      "rotate-right": "Rotate",
      download: "Download",
      fullscreen: "Fullscreen",
      "exit-fullscreen": "Exit fullscreen",
      print: "Print",
      search: "Search"
    },
    titles: {
      previous: "Previous file",
      next: "Next file",
      queue: "Current file position",
      "zoom-out": "Zoom out",
      "zoom-in": "Zoom in",
      "zoom-reset": "Reset zoom",
      "rotate-left": "Rotate left",
      "rotate-right": "Rotate right",
      download: "Download file",
      fullscreen: "Open preview fullscreen",
      "exit-fullscreen": "Exit fullscreen",
      print: "Print preview",
      search: "Search preview text"
    }
  }
};

function getToolbarLabel(
  options: PreviewToolbarOptions,
  locale: PreviewLocale,
  id: PreviewToolbarBuiltInAction
): string {
  return options.labels?.[id] ?? defaultToolbarText[locale].labels[id];
}

function getToolbarTitle(
  options: PreviewToolbarOptions,
  locale: PreviewLocale,
  id: PreviewToolbarBuiltInAction
): string {
  return options.titles?.[id] ?? options.labels?.[id] ?? defaultToolbarText[locale].titles[id];
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
    actions.push("rotate-left", "rotate-right");
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
  icon?: string | HTMLElement | SVGElement,
  iconOnly = false
): void {
  button.replaceChildren();
  button.classList.toggle("ofv-toolbar-icon-button", Boolean(icon) && iconOnly);
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
  return id in defaultToolbarText["en-US"].labels;
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
      if (hasHiddenSearchAncestor(parent, root)) {
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

function hasHiddenSearchAncestor(element: HTMLElement, root: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      current.style.display === "none" ||
      current.style.visibility === "hidden"
    ) {
      return true;
    }
    if (current === root) {
      break;
    }
    current = current.parentElement;
  }
  return false;
}

const PRINT_RESOURCE_WAIT_TIMEOUT_MS = 15_000;
const PRINT_FRAME_CLEANUP_TIMEOUT_MS = 5 * 60_000;

function printPreview(viewport: HTMLElement): void {
  const frame = document.createElement("iframe");
  frame.className = "ofv-print-frame";
  frame.setAttribute("aria-hidden", "true");
  document.body.append(frame);

  const clone = viewport.cloneNode(true) as HTMLElement;
  copyCanvasContent(viewport, clone);
  clone.classList.add("ofv-print-root", "ofv-root"); // Add ofv-root class so CSS variables can resolve

  const docxPage = viewport.querySelector<HTMLElement>(".ofv-docx-page-frame > section.ofv-docx");
  const docxPageStyle = docxPage ? getComputedStyle(docxPage) : undefined;
  const docxPageWidth = Number.parseFloat(docxPageStyle?.width || "");
  const docxPageHeight = Number.parseFloat(docxPageStyle?.height || "");
  const docxPageSizeRule =
    Number.isFinite(docxPageWidth) && Number.isFinite(docxPageHeight)
      ? `size: ${docxPageWidth}px ${docxPageHeight}px;`
      : "";

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

  if (docxPage) {
    // Preview frames carry fit scaling and padding; the DOCX page already has its own margins.
    const docxStyle = doc.createElement("style");
    docxStyle.textContent = `
      @media print {
        @page {
          ${docxPageSizeRule}
          margin: 0;
        }
        html, body,
        .ofv-print-root,
        .ofv-office-docx,
        .ofv-docx-document {
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }
        .ofv-office-docx {
          --ofv-office-zoom: 1 !important;
        }
        .ofv-docx-document .ofv-docx-wrapper {
          display: block !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          --ofv-docx-scale: 1 !important;
        }
        .ofv-docx-page-frame {
          display: block !important;
          width: max-content !important;
          max-width: none !important;
          height: auto !important;
          margin: 0 !important;
          break-after: page;
          page-break-after: always;
        }
        .ofv-docx-page-frame:last-child {
          break-after: auto;
          page-break-after: auto;
        }
        .ofv-docx-page-frame > section.ofv-docx {
          max-width: none !important;
          margin: 0 !important;
          box-shadow: none !important;
          transform: none !important;
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `;
    doc.head.appendChild(docxStyle);
  }

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

  const printWindow = frame.contentWindow;
  if (!printWindow) {
    frame.remove();
    return;
  }

  let cleanedUp = false;
  let cleanupTimer: number | undefined;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    window.clearTimeout(cleanupTimer);
    printWindow.removeEventListener?.("afterprint", cleanup);
    frame.remove();
  };
  printWindow.addEventListener?.("afterprint", cleanup, { once: true });

  void waitForPrintResources(doc).then(() => {
    if (cleanedUp || !frame.isConnected) {
      return;
    }
    cleanupTimer = window.setTimeout(cleanup, PRINT_FRAME_CLEANUP_TIMEOUT_MS);
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      cleanup();
    }
  });
}

async function waitForPrintResources(doc: Document): Promise<void> {
  const pending: Array<Promise<void>> = [];
  for (const image of Array.from(doc.images)) {
    pending.push(waitForPrintImage(image));
  }
  for (const stylesheet of Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']"))) {
    pending.push(waitForPrintStylesheet(stylesheet));
  }
  if (doc.fonts?.ready) {
    pending.push(Promise.resolve(doc.fonts.ready).then(() => undefined, () => undefined));
  }

  await settlePrintResources(pending);
  void doc.body.offsetHeight;
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function waitForPrintImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode === "function") {
    return image.decode().then(() => undefined, () => undefined);
  }
  if (image.complete) {
    return Promise.resolve();
  }
  return waitForPrintElement(image);
}

function waitForPrintStylesheet(stylesheet: HTMLLinkElement): Promise<void> {
  try {
    if (stylesheet.sheet) {
      return Promise.resolve();
    }
  } catch {
    // Cross-origin stylesheets can deny CSSOM access while still loading normally.
  }
  return waitForPrintElement(stylesheet);
}

function waitForPrintElement(element: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      element.removeEventListener("load", done);
      element.removeEventListener("error", done);
      resolve();
    };
    element.addEventListener("load", done, { once: true });
    element.addEventListener("error", done, { once: true });
  });
}

function settlePrintResources(pending: Array<Promise<void>>): Promise<void> {
  if (pending.length === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const timeout = window.setTimeout(finish, PRINT_RESOURCE_WAIT_TIMEOUT_MS);
    void Promise.all(pending).then(finish, finish);
  });
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
