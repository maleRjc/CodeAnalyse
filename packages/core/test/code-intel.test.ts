import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { CodeIntel } from '../dist/index.js';
import type { CodeFile } from '../dist/types.js';

describe('CodeIntel tests', () => {
  test('Correctly identifies main entry points and orders files sequentially', () => {
    const mockFiles: CodeFile[] = [
      {
        path: 'src/components/GalleryView.cpp',
        content: '#include "GalleryView.h"\n#include "../db/Database.h"',
        lines: [],
        lineCount: 2,
      },
      {
        path: 'src/db/Database.h',
        content: '// Database header',
        lines: [],
        lineCount: 1,
      },
      {
        path: 'src/main.cpp',
        content: '#include "components/GalleryView.h"\n#include <iostream>',
        lines: [],
        lineCount: 2,
      },
      {
        path: 'src/components/GalleryView.h',
        content: '// Gallery header',
        lines: [],
        lineCount: 1,
      },
      {
        path: 'unused_helper.cpp',
        content: '// unused utility code',
        lines: [],
        lineCount: 1,
      }
    ];

    const intel = new CodeIntel('/mock/project', mockFiles);
    
    // Find entries
    const entries = intel.findEntryFiles();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, 'src/main.cpp');

    // Analyze dependency flow
    const sequence = intel.analyzeFlow();
    
    // Verify sequence order based on trace from main.cpp
    assert.equal(sequence.length, 4);
    assert.equal(sequence[0].path, 'src/main.cpp');
    assert.equal(sequence[1].path, 'src/components/GalleryView.h');
    assert.equal(sequence[2].path, 'src/components/GalleryView.cpp');
    assert.equal(sequence[3].path, 'src/db/Database.h');

    // Visited set shouldn't include unused_helper.cpp
    const hasUnused = sequence.some(f => f.path === 'unused_helper.cpp');
    assert.equal(hasUnused, false);
  });
});
