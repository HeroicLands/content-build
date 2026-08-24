---
"@heroiclands/content-build": minor
---

Retire the address-alias rule (#79).

`lint` required every note to repeat its own `type-shortcode` address in the
top-level `aliases:` list. That served exactly one reader — **Obsidian**, so
`[[type-shortcode]]` resolved in the editor — and no build ever read it: both
resolvers parse the hyphen qualifier themselves, and the alias list feeds only
the bare-alias fallback index.

The project no longer authors in Obsidian, so the rule required a line of
frontmatter per note for a reader that does not exist.

`sohl-thalorna` had already dropped its aliases, which left its `lint` reporting
**1,738 findings — one per note**, none of them a defect, burying the 120 that
were real. With the rule retired that tree reports **0** address findings, and
`sohl` (1,457 notes) and `sohl-kethira-basic` (363 notes) — which still carry
their aliases — report 0 as well. An alias that is still there is simply an
ordinary alias now.

`isAddressAlias` and `auditNoteAliases` are removed with it. Neither was
imported by anything but this package's own tests.

_Verified output-neutral before the aliases were dropped:_ across 1,735 stripped
notes, `package compile` produced byte-identical `build/packs-json` and the site
build byte-identical `site/content`. Only `lint` ever disagreed.

The two rules that remain are the ones about identity rather than tooling: a
`shortcode` is ASCII-alphanumeric, and `(type, shortcode)` names one note.
