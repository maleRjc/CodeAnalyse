import { useEffect, useState } from 'react';
import '../styles/copyright-panel.css';
import type { CopyrightDocuments } from '../../shared/api';
import { PaymentModal } from './PaymentModal';

const WATERMARK_LINE = '【预览版 · 代码排版辅助】本内容由免费版排版提取，仅供预览并需人工润色';

const TAB_LABELS = {
  source: '源代码清单',
  manual: '软件说明书',
  form: '申请表格',
} as const;

type TabKey = keyof typeof TAB_LABELS;

interface CopyrightViewProps {
  documents: CopyrightDocuments;
  projectName: string;
  version: string;
  licensed: boolean;
  fingerprint: string;
  workspaceRoot: string | null;
  onLicenseChange: (licensed: boolean) => void;
  onLogAdd: (msg: string) => void;
  onTabChange?: (tab: 'generate' | 'license' | 'help') => void;
}

const SLOTS = [
  { key: 'setup', label: '1. 安装步骤截图 (setup.png)', placeholder: '安装步骤' },
  { key: 'main_ui', label: '2. 软件主界面截图 (main_ui.png)', placeholder: '软件主界面' },
  { key: 'feature_run', label: '3. 核心功能运行 (feature_run.png)', placeholder: '功能运行' },
  { key: 'result', label: '4. 运行结果/退出 (result.png)', placeholder: '运行结果' },
];

export function CopyrightView({
  documents,
  projectName,
  version,
  licensed,
  fingerprint,
  workspaceRoot,
  onLicenseChange,
  onLogAdd,
  onTabChange,
}: CopyrightViewProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('source');
  const [toast, setToast] = useState('');

  // 内部托管可编辑的文本（完整真实内容）
  const [sourceCode, setSourceCode] = useState('');
  const [manual, setManual] = useState('');
  const [applicationForm, setApplicationForm] = useState('');

  // 截图管理状态
  const [screenshots, setScreenshots] = useState<Record<string, string[]>>({});
  const [showPayment, setShowPayment] = useState(false);
  const [payMethod, setPayMethod] = useState<'wechat' | 'alipay'>('wechat');

  // 当外部文档更新时，同步内部 state
  useEffect(() => {
    setSourceCode(documents.sourceCode);
    setManual(documents.manual);
    setApplicationForm(documents.applicationForm);
  }, [documents]);

  const loadScreenshots = async () => {
    try {
      const res = await window.ruanzhu.getScreenshots();
      if (res.ok && res.screenshots) {
        setScreenshots(res.screenshots);
      }
    } catch (err) {
      console.error('加载截图失败:', err);
    }
  };

  useEffect(() => {
    void loadScreenshots();
  }, [workspaceRoot]);

  const handleUpload = async (slotKey: string, index: number, file: File) => {
    if (!workspaceRoot) return;
    onLogAdd(`正在上传图片到插槽 [${slotKey}] 序号 ${index} : ${file.name}`);
    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = reader.result as ArrayBuffer;
      const res = await window.ruanzhu.uploadScreenshot(slotKey, index, buffer);
      if (res.ok) {
        onLogAdd(`图片插槽 [${slotKey}] 序号 ${index} 上传成功！`);
        showToast(`图片已保存`);
        await loadScreenshots();
      } else {
        onLogAdd(`图片插槽 [${slotKey}] 序号 ${index} 上传失败: ${res.error}`);
        showToast(res.error ?? '上传失败');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDelete = async (slotKey: string, index: number) => {
    if (!workspaceRoot) return;
    onLogAdd(`正在删除插槽 [${slotKey}] 序号 ${index} 的图片`);
    const res = await window.ruanzhu.uploadScreenshot(slotKey, index, null);
    if (res.ok) {
      onLogAdd(`图片插槽 [${slotKey}] 序号 ${index} 已删除`);
      showToast('截图已删除');
      await loadScreenshots();
    } else {
      onLogAdd(`图片插槽 [${slotKey}] 序号 ${index} 删除失败: ${res.error}`);
      showToast(res.error ?? '删除失败');
    }
  };

  const getEditorValue = (): string => {
    switch (activeTab) {
      case 'source':
        return sourceCode;
      case 'manual':
        return manual;
      case 'form':
        return applicationForm;
    }
  };

  const handleEditorChange = (val: string) => {
    if (!licensed) return; // 未激活时为只读状态，不接受输入修改
    switch (activeTab) {
      case 'source':
        setSourceCode(val);
        break;
      case 'manual':
        setManual(val);
        break;
      case 'form':
        setApplicationForm(val);
        break;
    }
  };

  // 生成展示层需要的截断字符
  const getDisplayValue = (tab: TabKey, val: string): string => {
    if (licensed) return val;

    switch (tab) {
      case 'source': {
        const lines = val.split('\n');
        if (lines.length <= 100) return val;
        return (
          lines.slice(0, 100).join('\n') +
          '\n\n\n...... [🔒 完整 60 页源代码已加密隐藏，请激活项目解锁完整版] ......'
        );
      }
      case 'manual': {
        const patterns = [/## 二、/i, /## 2\./i, /## 主要功能/i];
        let index = -1;
        for (const pattern of patterns) {
          const match = val.match(pattern);
          if (match && match.index !== undefined) {
            index = match.index;
            break;
          }
        }
        if (index !== -1) {
          return (
            val.slice(0, index).trim() +
            '\n\n\n...... [🔒 完整软件说明书大纲已加密隐藏，请激活项目解锁完整版] ......'
          );
        }
        if (val.length <= 400) return val;
        return (
          val.slice(0, 400) +
          '\n\n\n...... [🔒 完整软件说明书大纲已加密隐藏，请激活项目解锁完整版] ......'
        );
      }
      case 'form': {
        const patterns = [/## 二、/i, /## 技术信息/i, /## 开发和发表/i];
        let index = -1;
        for (const pattern of patterns) {
          const match = val.match(pattern);
          if (match && match.index !== undefined) {
            index = match.index;
            break;
          }
        }
        if (index !== -1) {
          return (
            val.slice(0, index).trim() +
            '\n\n\n...... [🔒 完整登记申报表格数据已加密隐藏，请激活项目解锁完整版] ......'
          );
        }
        if (val.length <= 300) return val;
        return (
          val.slice(0, 300) +
          '\n\n\n...... [🔒 完整登记申报表格数据已加密隐藏，请激活项目解锁完整版] ......'
        );
      }
    }
  };

  const defaultName = `软著_${TAB_LABELS[activeTab]}_${new Date().toISOString().slice(0, 10)}`;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleUnlicensedExport = () => {
    setPayMethod('wechat');
    setShowPayment(true);
    showToast('该项目尚未激活，请完成支付激活以解锁导出与排版功能');
    onLogAdd('导出拦截: 引导进入扫码支付激活结算台');
  };

  const handleExport = async (format: 'md' | 'docx' | 'txt' | 'pdf') => {
    if (!licensed) {
      handleUnlicensedExport();
      return;
    }
    onLogAdd(`尝试保存「${TAB_LABELS[activeTab]}」为 ${format.toUpperCase()} 格式...`);
    const res = await window.ruanzhu.saveFile({
      content: getEditorValue(),
      defaultName,
      format,
    });
    if (res.ok && res.path) {
      showToast(`已保存：${res.path}`);
      onLogAdd(`成功保存单项文档: ${res.path}`);
    } else if (res.error) {
      showToast(res.error);
      onLogAdd(`单项文档保存失败: ${res.error}`);
    }
  };

  const handleExportAll = async () => {
    if (!licensed) {
      handleUnlicensedExport();
      return;
    }
    onLogAdd(`开始一键导出全部已编辑软著文档...`);
    const editedDocs: CopyrightDocuments = {
      sourceCode,
      manual,
      applicationForm,
    };
    const res = await window.ruanzhu.exportAll({ documents: editedDocs, projectName, version });
    if (res.ok && res.path) {
      showToast(`已导出到：${res.path}`);
      onLogAdd(`一键导出全部文档成功! 输出目录: ${res.path}`);
    } else if (res.error) {
      showToast(res.error);
      onLogAdd(`一键导出全部文档失败: ${res.error}`);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    onLicenseChange(true);
    showToast('项目激活成功！已解锁全部功能。');
  };

  return (
    <div className={`copyright-view ${licensed ? '' : 'with-watermark'}`}>
      <div className="toolbar">
        <div className="tabs">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={activeTab === key ? 'active' : ''}
              onClick={() => setActiveTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="actions">
          <button
            type="button"
            onClick={() => void handleExportAll()}
            className={licensed ? '' : 'btn-muted'}
            title={licensed ? '' : '需要激活当前项目'}
          >
            一键导出全部{licensed ? '' : ' 🔒'}
          </button>
          <button
            type="button"
            onClick={() => void handleExport('md')}
            className={licensed ? '' : 'btn-muted'}
            title={licensed ? '' : '需要激活当前项目'}
          >
            导出 Markdown{licensed ? '' : ' 🔒'}
          </button>
          <button
            type="button"
            onClick={() => void handleExport('txt')}
            className={licensed ? '' : 'btn-muted'}
            title={licensed ? '' : '需要激活当前项目'}
          >
            导出 TXT{licensed ? '' : ' 🔒'}
          </button>
          <button
            type="button"
            onClick={() => void handleExport('pdf')}
            className={licensed ? '' : 'btn-muted'}
            title={licensed ? '' : '需要激活当前项目'}
          >
            导出 PDF{licensed ? '' : ' 🔒'}
          </button>
          {activeTab !== 'source' && (
            <button
              type="button"
              onClick={() => void handleExport('docx')}
              title={licensed ? '' : '需要激活当前项目'}
              className={licensed ? '' : 'btn-muted'}
            >
              导出 Word{licensed ? '' : ' 🔒'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!licensed) {
                handleUnlicensedExport();
              } else {
                window.print();
              }
            }}
            className={licensed ? '' : 'btn-muted'}
            title={licensed ? '' : '需要激活当前项目'}
          >
            打印{licensed ? '' : ' 🔒'}
          </button>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="content">
        {!licensed && (
          <div className="preview-lock-banner">
            <span>🔒 <b>预览模式</b>：当前项目尚未激活，文档内容已部分隐藏。请扫码支付激活以解锁完整内容与导出权限。</span>
            {onTabChange && (
              <button
                type="button"
                className="btn-go-activate"
                onClick={() => triggerPayment('wechat')}
              >
                立即激活 →
              </button>
            )}
          </div>
        )}
        {!licensed && <div className="watermark-overlay">{WATERMARK_LINE}</div>}
        
        <div className={`editor-container-layout ${activeTab === 'manual' ? 'split-layout' : 'full-layout'}`}>
          <textarea
            className={`document-editor ${licensed ? '' : 'preview-locked'}`}
            value={getDisplayValue(activeTab, getEditorValue())}
            onChange={(e) => handleEditorChange(e.target.value)}
            spellCheck={false}
            readOnly={!licensed}
          />
          {activeTab === 'manual' && (
            <div className="screenshot-manager">
              <div className="screenshot-manager-header">
                <h5>说明书截图管理</h5>
                <p>支持多图顺序嵌入。拖放至卡片中可追加图片。</p>
              </div>
              <div className="screenshot-slots">
                {SLOTS.map((slot) => {
                  const imgList = screenshots[slot.key] || [];
                  return (
                    <div
                      key={slot.key}
                      className="screenshot-slot-card"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.preventDefault();
                        const file = e.dataTransfer.files[0];
                        if (file) {
                          await handleUpload(slot.key, imgList.length, file);
                        }
                      }}
                    >
                      <div className="slot-title">{slot.label}</div>
                      <div className="slot-images-grid">
                        {imgList.map((img, idx) => (
                          <div key={idx} className="screenshot-item-container">
                            <img src={img} alt={`${slot.label} ${idx + 1}`} className="preview-image" />
                            <div className="hover-overlay" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn-action replace-btn"
                                onClick={() => document.getElementById(`file-input-${slot.key}-${idx}`)?.click()}
                              >
                                替换
                              </button>
                              <button
                                type="button"
                                className="btn-action delete-btn"
                                onClick={() => handleDelete(slot.key, idx)}
                              >
                                删除
                              </button>
                            </div>
                            <input
                              id={`file-input-${slot.key}-${idx}`}
                              type="file"
                              accept="image/png, image/jpeg"
                              style={{ display: 'none' }}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  await handleUpload(slot.key, idx, file);
                                }
                              }}
                            />
                          </div>
                        ))}
                        <div
                          className="screenshot-add-card"
                          onClick={() => document.getElementById(`file-input-${slot.key}-add`)?.click()}
                        >
                          <span className="add-icon">➕</span>
                          <span className="add-text">添加图片</span>
                          <input
                            id={`file-input-${slot.key}-add`}
                            type="file"
                            accept="image/png, image/jpeg"
                            style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                await handleUpload(slot.key, imgList.length, file);
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          workspaceRoot={workspaceRoot}
          fingerprint={fingerprint}
          onClose={() => setShowPayment(false)}
          onSuccess={handlePaymentSuccess}
          onLogAdd={onLogAdd}
        />
      )}
    </div>
  );

  function triggerPayment(method: 'wechat' | 'alipay') {
    setPayMethod(method);
    setShowPayment(true);
  }
}

