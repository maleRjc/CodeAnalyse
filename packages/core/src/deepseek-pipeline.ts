import fs from 'node:fs';
import path from 'node:path';
import { CodeExtractor } from './code-extractor.js';
import type {
  CodeAnalysis,
  CopyrightDocuments,
  ExtractionResult,
  ProjectAnalysis,
} from './types.js';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MAX_RETRIES = 3;
const MAX_FILE_CONTENT_LEN = 5000;

export type DeepSeekStage =
  | 'scanning'
  | 'analyzing-structure'
  | 'extracting-code'
  | 'merging-code'
  | 'generating-documents'
  | 'done';

export interface DeepSeekPipelineOptions {
  workspaceRoot: string;
  projectName: string;
  version: string;
  apiKey: string;
  polishLoops?: number;
  onProgress?: (stage: DeepSeekStage, message: string) => void;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}

export interface DeepSeekPipelineResult {
  documents: CopyrightDocuments;
  extraction: ExtractionResult;
  analysis: CodeAnalysis;
  projectAnalysis: ProjectAnalysis;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('已取消生成');
  }
}

function parseJsonResponse(raw: string): unknown {
  const trimmed = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    return null;
  }
}

async function callDeepSeek(
  messages: { role: string; content: string }[],
  apiKey: string,
  fetchFn: typeof fetch,
  maxTokens = 8000,
  temperature = 0.1,
): Promise<string> {
  let lastError: Error | null = null;

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetchFn(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`DeepSeek API 错误 (${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('DeepSeek 返回了空内容');
      }
      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (i < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }

  throw new Error(`DeepSeek API 调用失败: ${lastError?.message}`);
}

function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'javascript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.vue': 'vue',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.dart': 'dart',
    '.cs': 'csharp',
  };
  return langMap[ext] || 'javascript';
}

// ─── 阶段二：AI 分析项目结构 ───────────────────────────────────

async function analyzeProjectStructure(
  fileList: string[],
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<ProjectAnalysis> {
  const systemPrompt = `你是软件架构分析专家。分析以下项目文件列表，返回JSON格式的分析结果。

【分析要求】
1. 识别项目类型（前端/后端/全栈/库/CLI工具等）
2. 找出主入口文件（main.js/index.js/app.py/main.go等）
3. 识别核心业务逻辑所在的目录/文件
4. 判断项目的整体结构模式（MVC/分层/微服务等）
5. 把文件分组，按重要性排列

【返回格式（纯JSON，不要markdown代码块）】
{
  "projectType": "项目类型",
  "entryFile": "主入口文件路径",
  "entryFunction": "入口函数名称",
  "coreDirectories": ["核心目录列表"],
  "architecture": "架构模式",
  "shutdownFile": "退出逻辑所在文件",
  "estimatedLines": 0,
  "fileGroups": [
    {
      "name": "组名",
      "priority": 1,
      "files": ["文件路径"]
    }
  ],
  "mergeStrategy": "合并策略说明"
}`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `项目文件列表：\n${fileList.join('\n')}` },
    ],
    apiKey,
    fetchFn,
  );

  const parsed = parseJsonResponse(raw) as ProjectAnalysis | null;
  if (!parsed || !parsed.entryFile) {
    return {
      projectType: '未知',
      entryFile: fileList[0] || '',
      coreDirectories: [],
      architecture: '未知',
      fileGroups: [{ name: '所有文件', priority: 1, files: fileList.slice(0, 20) }],
      mergeStrategy: '按文件顺序合并',
    };
  }
  // 确保 fileGroups 存在
  if (!parsed.fileGroups || parsed.fileGroups.length === 0) {
    parsed.fileGroups = [{ name: '核心文件', priority: 1, files: fileList.slice(0, 20) }];
  }
  return parsed;
}

// ─── 阶段三：AI 提取代码（分组） ──────────────────────────────────

async function extractCodeFromGroup(
  groupName: string,
  files: { path: string; content: string; language: string }[],
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<string> {
  const combined = files
    .map((f) => `// ===== File: ${f.path} =====\n${f.content}`)
    .join('\n\n');

  const systemPrompt = `你是代码提取专家。从提供的代码中提取适合软著申请的有效代码。

【提取规则】
1. 保留：完整的核心业务逻辑、主入口函数、关键数据处理、类和函数定义、所有的模块导入导出声明 (import/export/require)
2. 删除：所有注释（行内、多行、文档注释）、所有空行、测试代码、console.log/print调试代码
3. 确保：代码逻辑完整（不截断函数/类）、缩进格式保持

【输出要求】只返回纯代码文本，不要任何解释或markdown标记。`;

  return callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `文件组: ${groupName}\n\n${combined.slice(0, 15000)}` },
    ],
    apiKey,
    fetchFn,
  );
}

async function mergeCodeChunks(
  chunks: string[],
  mergeStrategy: string,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<string> {
  if (chunks.length === 1) {
    return chunks[0];
  }

  const systemPrompt = `将以下代码块按优先级合并成一个完整的代码文件。

要求：
1. 保持代码逻辑的连贯性
2. 删除重复的代码
3. 按执行顺序排列（入口优先）
4. 删除所有注释和空行
5. 确保代码完整性

只返回合并后的纯代码文本，不要任何解释或markdown标记。`;

  return callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `合并策略: ${mergeStrategy}\n\n${chunks.map((c, i) => `--- 代码块 ${i + 1} ---\n${c}`).join('\n\n')}`.slice(0, 15000),
      },
    ],
    apiKey,
    fetchFn,
  );
}

// ─── 阶段四：AI 生成文档 ───────────────────────────────────────

function getFileHeader(
  softwareName: string,
  version: string,
  entryFile: string,
  projectAnalysis: ProjectAnalysis
): string[] {
  const ext = entryFile ? path.extname(entryFile).toLowerCase() : '';
  const cleanVersion = version.startsWith('V') || version.startsWith('v') ? version : `V${version}`;
  const tech = projectAnalysis.architecture || '默认开发框架';
  const desc = projectAnalysis.projectType || '核心业务处理';
  
  if (ext === '.py') {
    return [
      '"""',
      `软件名称：${softwareName}`,
      `版本号：${cleanVersion}`,
      `功能说明：基于 ${tech} 实现 ${desc}`,
      '"""',
      ''
    ];
  } else {
    return [
      '/**',
      ` * 软件名称：${softwareName}`,
      ` * 版本号：${cleanVersion}`,
      ` * 功能说明：基于 ${tech} 实现 ${desc}`,
      ' */',
      ''
    ];
  }
}

async function generateDocuments(
  coreCode: string,
  originalTotalLines: number,
  softwareName: string,
  version: string,
  projectAnalysis: ProjectAnalysis,
  apiKey: string,
  fetchFn: typeof fetch,
): Promise<CopyrightDocuments> {
  const codeLines = coreCode.split('\n').filter((l) => l.trim() !== '');
  
  // Prepend file header before pagination
  const headerLines = getFileHeader(softwareName, version, projectAnalysis.entryFile || '', projectAnalysis);
  const finalLines = [...headerLines, ...codeLines];

  // 本地完成分页，不依赖 AI 分页
  const LINES_PER_PAGE = 50;
  const pages: string[] = [];
  for (let i = 0; i < finalLines.length; i += LINES_PER_PAGE) {
    pages.push(finalLines.slice(i, i + LINES_PER_PAGE).join('\n'));
  }

  // 生成源代码清单（本地分页 + 页眉）
  let sourceCode = '';
  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    sourceCode += `[${softwareName} v${version}] 第${pageNum}页 共${pages.length}页\n`;
    sourceCode += '\n';
    sourceCode += pages[i];
    if (pageNum < pages.length) {
      sourceCode += '\n\f';
    }
  }

  const fileGroups = projectAnalysis.fileGroups || [];
  const moduleListStr = fileGroups
    .map(
      (g) =>
        `- **${g.name}** (优先级: ${g.priority}):\n  - 涉及的核心代码文件: ${g.files.slice(0, 10).join(', ')}`,
    )
    .join('\n');

  // AI 生成说明书和表格
  const systemPrompt = `你是软著文档生成专家。根据提供的代码和项目信息，生成软著申请材料。
【严格要求】：
1. 必须基于代码真实逻辑，严禁凭空捏造。
2. 绝对不能使用AI常见词汇（如：旨在、总而言之、综上所述、通过该系统、为用户提供等）。语言风格必须是平实的中国程序员开发文档口吻。
3. 返回 JSON 对象，不要 markdown 代码块。字段如下：

{
  "manual": "完整的软件说明书（Markdown格式，包含：# 软件说明书、## 一、项目引言（含开发背景200+字、软件目标100+字）、## 二、主要功能概述（必须结合【项目核心模块与文件清单】中列出的每一个主要模块，分别展开深度功能描述和技术实现拆解，严禁一笔带过，总字数不少于1000字）、## 三、运行环境（硬件/软件）、## 四、操作流程（安装步骤、使用流程、界面介绍）、## 五、技术特点（创新点300+字、技术优势）、## 六、总结）",
  "applicationForm": "软著申请表格信息（Markdown格式，必须包含以下部分和精确字段，字段必须使用 '- 字段名：具体内容' 格式以便于程序解析为表格）：\\n\\n# 计算机软件著作权登记申请表信息\\n\\n## 一、软件基本信息\\n- 软件全称：[软件名称]\\n- 软件简称：[简称或无]\\n- 版本号：[版本号]\\n- 分类号：[请根据项目性质推荐常见分类号如：30200-0000]\\n- 软件说明：[简短描述软件用途]\\n\\n## 二、开发和发表情况\\n- 开发完成日期：[估计一个近期日期，格式如YYYY年MM月DD日]\\n- 发表状态：[未发表 / 已发表]\\n- 首次发表日期：[若未发表填“无”，若已发表填YYYY年MM月DD日]\\n- 首次发表城市：[若未发表填“无”，若已发表填国家和城市]\\n- 开发方式：[独立开发]\\n- 权利产生方式：[原始取得]\\n- 权利范围：[全部权利]\\n\\n## 三、技术特点\\n- 硬件环境：[详细CPU、内存、硬盘最低运行要求，如 Intel Core i5及以上/8GB内存/100GB可用存储空间]\\n- 软件环境：[详细的操作系统、支持的浏览器或运行库，如 Windows 10及以上/Chrome 80及以上]\\n- 编程语言：[主要编程语言，如 TypeScript, Go, Python]\\n- 源程序总行数：[代码总行数] 行\\n- 主要功能：[限300字以内，简明扼要写出主要功能，便于在线填表直接复制]\\n- 技术特点：[限200字以内，写出架构或实现特色]\\n\\n## 四、软件介质与著作权人\\n- 软件介质：[无介质（网络下载）]\\n- 著作权人全称：[个人姓名或企业全称占位符]\\n- 著作权人类别：[企业 / 个人 / 事业单位]\\n- 国籍：[中国]\\n- 保证方式：[保证书]"
}`;

  const raw = await callDeepSeek(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `软件名称：${softwareName}
版本号：${version}
项目类型：${projectAnalysis.projectType}
架构模式：${projectAnalysis.architecture}
代码总行数：${originalTotalLines}

【项目核心模块与文件清单】：
${moduleListStr}

核心代码片段：
\`\`\`${getLanguageFromPath(projectAnalysis.entryFile)}
${coreCode.slice(0, 8000)}
\`\`\``,
      },
    ],
    apiKey,
    fetchFn,
    8000,
    0.3,
  );

  const parsed = parseJsonResponse(raw) as {
    manual?: string;
    applicationForm?: string;
  } | null;

  return {
    sourceCode,
    manual: parsed?.manual || `# 软件说明书\n\n（AI 未能生成说明书内容，请手动编写）`,
    applicationForm: parsed?.applicationForm || `# 申请表格\n\n（AI 未能生成表格内容，请手动编写）`,
  };
}

// ─── 主入口 ─────────────────────────────────────────────────────

export async function runDeepSeekFullPipeline(
  opts: DeepSeekPipelineOptions,
): Promise<DeepSeekPipelineResult> {
  const { workspaceRoot, projectName, version, apiKey, onProgress, signal, fetchFn } = opts;
  const activeFetch = fetchFn || fetch;

  // ── 阶段一：扫描文件（本地） ─────────────────────
  checkAborted(signal);
  onProgress?.('scanning', '正在扫描项目代码…');

  const extractor = new CodeExtractor(workspaceRoot);
  const files = await extractor.scanFiles();
  const sorted = extractor.sortByPriority(files);

  if (files.length === 0) {
    throw new Error('未找到任何代码文件，请检查项目路径');
  }

  const filePaths = sorted.map((f) => f.path);
  onProgress?.('scanning', `扫描完成，共 ${files.length} 个代码文件`);

  // ── 阶段二：AI 分析项目结构 ─────────────────────
  checkAborted(signal);
  onProgress?.('analyzing-structure', '正在调用 DeepSeek 分析项目结构…');

  const projectAnalysis = await analyzeProjectStructure(filePaths, apiKey, activeFetch);
  onProgress?.(
    'analyzing-structure',
    `项目类型: ${projectAnalysis.projectType}, 架构: ${projectAnalysis.architecture}`,
  );

  // ── 阶段三：AI 智能清洗与提取核心代码 ──────────
  checkAborted(signal);
  onProgress?.('extracting-code', '正在准备挑选核心源文件并清洗...');

  const localExtraction = await extractor.extractForCopyright(
    apiKey,
    activeFetch,
    (msg) => onProgress?.('extracting-code', msg)
  );
  let mergedCode = localExtraction.extractedCode;

  onProgress?.('merging-code', '正在进行源代码 AI 合规审查与打磨自愈…');
  const { evaluateAndPolishSourceCode } = await import('./deepseek-reviewer.js');
  mergedCode = await evaluateAndPolishSourceCode(
    mergedCode,
    apiKey,
    activeFetch,
    opts.polishLoops !== undefined ? opts.polishLoops : 3,
    (msg) => onProgress?.('merging-code', msg)
  );

  const mergedLines = mergedCode.split('\n').filter((l) => l.trim() !== '');
  localExtraction.totalLines = mergedLines.length;

  onProgress?.('merging-code', `源码打磨自愈完成，共 ${mergedLines.length} 行有效代码`);

  // ── 阶段四：AI 生成文档 ────────────────────────
  checkAborted(signal);
  onProgress?.('generating-documents', '正在调用 DeepSeek 生成软著文档…');

  const rawDocuments = await generateDocuments(
    mergedCode,
    localExtraction.totalLines,
    projectName || '未命名软件',
    version || '1.0',
    projectAnalysis,
    apiKey,
    activeFetch,
  );

  onProgress?.('generating-documents', '文档初稿生成完成，即将进入 AI 合规打磨环节...');
  checkAborted(signal);

  const { evaluateAndPolish } = await import('./deepseek-reviewer.js');
  const documents = await evaluateAndPolish(
    rawDocuments,
    apiKey,
    activeFetch,
    opts.polishLoops !== undefined ? opts.polishLoops : 3,
    (msg) => onProgress?.('generating-documents', msg)
  );

  onProgress?.('generating-documents', '文档打磨完成');

  // 组装 ExtractionResult 以保持与现有管线的兼容性
  const extraction: ExtractionResult = {
    totalLines: localExtraction.totalLines,
    selectedFiles: localExtraction.selectedFiles,
    extractedCode: mergedCode,
    pages: documents.sourceCode.split('\f').map((p) => p.trim()),
  };

  const analysis: CodeAnalysis = {
    background: `${projectAnalysis.projectType} 项目，采用 ${projectAnalysis.architecture} 架构`,
    architecture: projectAnalysis.architecture,
  };

  onProgress?.('done', '全流程 AI 生成完成');

  return {
    documents,
    extraction,
    analysis,
    projectAnalysis,
  };
}
