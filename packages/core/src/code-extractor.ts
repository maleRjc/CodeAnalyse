import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { CodeFile, ExtractionResult, ComplianceIssue, ComplianceScanResult, RuanZhuConfig } from './types.js';
import { cleanCodeLocally } from './local-cleaner.js';

// 排除的二进制文件和打包目录
const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.next',
  'out',
  'release',
  'coverage',
  'assets',
  'public',
  'tests',
  'e2e',
]);

const EXCLUDE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.mp3', '.mp4', '.wav', '.flac', '.ogg',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.hex', '.out',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt',
  '.db', '.sqlite', '.sqlite3', '.sqlitedb',
  '.asar', '.woff', '.woff2', '.ttf', '.eot',
  '.class', '.jar', '.war', '.pyc', '.pyo', '.pyd',
  '.map', '.log', '.lock',
  '.hlsl', '.fx', '.glsl', '.frag', '.vert', '.vs', '.ps', '.shader', '.cl',
  '.lib', '.a', '.pdb', '.ilk', '.suo', '.ncb', '.sdf', '.obj', '.o',
  '.user', '.qrc', '.pro.user', '.vcxproj', '.filters', '.sln',
]);

const EXCLUDE_FILE_PATTERNS = [
  /\.config\.(js|ts|cjs|mjs)$/i,
  /\.d\.ts$/i,
  /\.(test|spec)\.(js|ts|jsx|tsx)$/i,
  /setupTests\.(js|ts)$/i,
  /eslintrc/i,
  /prettierrc/i,
];

const PRIORITY_PATTERNS = [
  /main\./,
  /index\./,
  /app\./,
  /server\./,
  /controller/,
  /service/,
  /model/,
  /util/,
  /helper/,
];

const MAX_FILES = 800;

export class CodeExtractor {
  private workspaceRoot: string;
  private allFiles: CodeFile[] = [];
  private config: RuanZhuConfig = {};

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.workspaceRoot, '.ruanzhuconfig.json');
      const raw = await fsPromises.readFile(configPath, 'utf-8');
      this.config = JSON.parse(raw);
    } catch {
      try {
        const configPathAlt = path.join(this.workspaceRoot, 'ruanzhuconfig.json');
        const rawAlt = await fsPromises.readFile(configPathAlt, 'utf-8');
        this.config = JSON.parse(rawAlt);
      } catch {
        // No config
      }
    }
  }

  /**
   * 通用文本文件扫描
   * 排除二进制文件以及包含第三方库关键字的文件/目录
   */
  async scanFiles(): Promise<CodeFile[]> {
    await this.loadConfig();
    const files: CodeFile[] = [];

    const scanRoot = this.config.source_root
      ? path.resolve(this.workspaceRoot, this.config.source_root)
      : this.workspaceRoot;

    const scanDir = async (dir: string) => {
      if (files.length >= MAX_FILES) return;

      let entries: fs.Dirent[];
      try {
        entries = await fsPromises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= MAX_FILES) return;

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
        const lowerRel = relPath.toLowerCase();

        // 检查相对路径中是否有任一段落包含排除目录
        let isExcluded = false;
        const segments = lowerRel.split('/');
        
        for (const segment of segments) {
          if (
            EXCLUDE_DIRS.has(segment) ||
            segment.startsWith('build-') ||
            segment === 'debug' ||
            segment === 'release' ||
            segment === '.vs' ||
            segment === 'ipch' ||
            segment === 'x64' ||
            segment === 'x86'
          ) {
            isExcluded = true;
            break;
          }
        }
        if (isExcluded) continue;

        // Apply custom ignores
        if (this.config.ignore && Array.isArray(this.config.ignore)) {
          const matchedCustomIgnore = this.config.ignore.some(ign => {
            const cleanIgn = ign.replace(/\\/g, '/').toLowerCase();
            return lowerRel === cleanIgn || lowerRel.startsWith(cleanIgn + '/');
          });
          if (matchedCustomIgnore) continue;
        }

        if (entry.isDirectory()) {
          await scanDir(fullPath);
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        
        // Filter binary files or use custom extensions filter
        if (this.config.filters && Array.isArray(this.config.filters)) {
          const matchedFilter = this.config.filters.some(f => {
            const cleanF = f.startsWith('.') ? f.toLowerCase() : `.${f.toLowerCase()}`;
            return ext === cleanF;
          });
          if (!matchedFilter) continue;
        } else {
          if (EXCLUDE_EXTENSIONS.has(ext)) continue;
        }

        let shouldExclude = false;
        for (const pattern of EXCLUDE_FILE_PATTERNS) {
          if (pattern.test(entry.name)) {
            shouldExclude = true;
            break;
          }
        }
        if (shouldExclude) continue;

        try {
          const content = await fsPromises.readFile(fullPath, 'utf-8');
          const fileLines = content.split('\n');
          files.push({
            path: relPath,
            content,
            lines: fileLines,
            lineCount: fileLines.length,
          });
        } catch (err) {
          console.error(`读取文件失败: ${fullPath}`, err);
        }
      }
    };

    await scanDir(scanRoot);
    this.allFiles = files;
    return files;
  }

  /**
   * 按照优先级对文件排序
   */
  sortByPriority(files: CodeFile[]): CodeFile[] {
    return [...files].sort((a, b) => {
      const getExtPriority = (file: CodeFile) => {
        const ext = path.extname(file.path).toLowerCase();
        // 头文件排最后
        if (ext === '.h' || ext === '.hpp' || ext === '.d.ts') return 1;
        return 0;
      };

      const getPatternPriority = (file: CodeFile) => {
        const filePath = file.path.toLowerCase();
        const baseName = path.basename(filePath);
        
        // 核心入口文件最优先
        if (/^app\.(js|ts|py|go|java|cpp|c)$/i.test(baseName)) return 0;
        if (/^main\.(js|ts|py|go|java|cpp|c)$/i.test(baseName)) return 1;
        if (/^index\.(js|ts|py|go|java|cpp|c)$/i.test(baseName)) return 2;
        if (/^server\.(js|ts|py|go|java)$/i.test(baseName)) return 3;
        
        // 业务逻辑次优先
        if (filePath.includes('/controller/') || filePath.includes('controller')) return 10;
        if (filePath.includes('/service/') || filePath.includes('service')) return 11;
        if (filePath.includes('/route/') || filePath.includes('route') || filePath.includes('/api/') || filePath.includes('api')) return 12;
        if (filePath.includes('/model/') || filePath.includes('model') || filePath.includes('/dao/') || filePath.includes('dao')) return 13;
        
        // UI与界面组件中等优先
        if (filePath.includes('/pages/') || filePath.includes('/page/') || filePath.includes('page')) return 20;
        if (filePath.includes('/components/') || filePath.includes('/component/') || filePath.includes('component')) return 21;
        if (filePath.includes('/views/') || filePath.includes('/view/') || filePath.includes('view')) return 22;

        // 工具与配置最后
        if (filePath.includes('/config/') || filePath.includes('config')) return 30;
        if (filePath.includes('/util/') || filePath.includes('util') || filePath.includes('/helper/') || filePath.includes('helper')) return 31;
        
        return 40;
      };

      const extA = getExtPriority(a);
      const extB = getExtPriority(b);
      if (extA !== extB) return extA - extB;

      return getPatternPriority(a) - getPatternPriority(b);
    });
  }

  /**
   * 核心代码抽取与清洗主入口
   */
  async extractForCopyright(
    onProgress?: (message: string) => void
  ): Promise<ExtractionResult> {
    // 1. 本地扫描文件
    onProgress?.('正在扫描项目源代码清单...');
    await this.scanFiles();

    if (this.allFiles.length === 0) {
      throw new Error('未能在项目中扫描到任何有效的源代码文件。');
    }

    onProgress?.('正在使用本地模式进行代码筛选与排序...');
    const sorted = this.sortByPriority(this.allFiles);
    const allowedPaths = sorted.map(f => f.path);

    if (allowedPaths.length === 0) {
      throw new Error('未能从项目中挑选出任何核心原创代码文件。');
    }

    // --- 阶段二：逐个文件本地清洁与拼接以确保完整且逻辑闭合 ---
    const allFilesMap = new Map(this.allFiles.map(f => [f.path, f]));
    const cleanedCodeChunks: string[] = [];
    const selectedFiles: CodeFile[] = [];
    let accumulatedLines = 0;

    const linesToExtract = this.config.lines_to_extract || 3000;
    const extractionLimit = linesToExtract + 200;

    let index = 0;
    for (const filePath of allowedPaths) {
      // 如果已累加约 linesToExtract 行（大于60页 * 50行，且满足行数上限），则退出
      if (accumulatedLines >= extractionLimit) {
        onProgress?.(`已累计提取约 ${accumulatedLines} 行合规源码，停止后续文件清洗`);
        break;
      }

      const file = allFilesMap.get(filePath);
      if (!file) continue;

      onProgress?.(`[本地清洗中 ${index + 1}/${allowedPaths.length}] 正在清洗核心文件: ${file.path}`);

      let fileContentToClean = file.content;
      // 避免单次文件请求数据超大，截取前 40000 字符（约合 800-1000 行），防止文件因截断出现逻辑缺失
      if (fileContentToClean.length > 40000) {
        fileContentToClean = fileContentToClean.slice(0, 40000);
      }

      try {
        const cleaned = cleanCodeLocally(fileContentToClean, file.path);
        if (cleaned) {
          const fileLines = cleaned.split('\n').map(l => l.trimEnd()).filter(Boolean);
          if (fileLines.length > 0) {
            cleanedCodeChunks.push(fileLines.join('\n'));
            accumulatedLines += fileLines.length;
            selectedFiles.push(file);
          }
        }
      } catch (err) {
        console.error(`本地清洗文件 ${file.path} 遭遇异常:`, err);
      }
      index++;
    }

    if (cleanedCodeChunks.length === 0) {
      throw new Error('代码清洗未能提取出任何有效代码，请检查源文件内容。');
    }

    const finalCode = cleanedCodeChunks.join('\n');
    const cleanLines = finalCode.split('\n');
    const totalLines = cleanLines.length;

    // Line-level pagination to ensure exactly linesToExtract (60 pages * 50 lines = 3000 lines) are generated
    let paginatedCode: string[];
    if (totalLines <= linesToExtract) {
      paginatedCode = cleanLines;
    } else {
      const halfLimit = Math.floor(linesToExtract / 2);
      const headLines = cleanLines.slice(0, halfLimit);
      const tailLines = cleanLines.slice(totalLines - (linesToExtract - halfLimit));
      paginatedCode = [...headLines, ...tailLines];
    }

    const pages: string[] = [];
    const LINES_PER_PAGE = 50;
    for (let i = 0; i < paginatedCode.length; i += LINES_PER_PAGE) {
      pages.push(paginatedCode.slice(i, i + LINES_PER_PAGE).join('\n'));
    }

    return {
      totalLines,
      selectedFiles,
      extractedCode: paginatedCode.join('\n'),
      pages,
    };
  }

  checkCompliance(files: CodeFile[]): ComplianceScanResult {
    const issues: ComplianceIssue[] = [];
    let score = 100;

    // 1. File Count Check
    if (files.length === 0) {
      issues.push({
        type: 'error',
        category: 'file_count',
        message: '未能在项目中扫描到有效的源代码文件。请检查所选目录以及支持的文件后缀名格式（如 .ts, .js, .py, .java 等）。',
      });
      return { ok: false, score: 0, issues };
    } else {
      issues.push({
        type: 'info',
        category: 'file_count',
        message: `成功扫描到项目内 ${files.length} 个有效的源代码文件，已准备进行大纲和排版分析。`,
      });
    }

    // 2. Line Count Check
    const totalLines = files.reduce((acc, f) => acc + (f.lineCount || 0), 0);
    if (totalLines === 0) {
      score = 0;
      issues.push({
        type: 'error',
        category: 'line_count',
        message: '项目代码总行数为 0。请确保选取的文件夹中包含非空的源代码文件。',
      });
    } else if (totalLines < 1000) {
      score -= 30;
      issues.push({
        type: 'warning',
        category: 'line_count',
        message: `代码总行数偏少（当前仅 ${totalLines} 行）。版权中心在审查时，通常期望提交的软件具有一定的代码规模（建议至少 3,000 行以上）。`,
        details: '若当前仅导入了项目的部分子文件夹，建议重新选择包含全部功能模块的父级根文件夹进行排版。如果是超轻量的脚本/工具，请在说明书中尽量补充详尽的模块功能设计介绍以丰富篇幅。',
      });
    } else if (totalLines < 3000) {
      score -= 15;
      issues.push({
        type: 'warning',
        category: 'line_count',
        message: `代码总行数偏低（当前共 ${totalLines} 行，未达到 3,000 行的推荐红线）。可能存在被版权中心下发“审查代码量不足，要求补充说明”补正通知的风险。`,
        details: '建议导入更完整的项目工程目录（包含公共库、辅助工具、前后端关联代码），或在生成 Word 材料后，通过人工补齐程序注释或追加部分通用业务模块以提高通过率。',
      });
    } else {
      issues.push({
        type: 'info',
        category: 'line_count',
        message: `项目总代码行数符合推荐规范（共 ${totalLines} 行），能够完整提取出 60 页以上的核心鉴别材料。`,
      });
    }

    // 3. Copyright Header Conflicts and Minified/Build Files Checks
    let copyrightDeductions = 0;
    let minifiedDeductions = 0;

    const externalCopyrightKeywords = [
      'microsoft', 'google', 'facebook', 'oracle', 'apple', 'intel', 'yandex',
      'apache', 'mozilla', 'red hat', 'bootstrap', 'jquery', 'react', 'vuejs',
      'github, inc', 'copyright (c) microsoft', 'copyright (c) google'
    ];

    for (const file of files) {
      const contentLower = file.content.toLowerCase();

      // Check Copyright conflicts
      const copyrightMatches = file.content.match(/(?:copyright\s*(?:©|\(c\))?\s*\d{4}\s*[^.\n]+)/gi);
      if (copyrightMatches) {
        for (const match of copyrightMatches) {
          const matchLower = match.toLowerCase();
          const matchesKeyword = externalCopyrightKeywords.some(keyword => matchLower.includes(keyword));
          if (matchesKeyword && copyrightDeductions < 30) {
            score -= 10;
            copyrightDeductions += 10;
            issues.push({
              type: 'warning',
              category: 'copyright',
              message: `检测到可能冲突的外部版权所有权声明：在文件「${file.path}」中发现了声明 "${match.trim()}"。`,
              filePath: file.path,
              details: '如果此文件并非您的原创代码（如直接复制引入的第三方依赖、UI库或开源包），请在排版时予以排除，或在源程序文档中删除该声明。否则审查员可能以“软件原创性存疑、存在抄袭或混入开源组件未作权属划分”为由下发补正驳回。',
            });
          }
        }
      }

      // Check Minified/Packaged/Generated files
      const ext = path.extname(file.path).toLowerCase();
      const isMinifiedName = file.path.includes('.min.') || file.path.includes('-min.') || file.path.includes('.bundle.');
      
      let hasLongLine = false;
      let totalCharCount = 0;
      for (const line of file.lines) {
        totalCharCount += line.length;
        if (line.length > 500) {
          hasLongLine = true;
        }
      }
      const avgLineLength = file.lineCount > 0 ? totalCharCount / file.lineCount : 0;
      const isSuspectedMinified = hasLongLine && (avgLineLength > 150 || (file.lineCount < 5 && totalCharCount > 1000));

      if ((isMinifiedName || isSuspectedMinified) && minifiedDeductions < 30) {
        score -= 10;
        minifiedDeductions += 10;
        issues.push({
          type: 'warning',
          category: 'minified',
          message: `检测到疑似打包压缩或混淆过的第三方库 file：「${file.path}」。`,
          filePath: file.path,
          details: '混淆压缩的代码（单行极长或无换行符）极难被人类审查员阅读，且会引发审查员对该软件是否为开发者自行独立编写（原创开发）的质疑。软著源程序鉴别材料必须是可读的、未经混淆打包的开发源代码。建议将其从项目根目录中移出或在排版列表中屏蔽。',
        });
      }
    }

    score = Math.max(0, score);

    return {
      ok: score >= 60,
      score,
      issues,
    };
  }
}
