export const WATERMARK_LINE = '【预览版 · 软著助手】本内容由免费版生成，仅供预览';

/** 演示用完整版激活码（正式环境可替换为在线校验） */
const DEMO_PRO_KEYS = new Set(['RUANZHU-DEMO-PRO', 'RUANZHU-PRO-2026']);

export function validateLicenseKey(key: string): boolean {
  const normalized = key.trim().toUpperCase();
  if (DEMO_PRO_KEYS.has(normalized)) return true;
  if (!/^RUANZHU-[A-Z0-9-]{8,32}$/.test(normalized)) return false;
  let sum = 0;
  for (const ch of normalized) sum += ch.charCodeAt(0);
  return sum % 1009 === 512;
}

export function applyWatermark(content: string, licensed: boolean): string {
  if (licensed) return content;
  return `${WATERMARK_LINE}\n\n${content}\n\n---\n${WATERMARK_LINE}`;
}
