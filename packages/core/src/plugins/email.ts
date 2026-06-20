import DOMPurify from "dompurify";
import type { PreviewCommand, PreviewContext, PreviewPlugin } from "../types";
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

interface MboxMessageSummary {
  from: string;
  subject: string;
  date: string;
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
      const zoomController = createEmailZoomController(panel, ctx);
      let mboxSummary: MboxMessageSummary[] = [];

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
          let rawSource: string | ArrayBuffer = await readArrayBuffer(ctx.file);
          if (ext === "mbox") {
            let rawText = await readTextFile(ctx.file);
            const messages = splitMboxMessages(rawText);
            mboxSummary = messages.map(summarizeMboxMessage);
            rawSource = messages[0] || rawText;
          }

          const parsed = await parser.parse(rawSource);

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

        if (mboxSummary.length > 0) {
          panel.append(createMboxSummarySection(mboxSummary));
        }

        // 1. Render Header information section
        const headerSection = createSection("邮件信息");
        hideSupplementalInfo(headerSection);
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
          hideSupplementalInfo(attachmentsSection);
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
          iframe.setAttribute("sandbox", "allow-same-origin allow-popups allow-popups-to-escape-sandbox");
          iframe.style.cssText = "width: 100%; border: none; background: #fff; min-height: 200px;";
          let renderedHtmlBody = false;
          let resizeHtmlBody: (() => void) | undefined;
          const renderHtmlBody = () => {
            if (renderedHtmlBody) {
              return;
            }
            try {
              const idoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (idoc) {
                renderedHtmlBody = true;
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
                zoomController.setHtmlBody(idoc.body, () => resizeHtmlBody?.());
                ctx.toolbar?.refreshCommandSupport();

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
                resizeHtmlBody = resize;

                resize();
                timersToClear.push(window.setTimeout(resize, 300));
                timersToClear.push(window.setTimeout(resize, 1000));
              }
            } catch (err) {
              console.error("Failed to write html body to email iframe:", err);
            }
          };
          iframe.addEventListener("load", renderHtmlBody, { once: true });
          bodySection.append(iframe);
          renderHtmlBody();
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
        canCommand(command) {
          return zoomController.canCommand(command);
        },
        command(command) {
          return zoomController.command(command);
        },
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

function createEmailZoomController(panel: HTMLElement, ctx: PreviewContext) {
  let zoom = 1;
  let htmlBody: HTMLElement | undefined;
  let resizeHtmlBody: (() => void) | undefined;

  const apply = () => {
    const normalized = Math.round(zoom * 100) / 100;
    panel.style.setProperty("--ofv-email-zoom", String(normalized));
    if (htmlBody) {
      htmlBody.style.fontSize = `${Math.round(14 * normalized * 100) / 100}px`;
      resizeHtmlBody?.();
      window.setTimeout(() => resizeHtmlBody?.(), 0);
    }
    ctx.toolbar?.setZoom(normalized === 1 ? undefined : normalized);
  };

  apply();

  return {
    setHtmlBody(body: HTMLElement, resize: () => void) {
      htmlBody = body;
      resizeHtmlBody = resize;
      apply();
    },
    canCommand(command: PreviewCommand) {
      return command === "zoom-in" || command === "zoom-out" || command === "zoom-reset";
    },
    command(command: PreviewCommand) {
      if (command === "zoom-in") {
        zoom = Math.min(3, zoom * 1.15);
        apply();
        return true;
      }
      if (command === "zoom-out") {
        zoom = Math.max(0.5, zoom / 1.15);
        apply();
        return true;
      }
      if (command === "zoom-reset") {
        zoom = 1;
        apply();
        return true;
      }
      return false;
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

function createMboxSummarySection(messages: MboxMessageSummary[]): HTMLElement {
  const section = createSection("MBOX 邮箱摘要");
  hideSupplementalInfo(section);
  const meta = document.createElement("div");
  meta.className = "ofv-email-mbox-meta";
  appendMeta(meta, "邮件数", String(messages.length));
  appendMeta(meta, "预览", "当前正文显示第一封邮件");

  const tableWrap = document.createElement("div");
  tableWrap.className = "ofv-table-scroll ofv-email-mbox-table";
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");
  for (const label of ["#", "Subject", "From", "Date"]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.append(th);
  }
  thead.append(header);
  const tbody = document.createElement("tbody");
  messages.slice(0, 100).forEach((message, index) => {
    const row = document.createElement("tr");
    for (const value of [String(index + 1), message.subject || "(无主题)", message.from || "-", message.date || "-"]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    tbody.append(row);
  });
  table.append(thead, tbody);
  tableWrap.append(table);
  section.append(meta, tableWrap);
  return section;
}

function hideSupplementalInfo(element: HTMLElement): void {
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  element.style.display = "none";
}

function splitMboxMessages(mboxText: string): string[] {
  const lines = mboxText.replace(/\r\n/g, "\n").split("\n");
  const messages: string[][] = [];
  let current: string[] | null = null;
  let foundFirstFrom = false;

  for (const line of lines) {
    if (line.startsWith("From ")) {
      if (current && current.length > 0) {
        messages.push(current);
      }
      current = [];
      foundFirstFrom = true;
      continue;
    }
    if (foundFirstFrom && current) {
      current.push(line.startsWith(">From ") ? line.slice(1) : line);
    }
  }
  if (current && current.length > 0) {
    messages.push(current);
  }
  return messages.length > 0 ? messages.map((message) => message.join("\n")) : [mboxText];
}

function summarizeMboxMessage(message: string): MboxMessageSummary {
  return {
    from: unfoldHeader(readHeaderValue(message, "From")),
    subject: unfoldHeader(readHeaderValue(message, "Subject")),
    date: unfoldHeader(readHeaderValue(message, "Date"))
  };
}

function readHeaderValue(message: string, name: string): string {
  const headers = message.split(/\n\s*\n/, 1)[0] || "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = headers.match(new RegExp(`^${escaped}:\\s*([\\s\\S]*?)(?=\\n[^\\s:]+:|\\n\\s*\\n|$)`, "im"));
  return match?.[1]?.trim() || "";
}

function unfoldHeader(value: string): string {
  return value.replace(/\n[ \t]+/g, " ").trim();
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
