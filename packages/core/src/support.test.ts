import { describe, expect, it, vi } from "vitest";
import { fallbackPlugin } from "./plugins/fallback";
import { isPreviewSupported } from "./support";
import type { PreviewPlugin } from "./types";

describe("isPreviewSupported", () => {
  it("checks the configured plugins without mounting a viewer", async () => {
    const pdfPlugin: PreviewPlugin = {
      name: "pdf",
      match: (file) => file.extension === "pdf" || file.mimeType === "application/pdf",
      render: vi.fn()
    };

    await expect(isPreviewSupported("https://example.com/report.PDF?download=1", [pdfPlugin])).resolves.toBe(true);
    expect(pdfPlugin.render).not.toHaveBeenCalled();
  });

  it("accepts file metadata overrides and rejects unmatched files", async () => {
    const mimePlugin: PreviewPlugin = {
      name: "custom-mime",
      match: (file) => file.mimeType === "application/x-company-document",
      render: vi.fn()
    };

    await expect(
      isPreviewSupported(new ArrayBuffer(0), [mimePlugin], {
        fileName: "document.bin",
        mimeType: "application/x-company-document"
      })
    ).resolves.toBe(true);
    await expect(isPreviewSupported(new ArrayBuffer(0), [mimePlugin], { fileName: "document.bin" })).resolves.toBe(false);
  });

  it("respects plugin order and stops after the first match", async () => {
    const firstMatch = vi.fn(() => true);
    const laterMatch = vi.fn(() => true);

    await expect(
      isPreviewSupported("document.pdf", [
        { name: "first", match: firstMatch, render: vi.fn() },
        { name: "later", match: laterMatch, render: vi.fn() }
      ])
    ).resolves.toBe(true);

    expect(firstMatch).toHaveBeenCalledTimes(1);
    expect(laterMatch).not.toHaveBeenCalled();
  });

  it("does not count the fallback plugin as native preview support", async () => {
    await expect(isPreviewSupported("archive.unknown", [fallbackPlugin()])).resolves.toBe(false);
  });

  it("treats a matching fallback plugin as terminal", async () => {
    const nativePlugin: PreviewPlugin = {
      name: "pdf",
      match: vi.fn(() => true),
      render: vi.fn()
    };

    await expect(isPreviewSupported("document.pdf", [fallbackPlugin(), nativePlugin])).resolves.toBe(false);
    expect(nativePlugin.match).not.toHaveBeenCalled();
  });

  it("propagates plugin match errors", async () => {
    const error = new Error("plugin match failed");
    const plugin: PreviewPlugin = {
      name: "broken",
      match: vi.fn(() => Promise.reject(error)),
      render: vi.fn()
    };

    await expect(isPreviewSupported("document.bin", [plugin])).rejects.toBe(error);
  });
});
