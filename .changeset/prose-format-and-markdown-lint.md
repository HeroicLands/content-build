---
"@heroiclands/content-build": minor
---

Own prose formatting and markdown linting, so a consumer invokes rather than
configures (#69).

Two new commands:

- `content-build format [paths..] [--write]` — Prettier, with the shared
  configuration.
- `content-build markdown [paths..] [--fix]` — markdownlint, with a narrow,
  individually justified rule set covering the structure Prettier is indifferent
  to: a skipped heading level, two sibling headings claiming one anchor, a
  reversed `(text)[url]`, a bare URL, an empty link, a table row with the wrong
  cell count, and the emphasis markers these repositories write.

**Why here.** Nothing checked the _shape_ of the markdown this package compiles
— `lint` checks addresses, `links` checks that links land. Each consumer wired
prose checking itself, so coverage was lopsided: SoHL ran both tools, thalorna
had Prettier but never from `lint`, and kethira had neither, leaving the package
least likely to have been proofread checked for addresses and nothing else. This
package is the only one all three consume.

**Both are defaults, not overrides.** A consumer's own Prettier config or
`.markdownlint-cli2.jsonc` wins. Repository-layout knowledge — which paths to
skip — stays in that repository's `.prettierignore` and `.gitignore`, both
honoured natively. `CHANGELOG.md` is skipped by default, since `changeset
version` regenerates it in every repository here.

Neither tool's file discovery is reimplemented, so `content-build format` and a
bare `prettier --check .` report the same thing — verified against SoHL's tree
(2,470 files, identical result). A file Prettier cannot parse is reported as a
located finding rather than taking the run down, which is how
`sohl-kethira-basic`'s invalid `lang/en.json` was found
(HeroicLands/sohl-kethira-basic#34).

The shared rules are also exported for editors, so format-on-save agrees with
the lint chain: `@heroiclands/content-build/prettier` and
`@heroiclands/content-build/markdownlint`.

_New runtime dependencies:_ `markdownlint-cli2`, and `prettier` moves from a dev
dependency to a real one — the commands run them in process.
