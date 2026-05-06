const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const net = require('net');

const isDev = !app.isPackaged;
// Temporary placeholder for autoUpdater logic to avoid crashes
const autoUpdater = {
  checkForUpdatesAndNotify: () => console.log("Update check skipped in this build"),
  on: () => {}
};

let mainWindow;
let backendProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    autoHideMenuBar: true, // This makes it look like real software
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    frame: true,
    icon: path.join(__dirname, 'icon.ico'),
    // Set a standard Chrome user agent to bypass Google's OAuth block on Electron/Webviews
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const url = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, 'dist/index.html')}`;
  
  mainWindow.loadURL(url);

  // Fake Origin and Referer for YouTube iframes to bypass Error 150/153
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'https://www.youtube.com';
      details.requestHeaders['Referer'] = 'https://www.youtube.com/';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  // Force ALL external links and window.open calls to the system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function killExistingBackend() {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`FOR /F "tokens=5" %a IN ('netstat -aon ^| findstr :8000') DO taskkill /F /PID %a /T`, () => resolve());
    } else {
      exec(`lsof -i :8000 -t | xargs kill -9`, () => resolve());
    }
  });
}

function waitForBackend() {
  return new Promise((resolve) => {
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        setTimeout(check, 500);
      });
      socket.on('timeout', () => {
        socket.destroy();
        setTimeout(check, 500);
      });
      socket.connect(8000, '127.0.0.1');
    };
    check();
  });
}

function startBackend() {
  let backendPath;
  let args = [];
  let backendCwd;

  if (isDev) {
    // In dev, we assume a python venv is available
    backendPath = 'python';
    args = [path.join(__dirname, 'backend/main.py')];
    backendCwd = path.join(__dirname, 'backend');
  } else {
    // In production, backend.exe is bundled in resources
    backendPath = path.join(process.resourcesPath, 'backend.exe');
    backendCwd = process.resourcesPath;

    // The .env should already be in resources due to extraResources in package.json
    const envInResources = path.join(process.resourcesPath, '.env');
    
    if (!fs.existsSync(envInResources)) {
      console.error(`.env NOT found in ${envInResources}`);
      // Try to find it relative to the executable (for some setups)
      const envNextToExe = path.join(path.dirname(process.execPath), '.env');
      if (fs.existsSync(envNextToExe)) {
        try {
          fs.copyFileSync(envNextToExe, envInResources);
        } catch (e) {}
      }
    }
  }

  console.log(`Starting backend at: ${backendPath}`);
  console.log(`Backend exists: ${fs.existsSync(backendPath)}`);
  
  try {
    backendProcess = spawn(backendPath, args, {
      cwd: backendCwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      shell: false
    });

  const logPath = path.join(app.getPath('userData'), 'backend_log.txt');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  
  backendProcess.stdout.on('data', (data) => {
    console.log(`Backend: ${data}`);
    logStream.write(`[STDOUT] ${new Date().toISOString()}: ${data}\n`);
  });
  backendProcess.stderr.on('data', (data) => {
    console.error(`Backend Error: ${data}`);
    logStream.write(`[STDERR] ${new Date().toISOString()}: ${data}\n`);
  });
  backendProcess.on('error', (err) => {
    console.error(`Backend failed to start: ${err.message}`);
    logStream.write(`[ERROR] ${new Date().toISOString()}: ${err.message}\n`);
  });
  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code: ${code}`);
    logStream.write(`[EXIT] ${new Date().toISOString()}: Exit code ${code}\n`);
  });
  } catch (err) {
    console.error(`Failed to spawn backend: ${err.message}`);
  }
}

// IPC handler: open URL in system browser (for Google OAuth)
ipcMain.handle('open-external', (event, url) => {
  return shell.openExternal(url);
});

app.on('ready', async () => {
  console.log('Ensuring port 8000 is free...');
  await killExistingBackend();
  
  startBackend();
  
  console.log('Waiting for backend to be ready...');
  await waitForBackend();
  console.log('Backend is ready. Creating window.');
  
  createWindow();
  
  // Check for updates every 10 minutes
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 600000);
  
  autoUpdater.checkForUpdatesAndNotify();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (backendProcess && backendProcess.pid) {
    console.log('Killing backend process tree...');
    if (process.platform === 'win32') {
      exec(`taskkill /F /PID ${backendProcess.pid} /T`);
    } else {
      backendProcess.kill();
    }
  }
});

// Update logic communication
autoUpdater.on('update-available', () => {
  if (mainWindow) mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
  autoUpdater.quitAndInstall();
});
