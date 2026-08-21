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
 * **The item-type registry** — every content type that compiles into a Foundry
 * Item, keyed to the builder that produces its `system` block.
 *
 * There is one list, not two. This repository hands {@link ITEM_BUILDERS} to
 * the build as `itemBuilders` in `content-build.config.mjs`, and `itemTypes()`
 * — the whitelist — is derived from that table's own keys, so a type cannot be
 * whitelisted for compilation without a builder to compile it. Previously the
 * whitelist and the builder table were maintained by hand and had already
 * drifted: `trait` — an item type **retired in #651**, absent from
 * `documentTypes.Item` and reported by world migration as unrecognized — was
 * still advertised as compilable, so a `type: trait` note passed the gate and
 * then died on `BUILDERS[type] is not a function`, swallowed as a per-file
 * error (#1504).
 *
 * Adding an item type is therefore one edit here (plus its `documentTypes.Item`
 * declaration and its default art); removing one is likewise a single deletion.
 *
 * **A leaf module, and the reason the seam works.** It imports only the pure
 * frontmatter readers — never `helpers.mjs`, and never the resolved
 * configuration. The config file imports *this* module, so a read back out of
 * the configuration here would close a cycle around the config's own
 * evaluation. The table travels into configuration; the engine's
 * `item-registry.mjs` reads it back out and the Item compiler dispatches
 * through that, which is how a consumer's own table is the one its notes
 * compile with (#1563).
 */

import { defaultItemArt } from "./default-item-art.mjs";
import {
    parseValueDesc,
    requireSubType,
    resolveCharges,
    resolveRelation,
    resolveSkillAptitudes,
    sohlField,
} from "../engine/frontmatter.mjs";

/**
 * Gear common fields (quantity, carried flags, weight/value/quality/
 * durability). Layered onto every `*gear` system block.
 */
function gearCommon(fm) {
    return {
        quantity: 1,
        weightBase: sohlField(fm, "weight", 0),
        valueBase: sohlField(fm, "value", 0),
        qualityBase: sohlField(fm, "quality", 0),
        durabilityBase: sohlField(fm, "durability", 0),
        sharedWithCohortIds: [],
        containerId: null,
        isCarried: true,
        isEquipped: false,
    };
}

/* -------------------------------------------------------------------- */
/*  Per-type system builders                                            */
/* -------------------------------------------------------------------- */

function buildSkill(fm) {
    const subType = requireSubType(fm);
    // `masteryLevelBase` is nullable: an unset / blank value ships as `null`
    // ("not yet opened"), so an embedded skill opens on its actor at
    // Skill Base × initSkillMult. A numeric value is a deliberate opened level.
    const rawMlb = sohlField(fm, "masteryLevelBase", null);
    const out = {
        subType,
        skillBaseFormula: sohlField(fm, "skillBaseFormula", ""),
        masteryLevelBase:
            rawMlb == null || rawMlb === "" ? null : Number(rawMlb),
        improveFlag: Boolean(sohlField(fm, "improveFlag", false)),
        combatCategory: sohlField(fm, "combatCategory", "none"),
        parentSkillCode: sohlField(fm, "parentSkillCode", ""),
        initSkillMult: Number(sohlField(fm, "initSkillMult", 0)) || 0,
        impairedByRoles: sohlField(fm, "impairedByRoles", []),
    };
    // A combat technique is authored as a `skill` of subtype `combattechnique`
    // (the standalone item type was merged into Skill): it carries an embedded,
    // discriminated strike mode. Require it for that subtype; other skills have
    // none.
    if (subType === "combattechnique") {
        const strikeMode = sohlField(fm, "strikeMode", null);
        if (!strikeMode || typeof strikeMode !== "object" || !strikeMode.type) {
            throw new Error(
                `combattechnique skill requires sohl.strikeMode with a 'type' discriminator ("melee" or "missile")`,
            );
        }
        out.strikeMode = strikeMode;
    }
    return out;
}

function buildAttribute(fm) {
    return {
        scoreBase: Number(sohlField(fm, "scoreBase", 0)) || 0,
        valueDesc: parseValueDesc(sohlField(fm, "valueDesc", [])),
        initDiceFormula: sohlField(fm, "initDiceFormula", ""),
        impairedByRoles: sohlField(fm, "impairedByRoles", []),
    };
}

function buildAffliction(fm) {
    return {
        subType: requireSubType(fm),
        category: sohlField(fm, "category", ""),
        isDormant: false,
        isTreated: false,
        levelBase: Number(sohlField(fm, "levelBase", 0)) || 0,
        healingRateBase: Number(sohlField(fm, "healingRateBase", 0)) || 0,
        contagionIndexBase: Number(sohlField(fm, "contagionIndex", 0)) || 0,
        transmission: sohlField(fm, "transmission", "none"),
        // Days from contracting to onset, rolled by the receiving actor's
        // Contagion Test (#1183). Unset means no incubation.
        onsetFormula: sohlField(fm, "onsetFormula", null) || null,
        // What running the course to the end does to the host (#1128): "death"
        // or the benign default "cured".
        outcome: sohlField(fm, "outcome", "cured") || "cured",
    };
}

function buildAffiliation(fm) {
    return {
        subType: requireSubType(fm),
        society: String(sohlField(fm, "society", "")),
        office: String(sohlField(fm, "office", "")),
        title: String(sohlField(fm, "title", "")),
        level: Number(sohlField(fm, "level", 0)) || 0,
        relation: resolveRelation(
            fm,
            `affiliation "${fm?.name?.full ?? fm?.shortcode ?? "?"}"`,
        ),
    };
}

function buildTrauma(fm) {
    // Injury-only fields (level, aspect, body location) are nullable: a
    // descriptive condition (psycond/physcond) omits them, so they compile to
    // `null` (their schema initial) rather than a misleading 0/"blunt"/"".
    const rawLevel = sohlField(fm, "levelBase", null);
    return {
        subType: requireSubType(fm),
        category: sohlField(fm, "category", null),
        levelBase: rawLevel == null ? null : Number(rawLevel) || 0,
        healingRateBase: Number(sohlField(fm, "healingRateBase", 0)) || 0,
        aspect: sohlField(fm, "aspect", null),
        isTreated: Boolean(sohlField(fm, "isTreated", false)),
        isBleeding: Boolean(sohlField(fm, "isBleeding", false)),
        bodyLocationCode: sohlField(fm, "bodyLocationCode", null),
    };
}

function buildMystery(fm) {
    return {
        subType: requireSubType(fm),
        levelBase: Number(sohlField(fm, "levelBase", 0)) || 0,
        skillAptitudes: resolveSkillAptitudes(
            fm,
            `mystery "${fm?.name?.full ?? fm?.shortcode ?? "?"}"`,
        ),
        charges: resolveCharges(fm),
    };
}

function buildMysticalAbility(fm) {
    return {
        subType: requireSubType(fm),
        assocSkillCode: sohlField(fm, "assocSkillCode", ""),
        assocMysteryCode: sohlField(fm, "assocMysteryCode", ""),
        masteryLevelBase: Number(sohlField(fm, "masteryLevelBase", 0)) || 0,
        improveFlag: Boolean(sohlField(fm, "improveFlag", false)),
        levelBase: Number(sohlField(fm, "levelBase", 0)) || 0,
        charges: resolveCharges(fm),
    };
}

/**
 * Normalize the authored strike-mode list for the persisted array field.
 *
 * Strike modes are authored — and now persisted — as an array whose elements
 * each carry a `shortcode`. Every element must have a non-blank shortcode, and
 * no two on one weapon may share it (the shortcode is the mode's identity). The
 * array is returned verbatim (shortcode retained on each element).
 */
function normalizeStrikeModes(strikeModes) {
    if (!Array.isArray(strikeModes)) return [];
    const seen = new Set();
    for (const { shortcode } of strikeModes) {
        if (!shortcode) {
            throw new Error(
                "weapongear strikeModes array element requires a 'shortcode'",
            );
        }
        if (seen.has(shortcode)) {
            throw new Error(
                `weapongear has duplicate strike-mode shortcode "${shortcode}"`,
            );
        }
        seen.add(shortcode);
    }
    return strikeModes;
}

function buildWeaponGear(fm) {
    return {
        ...gearCommon(fm),
        encumbranceBase: Number(sohlField(fm, "encumbrance", 0)) || 0,
        heftBase: Number(sohlField(fm, "heft", 0)) || 0,
        strikeModes: normalizeStrikeModes(sohlField(fm, "strikeModes", [])),
    };
}

function buildArmorGear(fm) {
    const protection = sohlField(fm, "protection", {}) || {};
    return {
        ...gearCommon(fm),
        material: sohlField(fm, "material", ""),
        locations: {
            flexible: sohlField(fm, "flexloc", []) || [],
            rigid: sohlField(fm, "rigidloc", []) || [],
            // Only the one-sided articles carry entries; everything else
            // protects from any direction and ships an empty list.
            facing: (sohlField(fm, "facing", []) || []).map((f) => ({
                location: String(f.location ?? ""),
                side: String(f.side ?? "all"),
            })),
        },
        protectionBase: {
            blunt: Number(protection.blunt) || 0,
            edged: Number(protection.edged) || 0,
            piercing: Number(protection.piercing) || 0,
            fire: Number(protection.fire) || 0,
        },
        encumbrance: Number(sohlField(fm, "encumbrance", 0)) || 0,
        // An article belongs to an encumbrance group instead of carrying a
        // value when its cost is charged to a set — the arm harness.
        encumbranceGroup: sohlField(fm, "encumbranceGroup", null) || null,
        perceptionPenaltyBase:
            Number(sohlField(fm, "perceptionPenaltyBase", 0)) || 0,
    };
}

function buildProjectileGear(fm) {
    const impact = sohlField(fm, "impact", {}) || {};
    const die = Number(impact.die) || 0;
    return {
        ...gearCommon(fm),
        subType: requireSubType(fm),
        impactBase: {
            overrideDice: Boolean(impact.overrideDice ?? die > 0),
            overrideModifier: Boolean(impact.overrideModifier ?? false),
            numDice: die > 0 ? 1 : 0,
            die,
            modifier: Number(impact.modifier) || 0,
            aspect: impact.aspect || "piercing",
        },
    };
}

function buildContainerGear(fm) {
    return {
        ...gearCommon(fm),
        maxCapacityBase: Number(sohlField(fm, "maxCapacity", 0)) || 0,
    };
}

function buildMiscGear(fm) {
    return gearCommon(fm);
}

function buildConcoctionGear(fm) {
    return {
        ...gearCommon(fm),
        subType: requireSubType(fm),
        potency: sohlField(fm, "potency", "notApplicable"),
        strength: Number(sohlField(fm, "strength", 0)) || 0,
    };
}

/**
 * Pair a builder with the default art for its type.
 *
 * Reading {@link DEFAULT_ITEM_ART} here is what makes the two lists one: the
 * table below cannot name a type the art map does not cover, because
 * {@link defaultItemArt} throws and this module evaluates at import. A drift
 * that a test used to catch is now unrepresentable.
 *
 * Importing the art map keeps this module a leaf — it is plain data, not the
 * resolved configuration, and the cycle the module note above warns about is
 * only ever closed by reading configuration back out.
 *
 * @param {string} type - The item type, and the art map's key.
 * @param {(fm: object) => object} system - Builder for the type's `system` block.
 * @returns {{system: (fm: object) => object, img: string}} The registry entry.
 */
function withArt(type, system) {
    return Object.freeze({ system, img: defaultItemArt(type) });
}

/**
 * Every item type SoHL ships, keyed to the builder that produces its `system`
 * block and the default art a note of that type gets when it sets no `img:` —
 * this repository's answer to "which types compile into an Item", declared as
 * `itemBuilders` and read back through the resolved configuration.
 *
 * **Entries carry their art as of #7.** They used to be bare functions, with
 * art looked up separately in `default-item-art.mjs`. That left a consumer's
 * *own* item type able to declare a builder but not a default image, because
 * the art table is SoHL's and closed to consumers. Pairing them here moves the
 * art onto the one seam a type is already declared through, and costs this
 * repository nothing: {@link DEFAULT_ITEM_ART} is still the single map both
 * this build and `SohlItem.getDefaultArtwork` read (SoHL#932/#1510).
 *
 * @type {Readonly<Record<string, {system: (fm: object) => object, img: string}>>}
 */
export const ITEM_BUILDERS = Object.freeze({
    affiliation: withArt("affiliation", buildAffiliation),
    affliction: withArt("affliction", buildAffliction),
    armorgear: withArt("armorgear", buildArmorGear),
    attribute: withArt("attribute", buildAttribute),
    concoctiongear: withArt("concoctiongear", buildConcoctionGear),
    containergear: withArt("containergear", buildContainerGear),
    miscgear: withArt("miscgear", buildMiscGear),
    mystery: withArt("mystery", buildMystery),
    mysticalability: withArt("mysticalability", buildMysticalAbility),
    projectilegear: withArt("projectilegear", buildProjectileGear),
    skill: withArt("skill", buildSkill),
    trauma: withArt("trauma", buildTrauma),
    weapongear: withArt("weapongear", buildWeaponGear),
});
