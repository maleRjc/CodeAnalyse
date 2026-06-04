import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import type { CodeFile, ExtractionResult, ComplianceIssue, ComplianceScanResult, RuanZhuConfig } from './types.js';
import { cleanCodeLocally } from './local-cleaner.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

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
          if (EXCLUDE_DIRS.has(segment)) {
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
   * 核心代码抽取与清洗主入口 (完全依赖 DeepSeek，移除了本地 fallback)
   */
  async extractForCopyright(
    apiKey?: string,
    fetchFn?: typeof fetch,
    onProgress?: (message: string) => void
  ): Promise<ExtractionResult> {
    // 1. 本地扫描文件
    onProgress?.('正在扫描项目源代码清单...');
    await this.scanFiles();

    if (this.allFiles.length === 0) {
      throw new Error('未能在项目中扫描到任何有效的源代码文件。');
    }

    let allowedPaths: string[] = [];

    if (!apiKey || !apiKey.trim()) {
      onProgress?.('未检测到 API Key，将使用本地模式进行代码筛选与排序...');
      const sorted = this.sortByPriority(this.allFiles);
      allowedPaths = sorted.map(f => f.path);
    } else {
      const activeFetch = fetchFn || fetch;
      // --- 阶段一：AI 智能文件挑选与排序 ---
      onProgress?.('正在调用 DeepSeek 智能分析结构并筛选核心源程序文件...');
      const filePaths = this.allFiles.map(f => f.path);
      // 限制发送给 AI 挑选的文件清单行数，避免 Token 溢出
      const slicedPaths = filePaths.slice(0, 800);

      const selectSystemPrompt = `你是一个软件著作权申报审查专家与软件架构师。
以下是用户项目目录下的所有文件路径列表。
请对这个列表进行分析，挑选出最能代表该软件原创核心业务逻辑的源程序实现文件（如 .c, .cpp, .ts, .py, .java, .go 等，必须排除第三方依赖库、配置文件、静态资源或纯头文件定义声明）。
请按重要性（入口文件 -> 核心业务逻辑 -> 辅助工具）从高到低排序。

返回 JSON 对象，格式如下（禁止输出 \`\`\` 标记，只输出纯 JSON）：
{
  "allowedFiles": ["挑选出的核心原创代码文件相对路径列表，排序后"]
}`;

      const selectResponse = await activeFetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: selectSystemPrompt },
            { role: 'user', content: `项目文件列表：\n${slicedPaths.join('\n')}` }
          ],
          temperature: 0.1,
        }),
      });

      if (!selectResponse.ok) {
        const errText = await selectResponse.text();
        throw new Error(`AI selection API returned status ${selectResponse.status}: ${errText}`);
      }

      const selectData = await selectResponse.json() as { choices?: { message?: { content?: string } }[] };
      const rawSelect = selectData.choices?.[0]?.message?.content?.trim() || '';
      const trimmedSelect = rawSelect.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\n```$/i, '').trim();

      try {
        const parsed = JSON.parse(trimmedSelect) as { allowedFiles?: string[] };
        allowedPaths = parsed.allowedFiles || [];
      } catch {
        // 容错：如果 JSON 解析失败，则通过正则提取数组
        const arrayMatch = trimmedSelect.match(/\[[\s\S]*?\]/);
        if (arrayMatch) {
          try {
            allowedPaths = JSON.parse(arrayMatch[0]) as string[];
          } catch {
            // fallback
          }
        }
      }
    }

    if (allowedPaths.length === 0) {
      throw new Error('未能从项目中挑选出任何核心原创代码文件。');
    }

    // --- 阶段二：逐个文件 AI 清洁与拼接以确保完整且逻辑闭合 ---
    const allFilesMap = new Map(this.allFiles.map(f => [f.path, f]));
    const cleanedCodeChunks: string[] = [];
    const selectedFiles: CodeFile[] = [];
    let accumulatedLines = 0;

    const cleanSystemPrompt = `你是一个专业的软件著作权源程序申报材料整理专家。
请对以下单个源程序文件的内容进行清洗，提取出最适合申请软著的原创核心代码。

【清洗与提取标准】：
1. **完全清除第三方非授权依赖**：完全清除无关的第三方依赖库及开源代码（如 FFmpeg, FreeRDP 等相关的所有函数、接口、数据结构定义与声明）。
2. **剥离十六进制字节数组（最重要）**：必须完全删除所有大段的十六进制/二进制字节数组或编译产物数组定义（例如类似于 const BYTE Pixel_PX_main[] = { 68, 88, 66, ... } 等大块数组及其花括号中的所有数据）。
3. **着色器源码还原**：如果您在文件中剥离/删除了用于创建着色器的字节数组，必须在原位置替换补充为人类可读的原始 HLSL 着色器源代码函数（例如：实现纹理渲染或格式转换的 VSMain/PSMain 顶点着色器和像素着色器），以确保代码的独创性与逻辑完整性，杜绝审查员怀疑“凑页数”。
4. **保留所有模块导入与导出声明**：必须保留文件中所有的模块导入 (import / require / #include) 和导出 (export / export default / module.exports) 声明（包括对系统标准库、框架、外部包以及本地相对路径模块文件的导入与导出）。绝对不能删除、隐藏或省略这些关键的声明行，以维护源程序的真实性、连编译性和完整连贯性。
5. **彻底清除注释与空行**：必须删除所有的代码注释（包括行内注释、块注释、文档注释等）和所有的空行。
6. **删除多余编译守卫**：删除宏定义防重复包含守卫（如 #ifndef, #define, #endif 等，但保留系统级的 #pragma comment 等指令）。
7. **保证逻辑闭合**：确保任何保留下来的代码、类、接口或函数体在结构上是完整的、语法闭合的，绝对不能出现中途截断的行或未闭合的花括号。
8. **保持原始格式**：不要截断长行，保持原始的代码缩进和物理换行，以保证代码的完整可读性。

只返回清洗完毕后的纯代码文本，禁止包裹 \`\`\` 标记，也不要带有任何解释说明性文字。`;

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
      throw new Error('AI 代码清洗未能提取出任何有效代码，请检查您的 API Key 与网络连接。');
    }

    const finalCode = cleanedCodeChunks.join('\n');
    const cleanLines = finalCode.split('\n');
    const totalLines = cleanLines.length;

    // File-level pagination
    let paginatedCode: string[];
    if (totalLines <= linesToExtract) {
      paginatedCode = cleanLines;
    } else {
      // Slicing at the file (chunk) level to avoid splitting a file in half
      const chunkLineCounts = cleanedCodeChunks.map(chunk => chunk.split('\n').length);
      const halfLimit = Math.floor(linesToExtract / 2);
      
      let headChunksCount = 0;
      let headLinesAcc = 0;
      for (let i = 0; i < cleanedCodeChunks.length; i++) {
        if (headLinesAcc + chunkLineCounts[i] > halfLimit && headChunksCount > 0) {
          // If adding this chunk exceeds half the limit, stop unless it's the very first chunk
          break;
        }
        headLinesAcc += chunkLineCounts[i];
        headChunksCount++;
      }

      let tailChunksCount = 0;
      let tailLinesAcc = 0;
      for (let i = cleanedCodeChunks.length - 1; i >= 0; i--) {
        // Prevent overlap with head chunks
        if (i < headChunksCount) {
          break;
        }
        if (tailLinesAcc + chunkLineCounts[i] > halfLimit && tailChunksCount > 0) {
          // If adding this chunk exceeds half the limit, stop unless it's the first chunk from the end
          break;
        }
        tailLinesAcc += chunkLineCounts[i];
        tailChunksCount++;
      }

      const headChunks = cleanedCodeChunks.slice(0, headChunksCount);
      const tailChunks = cleanedCodeChunks.slice(cleanedCodeChunks.length - tailChunksCount);
      
      const slicedCode = [...headChunks, ...tailChunks].join('\n');
      paginatedCode = slicedCode.split('\n');
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
