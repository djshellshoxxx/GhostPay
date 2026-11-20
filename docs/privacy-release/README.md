# Required privacy features: v1.0 and v1.1

Current implementation, acceptance evidence and remaining work: [STATUS.md](STATUS.md). Eight features are implemented with focused acceptance; retention is partial and complete original release qualification remains open.

This plan covers exactly [#286](https://github.com/djshellshoxxx/GhostPay/issues/286) and [#287](https://github.com/djshellshoxxx/GhostPay/issues/287). Future #283/#284/#288 are excluded.

Nine specs were first committed locally as 3a6c064b on candidate c83b4526 before any implementation. The workspace was then cleared following disk exhaustion; neither unpublished object is available on GitHub. This restored specification set uses published immutable baseline 137628961463fc5abd8b7927b2efe6b18a0a206a. Prior 482-test evidence is historical and does not qualify this new source. No source or test result is fabricated from missing files.

## Features

- [Global sensitive-data masking](v1-01-masking.md) — v1.0.
- [Optional clipboard protection](v1-02-clipboard.md) — v1.0.
- [Wallet and vault lifecycle privacy](v1-03-wallet-lock.md) — v1.0.
- [Private transaction history](v1-04-history.md) — v1.0.
- [Privacy-safe exports and notifications](v1-05-outputs.md) — v1.0.
- [Local EVM address reuse detection](v11-01-address-reuse.md) — v1.1.
- [Invoice metadata minimization](v11-02-invoice-minimization.md) — v1.1.
- [External wallet disclosure preview](v11-03-wallet-disclosure.md) — v1.1.
- [Local metadata retention controls](v11-04-retention.md) — v1.1.

## Execution

Implementation teams receive internal prompts. Three native workers plus coordinator work in parallel waves; fresh successors review each milestone. Dedicated feature branches and specs precede code. Existing shared integration lock and original branches remain untouched. All changes are draft development until original release checks qualify the integrated source.
