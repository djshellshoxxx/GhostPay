# Mythril findings review handoff

Status: **Incomplete**. The coordinator is taking over current-source analyzer execution and evidence completion.

## Completed evidence

- Base commit: `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`.
- Branch: `review/mythril-findings-20261118`.
- Contract source tree: `dabfd36a98424a4184ee7e267e12815763d1157f`.
- Independent expiry test execution: **31 passed, 0 failed, 0 skipped**, including three fuzz tests at the unchanged 10,000-run setting.
- Command, from `packages/contracts`:

  ```sh
  FOUNDRY_SOLC=/workspace/scratch/75c78c17e2fc/contract-tools/solc-0.8.28 /workspace/scratch/75c78c17e2fc/contract-tools/forge test --match-path test/MythrilExpiryDispositions.t.sol -vv
  ```

- Exit code: `0`. Full output: [evidence/expiry-tests.log](evidence/expiry-tests.log).
- Log SHA-256: `2d93357c67496fbdf4472630266377fd24c8697e23589ab65a0ad386efe0d37c`.
- Foundry: `1.8.5`, commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`.
- Native solc binary SHA-256: `9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`.

The inspected expiry code preserves inclusive submission deadlines, signature domain binding, nonce consumption, and delays measured from acceptance. Cancellation is possible while the request/proposal remains pending; after maturity it races execution. Test success does not qualify an analyzer campaign or a later combined integration commit.

## Source hashes

| File | SHA-256 |
|---|---|
| `packages/contracts/src/GhostPaySweepRelayer.sol` | `9943c8b4b5ac8d765ec01870b6b334a10ba7aa8c7815b071cdb2ef90c1ef080a` |
| `packages/contracts/src/PolicyAccount.sol` | `c860fcf73e3cd9babd8f53b125cc02864ee28f68e59b15740b2b9a66f263c1f9` |
| `packages/contracts/src/PolicyAccountFactory.sol` | `7dfc32591bf991a060988a86fcdbe109155c321199c6c8a43b1f72dfe35fb94e` |
| `packages/contracts/scripts/run-mythril.sh` | `9a2a8966bec43b1d971c7c99a4214fef0c3a52570dbd2f0a535874c1d33eb445` |
| `packages/contracts/scripts/mythril-compat.py` | `9635bcc9057ddf4681615e67add21bbb584f74df65b563faa23d1219080c2035` |

Compared against the fetched PR #220 and master integration sources, `packages/contracts/src`, vendored libraries, `foundry.toml`, `remappings.txt`, the Mythril runner and compatibility launcher have no differences. This is source correspondence, not a fresh analysis result.

## In-progress tool preparation

An isolated environment is being installed at `/workspace/scratch/b608f89bdf4a/mythril-venv` with Python 3.12.14:

```sh
python -m pip install 'mythril==0.24.8' 'solc-select==1.2.0' 'setuptools<81'
```

Its complete log is `/workspace/scratch/b608f89bdf4a/mythril-install.log`. At handoff the process is downloading dependencies and has no terminal exit result. No Mythril campaign has started. No Slither or Echidna execution occurred in this worker.

The production runner inspected here uses Mythril 0.24.8 through its CI installation, Solidity 0.8.28, Cancun, optimizer 200, transaction depth 3 and 900 seconds per contract. The coordinator must qualify the new evidence-capturing runner against the final combined source, retaining per-target stdout, stderr, exits, exact configuration and source identities.

## Remaining work

- Finish installation and verify actual tool versions.
- Run and retain the new full five-target Mythril campaign.
- Complete the independently reviewed finding matrix and chain-timing assumptions packet.
- Bind any proposed exceptions to exact sources/configuration and obtain applicable owner approval before activation.
- Qualify the actual combined integration candidate.

No contract, runner or checker source changed in this worker. No finding exception was approved or activated, and no deployment, release, push or merge occurred.
