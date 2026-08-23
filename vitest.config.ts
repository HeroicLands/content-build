import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The package's own test harness.
 *
 * `@heroiclands/content-build` is verifiable on its own: `npm test -w
 * @heroiclands/content-build` loads this config directly, and the repository's
 * root `vitest.config.ts` references the same file as one of its projects, so
 * the two runs are the same suite (#1511).
 *
 * Deliberately austere. There is no `tests/setup.ts` and no `@src` alias: the
 * pack pipeline is Foundry-free and severed from the system source (#1510), and
 * a harness that offered either would let that severance rot. A test that needs
 * the runtime is a *repository* test and belongs in `tests/build/`.
 *
 * **The suite is configured from a fixture repository, not from the root.** The
 * Foundry package id and the system version are derived from the `package.json`
 * beside the configuration (#50), and at the root that is this toolchain's own
 * manifest — `@heroiclands/content-build`, which is neither a Foundry package
 * id nor a game system version. `tests/fixtures/repo/` holds a configuration
 * with a `package.json` shaped like a consumer's, which is what makes the
 * derivation mean anything.
 *
 * `tests/import-needs-no-config.test.ts` deletes this variable from the
 * environment it spawns into, so the case proving the package imports with *no*
 * configuration is unaffected.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        name: "content-build",
        globals: true,
        environment: "node",
        include: ["tests/**/*.test.ts"],
        env: {
            CONTENT_BUILD_CONFIG: path.join(
                HERE,
                "tests/fixtures/repo/content-build.config.yaml",
            ),
        },
    },
});
