## Summary

<!-- What changed and why (1–3 sentences). -->

## Test plan

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run` (or targeted `npx vitest run src/lib/deck-format-validation.test.ts` when touching validation)

## Format validation QA (check when this PR touches `src/lib/deck-format-validation.ts`, `src/lib/deck-stats-compute.ts`, or deck editor format hints)

- [ ] Switch deck format in settings; toolbar / analytics `format_validation` status matches expectations (implemented vs neutral vs not yet implemented).
- [ ] Open format hints / violation list for a deck with known violations; messages appear on the right cards.
- [ ] Constructed formats: confirm 60-card mainboard message, copy-cap violations (including sideboard toward playset totals), and sideboard overflow when over 15.
- [ ] Commander / EDH: commander color identity, singleton / MDFC oracle aggregation, bracket game-changer cap (when bracket set).
- [ ] Canadian Highlander: points over cap surfaces a deck-level message; 100-card mainboard rule.
- [ ] Realtime or rapid edits: editor remains responsive (validation should not thrash on unchanged deck fingerprints).
