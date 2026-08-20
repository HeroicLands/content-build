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
 * The resolved content-build configuration the pack pipeline reads.
 *
 * One module, one import: everything the compilers used to hard-code — the
 * content package, the Foundry package and its kind, every path, the `_stats`
 * identity, the item-type membership, and the pack list — arrives from the
 * consuming repository's `content-build.config.mjs` (#1508).
 *
 * **Resolved on first read, never at import (#2).** {@link loadPackConfig}
 * is a function rather than a module-level constant, so importing this module —
 * or the `engine` barrel, or a leaf module that happens to sit downstream of it
 * — costs nothing and requires nothing. A repository with no configuration can
 * still ask the CLI its version, and a consumer can still import a pure helper
 * (`engine/content-slug`, `engine/wikilinks`) without standing up a whole pack
 * build. The absence is still loud, just at the moment a configured value is
 * actually needed: every accessor in the engine funnels through here, so
 * anything that reads configuration throws with the message below.
 *
 * **Located by walking up from this module, not from the working directory.**
 * The config file sits at the root of the repository that installed the
 * toolchain, so climbing out of `node_modules/@heroiclands/content-build/engine/`
 * — or, in this repository, out of `packages/content-build/engine/` — lands on
 * it either way. Resolving it against `process.cwd()` instead would make the
 * build read a different tree depending on where it was launched from, which is
 * the very property #1508 removed. `CONTENT_BUILD_CONFIG` names the file
 * explicitly when a consumer keeps it somewhere else.
 *
 * **Loaded synchronously**, with `require` rather than `await import`, so that
 * reading configuration is an ordinary expression at any call site instead of
 * making every module downstream of it an async one. Node has supported
 * `require()` of an ES module since v22.12 and this package requires v24, so
 * the only shape it cannot load is a config whose own module graph uses
 * top-level `await` — which is reported as such rather than as an opaque
 * loader error.
 *
 * **A consumer's config file must import `defineConfig` from
 * `@heroiclands/content-build/config`, never from the package root barrel.**
 * The barrel pulls in the compilers, the compilers read this module, and this
 * module loads the config file — so a config that reaches for the barrel closes
 * a cycle around its own evaluation. The leaf entry point performs no I/O and
 * imports nothing but `node:path`, so it cannot.
 *
 * Reading it costs no I/O beyond loading that one file: `defineConfig` only
 * validates and freezes, so this module remains as side-effect-free as the pack
 * library it serves.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/** The file name every consuming repository declares its build in. */
export const CONFIG_FILENAME = "content-build.config.mjs";

/**
 * The nearest {@link CONFIG_FILENAME} at or above a directory.
 *
 * @param {string} from - The directory to start from.
 * @returns {string|undefined} Its absolute path, or `undefined` if the walk
 *   reaches the filesystem root without finding one.
 */
export function findConfigFile(from) {
    let dir = path.resolve(from);
    for (;;) {
        const candidate = path.join(dir, CONFIG_FILENAME);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
}

const require = createRequire(import.meta.url);

/** The loaded configuration, memoised — the file is read at most once. */
let loaded;

/**
 * The consuming repository's resolved, frozen configuration.
 *
 * Every engine module that needs a configured value calls this, rather than
 * hoisting one at import: that is what keeps the library importable without a
 * configuration (#2). The result is memoised, so calling it in a default
 * parameter — the usual spelling here — costs one property read per call.
 *
 * @returns {import("../config.mjs").ContentBuildConfig} The frozen configuration.
 * @throws {Error} When no configuration file can be found, or the one named
 *   cannot be loaded. Absence is a defect, not a fallback: without it the
 *   compilers know neither what to compile nor where to put it.
 */
export function loadPackConfig() {
    if (loaded) return loaded;

    const explicit = process.env.CONTENT_BUILD_CONFIG;
    const configPath =
        explicit ? path.resolve(explicit) : findConfigFile(import.meta.dirname);

    if (!configPath || !fs.existsSync(configPath)) {
        throw new Error(
            explicit ?
                `content-build: CONTENT_BUILD_CONFIG names ${configPath}, ` +
                    `which does not exist.`
            :   `content-build: no ${CONFIG_FILENAME} found at or above ` +
                    `${import.meta.dirname}. A consuming repository declares its ` +
                    `build in one file at its root; set CONTENT_BUILD_CONFIG to ` +
                    `name it elsewhere.`,
        );
    }

    let module;
    try {
        module = require(configPath);
    } catch (err) {
        if (err?.code === "ERR_REQUIRE_ASYNC_MODULE") {
            throw new Error(
                `content-build: ${configPath} (or something it imports) uses ` +
                    `top-level await, which the configuration cannot: it is ` +
                    `read synchronously so that reading a configured value ` +
                    `stays an ordinary expression. Move the awaited work into ` +
                    `the build that consumes the configuration.`,
                { cause: err },
            );
        }
        throw err;
    }

    loaded = module.default ?? module;
    return loaded;
}
