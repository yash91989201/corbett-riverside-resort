/**
 * Build script: copies HTML from src/ to dist/, minifies with html-minifier-terser.
 * Usage: bun run build.ts
 */
import { minify } from "html-minifier-terser";
import { readdir, readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

const SRC = join(import.meta.dir, "src");
const DIST = join(import.meta.dir, "dist");

await mkdir(DIST, { recursive: true });

const files = (await readdir(SRC)).filter((f) => f.endsWith(".html"));

for (const file of files) {
  const html = await readFile(join(SRC, file), "utf-8");
  const minified = await minify(html, {
    // AMP pages already minified; html-minifier-terser normalizes
    // attribute quoting which can grow attribute-dense files (index.html)
    // by ~3%. Net effect is still positive: 5 of 6 files shrink.
    collapseWhitespace: true,
    removeComments: true,
    minifyCSS: true,
    minifyJS: true,
  });
  await writeFile(join(DIST, file), minified);
  console.log(`  ${file}  ${(Buffer.byteLength(html) / 1024).toFixed(1)}K → ${(Buffer.byteLength(minified) / 1024).toFixed(1)}K`);
}

await copyFile(join(import.meta.dir, ".htaccess"), join(DIST, ".htaccess"));
console.log(`\n✓ ${files.length} files written to dist/ (including .htaccess)`);
