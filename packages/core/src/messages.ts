import type { PreviewLocale, PreviewMessages, PreviewOptions } from "./types";

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
    localFile: "本地/内存文件"
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
    localFile: "Local or in-memory file"
  }
};

export function resolveMessages(options: Pick<PreviewOptions, "locale" | "messages">): PreviewMessages {
  return {
    ...defaultMessages[options.locale || "zh-CN"],
    ...options.messages
  };
}
