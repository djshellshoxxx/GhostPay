# Incident response

Audience: maintainers and operators. Pre-audit software, nothing deployed. This is a plan to rehearse, not a record of a tested process. **OWNER** marks values a human must fill in: contacts, channels, signing-key fingerprint, SLAs. Do not rely on a placeholder.

## 0. Principles
- **No pause, no admin.** The contracts are immutable (no owner, proxy, pause, rescue, fee setter). We cannot freeze funds or patch deployed code. Response means: stop serving the bad thing, tell users, publish a new release/manifest, and give users a way to migrate.
- Assume the frontend is the softest target: a tampered bundle can steal keys. Users who verified hashes from a second machine are the only ones protected; tell everyone to re-verify.
- Preserve evidence before cleaning (hashes, logs that exist, deployment history). Minimise what we log; say plainly what we cannot know.
- One incident lead, one scribe, a private channel (**OWNER**: name it). Severity: S1 funds or keys at risk now; S2 integrity broken, no known loss; S3 degraded.
- Never put real keys, seeds or user addresses in tickets or chat.

## 1. First hour (any incident)
1. Open a private record: time (UTC), reporter, what is known. Assign lead and scribe.
2. Contain the cheapest reversible thing first (take a host offline, disable a relayer chain, revoke a token). Do not delete evidence.
3. Decide severity. S1/S2: prepare the user notice (section 8) in parallel.
4. Rotate credentials that could have been exposed (section 3 to 5), from a clean machine.
5. Record every decision and its reason for the post-mortem.

## 2. Compromised frontend release or host
**Triggers:** hash mismatch on any mirror, unexpected file in `dist`, unexplained deploy, reports of unexpected prompts or network calls, CSP violation reports, GitHub/CDN/DNS/registrar account alert.

1. **Stop serving.** Primary host: replace the site with a static notice page (no scripts) or take it offline. GitHub Pages: disable Pages in Settings or delete the `github-pages` deployment; cancel running workflows. IPFS: unpin and remove the name/ENS pointer if any; remember the old CID stays retrievable from others, so publish it as BAD. Onion: stop the service; if the onion key leaked, the address is permanently burned.
2. **Scope.** Compare served files with the release `SHA256SUMS` from a separate machine. Find the first bad version and time. Check `git log`, branch protection history, workflow runs, Pages deployments, DNS/CDN audit logs, registrar changes, collaborator and token lists.
3. **Credentials.** Revoke and re-issue GitHub tokens, deploy keys, host SSH keys, CDN API tokens; rotate DNS and registrar credentials and 2FA. Check for added collaborators, workflow edits, new Actions secrets.
4. **Rebuild** from a verified commit on a clean machine with `scripts/release-build.sh`; sign the tag with a key that was not on any compromised machine (if the signing key itself is suspect, section 4).
5. **Redeploy** only after the new hashes are published on two independent channels. Bump the version so old and new are distinguishable.
6. **Notify** (section 8): any user who opened the app during the window must assume that keys and recovery material typed or generated in the browser may be exposed. Guidance: create new stealth keys/identities, sweep funds received at old stealth addresses to a fresh wallet, stop reusing the affected meta-address, and revoke approvals. We cannot tell who was affected.
7. Add the cause to the post-mortem; if a workflow or dependency was the vector, fix the control (pinning, branch protection, review).

## 3. Poisoned or wrong deployment manifest
The manifest is not yet authenticated. A poisoned manifest can point clients at attacker contracts (router, announcer, relayer contract, fee recipient).

1. Identify the manifest version(s) and the commit/time that introduced the bad values (`deployments/*.json`, any served copy).
2. Remove or revert it in the repo and on every host (`/deployments/*` is `no-store`); publish a corrected manifest with a new version; bump the app release if manifests are bundled.
3. Check what the bad addresses are and whether they were used (block explorer, announcements). Tell users: payments sent to a router address that is not in the corrected manifest may be lost; do not send further.
4. Relayers: stop them on the affected chain (set the chain disabled in config, restart) and re-read the manifest from a verified copy before re-enabling. A relayer only follows manifests it loads from `DEPLOYMENTS_DIR`: confirm that directory's contents and file ownership.
5. Re-verify immutables on-chain against the intended inputs (deployment runbook section on read-back and bytecode hashes).
6. Long term: authenticated/signed manifests are an ADR-0015 gate.

## 4. Leaked release or signing key
1. Treat every artefact signed since the suspected leak time as untrusted. Revoke the key where possible (GitHub signing keys, key servers) and remove it from `allowed_signers`/trust docs.
2. Generate a new key on a clean machine; publish the new fingerprint through at least two independent channels, signed by the old key only if the old key is believed intact (otherwise say it is not).
3. Re-cut the latest release with the new key; mark older tags as untrusted in release notes. Provenance attestations tie builds to the workflow identity; check the workflow runs for unexpected tags.
4. Review who could create tags (protect `v*`), and the `release` environment reviewers.
5. Notify (section 8): users must fetch the new fingerprint out of band.

## 5. Leaked relayer hot key or quote secret
**Hot key (pays gas, holds a small native balance):**
1. Stop the relayer (systemd stop / container stop). Sweep remaining balance out of the old address using a clean machine, if an authorised key is still available; otherwise accept the loss, it is capped by design (keep balances low).
2. Generate a new key on a clean machine; write it to a new 600 file; update `RELAYER_KEY_FILE`; confirm the new address funding amount is small. Check whether any chain config or funding script references the old address.
3. The key cannot redirect user sweeps: the contract enforces what the stealth-address owner signed. Impact is gas balance theft and impersonation of the relayer in logs. Verify no unexpected on-chain transactions from the old address; keep watching it.
4. Find the leak path (backups, env files, logs, shell history, CI) and fix it.

**Quote secret:** rotate `QUOTE_SECRET_FILE`; outstanding quotes become invalid (short TTL); no on-chain impact.
**Metrics token / RPC keys / alert webhook:** rotate at the provider; update the env files.

## 6. Bug in an immutable contract
We cannot patch. Decide by impact.
1. **Triage.** Reproduce on a fork or anvil; classify: funds loss possible now (S1), griefing, fee-only, informational. Keep the details private until the mitigation is ready, unless funds are actively being taken (then speed beats secrecy; coordinate with the reporter).
2. **Stop new exposure immediately:** remove the affected deployment from the manifest (or add a `deprecated` flag if the schema supports it; check `deployments/schema.json`), release a client that refuses the old address, disable the relayer chain, take down hosts that serve the old manifest. Clients cannot stop a user who already knows the address.
3. **Mitigation for held funds:** funds at stealth addresses sit with the recipient's keys, not in our contracts. Where the bug lets a third party take funds in flight, guidance is to sweep to a fresh wallet now using a client that does not use the buggy contract.
4. **Fix and redeploy:** new contract, new audit scope, new manifest (deployment runbook); old address stays on-chain forever and must stay flagged deprecated in all documentation.
5. **Notice (section 8):** affected contract and chain, affected versions, impact, what users should do, what we cannot do (we cannot pause or recover).

## 7. Migration procedure (new deployment, no pause)
1. Deploy the fixed contracts on the same chain from the runbook; verify source and read back immutables.
2. Publish a new signed manifest and app release that default to the new addresses and display the old ones as deprecated.
3. Relayer: add the new manifest, run on testnet or low caps first, then switch; remove the old address from `DEPLOYMENTS_DIR` after users have had time to sweep (keep a way to sweep legacy funds if the old contract is not the bug).
4. Users: sweep or move balances held through the old contract path; payer-side: stop sending to old router addresses; merchants: update checkout links and embeds.
5. Keep the old contract's address and incident link in the docs; never reuse the name.
6. Announce completion criteria (for example "N weeks after notice, official clients stop listing the old deployment").

## 8. Communications
Channels (**OWNER**): GitHub Security Advisory, repo release notes, project status page, social account, mailing list. Post the same text everywhere; point to hashes and the fingerprint. Never ask users for keys or seed phrases. Never include real addresses of victims.

**Initial notice (S1/S2), template:**
> [GhostPay security notice, <YYYY-MM-DD HH:MM UTC>] We are investigating <short description>. Affected: <versions / hosts / contracts / chains>. Not affected: <what we know>. What to do now: <stop using <host>; do not send to <address>; verify the release hash on a second machine>. We will update by <time>. Contact: <OWNER security contact>.

**Update template:**
> Update <n> at <time UTC>: status <investigating | contained | fixed>. New facts: <...>. Action required: <...>. Verified release: version <x>, SHA-256 <...>, signing fingerprint <...> (confirm via <independent channel>). Next update by <time>.

**Resolution / post-mortem notice:** timeline (UTC), root cause, user impact and what we cannot determine (no telemetry), fixes, controls added, credit to the reporter if they agree.

Cadence: first notice within <OWNER: target, e.g. 2 hours of S1 confirmation>; updates at least every <OWNER: 6 hours> during S1.

## 9. After the incident
Blameless post-mortem within <OWNER: 7 days>: timeline, detection gap, controls (branch protection, pinned actions, hash publication, monitoring), action items with owners. Update the threat model and this document; add a regression test or CI check where the failure was mechanical.

## 10. Rehearsal and gaps
Not yet rehearsed. Tabletop each section once before any public hosting. Known gaps: no authenticated manifest, no cross-mirror hash comparison job, signing-key fingerprint unpublished, no on-call rota, no monitoring of host content, no status page. These are open items, not features.
