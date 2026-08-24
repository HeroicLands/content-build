---
"@heroiclands/content-build": minor
---

Carry a mystical ability's and a mystery's granting affiliation through to the
compiled document (#3).

`assocAffiliationCode` is a real field on both `MysticalAbilityDataModel` and
`MysteryDataModel`, and neither type's declaration named it — so the builders,
which are an allow-list, discarded it. In `sohl-kethira-basic` **204 of 224
mysticalability notes set it to a real value**, and every one of them compiled
without it: no mystical ability in that shipped pack was linked to the
affiliation that grants it. `mystery` was missing `assocSkillCode` for the same
reason.

Both are declared `nullable: true, blank: false, initial: null` on their
DataModels, so the new fields read blank as `null` rather than `""` — "unset" is
one value, not two.

**This changes emitted documents**, so a consumer whose notes set either field
wants a rebuild rather than a silent upgrade.

_Not fixed here:_ the silence itself. A `sohl:` key no declaration names is
still dropped with no warning and no effect on the exit code, which is what made
this cost 204 documents before anyone noticed — that is #19's unknown-property
check. The inverse case, an emitted field no DataModel declares, is #70.
