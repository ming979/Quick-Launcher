// ==========================================
// Preload Script - 使用 contextBridge 暴露最小必要 API
// 替代 nodeIntegration:true 的安全架构
// ==========================================
const { contextBridge, ipcRenderer, app } = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');
const NodeBuffer = require('buffer').Buffer;
const msgpackr = (() => {
    try {
        return require('msgpackr');
    } catch (e) {
        return null;
    }
})();

// ==========================================
// 预加载侧栏状态（避免页面加载时闪烁）
// ==========================================
function getInitialSidebarState() {
    try {
        const userDataPath = process.env.USER_DATA_PATH || app.getPath('userData');
        const configPath = path.join(userDataPath, 'config.dat');

        let data = null;

        // 尝试读取 .dat 文件（msgpackr 二进制格式）
        if (fs.existsSync(configPath)) {
            try {
                if (msgpackr) {
                    const buffer = fs.readFileSync(configPath);
                    data = msgpackr.unpack(buffer);
                }
            } catch (e) {
                console.warn('预加载 .dat 格式失败，尝试 JSON 格式');
            }
        }

        // 如果 .dat 读取失败，回退到 .json 格式
        if (!data) {
            const jsonPath = configPath.replace(/\.dat$/i, '.json');
            if (fs.existsSync(jsonPath)) {
                try {
                    const jsonStr = fs.readFileSync(jsonPath, 'utf-8');
                    data = JSON.parse(jsonStr);
                } catch (e) {
                    console.warn('预加载 JSON 格式失败:', e);
                }
            }
        }

        // 处理数据格式（支持新旧两种格式）
        let sidebarCollapsed = false;
        if (data) {
            if (data.s && data.s.sidebarCollapsed !== undefined) {
                sidebarCollapsed = data.s.sidebarCollapsed;
            } else if (data.settings && data.settings.sidebarCollapsed !== undefined) {
                sidebarCollapsed = data.settings.sidebarCollapsed;
            }
        }

        return sidebarCollapsed === true;
    } catch (e) {
        console.error('预加载配置失败:', e);
        return false;
    }
}

const initialSidebarCollapsed = getInitialSidebarState();

// ==========================================
// IPC Listener 管理（支持 removeListener 回调匹配）
// ==========================================
const listenerMap = new Map();

function wrapIpcListener(channel, callback) {
    const wrapped = (_event, ...args) => callback(...args);
    if (!listenerMap.has(channel)) {
        listenerMap.set(channel, new Map());
    }
    listenerMap.get(channel).set(callback, wrapped);
    return wrapped;
}

// ==========================================
// Buffer 序列化辅助函数
// contextBridge 使用结构化克隆，Buffer 会被序列化为 {type:'Buffer', data:[...]}
// 以下函数用于在 preload 端恢复真正的 Buffer 对象
// ==========================================
function restoreBuffer(data) {
    if (data && typeof data === 'object' && data.type === 'Buffer' && Array.isArray(data.data)) {
        return Buffer.from(data.data);
    }
    return data;
}

// ==========================================
// 通过 contextBridge 暴露安全 API
// ==========================================
contextBridge.exposeInMainWorld('electronAPI', {
    // 初始侧栏状态
    initialSidebarCollapsed,

    // 文件系统操作（writeFileSync 自动恢复序列化的 Buffer）
    fs: {
        readFileSync: (filePath, encoding) => fs.readFileSync(filePath, encoding),
        writeFileSync: (filePath, data, encoding) => fs.writeFileSync(filePath, restoreBuffer(data), encoding),
        writeBase64File: (filePath, base64Data) => {
            const buffer = NodeBuffer.from(base64Data, 'base64');
            fs.writeFileSync(filePath, buffer);
        },
        writeArrayBuffer: (filePath, arrayBuffer) => {
            const buffer = NodeBuffer.from(arrayBuffer);
            fs.writeFileSync(filePath, buffer);
        },
        existsSync: (filePath) => fs.existsSync(filePath),
        mkdirSync: (dirPath, opts) => fs.mkdirSync(dirPath, opts),
        readdirSync: (dirPath) => fs.readdirSync(dirPath),
        unlinkSync: (filePath) => fs.unlinkSync(filePath),
        renameSync: (oldPath, newPath) => fs.renameSync(oldPath, newPath),
        statSync: (filePath) => fs.statSync(filePath),
        constants: fs.constants,
        promises: {
            access: (filePath, mode) => fs.promises.access(filePath, mode),
            readFile: (filePath, encoding) => fs.promises.readFile(filePath, encoding),
            writeFile: (filePath, data, encoding) => {
                const buf = restoreBuffer(data);
                return fs.promises.writeFile(filePath, buf, encoding);
            },
        },
        createWriteStream: (filePath) => fs.createWriteStream(filePath),
    },

    // 文件路径转 file:// URL（在 preload 端构建，避免 url.pathToFileURL 跨上下文序列化问题）
    pathToFileURL: (filePath) => {
        if (!filePath) return '';
        let normalizedPath = filePath.replace(/\\/g, '/');
        if (!normalizedPath.startsWith('/')) {
            normalizedPath = '/' + normalizedPath;
        }
        return 'file://' + encodeURI(normalizedPath).replace(/#/g, '%23');
    },

    // 路径操作
    path: {
        join: (...args) => path.join(...args),
        dirname: (p) => path.dirname(p),
        resolve: (...args) => path.resolve(...args),
        basename: (p, ext) => path.basename(p, ext),
        normalize: (p) => path.normalize(p),
        extname: (p) => path.extname(p),
        sep: path.sep,
    },

    // URL 工具
    url,

    // IPC 通信
    ipcRenderer: {
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
        on: (channel, callback) => {
            const wrapped = wrapIpcListener(channel, callback);
            ipcRenderer.on(channel, wrapped);
        },
        send: (channel, ...args) => ipcRenderer.send(channel, ...args),
        once: (channel, callback) => {
            const wrapped = (_event, ...args) => callback(...args);
            ipcRenderer.once(channel, wrapped);
        },
        removeListener: (channel, callback) => {
            const channelMap = listenerMap.get(channel);
            if (channelMap && channelMap.has(callback)) {
                ipcRenderer.removeListener(channel, channelMap.get(callback));
                channelMap.delete(callback);
            }
        },
        removeAllListeners: (channel) => {
            const channelMap = listenerMap.get(channel);
            if (channelMap) {
                channelMap.forEach((wrapped) => ipcRenderer.removeListener(channel, wrapped));
                channelMap.clear();
            }
        },
    },

    // 环境变量
    process: {
        env: {
            APPDATA: process.env.APPDATA,
            USERPROFILE: process.env.USERPROFILE,
            USER_DATA_PATH: process.env.USER_DATA_PATH,
        },
        platform: process.platform,
    },

    // Buffer（完整构造函数，支持 new Buffer / Buffer.from / Buffer.alloc 等）
    Buffer: NodeBuffer,

    // msgpackr 模块（unpack 自动恢复序列化的 Buffer，避免 contextBridge 结构化克隆丢失）
    msgpackr: msgpackr ? {
        pack: (data) => msgpackr.pack(data),
        unpack: (data) => msgpackr.unpack(restoreBuffer(data)),
        Packer: msgpackr.Packer,
        Unpacker: msgpackr.Unpacker,
        addExtension: msgpackr.addExtension,
    } : null,

    // __dirname（渲染进程中的脚本目录）
    __dirname: __dirname,
});