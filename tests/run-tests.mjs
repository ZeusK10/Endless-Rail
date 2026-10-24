import { build } from "esbuild";

const result = await build({
  entryPoints: ["tests/simulation.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
  treeShaking: true,
});
const compiled = result.outputFiles[0].text;
await import("data:text/javascript;base64," +
  Buffer.from(compiled).toString("base64"));
