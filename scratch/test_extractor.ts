import { CodeExtractor } from '../packages/core/src/code-extractor.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');

async function run() {
  const extractor = new CodeExtractor(workspaceRoot);
  const result = await extractor.extractForCopyright(msg => console.log(msg));
  console.log('\n========================================');
  console.log(`Total lines extracted: ${result.totalLines}`);
  console.log(`Selected files: ${result.selectedFiles.length}`);
  console.log('Selected files list:');
  result.selectedFiles.forEach((f, i) => {
    console.log(`  [${i + 1}] ${f.path}`);
  });
  console.log('========================================');
  
  // Check if any file contains FreeRDP or mock function
  const hasFreeRDP = result.extractedCode.includes('FreeRDP');
  const hasMockMain = result.extractedCode.includes('export function main(): string');
  console.log(`Contains FreeRDP: ${hasFreeRDP}`);
  console.log(`Contains mock main(): ${hasMockMain}`);
}

run().catch(console.error);
