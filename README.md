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
public/                 static files (favicon, _headers caching rules)
```

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
