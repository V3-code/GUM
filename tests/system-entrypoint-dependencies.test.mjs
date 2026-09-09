import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const systemRoot = path.resolve(testDir, "..");
const entrypoint = path.join(systemRoot, "scripts", "main.js");

test("todos os imports locais do entrypoint existem no pacote do sistema", async () => {
  const missing = [];
  const pending = [entrypoint];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current)) continue;
    visited.add(current);

    const source = await fs.readFile(current, "utf8");
    const specifiers = [...source.matchAll(/(?:from|import)\s*(?:\(\s*)?[\"']([^\"']+)[\"']/g)]
      .map((match) => match[1])
      .filter((specifier) => specifier.startsWith("."));

    for (const specifier of specifiers) {
      const resolved = path.resolve(path.dirname(current), specifier);
      try {
        await fs.access(resolved);
        pending.push(resolved);
      } catch {
        missing.push(path.relative(systemRoot, resolved));
      }
    }
  }

  assert.deepEqual(missing, [], `imports locais ausentes: ${missing.join(", ")}`);
});
