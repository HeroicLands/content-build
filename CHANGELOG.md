# @heroiclands/content-build

## 1.0.0

### Major Changes

- 29857ed: **Four keys change hands: two stop being authored, two start.** All four were
  wrong in the same way — a fact either transcribed into the configuration from a
  file that already stated it, or read back _out of_ the manifest because the
  configuration could not state it.
  
  | Key                   | Was                               | Is                                |
  | --------------------- | --------------------------------- | --------------------------------- |
  | `foundryPackage`      | transcribed `package.json` `name` | derived; authoring it is an error |
  | `stats.systemVersion` | declarable                        | derived; authoring it is an error |
  | `compatibility`       | read out of the manifest          | declared, top level               |
  | `relationships`       | hand-authored in the manifest     | declared, top level               |
  
  **Breaking.** Every consumer configuration must drop `foundryPackage` and
  `stats.systemVersion` and gain `compatibility`, moving the values out of its
  manifest template rather than retyping them.
  
  **A module's system version is not its own version.** For a system,
  `package.json` `version` _is_ the system version. For a module it is the
  _module's_ — `sohl-thalorna` sits at `0.0.1` — so deriving from it would stamp a
  SoHL version that has never existed, which is worse than the frozen `0.6.0` both
  modules carry today, since that at least was once true. It comes instead from
  the `compatibility.verified` of the system the module declares a relationship
  with: `_stats.systemVersion` records what the packs were built against, not the
  floor they tolerate. A module declaring no usable system relationship fails the
  build rather than guessing.
  
  **This reverses a rule.** Configuration used to be forbidden from holding the
  Foundry floor — it named the manifest and the value was read from there, because
  the manifest was hand-authored and moved with test evidence. Now that
  package-build generates the manifest _from_ the configuration, reading it back
  would be a round trip through an artifact that need not exist yet: `build:db`
  can run before the manifest is written. `supportedCoreVersion` takes the
  resolved configuration instead of a manifest directory, and no longer reads the
  filesystem at all. The loud failure survives the reversal: an undeclared floor
  throws rather than defaulting, which is what `coreVersion: "14"` taught (#1533).
  
  `relationships` is **top level**, not in `packageBuild:`, because this package
  must read the system relationship to derive a module's version — and the
  dependency runs one way, so content-build must never read package-build's
  section.
  
  Mind the collision: top-level `compatibility` is the **Foundry core** range;
  `relationships.systems[].compatibility` is the **game system's**. Same key,
  different subject. `minimum` is required of the former, since it is stamped into
  every document, and optional inside a relationship, where `verified` is what is
  load-bearing.
  
  The package-id drift guard is deliberately left in place. It compares this
  configuration's id against the shipped template's, and the template still
  declares one; it becomes vacuous only once package-build generates the manifest,
  and should be deleted then rather than repaired.

## 0.17.0

### Minor Changes

- da18007: **The address index a site build resolves its wikilinks against moves here.**
  
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

## 0.16.0

### Minor Changes

- db89a4d: **A being's info-block derivation moves here, from the two repositories that
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

### Patch Changes

- a89a065: **Release from merged changesets instead of a remembered command**
  
  Fixes [#15](https://github.com/HeroicLands/content-build/issues/15). Releasing was
  hand-driven — bump `package.json` on a branch, merge, then remember
  `gh release create`, because cutting the Release is what published. Nothing
  enforced the last step, so on 2026-08-21 `main` carried 0.5.1 while npm served
  0.4.0: two versions merged and never published, with no check red.
  
  - Every pull request now declares its bump as a `.changeset/*.md` file, and CI's
    **Changeset declared** job fails one that does not. `npx changeset add --empty`
    is how a change says it needs no release — explicitly, rather than by omission.
  - Merging to `main` opens a **Version Packages** pull request carrying the bump
    and the rewritten `CHANGELOG.md`. An unreleased state is now a pull request
    waiting in the queue rather than nothing at all.
  - Merging that runs `changeset publish`: npm publish, the `v<version>` tag, and
    the GitHub Release with the changelog section as its body. The OIDC Trusted
    Publishing step is unchanged and still last; there is still no `NPM_TOKEN`, and
    re-running on a published version is a no-op.
  - `CHANGELOG.md` is seeded from the eleven hand-cut Releases so far and now ships
    with the package.

<!-- Sections at 0.16.0 and above are generated by `changeset version` from
     the changesets merged into `main`. Sections at 0.15.0 and below predate
     that pipeline and are the hand-written GitHub Release notes, kept verbatim
     (headings demoted one level to sit under their version) so no history was
     lost in adopting it. -->

## 0.15.0

_2026-08-22 — one config file, two build packages_

**One repository describes itself in one file — and now that file serves both build packages.**

#### A reserved `packageBuild:` section

`defineConfig` accepts a `packageBuild:` mapping, validates that it *is* a mapping, and hands it back frozen and **uninterpreted**. `@heroiclands/package-build` validates everything inside it.

```yaml
packageKind: systems      # read from the top level, never restated below
foundryPackage: sohl

packageBuild:
    assets:
        - { from: lang, to: lang }
    deploy:
        envPrefix: SOHL
```

The two packages split by **input** — content-build reads the content tree, package-build reads `lang/`, `styles/`, `src/`, the assets and the manifest template — so neither should learn the other's schema. A section rather than a scatter of top-level keys, because that keeps the unknown-key guard intact for everything around it: that guard is what catches a typo'd `packs` before it becomes an empty compendium.

The alternative was a second config file, and it would have restated `packageKind` and `foundryPackage` — two places for one fact. That is exactly what every consumer's `push-stage.mjs` did, hard-coding `packageKind: "systems"` and `packageId: "sohl"` beside a configuration that already declared both.

#### `assets` is retired

The key had been part of the contract since the pack-config hoist — validated and frozen on every load, and read by **nothing**. The job it describes is `stageAssets`, which belongs to package-build, and each consumer did it from a local table instead. It now lives at `packageBuild.assets`.

No configuration anywhere declared it — not SoHL's, not this package's own — so the removal costs nobody a migration.

#### Upgrading

`^0.x` never crosses a minor, so no consumer moves until it bumps deliberately. For most, this release changes nothing: adopt it when you adopt `@heroiclands/package-build`'s command line.

**Full changelog:** https://github.com/HeroicLands/content-build/compare/v0.14.0...v0.15.0

## 0.14.0

_2026-08-22_

Released with no notes — see [v0.14.0](https://github.com/HeroicLands/content-build/releases/tag/v0.14.0).

## 0.13.0

_2026-08-22 — links and reachability as commands_

Two things a consumer should not have to write a script for.

### `content-build links [root]`

Checks that every link in a content tree lands, reporting:

- a **dead `#anchor`** — a page id is derived by hashing the note id and the anchor slug, and nothing else checks that a heading declaring it exists;
- a **dead qualified address** — a `type-shortcode` target resolving to no note is a typo (a bare `[[Name]]` that finds nothing is a worldbuilding placeholder, and is left alone);
- a **wikilink authored in frontmatter** — both builds copy frontmatter through verbatim, so it publishes as literal `[[…]]` text;
- a **vendored manifest that has drifted out of reach** — readable is not the same as addressable, and a key shape the lookup cannot parse makes every cross-package link miss while each page still reads correctly.

All of it is package-agnostic, so a consumer needs no script of its own.

### `content-build reachability <dir> [file] [--index <shortcode>]`

A documentation set is a **book, not a pile of notes**: it has a page one, and everything in it should follow from that page by reading. A note with no inbound link still compiles and still publishes — it is simply impossible to arrive at, and nothing else notices, because every other check asks whether a link *lands*, never whether a document is *reached*.

The corpus is named on the command line because it never changes for a repository:

```json
"lint:reachability:rules": "content-build reachability Rules --index glossary",
"lint:reachability:guide": "content-build reachability User_Guide --index glossary"
```

`--index` marks a page walked **to** but not **through** — an index links to nearly everything it covers, so traversing one makes the check vacuous. A corpus whose entry page is missing exits 1 rather than reporting every page as an orphan.

`walkReachability` is exported too, for a caller that wants the graph rather than a report.

### Also

- `engine/foreign-manifests.mjs` — the addressability guard, beside the key format it guards rather than in whichever consumer loads a manifest.
- `positionOfLiteral` in `engine/diagnostics.mjs` — for a finding about a literal in a file that is neither a note body nor frontmatter.

### Verified

Against the SoHL content tree, matching what its own scripts report: 1457 notes, every anchor landing, every qualified address resolving, 21 cross-package references via manifest, and 73/73 rules plus 43/43 user guide documents reachable. 854 tests.

Purely additive — but a `^0.12` pin will not cross to 0.13.0, so each consumer bumps its pin **and lockfile** deliberately.

## 0.12.0

_2026-08-22 — link resolution and the link audit_

Three link defects survive both content builds silently, so neither the pack compilers nor a site build catches them:

- **a dead `#anchor`** — a page id is derived by hashing the note id and the anchor slug, and nothing checks that a heading declaring it exists;
- **a dead qualified address** — a `type-shortcode` target resolving to no note is a typo (a bare `[[Name]]` that finds nothing is not: that is a worldbuilding placeholder, and is left alone);
- **a wikilink authored in frontmatter** — both builds copy frontmatter through verbatim, so it publishes as literal `[[…]]` text.

The checks for all three lived in the SoHL repository, inspecting only its own tree. `engine/content-links.mjs` builds the resolution index both builds construct — the type-scoped alias map, the `type/shortcode` and `doc<type>/shortcode` addresses, the vendored foreign manifests — and reports what lands nowhere.

**It parses links the way the builds do now.** It carried its own copy of the wikilink pattern: the *third* in this codebase, and the same drifted one that let an unclosed bracket swallow a document. The checker was parsing more loosely than the compilers it was checking.

**Corpus reachability and retired hostnames are deliberately absent.** Both are statements about what one package publishes rather than about the note format, and both are served by the link graph the module returns (`notes`, `linksOf`, `resolve`) — so a consumer keeps those checks without keeping its own resolver.

Verified against the SoHL content tree: 1457 notes, 0 dead anchors, 0 dead addresses, 0 frontmatter wikilinks, and the same 21 cross-package references answered by manifest that its own script reports. 848 tests.

Purely additive — but a `^0.11` pin will not cross to 0.12.0, so each consumer bumps its pin **and lockfile** deliberately.

## 0.11.0

_2026-08-22 — arms-and-armour abbreviations_

Four words this content names constantly gain abbreviations:

| word | short |
| --- | --- |
| `sword` | `swd` |
| `shield` | `shld` |
| `round` | `rnd` |
| `battle` | `btl` |

The table had none of them, so `Round Shield` addressed a page at `round-shield` where the convention is `rnd-shld` — and the vowel reduction a shortcode falls back to produced `roundshild`, a shortening nobody would have chosen by hand.

Whole-word matching handles the near-misses with no special casing: `Broadsword` is one word, so `sword`'s rule does not reach inside it and the name stays whole.

**Derived addresses change, which is why this is a minor.** A page whose name contains one of these words now publishes at a different URL, and a shortcode suggested from such a name differs too. A `^0.10` pin will not cross to 0.11.0 — each consumer bumps deliberately, and regenerates any copy of the table it keeps.

Verified against the SoHL content tree: 1457 notes still yield 1457 distinct URLs, and the compiled packs remain byte-identical across all 2,828 documents. 829 tests.

## 0.10.0

_2026-08-22 — one wikilink syntax, one slug rule_

An authored `[[…]]` compiles to two addresses — a Foundry `@UUID` for the packs, a URL for the web — and those destinations are the only thing that legitimately differs. The syntax was written twice and **had already drifted**: the web side's pattern omitted `\n`, so an unclosed bracket swallowed everything up to the next `]]` anywhere in the document. `engine/wikilink-syntax.mjs` now owns the pattern and the parse, and both resolvers consume it.

**Breaking renames.** The names now say which address space each resolves into, since that is the whole of the difference:

- `engine/kb-wikilinks.mjs` → `engine/web-wikilinks.mjs`
- `resolveKbWikilinks` → `resolveWebWikilinks`
- barrel namespace `kbWikilinks` → `webWikilinks`

"kb" named one consumer's site section; the resolver already served any site. "html" would be wrong too — it emits Markdown.

**One slug rule.** Four slug-shaped transforms had drifted, and three dropped non-ASCII letters instead of transliterating them: `Kûrbúl Helm` published at `kurbul-helm` while its pack file was `k-rb-l-helm` and a link to a heading of that name pointed at `#k-rb-l-helm`. Twenty-two notes in the SoHL tree were affected. `engine/content-slug.mjs` owns the rule; `helpers`, `web-wikilinks` and `compendiums` consume it. `compendiums` was the worst — `.replace("'", "")` with a *string* argument stripped only the first straight apostrophe and never a curly one.

**`engine/abbreviations.mjs`** — the conventional shortenings for this setting's vocabulary (ranks, offices, materials, units), matched greedily longest-first, whole words only. Applied to **document addresses only**: an anchor key is written by hand, and abbreviating a heading broke a real map pin (`locations.stair-foot` against a heading that became `stair-ft`).

**`protectCode`** joins `codeRegions` and `replaceOutsideCode` in `engine/code-fences.mjs`.

Verified against the SoHL content tree: 1,457 notes yield 1,457 distinct URLs, and the compiled packs are byte-identical across all 2,828 documents. 827 tests.

## 0.9.0

_2026-08-22 — lint a content tree's addresses_

The three rules a content note's **identity** is authored against move into this package, where every consumer gets them, instead of living in the SoHL repository where they only ever inspected SoHL's own tree (#20).

- **Shape** — a `shortcode` is strictly ASCII-alphanumeric. It is the identity key referenced from saved world data, and half of the `type-shortcode` address, whose parse needs the separating hyphen to be the only hyphen.
- **Uniqueness** — `(type, shortcode)` names one note.
- **Alias** — the note physically carries its own address in `aliases`, exactly once. Obsidian resolves a wikilink against the files on disk, so without the alias the address form resolves in the build and is dead in the editor.

```bash
npx content-build lint            # the configured `paths.content`
npx content-build lint some/tree  # or a tree named outright
```

It compiles nothing, opens no LevelDB and needs no Foundry manifest, so it takes about a second and can gate a commit. An empty or untyped tree **fails** rather than passing: "every one of nothing is unique" is a vacuous pass, and it is exactly what a tree that failed to check out produces.

**Why this mattered.** Pointed at the three real trees, two of which nothing had ever checked: `sohl` 1457 notes / 0 findings (matching its own guards exactly), `thalorna` 1738 notes / 4 findings, `kethira` 363 notes / **363 findings** — not one note there carries its address, so the address form of a wikilink has never resolved in that vault.

**Also fixes SoHL#1678.** The uniqueness rule now states what the pipeline actually enforces — a document is addressed by `(type, shortcode)` across *every* pack of its document type — rather than the per-pack scope that #1566 made false once a note could declare `pack:`. Duplicates are reported once per offending note, each naming the others.

**New API:** `engine/content-lint` (`lintContentTree`, `auditNoteAliases`, `isAddressAlias`, `isValidShortcode`, `SHORTCODE_PATTERN`), the `contentLint` barrel export, and `positionInFrontmatter` in `engine/diagnostics`.

Purely additive — but a `^0.8` pin will not cross to 0.9.0, so each consumer bumps its pin **and lockfile** deliberately.

## 0.8.0

_2026-08-21 — declarative item fields_

**Item builders now declare the frontmatter they consume.**

The mapping from a note's `sohl:` frontmatter to the emitted `system` block
lived inside each builder's function body, so nothing could read it — not a
documentation generator, not a validator, not a person (#22).

The declaration is now the only statement of that mapping, and the builder is
generated from it:

- `engine/field-spec.mjs` — the declaration primitives, the coercions, and
  `buildFromFields`, which turns a field list into the builder that runs.
- `sohl/item-fields.mjs` — all thirteen SoHL item types, each field with its
  name, target, shape, requiredness, default and a one-line description.
- `engine/field-reference.mjs` and `content-build docs item-fields` — the
  authoring reference, rendered from whatever the resolved configuration
  declares.

**New in the configuration contract:** an `itemBuilders` entry may carry
`fields` alongside `system` and `img`, so a consuming repository declares — and
documents — its own item types the same way. The key is optional; a type that
omits it compiles exactly as before and is simply undocumented.

**No behaviour change.** Compiling the SoHL content tree before and after
produces 2,828 byte-for-byte identical pack documents, 1,230 of them items.

Consumers pick this up with a pin bump; nothing breaks on the old one.

## 0.7.0

_2026-08-21 — parseable, located diagnostics_

**Diagnostics about a content note now name the file, line and column.**

A warning used to name the note by `name.full`, which is not an address — four
identical warnings on one note were indistinguishable, and each had to be hunted
for in a file the build had already read. Every diagnostic is now emitted in the
form every C-family compiler, `tsc` and ESLint already use, so an editor's error
matcher or a CI annotator resolves it with no knowledge of this build:

```text
assets/content/Regions/Capital_Nome.md:43:635: warning: unresolved wikilink [[Kenbet_Pat|Kenbet'Pat]] (unknown) in "The Capital Nome"
```

Two rules keep it parseable: the locator starts the line (diagnostics bypass
`loglevel`, whose `[timestamp] [WARN]:` prefix sits where a parser reads the
path from), and a field is dropped rather than guessed — nothing defaults to
`1:1`.

#### Breaking

- **`expandNoteTables` returns `{ markdown, lineMap }`**, not the markdown
  string. `engine/*` is a public export, so a direct importer must be updated.
  A `^0.6` pin will not cross to 0.7.0; each consumer bumps deliberately.

#### Also in this release

- `parseMarkdownFile` additionally returns `bodyLine` / `bodyColumn`.
- `expandContentTables` additionally returns `lineMap`; its `errors` entries
  carry the failing directive's `line`.
- `convertWikilinks`' `unresolved` entries carry `offset`.
- `convertNoteWikilinks` accepts `file` / `bodyLine` / `bodyColumn` / `lineMap`;
  its thrown errors carry `file` and `position`.
- `BasePackCompiler` publishes the note being compiled as `currentNote` and
  exposes `noteWarn` / `noteError`, so a pass reports a position without every
  method being handed one. The map warnings and the actor-compiler errors go
  through it too — both previously named a note and no file.
- A link a `dataview` table generated is blamed on the directive that produced
  it and reports **no** column, since there is no authored character to point at.

Progress and summary lines are unchanged.

Closes #17.

## 0.6.0

_2026-08-21 — default art by builder, ambiguous links now fail_

**Breaking**

- An item type's **default art now travels with its builder** (#11). An
  `itemBuilders` entry may be `type: buildFn` as before, or
  `type: { system: buildFn, img: "…" }`. A consuming repository can finally
  declare art for its own item types; previously art was looked up in a table
  this package ships and a consumer could not add to, so a consumer's own type
  compiled only while every one of its notes carried an explicit `img:`.
- An **ambiguous wikilink now fails the compile** instead of warning (#13), and
  the message names the notes that collided rather than the note that cites
  them. An ambiguous address matched real content twice; there is no defensible
  way to pick one, and the fix is mechanical — write the qualified form. The
  knowledgebase build has always treated this as fatal, so the two builds now
  agree. Verified against every consumer: 0 links would fail in
  Song-of-Heroic-Lands-FoundryVTT, sohl-thalorna or sohl-kethira-basic.

**Fixed**

- A Scene `levels` entry is described by the shape it actually has (#12).
- An empty `relation` / `skillAptitudes` list reads as an empty map (#10).

**Upgrading**

Consumers pin `^0.4.0` = `>=0.4.0 <0.5.0`, so this release does not reach anyone
on its own — both the manifest and the **lockfile** must move, since `npm ci`
installs what is locked. Dependabot is configured in all three consumers with
this package as its own single-package group and will open one pull request each
now that a version exists to bump to.

## 0.4.0

_2026-08-20 — retire the character/creature content types_

Retires `character` and `creature` in favour of a single `being`, reported rather than silently routed to the items pack. Also carries the lazy-config change from #4. See #5, #6.
