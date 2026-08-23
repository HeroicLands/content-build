---
"@heroiclands/content-build": minor
---

**The package-id guard is deleted, and with it every read of the shipped
manifest.** A single source needs no corroboration.

`assertPackageIdMatchesManifest` existed because the package id was declared
twice — once in configuration, once in a hand-authored manifest template — and
guarded the pair against drift (#1503). content-build 1.0.0 derived the
configured half from `package.json`; package-build 0.3.0 generates the manifest
from that same configuration. The guard was left in place through both, since
deleting it before the second declaration was actually gone would have removed a
check that still checked something. Both are gone now, and it compares a derived
value against itself.

Removed rather than repaired, along with everything that only existed to serve
it: `engine/package-manifest.mjs` entire — `resolvePackageManifestPath`,
`readPackageManifest`, `readManifestPackageId`,
`assertPackageIdMatchesManifestFile` — its barrel export, and the
`paths.packageManifest` key.

**`content-build package unpack` reads the configured pack list.** It took the
list out of the shipped manifest, which was the same second declaration one
level along. Nothing in the toolchain opens a manifest template now, so a
repository that has deleted `assets/templates/` compiles, unpacks and stamps
exactly as before.

**Breaking for any configuration still declaring `paths.packageManifest`** — the
key is refused, naming it. Every consumer drops it in the same change that
deletes its template.
