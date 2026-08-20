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

import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
// Imported by relative path, not the `@src` alias, because the pack-build
// scripts live outside that tree.
import { ITEM_BUILDERS } from "../sohl/item-builders.mjs";
import { itemTypes, itemBuilder } from "../engine/item-registry.mjs";
import { DEFAULT_ITEM_ART } from "../sohl/default-item-art.mjs";

const BUILDERS = ITEM_BUILDERS as Record<string, unknown>;

describe("ITEM_BUILDERS (the one registry keyed by item type, #1504)", () => {
    it("maps every registered type to a builder function", () => {
        expect(Object.keys(BUILDERS).length).toBeGreaterThan(0);
        for (const [type, builder] of Object.entries(BUILDERS)) {
            expect(typeof builder, type).toBe("function");
        }
    });

    it("is the source itemTypes() derives from, so the two cannot disagree", () => {
        // Not "these two hand-written lists happen to match" — itemTypes() is
        // built from the registry's keys, so a type with no builder cannot be
        // whitelisted in the first place.
        expect([...itemTypes()].sort()).toEqual(Object.keys(BUILDERS).sort());
    });

    it("does not advertise the retired `trait` type (#651)", () => {
        // `trait` was retired: it is absent from `documentTypes.Item` in
        // system.json, and world migration reports a surviving one as an
        // unrecognized type. Advertising it here made every `type: trait` note
        // pass the whitelist and then die on a missing builder (#1504).
        expect(itemTypes().has("trait")).toBe(false);
        expect(BUILDERS["trait"]).toBeUndefined();
        expect(DEFAULT_ITEM_ART).not.toHaveProperty("trait");
    });

    it("keeps the registry in step with the per-type default art", () => {
        // The third list that could drift (#1504): default item artwork.
        expect(Object.keys(DEFAULT_ITEM_ART).sort()).toEqual(
            [...itemTypes()].sort(),
        );
    });
});

describe("itemBuilder (lookup that fails loudly)", () => {
    it("returns the registered builder for a known type", () => {
        // Resolved from configuration, which in this repository *is* this
        // registry — so the identity check proves the dispatch reaches the
        // table the repository declared, not a copy of it (#1563).
        //
        // Compared against the registry as *Node* loads it, not the static
        // import above. The engine resolves the configuration with `require`
        // so that reading a configured value stays synchronous (#2); in a
        // plain Node process that shares one module instance with `import`,
        // but under vitest the module runner serves the static import from
        // its own graph, so the two spellings are two copies of one file. The
        // property under test is about the runtime, so it is asserted against
        // the runtime's copy.
        const registry = createRequire(import.meta.url)(
            "../sohl/item-builders.mjs",
        ).ITEM_BUILDERS as Record<string, unknown>;
        expect(itemBuilder("skill")).toBe(registry["skill"]);
        expect(itemBuilder("weapongear")).toBe(registry["weapongear"]);
        // …and that copy is the same table, key for key, as the one this
        // suite imported.
        expect(Object.keys(registry).sort()).toEqual(
            Object.keys(BUILDERS).sort(),
        );
    });

    it("throws a named error for an unregistered type", () => {
        // The old failure was `BUILDERS[type] is not a function`, swallowed as a
        // per-file compile error; an unregistered type now names itself.
        expect(() => itemBuilder("trait")).toThrow(/no builder.*trait/i);
        expect(() => itemBuilder("nonesuch")).toThrow(/no builder/i);
    });
});
