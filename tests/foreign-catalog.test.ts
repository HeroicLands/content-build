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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    pinnedManifestUrl,
    itemCatalogRelationships,
    foreignItemCatalogDirs,
} from "../engine/foreign-catalog.mjs";
import { defineConfig } from "../index.mjs";

const LATEST =
    "https://github.com/HeroicLands/Song-of-Heroic-Lands-FoundryVTT/releases/latest/download/system.json";

describe("pinning a dependency's manifest (#82)", () => {
    /*
     * A consumer publishes `releases/latest/…` because that is the right thing
     * for Foundry to follow. It is the wrong thing to *build* against: the
     * artifact behind it changes when somebody else cuts a release, so the
     * build names no particular dependency.
     */
    it("rewrites a floating latest URL to the declared verified version", () => {
        const { url, pinned } = pinnedManifestUrl(LATEST, "0.8.2");
        expect(pinned).toBe(true);
        expect(url).toBe(
            "https://github.com/HeroicLands/Song-of-Heroic-Lands-FoundryVTT/releases/download/v0.8.2/system.json",
        );
    });

    it("does not double the v prefix when the version carries one", () => {
        expect(pinnedManifestUrl(LATEST, "v0.8.2").url).toContain(
            "/download/v0.8.2/",
        );
        expect(pinnedManifestUrl(LATEST, "v0.8.2").url).not.toContain("vv");
    });

    it("leaves a URL it cannot rewrite alone, and says so", () => {
        // Reported rather than rewritten: `fetchCatalog` checks the version it
        // gets back instead, so an unpinnable URL still cannot float silently.
        const out = pinnedManifestUrl(
            "https://example.invalid/m.json",
            "1.0.0",
        );
        expect(out).toEqual({
            url: "https://example.invalid/m.json",
            pinned: false,
        });
    });

    it("cannot pin without a declared version", () => {
        expect(pinnedManifestUrl(LATEST, undefined).pinned).toBe(false);
    });
});

describe("which relationships supply an item catalogue", () => {
    /** A config carrying the given relationships block. */
    const withRelationships = (relationships: unknown) =>
        defineConfig({
            rootDir: "/repo",
            contentPackage: "thalorna",
            foundryPackage: "thalorna",
            packageKind: "modules",
            stats: {
                systemId: "sohl",
                systemVersion: "0.8.2",
                lastModifiedBy: "sohlbuilder00000",
            },
            packs: [{ name: "items", type: "Item" }],
            compatibility: { minimum: "14.359", verified: "14.359" },
            relationships,
        } as never);

    it("takes only the relationships that opted in", () => {
        const config = withRelationships({
            systems: [
                { id: "sohl", manifest: LATEST, itemCatalog: true },
                { id: "other", manifest: LATEST },
            ],
        });
        expect(itemCatalogRelationships(config).map((r) => r.id)).toEqual([
            "sohl",
        ]);
    });

    it("walks every kind, not just systems", () => {
        // "and some other modules" — a module may supply items too, and
        // rebuilding this for `requires` later is the failure worth avoiding.
        const config = withRelationships({
            systems: [{ id: "sohl", manifest: LATEST, itemCatalog: true }],
            requires: [{ id: "kethira", manifest: LATEST, itemCatalog: true }],
        });
        expect(
            itemCatalogRelationships(config)
                .map((r) => r.id)
                .sort(),
        ).toEqual(["kethira", "sohl"]);
    });

    it("carries the verified version through, so the fetch can pin", () => {
        const config = withRelationships({
            systems: [
                {
                    id: "sohl",
                    manifest: LATEST,
                    itemCatalog: true,
                    compatibility: { minimum: "0.8.0", verified: "0.8.2" },
                },
            ],
        });
        expect(itemCatalogRelationships(config)[0]?.verified).toBe("0.8.2");
    });

    it("refuses `itemCatalog: true` with nothing to fetch", () => {
        expect(() =>
            withRelationships({ systems: [{ id: "sohl", itemCatalog: true }] }),
        ).toThrow(/manifest/);
    });

    it("refuses a non-boolean", () => {
        expect(() =>
            withRelationships({
                systems: [{ id: "sohl", manifest: LATEST, itemCatalog: "yes" }],
            }),
        ).toThrow(/true or false/);
    });
});

describe("reading the catalogue cache", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "cb-foreign-"));
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    const config = (cache: string) => ({
        paths: { foreignCache: cache },
        relationships: {
            systems: [{ id: "sohl", manifest: LATEST, itemCatalog: true }],
        },
    });

    it("fails on a cold cache, naming the command that fills it", () => {
        // A compile must never reach the network: a build that downloads
        // silently is not reproducible and fails strangely offline.
        expect(() => foreignItemCatalogDirs(config(root))).toThrow(
            /content-build deps fetch/,
        );
    });

    it("ignores a half-finished fetch", () => {
        // No stamp: the fetch died partway, and a partial catalogue would
        // resolve some addresses and fail others for no visible reason.
        fs.mkdirSync(path.join(root, "sohl@0.8.2", "items", "items"), {
            recursive: true,
        });
        expect(() => foreignItemCatalogDirs(config(root))).toThrow(
            /deps fetch/,
        );
    });

    it("returns each extracted pack directory of a complete cache", () => {
        const dir = path.join(root, "sohl@0.8.2");
        fs.mkdirSync(path.join(dir, "items", "items"), { recursive: true });
        fs.mkdirSync(path.join(dir, "items", "extras"), { recursive: true });
        fs.writeFileSync(path.join(dir, ".complete"), "0.8.2\n");
        expect(foreignItemCatalogDirs(config(root)).sort()).toEqual([
            path.join(dir, "items", "extras"),
            path.join(dir, "items", "items"),
        ]);
    });

    it("uses the newest cached version when several are present", () => {
        for (const v of ["0.8.1", "0.8.2"]) {
            const dir = path.join(root, `sohl@${v}`);
            fs.mkdirSync(path.join(dir, "items", "items"), { recursive: true });
            fs.writeFileSync(path.join(dir, ".complete"), `${v}\n`);
        }
        expect(foreignItemCatalogDirs(config(root))).toEqual([
            path.join(root, "sohl@0.8.2", "items", "items"),
        ]);
    });

    it("asks for nothing when no relationship opted in", () => {
        expect(
            foreignItemCatalogDirs({
                paths: { foreignCache: root },
                relationships: { systems: [{ id: "sohl", manifest: LATEST }] },
            }),
        ).toEqual([]);
    });
});
