import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve('public');
const outDir = path.resolve('dist/public');

fs.mkdirSync(outDir, { recursive: true });

for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
  const srcPath = path.join(srcDir, entry.name);
  const outPath = path.join(outDir, entry.name);
  if (entry.isDirectory()) {
    fs.cpSync(srcPath, outPath, { recursive: true });
  } else {
    fs.copyFileSync(srcPath, outPath);
  }
}
