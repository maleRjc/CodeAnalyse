import { CodeExtractor } from '../packages/core/src/code-extractor.js';
import { CodeIntel } from '../packages/core/src/code-intel.js';
import path from 'node:path';

async function main() {
  const workspaceRoot = 'F:/MultiDot/QtAlbumDisplay';
  const extractor = new CodeExtractor(workspaceRoot);
  
  console.log('--- 1. Scanning Files ---');
  const files = await extractor.scanFiles();
  console.log(`Total scanned files: ${files.length}`);
  
  const mainCpp = files.find(f => f.path.toLowerCase().endsWith('main.cpp'));
  if (mainCpp) {
    console.log(`Found main.cpp: path=${mainCpp.path}, content length=${mainCpp.content.length}`);
  } else {
    console.log('main.cpp NOT found in scanFiles() output!');
    // Print all files to see what was found
    console.log('First 20 scanned files:');
    files.slice(0, 20).forEach(f => console.log(`  - ${f.path}`));
    return;
  }

  console.log('\n--- 2. Instantiating CodeIntel ---');
  const intel = new CodeIntel(workspaceRoot, files);
  
  console.log('\n--- 3. findEntryFiles() ---');
  const entries = intel.findEntryFiles();
  console.log(`Entry files count: ${entries.length}`);
  entries.forEach(e => console.log(`  - Entry: ${e.path}`));

  console.log('\n--- 4. analyzeFlow() ---');
  const flow = intel.analyzeFlow();
  console.log(`Flow files count: ${flow.length}`);
  flow.slice(0, 10).forEach((f, idx) => console.log(`  [${idx}] - ${f.path}`));
}

main().catch(console.error);
