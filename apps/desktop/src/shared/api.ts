export interface CopyrightDocuments {
  sourceCode: string;
  manual: string;
  applicationForm: string;
}

export type SaveFormat = 'md' | 'txt' | 'docx' | 'pdf';

export interface RuanzhuApi {
  selectFolder: () => Promise<{
    root: string;
    name: string;
    version: string;
    fingerprint: string;
    licensed: boolean;
    fileCount?: number;
    totalLines?: number;
  } | null>;
  getProject: () => Promise<string | null>;
  getLicenseStatus: (payload: { root: string; fingerprint: string }) => Promise<{ licensed: boolean }>;
  activateLicense: (payload: { root: string; fingerprint: string; key: string }) => Promise<{ ok: boolean; error?: string }>;
  deactivateLicense: (payload: { root: string }) => Promise<{ ok: boolean }>;
  onProgress: (callback: (message: string) => void) => () => void;
  cancelGenerate: () => Promise<{ ok: boolean }>;
  generateAll: (opts: {
    projectName: string;
    version: string;
    mode?: 'local';
  }) => Promise<{ ok: boolean; documents?: CopyrightDocuments; error?: string }>;
  exportAll: (payload: {
    documents: CopyrightDocuments;
    projectName: string;
    version?: string;
  }) => Promise<{ ok: boolean; path?: string; licensed?: boolean; error?: string }>;
  saveFile: (payload: {
    content: string;
    defaultName: string;
    format: SaveFormat;
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  createOrder: (fingerprint: string, method: 'wechat' | 'alipay') => Promise<{ ok: boolean; orderId?: string; qrUrl?: string; error?: string }>;
  queryOrder: (orderId: string) => Promise<{ ok: boolean; status: 'pending' | 'paid'; licenseKey?: string; error?: string }>;
  uploadScreenshot: (slotName: string, index: number, buffer: ArrayBuffer | null) => Promise<{ ok: boolean; error?: string }>;
  getScreenshots: () => Promise<{ ok: boolean; screenshots: Record<string, string[]>; error?: string }>;
  downloadTemplate: (payload: { templateType: 'cooperative' | 'commissioned' }) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
}
