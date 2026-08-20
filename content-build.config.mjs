/*
 * Development-only configuration for this package's OWN test suite.
 *
 * It is not published — `files` in package.json does not list it — so an
 * installed copy under `node_modules/@heroiclands/content-build/` never shadows
 * a consuming repository's config.
 *
 * WHY THIS FILE EXISTS: the suite has cases *about configured behaviour* — that
 * a path resolves where configuration says, that `_stats` is stamped from it,
 * that a pack routes by it — and those need a configuration to describe. It is
 * no longer needed merely to *import* a module: resolution is lazy as of #2, and
 * `tests/import-needs-no-config.test.ts` proves it by working from a copy of the
 * shipped files placed where this file cannot be found.
 *
 * It used to exist for the other reason. Five engine modules resolved the
 * configuration at *module scope*, so importing them threw when the upward walk
 * found nothing — invisible while the package was vendored inside the Song of
 * Heroic Lands repository, whose root config the walk always found. Extracting
 * the package exposed it, and this file stood in until #2 fixed it.
 *
 * The values below are deliberately generic placeholders. Nothing here should
 * be read as the shape a real consumer must adopt — see the README for that.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

// Leaf contract modules, never the package barrels: a barrel pulls in the
// compilers, the compilers read the resolved configuration, and resolving it
// loads this file — importing a barrel here would close a cycle around this
// file's own evaluation.
import { defineConfig } from "./config.mjs";
import { ITEM_BUILDERS } from "./sohl/item-builders.mjs";

export default defineConfig({
    rootDir: path.dirname(fileURLToPath(import.meta.url)),

    // The manifest fixture lives under `tests/`, not at the default
    // `assets/templates`, so this repository does not appear to ship a Foundry
    // package it has no business shipping.
    paths: { packageManifest: "tests/fixtures/templates" },

    contentPackage: "sohl",
    foundryPackage: "sohl",
    packageKind: "systems",

    stats: {
        systemId: "sohl",
        systemVersion: "0.0.0",
        lastModifiedBy: "contentbuild0000",
    },

    itemBuilders: ITEM_BUILDERS,

    // A content tree opened as an Obsidian vault keeps its templater
    // scaffolding in `Templates/`, which is never compendium content.
    skipDirectories: ["Templates"],

    packs: [
        { name: "items", type: "Item", folders: "item-folders.yaml" },
        {
            name: "journals",
            type: "JournalEntry",
            folders: "journal-folders.yaml",
        },
        { name: "actors", type: "Actor", folders: "actor-folders.yaml" },
        { name: "macros", type: "Macro", folders: "macro-folders.yaml" },
        {
            name: "scenes",
            type: "Scene",
            folders: "scene-folders.yaml",
            companions: [{ name: "adventures", type: "Adventure" }],
        },
    ],
});
