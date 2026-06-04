import { useEffect, useState } from 'react';
import '../styles/copyright-panel.css';
import type { CopyrightDocuments } from '../../shared/api';

interface CopyrightPanelProps {
  workspaceRoot: string | null;
  projectName: string;
  version: string;
  fileCount?: number;
  totalLines?: number;
  onProjectNameChange: (v: string) => void;
  onVersionChange: (v: string) => void;
  onDocumentsGenerated: (docs: CopyrightDocuments) => void;
  onLogAdd: (msg: string) => void;
}

export function CopyrightPanel({
  workspaceRoot,
  projectName,
  version,
  fileCount,
  totalLines,
  onProjectNameChange,
  onVersionChange,
  onDocumentsGenerated,
  onLogAdd,
}: CopyrightPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [aiWarning, setAiWarning] = useState('');
  const polishLoops = 15;

  // 计算本地扫描概况
  const est = (() => {
    if (!workspaceRoot) {
      return {
        text: '当前项目：未载入',
        detail: '请先选择项目文件夹。',
        advice: '💡 提示：点击上方按钮导入需要排版的代码文件夹。',
      };
    }
    const lines = totalLines ?? 0;
    const files = fileCount ?? 0;

    return {
      text: '本地直接生成：免费',
      detail: `当前扫描到 ${files} 个文件，共 ${lines} 行代码。`,
      advice: '💡 本地模式使用纯本地静态规则进行代码清理、挑选及 60 页分段排版，不依赖外部大模型接口。',
    };
  })();

  useEffect(() => {
    if (!isGenerating) return;
    const unsubscribe = window.ruanzhu.onProgress((message) => setProgress(message));
    return unsubscribe;
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!workspaceRoot) {
      setError('请先选择项目文件夹');
      return;
    }

    setError('');
    setAiWarning('');
    setIsGenerating(true);
    setProgress('准备中…');
    onLogAdd(`开始本地扫描并分析项目: "${projectName}" (版本: ${version})...`);

    try {
      const res = await window.ruanzhu.generateAll({
        projectName: projectName || '未命名软件',
        version: version || '1.0',
        apiKey: undefined,
        mode: 'local',
        polishLoops,
      });

      if (!res.ok || !res.documents) {
        setError(res.error ?? '生成失败');
        onLogAdd(`生成失败: ${res.error ?? '未知错误'}`);
        return;
      }

      onDocumentsGenerated(res.documents);
      onLogAdd(`本地代码排版与文档大纲提取成功! 请在预览区核对内容并【手动补充软件截图】。`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg);
      onLogAdd(`生成失败: ${errMsg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    void window.ruanzhu.cancelGenerate();
    setProgress('正在取消…');
    onLogAdd(`已发送取消生成信号。`);
  };

  return (
    <div className="copyright-panel">
      <h3>软著配置</h3>

      <div className="config-section">
        {/* 本地扫描概况看板 */}
        <div className="cost-estimator-panel">
          <div className="estimator-title">本地扫描概况</div>
          {workspaceRoot ? (
            <div className="estimator-body">
              <div className="cost-value">{est.text}</div>
              <div className="cost-detail">{est.detail}</div>
              <div className="cost-advice">{est.advice}</div>
            </div>
          ) : (
            <div className="estimator-placeholder">请先选择项目文件夹以载入信息</div>
          )}
        </div>

        <label>
          软件名称
          <input
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            placeholder="自动检测或手动输入"
            disabled={isGenerating}
          />
        </label>

        <label>
          版本号
          <input
            value={version}
            onChange={(e) => onVersionChange(e.target.value)}
            placeholder="1.0"
            disabled={isGenerating}
          />
        </label>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {aiWarning && <div className="warning-banner">{aiWarning}</div>}

      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={isGenerating || !workspaceRoot}
        className="generate-btn"
      >
        {isGenerating ? '正在排版提取中…' : '💻 一键本地排版与生成'}
      </button>

      {isGenerating && (
        <>
          <div className="progress">{progress}</div>
          <button type="button" className="cancel-btn" onClick={handleCancel}>
            取消
          </button>
        </>
      )}
    </div>
  );
}
