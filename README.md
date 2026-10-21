# GhostPay

GhostPay is an open-source project exploring client-side invoice creation and stealth-address payments for EVM-compatible networks.

The project goal is to reduce address reuse and limit routine exposure of invoice details. Blockchain transactions and much of their metadata remain public, so GhostPay does not claim absolute anonymity or unlinkability. The architecture and its privacy limits are documented before implementation begins.

## Project status

**Architecture phase.** No production contracts or application are implemented. The initial documentation includes the [Master Blueprint](docs/MASTER_BLUEPRINT.md), [Developer Specification](docs/DEVELOPER_SPECIFICATION.md), and [Security, QA, DevOps, and Feature Expansion Playbook](docs/SECURITY_QA_DEVOPS_PLAYBOOK.md).

## Starting points

- [Security, QA, DevOps, and Feature Expansion Playbook](docs/SECURITY_QA_DEVOPS_PLAYBOOK.md)
- [Developer Specification and Execution Blueprint](docs/DEVELOPER_SPECIFICATION.md)
- [Master Blueprint](docs/MASTER_BLUEPRINT.md)
- [EIP-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564)
- [EIP-6538: Stealth Meta-Address Registry](https://eips.ethereum.org/EIPS/eip-6538)
- [ERC-4337: Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)

## Initial priorities

1. Define supported chains, stealth scheme, invoice envelope, and privacy claims.
2. Write cryptographic test vectors and a differential-tested stealth derivation package.
3. Prototype and test the smallest possible announcement and settlement contracts.
4. Build a static client with local invoice parsing and wallet-confirmed payments.
5. Treat scanning services, RPCs, relayers, and paymasters as observable third-party components.

## Core design constraints

- Keep key derivation, invoice parsing, and metadata decryption client-side where practical.
- Never place spending keys or seed phrases in invoice links.
- A URL fragment is omitted from normal HTTP requests but remains visible to page scripts and browser extensions.
- View tags reduce expensive checks for unrelated announcements; they do not eliminate log downloads or hide chain activity.
- ERC-4337 gas sponsorship does not by itself provide transaction unlinkability.
- Do not deploy contracts for real funds until test coverage, threat analysis, and independent security review are complete.

See the [Security, QA, DevOps, and Feature Expansion Playbook](docs/SECURITY_QA_DEVOPS_PLAYBOOK.md) for release gates and operational procedures.
