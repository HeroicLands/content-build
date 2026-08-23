---
---

No release: nothing in the published package changes. `release.yml` gains a
lockfile refresh so `changeset version` stops leaving the root `version` on the
previous release's number, and `package-lock.json` catches up to the 1.4.0 that
`package.json` already declares and the registry already carries.

Deliberately empty rather than a patch bump — versioning the package to record
that its own release pipeline was corrected would publish an identical artifact
under a new number.
