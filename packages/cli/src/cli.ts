#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { runGeneratePipeline, writeDocument } from '@ruanzhu/core';

async function readPkgMeta(root: string): Promise<{ name: string; version: string }> {
  try {
    const raw = await fs.readFile(path.join(root, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as { name?: string; version?: string };
    return {
      name: pkg.name || path.basename(root),
      version: pkg.version || '1.0.0',
    };
  } catch {
    return { name: path.basename(root), version: '1.0.0' };
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: 'string', short: 'n' },
      version: { type: 'string', short: 'v' },
      out: { type: 'string', short: 'o', default: './ruanzhu-output' },
      'api-key': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || positionals.length === 0) {
    console.log(`用法: ruanzhu <项目目录> [选项]

选项:
  -n, --name <名称>       软件名称（默认读 package.json）
  -v, --version <版本>    版本号
  -o, --out <目录>        输出目录（默认 ./ruanzhu-output）
      --api-key <key>     DeepSeek API Key（可选）
  -h, --help              显示帮助
`);
    process.exit(values.help ? 0 : 1);
  }

  const projectDir = path.resolve(positionals[0]);
  const meta = await readPkgMeta(projectDir);
  const projectName = values.name || meta.name;
  const version = values.version || meta.version;
  const outDir = path.resolve(values.out!);
  const apiKey = (values['api-key'] || process.env.DEEPSEEK_API_KEY || '').trim();
  const mode = apiKey ? 'ai-full' : 'local';

  console.log(`扫描项目: ${projectDir} [模式: ${mode === 'local' ? '本地静态生成' : 'AI 全托管生成'}]`);

  const { documents } = await runGeneratePipeline({
    workspaceRoot: projectDir,
    projectName,
    version,
    apiKey: apiKey || undefined,
    mode,
    onProgress: (_stage, msg) => console.log(msg),
  });

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);

  await writeDocument(documents.sourceCode, path.join(outDir, `源代码清单_${stamp}.txt`), 'txt', {
    licensed: true,
  });
  await writeDocument(documents.sourceCode, path.join(outDir, `源代码清单_${stamp}.md`), 'md', {
    licensed: true,
  });
  await writeDocument(documents.manual, path.join(outDir, `软件说明书_${stamp}.md`), 'md', {
    licensed: true,
  });
  await writeDocument(documents.applicationForm, path.join(outDir, `申请表格_${stamp}.md`), 'md', {
    licensed: true,
  });
  await writeDocument(documents.manual, path.join(outDir, `软件说明书_${stamp}.docx`), 'docx', {
    licensed: true,
  });

  console.log(`已输出到: ${outDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
