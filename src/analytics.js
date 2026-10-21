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
  // The standard build: it downloads the session recorder later, only when
  // recording is on for the project, through /ingest/static like everything else.
  const { default: posthog } = await import("posthog-js");
  posthog.init(KEY, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    persistence: "sessionStorage", // no cookies; forgotten when the tab closes
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: { dom_event_allowlist: ["click"], element_allowlist: ["a", "button"] },
    // Recordings keep what is typed into fields out, like the contact form.
    session_recording: { maskAllInputs: true },
    enable_heatmaps: true,
    disable_surveys: true,
    capture_dead_clicks: false,
    capture_performance: false,
    advanced_disable_feature_flags: true,
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
