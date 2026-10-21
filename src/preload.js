// Safari and Firefox don't support speculation rules, so preload same-site
// pages on hover here. Chrome and Edge skip this: the rules in each page's
// <head> already cover them. Starts only once the page has fully loaded.
if (!HTMLScriptElement.supports?.("speculationrules")) {
  const seen = new Set();

  const preload = (event) => {
    const link = event.target.closest?.('a[href^="/"]');
    if (!link || seen.has(link.href)) return;
    seen.add(link.href);
    fetch(link.href, { priority: "low" }).catch(() => {});
  };

  const start = () => {
    addEventListener("pointerover", preload, { passive: true });
    addEventListener("touchstart", preload, { passive: true });
  };

  if (document.readyState === "complete") start();
  else addEventListener("load", start, { once: true });
}
