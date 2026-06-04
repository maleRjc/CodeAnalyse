import { useState } from 'react';
import { PaymentModal } from './PaymentModal';

interface LicensePanelProps {
  workspaceRoot: string | null;
  fingerprint: string;
  licensed: boolean;
  onLicenseChange: (licensed: boolean) => void;
  onLogAdd: (msg: string) => void;
}

export function LicensePanel({
  workspaceRoot,
  fingerprint,
  licensed,
  onLicenseChange,
  onLogAdd,
}: LicensePanelProps) {
  const [licenseKey, setLicenseKey] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payMethod, setPayMethod] = useState<'wechat' | 'alipay'>('wechat');

  const handleCopyFingerprint = () => {
    if (!fingerprint) return;
    void navigator.clipboard.writeText(fingerprint);
    setCopied(true);
    onLogAdd(`已复制项目特征指纹: ${fingerprint}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = async () => {
    if (!workspaceRoot) return;
    setMessage('');
    onLogAdd(`尝试使用激活码 "${licenseKey}" 激活当前项目...`);
    const res = await window.ruanzhu.activateLicense({
      root: workspaceRoot,
      fingerprint,
      key: licenseKey,
    });
    if (res.ok) {
      setMessage('当前项目已成功激活！');
      onLogAdd(`项目激活成功! (指纹: ${fingerprint})`);
      setLicenseKey('');
      onLicenseChange(true);
    } else {
      setMessage(res.error ?? '激活失败');
      onLogAdd(`项目激活失败: ${res.error ?? '无效的激活码'}`);
    }
  };

  const handleDeactivate = async () => {
    if (!workspaceRoot) return;
    const res = await window.ruanzhu.deactivateLicense({ root: workspaceRoot });
    if (res.ok) {
      setMessage('已取消当前项目的激活');
      onLogAdd(`项目取消激活。`);
      onLicenseChange(false);
    }
  };

  const triggerPayment = (method: 'wechat' | 'alipay') => {
    setPayMethod(method);
    setShowPayment(true);
  };

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    onLicenseChange(true);
    setMessage('当前项目已成功激活！');
  };

  if (!workspaceRoot) {
    return (
      <div className="license-panel">
        <h4>项目授权</h4>
        <p className="license-status" style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          请先选择项目文件夹以获取授权信息。
        </p>
      </div>
    );
  }

  return (
    <div className="license-panel">
      <h4>项目授权</h4>
      <div className="fingerprint-box">
        <span className="label">项目指纹:</span>
        <code className="fingerprint-value">{fingerprint}</code>
        <button type="button" className="btn-copy" onClick={handleCopyFingerprint}>
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      <p className="license-status">
        授权状态：<strong>{licensed ? '已激活 (免重复收费)' : '未激活 (导出 Word 将带水印)'}</strong>
      </p>

      {/* 未激活时展示微信和支付宝扫码区 */}
      {!licensed && (
        <div className="payment-area">
          <div className="payment-title">选择扫码支付激活项目 (¥9.90 / 终身免检)</div>
          <div className="payment-qrcodes">
            <div className="qrcode-box clickable" onClick={() => triggerPayment('wechat')} style={{ cursor: 'pointer' }}>
              <div className="qrcode-mock wechat">
                <span className="qrcode-icon">💬</span>
                <span className="qrcode-name">微信支付</span>
              </div>
              <small>使用微信扫码支付</small>
            </div>
            <div className="qrcode-box clickable" onClick={() => triggerPayment('alipay')} style={{ cursor: 'pointer' }}>
              <div className="qrcode-mock alipay">
                <span className="qrcode-icon">💳</span>
                <span className="qrcode-name">支付宝</span>
              </div>
              <small>使用支付宝支付</small>
            </div>
          </div>
          <p className="payment-tip">
            💡 点击上方图标可开启流光扫码结算台。支持倒计时自动支付模拟，免注册直接激活。
          </p>
        </div>
      )}

      {!licensed && (
        <div className="activate-box">
          <input
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="请输入获得的激活码"
          />
          <button type="button" className="btn-secondary" onClick={() => void handleActivate()}>
            手动激活
          </button>
        </div>
      )}
      {licensed && (
        <button type="button" className="btn-deactivate" onClick={() => void handleDeactivate()}>
          取消激活
        </button>
      )}
      {message && <small className="license-msg">{message}</small>}

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
}
