---
"@heroiclands/content-build": minor
---

Resolve a being's embedded items against a dependency's shipped item catalogue.

A repository that authors beings without holding the items they are assembled
from could not compile an actors pack at all: the pass resolved against local
Item packs and nothing else, so `sohl-thalorna` turning its actors pack on
produced 26,220 unresolved-item errors.

A declared relationship may now opt in with `itemCatalog: true`. Fetching
downloads that package's release, extracts its Item packs with
`@foundryvtt/foundryvtt-cli`, and hands the resulting directories to the actors
pass, which reads them exactly as it reads a local pack.

Three things it does deliberately:

- **Pins, rather than following `latest`.** A published
  `releases/latest/download/…` URL is rewritten to the declared
  `compatibility.verified` version, so a build names one particular dependency
  and stays reproducible. Where the URL cannot be rewritten, the version that
  comes back is checked against `verified` instead — floating silently is not
  on offer.
- **Never reaches the network during a compile.** Fetching is its own command,
  `content-build deps fetch`, and a compile with a cold cache fails naming it.
  The cache is version-keyed, so a second run costs nothing.
- **Lets a local item shadow a foreign one.** Two local packs claiming one
  address still collide, because that is ambiguous; a repository's own
  `skill:awar` standing in front of the system's is not.

New `paths.foreignCache` (`build/cache/foreign`) names where catalogues land.
