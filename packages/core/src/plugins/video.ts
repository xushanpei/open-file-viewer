import { createObjectUrl, revokeObjectUrl } from "../dom";
import type { PreviewPlugin } from "../types";

const videoExtensions = new Set([
  "mp4",
  "mpg",
  "mpeg",
  "mpe",
  "mpv",
  "webm",
  "ogv",
  "mov",
  "m4v",
  "avi",
  "mkv",
  "flv",
  "wmv",
  "3gp",
  "3g2",
  "m2ts",
  "m3u8"
]);
const videoMimeTypes = new Set([
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/mpegurl",
  "application/dash+xml"
]);
const hlsMimeTypes = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl", "application/mpegurl"]);

export function videoPlugin(): PreviewPlugin {
  return {
    name: "video",
    match(file) {
      return file.mimeType.startsWith("video/") || videoMimeTypes.has(file.mimeType) || videoExtensions.has(file.extension);
    },
    async render(ctx) {
      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      const mimeType = ctx.file.mimeType.toLowerCase();
      
      const container = document.createElement("div");
      container.className = "ofv-video-container";
      container.style.cssText = "width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative;";

      const video = document.createElement("video");
      video.className = "ofv-media";
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.style.objectFit = ctx.options.fit === "cover" ? "cover" : "contain";
      
      container.append(video);
      ctx.viewport.classList.add("ofv-center");
      ctx.viewport.append(container);

      let hlsInstance: any = null;
      let mpegtsPlayer: any = null;
      const ext = ctx.file.extension.toLowerCase();
      const isHls = ext === "m3u8" || hlsMimeTypes.has(mimeType);
      const isMpegTs = ext === "m2ts" || mimeType === "video/mp2t";
      const isDash = mimeType === "application/dash+xml";
      const isFlv = ext === "flv" || mimeType === "video/x-flv";
      const formatLabel = (ctx.file.extension || ctx.file.mimeType || "video").toUpperCase();

      const showTranscodeFallback = () => {
        video.style.display = "none";
        video.pause();
        
        // Remove any existing fallback UI first
        const oldFallback = container.querySelector(".ofv-fallback");
        if (oldFallback) {
          oldFallback.remove();
        }

        const fallback = document.createElement("div");
        fallback.className = "ofv-fallback";
        
        const title = document.createElement("strong");
        title.textContent = `当前浏览器不支持直接播放该视频格式 (${formatLabel})`;
        
        const meta = document.createElement("span");
        meta.textContent = "建议转换为 MP4 格式播放，或直接下载在本地播放。";
        
        const download = document.createElement("a");
        download.href = url;
        download.download = ctx.file.name;
        download.textContent = "下载视频";
        
        fallback.append(title, meta, download);
        container.append(fallback);
      };

      const onVideoError = () => {
        showTranscodeFallback();
      };

      video.addEventListener("error", onVideoError);

      try {
        if (isDash) {
          showTranscodeFallback();
        } else if (isHls) {
          const Hls = (await import("hls.js")).default;
          if (Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(url);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.ERROR, (_event: any, data: any) => {
              if (data.fatal) {
                showTranscodeFallback();
              }
            });
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
          } else {
            showTranscodeFallback();
          }
        } else if (isFlv || isMpegTs) {
          const mpegts = (await import("mpegts.js")).default;
          if (mpegts.isSupported()) {
            mpegtsPlayer = mpegts.createPlayer({
              type: isFlv ? "flv" : "mpegts",
              url: url
            });
            mpegtsPlayer.attachMediaElement(video);
            mpegtsPlayer.load();
            mpegtsPlayer.on(mpegts.Events.ERROR, () => {
              showTranscodeFallback();
            });
          } else {
            showTranscodeFallback();
          }
        } else {
          // Native playback for mp4, webm, mov, ogg, etc.
          video.src = url;
        }
      } catch (err) {
        showTranscodeFallback();
      }

      return {
        resize() {
          video.style.width = "100%";
          video.style.height = "100%";
        },
        destroy() {
          video.removeEventListener("error", onVideoError);
          video.pause();
          
          if (hlsInstance) {
            hlsInstance.destroy();
          }
          if (mpegtsPlayer) {
            mpegtsPlayer.unload();
            mpegtsPlayer.destroy();
          }

          ctx.viewport.classList.remove("ofv-center");
          revokeObjectUrl(url, isExternal);
          container.remove();
        }
      };
    }
  };
}
