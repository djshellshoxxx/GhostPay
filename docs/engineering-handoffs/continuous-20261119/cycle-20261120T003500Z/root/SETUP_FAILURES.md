# Environment failures and corrections

These were setup failures, not failing product regressions. They are retained so
successful later execution does not conceal the initial limitations.

1. A direct `npm` shell wrapper with the separately installed Node path initially
   looked for `node/bin/node_modules/npm/bin/npm-prefix.js` and failed with
   `MODULE_NOT_FOUND`. Invoking the pinned npm JavaScript entry installed the
   unchanged lockfile successfully, offline, with scripts disabled.
2. The first direct workspace build lacked `npm` in PATH and reported
   `spawnSync npm ENOENT`. Invoking the build through npm progressed until a nested
   package script reported `npm: not found`. Local tool symlinks for the installed
   Node/npm/npx resolved both paths. No repository script or dependency was changed.
3. A focused web test started before its compiled workspace prerequisites existed
   and failed to resolve `@ghostpay/chain-adapters` from the original Vite config.
   After prerequisite builds it ran the real tests and produced the recorded
   behavioral RED/GREEN. This startup failure is not counted as a regression.
4. Git push returned `could not read Username for 'https://github.com': terminal
   prompts disabled`. Connected GitHub writes were already authorized and used
   expected-head/non-force updates. No credentials were inspected or requested.

The first three raw setup logs were overwritten by the corrected invocations;
the exact decisive messages above were observed in tool output. Later complete
build/install logs and both complete browser-startup failure logs are preserved
separately. The installed-browser attempt ended at an explicit socket permission
failure; no alternate execution route or escalation was attempted afterward.
