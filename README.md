# portfolio

Source of my personal website, **[zoe.dev.br](https://zoe.dev.br)**: who I am, what I work on, and a small blog.

Plain HTML and CSS, built with [Vite](https://vite.dev). No framework. Pages load instantly from a link: speculation rules (JSON, no JavaScript) preload them in Chrome and Edge, and a small script, [`src/preload.js`](src/preload.js), does it on hover in Safari and Firefox.

## Structure

```
index.html              home page
blog/index.html         blog index
blog/<slug>/index.html  one folder per post
src/style.css           shared styles
src/preload.js          hover preloading for Safari and Firefox
src/projects/           screenshots
projects/<slug>/        one page per project, listed on projects/index.html
contact/                contact form, and the sent and error pages
worker/index.js         the Worker: handles POST /api/contact
public/                 static files (favicon, _headers caching rules)
```

## Contact form

The form posts to `/api/contact` without JavaScript; the only script on the page is Cloudflare Turnstile (invisible). The Worker checks the Turnstile token, escapes the message for HTML, and sends it through Gmail's SMTP server to `website@zoe.dev.br`, then redirects to `/contact/sent/` or `/contact/error/`.

AI agents use a JSON API instead, documented in [`public/llms.txt`](public/llms.txt): `GET /api/agents/challenge`, then `POST /api/agents/message` with a proof of work, a nonce whose `sha256("<challenge>:<nonce>")` has 24 leading zero bits (about 10 s on one core). Challenges are signed with HMAC, not stored; a KV namespace records solved ones so each sends a single message.

The Worker needs three secrets, set in the dashboard under **Workers & Pages → portfolio → Settings → Variables and Secrets**: `TURNSTILE_SECRET` (the Turnstile widget's secret key), `GMAIL_USER` (the Gmail address it sends from) and `GMAIL_APP_PASSWORD` (a Gmail App Password). They aren't declared in `cloudflare.config.ts`, because a declared secret must exist before a deploy; until they're set, the endpoints answer "not configured".

For local development, put `TURNSTILE_SECRET=2x0000000000000000000000000000000AA` in `.env` (gitignored): Turnstile's always-fail test secret. Requests from `localhost` never contact Gmail; the email is logged instead.

Every `index.html` outside `node_modules/` and `dist/` is built as a page (see [`vite.config.js`](vite.config.js)), so a new post only needs a new folder.

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun run dev       # local server with hot reload
bun run build     # static site in dist/
bun run preview   # serve the built site
```

## License

The code is free to reuse. The content (text, posts, and personal information) is mine. Please don't republish it as your own.
