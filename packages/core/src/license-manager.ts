import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const LICENSE_SIGN_SECRET = 'RuanZhu-Local-Signature-Secret-2026';

export interface LicenseFileContent {
  fingerprint: string;
  licenseKey: string;
}

/** 为项目指纹生成合法的 HMAC 激活秘钥 */
export function generateLicenseKeyForFingerprint(fingerprint: string): string {
  const hmac = crypto.createHmac('sha256', LICENSE_SIGN_SECRET);
  hmac.update(fingerprint);
  const signature = hmac.digest('hex').slice(0, 16).toUpperCase();
  return `RZ-${fingerprint}-${signature}`;
}

/** 校验激活码是否和当前项目指纹相符 */
export function verifyLicenseKey(fingerprint: string, key: string): boolean {
  const normalizedKey = key.trim().toUpperCase();
  
  // 1. 支持通用的本地测试/开发激活码
  if (normalizedKey === 'RUANZHU-DEMO-BY-PROJECT') return true;

  // 2. 校验签名
  const expectedKey = generateLicenseKeyForFingerprint(fingerprint);
  return normalizedKey === expectedKey;
}

/** 校验项目根目录下隐藏凭证的真实性 */
export async function checkProjectLicense(
  workspaceRoot: string,
  expectedFingerprint: string,
): Promise<boolean> {
  const certPath = path.join(workspaceRoot, '.ruanzhu-license');
  try {
    const raw = await fs.readFile(certPath, 'utf-8');
    const data = JSON.parse(raw) as LicenseFileContent;
    if (data.fingerprint !== expectedFingerprint) {
      return false;
    }
    return verifyLicenseKey(expectedFingerprint, data.licenseKey);
  } catch {
    return false;
  }
}

/** 在项目根目录下写入凭证，并设为 OS 隐藏属性 */
export async function writeProjectLicense(
  workspaceRoot: string,
  fingerprint: string,
  licenseKey: string,
): Promise<void> {
  const certPath = path.join(workspaceRoot, '.ruanzhu-license');
  const content = JSON.stringify({ fingerprint, licenseKey }, null, 2);
  
  // Windows 下覆盖隐藏文件会报 EPERM，需要先取消隐藏属性
  if (process.platform === 'win32') {
    try {
      const { exec } = await import('node:child_process');
      await new Promise<void>(resolve => exec(`attrib -h "${certPath}"`, () => resolve()));
    } catch (e) {
      // 忽略文件不存在等错误
    }
  }

  await fs.writeFile(certPath, content, 'utf-8');

  // Windows 下自动设为隐藏文件 (+h)
  if (process.platform === 'win32') {
    try {
      const { exec } = await import('node:child_process');
      exec(`attrib +h "${certPath}"`);
    } catch (err) {
      console.error('隐藏文件属性设置失败:', err);
    }
  }
}
