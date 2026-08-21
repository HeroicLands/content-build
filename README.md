# @heroiclands/content-build

The shared toolchain that compiles a **HeroicLands content tree** — a folder of
Markdown notes with YAML frontmatter — into **Foundry VTT compendium packs**.

Every HeroicLands content module (`sohl`, `thalorna`, `kethira`, and the
adventure modules) builds its packs from this one implementation, rather than
from a copied `utils/packs/` tree.

It ships a command line as well as a library:

```
npx content-build package compile [pack]
npx content-build package unpack [pack] [entry]
npx content-build package clean [pack] [entry]
```

## Install

```
npm install -D @heroiclands/content-build
```

## Configure

A consuming repository declares one `content-build.config.mjs` at its root:

```js
import path from "node:path";
import { fileURLToPath } from "node:url";
// The *leaf* contract module, never the package root barrel — see the note
// below.
import { defineConfig } from "@heroiclands/content-build/config";
import { ITEM_BUILDERS } from "@heroiclands/content-build/sohl/item-builders";

export default defineConfig({
  // Anchors every configured path, so the build reads the same files whatever
  // directory it was launched from.
  rootDir: path.dirname(fileURLToPath(import.meta.url)),
  // The value each content note carries in its `package:` frontmatter.
  contentPackage: "thalorna",
  // The Foundry package id, as it appears in system.json / module.json.
  foundryPackage: "sohl-thalorna",
  // Where Foundry installs it: "systems" or "modules". Also decides the served
  // asset root a note's `img:` resolves to — `modules/sohl-thalorna/assets/…`.
  packageKind: "modules",
  // Stamped into every compiled document's `_stats`. `coreVersion` is absent on
  // purpose: it is read from the manifest's `compatibility.minimum`.
  stats: {
    systemId: "sohl",
    systemVersion: "0.1.0",
    lastModifiedBy: "thalornabuild000",
  },
  // Which content types compile into Items, and what builds each one's
  // `system` block. The keys are the accepted item types, so a type cannot be
  // whitelisted without a builder behind it. A module that ships no items
  // declares none. An entry may also pair the type's default art — see
  // "An item type's default art" below.
  itemBuilders: ITEM_BUILDERS,
  // Directory names the content walk ignores wherever they appear.
  skipDirectories: ["Templates"],
  // Optional; each path is relative to `rootDir` and defaults to the
  // conventional layout shown here.
  paths: {
    content: "assets/content",
    packageManifest: "assets/templates",
    manifests: "assets/manifests",
    packJson: "build/packs-json",
    stage: "build/stage/packs",
    unpack: "build/tmp/packs",
  },
  // The one pack list. Order is load-bearing where one pass reads another's
  // output, and `packDirectories` is derived from it.
  packs: [
    {
      name: "items",
      type: "Item",
      label: "Items",
      folders: "item-folders.yaml",
    },
    { name: "journals", type: "JournalEntry", label: "Journals" },
    // A companion is written by its parent's pass rather than one of its own.
    {
      name: "scenes",
      type: "Scene",
      companions: [{ name: "adventures", type: "Adventure" }],
    },
  ],
  assets: [{ from: "assets/icons", to: "assets/icons" }],
  // Three independent switches — every combination is real.
  publish: {
    site: true,
    manifests: { publish: true, consume: true },
  },
});
```

`defineConfig` validates the object, resolves every path against `rootDir`,
fills the optional halves with their defaults (`assets: []`, `skipDirectories:
[]`, the conventional `paths`, every publishing switch off), derives `assetRoot`,
`packDirectories`, `itemTypes` and `docEntryTypes`, and returns a deeply frozen
copy. A malformed configuration throws a `TypeError` naming the offending field,
so it fails at load rather than as an empty pack much later.

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

```js
packs: [
  { name: "characteristics", type: "Item", default: true },
  { name: "mysteries", type: "Item" },
  { name: "journals", type: "JournalEntry" },
],
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

**Import `defineConfig` from `@heroiclands/content-build/config`, never from the
package root.** `engine/pack-config.mjs` finds this file by walking up from
itself — so it works from `packages/` and from `node_modules/` alike, and does
not depend on the directory the build was launched from — and then loads it. The
root barrel pulls in the compilers, and the compilers read that resolved
configuration, so a config file that imports the barrel closes a cycle around its
own evaluation. The `/config` entry point imports nothing but `node:path` and the
id helpers, so it cannot. `ITEM_BUILDERS` is imported from its own leaf entry
point for the same reason. Set `CONTENT_BUILD_CONFIG` to point at the file
explicitly if a consumer keeps it somewhere else.

**The configuration is resolved on first read, never at import.** Every module
here can be imported — and `content-build --version` and `--help` answered — in a
directory with no `content-build.config.mjs` and no Foundry package manifest, so
a consumer can reach for one pure helper (`engine/content-slug`,
`engine/wikilinks`) without standing up a pack build. Anything derived from
configuration is therefore an accessor rather than a hoisted constant —
`loadPackConfig()`, `contentPackage()`, `foundryPackageId()`, `itemTypes()`,
`docEntryTypes()`, `packRouter()`, `defaultTemplateDir()` — and each throws, with
the same explicit message as before, the moment a build actually needs a value it
cannot find. Absence is still a hard failure; only the moment it is reported
moved (#2).

The file is loaded with `require`, so that reading a configured value stays an
ordinary synchronous expression instead of making every module downstream of it
an async one. The one shape that cannot be loaded is a config whose own module
graph uses top-level `await`, which is reported as such.

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

**Configuration supplies paths, never captured values.** `paths.packageManifest`
says _where_ the shipped `system.template.json` / `module.template.json` lives;
the package-id drift guard and the compiled packs' `_stats.coreVersion` both read
it from there. The core version itself is deliberately not a config field — it is
the manifest's `compatibility.minimum`, which moves with test evidence, and a
copy would silently stop following it.

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
`itemBuilders` entry for "relic" in this repository's content-build.config.mjs
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

## License

GPL-3.0-or-later — see the
[SoHL repository](https://github.com/HeroicLands/Song-of-Heroic-Lands-FoundryVTT).
