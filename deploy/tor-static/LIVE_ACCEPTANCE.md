# Live Tor Browser acceptance: preparation and source gate

Status: **not implemented, not activated, and not qualified**. Prepared against
GhostPay `c0dd03e2585089a5c1d57e9cb1f04a0fa4939023` on 2026-11-20 Pacific.

The existing `tor-static.yml` job remains an offline qualification job. Its
Chromium checks are useful application evidence but do not establish Tor Browser
behavior or live onion reachability. This document specifies the separate live
test and the concrete source-access blocker encountered while preparing it. No
live workflow or guessed browser launcher was added.

## Authorization boundary

The completion handoff requests an isolated environment with Docker, Tor and Tor
Browser, but separately requires explicit approval before deployment, workflow
dispatch or onion-address publication. The current merge authorization does not
authorize starting the proposed live service. Preparing this document performs
none of those actions.

A public-network onion acceptance run necessarily uploads a service descriptor
to the Tor network. Keeping its generated address out of logs, artifacts, PRs and
user-facing output avoids address disclosure, but does not avoid that protocol
publication. See the Tor Project's [onion-service protocol overview](https://community.torproject.org/onion-services/overview/).
The final approval must expressly cover a disposable test service, network
bootstrap and descriptor publication, as well as dispatch of the reviewed test.
It must not be described as only an offline browser check.

## Verified release metadata; artifacts not downloaded

The official desktop release observed on 2026-11-20 is **Tor Browser 16.0.1**,
released November 10. The contemporaneous 16.0.2 release is Android only.
Desktop 16.0.1 contains Firefox **153.7.0esr** and Tor **0.4.9.16**. The service
image stays separately pinned to Tor **0.4.9.17**. Report both client and service
versions accurately. Sources: [release announcement](https://blog.torproject.org/new-release-tor-browser-1601/)
and [official release directory](https://dist.torproject.org/torbrowser/16.0.1/).

| Artifact | Exact file under the official release directory | Published SHA-256 |
| --- | --- | --- |
| Linux x86-64 Tor Browser | `tor-browser-linux-x86_64-16.0.1.tar.xz` | `5b36ad610c20c81faa72caf27d1cd3a11f14a327c320b4cec581400016ba78b0` |
| Matching Linux driver | `geckodriver-linux-x86_64-16.0.1.tar.xz` | `bf39579b3623fb0fa12dabfda2ca57ffba9aab4faef66b5e12a9922821027a28` |

Base URL: `https://dist.torproject.org/torbrowser/16.0.1/`.
Each artifact has a corresponding `.asc` signature. The hashes above were read
from [sha256sums-signed-build.txt](https://dist.torproject.org/torbrowser/16.0.1/sha256sums-signed-build.txt).
They are metadata observations, not a claim that downloaded bytes or signatures
were verified in this work.

The required Tor Browser Developers primary signing-key fingerprint is:

`EF6E286DDA85EA2A4BA7DE684E2C6E8793298290`

Follow the [official signature-verification instructions](https://support.torproject.org/tor-browser/getting-started/verifying-tor-browser/).
An eventual downloader must use exact allowlisted HTTPS URLs, bounded sizes and
timeouts, an isolated GnuPG keyring, and the exact primary fingerprint. Verify
both detached signatures and fixed hashes before extracting or executing either
archive. Do not trust a key merely because its user ID has the expected name,
and do not silently fall back to a mirror, different release or unsigned binary.
Do not reuse the operator's GnuPG home or browser profile.

## Blocking source gate

The bundle launcher and the browser engine have different source identities:

| Component | Matching source tag | Relevant location |
| --- | --- | --- |
| Bundle construction and Linux launcher | `tbb-16.0.1-build1` in `tor-browser-build` | `projects/browser/RelativeLink/start-browser` |
| Firefox/Tor Browser engine | `tor-browser-153.7.0esr-16.0-1-build2` | Browser startup, Tor connection UI, Marionette and privacy defaults |

The exact launcher URL to inspect is:

<https://gitlab.torproject.org/tpo/applications/tor-browser-build/-/raw/tbb-16.0.1-build1/projects/browser/RelativeLink/start-browser>

Read-only official GitLab source/git requests returned HTTP 403 in this
environment. A public Tor-origin mirror exposed release-tag metadata but refused
the exact tree request with an Anubis access-denied page. Neither restriction was
bypassed. No executable bundle was downloaded for inspection.

Historical Tor commit messages and general Firefox documentation are insufficient
to certify all of the following for this exact release:

- Launcher argument forwarding, backgrounding and process-group behavior.
- The fresh bundled profile's location and creation path, and whether an explicit
  profile argument preserves all Tor bundle startup assumptions.
- The correct connection UI or internal TorConnect API and its navigation race
  behavior after bootstrap.
- Whether the Tor-distributed geckodriver differs from upstream in profile or
  recommended-preference handling.
- The exact privacy, private-mode, proxy and security-level defaults to assert
  before running synthetic application operations.

**Do not fill these gaps with guessed preferences or a generic Firefox profile.**
The next implementer needs permitted read access to these matching sources, or a
verified matching bundle supplied for source inspection. Record the retrieved
source identity and the precise launcher/profile behavior before adding live
startup code. This is a source-verification blocker, not evidence that automation
is impossible.

## Supported general automation mechanisms

The [Mozilla geckodriver flags](https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html)
document attaching to an existing Firefox process with `--connect-existing`,
requiring Marionette and an explicit matching port. WebDriver and Marionette
connection hosts default to loopback. Keep those endpoints local; do not publish
automation, SOCKS or control ports.

The [profile documentation](https://firefox-source-docs.mozilla.org/testing/geckodriver/Profiles.html)
states that geckodriver normally creates or modifies profiles and applies
automation preferences. `remote.prefs.recommended=false` can suppress one class
of changes, but may affect WebDriver behavior and is not proof that every Tor
privacy default remains unchanged. Its use remains a reviewed implementation
choice after the exact-source gate, not an instruction to add it blindly.

Tor's own [browser test CI](https://lists.torproject.org/mailman3/hyperkitty/list/tor-commits%40lists.torproject.org/thread/BNI33VB23CMTVX64NX4P7RQS6QBSHLLV/)
uses Marionette and Xvfb on Linux. This supports the feasibility of an ordinary
hosted runner. It does not validate this application's future harness.

[Playwright relies on patched Firefox](https://playwright.dev/docs/browsers#firefox).
Replacing the Chromium executable path with a stock Tor Browser binary is not a
supported migration of `scripts/tor/browser-acceptance.mjs`.

## Proposed workflow contract after the source gate

The implementation should be a separate `tor-live-acceptance.yml` with only
`workflow_dispatch`. No `push`, `pull_request`, schedule or chained-workflow
trigger should be present. A required `confirmed_test_only` boolean must default
to false. Require the exact reviewed commit SHA as an input, compare it with the
selected source before setup, and reject any mismatch. The harness must also
reject absent confirmation before downloading files, invoking Docker or creating
private state. Offline tests must exercise that refusal.

Use `contents: read`, checkout without retained credentials, pinned actions,
no repository secrets, a fresh hosted runner, a bounded job duration and no
production environment. The workflow must not publish a release, modify a branch
or deploy a persistent site. A completed run's result applies only to its exact
source tree, application archive, service image and browser/driver bytes.

Prepare the actual lean static archive using the existing build and packaging
commands. Reuse `prepareStaticTor`, its complete three-file Compose model, the
offline identity override and the pinned 0.4.9.17 service image. Validate that the
model contains only web and Tor, no host ports, web on its internal network only,
and the existing non-root/read-only/capability restrictions before starting it.

Create a unique disposable identity with the existing offline initializer, retain
its hostname in private process memory, and prepare a second configuration pinned
to it while preserving the same unique Compose project. Verify that identity
offline before activation. Do not edit the generated security policy to make a
test pass. The browser's bundled Tor client must have independent state from the
service's identity directory.

## Intended acceptance cases

The first bounded implementation can test the root onion origin at the reviewed
standard security level. Tor documents security-level differences [here](https://support.torproject.org/tor-browser/features/security-levels/).
Preserve private browsing, fingerprinting protections, NoScript and proxy defaults.
Record every intentional automation/download preference separately.

1. Require bounded client and service startup, then actual navigation through Tor
   Browser to the generated onion origin. Check secure-context and WebCrypto
   availability on that page, with no clearnet redirect or host mapping.
2. Generate synthetic seller keys, download an encrypted keystore to a private
   temporary directory, and verify it through the application's real file input.
3. Create a signed passphrase-protected invoice link. Open it after clearing the
   loaded page state, require wrong-passphrase refusal and hidden details, then
   require successful decryption and signature display with the correct fixture
   phrase. Keep the entire URL and fragment private.
4. Reload into a state without loaded keys, import the synthetic backup, require
   wrong-passphrase refusal, and compare restored public identity internally.
5. Exercise encrypted browser-vault save and reload/unlock behavior without
   changing private-mode semantics. Report full browser restart separately; a
   reload is not a restart, New Identity or independent user/profile.
6. Restart the service with the same identity volume, then require a fresh,
   uncached request from the actual onion page. A later independent restore test
   must use a separate volume with the same configured pin. Recreating the same
   image is not an upgrade test for a different binary.

The initial harness must not claim mobile-device support, every security level,
complete browser/network leak resistance, external-wallet/RPC routing, payment
submission, refunds or funds recovery. It must not use real funds or contact wallet
or chain services. Generic browser request interception is not automatically
available in the Tor Browser harness; any egress assertion needs its own tested
observation mechanism. Successful onion navigation alone is not such a proof.

## Privacy and cleanup contract

All Tor keys/state, browser profiles, download files and full subprocess output
must stay under one fresh private runner directory or the exact disposable Docker
resources belonging to that run. Register cleanup ownership before acquisition.
Use a random project name and exact named resources; never use Docker prune,
unbounded label deletion or a shared service volume.

Capture child and WebDriver output privately and never propagate arbitrary error
messages, assertion diffs, stdout/stderr, capabilities objects or stack traces to
the report. Even failed comparisons can contain an onion address or ciphertext.
The report must be projected into a fixed schema containing only authored stage
codes, validated version/digest fields, booleans and bounded counts. Raw browser
logs, Tor logs, URLs, fragments, profiles, screenshots, downloads and directory
archives must never be artifacts.

Cleanup must run on success, assertion/driver failure, timeout and handled
termination signals. Provide an idempotent `always()` workflow cleanup step for
the exact registered resources if the main process is interrupted. Cleanup
failure changes the overall result to failed and must not overwrite the original
stage failure. Upload only the explicitly named redacted report after cleanup;
never use a private-directory wildcard. Runner destruction remains the final
boundary for uncatchable termination, so do not claim an application `finally`
block alone guarantees cleanup in every failure mode.

Meaningful offline tests should prove that no unconfirmed run reaches a downloader
or process launcher; extraction cannot precede signature/hash verification;
arbitrary child/driver/assertion output cannot enter public diagnostics; and
cleanup attempts every acquired exact resource after an earlier failure. A fresh
reviewer should inspect these tests and the final trigger/permissions model
before any activation approval.

## Work performed and next gate

Performed: read-only repository and primary-source review; official artifact,
checksum, signer and release-metadata lookup; exact-source access attempts; this
preparation document and an additive ownership/status record.

Not performed: executable download/signature verification, browser launch, Docker
execution, Tor network bootstrap, descriptor/address publication, live tests,
workflow creation/dispatch, remote publication or merge by this worker.

Next gate: obtain the matching launcher/profile/driver source evidence and resolve
the five exact-release questions above. Then implement and independently review
the strictly opt-in harness and offline failure tests. Actual live execution still
requires explicit approval of the exact reviewed commit and ephemeral service.
