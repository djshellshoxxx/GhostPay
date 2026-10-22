# Wiring: @ghostpay/plugin-api

No change to `apps/` was made. Plan for `apps/web` (and optionally the relayer):

1. **Bundle plugins statically.** Plugins are npm packages or in-repo modules
   imported at build time and reviewed like any dependency (pinned, lockfile,
   supply-chain checks in `docs/remote/security-specs/supply-chain.md`). Never load
   plugin code from a URL, `eval`, `new Function`, or `import()` of a user-supplied
   string. CSP should keep `script-src` without `unsafe-eval`.
2. **Create one registry at startup** with GhostPay defaults
   (`{ delaySeconds, relay, batchSize }` from the current privacy policy),
   register plugins, then `seal()`.
3. **Permissions UI.** Before registering, show the manifest's requested
   `network` hosts, `storage`, and `downgrade` to the merchant. Pass only what they
   approve as the grant. Persist grants per plugin id + version; a version bump
   that requests more must re-prompt.
4. **Ports.** Provide a `NetworkPort` only if at least one plugin has a network
   grant; route it through the same privacy transport as the app (Tor/relay
   settings) so plugin traffic does not bypass network privacy. Provide a
   `StoragePort` backed by app storage (IndexedDB) under a dedicated prefix.
5. **Invoice creation.** Call `evaluateInvoice({ chainId, asset, amount, expiresAt })`.
   Use `effective` as the starting privacy settings. Show `options`; render every
   entry of `downgrades` with a warning badge, the plugin name and the
   `downgradeReason` as plain text (never HTML). Show `failures` as "plugin X did not
   respond" without detail.
6. **Selection.** Call `applyPrivacySelection` with selected keys and only the
   downgrade keys the user confirmed in a separate confirmation step. Log
   `appliedDowngrades` in the merchant's local audit log.
7. **Hard isolation (recommended before third-party plugins).** This package gives
   capability discipline, not memory isolation. Run untrusted plugins in a
   dedicated Web Worker or sandboxed iframe (no `allow-same-origin`) with a
   message-passing shim that calls the hooks, and block `fetch` there via CSP
   `connect-src` limited to the granted hosts.
