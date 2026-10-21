# Spec: help and glossary (ux-i18n)

## Requirements
1. `GlossaryTerm {id, term, aliases, short, plain, detail?, topics, related}`; `HelpTopic {id, title, summary, steps?, termIds, relatedTopicIds}`; ids kebab-case.
2. English content for privacy, stealth address, silent payment, relayer, network fee (alias gas), viewing key, spending key, recovery phrase, anonymity set, metadata, confirmation; 8 help topics.
3. `lookupHelp(reg, topicId)` -> topic + resolved terms + related topics + reading level; unknown/malformed id -> `undefined`.
4. `searchGlossary(reg, query, limit)`: tokenised AND search, ranked (exact 100, prefix 60, alias 50, substring 30, short 15, body 5); query <=100 chars, <=8 tokens; deterministic.
5. `linkGlossaryTerms(reg, text, {firstOnly})`: segments (text/term), whole-word, case-insensitive, longest-first; never emits HTML; input >10 000 chars unlinked.
6. `estimateReadingLevel`: Flesch-Kincaid hint + band (plain<=8, standard<=11); `validateRegistry` enforces `plain` grade <= 9, no dangling links, no alias collisions.

## Acceptance tests
- `searchGlossary('gas')[0]` = network-fee; `'seed'` = recovery-phrase; `'relayer zebra'` = [].
- Link: "A Relayer sends it; the relayer cannot spend. Gas varies." links Relayer (first only) and Gas.
- `gasoline`, `relayers2` not linked; segments always concatenate to the input (property).
- English registry has zero validation issues.
