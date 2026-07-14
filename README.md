# Hebrew RTL Fix for Claude.ai

A Chrome extension (Manifest V3) that fixes Hebrew right-to-left text rendering on [claude.ai](https://claude.ai). Hebrew paragraphs get proper RTL direction, English paragraphs are left alone, and the message composer flips direction automatically as you type.

No build step, no dependencies — three files loaded straight into Chrome.

> [!IMPORTANT]
> **Disclaimer:** This is an independent, third-party open-source project. It is **not affiliated with, endorsed by, sponsored by, or supported by Anthropic, PBC**. "Claude" and "Claude.ai" are trademarks of Anthropic, PBC, and are used here solely to describe the website this extension applies to (nominative use). This project is provided "as is", without warranty of any kind; use it at your own risk.

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer Mode** (top-right toggle)
4. Click **Load unpacked** and select this directory

If for some reason you decide to edit `content.js`, `styles.css`, or `manifest.json`, click the reload icon on the extension card — no delete extension function needed.

## How it works

The extension is **selector-agnostic**: it never targets Claude.ai-specific class names or test IDs, so it survives DOM changes on the site. Instead of forcing `direction`/`text-align` styles on coarse containers, it cooperates with the browser's Unicode BiDi algorithm by setting the `dir` attribute per paragraph.

- **Detection** — word predominance, not raw character count. Text is split on whitespace; tokens with an RTL character count as RTL words, tokens with Latin/Cyrillic/Greek characters as LTR words. RTL wins ties, so a Hebrew sentence embedding an English term ("מה LangGraph מוסיפה") goes RTL, while an English paragraph mentioning one Hebrew word stays LTR.
- **Applying direction** — paragraphs (`p, li, blockquote, h1–h6, td, th`) that are predominantly RTL get `dir="rtl"`. Non-RTL paragraphs are never touched — the extension never stamps `dir="ltr"` on the page. Code blocks and navigation chrome are skipped entirely.
- **Composer** — inputs get `dir="auto"` plus `unicode-bidi: plaintext`, giving per-line direction while typing multi-paragraph messages.
- **Streaming & SPA navigation** — a single debounced `MutationObserver` re-scans only mutated subtrees as responses stream in, with a text-length cache to skip unchanged paragraphs. URL changes trigger a delayed full rescan so new conversations render correctly.

Supported RTL scripts: Hebrew (incl. Presentation Forms), Arabic, and Syriac.

## Configuration

Tunables live in the `rtl_settings` block of [manifest.json](manifest.json):

| Key | Default | Purpose |
|-----|---------|---------|
| `paragraph_selector` | `p, li, blockquote, h1–h6, td, th` | Which elements get per-paragraph direction |
| `skip_selector` | `nav, aside, header, pre, code`, editables | Elements never touched |
| `input_selector` | `[contenteditable="true"], textarea` | Composer elements set to `dir="auto"` |
| `debounce_ms` | `80` | Mutation flush debounce (prevents flicker mid-word while streaming) |
| `spa_rescan_delay_ms` | `600` | Delay before full rescan after SPA navigation |

Edit a knob, then reload the extension in `chrome://extensions`. Deleting a key falls back to the same default in `content.js`.

## Files

- [manifest.json](manifest.json) — extension declaration + `rtl_settings` tunables
- [content.js](content.js) — per-paragraph direction detection and the mutation observer
- [styles.css](styles.css) — static rules: code blocks forced LTR, composer set to `unicode-bidi: plaintext`
