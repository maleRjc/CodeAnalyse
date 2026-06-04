import { useCallback, useEffect, useState } from 'react';
import type { CopyrightDocuments } from '../shared/api';
import { CopyrightPanel } from './components/CopyrightPanel';
import { CopyrightView } from './components/CopyrightView';
import { LicensePanel } from './components/LicensePanel';
import { ProjectBar } from './components/ProjectBar';
import { HelpPanel } from './components/HelpPanel';
import { LogPanel } from './components/LogPanel';

function api() {
  const bridge = window.ruanzhu;
  if (!bridge) throw new Error('预加载桥接未就绪');
  return bridge;
}

export default function App() {
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [version, setVersion] = useState('1.0');
  const [fingerprint, setFingerprint] = useState('');
  const [licensed, setLicensed] = useState(false);
  const [documents, setDocuments] = useState<CopyrightDocuments | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [fileCount, setFileCount] = useState<number | undefined>(undefined);
  const [totalLines, setTotalLines] = useState<number | undefined>(undefined);
  const [compliance, setCompliance] = useState<any | null>(null);

  const [wizardSteps, setWizardSteps] = useState<{ id: number; label: string; desc: string; done: boolean }[]>(() => {
    const saved = localStorage.getItem('ruanzhu-wizard-steps');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return [
      { id: 1, label: '代码扫描与文档生成', desc: '选择项目目录，进行合规性扫描，上传截图并生成Word材料。', done: false },
      { id: 2, label: '版权中心账号实名认证', desc: '前往中国版权保护中心官网进行账号注册并提交身份（个人/企业）实名认证。', done: false },
      { id: 3, label: '在线填报申请信息', desc: '在官网选择“软件著作权登记申请”，并根据本软件「申请表格」生成的数据进行填写。', done: false },
      { id: 4, label: '上传电子版鉴别材料', desc: '在官网上传本工具排版导出的「源代码清单.pdf」和「软件说明书.docx/pdf」。', done: false },
      { id: 5, label: '确认单电子签名或盖章', desc: '下载系统生成的申请确认单，个人手写签名或企业加盖公章，扫描后重新上传至官网。', done: false },
      { id: 6, label: '等待官方受理与发证', desc: '提交审核，等待版权中心审核（通常20-30个工作日），通过后即可获取电子证书。', done: false },
    ];
  });

  const toggleWizardStep = (id: number) => {
    setWizardSteps((prev) => {
      const next = prev.map((step) => (step.id === id ? { ...step, done: !step.done } : step));
      localStorage.setItem('ruanzhu-wizard-steps', JSON.stringify(next));
      return next;
    });
  };

  const [activeTab, setActiveTab] = useState<'generate' | 'license' | 'help'>('generate');
  const [logExpanded, setLogExpanded] = useState(false);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ruanzhu-theme');
    return (saved as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ruanzhu-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // 记录操作日志方法
  const addLog = useCallback((msg: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    void api()
      .getProject()
      .then(async (root) => {
        if (root) {
          setWorkspaceRoot(root);
          addLog(`检测到上次工作目录: ${root}`);
          const info = await api().selectFolder();
          if (info) {
            setWorkspaceRoot(info.root);
            setProjectName(info.name);
            setVersion(info.version);
            setFingerprint(info.fingerprint);
            setLicensed(info.licensed);
            setFileCount(info.fileCount);
            setTotalLines(info.totalLines);
            setCompliance(info.compliance || null);
            addLog(`已载入项目 "${info.name}" (指纹: ${info.fingerprint})`);
          }
        }
      });
  }, [addLog]);

  const handleFolderSelected = useCallback(
    (info: {
      root: string;
      name: string;
      version: string;
      fingerprint: string;
      licensed: boolean;
      fileCount?: number;
      totalLines?: number;
      compliance?: any;
    }) => {
      setWorkspaceRoot(info.root);
      setProjectName(info.name);
      setVersion(info.version);
      setFingerprint(info.fingerprint);
      setLicensed(info.licensed);
      setFileCount(info.fileCount);
      setTotalLines(info.totalLines);
      setCompliance(info.compliance || null);
      setDocuments(null);
      addLog(`已载入项目 "${info.name}" (目录: ${info.root}, 指纹: ${info.fingerprint})`);
    },
    [addLog],
  );

  return (
    <div className="app">
      <ProjectBar
        workspaceRoot={workspaceRoot}
        theme={theme}
        onToggleTheme={toggleTheme}
        onFolderSelected={handleFolderSelected}
      />
      <div className="app-body">
        {/* 左侧极简按键导航栏 */}
        <aside className="nav-sidebar">
          <div className="nav-items">
            <button
              type="button"
              className={`nav-item ${activeTab === 'generate' && !logExpanded ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('generate');
                setLogExpanded(false);
              }}
              title="配置与生成"
            >
              <span className="nav-icon">📝</span>
              <span className="nav-label">配置生成</span>
            </button>
            {/* 隐藏项目授权 Tab */}
            {/* <button
              type="button"
              className={`nav-item ${activeTab === 'license' && !logExpanded ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('license');
                setLogExpanded(false);
              }}
              title="项目授权"
            >
              <span className="nav-icon">🔑</span>
              <span className="nav-label">项目授权</span>
            </button> */}
            <button
              type="button"
              className={`nav-item ${activeTab === 'help' && !logExpanded ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('help');
                setLogExpanded(false);
              }}
              title="使用指南"
            >
              <span className="nav-icon">❓</span>
              <span className="nav-label">帮助指南</span>
            </button>
          </div>
          <div className="nav-footer">
            <button
              type="button"
              className={`nav-item btn-log ${logExpanded ? 'active' : ''}`}
              onClick={() => setLogExpanded(!logExpanded)}
              title="运行日志"
            >
              <span className="nav-icon">🖥️</span>
              <span className="nav-label">运行日志</span>
            </button>
          </div>
        </aside>

        {/* 右侧执行主窗口 */}
        <main className="main-workspace">
          {logExpanded ? (
            <div className="workspace-log-view">
              <LogPanel logs={logs} onClear={() => setLogs([])} />
            </div>
          ) : (
            <div className="workspace-content">
              {activeTab === 'generate' && (
                <div className="generate-workspace">
                  <div className="generate-config-aside">
                    <CopyrightPanel
                      workspaceRoot={workspaceRoot}
                      projectName={projectName}
                      version={version}
                      fileCount={fileCount}
                      totalLines={totalLines}
                      onProjectNameChange={setProjectName}
                      onVersionChange={setVersion}
                      onDocumentsGenerated={setDocuments}
                      onLogAdd={addLog}
                    />
                    
                    {/* 微型实时日志组件 */}
                    <div className="generate-mini-log">
                      <div className="mini-log-header">
                        <span>实时日志</span>
                        {logs.length > 0 && (
                          <button className="btn-clear-mini" onClick={() => setLogs([])}>
                            清空
                          </button>
                        )}
                      </div>
                      <div className="mini-log-body">
                        {logs.length > 0 ? (
                          logs.slice(0, 8).map((log, idx) => (
                            <div key={idx} className="mini-log-item">
                              {log}
                            </div>
                          ))
                        ) : (
                          <div className="mini-log-empty">暂无运行记录</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="generate-preview-main">
                    {documents ? (
                      <CopyrightView
                        documents={documents}
                        projectName={projectName || '未命名软件'}
                        version={version}
                        licensed={licensed}
                        fingerprint={fingerprint}
                        workspaceRoot={workspaceRoot}
                        onLicenseChange={setLicensed}
                        onLogAdd={addLog}
                        onTabChange={setActiveTab}
                      />
                    ) : (
                      <div className="welcome">
                        <h2>软著文档助手</h2>
                        
                        {!workspaceRoot && (
                          <>
                            <p>1. 点击上方「选择项目文件夹」以载入代码</p>
                            <p>2. 在左侧面板配置大模型 API Key，以便分析底层代码逻辑</p>
                            <p>3. 点击「一键提取与排版」，系统将自动排版 60 页源代码并提取文档大纲</p>
                            <p>4. 预览并导出 Word 后，请务必手动贴入 UI 截图并完善说明内容</p>
                          </>
                        )}

                        {compliance && (
                          <div className="compliance-report">
                            <h3>🔍 代码合规性自检报告</h3>
                            <div className="compliance-header">
                              <div className="compliance-score-box">
                                <span className="score-num" style={{ color: compliance.score >= 80 ? '#22c55e' : compliance.score >= 60 ? '#f59e0b' : '#ef4444' }}>
                                  {compliance.score}
                                </span>
                                <span className="score-label">综合合规分</span>
                              </div>
                              <div className="compliance-summary">
                                {compliance.score === 100 ? (
                                  <p className="summary-status success"><b>🎉 恭喜！</b>项目通过了全部核心审查自检，未检测到任何可能影响软著过审的潜在合规问题。</p>
                                ) : compliance.score >= 60 ? (
                                  <p className="summary-status warning"><b>⚠️ 建议核对：</b>自检分数为 <b>{compliance.score}分</b>。检测到一些可能面临版权中心补正风险的项，建议对照下方清单确认或整改代码后再点击排版生成。</p>
                                ) : (
                                  <p className="summary-status error"><b>❌ 严重风险：</b>自检分数仅 <b>{compliance.score}分</b>。项目存在极高被版权中心下发补正或驳回材料的风险，请务必优先处理下方红色警示项！</p>
                                )}
                              </div>
                            </div>

                            <div className="compliance-issues-list">
                              {compliance.issues.map((issue: any, index: number) => (
                                <div key={index} className={`compliance-issue-card ${issue.type}`}>
                                  <div className="issue-title-bar">
                                    <span className={`issue-tag badge-${issue.type}`}>
                                      {issue.type === 'error' ? '严重隐患' : issue.type === 'warning' ? '合规风险' : '合规建议'}
                                    </span>
                                    <strong>{issue.message}</strong>
                                  </div>
                                  {issue.details && <p className="issue-details">{issue.details}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {workspaceRoot && (
                          <div className="filing-wizard">
                            <h3>🗺️ 软著申报全流程向导时间轴</h3>
                            <div className="wizard-progress-bar-container">
                              <div className="wizard-progress-text">
                                填报进度：<b>{wizardSteps.filter((s) => s.done).length} / {wizardSteps.length}</b> 已完成
                              </div>
                              <div className="wizard-progress-bar-track">
                                <div
                                  className="wizard-progress-bar-fill"
                                  style={{ width: `${(wizardSteps.filter((s) => s.done).length / wizardSteps.length) * 100}%` }}
                                />
                              </div>
                            </div>
                            <div className="wizard-timeline">
                              {wizardSteps.map((step) => (
                                <div key={step.id} className={`wizard-step-node ${step.done ? 'done' : ''}`}>
                                  <div className="step-check-col">
                                    <input
                                      type="checkbox"
                                      checked={step.done}
                                      onChange={() => toggleWizardStep(step.id)}
                                      id={`wizard-checkbox-${step.id}`}
                                    />
                                    <label htmlFor={`wizard-checkbox-${step.id}`} className="checkbox-custom-label" />
                                  </div>
                                  <div className="step-info-col">
                                    <div className="step-title">
                                      <span className="step-num-badge">第 {step.id} 步</span>
                                      <strong>{step.label}</strong>
                                    </div>
                                    <p className="step-desc">{step.desc}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="welcome-fingerprint-tip" style={{ marginTop: '20px' }}>
                          {workspaceRoot ? (
                            <span>
                              当前项目特征指纹: <code>{fingerprint}</code> (已激活)
                            </span>
                          ) : (
                            <span>请先导入您的项目文件夹</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'license' && (
                <div className="license-workspace">
                  <LicensePanel
                    workspaceRoot={workspaceRoot}
                    fingerprint={fingerprint}
                    licensed={licensed}
                    onLicenseChange={setLicensed}
                    onLogAdd={addLog}
                  />
                </div>
              )}

              {activeTab === 'help' && (
                <div className="help-workspace">
                  <HelpPanel onLogAdd={addLog} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
