import assert from 'node:assert/strict';
import { test, describe, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodeExtractor } from '../dist/index.js';

const tempRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'temp_config_test'
);

describe('CodeExtractor with .ruanzhuconfig.json tests', () => {
  before(async () => {
    await fs.mkdir(tempRoot, { recursive: true });
    
    // Create subfolders and files
    await fs.mkdir(path.join(tempRoot, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'legacy'), { recursive: true });
    await fs.mkdir(path.join(tempRoot, 'temp'), { recursive: true });

    await fs.writeFile(path.join(tempRoot, 'src/index.ts'), 'console.log("index");');
    await fs.writeFile(path.join(tempRoot, 'src/app.tsx'), 'console.log("app");');
    await fs.writeFile(path.join(tempRoot, 'src/helper.js'), 'console.log("helper");');
    await fs.writeFile(path.join(tempRoot, 'legacy/old.ts'), 'console.log("old");');
    await fs.writeFile(path.join(tempRoot, 'temp/cache.ts'), 'console.log("cache");');
  });

  after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test('Loads config ignores and filters extensions', async () => {
    const configContent = JSON.stringify({
      source_root: "src",
      ignore: ["legacy", "temp"],
      filters: [".ts"]
    });
    await fs.writeFile(path.join(tempRoot, '.ruanzhuconfig.json'), configContent);

    const extractor = new CodeExtractor(tempRoot);
    const files = await extractor.scanFiles();

    // Should only scan inside src, ignore legacy and temp, and only match .ts extension
    // Therefore, only src/index.ts should be matched (not src/app.tsx, src/helper.js)
    assert.equal(files.length, 1);
    assert.equal(files[0].path, 'src/index.ts');
  });
});
