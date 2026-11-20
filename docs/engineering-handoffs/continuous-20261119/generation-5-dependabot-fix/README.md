# Generation 5: recover composite-action update discovery

Observed and verified on 2026-11-20. This is a narrow maintenance recovery from preserved upstream work. It does not qualify a hosted Dependabot run or the application release.

## Result and provenance

The GitHub Actions update entry in `.github/dependabot.yml` now uses `directories: [/, /.github/actions/*]`. The existing weekly Monday schedule, action group, five-PR limit, commit prefix and complete npm entry are unchanged. No action version or workflow changes are included.

| Identity | Exact value |
| --- | --- |
| Isolated branch | `fix/ghostpay-dependabot-composites-20261119` |
| Baseline | `3dc86fbc49e919e664230b63dae372ff79430fc5` |
| Original source branch | `claude/ghostpay-consolidation-9xhtxg-security` |
| Source head | `4894d0d8d94333dffa8ae3937a4d8314f27c686f` |
| Original mixed commit | `b246782cf7acd5625b5fd97df76ff6be6a5e7678` |
| Focused configuration commit | `ed98fde75f7d58f7f34ea6c7816ed95a81a42a07` |
| Baseline configuration blob | `cab4e3773b2d4cd2a875b84f630f4fa91319cdf6` |
| Resulting configuration blob | `604a27d1f04a043461d0dd9adcbcfdf73234e845` |

The focused commit preserves Claude's original authorship and names the upstream commit. It extracts only the directory change; the historical dependency-version comment from the mixed commit is omitted because it does not describe this recovery.

## Why this changes discovery

The current [GitHub options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#directories-or-directory) says the root GitHub Actions location scans root action manifests and `.github/workflows`. It also supports wildcard locations through the plural `directories` key. These rules do not make nested composite manifests root update targets.

The current [Dependabot GitHub Actions file fetcher](https://github.com/dependabot/dependabot-core/blob/main/github_actions/lib/dependabot/github_actions/file_fetcher.rb) agrees: `workflow_files` handles root manifests and workflows specially; a non-root directory supplies its own YAML files. Its separate lockfile support-file discovery does not turn every nested action manifest into a primary update target. Both primary sources were inspected on 2026-11-20; the moving fetcher URL is an observation, not an immutable upstream revision receipt.

The added wildcard matches three existing manifests at the frozen baseline:

- `.github/actions/release-verify/action.yml`
- `.github/actions/setup-forge/action.yml`
- `.github/actions/setup-node-libs/action.yml`

Their exact Git blobs and SHA-256 identities are in [RECEIPT.json](RECEIPT.json).

## Verification and limits

Parsed both configurations with PyYAML. The resulting mapping equals the baseline mapping with only `github-actions.directory` removed and the two-element `directories` list inserted. Enumerating the existing wildcard matches produced exactly the three paths above. `bash scripts/check-actions-pinned.sh` exited zero and checked 113 pinned `uses:` references with version comments. See [VALIDATION.log](VALIDATION.log).

No new test file was added for the YAML shape. No hosted updater execution, application build, runtime tests, dependency update, schedule activation, remote-ref change or deployment is claimed. Root independently reviews the configuration and owns any integration or publication.
