import logo from '../assets/logo.png';

interface ProjectBarProps {
  workspaceRoot: string | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onFolderSelected: (info: { root: string; name: string; version: string; fingerprint: string; licensed: boolean }) => void;
}

export function ProjectBar({ workspaceRoot, theme, onToggleTheme, onFolderSelected }: ProjectBarProps) {
  const handleSelect = async () => {
    try {
      const info = await window.ruanzhu.selectFolder();
      if (info) onFolderSelected(info);
    } catch (err) {
      console.error('Select folder failed:', err);
    }
  };

  return (
    <header className="project-bar">
      <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src={logo} alt="Logo" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
        软著文档助手
      </div>
      <button type="button" className="btn-primary" onClick={() => void handleSelect()}>
        选择项目文件夹
      </button>
      <div className="project-path" title={workspaceRoot ?? ''}>
        {workspaceRoot ? `当前项目：${workspaceRoot}` : '未选择项目'}
      </div>
      <button
        type="button"
        className="btn-theme-toggle"
        onClick={onToggleTheme}
        title={theme === 'dark' ? '切换至浅色模式' : '切换至深色模式'}
      >
        {theme === 'dark' ? '☀️ 浅色' : '🌙 深色'}
      </button>
    </header>
  );
}
