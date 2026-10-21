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

It needs three secrets on the `portfolio` Worker:

```bash
npx wrangler secret put TURNSTILE_SECRET --name portfolio     # Turnstile widget's secret key
npx wrangler secret put GMAIL_USER --name portfolio           # the Gmail address it sends from
npx wrangler secret put GMAIL_APP_PASSWORD --name portfolio   # a Gmail App Password
```

For local development, put the same names in `.dev.vars` (gitignored). Turnstile's test secret `2x0000000000000000000000000000000AA` always fails, which is handy for checking the error path without sending mail.

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
