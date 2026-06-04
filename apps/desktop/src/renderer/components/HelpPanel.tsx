interface HelpPanelProps {
  onLogAdd: (msg: string) => void;
}

export function HelpPanel({ onLogAdd }: HelpPanelProps) {
  const handleLinkClick = (name: string) => {
    onLogAdd(`点击了资源链接: ${name}`);
  };

  const handleDownloadTemplate = async (type: 'cooperative' | 'commissioned') => {
    onLogAdd(`开始生成并导出 ${type === 'cooperative' ? '《软件合作开发协议书》' : '《软件受托开发合同书》'} 模板...`);
    try {
      const res = await window.ruanzhu.downloadTemplate({ templateType: type });
      if (res.ok && res.filePath) {
        onLogAdd(`模板保存成功: ${res.filePath}`);
      } else if (res.error) {
        onLogAdd(`模板保存失败: ${res.error}`);
      }
    } catch (err) {
      onLogAdd(`模板导出遇到异常: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="help-panel">
      <div className="help-section">
        <h4>📋 计算机软件著作权登记材料清单</h4>
        <p className="help-subtitle">
          中国版权保护中心（CCPC）软著登记已全面推行线上电子申报，您需对照下方清单准备对应的扫描件或文档，登录官网填报并上传。
        </p>

        <div className="checklist-container">
          <div className="checklist-group">
            <div className="group-title">
              <span className="badge badge-primary">本工具全自动生成</span>
              <h5>1. 核心鉴别材料 (必须提供)</h5>
            </div>
            <ul className="checklist-items">
              <li>
                <strong>📄 源代码清单 (前 30 页 + 后 30 页，共 60 页)</strong>
                <p>由本工具自动剔除空行和多行注释后格式化排版（五号 Times New Roman/宋体，每页 50 行，含正确的页眉页脚与连续页码）。激活后直接导出 Word 即可使用。</p>
              </li>
              <li>
                <strong>📔 软件说明书 (用户操作手册 / 概要设计说明书)</strong>
                <p>不少于 10 页。由本工具自动结合代码特征生成说明大纲。在右侧<b>截图管理器</b>中上传主界面及运行截图，系统导出时自动内嵌，导出后对照修改即可。</p>
              </li>
              <li>
                <strong>✍️ 官网填报核心字段数据 (登记申报数据)</strong>
                <p>包含软件全称、简称、版本号、软硬件开发环境、技术特征描述等。本工具已在“申请表格”标签页为您整理好，直接复制粘贴到官网填报输入框中即可。</p>
              </li>
            </ul>
          </div>

          <div className="checklist-group">
            <div className="group-title">
              <span className="badge badge-secondary">您需要自行准备</span>
              <h5>2. 申请人主体身份证明文件 (必须提供)</h5>
            </div>
            <ul className="checklist-items">
              <li>
                <strong>🏢 企事业单位申请：</strong>
                <p>提供最新的<b>营业执照副本</b>彩色扫描件（PDF/JPG 均可，要求清晰可见）。必须在复印件正中加盖申请单位的<b>红色实体公章</b>并扫描。</p>
              </li>
              <li>
                <strong>👤 个人申请：</strong>
                <p>提供申请人<b>身份证正反面</b>的彩色复印件或扫描件。要求在复印件非文字区域书写<b>手写亲笔签名</b>，然后拍照/扫描上传。</p>
              </li>
            </ul>
          </div>

          <div className="checklist-group">
            <div className="group-title">
              <span className="badge badge-warning">特定情况补充</span>
              <h5>3. 其它补充证明文件 (选择性提供)</h5>
            </div>
            <ul className="checklist-items">
              <li>
                <strong>🤝 合作开发 / 受托开发合同：</strong>
                <p>若软件属于多人合作开发，或受企业/他人委托研发，须加传<b>《合作开发协议》</b>或<b>《委托开发合同》</b>盖章复印件以明确版权所有归属。</p>
              </li>
              <li>
                <strong>📈 版本号高于 1.0 的说明（非首次登记）：</strong>
                <p>若申请登记的软件版本号不是 V1.0（如 V2.0 且之前已有低版本软著），版权中心一般会要求提供<b>《版本说明书》</b>，说明本次版本升级的修改详情。</p>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="help-section margin-top">
        <h4>🔗 国家版权中心官方通道</h4>
        <div className="help-links">
          <a
            href="https://register.ccopyright.com.cn/registration.html"
            target="_blank"
            rel="noreferrer"
            className="help-link-item"
            onClick={() => handleLinkClick('中国版权保护中心登记大厅')}
          >
            🌐 版权中心在线登记大厅官网 ↗
          </a>
          <a
            href="https://www.ccopyright.com.cn/index.php?optionid=1080"
            target="_blank"
            rel="noreferrer"
            className="help-link-item"
            onClick={() => handleLinkClick('计算机软件著作权登记指南')}
          >
            📘 CCPC 计算机软件著作权登记指南 ↗
          </a>
        </div>
      </div>

      <div className="help-section margin-top">
        <h4>📋 官方辅助文书与协议模板下载</h4>
        <p className="help-subtitle">
          软件属于共同研发或受托研发等特定权属划分情况时，版权中心要求上传证明合同。您可在此一键生成并导出符合官方规范的文书草案。
        </p>
        <div className="template-download-list">
          <div className="template-item-card">
            <div className="template-info">
              <h5>🤝 软件合作开发协议书</h5>
              <p>适用于两个或两个以上主体（个人或企业）联合开发软件，共同所有著作权的场景。</p>
            </div>
            <button
              className="btn-download-template"
              onClick={() => handleDownloadTemplate('cooperative')}
            >
              📥 生成并导出 (.docx)
            </button>
          </div>
          <div className="template-item-card">
            <div className="template-info">
              <h5>🏢 软件受托开发合同书</h5>
              <p>适用于委托第三方外包团队或个人编写软件，且约定著作权归属于委托方的场景。</p>
            </div>
            <button
              className="btn-download-template"
              onClick={() => handleDownloadTemplate('commissioned')}
            >
              📥 生成并导出 (.docx)
            </button>
          </div>
        </div>
      </div>

      <div className="help-section margin-top">
        <h4>💡 本软件快速使用指引</h4>
        <div className="help-guide">
          <ol>
            <li>选择项目代码文件夹，系统将自动扫描并显示文件数、行数并计算<b>“项目特征指纹”</b>。</li>
            <li>配置大模型 API Key（用于深入理解代码逻辑），点击<b>“一键提取与排版”</b>开始后台格式化与大纲分析。</li>
            <li>在右侧的“说明书截图管理”中上传软件运行截图，点击<b>“一键导出全部”</b>即可直接生成并导出免水印的 Word / PDF / Markdown 申报材料！</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
