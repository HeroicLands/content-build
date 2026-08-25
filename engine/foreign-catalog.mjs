/**
 * @file The item catalogue of a package this repository depends on but does not
 * contain.
 *
 * A consuming repository may author **beings** without holding the items they
 * are assembled from. `sohl-thalorna` is the case: its being notes address
 * embedded items by `(type, shortcode)` — `attribute:str`, `skill:awar` — and
 * almost every one of those belongs to the `sohl` package. The actors pass
 * resolves against Item pack output, so with no local items there is nothing to
 * resolve against and every embedded item fails.
 *
 * The dependency is already declared, with a manifest URL and a version range:
 *
 * ```yaml
 * relationships:
 *     systems:
 *         - id: sohl
 *           manifest: https://…/releases/latest/download/system.json
 *           compatibility: { minimum: "0.8.2", verified: "0.8.2" }
 *           itemCatalog: true
 * ```
 *
 * `itemCatalog: true` opts that relationship in. This module turns it into
 * directories of item JSON that the actors pass reads exactly as it reads a
 * local pack's output — the resolution logic needs no knowledge of where an
 * item came from.
 *
 * **The network is never touched by a compile.** Fetching is its own command
 * (`content-build deps fetch`), and a compile whose cache is cold fails saying
 * so. A build that silently downloads is not reproducible, fails strangely
 * offline, and hides a version change behind a passing run.
 */

import fs from "node:fs";
import path from "node:path";

import { unzipSync } from "fflate";
import { extractPack } from "@foundryvtt/foundryvtt-cli";

import log from "loglevel";

/** Written once a fetch completes, so a half-finished cache is never used. */
const STAMP = ".complete";

/**
 * Every declared relationship that opted into supplying an item catalogue.
 *
 * @param {object} config - The resolved build configuration.
 * @returns {Array<{id: string, manifest: string, kind: string, verified: string|undefined}>}
 *   The opted-in relationships, in declaration order.
 */
export function itemCatalogRelationships(config) {
    const out = [];
    for (const [kind, entries] of Object.entries(config.relationships ?? {})) {
        for (const rel of entries ?? []) {
            if (rel.itemCatalog) {
                out.push({
                    id: rel.id,
                    manifest: rel.manifest,
                    kind,
                    verified: rel.compatibility?.verified,
                });
            }
        }
    }
    return out;
}

/**
 * The cache directory for one dependency at one version.
 *
 * Keyed by version so that changing the pinned version is a different cache
 * rather than a silent overwrite, and so a second build costs nothing.
 *
 * @param {object} config - The resolved build configuration.
 * @param {string} id - The dependency's package id.
 * @param {string} version - Its resolved version.
 * @returns {string} The directory.
 */
export function catalogDir(config, id, version) {
    return path.join(config.paths.foreignCache, `${id}@${version}`);
}

/**
 * The directory holding extracted item JSON for one cached dependency.
 *
 * @param {string} dir - The dependency's cache directory.
 * @returns {string} Its items directory.
 */
const itemsDir = (dir) => path.join(dir, "items");

/**
 * Whether a dependency's cache is present and complete.
 *
 * @param {string} dir - The dependency's cache directory.
 * @returns {boolean} True when it was fetched to completion.
 */
const isComplete = (dir) => fs.existsSync(path.join(dir, STAMP));

/**
 * Read a dependency's manifest.
 *
 * @param {string} url - The manifest URL.
 * @returns {Promise<object>} The parsed manifest.
 */
async function fetchManifest(url) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
        throw new Error(
            `could not read the manifest at ${url}: HTTP ${res.status} ${res.statusText}`,
        );
    }
    return await res.json();
}

/**
 * Download a package archive and unzip it into `dest`.
 *
 * @param {string} url - The archive URL, from the manifest's `download`.
 * @param {string} dest - Where to write the archive's contents.
 * @returns {Promise<void>}
 */
async function downloadAndUnzip(url, dest) {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
        throw new Error(
            `could not download ${url}: HTTP ${res.status} ${res.statusText}`,
        );
    }
    const zip = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(zip);
    for (const [name, bytes] of Object.entries(files)) {
        // A zip entry is a path; a directory entry has no bytes.
        if (name.endsWith("/") || bytes.length === 0) continue;
        const full = path.join(dest, name);
        // A zip may name entries outside the destination; refuse those rather
        // than write wherever the archive says.
        const rel = path.relative(dest, full);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            throw new Error(`archive entry escapes the destination: ${name}`);
        }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, bytes);
    }
}

/**
 * The manifest URL to actually read, pinned to the declared version.
 *
 * A consumer writes `releases/latest/download/system.json`, which is the right
 * thing to publish and the wrong thing to build against: the artifact behind it
 * changes when somebody else cuts a release, so a build names no particular
 * dependency and "thalorna 0.1.0" stops being reproducible. The declared
 * `compatibility.verified` is the version this repository was actually built
 * against, so that is the one to fetch.
 *
 * GitHub's release URLs are rewritable — `releases/latest/download/X` is
 * `releases/download/v<version>/X`. Where the URL is not that shape there is
 * nothing to rewrite, so the declared URL is read and its version checked
 * instead: floating silently is the one outcome not on offer.
 *
 * @param {string} url - The declared manifest URL.
 * @param {string|undefined} verified - The declared verified version.
 * @returns {{url: string, pinned: boolean}} The URL to read.
 */
export function pinnedManifestUrl(url, verified) {
    if (!verified) return { url, pinned: false };
    const marker = "/releases/latest/download/";
    const at = url.indexOf(marker);
    if (at === -1) return { url, pinned: false };
    const tag = verified.startsWith("v") ? verified : `v${verified}`;
    return {
        url:
            url.slice(0, at) +
            `/releases/download/${tag}/` +
            url.slice(at + marker.length),
        pinned: true,
    };
}

/**
 * Fetch one dependency and extract its Item packs.
 *
 * Idempotent: a complete cache for the resolved version is left alone.
 *
 * @param {object} config - The resolved build configuration.
 * @param {{id: string, manifest: string}} rel - The declared relationship.
 * @returns {Promise<string>} The dependency's cache directory.
 */
export async function fetchCatalog(config, rel) {
    const { url, pinned } = pinnedManifestUrl(rel.manifest, rel.verified);
    const manifest = await fetchManifest(url);
    const version = manifest.version;
    if (!version) {
        throw new Error(`${rel.id}: its manifest declares no \`version\``);
    }
    if (!pinned && rel.verified && version !== rel.verified) {
        throw new Error(
            `${rel.id}: declares \`compatibility.verified: ${rel.verified}\` but ` +
                `${url} offers ${version}. Building against a moving target is ` +
                `not reproducible — update \`verified\`, or point \`manifest\` ` +
                `at a pinned release.`,
        );
    }
    if (!rel.verified) {
        log.warn(
            `${rel.id}: no \`compatibility.verified\`, so its catalogue floats ` +
                `with whatever ${url} currently serves`,
        );
    }
    const dir = catalogDir(config, rel.id, version);
    if (isComplete(dir)) {
        log.info(`${rel.id}@${version}: already cached`);
        return dir;
    }

    const download = manifest.download;
    if (!download) {
        throw new Error(
            `${rel.id}@${version}: its manifest declares no \`download\``,
        );
    }

    // Rebuild from empty: a previous run may have died partway, and a stale
    // half-tree is worse than no tree.
    fs.rmSync(dir, { recursive: true, force: true });
    const raw = path.join(dir, "package");
    fs.mkdirSync(raw, { recursive: true });

    log.info(`${rel.id}@${version}: downloading ${download}`);
    await downloadAndUnzip(download, raw);

    const itemPacks = (manifest.packs ?? []).filter(
        (pack) => pack.type === "Item",
    );
    if (!itemPacks.length) {
        throw new Error(
            `${rel.id}@${version}: its manifest declares no Item packs, so it ` +
                `cannot supply an item catalogue`,
        );
    }

    for (const pack of itemPacks) {
        // `pack.path` is relative to the package root inside the archive, and
        // archives commonly nest everything under one directory.
        const src = resolvePackPath(raw, pack.path);
        if (!src) {
            throw new Error(
                `${rel.id}@${version}: pack "${pack.name}" is declared at ` +
                    `${pack.path}, which the archive does not contain`,
            );
        }
        const out = path.join(itemsDir(dir), pack.name);
        fs.mkdirSync(out, { recursive: true });
        await extractPack(src, out, { log: false });
        log.info(`${rel.id}@${version}: extracted pack "${pack.name}"`);
    }

    fs.writeFileSync(path.join(dir, STAMP), `${version}\n`);
    return dir;
}

/**
 * Locate a declared pack inside an unpacked archive.
 *
 * Foundry archives are inconsistent about whether they nest their contents
 * under a top-level directory, so try the path as given and then one level in.
 *
 * @param {string} root - The unpacked archive root.
 * @param {string} packPath - The manifest's declared pack path.
 * @returns {string|null} The directory, or null when absent.
 */
function resolvePackPath(root, packPath) {
    const direct = path.join(root, packPath);
    if (fs.existsSync(direct)) return direct;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const nested = path.join(root, entry.name, packPath);
        if (fs.existsSync(nested)) return nested;
    }
    return null;
}

/**
 * Fetch every opted-in dependency. The `deps fetch` command.
 *
 * @param {object} config - The resolved build configuration.
 * @returns {Promise<number>} How many dependencies were fetched.
 */
export async function fetchAllCatalogs(config) {
    const rels = itemCatalogRelationships(config);
    if (!rels.length) {
        log.info(
            "No relationship declares `itemCatalog: true`; nothing to fetch.",
        );
        return 0;
    }
    for (const rel of rels) await fetchCatalog(config, rel);
    return rels.length;
}

/**
 * The extracted item directories the actors pass should resolve against, on
 * top of this repository's own.
 *
 * Reads the cache only. A cold cache is an error naming the command that fills
 * it, rather than a download nobody asked for.
 *
 * @param {object} config - The resolved build configuration.
 * @returns {string[]} Every cached dependency's item directories.
 */
export function foreignItemCatalogDirs(config) {
    const dirs = [];
    for (const rel of itemCatalogRelationships(config)) {
        const root = config.paths.foreignCache;
        const cached =
            fs.existsSync(root) ?
                fs
                    .readdirSync(root)
                    .filter((name) => name.startsWith(`${rel.id}@`))
                    .map((name) => path.join(root, name))
                    .filter(isComplete)
            :   [];
        if (!cached.length) {
            throw new Error(
                `${rel.id} declares \`itemCatalog: true\` but has not been ` +
                    `fetched. Run \`content-build deps fetch\` first.`,
            );
        }
        // Newest last wins if several versions are cached; a fetch always
        // writes the currently declared one, so that is the one to use.
        cached.sort();
        const items = itemsDir(cached[cached.length - 1]);
        for (const name of fs.readdirSync(items)) {
            dirs.push(path.join(items, name));
        }
    }
    return dirs;
}
