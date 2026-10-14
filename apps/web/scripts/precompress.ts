import { readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const DIST = join(import.meta.dir, "../dist");
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json", ".txt", ".map"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

let count = 0;
for (const path of walk(DIST)) {
  if (!COMPRESSIBLE.has(extname(path))) continue;

  const source = await Bun.file(path).bytes();
  writeFileSync(
    `${path}.br`,
    brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
  );
  writeFileSync(`${path}.gz`, gzipSync(source, { level: 9 }));
  count++;
}

console.log(`precompressed ${count} files`);
