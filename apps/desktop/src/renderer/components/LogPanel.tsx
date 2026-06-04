interface LogPanelProps {
  logs: string[];
  onClear: () => void;
}

export function LogPanel({ logs, onClear }: LogPanelProps) {
  return (
    <div className="log-panel">
      <div className="log-header">
        <h4>操作记录</h4>
        {logs.length > 0 && (
          <button type="button" className="btn-clear-logs" onClick={onClear}>
            清空
          </button>
        )}
      </div>
      <div className="log-content">
        {logs.length === 0 ? (
          <div className="log-empty">暂无操作记录</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="log-item">
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
