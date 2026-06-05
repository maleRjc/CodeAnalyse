import { ipcMain } from 'electron';
import { generateLicenseKeyForFingerprint } from '@ruanzhu/core';

interface MockOrder {
  orderId: string;
  fingerprint: string;
  method: 'wechat' | 'alipay';
  createdAt: number;
  status: 'pending' | 'paid';
}

const mockOrders = new Map<string, MockOrder>();

export function registerPaymentHandlers(): void {
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
}
