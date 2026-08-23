---
"@heroiclands/content-build": minor
---

**The address index a site build resolves its wikilinks against moves here.**

`engine/site-index.mjs` exports `buildSiteIndex` and `wikiContext`: given pages
that already know their own URLs, it builds every key space a wikilink resolver
reads — `section/slug`, `type/shortcode`, the canonical
`package-type-shortcode`, collision-aware bare fallbacks, and type-scoped
aliases — merges the foreign packages in, and reports what more than one package
claims.

Every consumer publishing a content tree as a website answers the same question
— given `[[Something]]`, which page? — and each answered it with its own copy.
`sohl` and `sohl-thalorna` still share **147 identical lines** of that answer,
comments and indentation aside.

**What deliberately stays with the consumer:** how a page gets its address. The
URL scheme, the section a note is filed under, whether developer docs are part
of the site at all — the two builds differ on all three, and those differences
are real rather than drift.

The ordering of the foreign merge is now pinned by a test and explained where it
happens: foreign entries merge _before_ local canonical addresses are written,
so a local page always ends up owning its own `package-type-shortcode` even if a
stale vendored manifest claims it.

Additive — nothing here consumes it yet. Verified against SoHL's real tree:
1,457 notes and a 2,101-entry foreign index produce an index identical to the
one its build constructs today, across all six key spaces (12,663 addresses, 12
ambiguous keys, 3,402 type-scoped aliases, 3 poisoned aliases, 34 content types,
0 conflicts).
