/*
 * This file is part of the Song of Heroic Lands (SoHL) system for Foundry VTT.
 * Copyright (c) 2024-2026 Tom Rodriguez ("Toasty") — <toasty@heroiclands.org>
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Build-time pack configuration (plain ESM, no Foundry). Imported by relative
// path because the pack-build scripts live outside the `@src` alias tree.
import { loadPackConfig } from "../engine/pack-config.mjs";
import {
    contentPackage,
    foundryPackageId,
} from "../engine/content-package.mjs";
import {
    resolvePackageManifestPath,
    readPackageManifest,
    readManifestPackageId,
} from "../engine/package-manifest.mjs";
import { supportedCoreVersion } from "../engine/helpers.mjs";

// Anchored on this file, not the working directory: the same paths have to
// resolve whichever directory the suite is launched from.
//
// What is under test is the *resolution mechanism* — that configured paths are
// absolute and anchored on the configured root — so the root it checks against
// is this package's own, supplied by the development config at the repository
// root. It used to be the system repository's root, which only resolved while
// this package was vendored inside it.
const PKG_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const MANIFEST = JSON.parse(
    fs.readFileSync(
        path.join(PKG_ROOT, "tests/fixtures/templates/system.template.json"),
        "utf8",
    ),
);

/**
 * The resolved configuration these cases describe.
 *
 * Read once here rather than imported as a constant: the engine resolves it on
 * first read and not at import, so that the package can be imported — and its
 * CLI asked its version — with no configuration anywhere above it (#2).
 */
const packConfig = loadPackConfig();

/** A throwaway `assets/templates`-shaped directory, `{ fileName: contents }`. */
function templateDir(files: Record<string, unknown>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sohl-packcfg-"));
    for (const [name, body] of Object.entries(files)) {
        fs.writeFileSync(path.join(root, name), JSON.stringify(body), "utf8");
    }
    return root;
}

describe("this repository's resolved pack configuration", () => {
    it("names the content package and the Foundry package it ships", () => {
        expect(packConfig.contentPackage).toBe("sohl");
        expect(packConfig.foundryPackage).toBe("sohl");
        expect(packConfig.packageKind).toBe("systems");
    });

    it("is the single source the legacy constants are derived from", () => {
        // `content-package.mjs` survives as a derived re-export so the link
        // resolver keeps its filesystem-free import path — but it must not be a
        // second place the values are written.
        expect(contentPackage()).toBe(packConfig.contentPackage);
        expect(foundryPackageId()).toBe(packConfig.foundryPackage);
    });

    it("resolves every path against the configured root, not the cwd", () => {
        // The configured root is the fixture repository, not this package's
        // own: the development configuration moved there to have a
        // `package.json` to derive its identity from (#50).
        for (const [key, value] of Object.entries(packConfig.paths)) {
            expect(path.isAbsolute(value as string), key).toBe(true);
            expect(String(value).startsWith(PKG_ROOT), key).toBe(true);
        }
        expect(packConfig.rootDir).toBe(
            path.join(PKG_ROOT, "tests/fixtures/repo"),
        );
        expect(packConfig.paths.content).toBe(
            path.join(packConfig.rootDir, "assets/content"),
        );
        expect(packConfig.paths.packJson).toBe(
            path.join(packConfig.rootDir, "build/packs-json"),
        );
    });

    it("derives the Foundry asset root from the package kind and id", () => {
        // A module consumer must emit `modules/<id>/assets/…`; nothing in the
        // pipeline may spell `systems/sohl` itself.
        expect(packConfig.assetRoot).toBe("systems/sohl/assets");
    });
});

describe("the one pack list (#1508 — SOURCE_PACKS and PACK_CONFIGS merged)", () => {
    it("declares every pack directory the build compiles, in compile order", () => {
        // The actors pass reads the items pass's output, so order is load-bearing.
        expect(packConfig.packDirectories).toEqual([
            "items",
            "journals",
            "actors",
            "macros",
            "scenes",
            "adventures",
        ]);
    });

    it("agrees with the packs the shipped manifest declares", () => {
        // The two lists that used to be maintained separately are now one, and
        // this is the third list they must still match: what Foundry ships.
        const declared = [
            ...packConfig.packs.flatMap((pack) => [
                { name: pack.name, type: pack.type },
                ...pack.companions.map(
                    (companion: { name: string; type: string }) => ({
                        name: companion.name,
                        type: companion.type,
                    }),
                ),
            ]),
        ];
        expect(declared).toEqual(
            MANIFEST.packs.map((p: { name: string; type: string }) => ({
                name: p.name,
                type: p.type,
            })),
        );
    });

    it("gives each generated pack its folder-hierarchy file", () => {
        expect(packConfig.packs.map((p) => [p.name, p.folders])).toEqual([
            ["items", "item-folders.yaml"],
            ["journals", "journal-folders.yaml"],
            ["actors", "actor-folders.yaml"],
            ["macros", "macro-folders.yaml"],
            ["scenes", "scene-folders.yaml"],
        ]);
    });

    it("skips the Obsidian scaffolding directory by configuration", () => {
        // `Templates/` was a hardcoded Obsidian convention inside the generic
        // tree walker; a consumer whose vault does not use it says so here.
        expect(packConfig.skipDirectories).toEqual(["Templates"]);
    });
});

describe("the manifest location is hoisted once, not twice (#1508)", () => {
    // The core-version stamp no longer reads it (#50); the package-id guard
    // still does, until package-build generates the manifest and the id stops
    // being declared twice.
    it("is the one path every reader of the manifest resolves", () => {
        const dir = templateDir({
            "system.template.json": {
                id: "sohl",
                compatibility: { minimum: "14.401" },
            },
        });
        const resolved = resolvePackageManifestPath(dir);

        expect(readManifestPackageId(dir).manifestPath).toBe(resolved);
        expect(readPackageManifest(dir).manifestPath).toBe(resolved);
    });

    it("tolerates a module repository's module.template.json", () => {
        const dir = templateDir({
            "module.template.json": {
                id: "sohl-thalorna",
                compatibility: { minimum: "14.377" },
            },
        });
        expect(readManifestPackageId(dir).packageId).toBe("sohl-thalorna");
    });

    it("defaults to the configured manifest directory", () => {
        expect(resolvePackageManifestPath()).toBe(
            path.join(packConfig.paths.packageManifest, "system.template.json"),
        );
    });
});

describe("the core version is configuration, and the config is its source", () => {
    // This reverses what this file asserted until #50. The rule *was* that
    // configuration may say only where the manifest is, never what it holds,
    // because the manifest was hand-authored and moved with test evidence — a
    // captured copy would silently stop following it.
    //
    // package-build now generates the manifest *from* this configuration, so
    // there is nothing left to follow: reading it back would be a round trip
    // through an artifact that need not exist yet, since `build:db` can run
    // before the manifest is written. The direction of truth flipped, and the
    // guard flips with it.

    it("stamps the floor the configuration declares", () => {
        expect(supportedCoreVersion()).toBe(packConfig.compatibility.minimum);
    });

    it("follows the configuration rather than any manifest", () => {
        // The two disagree deliberately: the fixture manifest is now only what
        // the package-id guard reads, and no longer feeds the stamp.
        const fromConfig = supportedCoreVersion({
            compatibility: { minimum: "14.900" },
        });

        expect(fromConfig).toBe("14.900");
        expect(fromConfig).not.toBe(MANIFEST.compatibility.minimum);
    });

    it("throws rather than falling back when none is declared", () => {
        // The loud failure is the feature, and survives the reversal above. A
        // silent fallback is how every pack came to ship `coreVersion: "14"`,
        // which sorts below every v14 build (#1533).
        expect(() => supportedCoreVersion({ compatibility: null })).toThrow(
            /compatibility\.minimum/,
        );
    });
});
