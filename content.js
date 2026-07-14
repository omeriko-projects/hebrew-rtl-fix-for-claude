// Per-paragraph BiDi detection for Hebrew/English mixed content on claude.ai.
// Cooperates with the Unicode BiDi algorithm via `dir` attribute instead of
// forcing direction with inline styles on coarse block ancestors.
//
// Tunables live in manifest.json under "rtl_settings" (read via
// chrome.runtime.getManifest()); DEFAULTS below is the fallback.

const DEFAULTS = {
  paragraph_selector: 'p, li, blockquote, h1, h2, h3, h4, h5, h6, td, th',
  skip_selector: 'nav, aside, header, pre, code, [contenteditable="true"], textarea',
  input_selector: '[contenteditable="true"], textarea',
  debounce_ms: 80,
  spa_rescan_delay_ms: 600,
};

const CONFIG = {
  ...DEFAULTS,
  ...(globalThis.chrome?.runtime?.getManifest?.().rtl_settings || {}),
};

const RTL_CHAR = /[֐-׿؀-ۿ܀-ݏݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/;
const LTR_CHAR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

// Marks paragraphs this extension flipped to RTL; doubles as a length cache
// so unchanged text is skipped without re-running detection.
const LEN_ATTR = 'data-bidi-len';

// Word predominance, not raw character count: a Hebrew sentence embedding an
// English term ("מה LangGraph מוסיפה") goes RTL, while an English paragraph
// mentioning one Hebrew word stays LTR. Ties break RTL — typing Hebrew at all
// is deliberate.
function isPredominantlyRtl(text) {
  let rtl = 0, ltr = 0;
  for (const token of text.split(/\s+/)) {
    if (RTL_CHAR.test(token)) rtl++;
    else if (LTR_CHAR.test(token)) ltr++;
  }
  return rtl > 0 && rtl >= ltr;
}

function applyDir(el) {
  const text = el.textContent || '';
  if (isPredominantlyRtl(text)) {
    if (el.getAttribute('dir') !== 'rtl') el.setAttribute('dir', 'rtl');
    el.setAttribute(LEN_ATTR, String(text.length));
  } else if (el.hasAttribute(LEN_ATTR)) {
    // Only undo direction we set ourselves; never touch other dir attributes.
    el.removeAttribute('dir');
    el.removeAttribute(LEN_ATTR);
  }
}

function processParagraph(el) {
  if (el.closest(CONFIG.skip_selector)) return;
  const lastLen = el.getAttribute(LEN_ATTR);
  if (lastLen !== null && Number(lastLen) === (el.textContent || '').length) return;
  applyDir(el);
}

function ensureAutoDir(el) {
  // dir="auto" lets the browser flip the composer per-keystroke.
  if (el.getAttribute('dir') !== 'auto') el.setAttribute('dir', 'auto');
}

// Re-checks only the given subtree plus the paragraph containing it, so
// streaming-token mutations don't trigger whole-page rescans.
function scanRoot(root) {
  if (root && root.nodeType !== Node.ELEMENT_NODE) root = root.parentElement;
  if (!root || !root.isConnected) return;

  const container = root.closest(CONFIG.paragraph_selector);
  if (container) processParagraph(container);
  for (const el of root.querySelectorAll(CONFIG.paragraph_selector)) processParagraph(el);

  if (root.matches(CONFIG.input_selector)) ensureAutoDir(root);
  for (const el of root.querySelectorAll(CONFIG.input_selector)) ensureAutoDir(el);
}

function scanAll() {
  scanRoot(document.body);
}

// ~80ms debounce — without this, direction flickers mid-word as tokens stream
// in. Mutated roots accumulate in `pending`; past PENDING_CAP a full scan is
// cheaper than tracking them individually.
const PENDING_CAP = 300;
const pending = new Set();
let fullScan = false;
let scanTimer = null;

function scheduleFlush() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(flush, CONFIG.debounce_ms);
}

function flush() {
  scanTimer = null;
  if (fullScan || pending.size > PENDING_CAP) {
    pending.clear();
    fullScan = false;
    scanAll();
    return;
  }
  const roots = [...pending];
  pending.clear();
  for (const root of roots) scanRoot(root);
}

let lastUrl = location.href;

new MutationObserver((mutations) => {
  // SPA navigation: claude.ai swaps conversation content without a full
  // reload. Delay lets React finish rendering the new conversation.
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(() => {
      fullScan = true;
      scheduleFlush();
    }, CONFIG.spa_rescan_delay_ms);
  }

  if (!fullScan) {
    for (const m of mutations) {
      pending.add(m.target); // covers characterData edits and child removals
      for (const n of m.addedNodes) {
        if (n.nodeType === Node.ELEMENT_NODE) pending.add(n);
      }
      if (pending.size > PENDING_CAP) {
        fullScan = true;
        break;
      }
    }
  }
  scheduleFlush();
}).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

scanAll();
