/*
 * Development-only configuration for this package's OWN test suite.
 *
 * It is not published — `files` in package.json does not list it — so an
 * installed copy under `node_modules/@heroiclands/content-build/` never shadows
 * a consuming repository's config.
 *
 * WHY THIS FILE EXISTS AT ALL: several engine modules resolve the configuration
 * at *module scope* (`ITEM_TYPES`, `CONTENT_PACKAGE`, `FOUNDRY_PACKAGE_ID`,
 * `DOC_ENTRY_TYPES`, `DEFAULT_TEMPLATE_DIR`), so importing them throws when no
 * config is found by walking up from the module's directory. While this package
 * lived inside the Song of Heroic Lands repository that walk always found that
 * repository's root config, which is why the suite appeared self-contained and
 * was not. Extracting the package exposed it.
 *
 * That eager resolution is the defect behind #1559. When it is made lazy, this
 * file should shrink to whatever the tests genuinely need, or disappear.
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
