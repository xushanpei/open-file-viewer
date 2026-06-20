import { afterEach, describe, expect, it, vi } from "vitest";
import { createViewer } from "../viewer";
import { emailPlugin } from "./email";

const parseEmail = vi.hoisted(() =>
  vi.fn(async () => ({
    from: { name: "Alice", address: "alice@example.com" },
    to: [{ name: "Bob", address: "bob@example.com" }],
    subject: "Hello",
    date: "2026-06-13",
    text: "Plain body",
    attachments: [
      {
        filename: "note.txt",
        mimeType: "text/plain",
        content: new Uint8Array([104, 105])
      }
    ]
  }))
);

const getFileData = vi.hoisted(() => vi.fn());
const getAttachment = vi.hoisted(() => vi.fn());

vi.mock("postal-mime", () => ({
  default: class {
    parse = parseEmail;
  }
}));

vi.mock("@kenjiuno/msgreader", () => ({
  default: class {
    getFileData = getFileData;
    getAttachment = getAttachment;
  }
}));

describe("emailPlugin", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it("renders EML metadata, body, attachments, and revokes URLs", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Alice", address: "alice@example.com" },
      to: [{ name: "Bob", address: "bob@example.com" }],
      subject: "Hello",
      date: "2026-06-13",
      text: "Plain body",
      attachments: [
        {
          filename: "note.txt",
          mimeType: "text/plain",
          content: new Uint8Array([104, 105])
        }
      ]
    });

    const container = document.createElement("div");
    document.body.append(container);
    let counter = 0;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => `blob:email-${counter++}`),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["raw email"], { type: "message/rfc822" }),
      fileName: "message.eml",
      plugins: [emailPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-email")));

    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("Alice <alice@example.com>");
    expect(container.textContent).toContain("Plain body");
    expect(container.querySelector(".ofv-email-attachment-item")?.textContent).toContain("note.txt");
    expect(container.querySelector(".ofv-email-attachment-item")?.getAttribute("rel")).toBe("noopener noreferrer");

    viewer.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:email-0");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:email-1");
  });

  it("supports shared toolbar zoom for plain email bodies", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Alice", address: "alice@example.com" },
      to: [{ name: "Bob", address: "bob@example.com" }],
      subject: "Plain",
      date: "2026-06-13",
      text: "Plain body",
      attachments: []
    });

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["raw email"], { type: "message/rfc822" }),
      fileName: "plain.eml",
      plugins: [emailPlugin()],
      toolbar: true
    });

    const panel = await waitFor(() => container.querySelector<HTMLElement>(".ofv-email"));
    const zoomIn = await waitFor(() => {
      const button = findToolbarButton(container, "Zoom in");
      return button && !button.disabled ? button : false;
    });
    const rotate = await waitFor(() => findToolbarButton(container, "Rotate right"));

    expect(zoomIn.disabled).toBe(false);
    expect(rotate.disabled).toBe(true);

    zoomIn.click();
    await waitFor(() => panel.style.getPropertyValue("--ofv-email-zoom") === "1.15");
  });

  it("clears email iframe resize timers on destroy", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Alice", address: "alice@example.com" },
      to: [{ name: "Bob", address: "bob@example.com" }],
      subject: "HTML",
      date: "2026-06-13",
      html: "<p>Hello HTML</p>",
      attachments: []
    } as any);

    const container = document.createElement("div");
    document.body.append(container);
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");
    vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (typeof handler === "function") {
        handler();
      }
      return timeout === 300 ? 300 : 1000;
    }) as typeof window.setTimeout);

    const viewer = createViewer({
      container,
      file: new Blob(["raw email"], { type: "message/rfc822" }),
      fileName: "message.eml",
      plugins: [emailPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-email-body-iframe")));
    expect(container.querySelector(".ofv-email-body-iframe")?.getAttribute("sandbox")).toBe(
      "allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    );

    viewer.destroy();

    expect(clearTimeoutSpy).toHaveBeenCalledWith(300);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(1000);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
  });

  it("writes HTML email bodies immediately even if iframe load is missed", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Invoice", address: "invoice@example.com" },
      to: [{ name: "Customer", address: "customer@example.com" }],
      subject: "电子发票",
      date: "2026-06-18",
      html: "<div><p>尊敬的用户：</p><p>请下载附件，查收您的电子发票。</p></div>",
      attachments: []
    } as any);

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["raw email"], { type: "message/rfc822" }),
      fileName: "invoice.eml",
      plugins: [emailPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-email-body-iframe")));

    const iframe = container.querySelector<HTMLIFrameElement>(".ofv-email-body-iframe");
    await waitFor(() => iframe?.contentDocument?.body?.textContent?.includes("请下载附件") === true);

    expect(iframe?.contentDocument?.body?.textContent).toContain("尊敬的用户");
    expect(iframe?.contentDocument?.body?.textContent).toContain("电子发票");

    viewer.destroy();
  });

  it("supports shared toolbar zoom for HTML email bodies", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Invoice", address: "invoice@example.com" },
      to: [{ name: "Customer", address: "customer@example.com" }],
      subject: "HTML zoom",
      date: "2026-06-18",
      html: "<p>Zoomable HTML</p>",
      attachments: []
    } as any);

    const container = document.createElement("div");
    document.body.append(container);

    createViewer({
      container,
      file: new Blob(["raw email"], { type: "message/rfc822" }),
      fileName: "html.eml",
      plugins: [emailPlugin()],
      toolbar: true
    });

    const iframe = await waitFor(() => container.querySelector<HTMLIFrameElement>(".ofv-email-body-iframe"));
    await waitFor(() => iframe.contentDocument?.body?.textContent?.includes("Zoomable HTML") === true);
    const zoomIn = await waitFor(() => {
      const button = findToolbarButton(container, "Zoom in");
      return button && !button.disabled ? button : false;
    });

    zoomIn.click();
    await waitFor(() => iframe.contentDocument?.body?.style.fontSize === "16.1px");
  });

  it("sanitizes HTML email bodies and secures external links", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Alice", address: "alice@example.com" },
      to: [{ name: "Bob", address: "bob@example.com" }],
      subject: "HTML",
      date: "2026-06-13",
      html:
        '<p onclick="alert(1)">Hello</p><script>alert(1)</script><a href="https://example.com">Link</a><a href="javascript:alert(1)">Bad</a><a href="mailto:help@example.com">Mail</a>',
      attachments: []
    } as any);

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["raw email"], { type: "message/rfc822" }),
      fileName: "message.eml",
      plugins: [emailPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-email-body-iframe")));
    const iframe = container.querySelector<HTMLIFrameElement>(".ofv-email-body-iframe");
    iframe?.dispatchEvent(new Event("load"));

    await waitFor(() => Boolean(iframe?.contentDocument?.body));

    const body = iframe?.contentDocument?.body;
    const paragraph = body?.querySelector("p");
    const links = Array.from(body?.querySelectorAll("a") || []);
    expect(body?.querySelector("script")).toBeNull();
    expect(paragraph?.getAttribute("onclick")).toBeNull();
    expect(paragraph?.textContent).toBe("Hello");
    expect(links[0].target).toBe("_blank");
    expect(links[0].rel).toBe("noopener noreferrer");
    expect(links[1].getAttribute("href")).toBeNull();
    expect(links[2].getAttribute("href")).toBe("mailto:help@example.com");

    viewer.destroy();
  });

  it("keeps sanitized inline cid images as blob URLs while removing unsafe links", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Alice", address: "alice@example.com" },
      to: [{ name: "Bob", address: "bob@example.com" }],
      subject: "Inline image",
      date: "2026-06-13",
      html:
        '<p>Logo</p><img src="cid:logo@example" onerror="alert(1)"><img src="javascript:alert(1)"><a href="cid:logo@example">cid link</a>',
      attachments: [
        {
          filename: "logo.png",
          mimeType: "image/png",
          contentId: "logo@example",
          content: new Uint8Array([1, 2, 3])
        }
      ]
    } as any);

    const container = document.createElement("div");
    document.body.append(container);
    let counter = 0;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => `blob:inline-${counter++}`),
      revokeObjectURL: vi.fn()
    });

    const viewer = createViewer({
      container,
      file: new Blob(["raw email"], { type: "message/rfc822" }),
      fileName: "message.eml",
      plugins: [emailPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-email-body-iframe")));
    const iframe = container.querySelector<HTMLIFrameElement>(".ofv-email-body-iframe");
    iframe?.dispatchEvent(new Event("load"));

    await waitFor(() => Boolean(iframe?.contentDocument?.body?.querySelector("img")));

    const body = iframe?.contentDocument?.body;
    const images = Array.from(body?.querySelectorAll("img") || []);
    const link = body?.querySelector("a");
    expect(images[0].getAttribute("src")).toBe("blob:inline-1");
    expect(images[0].getAttribute("onerror")).toBeNull();
    expect(images[1].getAttribute("src")).toBeNull();
    expect(link?.getAttribute("href")).toBeNull();

    viewer.destroy();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:inline-0");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:inline-1");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("keeps MSG attachment MIME tags instead of relying only on filenames", async () => {
    getFileData.mockReturnValueOnce({
      senderName: "Alice",
      senderEmail: "alice@example.com",
      recipients: [{ recipType: "to", name: "Bob", email: "bob@example.com" }],
      subject: "MSG",
      body: "Body",
      attachments: [
        {
          fileName: "photo.bin",
          attachMimeTag: "image/png; name=photo.bin",
          pidContentId: "photo"
        }
      ]
    });
    getAttachment.mockReturnValueOnce({
      fileName: "photo.bin",
      content: new Uint8Array([1, 2, 3])
    });

    const createdBlobs: Blob[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => {
        createdBlobs.push(blob);
        return `blob:msg-${createdBlobs.length}`;
      }),
      revokeObjectURL: vi.fn()
    });

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob(["raw msg"], { type: "application/vnd.ms-outlook" }),
      fileName: "message.msg",
      plugins: [emailPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-email-attachment-item")));

    expect(container.textContent).toContain("MSG");
    expect(container.querySelector(".ofv-email-attachment-item")?.textContent).toContain("photo.bin");
    expect(createdBlobs[1].type).toBe("image/png");

    viewer.destroy();
  });

  it("renders MBOX mailbox summary while previewing the first message", async () => {
    parseEmail.mockResolvedValueOnce({
      from: { name: "Alice", address: "alice@example.com" },
      to: [{ name: "Bob", address: "bob@example.com" }],
      subject: "First",
      date: "Mon, 15 Jun 2026 10:00:00 +0000",
      text: "First body",
      attachments: []
    });
    const mbox = [
      "From alice@example.com Mon Jun 15 10:00:00 2026",
      "Subject: First",
      "From: Alice <alice@example.com>",
      "Date: Mon, 15 Jun 2026 10:00:00 +0000",
      "",
      "First body",
      "From carol@example.com Mon Jun 15 11:00:00 2026",
      "Subject: Second",
      "From: Carol <carol@example.com>",
      "Date: Mon, 15 Jun 2026 11:00:00 +0000",
      "",
      "Second body"
    ].join("\n");

    const container = document.createElement("div");
    document.body.append(container);

    const viewer = createViewer({
      container,
      file: new Blob([mbox], { type: "application/mbox" }),
      fileName: "archive.mbox",
      plugins: [emailPlugin()]
    });

    await waitFor(() => Boolean(container.querySelector(".ofv-email-mbox-table")));

    expect(parseEmail).toHaveBeenCalledWith(expect.stringContaining("Subject: First"));
    expect(parseEmail).toHaveBeenCalledWith(expect.not.stringContaining("Subject: Second"));
    expect(container.textContent).toContain("MBOX 邮箱摘要");
    expect(container.textContent).toContain("邮件数2");
    expect(container.textContent).toContain("当前正文显示第一封邮件");
    expect(container.textContent).toContain("First");
    expect(container.textContent).toContain("Second");
    expect(container.textContent).toContain("Carol <carol@example.com>");
    expect(container.textContent).toContain("First body");

    viewer.destroy();
  });
});

async function waitFor<T>(predicate: () => T | false | null | undefined, timeout = 1000): Promise<T> {
  const start = Date.now();
  let result = predicate();
  while (!result) {
    if (Date.now() - start > timeout) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    result = predicate();
  }
  return result;
}

function findToolbarButton(container: HTMLElement, title: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".ofv-toolbar button")).find(
    (button) => button.getAttribute("aria-label") === title
  );
}
