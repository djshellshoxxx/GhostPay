# Native browser qualification ownership

Coordinator: `5ceb6203640a-root`.
Branch: `qualify/ghostpay-native-browsers-20261121-5ceb`.
Base: `bd024ca06cd3f55afcf0a4ba543f963eb6b0499b` (owned recovery/privacy candidate).

Owned paths: new `apps/web/playwright.native.config.ts`, new `.github/workflows/native-browser-qualification.yml`, the additive configuration include in `apps/web/tsconfig.json`, this claim, new `docs/handoffs/NATIVE_BROWSER_QUALIFICATION_20261121_5CEB.md`, and an additive entry in `docs/ai/ACTIVE_WORK.md`. The existing application worker owns application source; this task will not rewrite it. Existing browser configuration and Chromium gates remain unchanged.

Acceptance: run the portable existing browser journeys in actual pinned Playwright Firefox and WebKit engines on GitHub-hosted runners, for full and lean builds; preserve assertions, retain actual results/artifacts and identify Chromium-only fixtures separately. Validate project discovery locally. Native launch, browser crashes, hardware permission prompts, real devices and Tor route acceptance must not be claimed from discovery or viewport emulation.

Git history contained no prior version of the two new source/configuration paths at claim time. The current generation-11 integration lock remains held by `994a0d214fb9-root-r3`; root does not own main or existing integration refs. Only this exclusively owned isolated branch may be published. No shared merge, deployment or release is authorized by this claim.
