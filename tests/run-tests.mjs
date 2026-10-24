import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Bundling into a short-lived file keeps test failure stack traces readable.
// Importing a base64 data URL made CI print the entire bundle on assertion errors.
const temporary = await mkdtemp(join(tmpdir(), "endless-rail-tests-"));
try {
  const output = join(temporary, "simulation.test.mjs");
  await build({
    entryPoints: ["tests/simulation.test.ts"],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    treeShaking: true,
  });
  const result = spawnSync(process.execPath, ["--test", output], {
    stdio: "inherit",
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
