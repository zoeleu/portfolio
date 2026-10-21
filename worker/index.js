// The site's Worker. Static files are served before this runs; it only sees
// requests no file matches, which is how POST /api/contact reaches it.

import { connect } from "cloudflare:sockets";

const RECIPIENT = "website@zoe.dev.br";
const ALLOWED_HOSTNAMES = ["zoe.dev.br", "www.zoe.dev.br"];
const LIMITS = { name: 100, subject: 150, message: 5000 };

// Proof of work for AI agents: 24 leading zero bits is about 16.8 million
// SHA-256 hashes on average, roughly 10 s on one core. Cheap for one message,
// costly for thousands. Each extra bit doubles the work.
const POW = { difficulty: 24, ttlSeconds: 600, maxNonceLength: 64 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = {
      "/api/contact": ["POST", () => handleContact(request, env, url)],
      "/api/agents/challenge": ["GET", () => (env.TURNSTILE_SECRET ? issueChallenge(env, url) : notConfigured())],
      "/api/agents/message": ["POST", () => (env.TURNSTILE_SECRET ? handleAgentMessage(request, env, url) : notConfigured())],
    }[url.pathname];
    if (route) {
      const [method, handle] = route;
      if (request.method !== method) {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: method } });
      }
      return handle();
    }
    return env.ASSETS.fetch(request);
  },
};

// On localhost, log the email instead of contacting Gmail, so local tests never
// log in anywhere. Keyed on the request's host, not on a variable that could
// go missing.
async function deliver(env, mail, url) {
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    console.log("localhost, not sent:\n" + mail);
    return;
  }
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) throw new Error("GMAIL_USER or GMAIL_APP_PASSWORD is not set");
  await sendMail(env, mail);
}

const notConfigured = () =>
  json(503, { error: "not_configured", detail: "Messages are not set up yet. Try again later, or email zoe@zoe.dev.br." });

async function handleContact(request, env, url) {
  const redirect = (page) => Response.redirect(new URL(`/contact/${page}/`, url), 303);
  try {
    const form = await request.formData();
    const field = (key) => String(form.get(key) ?? "").trim();
    const name = field("name").slice(0, LIMITS.name);
    const subject = field("subject").slice(0, LIMITS.subject);
    const message = field("message").slice(0, LIMITS.message);
    if (!name || !message) return redirect("error");

    if (!env.TURNSTILE_SECRET) throw new Error("TURNSTILE_SECRET is not set");
    const ip = request.headers.get("CF-Connecting-IP") ?? undefined;
    if (!(await turnstilePassed(field("cf-turnstile-response"), ip, env))) return redirect("error");

    await deliver(env, buildMessage({ from: env.GMAIL_USER, name, subject, message }), url);
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

// --- Messages from AI agents, gated by proof of work ----------------------
//
// GET  /api/agents/challenge  -> { challenge, difficulty, token, ... }
// POST /api/agents/message    <- { token, nonce, name, subject?, message }
//
// The agent finds a nonce where sha256("<challenge>:<nonce>") starts with
// `difficulty` zero bits. Challenges are signed, not stored, so handing them
// out costs nothing; only a solved one is written to KV, to stop replays.

const json = (status, body) =>
  new Response(JSON.stringify(body, null, 2) + "\n", {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64url = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// A key of its own, derived from the Turnstile secret with a fixed label.
async function powKey(env) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.TURNSTILE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = await crypto.subtle.sign("HMAC", base, new TextEncoder().encode("zoe.dev.br agent pow v1"));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function leadingZeroBits(bytes) {
  let bits = 0;
  for (const byte of new Uint8Array(bytes)) {
    if (byte === 0) { bits += 8; continue; }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

async function issueChallenge(env, url) {
  const challenge = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const expires = Date.now() + POW.ttlSeconds * 1000;
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ c: challenge, d: POW.difficulty, e: expires })));
  const signature = await crypto.subtle.sign("HMAC", await powKey(env), new TextEncoder().encode(payload));
  return json(200, {
    challenge,
    difficulty: POW.difficulty,
    algorithm: "sha256",
    input: `${challenge}:<nonce>`,
    rule: `Find a nonce (any string up to ${POW.maxNonceLength} characters, usually a counter) where sha256 of the UTF-8 input has at least ${POW.difficulty} leading zero bits.`,
    expires_at: new Date(expires).toISOString(),
    token: `${payload}.${base64url(signature)}`,
    submit: { method: "POST", url: new URL("/api/agents/message", url).href, body: { token: "<token>", nonce: "<nonce>", name: "<who you are>", subject: "<optional>", message: "<text>" } },
    docs: new URL("/llms.txt", url).href,
  });
}

async function handleAgentMessage(request, env, url) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json", detail: "Send a JSON object: { token, nonce, name, subject?, message }." });
  }
  const text = (key) => (typeof body?.[key] === "string" ? body[key].trim() : "");

  // The challenge: signed by us and not expired.
  const [payload, signature] = text("token").split(".");
  let challenge;
  try {
    const valid = await crypto.subtle.verify("HMAC", await powKey(env), fromBase64url(signature), new TextEncoder().encode(payload));
    if (!valid) throw new Error("bad signature");
    challenge = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
  } catch {
    return json(401, { error: "invalid_token", detail: "Get a fresh challenge from GET /api/agents/challenge." });
  }
  if (Date.now() > challenge.e) return json(410, { error: "challenge_expired", detail: "Challenges last 10 minutes. Get a fresh one." });

  // The work.
  const nonce = typeof body?.nonce === "number" ? String(body.nonce) : text("nonce");
  if (!nonce || nonce.length > POW.maxNonceLength) {
    return json(400, { error: "invalid_nonce", detail: `nonce must be a non-empty string or number, at most ${POW.maxNonceLength} characters.` });
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${challenge.c}:${nonce}`));
  const zeros = leadingZeroBits(digest);
  if (zeros < challenge.d) {
    return json(422, { error: "insufficient_work", detail: `sha256("${challenge.c}:${nonce}") = ${toHex(digest)} has ${zeros} leading zero bits; ${challenge.d} needed.` });
  }

  // The message.
  const name = text("name"), subject = text("subject"), message = text("message");
  if (!name || !message) return json(400, { error: "missing_fields", detail: "name and message are required; subject is optional." });
  if (name.length > LIMITS.name || subject.length > LIMITS.subject || message.length > LIMITS.message) {
    return json(400, { error: "too_long", detail: `Limits: name ${LIMITS.name}, subject ${LIMITS.subject}, message ${LIMITS.message} characters.` });
  }

  // One message per solved challenge.
  const usedKey = `used:${challenge.c}`;
  if (await env.POW_USED.get(usedKey)) return json(409, { error: "challenge_used", detail: "This challenge already sent a message. Get a fresh one." });
  await env.POW_USED.put(usedKey, "1", { expirationTtl: Math.max(60, Math.ceil((challenge.e - Date.now()) / 1000) + 60) });

  try {
    await deliver(env, buildMessage({ from: env.GMAIL_USER, name: `${name} (AI agent)`, subject, message }), url);
  } catch (error) {
    console.error("agent message failed:", error);
    await env.POW_USED.delete(usedKey); // the work was valid; let the agent retry with it
    return json(502, { error: "send_failed", detail: "The message could not be sent. Retry with the same token and nonce." });
  }
  return json(202, { status: "sent", detail: "Thanks. Zoe will read it." });
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
