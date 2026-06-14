import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin } from "../types";

const audioExtensions = new Set([
  "mp3",
  "wav",
  "aif",
  "aiff",
  "aifc",
  "ogg",
  "oga",
  "aac",
  "m4a",
  "flac",
  "opus",
  "weba",
  "amr",
  "mid",
  "midi",
  "caf",
  "au",
  "snd",
  "wma"
]);

export function audioPlugin(): PreviewPlugin {
  return {
    name: "audio",
    match(file) {
      return file.mimeType.startsWith("audio/") || audioExtensions.has(file.extension);
    },
    render(ctx) {
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      const wrapper = document.createElement("div");
      wrapper.className = "ofv-audio";

      const title = document.createElement("div");
      title.className = "ofv-audio-title";
      title.textContent = ctx.file.name;

      const audio = document.createElement("audio");
      audio.src = url;
      audio.controls = true;
      audio.preload = "metadata";

      wrapper.append(title, audio);
      ctx.viewport.classList.add("ofv-center");
      ctx.viewport.append(wrapper);

      const formatLabel = (ctx.file.extension || ctx.file.mimeType || "audio").toUpperCase();
      const showPlaybackFallback = () => {
        audio.pause();
        audio.remove();

        if (wrapper.querySelector(".ofv-fallback")) {
          return;
        }

        const fallback = document.createElement("div");
        fallback.className = "ofv-fallback";

        const fallbackTitle = document.createElement("strong");
        fallbackTitle.textContent = `当前浏览器不支持直接播放该音频格式 (${formatLabel})`;

        const meta = document.createElement("span");
        meta.textContent = "建议转换为 MP3/AAC/OGG 等浏览器兼容格式，或直接下载在本地播放。";

        const download = document.createElement("a");
        download.href = url;
        download.download = ctx.file.name;
        download.textContent = "下载音频";

        fallback.append(fallbackTitle, meta, download);
        wrapper.append(fallback);
      };

      audio.addEventListener("error", showPlaybackFallback);

      return {
        destroy() {
          audio.removeEventListener("error", showPlaybackFallback);
          audio.pause();
          ctx.viewport.classList.remove("ofv-center");
          revokeObjectUrl(url, isExternal);
        }
      };
    }
  };
}
