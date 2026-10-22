# @ghostpay/ux-flow

Pure logic (no DOM, network, storage, globals-as-clock). See docs/remote/usability/specs/{pay-reconcile,policy-undo,embed-snippet,embed-return}.md.

- `proof.ts`, `reconcile.ts`: payer proof codec, invoice state machine, heuristic matching, proof confirmation (bigint amounts, tolerance).
- `undo.ts`: `UndoQueue`, injected-clock undo window for pending policy changes; never undoes executed effects.
- `embed.ts`: `validateEmbedLink`, `makeSnippet`, `escapeAttr` (same-origin, CSP-friendly, no third-party scripts).
- `ret.ts`: return-origin allowlist, fragment-only return URL, offline proof check, signed-state check via caller verifier.

Verify: `npm run typecheck && npm run lint && npm test`.
