// @ts-check
// Text files the coordinator places in every archive: OPERATOR.md and LICENSES/HOSTING-KIT-NOTICE.txt.
// Static text (no timestamps, no host data) so archives stay reproducible.
import { KIT_NAME, KIT_VERSION } from './version.mjs';

/**
 * @param {{ appId: string, label: string }} p
 * @returns {string}
 */
export function operatorGuide(p) {
  return `# Operator instructions: ${p.appId} ${p.label}

Produced by ${KIT_NAME} ${KIT_VERSION}. This archive is a portable, verifiable copy of a static site.
It contains no keys, onion or I2P identities, databases, sessions or other runtime state, and it must never gain any.

## Contents
- \`site/\`: the site files, byte-for-byte as packaged. Do not edit them: any change alters the content digest.
  Change the application and rebuild instead. Chain IDs, contract addresses, RPC URLs and trust settings live in
  the application build and are never rewritten by the hosting kit.
- \`HOSTING-MANIFEST.json\`: versioned manifest (schema \`ghostpay.hosting-kit.manifest\` v1): every site file with
  size and SHA-256, the entrypoint, the content digest, provenance and the inclusion policy that was enforced.
- \`EXTERNAL-REFERENCES.json\`: every external URL found by a static scan (scripts, fonts, telemetry, RPC, relays,
  wallet services). Runtime-chosen endpoints are not visible to it.
- \`SHA256SUMS\`: \`sha256sum -c\` compatible list of every other file in this directory.
- \`LICENSES/\`: notices. Site licences are whatever the site itself ships.

## 1. Verify before hosting
With the kit: \`ghostpay-host verify <archive.zip> --expect-digest <content digest>\`
Without it: unzip, then \`cd <top directory> && sha256sum -c SHA256SUMS\`.

A checksum or digest read from the same place as the files only proves the files are internally consistent.
It does not prove who published them. Take the expected content digest (or the archive SHA-256) from an
independent channel: a signed release, a second mirror reached over a different network, or the publisher in person.
This kit does not create signing keys or act as a trust authority.

## 2. Preview locally
\`ghostpay-host preview <archive.zip>\` serves the verified copy on 127.0.0.1 only, with the same routing and
response headers the generated nginx profile uses.

## 3. Generate a hosting profile
Write a public host configuration (\`ghostpay-host wizard\`), then
\`ghostpay-host profile <archive.zip> --config host.json --out <dir>\`. The output contains a static export,
an nginx configuration, an optional container compose file and, if selected, Tor or I2P configuration. Nothing is
installed, started, opened in a firewall or published by the kit. Review the files, then activate them yourself.

## 4. Rules that keep mirrors safe
- Serve the response headers from the site's \`_headers\` file (CSP, nosniff, Referrer-Policy, frame-ancestors).
  A host that cannot send them is unsupported; do not weaken the policy to make it work.
- Keep onion service keys (HiddenServiceDir) and I2P destination keys outside the site and export directories,
  backed up offline. Anyone holding them can impersonate the mirror.
- Never expose router consoles, control ports, SOCKS/HTTP proxies, databases or debug ports as website ports.
- Every mirror origin (clearnet, onion, I2P, subpath) has separate browser storage, sessions and wallet permissions.
  Do not copy users' keys or state between mirrors.
- Onion or I2P hosting changes how the page is delivered. It does not anonymise wallet behaviour, RPC requests or
  public-chain transactions, and a failed privacy transport must never silently fall back to clearnet.
`;
}

/** @returns {string} */
export function kitNotice() {
  return `${KIT_NAME} ${KIT_VERSION}

The packaging toolkit is part of the GhostPay repository (tools/portable-hosting-kit). It uses only the Node.js
standard library and embeds no third-party code in this archive. The files it generates here (HOSTING-MANIFEST.json,
SHA256SUMS, OPERATOR.md, EXTERNAL-REFERENCES.json, this notice) are covered by the GhostPay repository terms; no
licence has been chosen for the repository yet (see its README).

The content under site/ keeps its own licences and notices, which this toolkit never alters. For a GhostPay web
build, third-party licences are listed in the repository's THIRD_PARTY.md and the release SBOM (scripts/release-build.sh);
pass them with --license-file to include copies here.
`;
}
