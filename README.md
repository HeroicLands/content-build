# @heroiclands/content-build

The shared toolchain that compiles a **HeroicLands content tree** — a folder of
Markdown notes with YAML frontmatter — into **Foundry VTT compendium packs**.

Every HeroicLands content module (`sohl`, `thalorna`, `kethira`, and the
adventure modules) builds its packs from this one implementation, rather than
from a copied `utils/packs/` tree.

It ships a command line as well as a library — see
[Command line](#command-line) for the whole surface.

## Install

```
npm install -D @heroiclands/content-build
```

## Configure

A consuming repository declares one `content-build.config.yaml` at its root:

```yaml
# The value each content note carries in its `package:` frontmatter.
contentPackage: thalorna
# Where Foundry installs it: "systems" or "modules". Also decides the served
# asset root a note's `img:` resolves to — `modules/sohl-thalorna/assets/…`.
packageKind: modules

# The Foundry core range this package supports. `minimum` is stamped into every
# compiled document as `_stats.coreVersion`; `verified` names the newest build
# the full suite has actually passed on — never an aspiration.
compatibility:
  minimum: "14.359"
  verified: "14.364"

# What this package declares about others, in Foundry's own shape. A module's
# `_stats.systemVersion` comes from the `verified` version of the system it
# targets — note that this `compatibility` is the *system's* range, not
# Foundry's. Same key, different subject.
relationships:
  systems:
    - id: sohl
      type: system
      manifest: https://github.com/HeroicLands/Song-of-Heroic-Lands-FoundryVTT/releases/latest/download/system.json
      compatibility:
        minimum: "0.4.0"
        verified: "0.4.3"

# Stamped into every compiled document's `_stats`. `coreVersion` and
# `systemVersion` are both absent on purpose — see the derived table below.
stats:
  systemId: sohl
  lastModifiedBy: thalornabuild000

# Which content types compile into Items, and what builds each one's `system`
# block — named, because the registry is code. The registry's keys are the
# accepted item types, so a type cannot be whitelisted without a builder behind
# it. A module that ships no items omits this key. See "An item type's default
# art" below, and "A registry of your own" for the `.mjs` form.
itemBuilders: sohl

# Directory names the content walk ignores wherever they appear.
skipDirectories: [Templates]

# Optional; each path is relative to this file's directory and defaults to the
# conventional layout shown here.
paths:
  content: assets/content
  manifests: assets/manifests
  packJson: build/packs-json
  stage: build/stage/packs
  unpack: build/tmp/packs

# The one pack list. Order is load-bearing where one pass reads another's
# output, and `packDirectories` is derived from it.
packs:
  - { name: items, type: Item, label: Items, folders: item-folders.yaml }
  - { name: journals, type: JournalEntry, label: Journals }
  # A companion is written by its parent's pass rather than one of its own.
  - name: scenes
    type: Scene
    companions:
      - { name: adventures, type: Adventure }

# How this repository frames the pages `content-build docs` generates. The
# tables come from the itemBuilders registry and are the same everywhere; the
# heading, the filing and what a reader is told first are this repository's.
docs:
  itemFields:
    title: Item Note Frontmatter
    out: kb/dev-docs/content-creator/item-frontmatter.md
    preamble:
      - "See also: [The Authoring Workflow](authoring-workflow.md)"
      - ""
      - Every item note carries the frontmatter envelope described there. This
        page covers what each **type** adds to it.

# Reserved for @heroiclands/package-build, which validates what is inside it.
# One repository describes itself in one file; the two build packages split by
# input, and neither learns the other's schema. Values package-build needs that
# already live at the top level — `packageKind`, `foundryPackage` — it reads
# from there rather than restating them here.
packageBuild:
  assets:
    - { from: assets/icons, to: assets/icons }

# Three independent switches — every combination is real.
publish:
  site: true
  manifests: { publish: true, consume: true }
```

The loader validates the document, resolves every path against the directory
the file sits in, fills the optional halves with their defaults
(`skipDirectories: []`, `packageBuild: {}`, the conventional `paths`, every
publishing switch off),
derives `assetRoot`, `packDirectories`, `itemTypes` and `docEntryTypes`, and
freezes the result. A malformed configuration throws a `TypeError` naming the
offending field, so it fails at load rather than as an empty pack much later.

**Four values are derived rather than authored**, because each is something a
file can be asked for rather than told:

| Field                 | Derived from                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `rootDir`             | the directory the configuration file sits in                                                                                      |
| `foundryPackage`      | the `name` of the adjacent `package.json`, verbatim                                                                               |
| `stats.systemVersion` | a **system**: that `package.json`'s `version`. A **module**: the `verified` version of the system it declares a relationship with |
| `itemBuilders`        | the named registry (`sohl`), required lazily so importing costs nothing                                                           |

**Authoring any of the first three is an error**, not an override. Each was
previously transcribed from a file that already stated it, and a transcription
is free to disagree with what it copies — `stats.systemVersion` froze at
`0.6.0` for four releases before anyone noticed, and was still frozen there in
two repositories afterwards.

A module does **not** take its system version from its own `package.json`: that
is the _module's_ version, and stamping it would claim a system version that
never existed. A module declaring no usable system relationship fails the build
rather than guessing — a wrong `_stats.systemVersion` is invisible until
something migrates on it.

### A registry of your own

`itemBuilders` is the one part of the contract that is code — a table of
functions building each type's `system` block — so data can only _name_ one of
the registries this package ships. A consumer supplying its own writes
`content-build.config.mjs` instead, which is loaded in place of the YAML:

```js
import { defineConfig } from "@heroiclands/content-build/config";
import { ITEM_BUILDERS } from "./build/item-builders.mjs";

export default defineConfig({
  // Stated, since a code configuration derives nothing: it is code, and can
  // read whatever it likes for itself.
  rootDir: import.meta.dirname,
  contentPackage: "kethira",
  foundryPackage: "sohl-kethira-basic",
  packageKind: "modules",
  compatibility: { minimum: "14.359", verified: "14.364" },
  stats: { systemId: "sohl", systemVersion: "0.4.3", lastModifiedBy: "…" },
  itemBuilders: ITEM_BUILDERS,
  packs: [{ name: "items", type: "Item" }],
});
```

The two forms end at the same `defineConfig`, so they are validated and frozen
identically; a code config simply states the three fields above itself, which it
can, because it is code. **Import `defineConfig` from
`@heroiclands/content-build/config`, never from the package root** — the root
barrel pulls in the compilers, the compilers read the resolved configuration,
and resolving it loads this file, so importing the barrel here closes a cycle
around the file's own evaluation. The `/config` entry point imports nothing but
`node:path` and the id helpers, so it cannot.

**One directory, one configuration.** A directory holding both a `.yaml` and an
`.mjs` is an error, not a precedence question: picking one would let a
repository mid-conversion build from the file its author is no longer editing,
and look entirely healthy doing it.

### Several packs of one document type

A repository may declare more than one pack of the same `type`, and route notes
between them. Editorial grouping of same-type documents into separate
compendiums is ordinary Foundry practice — "Core Spells" and "Expanded Spells"
are two Item packs — and it matters beyond taste: a compendium UUID carries its
pack name (`Compendium.<package>.<pack>.Item.<id>`), so collapsing several packs
into one invalidates every reference an existing world holds.

Two axes, deliberately orthogonal:

- a pack's **`type`** selects the _compiler_ that fills it;
- a note's **`pack:`** frontmatter selects _which pack of that type_ receives its
  document.

```yaml
packs:
  - { name: characteristics, type: Item, default: true }
  - { name: mysteries, type: Item }
  - { name: journals, type: JournalEntry }
```

```yaml
# A note that says nothing lands in `characteristics`, the default Item pack.
---
name:
  full: Climbing
type: skill
package: kethira
id: ...
---
# A note that names one lands there instead.
---
name:
  full: Second Sight
type: skill
package: kethira
id: ...
pack: mysteries
---
```

- **`pack:` is optional, and silence means the default.** Every note written
  before this existed declares nothing, so an undeclared note must keep
  compiling exactly where it always did. A type with exactly **one** pack is
  that type's default implicitly; a type with several designates one with
  `default: true`. Where several exist and none is marked, a declaration is
  **mandatory** and an undeclared note fails the build.
- **A `pack:` naming no configured pack is a build error**, not a fall-through to
  the default. A typo'd name that quietly landed content in the wrong compendium
  would be silent partial compilation — the failure mode this toolchain's guards
  exist to eliminate. The same applies to a name that belongs to a pack of
  another document type, or to a companion (no note is ever routed into one).
- **A note's `pack:` names where its _own_ document goes.** Anything derived from
  it — an item's or a macro's prose, which compiles into a JournalEntry of its
  own — lands in the default pack of _that_ type.

**The configuration is found by walking up, not from the working directory.**
`engine/pack-config.mjs` climbs from itself — so it works from `packages/` and
from `node_modules/` alike, and does not depend on the directory the build was
launched from. Set `CONTENT_BUILD_CONFIG` to point at the file explicitly if a
consumer keeps it somewhere else.

**The configuration is resolved on first read, never at import.** Every module
here can be imported — and `content-build --version` and `--help` answered — in a
directory with no `content-build.config.yaml` and no Foundry package manifest, so
a consumer can reach for one pure helper (`engine/content-slug`,
`engine/wikilinks`) without standing up a pack build. Anything derived from
configuration is therefore an accessor rather than a hoisted constant —
`loadPackConfig()`, `contentPackage()`, `foundryPackageId()`, `itemTypes()`,
`docEntryTypes()`, `packRouter()`, `defaultTemplateDir()` — and each throws, with
the same explicit message as before, the moment a build actually needs a value it
cannot find. Absence is still a hard failure; only the moment it is reported
moved (#2).

The file is read synchronously — an `.mjs` one with `require` — so that reading
a configured value stays an ordinary expression instead of making every module
downstream of it an async one. The one shape that cannot be loaded is an `.mjs`
config whose own module graph uses top-level `await`, which is reported as such.

**`itemBuilders` is how the engine learns a consumer's item types without
holding its data model.** `itemTypes` is its key set, and `docEntryTypes` — every
type whose prose compiles into a JournalEntry of its own — is composed from it
exactly once, here, and read through `loadPackConfig()` everywhere. There is one
resolved set at runtime; the compilers and the link-manifest emitter cannot come
to disagree about which notes carry documentation.

The Item compiler **dispatches through that same resolved table**, via
`engine/item-registry.mjs` (`itemTypes()` and `itemBuilder(type)`), so the types a
consumer's notes are accepted for and the builders they compile with are one
object. Supplying `itemBuilders` is therefore all a consumer does to define an
item type of its own; a table this package ships is one possible value, not the
one the compiler holds.

**Configuration is the source, and the manifest is generated from it.** That
arrow used to point the other way: `paths.packageManifest` said where a
hand-authored `system.template.json` lived, and the package-id guard and the
`_stats.coreVersion` stamp both read out of it. Both are gone — the floor is the
top-level `compatibility.minimum`, the id is derived from `package.json`
`name`, and `@heroiclands/package-build` writes the manifest from this file.

### An item type's default art

A note that carries no `img:` gets its type's **default art**, and a type
declares that art in the same place it declares its builder. An `itemBuilders`
entry may be written two ways:

```js
itemBuilders: {
  // A bare builder. Every note of this type must carry its own `img:`.
  charm: buildCharm,
  // The same builder, paired with the art a note of this type gets when it
  // sets no `img:` of its own.
  relic: { system: buildRelic, img: "icons/relic.svg" },
}
```

Both spellings are equal; the difference is only whether the type brings art.
`itemTypes` is still the key set either way, so a type is still impossible to
whitelist without a builder behind it.

**The path is spelled the way a note spells it.** Registry art goes through the
same `resolveImg` rule as a note's `img:`, so `icons/relic.svg` means _this_
repository's asset root — `modules/sohl-relics/assets/icons/relic.svg` — and an
already-served path (`systems/sohl/assets/icons/…`) passes through untouched.

**A type with neither is a build error, deliberately.** When a note sets no
`img:` and its type pairs none, the pack build aborts rather than shipping an
item with a mismatched icon:

```
No default art for item type "relic" — the note carries no `img:`, and the
`itemBuilders` entry for "relic" in this repository's configuration
pairs none with its builder.
```

#### Why art travels with the builder (#7)

It did not always. The item **type** whitelist was derived from a consumer's
`itemBuilders` keys, while the **art** for those same types was looked up in
`sohl/default-item-art.mjs` — a table this package ships for the `sohl` package
and which a consumer cannot add to. A type was therefore configurable while its
default art was not, and a second consumer's own item type compiled only if
every one of its notes carried an explicit `img:`; the first note that omitted
one failed the build with an error naming a module in someone else's package.

Widening that map was not the fix. It is deliberately SoHL data, shared with the
runtime's `SohlItem.getDefaultArtwork` so that the build-time and runtime
defaults are one list and cannot drift (SoHL#932/#1510). Pairing art with the
builder instead moves it onto the seam a type is _already_ declared through, and
costs the `sohl` package nothing: `ITEM_BUILDERS` reads each entry's image out of
that same map, so there is still exactly one map — and the drift a test used to
watch for is now unrepresentable, because building the registry throws if a type
has no art.

## Command line

```
npx content-build package <compile|unpack|clean> [pack] [entry]
npx content-build docs item-fields [--out <path>] [--title <title>]
npx content-build lint [root]
npx content-build links [root] [--manifests <dir>]
npx content-build reachability <dir> [file] [--index <shortcode>]
```

| Command        | What it does                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `package`      | Compile the content tree into LevelDB packs, unpack a shipped pack back to JSON, or clean one. See [Install](#install).       |
| `docs`         | Render a generated reference from the configured registries. `item-fields` is the item-frontmatter page.                      |
| `lint`         | Check a content tree's addresses — shape, uniqueness, alias. See [Linting a content tree](#linting-a-content-tree).           |
| `links`        | Check that every link in the tree lands: dead anchors, dead qualified addresses, wikilinks in frontmatter, drifted manifests. |
| `reachability` | Walk outward from an index note and report what no path reaches, for a tree meant to be navigable from one entry point.       |

Every path, pack name and root it needs comes from the consuming repository's
`content-build.config.yaml`, so the usual invocation takes no arguments beyond
the command itself. What may be named on the command line overrides that.

**Every invocation it accepts is one it performs.** A missing command, an
unknown command, a missing or unknown action, and an unknown option are each an
error that names what was wrong and exits non-zero — never a silent success. A
build chain can therefore treat a zero exit as "the work happened". `--version`
and `--help` still answer in a directory with no configuration at all.

## Linting a content tree

```bash
npx content-build lint            # the configured `paths.content`
npx content-build lint some/tree  # or a tree named outright
```

Checks the three rules every note's **identity** is authored against, and
reports each finding in the located form below:

- **Shape** — a `shortcode` is strictly ASCII-alphanumeric. It is the identity
  key referenced from saved world data, and half of the `type-shortcode`
  address, whose parse needs the separating hyphen to be the only hyphen.
- **Uniqueness** — `(type, shortcode)` names one note. A document is addressed
  across _every_ pack of its document type, so routing two same-address notes to
  different packs with `pack:` does not separate them.
- **Alias** — the note physically carries its own `type-shortcode` address in
  `aliases`, and carries exactly one address-shaped alias. Obsidian resolves a
  wikilink against the files on disk, so without the alias the address form
  resolves in the build and is dead in the editor.

It compiles nothing, opens no LevelDB and needs no Foundry manifest, so it runs
in about a second and can gate a commit. An empty or untyped tree **fails**
rather than passing: "every one of nothing is unique" is a vacuous pass, and it
is exactly what a tree that failed to check out produces.

Nothing here writes. A check reports and an author fixes.

## Diagnostics

Every warning or error a build reports **about a content note** is emitted in the
form every C-family compiler, `tsc` and ESLint already use, so an editor, a CI
annotator or a `grep` parses it with no knowledge of this build:

```text
assets/content/Regions/Capital_Nome.md:43:635: warning: unresolved wikilink [[Kenbet_Pat|Kenbet'Pat]] (unknown) in "The Capital Nome"
```

`file:line:column: severity: message`. The path is relative to the working
directory — during a build, the consuming repository's root.

Two rules keep it that way, both in `engine/diagnostics.mjs`:

- **The locator starts the line.** Diagnostics deliberately bypass `loglevel`,
  whose `[timestamp] [WARN]:` prefix sits exactly where a parser reads the path
  from; a greedy path pattern swallows the prefix and yields a filename nothing
  can open. Progress and summary lines still go through `loglevel` — they are
  not about a file and nothing needs to parse them.
- **A field is dropped, never guessed.** A diagnostic reports the position it
  can establish honestly and no more: `file:line: …` when the column is
  meaningless, `file: …` when only the note is known. Nothing defaults to
  `1:1`, which would send a reader to the frontmatter every time.

Establishing a position at all takes three corrections, applied only where they
hold — see `positionInBody`. A body offset is not a file line until the
frontmatter's lines are added (`bodyLine`); the trim that strips the body can
take indentation off its first line (`bodyColumn`); and a body is scanned
_after_ its content tables expand, so an offset may land in text nobody
authored. `expandContentTables` therefore returns a `lineMap` saying which
authored line each emitted line came from — a generated row is blamed on the
directive that produced it and reports **no column**, because there is no
authored character to point at.

## Layout

- **`@heroiclands/content-build/engine`** — package-agnostic machinery: the
  content walk, frontmatter, tables, wikilinks, ids, folders, the link manifest
  and the web-address rule, `BasePackCompiler`, and the generic Foundry document
  compilers.
- **`@heroiclands/content-build/sohl`** — Song of Heroic Lands data-model
  knowledge: item types, builders, the items and actors compilers, and default
  art. Isolated behind its own entry point so an adventure module never receives
  `buildWeaponGear`.

Each module is also reachable as its own entry point —
`@heroiclands/content-build/engine/journals`,
`@heroiclands/content-build/sohl/items` — so a build that needs one thing does
not load the whole pipeline. The barrels re-export each module as a namespace
rather than flattening it, because several modules deliberately re-export a
neighbour's symbol and a flattened star export would drop every such name
silently.

A few plain-ESM leaves are shared **with the Foundry runtime**, not just with the
build: the item default-art map, the curated region-event vocabulary, and the
affiliation standings. Each has its own entry point —
`@heroiclands/content-build/sohl/default-item-art`,
`.../engine/region-events`, `.../sohl/affiliation-standings` — so a client bundle
reaches the constant without importing a barrel that grows to hold compilers
reading the filesystem. Keeping one copy of each is the point: the build-time and
runtime values cannot disagree, which is the drift that produced #932.

`@heroiclands/content-build/config` exposes the configuration contract's own
module, so a consumer can name its types (`ContentBuildConfig`, `PackSpec`) from
JSDoc.

## Tests

The package carries its own suite and its own vitest project, so it is
verifiable without the repository that happens to host it:

```
npm test -w @heroiclands/content-build     # from the SoHL repository root
npm test                                   # from packages/content-build/
```

The SoHL repository's root `npm run test` names the very same project config, so
one command still gates everything CI runs and neither entry point can drift
into a different suite.

The harness is deliberately austere: no global setup, no Foundry stubs, and no
alias onto a consuming repository's source. `tests/suite-is-self-contained.test.ts`
enforces that — a test in this suite that reached for `globalThis.game` or `@src`
would pass in situ and fail the moment the package was installed from npm.

`tests/dependencies-are-declared.test.ts` guards the same failure from the
shipping side. Because this package is a workspace, npm hoists the root
repository's `devDependencies` into the workspace root, so an import this
package never declared still resolves here and fails nowhere but a consumer's
install (#1557). The test walks every module named by the `files` field and
holds each bare specifier to one of three cases — a Node builtin, this package
addressing itself, or a declared `dependency` — and checks the converse: nothing
shipped may import a `devDependency`, and no declared dependency may go
unimported.

## Releasing

Releasing is not a command anyone runs. It is a consequence of merging, in two
steps, and each step is visible while it is pending.

**Every pull request declares its bump.** Run `npx changeset` and pick
major/minor/patch; the summary you write becomes the changelog entry and the
release note. If the change ships nothing a consumer can see, say so explicitly
with `npx changeset add --empty`. CI's **Changeset declared** job fails a pull
request that declares neither — `npm run changeset:check` is the same check,
locally.

**Merging to `main` opens a Version Packages pull request** carrying the version
bump and the rewritten `CHANGELOG.md`. That pull request _is_ the pending
release: as long as something is merged but unpublished, there is an open pull
request saying so. This is the whole point of the pipeline — the previous,
hand-driven process failed by leaving _nothing_ behind when the final step was
forgotten, and on 2026-08-21 it did exactly that for two versions (#15).

**Merging that publishes.** `changeset publish` puts the version on npm through
Trusted Publishing (OIDC — there is no `NPM_TOKEN`), tags the commit `v<version>`
and cuts the GitHub Release with the changelog section as its body. It publishes
only versions that are not already on the registry, so re-running it is a no-op;
`workflow_dispatch` on **Publish to npm** is the recovery path if a run fails
after versioning.

Below 1.0.0, `^0.x` never crosses a minor — a consumer on `^0.15.0` will not see
`0.16.0` until it bumps the pin deliberately. Dependabot raises that as its own
pull request in each of the three consuming repositories.

> After a successful publish, `npm view @heroiclands/content-build version` can
> report the _previous_ version for a minute or so. `dist-tags` is correct
> immediately, and is what the workflow prints.

## License

GPL-3.0-or-later — see the
[SoHL repository](https://github.com/HeroicLands/Song-of-Heroic-Lands-FoundryVTT).
