const { app, BrowserWindow, Menu, ipcMain, shell, dialog, nativeImage } = require('electron');
const fs = require('fs'); 
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { execFile } = require('child_process'); 
let mainWindow = null;
// ============================================================
// 设置 Chromium  用户数据目录到应用程序 data/ 文件夹
// 兼容开发环境（npm start）和便携版（portable_app）
// ============================================================
(function setupUserDataPath() {
    // 使用 process.execPath 定位 portable_app 根目录，data 目录始终与 electron.exe 同级 
    const appRoot = path.dirname(process.execPath);
    const userDataPath = path.join(appRoot, 'data');
    app.setPath('userData', userDataPath);
    // 通过环境变量将路径传递给渲染进程（app 模块在渲染进程中不可用）
    process.env.USER_DATA_PATH = userDataPath;
    // 崩溃转储和日志也统一到 data 目录 
    app.setPath('crashDumps', path.join(appRoot, 'data', 'crashDumps'));
    app.setPath('logs', path.join(appRoot, 'data', 'logs'));
})();
// ============================================================
// 安全工具：字符串路径验证（防止命令注入、路径遍历、超大值溢出）
// ============================================================
const MAX_PATH_LENGTH = 4096;
function isValidString(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_PATH_LENGTH;
}
function isSafePath(filePath) {
    if (!isValidString(filePath))
        return false;
    // 禁止 NUL 字节、控制字符
    if (/[\x00-\x1f]/.test(filePath))
        return false;
    return true;
}
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            // 使用 preload.js + contextBridge 暴露最小必要 API，替代 nodeIntegration
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            nodeIntegrationInWorker: false
        },
        title: '快捷启动应用'
});
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    const menu = Menu.buildFromTemplate([
        {
            label: '文件',
            submenu: [
                {
                    label: '退出',
                    click() {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: '视图',
            submenu: [
                {
                    label: '刷新',
                    accelerator: 'F5',
                    click() {
                        mainWindow.reload();
                    }
                },
                {
                    label: '开发者工具',
                    accelerator: 'F12',
                    click() {
                        mainWindow.webContents.openDevTools();
                    }
                }
            ]
        }
    ]);
    Menu.setApplicationMenu(menu);
}
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
ipcMain.on('close-app', () => {
    app.quit();
});
// 使用 shell.openPath 安全启动应用，isSafePath 验证 IPC 参数防止路径遍历
ipcMain.handle('open-app', async (_event, appPath) => {
    try {
        if (!isSafePath(appPath)) return 'invalid path';
        return await shell.openPath(appPath);
    } catch (e) {
        return String(e);
    }
});
// 使用 dialog.showOpenDialog 安全选择文件（替代不可靠的 web File.path）
ipcMain.handle('dialog-open-file', async (_event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: '可执行文件', extensions: ['exe', 'lnk', 'bat', 'cmd', 'com', 'msi'] }],
        ...options,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});
// 使用 isSafePath 验证 IPC 参数，防止路径遍历攻击
ipcMain.on('open-config-folder', (_event, configPath) => {
    try {
        if (!isSafePath(configPath)) {
            console.error('open-config-folder: 无效路径');
            return;
        }
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        // 确保文件存在（showItemInFolder 需要文件存在才能正确高亮）
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, '', 'utf-8');
        }
        shell.showItemInFolder(configPath);
    }
    catch (error) {
        console.error('处理配置文件夹错误:', error);
    }
});
ipcMain.on('select-config-path', async (event) => {
    try {
        if (!mainWindow) {
            console.error('select-config-path: 主窗口不存在');
            event.reply('config-path-selected', { canceled: true });
            return;
        }
        const appData = process.env.APPDATA;
        let defaultPath = '';
        if (appData) {
            defaultPath = path.join(appData, 'Quick Launch Program', 'config.dat');
        }
        else {
            defaultPath = path.join(__dirname, 'config.dat');
        }
        const result = await dialog.showSaveDialog(mainWindow, {
            title: '选择配置文件保存位置',
            defaultPath: defaultPath,
            filters: [
                { name: '配置文件', extensions: ['dat'] },
                { name: '所有文件', extensions: ['*'] }
            ]
        });
        event.reply('config-path-selected', result);
    }
    catch (error) {
        console.error('选择配置路径错误:', error);
        event.reply('config-path-selected', { canceled: true });
    }
});
// 使用 isSafePath 验证 IPC 参数，防止路径遍历攻击
ipcMain.on('export-config', async (event, dataStr) => {
    try {
        const result = await dialog.showSaveDialog({
            title: '导出配置',
            defaultPath: `app-config-${Date.now()}.json`,
            filters: [
                { name: 'JSON 文件', extensions: ['json'] }
            ]
        });
        if (!result.canceled && result.filePath) {
            fs.writeFileSync(result.filePath, dataStr, 'utf-8');
            event.reply('export-config-complete', { success: true });
        }
        else {
            event.reply('export-config-complete', { canceled: true });
        }
    }
    catch (error) {
        console.error('导出配置失败:', error);
        event.reply('export-config-complete', { success: false });
    }
});
// 使用 isSafePath 验证 IPC 参数，防止路径遍历攻击
ipcMain.on('open-app-path-folder', (_event, appPath) => {
    try {
        if (!isSafePath(appPath)) {
            console.error('open-app-path-folder: 无效路径');
            return;
        }
        if (fs.existsSync(appPath)) {
            shell.showItemInFolder(appPath);
        }
        else {
            const parentDir = path.dirname(appPath);
            if (fs.existsSync(parentDir)) {
                shell.openPath(parentDir);
            }
            else {
                console.error('路径不存在:', appPath);
            }
        }
    }
    catch (error) {
        console.error('打开应用路径文件夹错误:', error);
    }
});
// 使用 isSafePath 验证 IPC 参数，PowerShell 内部通过环境变量传递路径
ipcMain.handle('get-file-icon', async (_event, filePath) => {
    try {
        if (!isSafePath(filePath)) {
            return { success: false, error: '无效路径', filePath: filePath };
        }
        const normalizedPath = path.normalize(filePath);
        if (!fs.existsSync(normalizedPath)) {
            return { success: false, error: '文件不存在', filePath: filePath };
        }
        // 限制文件大小（防止超大文件处理）
        try {
            const stats = fs.statSync(normalizedPath);
            if (stats.size > 500 * 1024 * 1024) { // 500MB
                return { success: false, error: '文件过大', filePath: filePath };
            }
        }
        catch (_statErr) { /* 忽略，继续 */ }
        let icon = null;
        let finalSize = { width: 0, height: 0 };
        const minLargeIconSize = 128;
        const rememberBestIcon = (candidate) => {
            if (!candidate || candidate.isEmpty())
                return false;
            const candidateSize = candidate.getSize();
            if (candidateSize.width === 0 || candidateSize.height === 0)
                return false;
            const currentArea = finalSize.width * finalSize.height;
            const candidateArea = candidateSize.width * candidateSize.height;
            if (!icon || candidateArea > currentArea) {
                icon = candidate;
                finalSize = candidateSize;
            }
            return candidateSize.width >= minLargeIconSize && candidateSize.height >= minLargeIconSize;
        };
        if (process.platform === 'win32') {
            const psIcon = await getIconWithPowerShell(normalizedPath);
            if (rememberBestIcon(psIcon)) {
                const dataUrl = icon.toDataURL();
                return {
                    success: true,
                    iconDataUrl: dataUrl,
                    filePath: filePath,
                    size: finalSize
                };
            }
        }
        try {
            const electronIcon = await app.getFileIcon(normalizedPath, { size: 'extra-large' });
            if (rememberBestIcon(electronIcon)) {
                const dataUrl = icon.toDataURL();
                return {
                    success: true,
                    iconDataUrl: dataUrl,
                    filePath: filePath,
                    size: finalSize
                };
            }
        }
        catch (_e) { /* 忽略 */ }
        // shell.extractIcon 在 Electron 28 中已移除，使用 nativeImage.createFromPath 作为备选
        if (!icon || finalSize.width === 0 || finalSize.height === 0) {
            const pathIcon = nativeImage.createFromPath(normalizedPath);
            rememberBestIcon(pathIcon);
        }
        if (!icon || icon.isEmpty() || finalSize.width === 0 || finalSize.height === 0) {
            return { success: false, error: '无法获取图标', filePath: filePath };
        }
        const dataUrl = icon.toDataURL();
        return {
            success: true,
            iconDataUrl: dataUrl,
            filePath: filePath,
            size: finalSize
        };
    }
    catch (error) {
        console.error('获取文件图标失败:', error);
        return { success: false, error: error.message, filePath: filePath };
    }
});
// 使用 PowerShell -EncodedCommand (UTF-16LE Base64) 避免路径字符串拼接
// 消除 PowerShell 脚本中的路径注入风险；参数通过环境变量传递
async function getIconWithPowerShell(filePath) {
    // tempFilePath 在 try 外部声明，确保 catch 块可安全引用
    let tempFilePath = null;
    try {
        if (!isSafePath(filePath))
            return null;
        const execFileAsync = promisify(execFile);
        const tempDir = path.join(os.tmpdir(), 'QuickLaunchIcons');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFileName = `icon_${Date.now()}_${Math.floor(Math.random() * 1e6)}.png`;
        tempFilePath = path.join(tempDir, tempFileName);
        const psScriptCore = `
      $sourcePath = $env:QL_ICON_SRC
      $outPath = $env:QL_ICON_DST
      if ([string]::IsNullOrWhiteSpace($sourcePath) -or [string]::IsNullOrWhiteSpace($outPath)) { exit 1 }
      Add-Type -AssemblyName System.Drawing
      Add-Type -ReferencedAssemblies 'System.Drawing' -TypeDefinition @"
        using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
        [ComImport]
        [Guid("BCC18B79-BA16-442F-80C4-8A59C30C463B")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        public interface IShellItemImageFactory {
            [PreserveSig] int GetImage([In, MarshalAs(UnmanagedType.Struct)] SIZE size, [In] SIIGBF flags, [Out] out IntPtr phbm);
        }
        [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int cx; public int cy; public SIZE(int x,int y){cx=x;cy=y;} }
        [Flags] public enum SIIGBF { RESIZETOFIT=0, BIGGERSIZEOK=1, MEMORYONLY=2, ICONONLY=4, THUMBNAILONLY=8, INCACHEONLY=16 }
        public class IconExtractor {
            public static bool ExtractIcon(string fp, string op) {
                try {
                    IShellItemImageFactory f;
                    SHCreateItemFromParsingName(fp, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out f);
                    if (f != null) {
                        SIZE sz = new SIZE(256,256);
                        IntPtr hb;
                        int r = f.GetImage(sz, SIIGBF.BIGGERSIZEOK | SIIGBF.ICONONLY, out hb);
                        if (r == 0 && hb != IntPtr.Zero) {
                            using (Bitmap bmp = Bitmap.FromHbitmap(hb)) { bmp.Save(op, ImageFormat.Png); }
                            DeleteObject(hb); return true;
                        }
                    }
                } catch {}
                return false;
            }
            [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
            [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
            private static extern void SHCreateItemFromParsingName(
                [MarshalAs(UnmanagedType.LPWStr)] string pszPath, IntPtr pbc,
                [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
                [MarshalAs(UnmanagedType.Interface, IidParameterIndex = 2)] out IShellItemImageFactory ppv);
        }
"@
      [IconExtractor]::ExtractIcon($sourcePath, $outPath)
    `;
        // 用 UTF-16LE Base64 编码脚本，-EncodedCommand 避免任何 shell 解析
        const scriptB64 = Buffer.from(psScriptCore, 'utf16le').toString('base64');
        await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', scriptB64], {
            timeout: 10000,
            env: { ...process.env, QL_ICON_SRC: filePath, QL_ICON_DST: tempFilePath }
        });
        if (fs.existsSync(tempFilePath)) {
            const iconBuffer = fs.readFileSync(tempFilePath);
            const icon = nativeImage.createFromBuffer(iconBuffer);
            fs.unlinkSync(tempFilePath);
            return icon;
        }
    }
    catch (_e) {
        // 忽略 PowerShell 错误，返回 null 由调用方使用 app.getFileIcon 等备选方案
    }
    // 清理临时文件
    try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
    catch (_cleanupErr) { /* 忽略清理错误 */ }
    return null;
}