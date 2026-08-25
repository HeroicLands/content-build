---
"@heroiclands/content-build": patch
---

Actually assign the foreign item catalogue onto the actors compiler.

1.8.0 shipped `itemCatalog: true` and `deps fetch` in a state where they did
nothing. The compiler destructured `foreignSourceDirs` and never assigned it, so
`this.foreignSourceDirs` was always `undefined` and `loadItemsMap` fell back to
its empty default. The catalogue was downloaded, extracted, cached — and
silently dropped.

The symptom was a compile that had changed in no way at all: `sohl-thalorna`
with the feature fully switched on still reported all 26,220 unresolved items,
and logged `Loaded 630 predefined items` — its own count, with none of sohl's
1,224.

Every test passed throughout, because they exercised the catalogue module in
isolation and nothing exercised the wiring. A feature wired up wrong looks
exactly like one switched off, so the regression test asserts the compiler keeps
the directories it was constructed with, and was checked by mutation.
