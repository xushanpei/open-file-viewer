import { normalizeFile } from "./detect";
import type { PreviewPlugin, PreviewSource } from "./types";

export interface PreviewSupportOptions {
  fileName?: string;
  mimeType?: string;
}

/** 在挂载预览器前，按实际插件顺序判断文件是否有可用的预览路径。 */
export async function isPreviewSupported(
  source: PreviewSource,
  plugins: PreviewPlugin[],
  options: PreviewSupportOptions = {}
): Promise<boolean> {
  const file = await normalizeFile(source, options.fileName, options.mimeType);
  for (const plugin of plugins) {
    if (await plugin.match(file)) {
      // fallback 是终止性的降级路径，命中后不应继续寻找后面的原生插件。
      return plugin.name !== "fallback";
    }
  }
  return false;
}
