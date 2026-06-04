import { app, BrowserWindow, dialog, ipcMain, safeStorage, net, Menu } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runGeneratePipeline,
  writeDocument,
  generateProjectFingerprint,
  checkProjectLicense,
  writeProjectLicense,
  verifyLicenseKey,
  generateLicenseKeyForFingerprint,
  CodeExtractor,
  guessProjectMeta,
  type CopyrightDocuments,
  type SaveFormat,
  writeVersionDescription,
  writeCooperativeAgreement,
  writeCommissionedContract,
} from '@ruanzhu/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface MockOrder {
  orderId: string;
  fingerprint: string;
  method: 'wechat' | 'alipay';
  createdAt: number;
  status: 'pending' | 'paid';
}

const mockOrders = new Map<string, MockOrder>();

let mainWindow: BrowserWindow | null = null;
let workspaceRoot: string | null = null;
let generateAbort: AbortController | null = null;

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

interface AppSettings {
  apiKeyEnc?: string;
  licenseKeyEnc?: string;
  licensed?: boolean;
}

function sendProgress(message: string): void {
  mainWindow?.webContents.send('copyright:progress', message);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: '软著文档助手',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 隐藏/移除顶部默认菜单栏 (File/Edit/View...)
  mainWindow.setMenu(null);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // 全局停用默认菜单
  Menu.setApplicationMenu(null);
  createWindow();
  registerIpc();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8');
    return JSON.parse(raw) as AppSettings;
  } catch {
    return {};
  }
}

async function writeSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await readSettings();
  await fs.writeFile(settingsPath(), JSON.stringify({ ...current, ...patch }), 'utf-8');
}

async function checkCurrentWorkspaceLicense(): Promise<boolean> {
  return true;
}

// Using guessProjectMeta imported from @ruanzhu/core

async function runGenerate(
  root: string,
  opts: { projectName: string; version: string; apiKey?: string; mode?: 'local' | 'ai-full'; polishLoops?: number },
): Promise<{ ok: boolean; documents?: CopyrightDocuments; aiError?: string; error?: string }> {
  generateAbort = new AbortController();

  try {
    const { documents, aiError } = await runGeneratePipeline({
      workspaceRoot: root,
      projectName: opts.projectName,
      version: opts.version,
      apiKey: opts.apiKey,
      mode: opts.mode,
      polishLoops: opts.polishLoops,
      signal: generateAbort.signal,
      onProgress: (_stage, message) => sendProgress(message),
      fetchFn: net.fetch.bind(net),
    });
    return { ok: true, documents, aiError };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  } finally {
    generateAbort = null;
  }
}

function registerIpc(): void {
  ipcMain.handle('project:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    workspaceRoot = result.filePaths[0];
    const meta = await guessProjectMeta(workspaceRoot);
    const extractor = new CodeExtractor(workspaceRoot);
    const files = await extractor.scanFiles();
    const sorted = extractor.sortByPriority(files);
    const totalLines = files.reduce((acc, f) => acc + (f.lineCount || 0), 0);
    const fingerprint = generateProjectFingerprint(meta.name, meta.version, sorted);
    const licensed = true;
    const compliance = extractor.checkCompliance(files);
    return {
      root: workspaceRoot,
      name: meta.name,
      version: meta.version,
      fingerprint,
      licensed,
      fileCount: files.length,
      totalLines,
      compliance,
    };
  });

  ipcMain.handle('project:get', () => workspaceRoot);

  ipcMain.handle('license:getStatus', async () => {
    return { licensed: true };
  });

  ipcMain.handle('license:activate', async () => {
    return { ok: true };
  });

  ipcMain.handle('license:deactivate', async (_e, payload: { root: string }) => {
    try {
      const certPath = path.join(payload.root, '.ruanzhu-license');
      await fs.unlink(certPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('settings:getApiKey', async () => {
    const s = await readSettings();
    if (!s.apiKeyEnc || !safeStorage.isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64'));
    } catch {
      return '';
    }
  });

  ipcMain.handle('settings:setApiKey', async (_e, apiKey: string) => {
    if (!apiKey.trim()) {
      await writeSettings({ apiKeyEnc: undefined });
      return { ok: true };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: '当前系统不支持安全存储 API Key' };
    }
    const apiKeyEnc = safeStorage.encryptString(apiKey.trim()).toString('base64');
    await writeSettings({ apiKeyEnc });
    return { ok: true };
  });

  ipcMain.handle('copyright:cancel', () => {
    generateAbort?.abort();
    return { ok: true };
  });

  ipcMain.handle(
    'copyright:generateAll',
    async (_e, opts: { projectName: string; version: string; apiKey?: string; mode?: 'local' | 'ai-full'; polishLoops?: number }) => {
      if (!workspaceRoot) {
        return { ok: false, error: '请先选择项目文件夹' };
      }
      return runGenerate(workspaceRoot, opts);
    },
  );



  ipcMain.handle(
    'copyright:exportAll',
    async (_e, payload: { documents: CopyrightDocuments; projectName: string; version?: string }) => {
      const licensed = await checkCurrentWorkspaceLicense();
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择导出目录',
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false };

      const outDir = result.filePaths[0];
      const stamp = new Date().toISOString().slice(0, 10);
      const safeName = payload.projectName.replace(/[<>:"/\\|?*]/g, '_');
      const versionStr = payload.version || '1.0';
      const isFirstVersion = ['1.0', '1.0.0', 'v1.0', 'V1.0', 'v1.0.0', 'V1.0.0'].includes(versionStr.trim());

      try {
        await writeDocument(
          payload.documents.sourceCode,
          path.join(outDir, `${safeName}_源代码清单_${stamp}.txt`),
          'txt',
          { licensed, workspaceRoot: workspaceRoot || undefined },
        );
        await writeDocument(
          payload.documents.sourceCode,
          path.join(outDir, `${safeName}_源代码清单_${stamp}.md`),
          'md',
          { licensed, workspaceRoot: workspaceRoot || undefined },
        );
        await writeDocument(
          payload.documents.manual,
          path.join(outDir, `${safeName}_软件说明书_${stamp}.md`),
          'md',
          { licensed, workspaceRoot: workspaceRoot || undefined },
        );
        await writeDocument(
          payload.documents.applicationForm,
          path.join(outDir, `${safeName}_申请表格_${stamp}.md`),
          'md',
          { licensed, workspaceRoot: workspaceRoot || undefined },
        );
        if (licensed) {
          await writeDocument(
            payload.documents.manual,
            path.join(outDir, `${safeName}_软件说明书_${stamp}.docx`),
            'docx',
            { licensed: true, workspaceRoot: workspaceRoot || undefined },
          );

          // 自动额外导出合规的 PDF 格式源代码清单
          await exportSourceCodeAsPdf(
            payload.documents.sourceCode,
            path.join(outDir, `${safeName}_源代码清单_${stamp}.pdf`),
            payload.projectName
          );

          // 如果版本不是1.0，且已激活授权，则自动额外导出《版本说明书》
          if (!isFirstVersion) {
            await writeVersionDescription(
              payload.projectName,
              versionStr,
              path.join(outDir, `${safeName}_版本说明书_${stamp}.docx`)
            );
          }
        }
        return { ok: true, path: outDir, licensed };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle(
    'project:downloadTemplate',
    async (_e, payload: { templateType: 'cooperative' | 'commissioned' }) => {
      const defaultName = payload.templateType === 'cooperative'
        ? '软件合作开发协议书模板.docx'
        : '软件委托开发合同书模板.docx';

      const result = await dialog.showSaveDialog(mainWindow!, {
        title: '保存模板文件',
        defaultPath: defaultName,
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
      });

      if (result.canceled || !result.filePath) {
        return { ok: false };
      }

      try {
        if (payload.templateType === 'cooperative') {
          await writeCooperativeAgreement(result.filePath);
        } else {
          await writeCommissionedContract(result.filePath);
        }
        return { ok: true, filePath: result.filePath };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  );

  ipcMain.handle(
    'copyright:saveFile',
    async (
      _e,
      payload: { content: string; defaultName: string; format: SaveFormat },
    ) => {
      const licensed = await checkCurrentWorkspaceLicense();
      if ((payload.format === 'docx' || payload.format === 'pdf') && !licensed) {
        return {
          ok: false,
          error: '导出 Word/PDF 为完整版功能。请激活当前项目（测试激活码：RUANZHU-DEMO-BY-PROJECT）',
        };
      }

      // If format is 'txt' or 'pdf', let the user pick a folder instead of a single file
      if (payload.format === 'txt' || payload.format === 'pdf') {
        const result = await dialog.showOpenDialog(mainWindow!, {
          properties: ['openDirectory', 'createDirectory'],
          title: `选择保存 ${payload.format.toUpperCase()} 文件的目录`,
        });
        if (result.canceled || !result.filePaths[0]) return { ok: false };
        
        const outDir = result.filePaths[0];
        const ext = payload.format;
        const fileName = payload.defaultName.endsWith(`.${ext}`) ? payload.defaultName : `${payload.defaultName}.${ext}`;
        const filePath = path.join(outDir, fileName);
        
        try {
          if (payload.format === 'pdf') {
            await exportSourceCodeAsPdf(payload.content, filePath, payload.defaultName);
          } else {
            await writeDocument(payload.content, filePath, 'txt', { licensed, workspaceRoot: workspaceRoot || undefined });
          }
          return { ok: true, path: filePath };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: message };
        }
      }

      // For other formats (md, docx) keep showSaveDialog
      const ext = payload.format === 'docx' ? 'docx' : 'md';
      const filters =
        payload.format === 'docx'
          ? [{ name: 'Word', extensions: ['docx'] }]
          : [{ name: 'Markdown', extensions: ['md'] }];

      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow!, {
        title: '保存软著文档',
        defaultPath: payload.defaultName.endsWith(`.${ext}`)
          ? payload.defaultName
          : `${payload.defaultName}.${ext}`,
        filters,
      });

      if (canceled || !filePath) return { ok: false };

      try {
        await writeDocument(payload.content, filePath, payload.format, { licensed, workspaceRoot: workspaceRoot || undefined });
        return { ok: true, path: filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  );

  ipcMain.handle('copyright:createOrder', async (_e, fingerprint: string, method: 'wechat' | 'alipay') => {
    const orderId = `RZ-ORD-${Date.now()}`;
    const qrUrl = `https://ruanzhu.aidocx.com/pay/${orderId}?fingerprint=${fingerprint}&method=${method}`;
    mockOrders.set(orderId, {
      orderId,
      fingerprint,
      method,
      createdAt: Date.now(),
      status: 'pending',
    });
    return { ok: true, orderId, qrUrl };
  });

  ipcMain.handle('copyright:queryOrder', async (_e, orderId: string, forceSuccess?: boolean) => {
    const order = mockOrders.get(orderId);
    if (!order) {
      return { ok: false, error: '订单不存在' };
    }
    if (forceSuccess) {
      order.status = 'paid';
    }
    // 10秒后自动模拟付款成功
    if (order.status === 'pending' && Date.now() - order.createdAt > 10000) {
      order.status = 'paid';
    }
    if (order.status === 'paid') {
      const licenseKey = generateLicenseKeyForFingerprint(order.fingerprint);
      return { ok: true, status: 'paid', licenseKey };
    }
    return { ok: true, status: 'pending' };
  });

  ipcMain.handle('copyright:uploadScreenshot', async (_e, slotName: string, index: number, arrayBuffer: ArrayBuffer | null) => {
    if (!workspaceRoot) {
      return { ok: false, error: '请先选择项目文件夹' };
    }
    try {
      const imagesDir = path.join(workspaceRoot, '.ruanzhu', 'images');
      const filePath = path.join(imagesDir, `${slotName}_${index}.png`);
      if (arrayBuffer === null) {
        await fs.unlink(filePath).catch(() => {});
        
        // 平移重命名后续文件以闭合空缺
        try {
          const files = await fs.readdir(imagesDir);
          const pattern = new RegExp(`^${slotName}_(\\d+)\\.png$`);
          const matches = files
            .map(f => {
              const m = f.match(pattern);
              return m ? { file: f, idx: parseInt(m[1], 10) } : null;
            })
            .filter((x): x is { file: string; idx: number } => x !== null)
            .sort((a, b) => a.idx - b.idx);
            
          for (const item of matches) {
            if (item.idx > index) {
              const oldPath = path.join(imagesDir, item.file);
              const newPath = path.join(imagesDir, `${slotName}_${item.idx - 1}.png`);
              await fs.rename(oldPath, newPath);
            }
          }
        } catch {
          // 文件夹不存在或读取出错，忽略
        }
        return { ok: true };
      }
      const buffer = Buffer.from(arrayBuffer);
      await fs.mkdir(imagesDir, { recursive: true });
      await fs.writeFile(filePath, buffer);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('copyright:getScreenshots', async () => {
    if (!workspaceRoot) {
      return { ok: false, screenshots: { setup: [], main_ui: [], feature_run: [], result: [] } };
    }
    try {
      const imagesDir = path.join(workspaceRoot, '.ruanzhu', 'images');
      const files = await fs.readdir(imagesDir);
      const screenshots: Record<string, string[]> = {
        setup: [],
        main_ui: [],
        feature_run: [],
        result: [],
      };
      const allowedSlots = ['setup', 'main_ui', 'feature_run', 'result'];
      const parsedFiles: { slot: string; index: number; file: string }[] = [];
      
      for (const file of files) {
        const ext = path.extname(file);
        if (ext.toLowerCase() !== '.png') continue;
        const name = path.basename(file, ext);
        const underscoreIdx = name.lastIndexOf('_');
        if (underscoreIdx === -1) continue;
        
        const slot = name.slice(0, underscoreIdx);
        const indexStr = name.slice(underscoreIdx + 1);
        const index = parseInt(indexStr, 10);
        
        if (allowedSlots.includes(slot) && !isNaN(index)) {
          parsedFiles.push({ slot, index, file });
        }
      }
      
      parsedFiles.sort((a, b) => a.index - b.index);
      
      for (const item of parsedFiles) {
        try {
          const filePath = path.join(imagesDir, item.file);
          const buffer = await fs.readFile(filePath);
          screenshots[item.slot].push(`data:image/png;base64,${buffer.toString('base64')}`);
        } catch {
          // 忽略单个文件读取错误
        }
      }
      return { ok: true, screenshots };
    } catch {
      return { ok: true, screenshots: { setup: [], main_ui: [], feature_run: [], result: [] } };
    }
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function exportSourceCodeAsPdf(sourceCode: string, savePath: string, softwareName: string): Promise<void> {
  const rawPages = sourceCode.split('\f');
  const pagesHtml = rawPages.map((pageText) => {
    const lines = pageText.trim().split('\n');
    const header = lines[0] || '';
    const content = lines.slice(1).join('\n');

    // 解析类似 "[软件全称 v版本号] 第X页 共Y页" 的格式
    const match = header.match(/^\[(.*?)\]\s*(第\d+页\s*共\d+页)/);
    let headerText = header;
    let footerText = '';
    if (match) {
      headerText = match[1]; // 软件名称与版本，例如 "AI软著助手 v1.0.0"
      footerText = match[2]; // 页码与总页数，例如 "第1页 共33页"
    }

    return `
      <div class="page">
        <div class="page-header">
          <span>${escapeHtml(headerText)}</span>
        </div>
        <pre class="page-content">${escapeHtml(content)}</pre>
        <div class="page-footer">
          <span>${escapeHtml(footerText)}</span>
        </div>
      </div>
    `;
  }).join('\n');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: A4;
      margin: 1.5cm 1.5cm 1.5cm 1.5cm;
    }
    body {
      margin: 0;
      font-family: "Times New Roman", "Courier New", Courier, monospace;
      font-size: 10.5pt; /* 五号字体 */
      line-height: 1.3;
      color: #000;
    }
    .page-header {
      font-size: 9pt;
      color: #666;
      border-bottom: 1px solid #ccc;
      padding-bottom: 3px;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
    }
    .page-content {
      margin: 0;
      flex-grow: 1; /* 让代码区域填充中间空间 */
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: "Courier New", Courier, monospace;
      font-size: 9.5pt;
    }
    .page-footer {
      font-size: 9pt;
      color: #666;
      border-top: 1px solid #ccc;
      padding-top: 3px;
      margin-top: 15px;
      display: flex;
      justify-content: center; /* 页脚居中 */
    }
    .page {
      page-break-after: always;
      height: 26.7cm; /* A4 高度 29.7cm 减去上下页边距各 1.5cm */
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .page:last-child {
      page-break-after: avoid;
    }
  </style>
</head>
<body>
  ${pagesHtml}
</body>
</html>
  `;

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    pageSize: 'A4',
  });

  await fs.writeFile(savePath, pdfBuffer);
  win.close();
}
