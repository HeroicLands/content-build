---
"@heroiclands/content-build": minor
---

Check a note's frontmatter against the schema its type declares (#19), and make
the builders' allow-list loud (#3).

`content-build lint` now checks frontmatter as well as addresses. Five classes,
each previously reported somewhere other than where it was made, or not at all:

- **Unknown or retired type**, told what replaced it.
- **Missing required property** — `dimensions` on a map, `subType` on a skill.
- **Wrong value shape** — `weight: heavy` where a number belongs.
- **Unknown property**, with a near-miss suggestion. This is #3's second half:
  the builders discard a `sohl:` key no field declares, with no warning and no
  effect on the exit code, which is how 204 kethira mystical abilities shipped
  with no affiliation. An author could not tell a builder that forgot a field
  apart from a field that does not belong on the type at all.
- **Dead shortcode reference**, resolved through the same resolver `links` uses,
  so a cross-package reference answered by a vendored manifest lands exactly as
  it would in a wikilink. `--no-references` turns it off for a tree whose
  cross-package references it cannot see.

**A schema says what a note may _write_, not what the compiler emits.** That
distinction is the calibration: a note also feeds a knowledgebase and a website,
which read classification the pack build never compiles. Equating the vocabulary
with the builder's allow-list reported 4,241 unknown properties against SoHL's
own tree, every one correctly authored; declared properly, the same tree reports
**nothing** across 1,457 notes.

What that calibration then finds elsewhere is real: 120 findings in
`sohl-thalorna` — including 44 mysteries still carrying the retired `trait`, a
being on the retired `birthsign`, and a skill with no `subType` — and 270 in
`sohl-kethira-basic`.

**Expect a previously green tree to go red.** That is the point of the issue,
not a regression: the findings were always there and nothing reported them.

Two additions to a field declaration make this checkable: `kind`, a
machine-readable value shape distinct from the prose `shape` (a field may
declare one without changing a byte of what it emits), and `ref`, the content
type a shortcode addresses.
