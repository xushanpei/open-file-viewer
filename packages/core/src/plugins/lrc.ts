import type { PreviewMessages } from "../types";

export type LrcRole = "M" | "F" | "D";

export interface LrcMetadata {
  key: string;
  value: string;
  line: number;
}

export interface LrcWord {
  timestamp?: string;
  text: string;
}

export interface LrcLyricLine {
  timestamps: string[];
  text: string;
  words: LrcWord[];
  role?: LrcRole;
  explicitRole?: LrcRole;
  line: number;
}

export interface ParsedLrc {
  metadata: LrcMetadata[];
  lyrics: LrcLyricLine[];
}

export type LrcPreviewMode = "display" | "annotated" | "source";

const lrcModeIconPaths: Record<LrcPreviewMode, string> = {
  display:
    "M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,160H40V56H216V200ZM184,96a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,96Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,128Zm0,32a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h96A8,8,0,0,1,184,160Z",
  annotated:
    "M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM40,112H80v32H40Zm56,0H216v32H96ZM216,64V96H40V64ZM40,160H80v32H40Zm176,32H96V160H216v32Z",
  source:
    "M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z"
};

const TIME_TAG = String.raw`\d{1,3}:\d{2}(?:[.:]\d{1,3})?`;
const lineTimePattern = new RegExp(`^\\s*((?:\\[${TIME_TAG}\\])+)(.*)$`);
const timeTagPattern = new RegExp(`\\[(${TIME_TAG})\\]`, "g");
const wordTimePattern = new RegExp(`<(${TIME_TAG})>`, "g");
const metadataTagPattern = /\[([a-zA-Z][\w-]*|#):([^\]]*)\]/g;
const trackInformationKeys = ["al", "au", "lr", "length"];
const fileInformationKeys = ["by", "offset", "re", "tool", "ve"];
let lrcPreviewSequence = 0;

export function parseLrc(source: string): ParsedLrc {
  const metadata: LrcMetadata[] = [];
  const lyrics: LrcLyricLine[] = [];
  let activeRole: LrcRole | undefined;

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return;
    }

    const metadataEntries = parseMetadataLine(trimmed, line);
    if (metadataEntries) {
      metadata.push(...metadataEntries);
      return;
    }

    const timed = rawLine.match(lineTimePattern);
    const timestamps: string[] = [];
    let content = rawLine;
    if (timed) {
      for (const match of timed[1].matchAll(timeTagPattern)) {
        timestamps.push(match[1]);
      }
      content = timed[2];
    }

    const roleMatch = content.match(/^\s*([MFD]):\s*/i);
    const explicitRole = roleMatch?.[1].toUpperCase() as LrcRole | undefined;
    if (explicitRole) {
      activeRole = explicitRole;
      content = content.slice(roleMatch![0].length);
    }

    const words = parseTimedWords(content);
    const text = words.map((word) => word.text).join("");
    if (timestamps.length > 0 || text.trim() || explicitRole) {
      lyrics.push({
        timestamps,
        text,
        words,
        role: activeRole,
        explicitRole,
        line
      });
    }
  });

  return { metadata, lyrics };
}

function parseMetadataLine(source: string, line: number): LrcMetadata[] | undefined {
  const entries: LrcMetadata[] = [];
  let consumed = "";
  metadataTagPattern.lastIndex = 0;
  for (const match of source.matchAll(metadataTagPattern)) {
    entries.push({ key: match[1].toLowerCase(), value: match[2].trim(), line });
    consumed += match[0];
  }
  return entries.length > 0 && consumed === source ? entries : undefined;
}

function parseTimedWords(source: string): LrcWord[] {
  const words: LrcWord[] = [];
  let cursor = 0;
  let activeTimestamp: string | undefined;
  wordTimePattern.lastIndex = 0;
  for (const match of source.matchAll(wordTimePattern)) {
    if (match.index > cursor) {
      words.push({ timestamp: activeTimestamp, text: source.slice(cursor, match.index) });
    }
    activeTimestamp = match[1];
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) {
    words.push({ timestamp: activeTimestamp, text: source.slice(cursor) });
  }
  if (words.length === 0) {
    words.push({ text: source });
  }
  return words;
}

export interface LrcPreviewViews {
  modeBar: HTMLElement;
  annotatedView: HTMLElement;
  displayView: HTMLElement;
  setMode(mode: LrcPreviewMode): void;
}

export function createLrcPreviewViews(
  parsed: ParsedLrc,
  fileName: string,
  messages: PreviewMessages,
  sourceView: HTMLElement,
  wrapButton: HTMLButtonElement
): LrcPreviewViews {
  const modeBar = document.createElement("div");
  modeBar.className = "ofv-lrc-modebar";

  const group = document.createElement("div");
  group.className = "ofv-lrc-mode-switch";
  group.setAttribute("role", "tablist");
  group.setAttribute("aria-label", messages.lrcPreviewMode);
  group.setAttribute("aria-orientation", "horizontal");

  const annotatedView = createAnnotatedView(parsed, messages);
  const displayView = createDisplayView(parsed, fileName, messages);
  const instanceId = ++lrcPreviewSequence;
  const panels: Record<LrcPreviewMode, HTMLElement> = {
    display: displayView,
    annotated: annotatedView,
    source: sourceView
  };

  const modes: Array<[LrcPreviewMode, string]> = [
    ["display", messages.lrcDisplayMode],
    ["annotated", messages.lrcAnnotatedMode],
    ["source", messages.lrcSourceMode]
  ];
  const buttons = new Map<LrcPreviewMode, HTMLButtonElement>();
  modes.forEach(([mode, text]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ofv-lrc-mode-button";
    button.dataset.mode = mode;
    button.id = `ofv-lrc-${instanceId}-tab-${mode}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `ofv-lrc-${instanceId}-panel-${mode}`);
    button.setAttribute("aria-selected", "false");
    button.setAttribute("aria-label", text);
    button.title = text;
    button.tabIndex = -1;
    button.append(createLrcModeIcon(mode));
    const panel = panels[mode];
    panel.id = `ofv-lrc-${instanceId}-panel-${mode}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    buttons.set(mode, button);
    group.append(button);
  });
  modeBar.append(group);

  const setMode = (mode: LrcPreviewMode) => {
    sourceView.hidden = mode !== "source";
    annotatedView.hidden = mode !== "annotated";
    displayView.hidden = mode !== "display";
    wrapButton.hidden = mode !== "source";
    buttons.forEach((button, buttonMode) => {
      const active = buttonMode === mode;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    modeBar.dataset.activeMode = mode;
  };

  buttons.forEach((button, mode) => button.addEventListener("click", () => setMode(mode)));
  group.addEventListener("keydown", (event) => {
    const currentIndex = modes.findIndex(([mode]) => buttons.get(mode) === document.activeElement);
    if (currentIndex < 0) {
      return;
    }
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % modes.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + modes.length) % modes.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = modes.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextMode = modes[nextIndex][0];
    setMode(nextMode);
    buttons.get(nextMode)?.focus();
  });
  setMode("display");

  return { modeBar, annotatedView, displayView, setMode };
}

function createLrcModeIcon(mode: LrcPreviewMode): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("ofv-lrc-mode-icon");
  svg.setAttribute("viewBox", "0 0 256 256");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", lrcModeIconPaths[mode]);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

function createAnnotatedView(parsed: ParsedLrc, messages: PreviewMessages): HTMLElement {
  const view = document.createElement("div");
  view.className = "ofv-lrc-annotated";

  const table = document.createElement("div");
  table.className = "ofv-lrc-annotated-table";

  parsed.metadata.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "ofv-lrc-annotated-row is-metadata";
    row.classList.add(entry.key === "ti" ? "is-title" : "is-secondary");
    row.dataset.tag = entry.key;

    const gutter = document.createElement("div");
    gutter.className = "ofv-lrc-annotated-gutter";
    const label = document.createElement("span");
    label.className = "ofv-lrc-meta-label";
    label.textContent = entry.key;
    gutter.append(label);

    const value = document.createElement("div");
    value.className = "ofv-lrc-meta-value";
    value.textContent = entry.value;
    row.append(gutter, value);
    table.append(row);
  });

  parsed.lyrics.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "ofv-lrc-annotated-row is-lyric";
    if (entry.role) {
      row.dataset.role = entry.role;
    }

    const gutter = document.createElement("div");
    gutter.className = "ofv-lrc-annotated-gutter";
    const times = document.createElement("span");
    times.className = "ofv-lrc-times";
    if (entry.timestamps.length === 0) {
      times.textContent = "·";
    } else {
      entry.timestamps.forEach((timestamp) => {
        const time = document.createElement("span");
        time.className = "ofv-lrc-time";
        time.textContent = timestamp;
        times.append(time);
      });
    }
    gutter.append(times);

    const lyric = document.createElement("div");
    lyric.className = "ofv-lrc-annotated-text";
    if (entry.explicitRole) {
      lyric.append(createRoleBadge(entry.explicitRole, messages));
    }
    const lyricContent = document.createElement("span");
    lyricContent.className = "ofv-lrc-annotated-content";
    appendTimedWords(lyricContent, entry.words, messages);
    lyric.append(lyricContent);
    row.append(gutter, lyric);
    table.append(row);
  });

  if (!table.hasChildNodes()) {
    const empty = document.createElement("p");
    empty.className = "ofv-lrc-empty";
    empty.textContent = messages.lrcEmpty;
    table.append(empty);
  }
  view.append(table);
  return view;
}

function appendTimedWords(container: HTMLElement, words: LrcWord[], messages: PreviewMessages): void {
  const visibleWords = words
    .map((word) => ({ ...word, text: word.text.trim() }))
    .filter((word) => word.text.length > 0);

  visibleWords.forEach((word, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "ofv-lrc-word-separator";
      separator.textContent = " ";
      separator.setAttribute("aria-hidden", "true");
      container.append(separator);
    }
    if (!word.timestamp) {
      container.append(document.createTextNode(word.text));
      return;
    }
    const ruby = document.createElement("ruby");
    ruby.className = "ofv-lrc-timed-word";
    ruby.tabIndex = 0;
    ruby.setAttribute("aria-label", `${word.text}, ${messages.lrcWordTimestamp}: ${word.timestamp}`);
    const text = document.createElement("span");
    text.className = "ofv-lrc-word-text";
    text.textContent = word.text;
    const timestamp = document.createElement("rt");
    timestamp.textContent = word.timestamp;
    ruby.append(text, timestamp);
    container.append(ruby);
  });
}

function createDisplayView(parsed: ParsedLrc, fileName: string, messages: PreviewMessages): HTMLElement {
  const view = document.createElement("div");
  view.className = "ofv-lrc-display";

  const page = document.createElement("article");
  page.className = "ofv-lrc-display-page";
  const header = document.createElement("div");
  header.className = "ofv-lrc-display-header";

  const title = metadataValue(parsed, "ti") || fileName.replace(/\.lrc$/i, "");
  const heading = document.createElement("h2");
  heading.textContent = title;
  header.append(heading);

  const artist = metadataValue(parsed, "ar");
  if (artist) {
    const artistName = document.createElement("p");
    artistName.className = "ofv-lrc-display-artist";
    artistName.textContent = artist;
    header.append(artistName);
  }
  const trackInformation = createCredits(parsed, messages, trackInformationKeys);
  if (trackInformation) {
    trackInformation.classList.add("ofv-lrc-display-track-info");
    trackInformation.setAttribute("aria-label", messages.lrcTrackInformation);
    header.append(trackInformation);
  }
  page.append(header);

  const lyrics = document.createElement("div");
  lyrics.className = "ofv-lrc-display-lyrics";
  parsed.lyrics.forEach((entry) => {
    if (!entry.text.trim()) {
      return;
    }
    const line = document.createElement("p");
    line.className = "ofv-lrc-display-line";
    if (entry.role) {
      line.dataset.role = entry.role;
    }
    if (entry.explicitRole) {
      line.append(createRoleBadge(entry.explicitRole, messages));
    }
    const lyricContent = document.createElement("span");
    lyricContent.className = "ofv-lrc-display-content";
    lyricContent.textContent = entry.text;
    line.append(lyricContent);
    lyrics.append(line);
  });
  if (!lyrics.hasChildNodes()) {
    const empty = document.createElement("p");
    empty.className = "ofv-lrc-empty";
    empty.textContent = messages.lrcEmpty;
    lyrics.append(empty);
  }
  page.append(lyrics);
  const fileInformation = createCredits(parsed, messages, fileInformationKeys);
  if (fileInformation) {
    const footer = document.createElement("div");
    footer.className = "ofv-lrc-display-file-info";
    footer.append(fileInformation);
    page.append(footer);
  }
  view.append(page);
  return view;
}

function createCredits(parsed: ParsedLrc, messages: PreviewMessages, keys: string[]): HTMLElement | undefined {
  const labels: Record<string, string> = {
    al: messages.lrcAlbum,
    au: messages.lrcAuthor,
    lr: messages.lrcLyricist,
    by: messages.lrcLrcBy,
    length: messages.lrcLength,
    offset: messages.lrcOffset,
    re: messages.lrcTool,
    tool: messages.lrcTool,
    ve: messages.lrcVersion
  };
  const entries = parsed.metadata.filter((entry) => keys.includes(entry.key) && labels[entry.key] && entry.value);
  if (entries.length === 0) {
    return undefined;
  }
  const credits = document.createElement("dl");
  credits.className = "ofv-lrc-display-credits";
  entries.forEach((entry) => {
    const term = document.createElement("dt");
    term.textContent = labels[entry.key];
    const value = document.createElement("dd");
    value.textContent = entry.value;
    credits.append(term, value);
  });
  return credits;
}

function metadataValue(parsed: ParsedLrc, key: string): string | undefined {
  return parsed.metadata.find((entry) => entry.key === key && entry.value)?.value;
}

function createRoleBadge(role: LrcRole, messages: PreviewMessages): HTMLElement {
  const labels: Record<LrcRole, string> = {
    M: messages.lrcMale,
    F: messages.lrcFemale,
    D: messages.lrcDuet
  };
  const badge = document.createElement("sup");
  badge.className = "ofv-lrc-role";
  badge.dataset.role = role;
  badge.textContent = role;
  badge.title = labels[role];
  badge.setAttribute("aria-label", labels[role]);
  return badge;
}
