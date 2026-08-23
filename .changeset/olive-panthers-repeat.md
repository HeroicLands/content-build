---
"@heroiclands/content-build": minor
---

**Every invocation the command line accepts is now one it performs.**

Four invocations were accepted, performed nothing, and exited 0. From a `run-s`
build chain each read as a step that had done its work:

| Invocation                 | Was                                          | Now                            |
| -------------------------- | -------------------------------------------- | ------------------------------ |
| `content-build`            | exit 0, no output                            | usage, exit non-zero           |
| `content-build bogus`      | exit 0, silently ignored                     | rejected by name               |
| `content-build package`    | exit 0, compiled nothing                     | names `compile\|unpack\|clean` |
| `content-build docs`       | rendered `item-fields` whatever it was asked | names the documents            |
| `content-build lint --xyz` | exit 0, option ignored                       | rejected                       |

The CLI is built on yargs but had opted into none of its guarantees — no
`.demandCommand()`, no `.strict()`, and both multi-action commands declared
their action optional (`package [action]`) rather than required. `docs` went
further: it declared an `action` positional with `choices` and never read
`argv.action`, so the positional constrained what could be typed and selected
nothing. With one document that was latent; a second would have rendered the
wrong one and exited 0. The action is now dispatched on.

The sibling toolchain `@heroiclands/package-build` already opts into the same
two guards, so the two command lines now agree about what an error is.

**On the bump.** Marked _minor_ rather than _major_ although exit codes change
for inputs that were previously accepted: no invocation that did any work
behaves differently, and every invocation that changes was one doing nothing at
all. A consumer whose build starts failing was not compiling, linting or
rendering anything at that step. Treating it as a breaking change would strand
every `^1.0.0` consumer for a fix whose entire effect is to make a silent
no-op loud.

`--version` and `--help` still answer in a directory with no configuration.

Closes #57
