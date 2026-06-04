import { contextBridge, ipcRenderer } from 'electron';
import type { RuanzhuApi } from '../shared/api';

const api: RuanzhuApi = {
  selectFolder: () => ipcRenderer.invoke('project:selectFolder'),
  getProject: () => ipcRenderer.invoke('project:get'),
  getLicenseStatus: (payload) => ipcRenderer.invoke('license:getStatus', payload),
  activateLicense: (payload) => ipcRenderer.invoke('license:activate', payload),
  deactivateLicense: (payload) => ipcRenderer.invoke('license:deactivate', payload),
  getApiKey: () => ipcRenderer.invoke('settings:getApiKey'),
  setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
  onProgress: (callback) => {
    const listener = (_event: unknown, message: string) => callback(message);
    ipcRenderer.on('copyright:progress', listener);
    return () => {
      ipcRenderer.removeListener('copyright:progress', listener);
    };
  },
  cancelGenerate: () => ipcRenderer.invoke('copyright:cancel'),
  generateAll: (opts) => ipcRenderer.invoke('copyright:generateAll', opts),
  exportAll: (payload) => ipcRenderer.invoke('copyright:exportAll', payload),
  saveFile: (payload) => ipcRenderer.invoke('copyright:saveFile', payload),
  createOrder: (fingerprint, method) => ipcRenderer.invoke('copyright:createOrder', fingerprint, method),
  queryOrder: (orderId) => ipcRenderer.invoke('copyright:queryOrder', orderId),
  uploadScreenshot: (slotName, index, buffer) => ipcRenderer.invoke('copyright:uploadScreenshot', slotName, index, buffer),
  getScreenshots: () => ipcRenderer.invoke('copyright:getScreenshots'),
  downloadTemplate: (payload) => ipcRenderer.invoke('project:downloadTemplate', payload),
};

contextBridge.exposeInMainWorld('ruanzhu', api);
