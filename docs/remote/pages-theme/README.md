# Pages prototype theme

Cypher-dystopian look (near-black navy, neon cyan/white) for the GitHub Pages build. Pure CSS overlay: no app source changes.

- `theme.css` overrides the app tokens (`--bg`, `--surface`, `--accent`, ...) and restyles h1/h2, nav, buttons, inputs, cards, notices. Scanlines/vignette are static CSS gradients; no animation, `prefers-reduced-motion` disables transitions, `color-scheme: dark` always.
- `apply-theme.sh <built-out-dir>` copies `theme.css` + `fonts/` into the output and adds `<link rel="stylesheet" href="./theme.css">` to the OUTPUT `index.html` only. CSP is untouched (same-origin style/font).
- Usage: build as in `../pages-prototype.md` then `bash docs/remote/pages-theme/apply-theme.sh "$OUT"` before copying to gh-pages.

## Font
Title face: Michroma (Vernon Adams), SIL Open Font License 1.1, unmodified. The original Blade Runner logo font is not freely licensed, so this wide-extended open face is used as a close stand-in.
- Source: https://github.com/google/fonts/tree/main/ofl/michroma (raw `Michroma-Regular.ttf`, `OFL.txt`), google/fonts commit 45e3d5269e4a17d823f6d84470bc084dc5ae46f6
- Retrieved: 2026-10-21
- License text: `fonts/OFL.txt` (copied into the build next to the font)
Body text stays system-ui; mono stays the app's system mono stack.

## Contrast (WCAG 2.x, computed)
text/bg 18.82, text/surface 17.85, muted/bg 10.89, muted/surface 10.33, accent/bg 12.95, primary button text/accent 12.41, danger/error-bg 7.26, ok/ok-bg 12.09, placeholder/input 7.96. Non-text: border/bg 3.53, focus ring (white 3px + cyan halo)/bg 19.92.
