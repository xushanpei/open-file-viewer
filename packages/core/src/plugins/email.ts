import DOMPurify from "dompurify";
import type { PreviewPlugin } from "../types";
import { appendMeta, createPanel, createSection, readArrayBuffer, readTextFile, resolveFormat } from "./utils";
import { createObjectUrl, revokeObjectUrl } from "../dom";

const emailExtensions = new Set(["eml", "msg", "mbox"]);
const emailMimeTypes = new Set(["message/rfc822", "application/vnd.ms-outlook", "application/mbox"]);
const emailMimeFormatMap: Record<string, string> = {
  "message/rfc822": "eml",
  "application/vnd.ms-outlook": "msg",
  "application/mbox": "mbox"
};

interface EmailAttachment {
  name: string;
  mimeType: string;
  content: Uint8Array;
  contentId?: string;
}

interface EmailData {
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string;
  bodyText?: string;
  bodyHtml?: string;
  attachments: EmailAttachment[];
}

export function emailPlugin(): PreviewPlugin {
  return {
    name: "email",
    match(file) {
      return emailExtensions.has(file.extension) || emailMimeTypes.has(file.mimeType);
    },
    async render(ctx) {
      const panel = createPanel("ofv-email");
      ctx.viewport.append(panel);

      const url = createObjectUrl(ctx.file);
      const isExternal = Boolean(ctx.file.url);
      const ext = resolveFormat(ctx.file, emailMimeFormatMap).toLowerCase();
      let emailData: EmailData;
      const objectUrlsToRevoke: string[] = [];
      const attachmentObjectUrls = new Map<EmailAttachment, string>();
      const timersToClear: number[] = [];

      try {
        if (ext === "msg") {
          // Parse Outlook binary MSG format
          const MsgReader = (await import("@kenjiuno/msgreader")).default;
          const buffer = await readArrayBuffer(ctx.file);
          const reader = new MsgReader(buffer);
          const parsed = reader.getFileData();

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          const from = parsed.senderName
            ? `${parsed.senderName} <${parsed.senderEmail || parsed.senderSmtpAddress || ""}>`.trim()
            : parsed.senderEmail || parsed.senderSmtpAddress || "";

          const recipients = parsed.recipients || [];
          const to = recipients
            .filter((r) => r.recipType === "to")
            .map((r) => `${r.name || ""} <${r.email || r.smtpAddress || ""}>`.trim())
            .join("; ");
          const cc = recipients
            .filter((r) => r.recipType === "cc")
            .map((r) => `${r.name || ""} <${r.email || r.smtpAddress || ""}>`.trim())
            .join("; ");

          const attachments: EmailAttachment[] = [];
          if (Array.isArray(parsed.attachments)) {
            parsed.attachments.forEach((att) => {
              try {
                const fullAtt = reader.getAttachment(att);
                attachments.push({
                  name: fullAtt.fileName || "未命名附件",
                  mimeType: getAttachmentMimeType(fullAtt, att),
                  content: fullAtt.content,
                  contentId: att.pidContentId
                });
              } catch (attErr) {
                console.warn("Failed to parse attachment:", attErr);
              }
            });
          }

          let bodyHtml = parsed.bodyHtml;
          if (!bodyHtml && parsed.html instanceof Uint8Array) {
            bodyHtml = new TextDecoder("utf-8").decode(parsed.html);
          }

          emailData = {
            from: from || "-",
            to: to || "-",
            cc: cc || "",
            subject: parsed.subject || "(无主题)",
            date: parsed.messageDeliveryTime || parsed.clientSubmitTime || parsed.creationTime || "-",
            bodyText: parsed.body,
            bodyHtml,
            attachments
          };
        } else {
          // Parse EML or MBOX text formats
          const PostalMime = (await import("postal-mime")).default;
          const parser = new PostalMime();
          
          let rawText = await readTextFile(ctx.file);
          if (ext === "mbox") {
            rawText = getEmlFromMbox(rawText);
          }

          const parsed = await parser.parse(rawText);

          const from = parsed.from ? `${parsed.from.name || ""} <${parsed.from.address || ""}>`.trim() : "";
          const to = Array.isArray(parsed.to)
            ? parsed.to.map((t) => `${t.name || ""} <${t.address || ""}>`.trim()).join("; ")
            : "";
          const cc = Array.isArray(parsed.cc)
            ? parsed.cc.map((c) => `${c.name || ""} <${c.address || ""}>`.trim()).join("; ")
            : "";

          emailData = {
            from: from || "-",
            to: to || "-",
            cc: cc || "",
            subject: parsed.subject || "(无主题)",
            date: parsed.date || "-",
            bodyText: parsed.text,
            bodyHtml: parsed.html,
            attachments: (parsed.attachments || []).map((att) => ({
              name: att.filename || "未命名附件",
              mimeType: att.mimeType || "application/octet-stream",
              content: att.content instanceof Uint8Array ? att.content : new Uint8Array(att.content as any),
              contentId: att.contentId
            }))
          };
        }

        // 1. Render Header information section
        const headerSection = createSection("邮件信息");
        appendMeta(headerSection, "Subject", emailData.subject);
        appendMeta(headerSection, "From", emailData.from);
        appendMeta(headerSection, "To", emailData.to);
        if (emailData.cc) {
          appendMeta(headerSection, "Cc", emailData.cc);
        }
        appendMeta(headerSection, "Date", emailData.date);
        panel.append(headerSection);

        // 2. Render Attachments section if present
        if (emailData.attachments.length > 0) {
          const attachmentsSection = createSection("附件列表");
          const container = document.createElement("div");
          container.className = "ofv-email-attachments";

          emailData.attachments.forEach((att) => {
            const blobUrl = getAttachmentObjectUrl(att, attachmentObjectUrls, objectUrlsToRevoke);

            const item = document.createElement("a");
            item.className = "ofv-email-attachment-item";
            item.href = blobUrl;
            item.download = att.name;
            item.rel = "noopener noreferrer";
            
            // Format attachment size helper
            const sizeKB = Math.round(att.content.byteLength / 1024);
            item.textContent = `Attachment: ${att.name} (${sizeKB} KB)`;
            container.append(item);
          });
          
          attachmentsSection.append(container);
          panel.append(attachmentsSection);
        }

        // 3. Render Body section (support inline cid images)
        const bodySection = createSection("正文");
        panel.append(bodySection);

        let html = emailData.bodyHtml;
        if (html) {
          // Replace inline cid: content IDs with local blob URLs
          let nextHtml = html;
          emailData.attachments.forEach((att) => {
            const contentId = att.contentId;
            if (contentId) {
              const blobUrl = getAttachmentObjectUrl(att, attachmentObjectUrls, objectUrlsToRevoke);

              const cleanCid = contentId.replace(/[<>]/g, "");
              nextHtml = replaceCidResourceUrls(nextHtml, contentId, blobUrl);
              if (cleanCid !== contentId) {
                nextHtml = replaceCidResourceUrls(nextHtml, cleanCid, blobUrl);
              }
            }
          });
          html = nextHtml;
          const sanitizedHtml = sanitizeEmailHtml(html);

          // Render in a sandboxed iframe to prevent styles leaking
          const iframe = document.createElement("iframe");
          iframe.className = "ofv-email-body-iframe";
          iframe.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
          iframe.style.cssText = "width: 100%; border: none; background: #fff; min-height: 200px;";
          bodySection.append(iframe);

          iframe.onload = () => {
            try {
              const idoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (idoc) {
                idoc.open();
                idoc.write(`
                  <!doctype html>
                  <html>
                    <head>
                      <meta charset="utf-8" />
                      <style>
                        body {
                          margin: 16px;
                          padding: 0;
                          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                          font-size: 14px;
                          line-height: 1.6;
                          color: #1f2937;
                        }
                        img { max-width: 100%; height: auto; display: block; margin: 12px 0; }
                        a { color: #2563eb; }
                        blockquote {
                          margin: 12px 0;
                          padding-left: 12px;
                          border-left: 3px solid #d1d5db;
                          color: #4b5563;
                        }
                      </style>
                    </head>
                    <body>${sanitizedHtml}</body>
                  </html>
                `);
                idoc.close();
                secureEmailLinks(idoc);

                // Auto-adjust height to avoid double scrolling
                const resize = () => {
                  const body = idoc.body;
                  const docEl = idoc.documentElement;
                  const height = Math.max(
                    body.scrollHeight,
                    body.offsetHeight,
                    docEl.clientHeight,
                    docEl.scrollHeight,
                    docEl.offsetHeight
                  );
                  iframe.style.height = `${height + 32}px`;
                };

                resize();
                timersToClear.push(window.setTimeout(resize, 300));
                timersToClear.push(window.setTimeout(resize, 1000));
              }
            } catch (err) {
              console.error("Failed to write html body to email iframe:", err);
            }
          };
        } else {
          // Render plain text body
          const pre = document.createElement("pre");
          pre.className = "ofv-text-block";
          pre.textContent = emailData.bodyText || "未解析到正文。";
          bodySection.append(pre);
        }

      } catch (err: any) {
        panel.replaceChildren();
        const errorSection = createSection("邮件解析出错");
        const pre = document.createElement("pre");
        pre.className = "ofv-text-block";
        pre.style.color = "#ef4444";
        pre.textContent = `解析邮件时发生错误：\n${err.message || err}`;
        errorSection.append(pre);
        panel.append(errorSection);
      }

      return {
        destroy() {
          timersToClear.forEach((timer) => window.clearTimeout(timer));
          objectUrlsToRevoke.forEach((u) => {
            URL.revokeObjectURL(u);
          });
          revokeObjectUrl(url, isExternal);
          panel.remove();
        }
      };
    }
  };
}

function getAttachmentObjectUrl(
  attachment: EmailAttachment,
  cache: Map<EmailAttachment, string>,
  urlsToRevoke: string[]
): string {
  const cached = cache.get(attachment);
  if (cached) {
    return cached;
  }
  const blob = new Blob([attachment.content as BlobPart], { type: attachment.mimeType });
  const url = URL.createObjectURL(blob);
  cache.set(attachment, url);
  urlsToRevoke.push(url);
  return url;
}

function getAttachmentMimeType(fullAttachment: unknown, attachmentMeta?: unknown): string {
  const candidates = [fullAttachment, attachmentMeta];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const explicitMime =
      normalizeMimeValue(record.attachMimeTag) ||
      normalizeMimeValue(record.mimeType) ||
      normalizeMimeValue(record.contentType) ||
      normalizeMimeValue(record.mime) ||
      normalizeMimeValue(record["content-type"]);
    if (explicitMime) {
      return explicitMime;
    }
  }

  const fileName =
    (fullAttachment && typeof fullAttachment === "object" ? (fullAttachment as { fileName?: unknown }).fileName : undefined) ||
    (attachmentMeta && typeof attachmentMeta === "object" ? (attachmentMeta as { fileName?: unknown }).fileName : undefined);
  return getMimeType(typeof fileName === "string" ? fileName : "");
}

function normalizeMimeValue(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const mimeType = value.split(";")[0]?.trim().toLowerCase() || "";
  return mimeType.includes("/") ? mimeType : "";
}

function replaceCidResourceUrls(html: string, contentId: string, blobUrl: string): string {
  const escapedCid = escapeRegExp(contentId);
  return html.replace(
    new RegExp(`\\b(src|poster|background)=(["'])cid:${escapedCid}\\2`, "gi"),
    (_match, attribute: string, quote: string) => `${attribute}=${quote}${blobUrl}${quote}`
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Helper to convert MBOX format to first EML message text
function getEmlFromMbox(mboxText: string): string {
  const lines = mboxText.replace(/\r\n/g, "\n").split("\n");
  const emlLines: string[] = [];
  let foundFirstFrom = false;

  for (const line of lines) {
    if (line.startsWith("From ")) {
      if (foundFirstFrom) {
        break; // Stop at the start of second email
      }
      foundFirstFrom = true;
      continue; // Skip the mbox From marker line
    }
    if (foundFirstFrom) {
      emlLines.push(line);
    }
  }

  return foundFirstFrom ? emlLines.join("\n") : mboxText;
}

// File extension to MIME type helper for attachment previews
function getMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    md: "text/markdown",
    html: "text/html",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav"
  };
  return ext ? map[ext] || "application/octet-stream" : "application/octet-stream";
}

function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  });
}

function secureEmailLinks(document: Document): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = link.getAttribute("href") || "";
    if (!isSafeEmailHref(href)) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      continue;
    }
    if (/^(https?:)?\/\//i.test(href)) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }
}

function isSafeEmailHref(href: string): boolean {
  const trimmed = href.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("blob:") ||
    /^(https?:|mailto:|tel:)/i.test(trimmed)
  );
}
