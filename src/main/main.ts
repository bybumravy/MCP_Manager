import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { AppStateStore } from './app-state/app-state-store';
import { IpcController } from './ipc/ipc-controller';

let mainWindow: BrowserWindow | null = null;
let ipcController: IpcController | null = null;

async function createMainWindow(): Promise<void> {
  const stateStore = new AppStateStore(path.join(app.getPath('userData'), 'state'));
  const state = await stateStore.load();

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  ipcController = new IpcController(mainWindow, stateStore, state, app.getPath('home'));
  ipcController.register();

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    ipcController?.dispose();
    ipcController = null;
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createMainWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
