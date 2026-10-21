// PostHog analytics, kept out of the way of the page:
// - downloaded only once the page has loaded and the browser is idle, as a
//   separate file the page never waits for;
// - never started for a prerendered page until someone actually opens it;
// - skipped entirely when the browser sends Do Not Track or Global Privacy Control;
// - sent through this site (/ingest, proxied by the Worker), no cookies.
// What it collects is described on /privacy/.

const KEY = "phc_qfd5oTEHGsDyuFQ3CZrJNMLLhwbvnsXNiiSWnmfno7VH";

const optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
// Local development shouldn't add visits to the real project.
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

async function start() {
  // The build without code that downloads extra scripts at runtime.
  const { default: posthog } = await import("posthog-js/dist/module.no-external");
  posthog.init(KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    persistence: "sessionStorage", // no cookies; forgotten when the tab closes
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: { dom_event_allowlist: ["click"], element_allowlist: ["a", "button"] },
    disable_session_recording: true,
    disable_surveys: true,
    enable_heatmaps: false,
    capture_dead_clicks: false,
    capture_performance: false,
    advanced_disable_feature_flags: true,
    disable_external_dependency_loading: true,
    respect_dnt: true,
  });
}

const whenIdle = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));
const afterLoad = () => {
  if (document.readyState === "complete") whenIdle(start);
  else addEventListener("load", () => whenIdle(start), { once: true });
};

if (!optedOut && !local) {
  if (document.prerendering) document.addEventListener("prerenderingchange", afterLoad, { once: true });
  else afterLoad();
}
