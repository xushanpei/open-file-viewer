// @vitest-environment node

import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("keeps optional CAD peers out of esbuild static resolution", async () => {
  const resolvedCadPeers: string[] = [];

  await expect(
    build({
      entryPoints: [fileURLToPath(new URL("./index.ts", import.meta.url))],
      bundle: true,
      format: "esm",
      platform: "browser",
      write: false,
      logLevel: "silent",
      plugins: [
        {
          name: "missing-optional-cad-peers",
          setup(context) {
            context.onResolve({ filter: /^[^./]/ }, ({ kind, path }) => {
              if (kind === "entry-point") {
                return;
              }

              if (path.startsWith("@mlightcad/")) {
                resolvedCadPeers.push(path);
                return {
                  errors: [{ text: `Optional CAD peer must remain runtime-only: ${path}` }]
                };
              }

              return { path, external: true };
            });
          }
        }
      ]
    })
  ).resolves.toBeDefined();

  expect(resolvedCadPeers).toEqual([]);
});

it("keeps Office native dependencies out of the lite browser entry", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./lite.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    metafile: true,
    logLevel: "silent"
  });

  const inputs = Object.keys(result.metafile.inputs).map((path) => path.replaceAll("\\", "/"));

  expect(inputs.some((path) => path.endsWith("/src/lite.ts"))).toBe(true);
  expect(inputs.some((path) => path.endsWith("/plugins/image.ts"))).toBe(true);
  expect(inputs.some((path) => path.endsWith("/plugins/pdf.ts"))).toBe(true);
  expect(inputs.some((path) => path.endsWith("/plugins/office.ts"))).toBe(false);
  expect(inputs.some((path) => path.includes("/node_modules/emf-converter/"))).toBe(false);
  expect(inputs.some((path) => path.includes("/node_modules/@napi-rs/canvas"))).toBe(false);
});
