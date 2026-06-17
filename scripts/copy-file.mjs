import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , source, target] = process.argv;

if (!source || !target) {
  console.error("Usage: node scripts/copy-file.mjs <source> <target>");
  process.exit(1);
}

const resolvedSource = resolve(source);
const resolvedTarget = resolve(target);
mkdirSync(dirname(resolvedTarget), { recursive: true });
copyFileSync(resolvedSource, resolvedTarget);
