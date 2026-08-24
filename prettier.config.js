/*
 * This file is part of the Song of Heroic Lands (SoHL) system for Foundry VTT.
 * Copyright (c) 2024-2026 Tom Rodriguez ("Toasty") — <toasty@heroiclands.org>
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * This repository's Prettier configuration — the shared one it publishes.
 *
 * The values used to be spelled out here, annotated as "matched to the Song of
 * Heroic Lands repository this package was extracted from, so a module moving
 * between the two does not reformat". That was the right intent and the wrong
 * mechanism: matching by hand is what drifts. The values now live in
 * `engine/prose-config.mjs`, every consumer gets them from
 * `content-build format`, and this repository eats the same food it serves
 * (#69).
 *
 * @type {import("prettier").Config}
 */
export { default } from "./prettier-config.mjs";
