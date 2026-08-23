---
"@heroiclands/content-build": minor
---

**`content-build manifest` emits a package's link manifest, so no consumer
writes the walk itself (#58).**

`writeManifests` could always write a manifest; nothing could _derive_ one. So a
repository that publishes one wrote the walk, the address derivation, the anchor
pass and the entry assembly for itself — 285 lines in `sohl`, 300 in
`sohl-thalorna` — and the two drifted in ways nobody chose. One routed its UUIDs
through the pack router and one did not, so a repository shipping several packs
of a type published UUIDs naming the wrong one.

```bash
npx content-build manifest              # the configured tree and output directory
npx content-build manifest --out tmp/   # or somewhere else
```

It takes no paths. The content tree, the output directory, the two package
identities and the address scheme all come from configuration; `[root]` and
`--out` exist to point the same derivation at a scratch tree.

**The base a manifest records against is gone from the interface, because it was
never an input.** Both scripts built a site-absolute URL and handed
`buildManifest` the base it was built from, whose first act is to strip that same
prefix back off — the value provably never reached the file. Addresses are now
derived package-relative from the start. What survives is the two-state
distinction `publish.site` already carries: a build that publishes no pages emits
entries with no `path`, exactly as a note that compiles into no document emits
none with no `uuid`.

**What genuinely differed between the two consumers is now one setting, shared
with the page build.** Where the content tree mounts inside the package, and
which note addresses a whole section rather than a page within one, are both
load-bearing — `sohl` records `kb/affliction/aconite/` and `thalorna` records
`affiliation/the-aerarium-imperii/` — and reading them in one place is what stops
a manifest asserting an address the site does not publish:

```yaml
publish:
  site: true
  manifests: { publish: true, consume: true }
  address:
    prefix: kb/ # default "" — the content tree mounts at the package root
    landing: readme # readme | collection
```

`landing` names which note is a section's landing page: `readme` (a `README.md`
addresses its section) or `collection` (a `doc` note whose `category` is
`collection` addresses the section it introduces, named by its authored
`section`). The two are alternatives, not a pair that could both apply — each
live content tree holds notes the other rule would move.

**Verified byte-for-byte against both consumers**: the command reproduces
`sohl`'s manifest (2,691 entries from 1,457 notes) and `sohl-thalorna`'s (2,367
entries) exactly as the scripts it replaces emit them, on the same toolchain.

Also new:

- `paths.manifestOut` (default `build/manifests`) — where the manifest is
  written. Deliberately not `paths.manifests`, which is the _inbound_ directory
  of vendored foreign manifests that `links` consumes.
- `publish.manifests.publish` is enforced as a declaration rather than a
  preference: with it off, emitting fails instead of writing a file other
  repositories would vendor and read as authoritative. The check lives in the
  library, so a caller that bypasses the command cannot bypass the declaration.
- A note the scheme yields no address for is reported as a located diagnostic and
  omitted, never guessed — the old scripts printed a loose list.
- `engine/manifest-emit.mjs` exports the pass (`collectManifestEntries`,
  `entriesForNote`, `anchorsOf`, `emitLinkManifest`) for a consumer that needs a
  step of it rather than the whole command.
