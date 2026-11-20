# Historical documentation recovery from PR #259

This directory preserves **157 historical documentation sections** that were absent as complete text from both integration candidates inspected on 20 November 2026. The sections retain their original authors' wording and source attribution. Their findings, ownership statements, instructions, next actions, test results, and release statements describe earlier work. They are historical evidence and do not establish current behavior, ownership, qualification, or release approval.

The recovery source is [PR #259](https://github.com/djshellshoxxx/GhostPay/pull/259), pinned to commit [`4ff80733a3b36019e2f12fc21a8448e7666b6049`](https://github.com/djshellshoxxx/GhostPay/commit/4ff80733a3b36019e2f12fc21a8448e7666b6049). Its declared base, `ffd982a7aea2856c186b40ef236a39720a1b81f5`, is an ancestor of the frozen comparison candidate. The seven original archive/provenance paths were absent from that candidate; content comparison, rather than filename absence, determined the selection below.

## Retained historical material

| Historical source | Original source commit | Sections in PR #259 | Recovered here | Treatment |
| --- | --- | ---: | ---: | --- |
| [PR #139 audit observations](archive/pr139-historical-evidence.md) | `364b01f847391cd02b3aecb74e18ddd047096c97` | 42 | 42 | The archive file is byte-identical to PR #259. |
| [PR #140 documentation observations](archive/pr140-historical-evidence.md) | `c5efadab9d9af6a0053f489ebe6c0c06e760d025` | 75 | 74 | One already-retained source-file block was removed; all remaining bytes are unchanged. |
| [PR #153 continuation observations](archive/pr153-historical-evidence.md) | `83fe9b022d2b5a4068137fd7987467f1803803dc` | 41 | 41 | The archive file is byte-identical to PR #259. |
| **Total** | | **158** | **157** | |

The omitted section is PR #140's `docs/design/qr-colors.md`, original lines 5–17, SHA-256 `d7e7b6044c00d5dd3d7c47f126f42327d087deb8f585a98a5c94fdba1ce1cb15`. Its complete original text already exists in [the retained QR color document](../../design/qr-colors.md). The exact hash and both comparison matches are recorded in [the new provenance manifest](provenance.json); this recovery adds no duplicate of that section.

The preservation unit is the complete source section selected by the earlier recovery: a level-two Markdown section or a document preamble. General sentences and related facts can overlap current documentation. Retaining the complete historical observation preserves its context and avoids presenting edited fragments as the original record.

## Comparison scope and result

Two source-pinned Git trees were inspected:

| Candidate | Commit | Tracked blob paths |
| --- | --- | ---: |
| Frozen integration comparison | `53f4253bd9afc33bea43a7bdfe95ae287e035bf7` | 5,169 |
| Later documentation/evidence candidate | `a1e5090bac39bf3841f7d0403c79163d787a9793` | 5,177 |

The combined search covered **4,928 unique Git blobs** and **5,446 UTF-8 text payloads**. It included raw file text, 225 distinct gzip streams, 146 ZIP members, and 378 decoded JSON string values long enough to contain a historical section. Expanded container contents totaled 23,099,828 bytes. No container exceeded the 64 MiB per-payload inspection bound. One font and two PNG screenshots were inventoried as binary data and were not OCRed.

Each section was checked as original source text and as its previously archived text. Additional comparisons normalized whitespace and inline Markdown link destinations to detect unchanged prose retained with different formatting or link locations. Only the QR section matched completely. Among the 157 recovered sections, 152 also had no matching section heading anywhere in either text corpus. The remaining five use generic guide headings whose bodies differ from current guides.

These results establish that the complete historical sections were missing under the documented textual representations. They do not establish that every sentence, related fact, or paraphrase was missing. Full per-section decisions, hashes, source boundaries, retained matches, and recovered byte offsets appear in [provenance.json](provenance.json). Corpus details and verification limits appear in [verification.json](verification.json).

## Source fidelity and provenance

The recovery independently verified all three original archive hashes, all ten original source-file blob identities and SHA-256 hashes, and all 158 original section hashes. Each historical section's prose matches its original source after the earlier archive's recorded link rewriting. Forty-three relative Markdown link destinations were checked against the corresponding original source commit and path; two directory destinations also normalize a trailing slash.

All 157 recovered section bodies are byte-identical to their PR #259 archive bodies. The PR #139 and PR #153 archive files are unchanged in full. The PR #140 archive removes only the entire `docs/design/qr-colors.md` block and its preceding separator. Source and recovered file hashes, and each recovered body's zero-based byte offsets, are recorded in the new manifest.

The following files are unchanged copies of records from PR #259:

- [Original provenance](source-records/provenance.json) describes all 158 sections and the original three archive files.
- [Original publication mapping](source-records/publication.json) records the earlier local-to-published commit mapping.
- [Original verification record](source-records/verification.json) preserves the earlier worker's verification claims as historical data.

Paths and hashes inside those original records describe the original PR #259 tree. In particular, the original PR #140 archive hash covers its full 75-section file. Use this directory's [new provenance](provenance.json) and [new verification](verification.json) for the 74-section selection recovered here. The original verification record is not evidence that its tests or checks were rerun in this recovery.

The four original local commit objects named by the publication mapping are unavailable in this checkout. Their four published commits' trees and mapped parent lists were verified. The ten original comparison-file hashes also match published comparison commit `b0617e272096c2145acd90fb00a5f8a4bac2f9cc`, mapped from local `562c219123de64a8089c95af1393ce955b0d4ff2`. The unavailable local objects prevent a new independent local-versus-published tree comparison; the original mapping is preserved with that limit stated explicitly.

## Integration and future review

This recovery changes only its archival directory. The original recovery README, `Current-Status.md`, live Wiki navigation, current handoffs, ownership guidance, application code, tests, configuration, and workflows are outside the recovered material. Historical commands and snippets were treated as data. No application tests, builds, deployment, release, or remote writes were performed.

The archives' historical relative document links were already pinned to their original source commits by PR #259. Their six local context links now resolve to this directory's README and provenance manifest. New local document links are checked independently; external GitHub destinations are source citations and were not individually fetched.

See [HANDOFF.md](HANDOFF.md) for the bounded review task for a fresh successor. Any later integration should preserve these immutable source records and assess current release evidence separately.
