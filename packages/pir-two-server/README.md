# @ghostpay/pir-two-server

Two-server XOR private information retrieval (PIR) for reading pages of the public announcement log
without telling either server which page. Testnet-only research PoC. Spec: `docs/remote/privacy-specs/network-privacy.md`
section 4.8 (`scanMode = pir2`), `metadata-hardening.md` MH-SCAN-3. Default: OFF (the default scan mode is `range`).

## What it does

- `packPages(anns, shard, pageBytes)` packs public announcements into fixed-size pages (default 4096 bytes,
  deterministic order) and a `Manifest` (`leafHashes[i] = sha256(page_i)`, RFC 6962-style Merkle `root`, page block ranges).
- `pirQuery(n, i, rand)` (client): random subset `S` for server A, `S xor {i}` for server B. CSPRNG by default.
- `pirAnswer(pages, q)` (server): XOR of selected pages. `pirReconstruct(aA, aB)` (client): XOR of both answers.
- `verifyPage(page, i, leafHashes)`: reconstructed page accepted only if `sha256(page) == leafHashes[i]`.
- `PirServer` (+ `createPirHttpServer`, loopback by default) and `PirClient` (exactly W fetches per epoch: real plus
  uniformly random dummy indices, shuffled, W >= 4, default 8; both manifests must be identical; optional third-source head check).
- `PIR2_CLAIMS`: the honest UI text. Render it; do not paraphrase.

## Options and defaults

| Option | Default | Notes |
|---|---|---|
| `pageBytes` | 4096 | 256 .. 1 MiB |
| `pagesPerEpoch` (W) | 8 | at least 4; real pages must be < W |
| `allowSameOperatorNoPrivacy` | false | testing only; the client then reports `noPrivacy = true` |
| `thirdSourceBlockHash` | none (head not cross-checked) | strongly recommended |
| HTTP bind host | `127.0.0.1` | operator's explicit choice to change |

Chains: only 31337, 11155111, 84532 (`TESTNET_ONLY` otherwise) at `packPages`, `parseManifest`, `PirServer`,
`createHttpLink`, `PirClient.open`, `createPirHttpServer`.

## What it hides (and what it does NOT)

Hides: which page you fetch, from each single server, as long as the two servers do not collude.

Does NOT hide:
- Your IP address (servers still see who connects; pair with a network profile, which hides only the IP).
- That you use PIR at all, and when you query.
- Anything on-chain: the announcement log is public.
- Anything if the two servers collude or are one operator: they compare queries and learn the exact page.
- A malicious server is detected (wrong answer discarded), not corrected.
- Timing: only the dummy-page schedule exists.

Trust assumption: two independent operators that do not share logs. The client only refuses the same host or same
registrable domain (last two DNS labels heuristic, no public-suffix list); that is not a proof of independence.
Teaching-grade scheme: O(n * pageBytes) work per query, query size n bits; testnet slice only. No DPF (follow-up, NP-P-7).

## Unverified

- Never run against real PIR operators or over Tor/OHTTP; HTTP wire only tested on loopback.
- Chor et al. 1995 not re-read this session; implementation follows the spec's description and is tested for correctness and
  single-view uniformity, not formally proven.
- No constant-time claims (data is public; query bits are not secret from the client's own process).
- Bandwidth/latency on a real Sepolia slice not measured (spec milestone M6).
