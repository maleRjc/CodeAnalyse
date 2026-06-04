import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { CodeExtractor, DocumentGenerator } from '../dist/index.js';

const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'sample-project',
);

test('CodeExtractor works in local mode', async () => {
  const extractor = new CodeExtractor(fixtureRoot);
  const result = await extractor.extractForCopyright();
  assert.ok(result.totalLines > 0);
  assert.ok(result.selectedFiles.length >= 1);
  assert.equal(result.pages.length, 1);
});

test('DocumentGenerator produces three documents with extraction result', async () => {
  const mockExtraction = {
    totalLines: 10,
    selectedFiles: [
      { path: 'src/index.ts', content: 'test', lines: ['test'], lineCount: 1 }
    ],
    extractedCode: 'class MockClass {}',
    pages: ['class MockClass {}'],
  };
  const generator = new DocumentGenerator('示例软件', '1.0.0');
  const docs = await generator.generateAll(mockExtraction, {});

  assert.ok(docs.sourceCode.includes('第1页'));
  assert.ok(docs.manual.includes('软件说明书'));
  assert.ok(docs.applicationForm.includes('示例软件'));
});
