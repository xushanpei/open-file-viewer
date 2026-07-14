import { describe, expect, it } from "vitest";
import { defaultMessages, formatMessage, resolveMessages } from "./messages";

describe("resolveMessages", () => {
  it("defaults to en-US when no locale is provided", () => {
    const messages = resolveMessages({});

    expect(messages.loading).toBe("Loading preview...");
    expect(messages.pdf.fallbackTitle).toBe("PDF preview failed");
    expect(messages.image.fallbackTitle).toBe("Image preview failed");
    expect(messages.text.fallbackTitle).toBe("Text preview failed");
  });

  it("returns the zh-CN plugin namespaces when the locale asks for them", () => {
    const messages = resolveMessages({ locale: "zh-CN" });

    expect(messages.pdf.fallbackTitle).toBe("PDF 预览失败");
    expect(messages.image.fallbackTitle).toBe("图片预览失败");
    expect(messages.text.fallbackTitle).toBe("文本预览失败");
  });

  it("merges plugin namespaces one level deep so a single key can be overridden", () => {
    const messages = resolveMessages({ messages: { pdf: { download: "Save" } } });

    expect(messages.pdf.download).toBe("Save");
    // The rest of the pdf namespace must survive the override.
    expect(messages.pdf.fallbackTitle).toBe(defaultMessages["en-US"].pdf.fallbackTitle);
    expect(messages.pdf.encryptedTitle).toBe(defaultMessages["en-US"].pdf.encryptedTitle);
    expect(messages.pdf.summaryPages).toBe(defaultMessages["en-US"].pdf.summaryPages);
    // Sibling namespaces are untouched.
    expect(messages.image).toEqual(defaultMessages["en-US"].image);
    expect(messages.text).toEqual(defaultMessages["en-US"].text);
  });

  it("layers per-key overrides on top of the selected locale", () => {
    const messages = resolveMessages({
      locale: "zh-CN",
      messages: { pdf: { download: "另存为" } }
    });

    expect(messages.pdf.download).toBe("另存为");
    expect(messages.pdf.fallbackTitle).toBe("PDF 预览失败");
  });

  it("still merges the flat top-level keys", () => {
    const messages = resolveMessages({ messages: { loading: "Working..." } });

    expect(messages.loading).toBe("Working...");
    expect(messages.downloadFile).toBe(defaultMessages["en-US"].downloadFile);
    expect(messages.pdf).toEqual(defaultMessages["en-US"].pdf);
  });

  it("exposes matching keys for every locale", () => {
    expect(Object.keys(defaultMessages["zh-CN"]).sort()).toEqual(Object.keys(defaultMessages["en-US"]).sort());
    expect(Object.keys(defaultMessages["zh-CN"].pdf).sort()).toEqual(Object.keys(defaultMessages["en-US"].pdf).sort());
    expect(Object.keys(defaultMessages["zh-CN"].image).sort()).toEqual(Object.keys(defaultMessages["en-US"].image).sort());
    expect(Object.keys(defaultMessages["zh-CN"].text).sort()).toEqual(Object.keys(defaultMessages["en-US"].text).sort());
  });
});

describe("formatMessage", () => {
  it("fills placeholders by name", () => {
    expect(formatMessage("Loading page {page}...", { page: 3 })).toBe("Loading page 3...");
    expect(formatMessage("Page {page} / {total}", { page: 1, total: 2 })).toBe("Page 1 / 2");
  });

  it("leaves unknown placeholders untouched", () => {
    expect(formatMessage("Loading page {page}...", {})).toBe("Loading page {page}...");
  });

  it("returns templates without placeholders unchanged", () => {
    expect(formatMessage("Download PDF")).toBe("Download PDF");
  });
});
