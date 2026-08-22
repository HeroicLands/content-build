---
"@heroiclands/content-build": patch
---

**Release from merged changesets instead of a remembered command**

Fixes [#15](https://github.com/HeroicLands/content-build/issues/15). Releasing was
hand-driven — bump `package.json` on a branch, merge, then remember
`gh release create`, because cutting the Release is what published. Nothing
enforced the last step, so on 2026-08-21 `main` carried 0.5.1 while npm served
0.4.0: two versions merged and never published, with no check red.

- Every pull request now declares its bump as a `.changeset/*.md` file, and CI's
  **Changeset declared** job fails one that does not. `npx changeset add --empty`
  is how a change says it needs no release — explicitly, rather than by omission.
- Merging to `main` opens a **Version Packages** pull request carrying the bump
  and the rewritten `CHANGELOG.md`. An unreleased state is now a pull request
  waiting in the queue rather than nothing at all.
- Merging that runs `changeset publish`: npm publish, the `v<version>` tag, and
  the GitHub Release with the changelog section as its body. The OIDC Trusted
  Publishing step is unchanged and still last; there is still no `NPM_TOKEN`, and
  re-running on a published version is a no-op.
- `CHANGELOG.md` is seeded from the eleven hand-cut Releases so far and now ships
  with the package.
