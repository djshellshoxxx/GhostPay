# GhostPay

GhostPay is an open-source project exploring client-side invoice creation and stealth-address payments for EVM-compatible networks.

The project goal is to reduce address reuse and limit routine exposure of invoice details. Blockchain transactions and much of their metadata remain public, so GhostPay does not claim absolute anonymity or unlinkability.

## Project status

**Post-launch expansion planning.** This repository documents the architecture, developer requirements, security/QA process, and proposed post-launch features. Track deployed contract addresses, supported networks, and release state in a versioned deployment manifest and release notes.

## Starting points

- [Spec review and corrections](docs/SPEC_REVIEW.md) (read first; resolves conflicts between older documents)
- [Fee schedule and revenue architecture](docs/FEE_SCHEDULE.md)
- [Contracts specification](docs/CONTRACTS_SPEC.md)
- [Web app and relayer specification](docs/APP_AND_RELAYER_SPEC.md)
- [Multi-chain specification](docs/MULTICHAIN_SPEC.md)
- [Architecture decision records](docs/adr/ADR-LOG.md)
- [Threat model](docs/threat-model/THREAT_MODEL.md), [Security policy](SECURITY.md)
- [Post-Launch Feature Expansion and Advanced Security Roadmap](docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md)
- [Security, QA, DevOps, and Feature Expansion Playbook](docs/SECURITY_QA_DEVOPS_PLAYBOOK.md)
- [Developer Specification and Execution Blueprint](docs/DEVELOPER_SPECIFICATION.md)
- [Master Blueprint](docs/MASTER_BLUEPRINT.md)
- [EIP-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564)
- [EIP-6538: Stealth Meta-Address Registry](https://eips.ethereum.org/EIPS/eip-6538)
- [ERC-4337: Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)

## Core design constraints

- Keep key derivation, invoice parsing, and metadata decryption client-side where practical.
- Never place spending keys or seed phrases in invoice links.
- A URL fragment is omitted from normal HTTP requests but remains visible to page scripts and browser extensions.
- View tags reduce expensive checks for unrelated announcements; they do not eliminate log downloads or hide chain activity.
- ERC-4337 gas sponsorship does not by itself provide transaction unlinkability.
- Do not deploy contracts for real funds until test coverage, threat analysis, and independent security review are complete.

See the [Security, QA, DevOps, and Feature Expansion Playbook](docs/SECURITY_QA_DEVOPS_PLAYBOOK.md) for release gates and operational procedures.
