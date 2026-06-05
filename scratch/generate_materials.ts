import { runGeneratePipeline, writeDocument } from '../packages/core/src/index.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..');
const outDir = path.join(workspaceRoot, 'ruanzhu_output');

async function main() {
  console.log('--- 启动软著文档一键打包生成流程 ---');
  console.log(`项目路径: ${workspaceRoot}`);
  console.log(`输出目录: ${outDir}`);

  // 创建输出目录
  await fs.mkdir(outDir, { recursive: true });

  const result = await runGeneratePipeline({
    workspaceRoot,
    projectName: 'AI软著助手',
    version: '1.0.0',
    mode: 'local',
    onProgress: (stage, message) => {
      console.log(`[${stage}] ${message}`);
    }
  });

  const stamp = '2026-06-05';
  const prefix = 'AI软著助手';

  console.log('正在写入生成的文件...');

  // 1. 写入源代码清单 (.txt)
  const sourceCodePath = path.join(outDir, `${prefix}_源代码清单_${stamp}.txt`);
  await writeDocument(
    result.documents.sourceCode,
    sourceCodePath,
    'txt',
    { licensed: true, workspaceRoot }
  );
  console.log(`  - 源代码清单已写入: ${sourceCodePath}`);

  // 2. 写入软件说明书 (.docx)
  const userManualPath = path.join(outDir, `${prefix}_软件说明书_${stamp}.docx`);
  await writeDocument(
    result.documents.manual,
    userManualPath,
    'docx',
    { licensed: true, workspaceRoot }
  );
  console.log(`  - 软件说明书已写入: ${userManualPath}`);

  // 3. 智能申请表 (.docx)
  const appFormPath = path.join(outDir, `${prefix}_智能申请表_${stamp}.docx`);
  await writeDocument(
    result.documents.applicationForm,
    appFormPath,
    'docx',
    { licensed: true, workspaceRoot }
  );
  console.log(`  - 智能申请表已写入: ${appFormPath}`);

  console.log('--- 打包生成流程完成！ ---');
}

main().catch(console.error);
