#!/usr/bin/env node
// Marks a compiled CommonJS output directory as CommonJS regardless of the
// package's own "type": "module" — Node resolves module type from the
// nearest package.json, so a `{"type":"commonjs"}` file inside the CJS
// output dir is what makes dual ESM+CJS publishing work (the standard
// Node.js pattern for this — see the "Dual CommonJS/ES module packages"
// section of Node's own docs).
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: write-cjs-package-json.mjs <dir>');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/package.json`, JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
