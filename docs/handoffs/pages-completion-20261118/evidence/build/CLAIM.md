# Published-source build qualification

- Worker: `/root/security_recovery`
- Source: detached isolated checkout at `9bad95e5cc0ee73f5adb8d2c587161074b21e080`
- Expected source tree: `81341de7972041b5f7ce53da76027846356fab90`
- Owned paths: `/workspace/scratch/4fa14be12559/analysis-build/**` and ignored build outputs in its isolated checkout only.
- No product, workflow, branch, tag, deployment, or release changes.
- Acceptance: actual full/lean web builds; project-subpath and dedicated-origin Pages artifact verification and HTTP fetches; actual Playwright attempts in both profiles with failures retained; development `release:build` and clean-clone `release:repro`; exact commands, versions, exit codes, source cleanliness and output hashes recorded.
- Memory coordination: libraries may run at 768 MiB after clean installation; web/release/repro wait for the root's heavy-build window, then use 1536 MiB per process. All large phases run sequentially.
- Resource-only node wrapper: prepends `--max-old-space-size=1536` to the pinned Node executable so Pages' `env -i` subprocess keeps a finite heap without forwarding arbitrary NODE_OPTIONS or changing repository gates. This does not change application source or test conditions beyond the resource limit.

