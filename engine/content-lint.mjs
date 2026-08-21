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
 * Linting a content tree's **addresses** — the rules every package's notes are
 * authored against, wherever those notes live.
 *
 * These rules used to live in the SoHL repository's `utils/`, which had two
 * consequences and no upside (#20). `thalorna` and `kethira` notes were checked
 * by nothing at all, so the packages most likely to carry authoring mistakes
 * were the ones nothing inspected. And one rule with two implementations can
 * disagree without anything detecting it, which the canonical-separator
 * handling already did once on each side.
 *
 * Three rules, all about a note's identity:
 *
 * 1. **Shape** — a `shortcode` is strictly ASCII-alphanumeric. It is the
 *    identity key referenced from saved world data, and it is half of the
 *    `type-shortcode` address, whose parse depends on the separating hyphen
 *    being the only hyphen in the string.
 * 2. **Uniqueness** — `(type, shortcode)` names one note.
 * 3. **Alias** — the note physically carries its own address in `aliases`, and
 *    carries exactly one address-shaped alias.
 *
 * **Nothing here writes.** A check reports and an author fixes; the aliases in
 * particular were populated once, deliberately, by the maintainer, and the same
 * courtesy the system extends to a player's characters applies to the author's
 * own material.
 *
 * **What is deliberately absent.** Corpus reachability — "every Rules document
 * is reachable from the book's root" — is a statement about what one package
 * publishes, not about the note format, and belongs with the publishing it
 * describes. So do retired hostnames.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import { positionInFrontmatter } from "./diagnostics.mjs";
import { walkMarkdownTree } from "./helpers.mjs";

/**
 * The shape every `shortcode` must match: ASCII letters and digits only.
 *
 * Case is deliberately **not** constrained: hundreds of authored shortcodes are
 * mixed-case and collide with nothing, so tightening that is a separate
 * decision from this one.
 *
 * A consuming system's *runtime* keeps its own copy of this pattern — it cannot
 * import a build-time dependency into shipped code — and is expected to pin the
 * two together with a test rather than trust that they still agree.
 */
export const SHORTCODE_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * Whether a value is a well-formed shortcode.
 *
 * A blank value is **not** valid here. Blank is handled separately wherever a
 * key is derived from a document's name, so this predicate answers only "is
 * this an acceptable key", never "is this key present".
 *
 * @param {unknown} value - The candidate shortcode.
 * @returns {boolean} `true` when it matches {@link SHORTCODE_PATTERN}.
 */
export function isValidShortcode(value) {
    return typeof value === "string" && SHORTCODE_PATTERN.test(value);
}

/**
 * Whether an alias is an **address** — a string a reader could write between
 * `[[…]]` and have resolved as `type-shortcode` rather than as a name.
 *
 * The test is the resolver's own (see `readQualifier` in `./wikilinks.mjs`):
 * split at the **first** hyphen, and treat it as a qualifier **only when what
 * precedes it is a known type**. Note names are hyphenated too — `Grukar-ahk`
 * is an alias, not an address — which is exactly why the mere presence of a
 * hyphen cannot be the rule.
 *
 * Two forms are deliberately *not* addresses:
 *
 * - **`type/shortcode`**, the legacy separator. Obsidian reads `/` as a path,
 *   so a slash-qualified string could never be the alias that makes an address
 *   resolve in the editor — which is the entire reason the alias exists.
 * - **`doc<type>-shortcode`**, the virtual qualifier addressing an item's
 *   *write-up*. That is a second document compiled from the same note, not this
 *   note's identity, so it is free to appear as an ordinary alias.
 *
 * @param {unknown} alias - A candidate alias.
 * @param {Set<string>} types - Every type the content tree contains, lowercase.
 * @returns {boolean} `true` when the alias reads as `type-shortcode`.
 */
export function isAddressAlias(alias, types) {
    if (typeof alias !== "string") return false;
    const hyphen = alias.indexOf("-");
    // `> 0` rather than `!== -1`: a leading hyphen leaves no type before it.
    if (hyphen <= 0 || hyphen === alias.length - 1) return false;
    return types.has(alias.slice(0, hyphen).toLowerCase());
}

/**
 * Audit one note's aliases against the rule.
 *
 * The shortcode's **character set is not checked here** — that is
 * {@link isValidShortcode}'s rule, and asserting it in two places would report
 * one note twice for one defect while coupling two independent invariants. This
 * answers a narrower question: does the note carry exactly one address-shaped
 * alias, and is it this note's address?
 *
 * **Why *exactly one*, rather than merely "the right one is present".** When a
 * shortcode changes and the previous alias is left behind, every old inbound
 * `[[type-oldcode|…]]` keeps resolving to the correct note. Nothing degrades,
 * nothing is reported, and the tree carries two live addresses for one
 * document — until the retired code is reused years later and the old links
 * silently land on the wrong note. Counting is what catches that; presence
 * never could.
 *
 * @param {{type: string, shortcode: unknown, aliases: unknown}} note - The
 *   note's frontmatter, as authored.
 * @param {Set<string>} types - Every type the content tree contains, lowercase.
 * @returns {{ok: true, skipped?: "no-shortcode"} |
 *   {ok: false, reason: "missing"|"duplicate"|"mismatch",
 *    expected: string, found: string[]}} The verdict.
 */
export function auditNoteAliases(note, types) {
    const shortcode = typeof note.shortcode === "string" ? note.shortcode : "";
    // A note with no shortcode has no address to carry, and cannot be a link
    // target at all. The uniqueness rule skips it for the same reason.
    if (!shortcode) return { ok: true, skipped: "no-shortcode" };

    const expected = `${note.type}-${shortcode}`;
    const aliases = Array.isArray(note.aliases) ? note.aliases : [];
    const found = aliases.filter((a) => isAddressAlias(a, types));

    if (found.length === 0)
        return { ok: false, reason: "missing", expected, found };
    if (found.length > 1)
        return { ok: false, reason: "duplicate", expected, found };
    // Exact, not case-insensitive: Obsidian would resolve a case-drifted alias
    // happily, so nothing else would ever notice it had stopped matching the
    // address the note actually declares.
    if (found[0] !== expected)
        return { ok: false, reason: "mismatch", expected, found };
    return { ok: true };
}

/**
 * Collect the notes a lint pass reasons about.
 *
 * Only notes carrying a `type` are content notes. Vault scaffolding —
 * `Templates/`, a `README`, a repository's own `CLAUDE.md` — has no type, is
 * neither addressed nor addressable, and would fail rules it can never satisfy.
 *
 * @param {string} contentBase - Root of the content tree.
 * @param {object} [opts]
 * @param {readonly string[]} [opts.skipDirectories] - Passed to the walk.
 * @returns {Array<{fm: object, absPath: string, file: string}>} The notes, in
 *   path order so findings read top to bottom.
 */
function collectNotes(contentBase, { skipDirectories } = {}) {
    const notes = [];
    const walkOpts = skipDirectories ? { skipDirectories } : undefined;
    for (const { frontmatter: fm, absPath } of walkMarkdownTree(
        contentBase,
        walkOpts,
    )) {
        if (!fm || !fm.type) continue;
        notes.push({
            fm,
            absPath,
            file: path.relative(process.cwd(), absPath),
        });
    }
    notes.sort((a, b) => (a.absPath < b.absPath ? -1 : 1));
    return notes;
}

/**
 * Lint every address in a content tree.
 *
 * @param {string} contentBase - Root of the content tree.
 * @param {object} [opts]
 * @param {readonly string[]} [opts.skipDirectories] - Directory names the walk
 *   ignores. Defaults to the configured list.
 * @returns {{findings: Array<{file: string, line?: number, column?: number,
 *   severity: "error"|"warning", message: string}>, notes: number,
 *   keys: number}} The findings, and what was inspected to produce them.
 */
export function lintContentTree(contentBase, { skipDirectories } = {}) {
    const findings = [];
    const notes = collectNotes(contentBase, { skipDirectories });

    // Every type the tree itself contains — the alias rule has to know what
    // reads as a qualifier, and the tree is the only honest source for that. A
    // fixed vocabulary here would hand an adventure module a rule about types
    // it does not have (#20).
    const types = new Set(notes.map((n) => String(n.fm.type).toLowerCase()));

    /** @type {Map<string, Array<{file: string, absPath: string}>>} */
    const byKey = new Map();

    for (const { fm, absPath, file } of notes) {
        const shortcode = fm.shortcode;
        // Folder documents and keyless entries carry no address at all.
        if (!shortcode) continue;

        // Read only when there is something to say about the note, so a clean
        // tree costs one pass rather than two.
        const raw = () => fs.readFileSync(absPath, "utf8");

        const key = `${fm.type}:${shortcode}`;
        const seen = byKey.get(key);
        if (seen) seen.push({ file, absPath });
        else byKey.set(key, [{ file, absPath }]);

        if (!isValidShortcode(shortcode)) {
            findings.push({
                file,
                ...positionInFrontmatter(raw(), "shortcode", String(shortcode)),
                severity: "error",
                message:
                    `shortcode "${shortcode}" is not strictly alphanumeric; it ` +
                    `is the identity key and half of the ` +
                    `"${fm.type}-${shortcode}" address, whose parse needs the ` +
                    `separator to be the only hyphen`,
            });
        }

        const verdict = auditNoteAliases(fm, types);
        if (!verdict.ok) {
            const at =
                verdict.found.length ?
                    positionInFrontmatter(raw(), "aliases", verdict.found[0])
                :   positionInFrontmatter(
                        raw(),
                        "shortcode",
                        String(shortcode),
                    );
            const detail =
                verdict.reason === "missing" ?
                    `carries no address alias; add "${verdict.expected}" to ` +
                    `\`aliases\` so the address resolves in the editor too`
                : verdict.reason === "duplicate" ?
                    `carries ${verdict.found.length} address aliases ` +
                    `(${verdict.found.map((f) => `"${f}"`).join(", ")}); exactly ` +
                    `one is allowed, and it must be "${verdict.expected}" — a ` +
                    `left-behind alias keeps resolving until its code is reused`
                :   `carries the address alias "${verdict.found[0]}" but its ` +
                    `address is "${verdict.expected}"`;
            findings.push({ file, ...at, severity: "error", message: detail });
        }
    }

    // "Every one of nothing is unique" is a vacuous pass, and it is exactly
    // what a tree that failed to check out produces — so the lint would go
    // green on the one state it most needs to catch.
    if (byKey.size === 0) {
        findings.push({
            file: path.relative(process.cwd(), contentBase) || contentBase,
            severity: "error",
            message:
                "holds no keyed content, so every rule here is vacuous — " +
                "check that the content tree is present and that this is its root",
        });
        return { findings, notes: notes.length, keys: 0 };
    }

    for (const [key, files] of byKey) {
        if (files.length < 2) continue;
        // Reported once per offending note rather than once per key: each note
        // is a place an author has to go and edit, and a finding naming only
        // the key sends them hunting for the other one.
        for (const { file, absPath } of files) {
            const others = files
                .filter((f) => f.file !== file)
                .map((f) => f.file);
            findings.push({
                file,
                ...positionInFrontmatter(
                    fs.readFileSync(absPath, "utf8"),
                    "shortcode",
                ),
                severity: "error",
                message:
                    `duplicate address "${key}", also declared by ` +
                    `${others.join(", ")}; a document is addressed by ` +
                    `(type, shortcode) across every pack of its document type, ` +
                    `so routing them to different packs does not separate them`,
            });
        }
    }

    return { findings, notes: notes.length, keys: byKey.size };
}
