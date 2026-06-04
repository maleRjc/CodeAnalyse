import fs from 'node:fs/promises';
import path from 'node:path';
import { CodeExtractor } from './code-extractor.js';
import { analyzeWithDeepSeek } from './deepseek-client.js';
import { DocumentGenerator } from './document-generator.js';
import { runDeepSeekFullPipeline } from './deepseek-pipeline.js';
import type { CodeAnalysis, CopyrightDocuments } from './types.js';

export type GenerateStage = 'scanning' | 'analyzing' | 'generating' | 'done';

export type GenerateMode = 'local' | 'ai-full';

export interface GenerateOptions {
  workspaceRoot: string;
  projectName: string;
  version: string;
  apiKey?: string;
  mode?: GenerateMode;
  polishLoops?: number;
  onProgress?: (stage: GenerateStage, message: string) => void;
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}

export interface GenerateResult {
  documents: CopyrightDocuments;
  extraction: Awaited<ReturnType<CodeExtractor['extractForCopyright']>>;
  analysis: CodeAnalysis;
  aiError?: string;
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
  const { workspaceRoot, projectName, version, apiKey, mode, onProgress, signal, fetchFn, polishLoops } = opts;

  const key = apiKey?.trim();
  
  if (key && mode !== 'local') {
    const result = await runDeepSeekFullPipeline({
      workspaceRoot,
      projectName,
      version,
      apiKey: key,
      polishLoops,
      onProgress: onProgress as ((stage: string, message: string) => void) | undefined,
      signal,
      fetchFn,
    });

    return {
      documents: result.documents,
      extraction: result.extraction,
      analysis: result.analysis,
    };
  }

  // 纯本地生成流程
  onProgress?.('scanning', '正在本地扫描并分析项目代码…');
  const extractor = new CodeExtractor(workspaceRoot);
  const extraction = await extractor.extractForCopyright(
    undefined,
    undefined,
    (msg) => onProgress?.('scanning', msg)
  );

  onProgress?.('generating', '正在本地生成软著说明书与申请表格…');
  const readmeMeta = await extractFeaturesFromReadme(workspaceRoot);
  const analysis: CodeAnalysis = {
    background: readmeMeta.description || `${projectName} 专注于提供高效率、模块化的数据流处理与核心业务控制方案。`,
    goals: '提供稳定、完整的功能逻辑管理方案，协助开展参数校验及流控状态分析工作。',
    features: readmeMeta.features || undefined,
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
