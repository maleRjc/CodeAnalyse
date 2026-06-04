import path from 'node:path';
import type { CodeFile } from './types.js';

export class CodeIntel {
  private workspaceRoot: string;
  private filesMap: Map<string, CodeFile>;

  constructor(workspaceRoot: string, files: CodeFile[]) {
    this.workspaceRoot = workspaceRoot;
    this.filesMap = new Map(files.map(f => [f.path.replace(/\\/g, '/'), f]));
  }

  /**
   * Find entry files in the project
   */
  findEntryFiles(): CodeFile[] {
    const entryPatterns = [
      /^main\.(cpp|c|cc|cxx|py|go|java|ts|js|dart)$/i,
      /^app\.(ts|js|tsx|jsx|py|go|java)$/i,
      /^index\.(ts|js|tsx|jsx|py|go|java)$/i,
      /^server\.(ts|js|py|go|java)$/i,
      /^program\.cs$/i,
    ];

    const entries: CodeFile[] = [];
    for (const pattern of entryPatterns) {
      for (const [relPath, file] of this.filesMap.entries()) {
        const baseName = path.basename(relPath);
        if (pattern.test(baseName)) {
          entries.push(file);
        }
      }
    }
    return Array.from(new Set(entries));
  }

  /**
   * Parse imports/includes from file content
   */
  extractImports(file: CodeFile): string[] {
    const imports: string[] = [];
    const content = file.content;
    const ext = path.extname(file.path).toLowerCase();

    // 1. C/C++ includes
    if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext)) {
      const cppIncludeRegex = /#include\s*["<]([^">]+)[">]/g;
      let match;
      while ((match = cppIncludeRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    // 2. JS/TS/JSX/TSX imports & requires
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      const esmImportRegex = /(?:import|export)\s+(?:.*?from\s+)?['"]([^'"]+)['"]/g;
      const commonJsRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
      const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

      let match;
      while ((match = esmImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      while ((match = commonJsRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
      while ((match = dynamicImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    // 3. Python imports
    if (['.py'].includes(ext)) {
      const pyImportRegex = /^\s*import\s+([a-zA-Z0-9_.,\s]+)/gm;
      const pyFromImportRegex = /^\s*from\s+([a-zA-Z0-9_.]+)\s+import/gm;

      let match;
      while ((match = pyImportRegex.exec(content)) !== null) {
        const modules = match[1].split(',');
        for (const mod of modules) {
          imports.push(mod.trim());
        }
      }
      while ((match = pyFromImportRegex.exec(content)) !== null) {
        imports.push(match[1].trim());
      }
    }

    // 4. Go imports
    if (ext === '.go') {
      const goSingleImport = /import\s+['"]([^'"]+)['"]/g;
      const goMultiImport = /import\s*\(([\s\S]*?)\)/g;

      let match;
      while ((match = goSingleImport.exec(content)) !== null) {
        imports.push(match[1]);
      }
      while ((match = goMultiImport.exec(content)) !== null) {
        const inner = match[1];
        const lines = inner.split('\n');
        for (const line of lines) {
          const m = line.match(/"([^"]+)"/);
          if (m) imports.push(m[1]);
        }
      }
    }

    return imports;
  }

  /**
   * Resolve import string to relative path in project
   */
  resolveImport(currentFileRelPath: string, importStr: string): string | null {
    if (
      importStr.startsWith('node:') || 
      (!importStr.startsWith('.') && !importStr.startsWith('/') && !importStr.includes('/') && !importStr.endsWith('.h'))
    ) {
      // standard library / third party
    }

    const currentDir = path.dirname(currentFileRelPath);
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.cpp', '.h', '.hpp', '.py', '.go', '.java', '.cs'];

    // 1. Relative path resolution
    if (importStr.startsWith('.') || importStr.startsWith('/')) {
      const absoluteTarget = path.resolve(this.workspaceRoot, currentDir, importStr);
      const relativeTarget = path.relative(this.workspaceRoot, absoluteTarget);

      for (const ext of extensions) {
        const key = (relativeTarget + ext).replace(/\\/g, '/');
        if (this.filesMap.has(key)) return key;
        
        const indexKey = path.join(key, `index${ext}`).replace(/\\/g, '/');
        if (this.filesMap.has(indexKey)) return indexKey;
      }
    }

    // 2. Global fuzzy matching (C++ headers or module names)
    const extInImport = path.extname(importStr).toLowerCase();
    const baseImportName = importStr.split('/').pop()?.split('.').shift() || importStr;
    const baseImportLower = baseImportName.toLowerCase();

    for (const [relPath] of this.filesMap.entries()) {
      const normalizedPath = relPath.replace(/\\/g, '/');
      const fileExt = path.extname(normalizedPath).toLowerCase();

      // If the import specifies an extension, filter by it
      if (extInImport && fileExt !== extInImport) {
        continue;
      }

      const fileBaseName = path.basename(normalizedPath).split('.').shift()?.toLowerCase();
      if (fileBaseName === baseImportLower) {
        return relPath;
      }
    }

    return null;
  }

  /**
   * Performs static analysis to output logically continuous files trace
   */
  analyzeFlow(): CodeFile[] {
    const entries = this.findEntryFiles();
    if (entries.length === 0) {
      return [];
    }

    const visited = new Set<string>();
    const flowSequence: CodeFile[] = [];

    const traverse = (fileRelPath: string) => {
      const normalizedPath = fileRelPath.replace(/\\/g, '/');
      if (visited.has(normalizedPath)) return;
      visited.add(normalizedPath);

      const file = this.filesMap.get(normalizedPath);
      if (!file) return;

      flowSequence.push(file);

      // Heuristic: If it is a header file, automatically attempt to traverse its matching source file
      const ext = path.extname(normalizedPath).toLowerCase();
      if (['.h', '.hpp'].includes(ext)) {
        const baseWithoutExt = normalizedPath.slice(0, -ext.length);
        const sourceExtensions = ['.cpp', '.cc', '.cxx', '.c'];
        for (const srcExt of sourceExtensions) {
          const srcPath = baseWithoutExt + srcExt;
          if (this.filesMap.has(srcPath)) {
            traverse(srcPath);
          }
        }
      }

      const imports = this.extractImports(file);
      for (const imp of imports) {
        const resolved = this.resolveImport(normalizedPath, imp);
        if (resolved) {
          traverse(resolved);
        }
      }
    };

    for (const entry of entries) {
      traverse(entry.path);
    }

    return flowSequence;
  }
}
