import crypto from 'node:crypto';
import type { CodeFile } from './types.js';

export function generateProjectFingerprint(
  projectName: string,
  version: string,
  files: CodeFile[],
): string {
  // 1. 抽取前 3 个最具代表性文件的路径和大小作为特征，防拷贝
  const fileFeatures = files
    .slice(0, 3)
    .map((f) => `${f.path}:${f.content.slice(0, 200).length}:${f.content.length}`)
    .join('|');

  // 2. 拼接项目名称与版本号
  const rawString = `${projectName.trim()}:${version.trim()}:${fileFeatures}`;

  // 3. 计算 MD5
  const hash = crypto.createHash('md5').update(rawString).digest('hex');

  // 4. 生成具有商业感和可读性的短哈希指纹
  const prefix = projectName.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'APP';
  const shortHash = hash.slice(0, 8).toUpperCase();
  return `${prefix}-${shortHash}`;
}
