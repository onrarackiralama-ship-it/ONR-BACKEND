// src/utils/triggerRebuild.js
//
// Fires a Vercel Deploy Hook to rebuild the STATIC frontend after admin content
// changes (cars / blogs / transfers). The public site is statically generated,
// so a DB change isn't visible until the site is rebuilt — this closes that gap.
//
// - No-op unless VERCEL_DEPLOY_HOOK_URL is set (so local/dev never deploys).
// - Debounced: a burst of edits (saving several fields, bulk changes) coalesces
//   into ONE rebuild instead of one deploy per request.
const axios = require("axios");

const DEBOUNCE_MS = Number(process.env.REBUILD_DEBOUNCE_MS || 15000);
let timer = null;

function fire() {
  const url = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!url) return;
  axios
    .post(url)
    .then((r) => console.log(`[rebuild] Vercel deploy hook fired -> ${r.status}`))
    .catch((e) => console.warn("[rebuild] deploy hook failed:", e.message));
}

/** Queue a frontend rebuild (debounced). Safe no-op when the hook isn't configured. */
function triggerRebuild() {
  if (!process.env.VERCEL_DEPLOY_HOOK_URL) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    fire();
  }, DEBOUNCE_MS);
}

module.exports = { triggerRebuild };
