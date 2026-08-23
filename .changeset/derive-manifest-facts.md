---
"@heroiclands/content-build": major
---

**Four keys change hands: two stop being authored, two start.** All four were
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
