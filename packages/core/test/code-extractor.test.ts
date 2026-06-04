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

test('CodeExtractor falls back to local mode when apiKey is missing', async () => {
  const extractor = new CodeExtractor(fixtureRoot);
  const result = await extractor.extractForCopyright();
  assert.ok(result.totalLines > 0);
  assert.ok(result.selectedFiles.length >= 1);
  assert.equal(result.pages.length, 1);
});

test('CodeExtractor runs AI-driven selection and cleaning with mock fetch', async () => {
  const extractor = new CodeExtractor(fixtureRoot);

  const mockFetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    const systemPrompt = body.messages[0].content;

    if (systemPrompt.includes('挑选出最能代表该软件原创核心业务逻辑')) {
      // Stage 1: File selection
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                allowedFiles: ['src/index.ts', 'src/app.ts'],
              }),
            },
          }],
        }),
      } as any;
    } else if (systemPrompt.includes('提取出最适合申请软著的原创核心代码')) {
      // Stage 2: Code cleaning
      const userContent = body.messages[1].content;
      let mockCleaned = 'class AppService {\n  run() {\n    return "AI-cleaned";\n  }\n}';
      if (userContent.includes('app.ts')) {
        mockCleaned = 'class App {\n  constructor() {\n    console.log("App initialization");\n  }\n}';
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: mockCleaned,
            },
          }],
        }),
      } as any;
    }
    return { ok: false } as any;
  };

  const result = await extractor.extractForCopyright('mock-api-key', mockFetch as any);

  assert.ok(result.totalLines > 0);
  assert.ok(result.selectedFiles.length >= 1);
  assert.equal(result.pages.length, 1);
  assert.ok(result.extractedCode.includes('AppService'));
  assert.ok(result.extractedCode.includes('App'));
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
