---
"@heroiclands/content-build": minor
---

**`content-build site` publishes a content tree as a website, so no consumer
writes the pipeline itself (#63).**

Compiling a content tree into compendium packs was `content-build package
compile`. Publishing the _same tree_ as a website was a script each consumer
wrote for itself — 473 code lines in `sohl`, 462 in `sohl-thalorna`, 87 of them
identical — and the copies drifted where nobody could see it. `sohl-thalorna`
reimplemented four things this package already exported, not because it needed
different behaviour but because its script predates the extraction.

```bash
npx content-build site               # the configured tree and output
npx content-build site --out tmp/kb  # or somewhere else
```

The command does the walk, the frontmatter read, the address derivation, the
address index, table expansion, wikilink resolution, code-fence protection, the
foreign-manifest merge, page emission, and the section-landing backfill.

**Addresses are not part of the new `site:` section.** They come from
`publish.address`, the same setting `manifest` reads, so a page and its manifest
entry cannot disagree about where the page is. `site:` is framing only — the
output root, the base, which packages are rendered, what a section is called,
which extra trees are published beside the content, and which named pass bundle
supplies the repository's own body rewrites.

**Consumer passes are named, not imported.** A repository's own rewrites are
code and a configuration is data, so a configuration names a bundle and the
toolchain resolves it, exactly as `itemBuilders` names an item registry.
`sohlKb` is the bundle for the `sohl` knowledgebase — `{@link}` against a
TypeDoc symbol map, and repository-relative links in developer docs. A bundle
supplies `beforeLinks` (every page, before wikilinks resolve) and `afterLinks`
(extra-tree pages only), both inside code-fence protection.

**Every gate reports; none exits.** The seven integrity checks — a wikilink in
frontmatter, a name yielding no slug, two notes claiming one URL, an unusable or
unaddressable vendored manifest, an address two packages both claim, a bad table
or dead link — were inline `process.exit` calls in both scripts, with no test
between them. They now return findings and the command decides, which is the
only reason they can be tested at all.

**Verified byte-for-byte**: the command reproduces `sohl`'s entire published tree
— 1,520 files, 5,479,528 bytes — exactly as the script it replaces emits it.

**A safety note worth stating plainly.** The output tree is wiped on every run so
a renamed note's page cannot linger. An unset `site.out` resolves to the
repository root, and the wipe then deletes the working tree — which happened
while this command was being written, on a configuration that had no `site`
section yet. `site.out` is now required, and refused again unless it resolves
strictly inside the repository root. Both failing shapes are ordinary rather than
exotic, so neither is left to care.

Also new:

- `engine/site-build.mjs` exports each stage (`collectContentPages`,
  `collectTreePages`, `siteGates`, `renderPages`, `writeSectionLandings`) for a
  consumer that needs a step rather than the whole command.
- `sohl/kb-passes.mjs` exports the two `sohl` rewrites directly.
- `gray-matter` is a dependency. It is the authority on the exact bytes of a
  page's frontmatter, and matching it is what makes the byte-identical claim
  above true rather than approximately true.
