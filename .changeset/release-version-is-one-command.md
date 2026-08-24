---
---

No release: nothing in the published package changes. The release workflow's
`version` step becomes a single npm script instead of a `&&` chain.

`changesets/action` **tokenizes and execs** that input rather than handing it to
a shell, so `npx changeset version && npm install --package-lock-only` was read
as one command with four arguments: `changeset` received `--package-lock-only`,
cac rejected it as an unknown `packageLockOnly` option, and the step failed.

Every release since that chain was introduced has therefore failed — two merged
pull requests published nothing, and the registry sat on 1.4.0 while `main`
carried the changesets for both. The lockfile refresh that chain was added to
perform never ran either, so it did not even buy what it cost.

`npm run changeset:version` is the seam that does get a shell.
