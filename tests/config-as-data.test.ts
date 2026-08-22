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
 * A repository's configuration is **data**, and the loader derives what a code
 * file used to compute.
 *
 * The three consumers' `.mjs` configs held no logic between them — only the
 * boilerplate needed to *say* a literal: a `rootDir` from `import.meta.url`, a
 * version read out of `package.json`, an imported registry constant. Each is
 * derived here instead, once, so a repository writes YAML and keeps its
 * reasoning in comments beside the values.
 *
 * These cases describe the derivations and the refusals. That the *result* is
 * indistinguishable from a code config is asserted by the whole rest of the
 * suite, which runs against this package's own YAML configuration.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";

import {
    CONFIG_BASENAME,
    CONFIG_FILENAMES,
    configFromData,
    findConfigFile,
} from "../engine/pack-config.mjs";
import { ITEM_BUILDERS } from "../sohl/item-builders.mjs";

/** The smallest data configuration that resolves. */
function minimal(): Record<string, unknown> {
    return {
        contentPackage: "sohl",
        foundryPackage: "sohl",
        packageKind: "systems",
        stats: {
            systemId: "sohl",
            systemVersion: "0.6.0",
            lastModifiedBy: "sohlbuilder00000",
        },
        packs: [{ name: "items", type: "Item" }],
    };
}

/** A throwaway repository root, `{ fileName: contents }` written verbatim. */
function repoDir(files: Record<string, string> = {}): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cb-cfg-"));
    for (const [name, body] of Object.entries(files)) {
        fs.writeFileSync(path.join(root, name), body, "utf8");
    }
    return root;
}

/** Resolve a data configuration as though it sat at `root`. */
function resolveIn(root: string, data: Record<string, unknown>) {
    return configFromData(data, path.join(root, `${CONFIG_BASENAME}.yaml`));
}

describe("what the loader derives from where the file sits", () => {
    it("takes rootDir from the configuration's own directory", () => {
        const root = repoDir();
        expect(resolveIn(root, minimal()).rootDir).toBe(root);
    });

    it("anchors every configured path on that derived root", () => {
        const root = repoDir();
        const config = resolveIn(root, minimal());
        for (const [key, value] of Object.entries(config.paths)) {
            expect(path.isAbsolute(value as string), key).toBe(true);
            expect(String(value).startsWith(root), key).toBe(true);
        }
    });

    it("refuses an authored rootDir rather than honouring one", () => {
        // Any absolute path a data file wrote would be one machine's, and the
        // build would then read a tree that exists only there.
        const root = repoDir();
        expect(() =>
            resolveIn(root, { ...minimal(), rootDir: "/elsewhere" }),
        ).toThrow(/rootDir/);
    });

    it("reads stats.systemVersion from the adjacent package.json", () => {
        // The stamp has to equal the version that did the compiling; a
        // transcribed copy froze at 0.6.0 for four releases (#1548).
        const root = repoDir({
            "package.json": JSON.stringify({ name: "x", version: "1.2.3" }),
        });
        const data = minimal();
        delete (data.stats as Record<string, unknown>).systemVersion;
        expect(resolveIn(root, data).stats.systemVersion).toBe("1.2.3");
    });

    it("still honours a stated systemVersion", () => {
        // A module shipping SoHL content declares `systemId: sohl`, and the
        // version beside it is SoHL's — not the module's own.
        const root = repoDir({
            "package.json": JSON.stringify({ name: "x", version: "1.2.3" }),
        });
        expect(resolveIn(root, minimal()).stats.systemVersion).toBe("0.6.0");
    });

    it("throws rather than guessing when there is no version to read", () => {
        const root = repoDir();
        const data = minimal();
        delete (data.stats as Record<string, unknown>).systemVersion;
        expect(() => resolveIn(root, data)).toThrow(/systemVersion/);
    });
});

describe("itemBuilders is named, because a registry is code", () => {
    it("resolves the built-in registry a configuration names", () => {
        const config = resolveIn(repoDir(), {
            ...minimal(),
            itemBuilders: "sohl",
        });
        // The same table a code config imports — not a copy of it.
        expect(Object.keys(config.itemBuilders).sort()).toEqual(
            Object.keys(ITEM_BUILDERS).sort(),
        );
        // And the type whitelist is still derived from its keys (#1504).
        expect([...config.itemTypes].sort()).toEqual(
            Object.keys(ITEM_BUILDERS).sort(),
        );
    });

    it("names the known registries when given one it does not ship", () => {
        expect(() =>
            resolveIn(repoDir(), { ...minimal(), itemBuilders: "thalorna" }),
        ).toThrow(/thalorna(.|\n)*sohl/);
    });

    it("points at the .mjs escape hatch when handed a table", () => {
        // Data cannot carry functions, so a mapping here is a consumer trying
        // to write its own registry — which is what `.mjs` is still for.
        expect(() =>
            resolveIn(repoDir(), {
                ...minimal(),
                itemBuilders: { relic: { system: null } },
            }),
        ).toThrow(/\.mjs/);
    });
});

describe("the same validator, whichever form the configuration took", () => {
    it("rejects a document that is not a mapping", () => {
        const root = repoDir();
        expect(() =>
            resolveIn(root, YAML.parse("- one\n- two") as never),
        ).toThrow(/mapping/);
    });

    it("rejects an unknown key exactly as defineConfig does", () => {
        expect(() =>
            resolveIn(repoDir(), { ...minimal(), notAKey: true }),
        ).toThrow(/notAKey/);
    });

    it("freezes the result", () => {
        const config = resolveIn(repoDir(), minimal());
        expect(Object.isFrozen(config)).toBe(true);
    });
});

describe("locating the configuration", () => {
    it("accepts .yaml, .yml, and .mjs, and nothing else", () => {
        expect(CONFIG_FILENAMES).toEqual([
            "content-build.config.yaml",
            "content-build.config.yml",
            "content-build.config.mjs",
        ]);
    });

    it.each(CONFIG_FILENAMES)("finds %s by walking up", (name) => {
        const root = repoDir({ [name]: "" });
        const nested = path.join(root, "a", "b");
        fs.mkdirSync(nested, { recursive: true });
        expect(findConfigFile(nested)).toBe(path.join(root, name));
    });

    it("refuses two configurations in one directory", () => {
        // Precedence would let a repository mid-conversion build from the file
        // its author is no longer editing, and look healthy doing it.
        const root = repoDir({
            "content-build.config.yaml": "",
            "content-build.config.mjs": "",
        });
        expect(() => findConfigFile(root)).toThrow(/more than one/);
    });

    it("returns undefined when the walk finds none", () => {
        expect(findConfigFile(repoDir())).toBeUndefined();
    });
});
