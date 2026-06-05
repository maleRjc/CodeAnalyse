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

    // Helper to identify test/demo directories
    const isTestOrDemoDir = (relPath: string): boolean => {
      const parts = relPath.toLowerCase().split('/');
      return parts.some(part =>
        ['test', 'tests', 'fixture', 'fixtures', 'example', 'examples', 'demo', 'demos', 'sample', 'samples', 'spec', 'specs', 'mock', 'mocks', 'scratch'].includes(part)
      );
    };

    // 1. Standard name pattern matching
    for (const pattern of entryPatterns) {
      for (const [relPath, file] of this.filesMap.entries()) {
        if (isTestOrDemoDir(relPath)) continue;
        const baseName = path.basename(relPath);
        if (pattern.test(baseName)) {
          entries.push(file);
        }
      }
    }

    const uniqueEntries = Array.from(new Set(entries));
    if (uniqueEntries.length > 0) {
      return uniqueEntries;
    }

    // 2. Fallback: Search for source files containing main signatures
    const mainSignatures = [
      /if\s+__name__\s*==\s*['"]__main__['"]/i, // Python
      /public\s+static\s+void\s+main\b/i,       // Java / C#
      /\bint\s+main\s*\(/i,                     // C / C++
      /\bvoid\s+main\s*\(/i,                    // C / C++
      /\bfunc\s+main\s*\(/i,                    // Go
      /\bfn\s+main\s*\(/i,                      // Rust
    ];

    for (const [relPath, file] of this.filesMap.entries()) {
      if (isTestOrDemoDir(relPath)) continue;
      for (const sig of mainSignatures) {
        if (sig.test(file.content)) {
          uniqueEntries.push(file);
          break;
        }
      }
    }

    if (uniqueEntries.length > 0) {
      return Array.from(new Set(uniqueEntries));
    }

    // 3. Fallback: Identify the file with the most resolved local imports
    let maxImports = -1;
    let candidate: CodeFile | null = null;

    for (const [relPath, file] of this.filesMap.entries()) {
      if (isTestOrDemoDir(relPath)) continue;
      const imports = this.extractImports(file);
      let resolvedCount = 0;
      for (const imp of imports) {
        if (this.resolveImport(file.path, imp)) {
          resolvedCount++;
        }
      }
      if (resolvedCount > maxImports) {
        maxImports = resolvedCount;
        candidate = file;
      }
    }

    if (candidate) {
      uniqueEntries.push(candidate);
    }

    return Array.from(new Set(uniqueEntries));
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

  /**
   * Automatically deduce the technology stack and functional modules
   */
  analyzeStructure(): {
    projectType: string;
    architecture: string;
    runtime: string;
    modules: { name: string; description: string }[];
  } {
    const files = Array.from(this.filesMap.values());
    const flowFiles = this.analyzeFlow();

    let isQt = false;
    let isReact = false;
    let isVue = false;
    let isNode = false;
    let isPython = false;
    let isCsharp = false;
    let isGo = false;
    let isFlutter = false;

    for (const file of files) {
      const lowerPath = file.path.toLowerCase();
      if (
        lowerPath.includes('qmainwindow') ||
        lowerPath.includes('qapplication') ||
        lowerPath.includes('qwidget') ||
        lowerPath.endsWith('.pro')
      ) {
        isQt = true;
      }
      if (lowerPath.includes('react') || lowerPath.endsWith('.jsx') || lowerPath.endsWith('.tsx')) {
        isReact = true;
      }
      if (lowerPath.includes('vue')) {
        isVue = true;
      }
      if (lowerPath.includes('package.json') && !isReact && !isVue) {
        isNode = true;
      }
      if (lowerPath.endsWith('.py')) {
        isPython = true;
      }
      if (lowerPath.endsWith('.cs') || lowerPath.endsWith('.csproj')) {
        isCsharp = true;
      }
      if (lowerPath.endsWith('.go') || lowerPath.endsWith('go.mod')) {
        isGo = true;
      }
      if (lowerPath.endsWith('pubspec.yaml') || lowerPath.endsWith('.dart')) {
        isFlutter = true;
      }
    }

    let projectType = '通用应用软件系统';
    let architecture = '采用模块化分层设计架构，由核心程序入口驱动。';
    let runtime = '标准软件系统运行环境';

    if (isQt) {
      projectType = 'Qt C++ 桌面客户端软件';
      architecture = '基于 Qt 信号与槽机制、C++ 强类型面向对象机制的 MVC/MVVM 桌面应用架构。';
      runtime = 'C++ 运行环境 (MinGW / MSVC) 与 Qt 动态库运行时组件';
    } else if (isFlutter) {
      projectType = 'Flutter 移动端/跨平台应用软件';
      architecture = '基于 Dart Widget 树与声明式状态管理的高性能跨平台客户端架构。';
      runtime = 'Flutter SDK 与 Android/iOS/Desktop 原生宿主运行时';
    } else if (isReact) {
      projectType = 'React 现代前端单页 Web 应用';
      architecture = '基于组件化声明渲染、虚拟 DOM 与单向数据流的前端技术架构。';
      runtime = '现代主流 Web 浏览器 (Chrome, Safari, Edge, Firefox)';
    } else if (isVue) {
      projectType = 'Vue 组件化前端 Web 应用';
      architecture = '基于双向数据绑定与轻量级组件式架构的前端 Web 体系。';
      runtime = '现代主流 Web 浏览器';
    } else if (isCsharp) {
      projectType = 'C# .NET 业务系统应用';
      architecture = '基于 .NET 强类型组件体系与分层设计的 Windows 桌面/服务架构。';
      runtime = '.NET Core / .NET Framework 运行环境';
    } else if (isPython) {
      projectType = 'Python 智能算法/数据处理系统';
      architecture = '基于 Python 模块化与数据驱动机制的技术架构。';
      runtime = 'Python 3.8+ 解释器环境与标准依赖库';
    } else if (isGo) {
      projectType = 'Go 微服务/后端服务系统';
      architecture = '基于 Go 高并发协程与轻量级接口机制的后端高并发服务架构。';
      runtime = 'Linux/Windows 操作系统原生二进制可执行载体';
    }

    // Identify active folders/modules in flow files
    const modulesMap = new Map<string, string>();
    for (const file of flowFiles) {
      const dirName = path.dirname(file.path).replace(/\\/g, '/');
      if (dirName === '.' || dirName === '') continue;

      const topDir = dirName.split('/')[0];
      if (!modulesMap.has(topDir)) {
        const nameLower = topDir.toLowerCase();
        let desc = '存放该业务板块的核心处理代码与辅助方法。';
        if (
          nameLower.includes('db') ||
          nameLower.includes('sql') ||
          nameLower.includes('model') ||
          nameLower.includes('store') ||
          nameLower.includes('qrencode')
        ) {
          desc = '本地数据持久化与数据存储/编码查询逻辑层。';
        } else if (
          nameLower.includes('ui') ||
          nameLower.includes('view') ||
          nameLower.includes('components') ||
          nameLower.includes('styles') ||
          nameLower.includes('login') ||
          nameLower.includes('register') ||
          nameLower.includes('resetpwd')
        ) {
          desc = '用户交互呈现与渲染视图状态控制层。';
        } else if (
          nameLower.includes('net') ||
          nameLower.includes('http') ||
          nameLower.includes('api') ||
          nameLower.includes('socket') ||
          nameLower.includes('usb') ||
          nameLower.includes('update')
        ) {
          desc = '网络通信同步、外部接口与外部硬件数据传输控制层。';
        } else if (
          nameLower.includes('utils') ||
          nameLower.includes('helpers') ||
          nameLower.includes('tools')
        ) {
          desc = '系统通用辅助工具类与共用算法包。';
        }
        modulesMap.set(topDir, desc);
      }
    }

    const modules = Array.from(modulesMap.entries()).map(([name, description]) => ({
      name,
      description,
    })).slice(0, 8);

    return {
      projectType,
      architecture,
      runtime,
      modules,
    };
  }
}
