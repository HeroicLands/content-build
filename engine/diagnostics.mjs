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
 * Build diagnostics that name the file, line and column they are about.
 *
 * A build that reports a problem by the **note's name** — `Unresolved wikilink
 * in "The Capital Nome"` — has told the author what is wrong and not where it
 * is. A name is not an address: finding it means searching the tree for a note
 * whose `name.full` matches and then searching that file for the link, and
 * four identical warnings on one note are indistinguishable from one another
 * (#17).
 *
 * So every diagnostic about a note is emitted in the form every C-family
 * compiler, `tsc` and ESLint already use:
 *
 * ```text
 * assets/content/Nomes/Capital.md:42:17: warning: unresolved wikilink [[Kenbet_Pat]] (unknown)
 * ```
 *
 * `file:line:column: severity: message`. Nothing here is invented, which is
 * the point: an editor, a CI annotator or a `grep` already parses it, with no
 * knowledge of this build and nothing extra for it to emit.
 *
 * **Two rules keep the form parseable.**
 *
 * - _The locator starts the line._ Diagnostics deliberately bypass `loglevel`,
 *   whose `[timestamp] [WARN]:` prefix occupies exactly the position a parser
 *   reads the path from — a greedy path pattern swallows the prefix and yields
 *   a filename no editor can open.
 * - _A field is dropped, never guessed._ A position that cannot be established
 *   honestly is omitted (`file: warning: …`) rather than defaulted to `1:1`,
 *   which would send a reader to the frontmatter every time.
 */

import path from "node:path";

/**
 * The `file:line:column` locator, with whatever is known.
 *
 * The path is relativized against the working directory — during a build that
 * is the consuming repository's root, so the result is both shorter to read
 * and what an editor resolves a relative diagnostic against. A path outside
 * the tree stays absolute, since a `../../..` locator helps nobody.
 *
 * @param {object} at
 * @param {string} [at.file] - Absolute or relative path to the source file.
 * @param {number} [at.line] - 1-based line.
 * @param {number} [at.column] - 1-based column. Ignored without a line.
 * @returns {string} The locator, or `""` when not even a file is known.
 */
export function formatLocator({ file, line, column } = {}) {
    if (!file) return "";
    let shown = file;
    if (path.isAbsolute(file)) {
        const rel = path.relative(process.cwd(), file);
        // `..` means the file sits outside the working directory; an absolute
        // path is the more useful of the two there.
        if (rel && !rel.startsWith("..")) shown = rel;
    }
    if (!Number.isFinite(line)) return shown;
    if (!Number.isFinite(column)) return `${shown}:${line}`;
    return `${shown}:${line}:${column}`;
}

/**
 * One diagnostic, as a parseable line.
 *
 * @param {object} d
 * @param {string} [d.file] - Source file the diagnostic is about.
 * @param {number} [d.line] - 1-based line.
 * @param {number} [d.column] - 1-based column.
 * @param {"warning"|"error"} d.severity - Which of the two levels this is.
 * @param {string} d.message - What is wrong, in one sentence.
 * @returns {string} `file:line:column: severity: message`, with any unknown
 *   leading field omitted.
 */
export function formatDiagnostic({ file, line, column, severity, message }) {
    const locator = formatLocator({ file, line, column });
    return `${locator ? `${locator}: ` : ""}${severity}: ${message}`;
}

/**
 * Prints one diagnostic on the console, unprefixed.
 *
 * **Both severities go to stderr**, which is what keeps findings clear of the
 * progress and summary prose a build writes to stdout. That is Node's doing,
 * not a choice made here: `console.warn` is an alias for `console.error` and
 * writes to `process.stderr`, so the two branches below differ only in which
 * severity word the line carries, never in the stream.
 *
 * Saying otherwise has already cost something — an earlier version of this
 * comment claimed warnings went to stdout, and a consumer wrote a whole
 * local wrapper to obtain the stderr routing it already had. Anything relying
 * on the separation should split on the `severity` field, not on the stream.
 *
 * This deliberately sidesteps `loglevel`, for the reason given in the module
 * docs.
 *
 * @param {object} d - As {@link formatDiagnostic}.
 * @returns {void}
 */
export function emitDiagnostic(d) {
    const line = formatDiagnostic(d);
    if (d.severity === "error") console.error(line);
    else console.warn(line);
}

/**
 * Where a character offset within a note's **body** falls in its **file**.
 *
 * Three corrections separate the two, and each is applied only where it is
 * true:
 *
 * 1. _The frontmatter._ A body offset is not a file line until the lines
 *    before the body are added — `bodyLine`.
 * 2. _The trimmed first line._ `parseMarkdownFile` trims the body, so its
 *    first line may have lost indentation the file still has. `bodyColumn`
 *    restores it, and only on that line.
 * 3. _Generated text._ A body is scanned **after** its content tables expand,
 *    so an offset may fall in text no one authored. `lineMap` maps each
 *    scanned line back to the line it came from; a generated line reports the
 *    directive that produced it and **no column**, since there is no authored
 *    character to point at.
 *
 * @param {string} body - The text the offset indexes into.
 * @param {number} offset - 0-based character offset within `body`.
 * @param {object} [opts]
 * @param {number} [opts.bodyLine=1] - 1-based file line of the body's line 0.
 * @param {number} [opts.bodyColumn=1] - 1-based file column of the body's
 *   first character.
 * @param {Array<{line: number, generated: boolean}>} [opts.lineMap] - Per
 *   scanned line, the 0-based body line it came from. From
 *   {@link expandContentTables}.
 * @returns {{line: number, column: number|undefined, generated: boolean}}
 */
export function positionInBody(
    body,
    offset,
    { bodyLine = 1, bodyColumn = 1, lineMap } = {},
) {
    const upTo = String(body ?? "").slice(0, Math.max(0, offset));
    const nl = upTo.lastIndexOf("\n");
    const scannedLine = upTo.length === 0 ? 0 : upTo.split("\n").length - 1;
    const column = upTo.length - nl; // 1-based: offset - (nl + 1) + 1

    const mapped = lineMap?.[scannedLine];
    const sourceLine = mapped ? mapped.line : scannedLine;
    const generated = mapped ? mapped.generated : false;

    return {
        line: bodyLine + sourceLine,
        // A generated line has no authored column, and the first line's
        // column is the only one the trim can have moved.
        column:
            generated ? undefined
            : sourceLine === 0 ? bodyColumn + column - 1
            : column,
        generated,
    };
}
