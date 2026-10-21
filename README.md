# GhostPay

GhostPay is an open-source project exploring client-side invoice creation and stealth-address
payments for EVM-compatible networks. The goal is to reduce address reuse and limit routine exposure
of invoice details.

Blockchain transactions and much of their metadata remain public. GhostPay does not claim absolute
anonymity or unlinkability; see the non-goals in `docs/DEVELOPER_SPECIFICATION.md`.

## Status

**Design and specification stage. There is no implementation yet.** The repository contains only
documents. No contracts, packages, web app or tests exist in this repository, so nothing can be built,
installed or run from it. Deployed contract addresses, supported networks and release state will be
recorded in a versioned deployment manifest and release notes when they exist.

## Documents

| Document | What it is |
|---|---|
| [docs/MASTER_BLUEPRINT.md](docs/MASTER_BLUEPRINT.md) | Project purpose, system architecture, user flows, threat model, implementation plan |
| [docs/DEVELOPER_SPECIFICATION.md](docs/DEVELOPER_SPECIFICATION.md) | Module specifications, flows, threat matrix and staged build plan (a design baseline, not an audit) |
| [docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md](docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md) | Proposed post-launch features and security roadmap |
| [docs/SECURITY_QA_DEVOPS_PLAYBOOK.md](docs/SECURITY_QA_DEVOPS_PLAYBOOK.md) | Release gates, QA, DevOps and operational procedures |

External standards referenced by the documents: EIP-5564 (stealth addresses), EIP-6538 (stealth
meta-address registry), ERC-4337 (account abstraction).

## Core design constraints

- Keep key derivation, invoice parsing and metadata decryption client-side where practical.
- Never place spending keys or seed phrases in invoice links.
- A URL fragment is omitted from normal HTTP requests but remains visible to page scripts and browser extensions.
- View tags reduce expensive checks for unrelated announcements; they do not eliminate log downloads or hide chain activity.
- ERC-4337 gas sponsorship does not by itself provide transaction unlinkability.
- Do not deploy contracts for real funds until test coverage, threat analysis and independent security review are complete.

## Contributing

Specifications come first. Review linked standards and upstream releases again before pinning
dependencies, as the developer specification instructs. Keep the non-goals and invariants intact
when proposing changes.

## Licence

No licence file is present in this repository, so no licence is granted by this README. The owner
should add one if the project is to be open source as the README describes.

## Wiki

Wiki source pages are in [docs/wiki/](docs/wiki/Home.md).
