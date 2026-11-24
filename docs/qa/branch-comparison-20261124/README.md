# First composition qualification

These logs preserve the completed local qualification of the product source in PR #615. The source pins, successful results and resource/prerequisite retries are recorded in `qualification.json`. Raw log bytes are preserved losslessly as deterministic gzip files and identified by SHA-256. `package-results.json` replaces the initially skipped policy result with the complete native Anvil rerun, yielding 4,469 distinct package test passes with zero remaining skips.

Hosted workflow results must be checked separately on published commit `70970c3b739dcba51c0fb6cd0b1b75f73f6aae95` before merge.
