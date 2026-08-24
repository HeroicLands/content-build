---
"@heroiclands/content-build": minor
---

Apply the shared markdown indentation in a repository that declares no Prettier
config of its own (#76).

`content-build format` fell back to the shared configuration object and passed
it inline to Prettier. **Prettier applies an `overrides` block only while
resolving a config file**, never to options handed to it directly, so the
`**/*.md → tabWidth: 2` override was silently dropped and markdown was formatted
at the global `tabWidth: 4`.

Pointing `resolveConfig` at the shipped config file does not fix it either:
Prettier matches an override's glob relative to **the config file's own
directory**, and that file lives inside `node_modules`.

**Only a consumer with no Prettier config was affected** — which is every
repository this command was added for. One with a config resolves it from its
own root and was always correct, which is why this repository and
`Song-of-Heroic-Lands-FoundryVTT` both reported clean.

Caught while adopting the command in `sohl-thalorna`: it proposed rewriting
**1,738 content notes**, converting YAML frontmatter from 2-space to 4-space.
SoHL's notes are 2-space, so that is precisely backwards for a configuration
whose purpose is that a note formatted in one repository is formatted the same
way in the next. Verified after the fix: a real thalorna note is now returned
byte-identical, and the tree reports zero markdown findings.

The values are now declared once as `PRETTIER_BASE` + `PRETTIER_MARKDOWN`, with
`PRETTIER_CONFIG` composing them into the shape a config file wants and the new
`sharedPrettierOptionsFor(file)` giving the runner the same values as flat
options. One source, two presentations, and nothing passes `overrides` inline
again.
