import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type Language, type WorkspaceManagerApi } from '../shared/contracts';

const api: WorkspaceManagerApi = {
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrap),
  refresh: () => ipcRenderer.invoke(IPC_CHANNELS.refresh),
  setLanguage: (language: Language) => ipcRenderer.invoke(IPC_CHANNELS.setLanguage, language),
  selectProjectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.selectProjectFolder),
  removeProjectFolder: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.removeProjectFolder, path),
  openInstruction: (id) => ipcRenderer.invoke(IPC_CHANNELS.openInstruction, id),
  saveInstruction: (id, fingerprint, text) => ipcRenderer.invoke(IPC_CHANNELS.saveInstruction, id, fingerprint, text),
  listTransactions: () => ipcRenderer.invoke(IPC_CHANNELS.listTransactions),
  restoreTransaction: (id) => ipcRenderer.invoke(IPC_CHANNELS.restoreTransaction, id),
  readMcp: (id) => ipcRenderer.invoke(IPC_CHANNELS.readMcp, id),
  changeMcp: (id, fingerprint, mutation) => ipcRenderer.invoke(IPC_CHANNELS.changeMcp, id, fingerprint, mutation),
  verifyCli: () => ipcRenderer.invoke(IPC_CHANNELS.verifyCli),
  checkMcp: (id, name, fingerprint) => ipcRenderer.invoke(IPC_CHANNELS.checkMcp, id, name, fingerprint),
};

contextBridge.exposeInMainWorld('workspaceManager', api);
