---
"@heroiclands/content-build": minor
---

**A being's info-block derivation moves here, from the two repositories that
each had a copy.**

`sohl/being-info.mjs` exports `deriveBeingInfo`, `isBeing`, `BEING_TYPE` and
`GEAR_TYPE_TO_KEY`: the translation between the flat `sohl.items[]` a being note
authors and the resolved shapes the shared theme's sidebar reads — a `skills`
map, `gear` grouped by kind, and `spells`/`talents` split out of the mystical
abilities. It is SoHL data-model knowledge (which item type is a skill, where a
mastery level lives, what separates a spell from a talent), so it belongs in
this package's `sohl` half rather than in each site build.

It lived in `Song-of-Heroic-Lands-FoundryVTT` and `sohl-thalorna` at once, and
the copies drifted. SoHL's caller still gated the derivation on `character` and
`creature` — the types #1580 merged into `being` — so it had matched nothing
since the merge, and all 95 of its being pages published with empty sidebar
sections (SoHL#1696). thalorna's copy checked `being` and was correct. Nothing
failed in either repository.

`isBeing` exists because of that: the defect was never in the derivation, it was
in each caller's idea of what a being _is_, written out per repository where it
could rot independently. The retired names are deliberately not accepted as
aliases — they throw elsewhere in the system, and tolerating them here would
hide the next drift instead of surfacing it.

Two deliberate differences from the code it replaces:

- **The `corpus` derivation is dropped.** `corpus` is not a registered item
  type, so nothing can compile to one and the branch matched nothing — the same
  class of dead code as the gate that caused the bug. It was in SoHL's copy and
  never in thalorna's.
- The mystical-ability branch keeps its lack of a shortcode fallback, unlike
  gear, and now says why: these render as prose names, so a row reading like a
  shortcode is worse than no row.

Additive — nothing in this package consumes it yet. Verified against every real
being note: `deriveBeingInfo` and the copy it replaces produce byte-identical
output for all 95, deriving a skills map for 95 and gear for 2.
