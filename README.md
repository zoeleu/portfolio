# portfolio

Source of my personal website, **[zoe.dev.br](https://zoe.dev.br)**: who I am, what I work on, and a small blog.

Plain HTML and CSS, built with [Vite](https://vite.dev). No framework and no client-side JavaScript.

## Structure

```
index.html              home page
blog/index.html         blog index
blog/<slug>/index.html  one folder per post
src/style.css           shared styles
public/                 static files (favicon)
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
