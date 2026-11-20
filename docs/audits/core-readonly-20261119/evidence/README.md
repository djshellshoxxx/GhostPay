# Metadata evidence

The four dependency files are read-only npm registry advisory responses obtained during this audit with `npm audit --package-lock-only --ignore-scripts`. They describe the pinned main and completion lockfile families; no dependencies were installed or repaired. Production-only scans and all-dependency scans remain distinct. The 17 Low package entries in each complete graph arise from two underlying advisory records; they are not 17 independent vulnerabilities. Advisory databases change after the audit date.

| File | Scope |
|---|---|
| [dependency-audit-main.json](dependency-audit-main.json) | Main production dependencies |
| [dependency-audit-all.json](dependency-audit-all.json) | Main all dependencies |
| [dependency-audit-candidate-production.json](dependency-audit-candidate-production.json) | Completion production dependencies |
| [dependency-audit-candidate-all.json](dependency-audit-candidate-all.json) | Completion all dependencies |
| [final-import-check.json](final-import-check.json) | Static first-party import/classification check, including supplemental full-path closure; no application execution |

The final classification includes supplemental `_headers` and `remappings.txt` full-body reviews in [coverage.json](../coverage.json). [Independent coverage QA](../lanes/coverage-qa-supplement.md) identifies remaining non-code exclusions. Registry output and structural lock inspection do not constitute a vendor-source audit or proof of runtime safety.
