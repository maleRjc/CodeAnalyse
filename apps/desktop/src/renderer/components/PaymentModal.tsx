import { useEffect, useState, useRef } from 'react';

interface PaymentModalProps {
  workspaceRoot: string | null;
  fingerprint: string;
  onClose: () => void;
  onSuccess: (licenseKey: string) => void;
  onLogAdd: (msg: string) => void;
}

export function PaymentModal({
  workspaceRoot,
  fingerprint,
  onClose,
  onSuccess,
  onLogAdd,
}: PaymentModalProps) {
  const [method, setMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [orderId, setOrderId] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [status, setStatus] = useState<'creating' | 'pending' | 'paid' | 'error'>('creating');
  const [errorMsg, setErrorMsg] = useState('');
  const [timeLeft, setTimeLeft] = useState(10); // 10秒模拟倒计时
  const [qrLoaded, setQrLoaded] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 创建订单
  const initOrder = async (payMethod: 'wechat' | 'alipay') => {
    setStatus('creating');
    setErrorMsg('');
    setQrLoaded(false);
    onLogAdd(`正在创建 [${payMethod === 'wechat' ? '微信' : '支付宝'}] 模拟订单...`);

    try {
      const res = await window.ruanzhu.createOrder(fingerprint, payMethod);
      if (res.ok && res.orderId && res.qrUrl) {
        setOrderId(res.orderId);
        setQrUrl(res.qrUrl);
        setStatus('pending');
        setTimeLeft(10);
        onLogAdd(`订单创建成功: ${res.orderId}。开始轮询支付状态...`);
      } else {
        setStatus('error');
        setErrorMsg(res.error ?? '无法创建订单');
        onLogAdd(`创建订单失败: ${res.error ?? '未知错误'}`);
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg('网络或系统接口错误');
      onLogAdd(`创建订单异常: ${String(err)}`);
    }
  };

  // 轮询与倒计时
  useEffect(() => {
    void initOrder(method);

    return () => {
      stopPolling();
    };
  }, [method]);

  // 状态查询
  const checkPayment = async (force?: boolean) => {
    if (!orderId) return;
    try {
      const res = await window.ruanzhu.queryOrder(orderId, force);
      if (res.ok && res.status === 'paid' && res.licenseKey) {
        stopPolling();
        setStatus('paid');
        onLogAdd(`轮询检测成功！订单 ${orderId} 已支付，获得激活码：${res.licenseKey}`);
        
        // 自动激活项目
        if (workspaceRoot) {
          const activateRes = await window.ruanzhu.activateLicense({
            root: workspaceRoot,
            fingerprint,
            key: res.licenseKey,
          });
          if (activateRes.ok) {
            onLogAdd(`项目已成功自动激活并绑定指纹！`);
            setTimeout(() => {
              onSuccess(res.licenseKey!);
            }, 1800);
          } else {
            setErrorMsg(activateRes.error ?? '激活失败');
            setStatus('error');
            onLogAdd(`自动激活失败: ${activateRes.error}`);
          }
        }
      }
    } catch (err) {
      console.error('查询订单失败:', err);
    }
  };

  // 启动轮询与倒计时
  useEffect(() => {
    if (status !== 'pending') return;

    pollIntervalRef.current = setInterval(() => {
      void checkPayment();
    }, 3000);

    countdownIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          void checkPayment(); // 倒计时完查询一次以确保自动触发付款成功
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      stopPolling();
    };
  }, [status, orderId]);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  const handleForceSuccess = () => {
    void checkPayment(true);
  };

  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`;

  return (
    <div className="payment-modal-overlay">
      <div className={`payment-modal-card ${method}`}>
        <button type="button" className="close-btn" onClick={onClose}>
          ✕
        </button>

        {status === 'paid' ? (
          <div className="payment-success-view">
            <div className="success-icon-wrapper">
              <span className="success-checkmark">✓</span>
            </div>
            <h3>支付激活成功</h3>
            <p>感谢支持！已检测到付款，正在为您的项目写入授权文件...</p>
            <div className="license-badge-code">
              <code>RZ-{fingerprint.slice(0, 8)}...-PRO</code>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <h3>解锁完整版排版与 Word 导出</h3>
              <p className="subtitle">一次激活，该项目永久免除额度与水印限制（多端通用）</p>
            </div>

            <div className="payment-tabs">
              <button
                type="button"
                className={`tab-btn wechat-tab ${method === 'wechat' ? 'active' : ''}`}
                onClick={() => setMethod('wechat')}
              >
                <span className="tab-icon">💬</span> 微信支付
              </button>
              <button
                type="button"
                className={`tab-btn alipay-tab ${method === 'alipay' ? 'active' : ''}`}
                onClick={() => setMethod('alipay')}
              >
                <span className="tab-icon">💳</span> 支付宝
              </button>
            </div>

            <div className="modal-body">
              <div className="qr-container-wrapper">
                <div className={`qr-glow-frame ${method}`}>
                  {status === 'creating' && (
                    <div className="qr-loading">
                      <div className="spinner"></div>
                      <span>正在创建安全账单...</span>
                    </div>
                  )}

                  {status === 'error' && (
                    <div className="qr-error">
                      <span className="error-icon">⚠️</span>
                      <p>{errorMsg || '账单创建失败，请重试'}</p>
                      <button type="button" className="retry-btn" onClick={() => void initOrder(method)}>
                        重试
                      </button>
                    </div>
                  )}

                  {status === 'pending' && (
                    <div className="qr-image-box">
                      <img
                        src={qrImgSrc}
                        alt="Payment QR Code"
                        onLoad={() => setQrLoaded(true)}
                        style={{ display: qrLoaded ? 'block' : 'none' }}
                      />
                      {!qrLoaded && (
                        <div className="qr-placeholder">
                          <div className="qr-mock-grid">
                            {[...Array(9)].map((_, i) => (
                              <div key={i} className="qr-mock-dot" />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="price-details">
                <span className="price-label">优惠价格:</span>
                <span className="price-amount">¥9.90 <span className="original-price">¥49.00</span></span>
              </div>

              {status === 'pending' && (
                <div className="polling-status-msg">
                  <div className="pulse-dot"></div>
                  <span>
                    支付轮询中... <b>{timeLeft > 0 ? `模拟付款在 ${timeLeft} 秒内自动生效` : '已进入全自动校验模式'}</b>
                  </span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <p className="safe-tips">🛡️ 本产品使用沙箱/真实当面付双重机制。如您处于测试环境，可等待倒计时完毕或点击下方按钮直接模拟成功付款。</p>
              <div className="footer-actions">
                {status === 'pending' && (
                  <button type="button" className="btn-force-pay" onClick={handleForceSuccess}>
                    ⚡ 模拟付款成功 (免扫码)
                  </button>
                )}
                <button type="button" className="btn-cancel" onClick={onClose}>
                  取消
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
