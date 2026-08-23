---
"@heroiclands/content-build": minor
---

**`docs item-fields` renders the page a consumer publishes, not just the
tables.**

The command existed but no consumer could use it: it emitted the generated
tables and nothing else, so a repository that wanted a page — with a heading, a
"See also" line, and a paragraph telling the reader what they are looking at —
wrapped the renderer in a script of its own. That script was the thing the
command line exists to remove.

A new top-level `docs:` section says what is the consumer's:

```yaml
docs:
  itemFields:
    title: Item Note Frontmatter
    out: kb/dev-docs/content-creator/item-frontmatter.md
    preamble:
      - "See also: [The Authoring Workflow](authoring-workflow.md)"
      - ""
      - Every item note carries the envelope described there.
```

`--check` compares against the file already there and writes nothing, so a
repository can gate on the page being current without a temporary file or a
second implementation of the comparison.

**The page is now what Prettier would write.** A consumer commits it and formats
its repository, so a generator that disagreed with the formatter by one
character would have its output rewritten on the next format run and then called
stale by `--check` on every clean checkout — the two undoing each other forever.
Three things were making that happen, and all three are fixed at the source
rather than by adding a formatting pass:

- Table columns are padded to their widest cell, which is what Prettier's
  alignment comes to for this content.
- The worked example's fence said `yaml`, but the block is a whole note —
  frontmatter _and_ the prose beneath it. Prettier formats a fenced block in the
  language it declares, so labelling it YAML both misdescribed it and dropped the
  blank line after the frontmatter. It is `markdown`.
- One field description used `*emphasis*`; Prettier normalises to `_emphasis_`.
  Fixed where it is written rather than by rewriting markers on the way out.

`tests/field-reference.test.ts` asserts the rendered page survives Prettier
unchanged, so if its markdown printer changes — or a field description starts
using a construct it normalises — that fails here, in the package that generates
the page, rather than in the repository that publishes it.

Also clears prose left behind when the manifest template was retired: the
`paths.packageManifest` typedefs, and a `config.mjs` example still showing a
`foundryPackage` that is now rejected.
