#!/usr/bin/env node
/*
 * This file is part of the Song of Heroic Lands (SoHL) system for Foundry VTT.
 * Copyright (c) 2024-2026 Tom Rodriguez ("Toasty") — <toasty@heroiclands.org>
 *
 * This work is licensed under the GNU General Public License v3.0 (GPLv3).
 * You may copy, modify, and distribute it under the terms of that license.
 *
 * For full terms, see the LICENSE.md file in the project root or visit:
 * https://www.gnu.org/licenses/gpl-3.0.html
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * The `content-build` command line — compile / unpack / clean LevelDB packs.
 *
 * A thin `yargs` front end over `../engine/compendiums.mjs`. **Every side
 * effect the pack pipeline has lives here**: argv parsing, `loglevel`
 * configuration, directory creation, reading the shipped Foundry package
 * manifest, and the process exit code. The library itself is import-safe, so a
 * consuming repository's build — or a test — can call it without any of this
 * happening (#1507).
 *
 * The side effects that need *configuration* live inside the command handler,
 * not at module scope, so `--version` and `--help` answer in a directory that
 * has neither a `content-build.config.mjs` nor a package manifest (#2).
 * Running an actual command still resolves both, and still fails loudly when
 * either is missing.
 *
 * Every path and pack name it hands the library comes from the consuming
 * repository's `content-build.config.mjs` (#1508), located by
 * `engine/pack-config.mjs`; nothing about any one repository's layout is
 * written here.
 *
 * Usage:
 *   npx content-build package compile [pack]
 *   npx content-build package unpack [pack] [entry]
 *   npx content-build package clean [pack] [entry]
 *   npx content-build docs item-fields [--out <path>] [--title <title>]
 *   npx content-build lint [root]
 *   npx content-build links [root] [--manifests <dir>]
 *   npx content-build reachability <dir> [file] [--index <shortcode>]
 *
 * In a consuming repository, wrapped as npm scripts — SoHL spells them:
 *   npm run build:compiledb                // → … package compile (all packs)
 *   npm run build:unpackdb                 // → … package unpack
 *   npm run docs:item-fields               // → … docs item-fields --out …
 */

import fs from "fs";
import path from "node:path";
import log from "loglevel";
import prefix from "loglevel-plugin-prefix";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
    compilePacks,
    cleanPacks,
    unpackPacks,
} from "../engine/compendiums.mjs";
import { loadPackConfig } from "../engine/pack-config.mjs";
import { readPackageManifest } from "../engine/package-manifest.mjs";
import { renderItemFieldReference } from "../engine/field-reference.mjs";
import { lintContentTree } from "../engine/content-lint.mjs";
import {
    auditLinks,
    buildLinkIndex,
    walkReachability,
} from "../engine/content-links.mjs";
import { emitDiagnostic, positionOfLiteral } from "../engine/diagnostics.mjs";
import {
    formatUnaddressableFinding,
    unaddressableForeignPackages,
} from "../engine/foreign-manifests.mjs";

/**
 * The packs the shipped Foundry package declares — what `unpack` extracts.
 *
 * Read on demand rather than at load: a repository that has no package manifest
 * still has a working `compile`, whose own package-id guard
 * (`assertPackageIdMatchesManifestFile`) resolves either manifest kind. A
 * missing manifest is still loud — it throws, and the handler below turns that
 * into a reported failure.
 *
 * @returns {Array<{name: string}>}
 */
function manifestPacks() {
    return readPackageManifest().manifest.packs;
}

/**
 * This package's own version, for `--version`.
 *
 * Read from the package's `package.json` rather than left to yargs, which
 * defaults to the *nearest* `package.json` walking up from the working
 * directory — inside a consuming repository that is the consumer's manifest, so
 * `content-build --version` reported the consumer's version instead of the
 * toolchain's (#1557).
 *
 * @returns {string} The `version` field of this package's manifest.
 */
function ownVersion() {
    return JSON.parse(
        fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).version;
}

// Configure loglevel
log.setLevel("info"); // Set desired logging level

// Configure prefix
prefix.reg(log);
prefix.apply(log, {
    format(level, _name, timestamp) {
        return `[${timestamp}] [${level.toUpperCase()}]:`;
    },
    timestampFormatter(date) {
        return date.toISOString();
    },
});

const argv = yargs(hideBin(process.argv))
    .command(packageCommand())
    .command(docsCommand())
    .command(lintCommand())
    .command(linksCommand())
    .command(reachabilityCommand())
    .version(ownVersion())
    .help()
    .alias("help", "h").argv;

/**
 * `docs item-fields` — render this repository's item-frontmatter reference.
 *
 * The page is generated from the `fields` each `itemBuilders` entry declares,
 * so every consuming repository documents *its own* registry with the same
 * command (#22). Written to `--out` when given, otherwise to stdout, which is
 * what lets a consumer's `--check` guard diff it without a temporary file.
 *
 * @returns {object} The yargs command module.
 */
// eslint-disable-next-line
function docsCommand() {
    return {
        command: "docs [action]",
        describe: "Generate documentation from the configured registries",
        builder: (yargs) => {
            yargs.positional("action", {
                describe: "The document to render.",
                type: "string",
                choices: ["item-fields"],
            });
            yargs.option("out", {
                describe: "Write to this file instead of stdout.",
                type: "string",
            });
            yargs.option("title", {
                describe: "The page's H1.",
                type: "string",
            });
        },
        handler: (argv) => {
            try {
                const { out, title } = argv;
                const md = renderItemFieldReference({
                    ...(title ? { title } : {}),
                    generatedBy: "`content-build docs item-fields`",
                });
                if (out) {
                    fs.mkdirSync(path.dirname(out), { recursive: true });
                    fs.writeFileSync(out, `${md}\n`);
                    log.info(`Wrote ${out}`);
                } else {
                    process.stdout.write(`${md}\n`);
                }
            } catch (err) {
                log.error(err.message);
                process.exitCode = 1;
            }
        },
    };
}

/**
 * `content-build lint` — check a content tree's addresses.
 *
 * Deliberately independent of the pack pipeline: it compiles nothing, opens no
 * LevelDB and needs no Foundry manifest, so it runs in a second and can gate a
 * commit. The content root comes from the consuming repository's
 * `content-build.config.mjs` unless one is named on the command line, so the
 * usual invocation takes no arguments at all.
 *
 * @returns {object} The yargs command module.
 */
// eslint-disable-next-line
function lintCommand() {
    return {
        command: "lint [root]",
        describe: "Check a content tree's addresses",
        builder: (yargs) => {
            yargs.positional("root", {
                describe:
                    "Content tree to lint. Defaults to the configured contentBase.",
                type: "string",
            });
        },
        handler: (argv) => {
            try {
                const root = argv.root ?? loadPackConfig().paths.content;
                const { findings, notes, keys } = lintContentTree(root);
                for (const finding of findings) emitDiagnostic(finding);
                if (findings.length) {
                    log.error(
                        `${findings.length} finding(s) across ${notes} note(s).`,
                    );
                    process.exitCode = 1;
                } else {
                    log.info(
                        `Addresses are well-formed and unique ` +
                            `(${keys} across ${notes} note(s)).`,
                    );
                }
            } catch (err) {
                log.error(err.message);
                process.exitCode = 1;
            }
        },
    };
}

/**
 * `content-build links` — check that every link in a content tree lands.
 *
 * Reports a dead `#anchor`, a dead qualified address, and a wikilink authored
 * in frontmatter, plus a vendored manifest that has drifted out of reach. All
 * of it is package-agnostic, so a consumer needs no script of its own: the
 * manifest directory is the only thing it might name, and that comes from its
 * configuration.
 *
 * @returns {object} The yargs command module.
 */
// eslint-disable-next-line
function linksCommand() {
    return {
        command: "links [root]",
        describe: "Check that every link in a content tree lands somewhere",
        builder: (yargs) => {
            yargs.positional("root", {
                describe:
                    "Content tree to check. Defaults to the configured contentBase.",
                type: "string",
            });
            yargs.option("manifests", {
                describe:
                    "Directory of vendored foreign link manifests. Defaults " +
                    "to the configured `paths.manifests`.",
                type: "string",
            });
        },
        handler: (argv) => {
            try {
                const config = loadPackConfig();
                const contentBase = argv.root ?? config.paths.content;
                const manifestDir = argv.manifests ?? config.paths.manifests;

                const index = buildLinkIndex(contentBase, { manifestDir });

                // An unusable manifest would otherwise surface as a pile of
                // dead addresses pointing at the notes that cite it, rather
                // than at the file at fault.
                if (index.foreign.stale.length) {
                    for (const s of index.foreign.stale) {
                        emitDiagnostic({
                            file: path.join(manifestDir, `${s.package}.json`),
                            severity: "error",
                            message: `unusable link manifest: ${s.reason}`,
                        });
                    }
                    log.error(
                        "Refresh the vendored copy from that package's own build.",
                    );
                    process.exitCode = 1;
                    return;
                }

                // Readable is not the same as addressable: a key shape the
                // lookup cannot parse makes every cross-package link miss, and
                // the audit then blames the *notes*.
                const drifted = unaddressableForeignPackages(
                    index.foreign.index,
                );
                if (drifted.length) {
                    for (const f of drifted) {
                        console.error(
                            formatUnaddressableFinding(f, manifestDir),
                        );
                    }
                    process.exitCode = 1;
                    return;
                }

                const {
                    deadAnchors,
                    deadAddresses,
                    frontmatterLinks,
                    usedManifest,
                } = auditLinks(index);

                for (const d of deadAnchors) {
                    emitDiagnostic({
                        file: d.note.file,
                        ...positionOfLiteral(d.note.raw, d.text, d.occurrence),
                        severity: "error",
                        message:
                            `link [[${d.link}]] points at an anchor no ` +
                            `heading in ${d.dest.rel} declares`,
                    });
                }
                for (const d of deadAddresses) {
                    emitDiagnostic({
                        file: d.note.file,
                        ...positionOfLiteral(d.note.raw, d.text, d.occurrence),
                        severity: "error",
                        message: `dead address [[${d.target}]] — no document has that identity`,
                    });
                }
                for (const f of frontmatterLinks) {
                    emitDiagnostic({
                        file: f.note.file,
                        ...positionOfLiteral(f.note.raw, f.link),
                        severity: "error",
                        message:
                            `wikilink ${f.link} authored in frontmatter at ` +
                            `${f.path} — frontmatter is data and is never resolved`,
                    });
                }

                const failures =
                    deadAnchors.length +
                    deadAddresses.length +
                    frontmatterLinks.length;
                if (failures) {
                    log.error(
                        `${failures} link problem(s) across ${index.notes.length} note(s).`,
                    );
                    process.exitCode = 1;
                } else {
                    log.info(
                        `${index.notes.length} notes: every anchor link lands ` +
                            `and every qualified address resolves ` +
                            `(${usedManifest.size} cross-package reference(s) ` +
                            `via manifest), no wikilink in frontmatter.`,
                    );
                }
            } catch (err) {
                log.error(err.message);
                process.exitCode = 1;
            }
        },
    };
}

/**
 * `content-build reachability <dir> [file]` — check that a corpus reads through.
 *
 * The corpus is named on the command line rather than declared in code, because
 * it never changes for a given repository: a consumer hardcodes the invocation
 * in `package.json` and gets the check without writing a script.
 *
 *   content-build reachability Rules --index glossary
 *   content-build reachability User_Guide --index glossary
 *
 * @returns {object} The yargs command module.
 */
// eslint-disable-next-line
function reachabilityCommand() {
    return {
        command: "reachability <dir> [file]",
        describe: "Check that every document in a corpus is reachable",
        builder: (yargs) => {
            yargs.positional("dir", {
                describe:
                    "The corpus directory, relative to the content tree root.",
                type: "string",
            });
            yargs.positional("file", {
                describe: "The corpus's entry page within that directory.",
                type: "string",
                default: "README.md",
            });
            yargs.option("index", {
                describe:
                    "Shortcode of a page walked *to* but not *through*. " +
                    "Repeatable. An index links to nearly everything it " +
                    "covers, so walking one makes the check vacuous.",
                type: "string",
                array: true,
                default: [],
            });
            yargs.option("root", {
                describe:
                    "Content tree to read. Defaults to the configured contentBase.",
                type: "string",
            });
        },
        handler: (argv) => {
            try {
                const contentBase = argv.root ?? loadPackConfig().paths.content;
                const dir = String(argv.dir).replace(/\/+$/, "");
                const index = buildLinkIndex(contentBase);
                const indexes = new Set(argv.index.map(String));

                const { orphans } = walkReachability(index, {
                    root: `${dir}/${argv.file}`,
                    scope: (n) => n.rel.startsWith(`${dir}/`),
                    stopAt: (n) => indexes.has(String(n.fm.shortcode)),
                });

                const total = index.notes.filter((n) =>
                    n.rel.startsWith(`${dir}/`),
                ).length;

                for (const o of orphans) {
                    // Unreachability is a property of the whole document, so
                    // there is no line to name.
                    emitDiagnostic({
                        file: o.file,
                        severity: "error",
                        message:
                            `unreachable from ${dir}/${argv.file} — nothing ` +
                            `in ${dir} links to it`,
                    });
                }

                if (orphans.length) {
                    log.error(
                        `${orphans.length} of ${total} document(s) in ${dir} ` +
                            `cannot be arrived at by reading. A corpus is a ` +
                            `book, not a pile of notes: link each one from the ` +
                            `chapter or section that owns it.`,
                    );
                    process.exitCode = 1;
                } else {
                    log.info(
                        `All ${total} document(s) in ${dir} are reachable ` +
                            `from ${argv.file}.`,
                    );
                }
            } catch (err) {
                log.error(err.message);
                process.exitCode = 1;
            }
        },
    };
}

// eslint-disable-next-line
function packageCommand() {
    return {
        command: "package [action] [pack] [entry]",
        describe: "Manage packages",
        builder: (yargs) => {
            yargs.positional("action", {
                describe: "The action to perform.",
                type: "string",
                choices: ["compile", "unpack", "clean"],
            });
            yargs.positional("pack", {
                describe: "Name of the pack upon which to work.",
                type: "string",
            });
            yargs.positional("entry", {
                describe:
                    "Name of any entry within a pack upon which to work. Only applicable to extract & clean commands.",
                type: "string",
            });
        },
        handler: async (argv) => {
            const { action, pack, entry } = argv;
            // yargs does not await this handler, so a rejection would surface as
            // an unhandled-rejection stack trace. Report the message and set a
            // failing exit code, so a build guard reads as a build failure.
            try {
                // The one directory the pipeline creates rather than expects:
                // `unpack` writes the extracted JSON there and `compile` reads
                // it back. Created here rather than at module scope so that
                // asking the CLI its version needs no configuration (#2).
                fs.mkdirSync(loadPackConfig().paths.unpack, {
                    recursive: true,
                });
                switch (action) {
                    // Every path and pack list the library needs is defaulted
                    // from the resolved configuration, so nothing is restated
                    // here (#1508). Only `packs` is passed: it comes from the
                    // shipped manifest, not from configuration.
                    case "compile":
                        return await compilePacks({ packName: pack });
                    case "clean":
                        return await cleanPacks({
                            packName: pack,
                            entryName: entry,
                        });
                    case "unpack":
                        return await unpackPacks({
                            packs: manifestPacks(),
                            packName: pack,
                            entryName: entry,
                        });
                }
            } catch (err) {
                log.error(err.message);
                process.exitCode = 1;
            }
        },
    };
}
