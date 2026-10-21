// The site's Worker. Static files are served before this runs; it only sees
// requests no file matches, which is how POST /api/contact reaches it.

import { connect } from "cloudflare:sockets";

const RECIPIENT = "website@zoe.dev.br";
const ALLOWED_HOSTNAMES = ["zoe.dev.br", "www.zoe.dev.br"];
const LIMITS = { name: 100, subject: 150, message: 5000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }
      return handleContact(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, url) {
  const redirect = (page) => Response.redirect(new URL(`/contact/${page}/`, url), 303);
  try {
    const form = await request.formData();
    const field = (key) => String(form.get(key) ?? "").trim();
    const name = field("name").slice(0, LIMITS.name);
    const subject = field("subject").slice(0, LIMITS.subject);
    const message = field("message").slice(0, LIMITS.message);
    if (!name || !message) return redirect("error");

    const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
    if (!(await turnstilePassed(field("cf-turnstile-response"), ip, env))) return redirect("error");

    await sendMail(env, buildMessage({ from: env.GMAIL_USER, name, subject, message }));
    return redirect("sent");
  } catch (error) {
    console.error("contact form failed:", error);
    return redirect("error");
  }
}

async function turnstilePassed(token, ip, env) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  const result = await response.json();
  // Test keys answer with hostname "example.com", so only real tokens are held to ours.
  const hostnameOk = ALLOWED_HOSTNAMES.includes(result.hostname) || env.TURNSTILE_SECRET.startsWith("1x0000");
  return result.success === true && hostnameOk;
}

// --- The message ---------------------------------------------------------

export function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Header values must stay on one line, or a sender could add headers of their own.
export function oneLine(text) {
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function base64(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// RFC 2047: non-ASCII header text as UTF-8 "encoded words", folded so no
// header line runs past the 78-character limit.
export function encodeHeader(text) {
  const chars = Array.from(text);
  const words = [];
  for (let i = 0; i < chars.length; i += 30) words.push(`=?UTF-8?B?${base64(chars.slice(i, i + 30).join(""))}?=`);
  return words.join("\r\n ");
}

function base64Lines(text) {
  return base64(text).replace(/.{1,76}/g, "$&\r\n");
}

export function buildMessage({ from, name, subject, message }) {
  const cleanName = oneLine(name);
  const cleanSubject = oneLine(subject) || "(no subject)";
  const boundary = `contact-${crypto.randomUUID()}`;
  const html =
    `<p><strong>From:</strong> ${escapeHtml(cleanName)}</p>` +
    `<p><strong>Subject:</strong> ${escapeHtml(cleanSubject)}</p>` +
    `<hr>` +
    `<p>${escapeHtml(message).replace(/\r?\n/g, "<br>")}</p>`;
  const text = `From: ${cleanName}\nSubject: ${cleanSubject}\n\n${message}\n`;

  return [
    `From: ${encodeHeader("Website contact form")} <${from}>`,
    `To: <${RECIPIENT}>`,
    `Subject: ${encodeHeader(`[website]: ${cleanSubject} from ${cleanName}`)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@zoe.dev.br>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

// --- SMTP over TLS to Gmail ----------------------------------------------

async function sendMail(env, data) {
  const socket = connect({ hostname: "smtp.gmail.com", port: 465 }, { secureTransport: "on" });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // One reply, which may span several "250-..." lines before the final "250 ...".
  async function reply(expected) {
    for (;;) {
      const lines = buffer.split("\r\n");
      const last = lines.findIndex((line) => /^\d{3} /.test(line));
      if (last !== -1) {
        buffer = lines.slice(last + 1).join("\r\n");
        const code = Number(lines[last].slice(0, 3));
        if (code !== expected) throw new Error(`SMTP expected ${expected}, got: ${lines[last]}`);
        return;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP connection closed");
      buffer += decoder.decode(value, { stream: true });
    }
  }
  const send = (line) => writer.write(new TextEncoder().encode(`${line}\r\n`));

  try {
    await reply(220);
    await send("EHLO zoe.dev.br");
    await reply(250);
    await send(`AUTH PLAIN ${base64(`\0${env.GMAIL_USER}\0${env.GMAIL_APP_PASSWORD}`)}`);
    await reply(235);
    await send(`MAIL FROM:<${env.GMAIL_USER}>`);
    await reply(250);
    await send(`RCPT TO:<${RECIPIENT}>`);
    await reply(250);
    await send("DATA");
    await reply(354);
    // The bodies are base64 and no header starts with ".", so no dot-stuffing is needed.
    await send(`${data}\r\n.`);
    await reply(250);
    await send("QUIT");
  } finally {
    await socket.close().catch(() => {});
  }
}
