﻿// ==========================================
// 模块导入（通过 preload.js contextBridge 安全暴露的 API）
// ==========================================
const api = window.electronAPI;
const fs = api.fs;
const path = api.path;
const ipcRenderer = api.ipcRenderer;
// msgpackr - optional dependency (may be null)
let msgpackr = api.msgpackr;
let __msgpackrFallbackToastShown = false; // 降级提示只显示一次
if (!msgpackr) {
    console.error('msgpackr 模块加载失败，将使用 JSON 格式保存数据');
    setTimeout(() => {
        if (typeof showToast === 'function' && !__msgpackrFallbackToastShown) {
            showToast('配置文件加载失败，已降级为 JSON 格式');
            __msgpackrFallbackToastShown = true;
        }
    }, 1000);
}

// ==========================================
// 侧栏预加载状态（避免页面加载时闪烁）
// ==========================================
window.__INITIAL_SIDEBAR_COLLAPSED = api.initialSidebarCollapsed;

// ==========================================
// 常量定义
// ==========================================
const RESIZE_DEBOUNCE_MS = 150;
const SAVE_DATA_DEBOUNCE_MS = 200;
const CONFIG_CURRENT_VERSION = 1;
const DEFAULT_SELECTED_BORDER_COLOR = '#22c55e';

// ==========================================
// 工具函数模块
// ==========================================
const utils = {
    escapeHtml: function (str) {
        if (!str || typeof str !== 'string') return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        };
        return str.replace(/[&<>"']/g, function (m) { return map[m]; });
    },

    formatDateTime: function (timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    },

    sanitizeSvg: function (svgString) {
        if (!svgString || typeof svgString !== 'string') return '';
        // 移除 script 标签和事件处理器
        let cleaned = svgString.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        cleaned = cleaned.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
        cleaned = cleaned.replace(/on\w+\s*=\s*[^\s>]*/gi, '');
        cleaned = cleaned.replace(/javascript\s*:/gi, '');
        return cleaned;
    },

    pathToFileURL: function (filePath) {
        if (!filePath) return '';
        return api.pathToFileURL(filePath);
    },

    safeDeleteCachedFile: function (cacheDir, fileName) {
        if (!cacheDir || !fileName) return;
        try {
            // 路径遍历防护：只允许字母数字、点、连字符、下划线
            if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) return;
            const fullPath = path.join(cacheDir, fileName);
            // 确认文件在缓存目录内
            const normalizedPath = path.normalize(fullPath);
            const normalizedDir = path.normalize(cacheDir);
            if (!normalizedPath.startsWith(normalizedDir)) return;
            if (fs.existsSync(normalizedPath)) {
                fs.unlinkSync(normalizedPath);
            }
        } catch (e) {
            console.error('删除缓存文件失败:', e);
        }
    }
};

// ==========================================
// 向后兼容的函数别名
// ==========================================
function escapeHtml(str) {
    return utils.escapeHtml(str);
}

function formatDateTime(timestamp) {
    return utils.formatDateTime(timestamp);
}

// ==========================================
// CustomDropdown 类 - 自定义下拉菜单
// ==========================================
class CustomDropdown {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;
        this.trigger = this.container.querySelector('.custom-dropdown-trigger');
        this.menu = this.container.querySelector('.custom-dropdown-menu');
        this.valueSpan = this.container.querySelector('.custom-dropdown-value');
        this.hiddenInput = this.container.querySelector('input[type="hidden"]');
        this.isOpen = false;

        this._bindEvents();
    }

    _bindEvents() {
        if (!this.trigger || !this.menu) return;

        this.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container.contains(e.target)) {
                this.close();
            }
        });
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        this.isOpen = true;
        this.menu.classList.remove('hidden');
        const chevron = this.trigger.querySelector('.fa-chevron-down');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        this.trigger.setAttribute('aria-expanded', 'true');
    }

    close() {
        this.isOpen = false;
        this.menu.classList.add('hidden');
        const chevron = this.trigger.querySelector('.fa-chevron-down');
        if (chevron) chevron.style.transform = '';
        this.trigger.setAttribute('aria-expanded', 'false');
    }

    populateOptions(items, selectedValue) {
        if (!this.menu) return;
        this.menu.innerHTML = '';
        items.forEach(item => {
            const option = document.createElement('div');
            option.className = 'custom-dropdown-option px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer';
            option.textContent = item.label;
            option.dataset.value = String(item.value);
            option.setAttribute('role', 'option');

            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(item.value, item.label);
            });

            this.menu.appendChild(option);
        });

        // 设置默认选中
        if (selectedValue !== undefined && selectedValue !== null) {
            this.select(selectedValue, null, true);
        }
    }

    select(value, label, silent) {
        if (this.hiddenInput) {
            this.hiddenInput.value = String(value);
        }
        if (label && this.valueSpan) {
            this.valueSpan.textContent = label;
        } else if (this.valueSpan) {
            const option = this.menu.querySelector('[data-value="' + String(value) + '"]');
            if (option) {
                this.valueSpan.textContent = option.textContent;
            }
        }
        if (!silent) {
            this.close();
        }
    }
}

// ==========================================
// ColorManager 类 - 颜色管理
// ==========================================
class ColorManager {
    constructor() {
        // 预设颜色映射
        this.presetColorMap = {
            'bg-red-500': '#ef4444',
            'bg-blue-500': '#3b82f6',
            'bg-green-500': '#22c55e',
            'bg-yellow-500': '#eab308',
            'bg-purple-500': '#a855f7',
            'bg-pink-500': '#ec4899',
            'bg-indigo-500': '#6366f1',
            'bg-gray-500': '#6b7280',
            'bg-primary': '#3b82f6'
        };

        // 边框颜色映射
        this.borderColorMap = {
            'border-red-500': '#ef4444',
            'border-blue-500': '#3b82f6',
            'border-green-500': '#22c55e',
            'border-yellow-500': '#eab308',
            'border-purple-500': '#a855f7',
            'border-pink-500': '#ec4899',
            'border-indigo-500': '#6366f1',
            'border-gray-500': '#6b7280',
            'custom': '#22c55e'
        };

        // 模态框状态存储
        this._modalStates = {};
    }

    // 检查是否为预设颜色
    isPresetColor(color) {
        return this.presetColorMap.hasOwnProperty(color);
    }

    // 预设颜色转 hex
    presetToHex(color) {
        return this.presetColorMap[color] || null;
    }

    // 检查是否为自定义 hex 颜色
    isCustomHexColor(color) {
        return /^#[0-9a-fA-F]{6}$/.test(color);
    }

    // 标准化 hex 颜色
    normalizeHex(hex) {
        if (!hex) return null;
        hex = hex.replace('#', '').toUpperCase();
        if (/^[0-9A-F]{6}$/.test(hex)) {
            return '#' + hex.toLowerCase();
        }
        return null;
    }

    // hex 转 RGB
    hexToRgb(hex) {
        const normalized = this.normalizeHex(hex);
        if (!normalized) return null;
        const r = parseInt(normalized.slice(1, 3), 16);
        const g = parseInt(normalized.slice(3, 5), 16);
        const b = parseInt(normalized.slice(5, 7), 16);
        return { r: r, g: g, b: b };
    }

    // RGB 转 hex
    rgbToHex(r, g, b) {
        const toHex = function (n) {
            const hex = n.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    // 初始化模态框状态
    _initModalState(modalType) {
        if (!this._modalStates[modalType]) {
            this._modalStates[modalType] = {
                selectedColor: null,
                useCustomColor: false,
                customColor: null
            };
        }
    }

    // 设置模态框状态
    setModalState(modalType, state) {
        this._initModalState(modalType);
        Object.assign(this._modalStates[modalType], state);
    }

    // 重置模态框状态
    resetModalState(modalType) {
        this._modalStates[modalType] = {
            selectedColor: null,
            useCustomColor: false,
            customColor: null
        };
    }

    // 从分类数据初始化模态框
    initModalFromCategory(modalType, category, colorElements) {
        this._initModalState(modalType);

        const color = category.color || '#3b82f6';
        const isCustom = this.isCustomHexColor(color);

        this._modalStates[modalType] = {
            selectedColor: color,
            useCustomColor: isCustom,
            customColor: isCustom ? color : null
        };

        // 更新颜色输入元素
        if (colorElements) {
            const rgb = this.hexToRgb(color);
            if (colorElements.hexInput) {
                colorElements.hexInput.value = color.replace('#', '');
            }
            if (colorElements.hexPreview) {
                colorElements.hexPreview.style.backgroundColor = color;
            }
            if (rgb) {
                if (colorElements.r) colorElements.r.value = String(rgb.r);
                if (colorElements.g) colorElements.g.value = String(rgb.g);
                if (colorElements.b) colorElements.b.value = String(rgb.b);
            }
            if (colorElements.rgbPreview) {
                colorElements.rgbPreview.style.backgroundColor = color;
            }
            if (colorElements.colorWheel) {
                colorElements.colorWheel.value = color;
            }
        }
    }

    // 获取最终颜色
    getFinalColor(modalType) {
        const state = this._modalStates[modalType];
        if (!state) return '#3b82f6';

        if (state.useCustomColor && state.customColor) {
            return state.customColor;
        }
        if (state.selectedColor) {
            if (this.isPresetColor(state.selectedColor)) {
                return this.presetToHex(state.selectedColor) || state.selectedColor;
            }
            return state.selectedColor;
        }
        return '#3b82f6';
    }

    // 处理预设颜色选择
    handlePresetColorSelect(modalType, color, parentModal) {
        this._initModalState(modalType);

        // 移除其他选中状态
        parentModal.querySelectorAll('.color-option').forEach(function (el) {
            el.classList.remove('ring-2', 'ring-offset-2');
        });

        // 添加当前选中状态
        const selectedEl = parentModal.querySelector('[data-color="' + color + '"]');
        if (selectedEl) {
            selectedEl.classList.add('ring-2', 'ring-offset-2');
        }

        this._modalStates[modalType].selectedColor = color;
        this._modalStates[modalType].useCustomColor = false;
        this._modalStates[modalType].customColor = null;
    }

    // 更新颜色输入元素
    updateColorInputs(modalType, rInput, gInput, bInput, rgbPreview, colorWheel, hexColor, hexPreview) {
        const self = this;
        const updateFromHex = function (hex) {
            const rgb = self.hexToRgb(hex);
            if (rgb) {
                if (rInput) rInput.value = String(rgb.r);
                if (gInput) gInput.value = String(rgb.g);
                if (bInput) bInput.value = String(rgb.b);
                if (rgbPreview) rgbPreview.style.backgroundColor = hex;
            }
            if (hexPreview) {
                hexPreview.style.backgroundColor = hex;
            }
        };

        const updateFromRgb = function () {
            if (!rInput || !gInput || !bInput) return;
            const r = parseInt(rInput.value) || 0;
            const g = parseInt(gInput.value) || 0;
            const b = parseInt(bInput.value) || 0;
            const hex = self.rgbToHex(
                Math.min(255, Math.max(0, r)),
                Math.min(255, Math.max(0, g)),
                Math.min(255, Math.max(0, b))
            );
            if (rgbPreview) rgbPreview.style.backgroundColor = hex;
            if (hexPreview) hexPreview.style.backgroundColor = hex;
            if (hexColor) hexColor.value = hex.replace('#', '');
            if (colorWheel) colorWheel.value = hex;
        };

        // Hex 输入事件
        if (hexColor) {
            hexColor.addEventListener('input', function () {
                const hex = self.normalizeHex(hexColor.value);
                if (hex) {
                    updateFromHex(hex);
                }
            });
        }

        // RGB 输入事件
        if (rInput) rInput.addEventListener('input', updateFromRgb);
        if (gInput) gInput.addEventListener('input', updateFromRgb);
        if (bInput) bInput.addEventListener('input', updateFromRgb);

        // 色轮事件
        if (colorWheel) {
            colorWheel.addEventListener('input', function () {
                const hex = colorWheel.value;
                updateFromHex(hex);
            });
        }
    }

    // 处理 hex 颜色使用
    handleHexColorUse(modalType, hexInput, parentModal) {
        this._initModalState(modalType);
        const hex = this.normalizeHex(hexInput ? hexInput.value : '');
        if (!hex) return null;

        this._modalStates[modalType].selectedColor = hex;
        this._modalStates[modalType].useCustomColor = true;
        this._modalStates[modalType].customColor = hex;

        // 清除预设颜色选中状态
        if (parentModal) {
            parentModal.querySelectorAll('.color-option').forEach(function (el) {
                el.classList.remove('ring-2', 'ring-offset-2');
            });
        }

        return hex;
    }

    // 处理 RGB 颜色使用
    handleRgbColorUse(modalType, rInput, gInput, bInput, parentModal) {
        this._initModalState(modalType);
        const r = parseInt(rInput ? rInput.value : 0) || 0;
        const g = parseInt(gInput ? gInput.value : 0) || 0;
        const b = parseInt(bInput ? bInput.value : 0) || 0;
        const hex = this.rgbToHex(
            Math.min(255, Math.max(0, r)),
            Math.min(255, Math.max(0, g)),
            Math.min(255, Math.max(0, b))
        );

        this._modalStates[modalType].selectedColor = hex;
        this._modalStates[modalType].useCustomColor = true;
        this._modalStates[modalType].customColor = hex;

        // 清除预设颜色选中状态
        if (parentModal) {
            parentModal.querySelectorAll('.color-option').forEach(function (el) {
                el.classList.remove('ring-2', 'ring-offset-2');
            });
        }

        return hex;
    }
}

// 全局 ColorManager 实例
const colorManager = new ColorManager();

// ==========================================
// 全局状态变量
// ==========================================
let categories = [
    { id: '1', name: '默认分类', isDefault: true, icon: 'fa-folder', color: '#3b82f6' }
];
let applications = [];
let selectedColor = 'bg-primary';
let selectedIcon = 'fa-th-large';
let selectedBorderColor = 'border-green-500';
let customColorMode = false;
let currentEditingAppId = null;
let selectedAppIcon = 'fa-th-large';
let uploadedAppIcon = null;
let appSettingsUploadedIcon = null;
let appSettingsDropdown = null;
let addAppDropdown = null;

const currentState = {
    currentCategoryId: '1',
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 6,
    backgroundImage: '',
    backgroundOpacity: 0.5,
    backgroundMode: 'cover',
    backgroundIsVideo: false,
    backgroundVideoPlaying: true,
    backgroundVideoMuted: true,
    backgroundLoadFailed: false,
    configPath: '',
    borderColor: 'border-green-500',
    sidebarCollapsed: false,
    theme: 'system',
    styleSettings: null,
    resizeTimeout: null,
    gridResizeObserver: null,
    resizeHandler: null
};

const styleSettings = {
    fontMode: 'follow',
    iconMode: 'follow',
    borderMode: 'follow',
    appCardBgFollowOpacity: false,
    descDisplayMode: 'show',
    launchMode: 'click'
};

// ==========================================
// 网格布局辅助函数
// ==========================================
function getCurrentGridCols() {
    const grid = elements.appsGrid;
    if (!grid) return 6;
    const style = window.getComputedStyle(grid);
    const gridTemplateColumns = style.gridTemplateColumns;
    if (gridTemplateColumns && gridTemplateColumns !== 'none') {
        return gridTemplateColumns.split(' ').length;
    }
    return 6;
}

function calculateItemsPerPage() {
    const grid = elements.appsGrid;
    if (!grid) return 6;
    const cols = getCurrentGridCols();
    const gridRect = grid.getBoundingClientRect();
    // 卡片高度约为 280px（含间距）
    const cardHeight = 280;
    const availableHeight = gridRect.height;
    const rows = Math.max(2, Math.floor(availableHeight / cardHeight));
    return Math.max(1, cols * rows);
}

function updateItemsPerPage() {
    const newItemsPerPage = calculateItemsPerPage();
    if (newItemsPerPage !== currentState.itemsPerPage) {
        currentState.itemsPerPage = newItemsPerPage;
        currentState.currentPage = 1;
        if (typeof renderApps === 'function') renderApps();
        if (typeof updatePagination === 'function') updatePagination();
    }
}

// ==========================================
// 背景管理器
// ==========================================
const backgroundManager = {
    isVideoFile: function (fileName) {
        if (!fileName) return false;
        const ext = fileName.toLowerCase().split('.').pop();
        return ['mp4', 'webm', 'ogg', 'mov', 'avi'].indexOf(ext) !== -1;
    },

    getBackgroundModeStyles: function (mode) {
        switch (mode) {
            case 'fill':
                return {
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                };
            case 'cover':
                return {
                    backgroundSize: 'cover',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                };
            case 'repeat':
                return {
                    backgroundSize: 'auto',
                    backgroundRepeat: 'repeat',
                    backgroundPosition: 'top left'
                };
            case 'contain':
                return {
                    backgroundSize: 'contain',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                };
            default:
                return {
                    backgroundSize: 'cover',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center'
                };
        }
    },

    applyBackgroundImage: function (imagePath, isVideo) {
        const container = document.getElementById('bgImageContainer');
        if (!container) return;

        // 清除现有内容
        container.innerHTML = '';

        const preview = document.getElementById('bgPreview');
        const previewPlaceholder = document.getElementById('bgPreviewPlaceholder');

        if (!imagePath) {
            container.style.backgroundImage = '';
            if (preview) {
                preview.style.backgroundImage = '';
                preview.style.backgroundColor = '';
                const previewVideo = preview.querySelector('video');
                if (previewVideo) previewVideo.remove();
            }
            if (previewPlaceholder) {
                previewPlaceholder.classList.remove('hidden');
            }
            return;
        }

        if (isVideo) {
            const video = document.createElement('video');
            video.src = imagePath;
            video.autoplay = currentState.backgroundVideoPlaying !== false;
            video.loop = true;
            video.muted = currentState.backgroundVideoMuted !== false;
            video.playsInline = true;
            video.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: ' + this.getVideoObjectFit(currentState.backgroundMode) + ';';
            container.appendChild(video);

            if (currentState.backgroundVideoPlaying !== false) {
                video.play().catch(function () { });
            }

            // 预览框同步显示视频
            if (preview) {
                preview.style.backgroundImage = '';
                preview.style.backgroundColor = '#000';
                const previewVideo = preview.querySelector('video');
                if (previewVideo) previewVideo.remove();
                const pv = document.createElement('video');
                pv.preload = 'auto';
                pv.muted = currentState.backgroundVideoMuted !== false;
                pv.loop = true;
                pv.playsInline = true;
                pv.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: ' + this.getVideoObjectFit(currentState.backgroundMode) + '; border-radius: 0.75rem; z-index: 1;';
                pv.onloadeddata = function () {
                    if (currentState.backgroundVideoPlaying !== false) {
                        pv.play().catch(function () { });
                    }
                };
                preview.appendChild(pv);
                pv.src = imagePath;
                pv.autoplay = currentState.backgroundVideoPlaying !== false;
            }
            if (previewPlaceholder) {
                previewPlaceholder.classList.add('hidden');
            }
        } else {
            container.style.backgroundImage = 'url("' + imagePath + '")';
            this.applyBackgroundModeToElement(container, currentState.backgroundMode);

            // 预览框同步显示背景图片
            if (preview) {
                preview.style.backgroundImage = 'url("' + imagePath + '")';
                preview.style.backgroundColor = 'transparent';
                this.applyBackgroundModeToElement(preview, currentState.backgroundMode);
            }
            if (previewPlaceholder) {
                previewPlaceholder.classList.add('hidden');
            }
        }

        // 应用透明度
        applyBackgroundOpacity(currentState.backgroundOpacity);
    },

    applyBackgroundMode: function (mode) {
        const container = document.getElementById('bgImageContainer');
        if (container) {
            if (currentState.backgroundIsVideo) {
                const video = container.querySelector('video');
                if (video) {
                    video.style.objectFit = this.getVideoObjectFit(mode);
                }
            } else {
                this.applyBackgroundModeToElement(container, mode);
            }
        }
        const preview = document.getElementById('bgPreview');
        if (preview && currentState.backgroundImage) {
            if (currentState.backgroundIsVideo) {
                const previewVideo = preview.querySelector('video');
                if (previewVideo) {
                    previewVideo.style.objectFit = this.getVideoObjectFit(mode);
                }
            } else {
                this.applyBackgroundModeToElement(preview, mode);
            }
        }
    },

    getVideoObjectFit: function (mode) {
        switch (mode) {
            case 'fill': return 'cover';
            case 'cover': return 'fill';
            case 'repeat': return 'contain';
            case 'contain': return 'contain';
            default: return 'cover';
        }
    },

    applyBackgroundModeToElement: function (element, mode) {
        if (!element) return;
        const styles = this.getBackgroundModeStyles(mode);
        Object.assign(element.style, styles);
    },

    lazyLoadBackground: function (imagePath, isVideo, callback) {
        const container = document.getElementById('bgImageContainer');
        if (!container) {
            if (callback) callback(false);
            return;
        }

        if (isVideo) {
            const video = document.createElement('video');
            video.preload = 'auto';
            video.muted = currentState.backgroundVideoMuted !== false;
            video.loop = true;
            video.playsInline = true;
            video.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: ' + this.getVideoObjectFit(currentState.backgroundMode) + ';';

            video.onloadeddata = function () {
                container.innerHTML = '';
                container.appendChild(video);
                if (currentState.backgroundVideoPlaying !== false) {
                    video.play().catch(function () { });
                }
                applyBackgroundOpacity(currentState.backgroundOpacity);
                if (callback) callback(true);
            };

            video.onerror = function () {
                console.error('背景视频加载失败');
                currentState.backgroundLoadFailed = true;
                if (callback) callback(false);
            };

            video.src = imagePath;
        } else {
            const img = new Image();
            img.onload = function () {
                container.innerHTML = '';
                container.style.backgroundImage = 'url("' + imagePath + '")';
                backgroundManager.applyBackgroundModeToElement(container, currentState.backgroundMode);
                applyBackgroundOpacity(currentState.backgroundOpacity);
                if (callback) callback(true);
            };
            img.onerror = function () {
                console.error('背景图片加载失败');
                currentState.backgroundLoadFailed = true;
                if (callback) callback(false);
            };
            img.src = imagePath;
        }
    }
};

// ==========================================
// 向后兼容的背景函数别名
// ==========================================
function applyBackgroundImage(imagePath, isVideo) {
    backgroundManager.applyBackgroundImage(imagePath, isVideo);
}

function applyBackgroundMode(mode) {
    backgroundManager.applyBackgroundMode(mode);
}

function applyBackgroundModeToElement(element, mode) {
    backgroundManager.applyBackgroundModeToElement(element, mode);
}

function isVideoFile(fileName) {
    return backgroundManager.isVideoFile(fileName);
}

// ==========================================
// 背景透明度相关函数
// ==========================================
function computeAppCardBgColor(opacity) {
    if (opacity === undefined) opacity = currentState.backgroundOpacity;
    const isDark = document.body.classList.contains('dark-mode');
    if (isDark) {
        const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
        return '#1f2937' + alpha;
    } else {
        const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
        return '#ffffff' + alpha;
    }
}

function updateAppCardOpacityBg() {
    const isDark = document.body.classList.contains('dark-mode');
    const followOpacity = styleSettings.appCardBgFollowOpacity;

    if (followOpacity) {
        document.body.classList.add('app-card-bg-follow');
        const opacity = currentState.backgroundOpacity;
        const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
        const bgColor = isDark ? '#1f2937' + alpha : '#ffffff' + alpha;
        document.documentElement.style.setProperty('--app-card-opacity-bg', bgColor);
    } else {
        document.body.classList.remove('app-card-bg-follow');
        const bgColor = isDark ? '#1f2937' : '#ffffff';
        document.documentElement.style.setProperty('--app-card-opacity-bg', bgColor);
    }
}

function applyBackgroundOpacity(opacity) {
    // 更新容器背景透明度（CSS 变量，控制 header/aside/footer/main）
    // 背景图片本身始终全显，不受透明度控制
    // opacity 为不透明度：0=完全透明，1=完全不透明
    // 滑块值/显示值为透明度：100=完全透明，0=完全不透明
    document.documentElement.style.setProperty('--container-opacity', String(opacity));
    const transparencyPercent = Math.round((1 - opacity) * 100);
    const bgOpacitySlider = document.getElementById('bgOpacitySlider');
    const bgOpacityValue = document.getElementById('bgOpacityValue');
    if (bgOpacitySlider) {
        bgOpacitySlider.value = String(transparencyPercent);
    }
    if (bgOpacityValue) {
        bgOpacityValue.textContent = transparencyPercent + '%';
    }
    // 更新应用卡片背景
    updateAppCardOpacityBg();
}

// ==========================================
// DOM 元素缓存
// ==========================================
const elements = {};

// ==========================================
// DOM 操作模块
// ==========================================
const dom = {
    initElements: function () {
        elements.categoriesListExpanded = document.getElementById('categoriesListExpanded');
        elements.categoriesListCollapsed = document.getElementById('categoriesListCollapsed');
        elements.currentCategoryName = document.getElementById('currentCategoryName');
        elements.appsGrid = document.getElementById('appsGrid');
        elements.totalApps = document.getElementById('totalApps');
        elements.pageInfo = document.getElementById('pageInfo');
        elements.prevPageBtn = document.getElementById('prevPageBtn');
        elements.nextPageBtn = document.getElementById('nextPageBtn');
        elements.searchInput = document.getElementById('searchInput');
        elements.searchBtn = document.getElementById('searchBtn');
        elements.addCategoryBtn = document.getElementById('addCategoryBtn');
        elements.sidebarSettingsBtn = document.getElementById('sidebarSettingsBtn');
        elements.collapseSidebarBtn = document.getElementById('collapseSidebarBtn');
        elements.gridViewBtn = document.getElementById('gridViewBtn');
        elements.listViewBtn = document.getElementById('listViewBtn');
        elements.themeToggleBtn = document.getElementById('themeToggleBtn');
    },

    get: function (id) {
        return document.getElementById(id);
    },

    safeGet: function (id) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn('DOM 元素未找到: ' + id);
        }
        return el;
    },

    showToast: function (message, duration) {
        if (duration === undefined) duration = 3000;
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        if (!toast || !toastMessage) return;

        clearTimeout(toast._timeout);
        toastMessage.textContent = message;
        toast.classList.remove('opacity-0', '-translate-y-full');
        toast.classList.add('opacity-100', 'translate-y-0');

        toast._timeout = setTimeout(function () {
            toast.classList.remove('opacity-100', 'translate-y-0');
            toast.classList.add('opacity-0', '-translate-y-full');
        }, duration);
    },

    showModal: function (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
        }
    },

    hideModal: function (modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
        }
    }
};

// ==========================================
// 向后兼容的 DOM 函数别名
// ==========================================
function initElements() {
    dom.initElements();
}

function showToast(message, duration) {
    dom.showToast(message, duration);
}

/**
 * 显示确认对话框
 * @param {string} title - 对话框标题
 * @param {string} message - 对话框消息
 * @param {Function} onConfirm - 确认回调函数
 * @param {Object} options - 可选配置项
 * @param {string} options.confirmText - 确认按钮文本，默认为"确定"
 * @param {string} options.variant - 按钮样式变体：'primary'（蓝色）或 'danger'（红色）
 */
