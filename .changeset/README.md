# Changesets

Every pull request declares its intended version bump here, as a file, before it
merges. That declaration is the whole release process: merging it to `main` opens
a **Version Packages** pull request, and merging _that_ versions the package,
rewrites `CHANGELOG.md`, tags the commit, cuts the GitHub Release, and publishes
to npm. Nothing is run by hand.

## Adding one

```bash
npx changeset            # pick major / minor / patch, write the summary
npx changeset add --empty   # this change ships nothing a consumer can see
```

`npm run changeset:check` is what CI runs: it fails when the branch changes the
package but adds no changeset. An empty changeset satisfies it — that is the
"this needs no release" declaration, made explicitly rather than by omission.

## Which bump

This package is a build toolchain that three repositories consume, so read the
bump from the **consumer's** point of view, not the diff's size:

| Bump      | What it means here                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **major** | A consumer must change something to upgrade — a removed export, a renamed config key, a stricter validation that now fails a tree that used to compile. |
| **minor** | New capability a consumer can opt into; a raised floor on a dependency they also resolve.                                                               |
| **patch** | A fix that changes no interface — output corrected, diagnostic clarified, crash removed.                                                                |

Below 1.0.0 a **minor** is the breaking-change bump under a caret range: `^0.15.0`
never crosses to `0.16.0`, so a consumer's Dependabot offers it as a distinct pull
request. Use **major** anyway when the break is real; the changelog says so either
way.

## Writing the summary

The summary becomes the `CHANGELOG.md` entry and the GitHub Release body, so write
it for someone deciding whether to upgrade — what changed for them, not what the
patch touched. Reference the issue. Do not use `#` headings inside a summary: it
is wrapped into a list item, so a heading breaks the document outline.
