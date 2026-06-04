import fs from 'node:fs/promises';
import path from 'node:path';
import { CodeExtractor } from './code-extractor.js';
import { DocumentGenerator } from './document-generator.js';
import { CodeIntel } from './code-intel.js';
import type { CodeAnalysis, CopyrightDocuments } from './types.js';

export type GenerateStage = 'scanning' | 'analyzing' | 'generating' | 'done';

export type GenerateMode = 'local';

export interface GenerateOptions {
  workspaceRoot: string;
  projectName: string;
  version: string;
  mode?: GenerateMode;
  onProgress?: (stage: GenerateStage, message: string) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  documents: CopyrightDocuments;
  extraction: Awaited<ReturnType<CodeExtractor['extractForCopyright']>>;
  analysis: CodeAnalysis;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('已取消生成');
  }
}

async function extractFeaturesFromReadme(workspaceRoot: string): Promise<{
  features?: string;
  description?: string;
}> {
  try {
    const readmePath = path.join(workspaceRoot, 'README.md');
    const content = await fs.readFile(readmePath, 'utf-8');
    
    // 提取简介（首个非标题段落）
    let description = '';
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('>') && !trimmed.startsWith('!')) {
        description = trimmed;
        break;
      }
    }

    // 提取功能特性
    const features: string[] = [];
    let inFeatures = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        /^(#+)\s*(功能特性|主要功能|功能介绍|Features|特性)/i.test(trimmed)
      ) {
        inFeatures = true;
        continue;
      }
      if (inFeatures) {
        if (trimmed.startsWith('#')) {
          break;
        }
        if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('✅')) {
          const item = trimmed.replace(/^([-*✅])\s*/, '').trim();
          if (item) {
            features.push(`- ${item}`);
          }
        }
      }
    }

    return {
      features: features.length > 0 ? features.join('\n') : undefined,
      description: description || undefined,
    };
  } catch {
    return {};
  }
}

export async function runGeneratePipeline(opts: GenerateOptions): Promise<GenerateResult> {
  const { workspaceRoot, projectName, version, onProgress, signal } = opts;

  checkAborted(signal);

  // 纯本地生成流程
  onProgress?.('scanning', '正在本地扫描并分析项目代码…');
  const extractor = new CodeExtractor(workspaceRoot);
  const extraction = await extractor.extractForCopyright(
    (msg) => onProgress?.('scanning', msg)
  );

  checkAborted(signal);

  onProgress?.('generating', '正在运行 CodeIntel 结构智能分析并生成软著说明书…');
  const readmeMeta = await extractFeaturesFromReadme(workspaceRoot);
  
  const intel = new CodeIntel(workspaceRoot, extraction.selectedFiles);
  const intelStructure = intel.analyzeStructure();

  const modulesDesc = intelStructure.modules
    .map(m => `- \`${m.name}/\`：${m.description}`)
    .join('\n');

  const architectureText = `${intelStructure.architecture}\n\n### 2.3 核心功能模块划分\n\n根据系统源代码的物理存储以及 CodeIntel 依赖流分析，软件主要分为以下功能模块：\n\n${modulesDesc || '- 该系统采用紧凑型扁平目录结构组织业务代码。'}`;

  const analysis: CodeAnalysis = {
    background: readmeMeta.description || `${projectName} 是一款基于 ${intelStructure.projectType} 开发构建的应用软件，专注于提供高效、可靠的数据处理与核心业务流程控制体系。`,
    goals: `基于 ${intelStructure.projectType} 的运行体系，提供稳定、完整的工业级功能逻辑管理方案，协助开展参数校验及流控状态分析工作。`,
    features: readmeMeta.features || undefined,
    architecture: architectureText,
  };

  const generator = new DocumentGenerator(projectName, version);
  const documents = await generator.generateAll(extraction, analysis);

  onProgress?.('done', '本地文档生成完成');

  return {
    documents,
    extraction,
    analysis,
  };
}
