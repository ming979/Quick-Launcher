// 设置事件监听器
function setupEventListeners() {
    // 应用卡片事件委托
    if (elements.appsGrid) {
        elements.appsGrid.addEventListener('click', (e) => {
            // 找到点击的卡片
            const appCard = e.target.closest('.app-card');
            if (!appCard)
                return;
            const appId = appCard.dataset.appId;
            const appName = appCard.dataset.appName;
            // 如果是加号卡片（没有appId），不做任何处理，让它自己的点击事件处理
            if (!appId)
                return;
            // 点击删除按钮
            if (e.target.closest('.app-delete-btn')) {
                e.stopPropagation();
                showConfirmDialog('删除应用', `确定要删除此应用"${appName}"吗？`, () => {
                    const appToDelete = applications.find(a => String(a.id) === String(appId));
                    // 从数组中删除应用
                    const appIndex = applications.findIndex(a => String(a.id) === String(appId));
                    if (appIndex !== -1) {
                        applications.splice(appIndex, 1);
                        // 安全删除图标缓存文件（路径遍历防护）
                        if (appToDelete && appToDelete.uploadedIcon && !appToDelete.uploadedIcon.startsWith('data:')) {
                            utils.safeDeleteCachedFile(getIconCacheDir(), appToDelete.uploadedIcon);
                        }
                        // 检查当前页面是否还有应用，如果没有则返回上一页
                        const filteredApps = applications.filter(app => {
                            const matchesCategory = String(app.categoryId) === String(currentState.currentCategoryId);
                            const matchesSearch = currentState.searchQuery === '' ||
                                app.name.toLowerCase().includes(currentState.searchQuery.toLowerCase());
                            return matchesCategory && matchesSearch;
                        });
                        const totalPages = Math.ceil(filteredApps.length / currentState.itemsPerPage);
                        if (currentState.currentPage > totalPages && totalPages > 0) {
                            currentState.currentPage = totalPages;
                        }
                        else if (totalPages === 0) {
                            currentState.currentPage = 1;
                        }
                        // 保存数据
                        saveAllData();
                        // 重新渲染
                        renderApps();
                        updatePagination();
                        showToast(`已删除应用 ${appName}`);
                    }
                }, { confirmText: '删除', variant: 'danger' });
                return;
            }
            // 点击设置按钮
            if (e.target.closest('.app-settings-btn')) {
                e.stopPropagation();
                openAppSettingsModal(appId);
                return;
            }
            // 启动图标模式：仅点击 SVG 播放图标触发启动
            if (e.target.closest('.app-launch-icon')) {
                e.stopPropagation();
                const app = applications.find(a => String(a.id) === String(appId));
                if (app) {
                    launchApp(app);
                }
                return;
            }
            // 点击启动模式：仅在此模式下，点击卡片启动应用
            if (styleSettings.launchMode === 'click') {
                const app = applications.find(a => String(a.id) === String(appId));
                if (app && app.path && app.path.trim()) {
                    launchApp(app);
                }
                else {
                    showToast('请先在设置中配置应用路径');
                }
            }
            // 双击启动模式：单击不触发启动，双击在 dblclick 事件中处理
            // 启动图标模式：单击不触发启动，仅通过播放图标触发
        });
        // 双击启动模式：监听双击事件启动应用
        elements.appsGrid.addEventListener('dblclick', (e) => {
            if (styleSettings.launchMode !== 'dblclick')
                return;
            const appCard = e.target.closest('.app-card');
            if (!appCard)
                return;
            const appId = appCard.dataset.appId;
            if (!appId)
                return;
            // 不触发删除/设置/启动图标按钮
            if (e.target.closest('.app-delete-btn') || e.target.closest('.app-settings-btn') || e.target.closest('.app-launch-overlay'))
                return;
            const app = applications.find(a => String(a.id) === String(appId));
            if (app && app.path && app.path.trim()) {
                launchApp(app);
            }
            else {
                showToast('请先在设置中配置应用路径');
            }
        });
    }
    // 移除了点击背景关闭弹窗的功能，必须点击关闭按钮才能关闭
    // 添加应用名称重置按钮
    const addAppNameResetBtn = document.getElementById('addAppNameResetBtn');
    if (addAppNameResetBtn) {
        addAppNameResetBtn.addEventListener('click', () => {
            const addAppName = document.getElementById('addAppName');
            if (addAppName)
                addAppName.value = '';
        });
    }
    // 添加应用路径浏览按钮
    const addAppPathBrowseBtn = document.getElementById('addAppPathBrowseBtn');
    const addAppPath = document.getElementById('addAppPath');
    const addAppPathInput = document.getElementById('addAppPathInput');
    if (addAppPathBrowseBtn && addAppPath && addAppPathInput) {
        addAppPathBrowseBtn.addEventListener('click', async () => {
            // 如果路径有值，尝试打开
            if (addAppPath.value.trim()) {
                try {
                    window.open(addAppPath.value.trim(), '_blank');
                    showToast('已尝试打开路径');
                }
                catch (e) {
                    showToast('无法打开路径，请检查路径是否正确');
                }
            }
            else {
                try {
                    // 使用 dialog.showOpenDialog 获取可靠文件路径（替代不可靠的 web File.path）
                    const fullPath = await ipcRenderer.invoke('dialog-open-file');
                    if (!fullPath) return;
                addAppPath.value = fullPath;
                // 自动填充文件名
                const addAppName = document.getElementById('addAppName');
                if (addAppName.value.trim() === '') {
                    const fileName = path.basename(fullPath);
                    const lastDotIndex = fileName.lastIndexOf('.');
                    addAppName.value = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
                }
                // 自动获取可执行文件图标
                try {
                    const result = await ipcRenderer.invoke('get-file-icon', fullPath);
                    if (result.success && result.filePath === fullPath) {
                        const addAppIconPreview = document.getElementById('addAppIconPreview');
                        const addAppIconImage = document.getElementById('addAppIconImage');
                        if (addAppIconPreview && addAppIconImage) {
                            const iconCacheDir = getIconCacheDir();
                            const base64Data = result.iconDataUrl.replace(/^data:image\/[^;]+;base64,/, '');
                            const fileName = generateUniqueFilename('icon.png');
                            const filePath = path.join(iconCacheDir, fileName);
                            fs.writeBase64File(filePath, base64Data);
                            const fileUrl = utils.pathToFileURL(filePath);
                            addAppIconPreview.classList.add('hidden');
                            addAppIconImage.classList.remove('hidden');
                            addAppIconImage.src = fileUrl;
                            uploadedAppIcon = fileName;
                        }
                    }
                    else if (!result.success) {
                        showToast('获取图标失败: ' + result.error);
                    }
                }
                catch (error) {
                    console.error('获取应用图标失败:', error);
                    showToast('获取图标失败: ' + ((error instanceof Error) ? error.message : String(error)));
                }
                } catch (err) {
                    console.error('打开文件对话框失败:', err);
                    showToast('打开文件对话框失败');
                }
            }
        });
    }
    // 添加应用图标上传 - 点击预览区域触发文件选择
    setupIconUpload('addAppIconPreviewContainer', 'addAppIconInput', 'addAppIconPreview', 'addAppIconImage', () => uploadedAppIcon, (val) => { uploadedAppIcon = val; });
    // 应用设置图标上传
    setupIconUpload('appSettingsIconPreviewContainer', 'appSettingsIconInput', 'appSettingsIconPreview', 'appSettingsIconImage', () => appSettingsUploadedIcon, (val) => { appSettingsUploadedIcon = val; });
    // 添加应用模态框相关事件
    const closeAddAppModalBtn = document.getElementById('closeAddAppModalBtn');
    if (closeAddAppModalBtn) {
        closeAddAppModalBtn.addEventListener('click', () => {
            closeAddAppModal();
        });
    }
    const cancelAddAppBtn = document.getElementById('cancelAddAppBtn');
    if (cancelAddAppBtn) {
        cancelAddAppBtn.addEventListener('click', () => {
            closeAddAppModal();
        });
    }
    const confirmAddAppBtn = document.getElementById('confirmAddAppBtn');
    if (confirmAddAppBtn) {
        confirmAddAppBtn.addEventListener('click', () => {
            addNewApp();
        });
    }
    // 搜索功能
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            currentState.searchQuery = e.target.value;
            currentState.currentPage = 1;
            renderApps();
            updatePagination();
        });
    }
    if (elements.searchBtn) {
        elements.searchBtn.addEventListener('click', () => {
            if (elements.searchInput)
                elements.searchInput.focus();
        });
    }
    // 悬浮添加应用按钮
    const floatingAddBtn = document.getElementById('floatingAddBtn');
    if (floatingAddBtn) {
        floatingAddBtn.addEventListener('click', () => {
            openAddAppModal();
        });
    }
    // 添加分类按钮
    if (elements.addCategoryBtn) {
        elements.addCategoryBtn.addEventListener('click', () => {
            // 重置表单
            const categoryName = document.getElementById('categoryName');
            const customIconInput = document.getElementById('customIconInput');
            const addCategoryHexColor = document.getElementById('addCategoryHexColor');
            const addCategoryR = document.getElementById('addCategoryR');
            const addCategoryG = document.getElementById('addCategoryG');
            const addCategoryB = document.getElementById('addCategoryB');
            const addCategoryHexPreview = document.getElementById('addCategoryHexPreview');
            const addCategoryRgbPreview = document.getElementById('addCategoryRgbPreview');
            const addCategoryColorWheel = document.getElementById('addCategoryColorWheel');
            const addCategoryModal = document.getElementById('addCategoryModal');
            if (categoryName) {
                categoryName.value = '';
                categoryName.focus();
            }
            if (customIconInput)
                customIconInput.value = '';
            // 使用ColorManager重置颜色状态
            colorManager.resetModalState('addCategory');
            // 重置输入框
            if (addCategoryHexColor)
                addCategoryHexColor.value = '';
            if (addCategoryR)
                addCategoryR.value = '';
            if (addCategoryG)
                addCategoryG.value = '';
            if (addCategoryB)
                addCategoryB.value = '';
            if (addCategoryHexPreview)
                addCategoryHexPreview.style.backgroundColor = 'white';
            if (addCategoryRgbPreview)
                addCategoryRgbPreview.style.backgroundColor = 'white';
            if (addCategoryColorWheel)
                addCategoryColorWheel.value = '#68d391';
            // 重置选中状态
            if (addCategoryModal) {
                addCategoryModal.querySelectorAll('.color-option').forEach(el => {
                    el.classList.remove('ring-2', 'ring-offset-2');
                });
                addCategoryModal.querySelectorAll('.icon-option').forEach(el => {
                    el.classList.remove('bg-gray-200');
                });
            }
            // 设置默认选中
            selectedColor = 'bg-primary';
            selectedIcon = 'fa-th-large';
            // 显示模态框
            if (addCategoryModal)
                addCategoryModal.classList.remove('hidden');
        });
    }
    // 收起状态下的添加分类按钮
    const addCategoryBtnCollapsed = document.getElementById('addCategoryBtnCollapsed');
    if (addCategoryBtnCollapsed) {
        addCategoryBtnCollapsed.addEventListener('click', () => {
            // 触发展开状态下的添加分类按钮点击事件
            if (elements.addCategoryBtn)
                elements.addCategoryBtn.click();
        });
    }
    // 关闭模态框按钮
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            const addCategoryModal = document.getElementById('addCategoryModal');
            if (addCategoryModal)
                addCategoryModal.classList.add('hidden');
        });
    }
    // 取消按钮
    const cancelAddCategoryBtn = document.getElementById('cancelAddCategoryBtn');
    if (cancelAddCategoryBtn) {
        cancelAddCategoryBtn.addEventListener('click', () => {
            const addCategoryModal = document.getElementById('addCategoryModal');
            if (addCategoryModal)
                addCategoryModal.classList.add('hidden');
        });
    }
    // 设置模态框相关事件
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    if (closeSettingsModalBtn) {
        closeSettingsModalBtn.addEventListener('click', () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal)
                settingsModal.classList.add('hidden');
        });
    }
    const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    if (cancelSettingsBtn) {
        cancelSettingsBtn.addEventListener('click', () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal)
                settingsModal.classList.add('hidden');
        });
    }
    const confirmSettingsBtn = document.getElementById('confirmSettingsBtn');
    if (confirmSettingsBtn) {
        confirmSettingsBtn.addEventListener('click', () => {
            // 更新分类边框颜色
            updateCategorySelection();
            // 保存数据
            saveAllData();
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal)
                settingsModal.classList.add('hidden');
        });
    }
    // 背景相关按钮
    const uploadBgBtn = document.getElementById('uploadBgBtn');
    const uploadBgInput = document.getElementById('uploadBgInput');
    const bgPreview = document.getElementById('bgPreview');
    if (uploadBgBtn && uploadBgInput) {
        uploadBgBtn.addEventListener('click', () => {
            // 已有自定义背景时弹出确认弹窗
            if (currentState.backgroundImage) {
                showConfirmDialog('已有自定义背景', '上传新背景将删除现有背景，是否继续？', () => {
                    // 删除旧背景缓存文件
                    if (!currentState.backgroundImage.startsWith('data:')) {
                        utils.safeDeleteCachedFile(getBackgroundCacheDir(), currentState.backgroundImage);
                    }
                    currentState.backgroundImage = '';
                    currentState.backgroundOpacity = 1;
                    backgroundManager.applyBackgroundImage('');
                    uploadBgInput.click();
                });
            }
            else {
                uploadBgInput.click();
            }
        });
        uploadBgInput.addEventListener('change', (e) => {
            const input = e.target;
            const file = input.files?.[0];
            if (file) {
                const isVideo = isVideoFile(file.name);
                // 保存背景到本地缓存文件夹
                const bgCacheDir = getBackgroundCacheDir();
                const fileName = generateUniqueFilename(file.name);
                const filePath = path.join(bgCacheDir, fileName);
                // 读取文件并保存到缓存目录
                const reader = new FileReader();
                reader.onload = (event) => {
                    const arrayBuffer = event.target?.result;
                    fs.writeArrayBuffer(filePath, arrayBuffer);
                    // 设置全局背景（使用统一的 URL 编码）
                    const fileUrl = utils.pathToFileURL(filePath);
                    applyBackgroundImage(fileUrl, isVideo);
                    // 保存到状态（只保存文件名）
                    currentState.backgroundImage = fileName;
                    currentState.backgroundIsVideo = isVideo;
                    // 保存数据
                    saveAllData();
                    showToast('背景上传成功');
                };
                // 添加错误处理
                reader.onerror = () => showToast('读取背景文件失败');
                reader.readAsArrayBuffer(file);
            }
        });
    }
    const deleteBgBtn = document.getElementById('deleteBgBtn');
    if (deleteBgBtn) {
        deleteBgBtn.addEventListener('click', () => {
            showConfirmDialog('删除背景', '确定要删除当前自定义背景吗？', () => {
                // 安全删除背景缓存文件（路径遍历防护）
                if (currentState.backgroundImage && !currentState.backgroundImage.startsWith('data:')) {
                    utils.safeDeleteCachedFile(getBackgroundCacheDir(), currentState.backgroundImage);
                }
                currentState.backgroundImage = '';
                currentState.backgroundOpacity = 1;
                // 清除全局背景
                applyBackgroundImage('');
                // 保存数据
                saveAllData();
                showToast('背景已删除');
            }, { confirmText: '删除', variant: 'danger' });
        });
    }
    // 背景视频播放/暂停开关
    const bgVideoPlayToggle = document.getElementById('bgVideoPlayToggle');
    if (bgVideoPlayToggle) {
        bgVideoPlayToggle.addEventListener('change', () => {
            currentState.backgroundVideoPlaying = bgVideoPlayToggle.checked;
            // 更新所有视频元素的播放状态
            const allVideos = document.querySelectorAll('#bgImageContainer video, #bgPreview video');
            allVideos.forEach(video => {
                if (currentState.backgroundVideoPlaying) {
                    video.play().catch(() => { });
                }
                else {
                    video.pause();
                }
            });
            saveAllData();
        });
    }
    // 背景视频声音开关
    const bgVideoMuteToggle = document.getElementById('bgVideoMuteToggle');
    if (bgVideoMuteToggle) {
        bgVideoMuteToggle.addEventListener('change', () => {
            currentState.backgroundVideoMuted = !bgVideoMuteToggle.checked;
            // 更新所有视频元素的声音状态
            const allVideos = document.querySelectorAll('#bgImageContainer video, #bgPreview video');
            allVideos.forEach(video => {
                video.muted = currentState.backgroundVideoMuted;
            });
            saveAllData();
        });
    }
    // 配置文件相关按钮
    const selectConfigBtn = document.getElementById('selectConfigBtn');
    if (selectConfigBtn) {
        selectConfigBtn.addEventListener('click', async () => {
            // 使用 IPC 通知主进程显示文件选择对话框
            try {
                // 发送 IPC 消息并等待响应
                ipcRenderer.send('select-config-path');
                // 移除旧监听器，防止快速点击累积
                ipcRenderer.removeAllListeners('config-path-selected');
                // 监听主进程的响应
                ipcRenderer.once('config-path-selected', (_event, result) => {
                    if (!result.canceled && result.filePath) {
                        const configPathInput = document.getElementById('configPathInput');
                        if (configPathInput) {
                            configPathInput.value = result.filePath;
                            currentState.configPath = result.filePath;
                        }
                        saveAllData();
                        showToast('保存位置已选择');
                    }
                });
            }
            catch (err) {
                console.error('选择保存位置失败:', err);
                showToast('选择保存位置失败');
            }
        });
    }
    const openConfigBtn = document.getElementById('openConfigBtn');
    if (openConfigBtn) {
        openConfigBtn.addEventListener('click', async () => {
            const configPathInput = document.getElementById('configPathInput');
            let configPath = configPathInput?.value;
            // 如果没有选择路径，使用默认路径
            if (!configPath || configPath.trim() === '') {
                configPath = getDefaultConfigPath();
                configPathInput.value = configPath;
                currentState.configPath = configPath;
            }
            // 使用 shell 打开文件所在目录
            try {
                ipcRenderer.send('open-config-folder', configPath);
                showToast('正在打开配置文件目录');
            }
            catch (error) {
                console.error('打开配置目录失败:', error);
                showToast('配置文件路径：' + configPath);
            }
        });
    }
    const resetConfigBtn = document.getElementById('resetConfigBtn');
    if (resetConfigBtn) {
        resetConfigBtn.addEventListener('click', () => {
            const configPathInput = document.getElementById('configPathInput');
            if (configPathInput) {
                // 重置为默认路径
                const defaultPath = getDefaultConfigPath();
                configPathInput.value = defaultPath;
                currentState.configPath = defaultPath;
                saveAllData();
                showToast('配置路径已重置为默认值');
            }
        });
    }
    const importConfigBtn = document.getElementById('importConfigBtn');
    const importConfigInput = document.getElementById('importConfigInput');
    if (importConfigBtn && importConfigInput) {
        importConfigBtn.addEventListener('click', () => {
            importConfigInput.click();
        });
        importConfigInput.addEventListener('change', (e) => {
            const input = e.target;
            const file = input.files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const importedData = JSON.parse(event.target?.result);
                        if (!importedData || typeof importedData !== 'object') {
                            throw new Error('根节点不是对象');
                        }
                        // 白名单式结构验证，不再允许 Object.assign 覆盖任意字段
                        if (Array.isArray(importedData.categories)) {
                            const sanitized = importedData.categories
                                .filter(c => c && typeof c === 'object')
                                .map(c => ({
                                id: c.id || '',
                                name: typeof c.name === 'string' ? c.name : '',
                                icon: typeof c.icon === 'string' ? c.icon : 'fa-folder',
                                color: typeof c.color === 'string' ? c.color : '#3b82f6',
                                isDefault: !!c.isDefault
                            }));
                            categories = sanitized;
                        }
                        if (Array.isArray(importedData.applications)) {
                            const sanitized = importedData.applications
                                .filter(app => app && typeof app === 'object')
                                .map(app => ({
                                id: app.id || '',
                                name: typeof app.name === 'string' ? app.name : '未命名',
                                path: typeof app.path === 'string' ? app.path : '',
                                categoryId: app.categoryId || '',
                                icon: typeof app.icon === 'string' ? app.icon : 'fa-cube',
                                color: typeof app.color === 'string' ? app.color : '#3b82f6',
                                uploadedIcon: typeof app.uploadedIcon === 'string' ? app.uploadedIcon : '',
                                originalName: typeof app.originalName === 'string' ? app.originalName : (typeof app.name === 'string' ? app.name : '未命名'),
                                lastLaunchedAt: typeof app.lastLaunchedAt === 'number' ? app.lastLaunchedAt : null,
                                createdAt: typeof app.createdAt === 'number' ? app.createdAt : undefined,
                                description: typeof app.description === 'string' ? app.description : ''
                            }));
                            applications = sanitized;
                        }
                        if (importedData.settings && typeof importedData.settings === 'object') {
                            const allowed = ['backgroundImage', 'backgroundOpacity', 'configPath', 'borderColor'];
                            for (const key of allowed) {
                                if (importedData.settings[key] !== undefined) {
                                    currentState[key] = importedData.settings[key];
                                }
                            }
                        }
                        saveAllData();
                        renderCategories();
                        renderApps();
                        showToast('配置导入成功');
                    }
                    catch (error) {
                        showToast('配置导入失败：' + ((error instanceof Error) ? error.message : '无效的JSON文件'));
                        console.error('Import error:', error);
                    }
                };
                reader.onerror = () => showToast('读取导入文件失败');
                reader.readAsText(file);
            }
        });
    }
    const exportConfigBtn = document.getElementById('exportConfigBtn');
    if (exportConfigBtn) {
        exportConfigBtn.addEventListener('click', async () => {
            // 准备导出数据
            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                categories: categories,
                applications: applications,
                settings: {
                    backgroundImage: currentState.backgroundImage,
                    backgroundOpacity: currentState.backgroundOpacity,
                    configPath: currentState.configPath,
                    borderColor: currentState.borderColor
                }
            };
            const dataStr = JSON.stringify(exportData, null, 2);
            // 使用 IPC 通知主进程显示保存对话框
            try {
                ipcRenderer.send('export-config', dataStr);
                ipcRenderer.removeAllListeners('export-config-complete');
                ipcRenderer.once('export-config-complete', (_event, result) => {
                    if (result.success) {
                        showToast('配置导出成功');
                    }
                    else if (!result.canceled) {
                        showToast('导出失败');
                    }
                });
            }
            catch (err) {
                console.error('导出失败:', err);
                showToast('导出失败');
            }
        });
    }
    // 背景模式按钮
    const bgModeFill = document.getElementById('bgModeFill');
    const bgModeCover = document.getElementById('bgModeCover');
    const bgModeRepeat = document.getElementById('bgModeRepeat');
    const bgModeContain = document.getElementById('bgModeContain');
    const bgModeButtons = [bgModeFill, bgModeCover, bgModeRepeat, bgModeContain];
    // 重置按钮样式
    function resetBgModeButtons(activeId) {
        bgModeButtons.forEach(btn => {
            if (btn) {
                if (btn.id === activeId) {
                    btn.classList.remove('bg-gray-50', 'text-gray-700', 'border-gray-300');
                    btn.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-500');
                }
                else {
                    btn.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-500');
                    btn.classList.add('bg-gray-50', 'text-gray-700', 'border-gray-300');
                }
            }
        });
    }
    // 填充模式
    if (bgModeFill) {
        bgModeFill.addEventListener('click', () => {
            currentState.backgroundMode = 'fill';
            applyBackgroundMode('fill');
            resetBgModeButtons('bgModeFill');
            showToast('背景模式已设置为填充');
            saveAllData();
        });
    }
    // 拉伸模式
    if (bgModeCover) {
        bgModeCover.addEventListener('click', () => {
            currentState.backgroundMode = 'cover';
            applyBackgroundMode('cover');
            resetBgModeButtons('bgModeCover');
            showToast('背景模式已设置为拉伸');
            saveAllData();
        });
    }
    // 平铺模式
    if (bgModeRepeat) {
        bgModeRepeat.addEventListener('click', () => {
            currentState.backgroundMode = 'repeat';
            applyBackgroundMode('repeat');
            resetBgModeButtons('bgModeRepeat');
            showToast('背景模式已设置为平铺');
            saveAllData();
        });
    }
    // 居中模式
    if (bgModeContain) {
        bgModeContain.addEventListener('click', () => {
            currentState.backgroundMode = 'contain';
            applyBackgroundMode('contain');
            resetBgModeButtons('bgModeContain');
            showToast('背景模式已设置为居中');
            saveAllData();
        });
    }
    // 背景透明度滑块
    const bgOpacitySlider = document.getElementById('bgOpacitySlider');
    const bgOpacityValue = document.getElementById('bgOpacityValue');
    if (bgOpacitySlider) {
        bgOpacitySlider.addEventListener('input', (e) => {
            // 滑块最右=100%=完全透明，最左=0%=完全不透明
            const opacity = 1 - (parseInt(e.target.value) / 100);
            currentState.backgroundOpacity = opacity;
            applyBackgroundOpacity(opacity);
        });
        bgOpacitySlider.addEventListener('change', () => {
            // 当用户停止拖动时保存数据
            saveAllData();
        });
    }
    // 边框颜色选择
    // 预设颜色选择
    document.querySelectorAll('.border-color-option').forEach(el => {
        el.addEventListener('click', () => {
            // 移除其他选中状态
            document.querySelectorAll('.border-color-option').forEach(option => {
                option.classList.remove('ring-2', 'ring-offset-2');
            });
            // 添加当前选中状态
            el.classList.add('ring-2', 'ring-offset-2');
            // 保存选中的边框颜色
            selectedBorderColor = el.dataset.color || '';
            currentState.borderColor = el.dataset.color || '';
            customColorMode = false;
            // 更新分类边框颜色
            updateCategorySelection();
            // 保存配置
            saveAllData();
        });
    });
    // 16进制颜色输入框事件
    const hexInput2 = document.getElementById('hexInput2');
    const hexPreview = document.getElementById('hexPreview');
    if (hexInput2 && hexPreview) {
        hexInput2.addEventListener('input', function () {
            let hex = this.value.trim();
            hex = hex.replace('#', '').toUpperCase();
            if (/^[0-9A-F]{6}$/.test(hex)) {
                hexPreview.style.backgroundColor = '#' + hex.toLowerCase();
                customColorMode = true;
                currentState.borderColor = 'custom';
                document.querySelectorAll('.border-color-option').forEach(option => {
                    option.classList.remove('ring-2', 'ring-offset-2');
                });
                // 保存配置
                saveAllData();
            }
        });
    }
    // 分类设置模态框相关事件
    const closeCategorySettingsModalBtn = document.getElementById('closeCategorySettingsModalBtn');
    if (closeCategorySettingsModalBtn) {
        closeCategorySettingsModalBtn.addEventListener('click', () => {
            const categorySettingsModal = document.getElementById('categorySettingsModal');
            if (categorySettingsModal)
                categorySettingsModal.classList.add('hidden');
        });
    }
    const cancelCategorySettingsBtn = document.getElementById('cancelCategorySettingsBtn');
    if (cancelCategorySettingsBtn) {
        cancelCategorySettingsBtn.addEventListener('click', () => {
            const categorySettingsModal = document.getElementById('categorySettingsModal');
            if (categorySettingsModal)
                categorySettingsModal.classList.add('hidden');
        });
    }
    const confirmCategorySettingsBtn = document.getElementById('confirmCategorySettingsBtn');
    if (confirmCategorySettingsBtn) {
        confirmCategorySettingsBtn.addEventListener('click', () => {
            const categorySettingsName = document.getElementById('categorySettingsName');
            const categorySettingsId = document.getElementById('categorySettingsId');
            const categorySettingsCustomIcon = document.getElementById('categorySettingsCustomIcon');
            const categoryName = categorySettingsName ? categorySettingsName.value.trim() : '';
            const categoryId = categorySettingsId ? String(categorySettingsId.value) : '';
            const customIcon = categorySettingsCustomIcon ? categorySettingsCustomIcon.value.trim() : '';
            if (!categoryName) {
                showToast('请输入分类名称');
                if (categorySettingsName)
                    categorySettingsName.focus();
                return;
            }
            // 检查分类名称是否已存在（排除当前编辑的分类）
            if (categories.some(c => c.name === categoryName && c.id !== categoryId)) {
                showToast('分类名称已存在');
                if (categorySettingsName)
                    categorySettingsName.focus();
                return;
            }
            // 使用ColorManager确定最终颜色
            let finalColor = colorManager.getFinalColor('categorySettings');
            // 确定使用的图标（优先使用自定义图标）
            let finalIcon = selectedIcon;
            if (customIcon) {
                // 如果是SVG，直接使用；否则自动补全 fa- 前缀
                if (isSVG(customIcon)) {
                    finalIcon = customIcon;
                }
                else {
                    finalIcon = customIcon.startsWith('fa-') ? customIcon : 'fa-' + customIcon;
                }
            }
            // 修改分类信息
            const categoryIndex = categories.findIndex(c => String(c.id) === String(categoryId));
            if (categoryIndex !== -1) {
                categories[categoryIndex].name = categoryName;
                categories[categoryIndex].icon = finalIcon;
                categories[categoryIndex].color = finalColor; // 使用用户选择的颜色
                // 保存数据
                saveAllData();
                // 更新UI
                renderCategories(false);
                renderApps();
                updatePagination();
                // 重新填充下拉菜单
                populateAppSettingsCategories(currentState.currentCategoryId);
                populateAddAppCategories();
                // 关闭模态框
                const categorySettingsModal = document.getElementById('categorySettingsModal');
                if (categorySettingsModal)
                    categorySettingsModal.classList.add('hidden');
            }
        });
    }
    // 分类设置模态框中的图标选择
    document.querySelectorAll('#categorySettingsModal .icon-option').forEach(el => {
        const htmlEl = el;
        // 设置图标
        htmlEl.innerHTML = `<i class="fa ${htmlEl.dataset.icon}"></i>`;
        htmlEl.addEventListener('click', () => {
            // 移除其他选中状态
            document.querySelectorAll('#categorySettingsModal .icon-option').forEach(option => {
                option.classList.remove('bg-gray-200');
            });
            // 添加当前选中状态
            htmlEl.classList.add('bg-gray-200');
            // 保存选中的图标
            selectedIcon = htmlEl.dataset.icon || '';
        });
    });
    // 颜色选择
    document.querySelectorAll('.color-option').forEach(el => {
        const htmlEl = el;
        htmlEl.addEventListener('click', () => {
            // 仅在当前模态框内处理选中状态
            const parentModal = htmlEl.closest('.modal-overlay');
            const color = htmlEl.dataset.color || '';
            if (parentModal) {
                let modalType = null;
                if (parentModal.id === 'categorySettingsModal') {
                    modalType = 'categorySettings';
                }
                else if (parentModal.id === 'addCategoryModal') {
                    modalType = 'addCategory';
                }
                if (modalType) {
                    colorManager.handlePresetColorSelect(modalType, color, parentModal);
                }
                // 兼容：同时更新selectedColor
                selectedColor = color;
            }
        });
    });
    // 图标选择
    document.querySelectorAll('.icon-option').forEach(el => {
        const htmlEl = el;
        htmlEl.addEventListener('click', () => {
            // 移除其他选中状态
            document.querySelectorAll('.icon-option').forEach(option => {
                option.classList.remove('bg-gray-200');
            });
            // 添加当前选中状态
            htmlEl.classList.add('bg-gray-200');
            // 保存选中的图标
            selectedIcon = htmlEl.dataset.icon || '';
            // 清空自定义图标输入框
            const customIconInput = document.getElementById('customIconInput');
            const categorySettingsCustomIcon = document.getElementById('categorySettingsCustomIcon');
            if (customIconInput)
                customIconInput.value = '';
            if (categorySettingsCustomIcon)
                categorySettingsCustomIcon.value = '';
        });
    });
    // 自定义图标输入 - 添加分类模态框
    const customIconInput = document.getElementById('customIconInput');
    if (customIconInput) {
        customIconInput.addEventListener('input', (e) => {
            let value = e.target.value.trim();
            if (value) {
                // 处理图标
                if (isSVG(value)) {
                    selectedIcon = value;
                }
                else {
                    // 自动补全 fa- 前缀
                    let iconName = value.startsWith('fa-') ? value : 'fa-' + value;
                    selectedIcon = iconName;
                }
                // 清除所有预设图标的选中状态
                document.querySelectorAll('#addCategoryModal .icon-option').forEach(el => {
                    el.classList.remove('bg-gray-200');
                });
            }
        });
    }
    // 自定义图标输入 - 分类设置模态框
    const categorySettingsCustomIcon = document.getElementById('categorySettingsCustomIcon');
    if (categorySettingsCustomIcon) {
        categorySettingsCustomIcon.addEventListener('input', (e) => {
            let value = e.target.value.trim();
            if (value) {
                // 处理图标
                if (isSVG(value)) {
                    selectedIcon = value;
                }
                else {
                    // 自动补全 fa- 前缀
                    let iconName = value.startsWith('fa-') ? value : 'fa-' + value;
                    selectedIcon = iconName;
                }
                // 清除所有预设图标的选中状态
                document.querySelectorAll('#categorySettingsModal .icon-option').forEach(el => {
                    el.classList.remove('bg-gray-200');
                });
            }
        });
    }
    // 添加分类模态框 - 颜色输入
    const addCategoryHexColor = document.getElementById('addCategoryHexColor');
    const addCategoryHexPreview = document.getElementById('addCategoryHexPreview');
    const addCategoryHexUseBtn = document.getElementById('addCategoryHexUseBtn');
    const addCategoryR = document.getElementById('addCategoryR');
    const addCategoryG = document.getElementById('addCategoryG');
    const addCategoryB = document.getElementById('addCategoryB');
    const addCategoryRgbPreview = document.getElementById('addCategoryRgbPreview');
    const addCategoryRgbUseBtn = document.getElementById('addCategoryRgbUseBtn');
    const addCategoryColorWheel = document.getElementById('addCategoryColorWheel');
    const addCategoryModal = document.getElementById('addCategoryModal');
    // 使用ColorManager统一处理颜色输入
    colorManager.updateColorInputs('addCategory', addCategoryR, addCategoryG, addCategoryB, addCategoryRgbPreview, addCategoryColorWheel, addCategoryHexColor, addCategoryHexPreview);
    // 添加分类模态框 - 16进制使用按钮
    if (addCategoryHexUseBtn) {
        addCategoryHexUseBtn.addEventListener('click', () => {
            const hex = colorManager.handleHexColorUse('addCategory', addCategoryHexColor, addCategoryModal);
            if (hex) {
                selectedColor = hex;
            }
        });
    }
    // 添加分类模态框 - RGB使用按钮
    if (addCategoryRgbUseBtn) {
        addCategoryRgbUseBtn.addEventListener('click', () => {
            const hex = colorManager.handleRgbColorUse('addCategory', addCategoryR, addCategoryG, addCategoryB, addCategoryModal);
            if (hex) {
                selectedColor = hex;
            }
        });
    }
    // 分类设置模态框 - 颜色输入
    const categorySettingsHexColor = document.getElementById('categorySettingsHexColor');
    const categorySettingsHexPreview = document.getElementById('categorySettingsHexPreview');
    const categorySettingsHexUseBtn = document.getElementById('categorySettingsHexUseBtn');
    const categorySettingsR = document.getElementById('categorySettingsR');
    const categorySettingsG = document.getElementById('categorySettingsG');
    const categorySettingsB = document.getElementById('categorySettingsB');
    const categorySettingsRgbPreview = document.getElementById('categorySettingsRgbPreview');
    const categorySettingsRgbUseBtn = document.getElementById('categorySettingsRgbUseBtn');
    const categorySettingsColorWheel = document.getElementById('categorySettingsColorWheel');
    const categorySettingsModal2 = document.getElementById('categorySettingsModal');
    // 使用ColorManager统一处理颜色输入
    colorManager.updateColorInputs('categorySettings', categorySettingsR, categorySettingsG, categorySettingsB, categorySettingsRgbPreview, categorySettingsColorWheel, categorySettingsHexColor, categorySettingsHexPreview);
    // 分类设置模态框 - 16进制使用按钮
    if (categorySettingsHexUseBtn) {
        categorySettingsHexUseBtn.addEventListener('click', () => {
            const hex = colorManager.handleHexColorUse('categorySettings', categorySettingsHexColor, categorySettingsModal2);
            if (hex) {
                selectedColor = hex;
                // 立即应用颜色到当前分类
                const categoryIdInput = document.getElementById('categorySettingsId');
                const categoryId = categoryIdInput ? String(categoryIdInput.value) : '';
                const categoryIndex = categories.findIndex(c => String(c.id) === String(categoryId));
                if (categoryIndex !== -1) {
                    categories[categoryIndex].color = hex;
                    updateSingleCategoryColor(categoryId, hex);
                }
            }
        });
    }
    // 分类设置模态框 - RGB使用按钮
    if (categorySettingsRgbUseBtn) {
        categorySettingsRgbUseBtn.addEventListener('click', () => {
            const hex = colorManager.handleRgbColorUse('categorySettings', categorySettingsR, categorySettingsG, categorySettingsB, categorySettingsModal2);
            if (hex) {
                selectedColor = hex;
                // 立即应用颜色到当前分类
                const categoryIdInput = document.getElementById('categorySettingsId');
                const categoryId = categoryIdInput ? String(categoryIdInput.value) : '';
                const categoryIndex = categories.findIndex(c => String(c.id) === String(categoryId));
                if (categoryIndex !== -1) {
                    categories[categoryIndex].color = hex;
                    updateSingleCategoryColor(categoryId, hex);
                }
            }
        });
    }
    // 分类设置模态框 - 色轮（额外处理，因为需要立即应用颜色）
    if (categorySettingsColorWheel) {
        categorySettingsColorWheel.addEventListener('input', (e) => {
            const hex = e.target.value;
            const rgb = colorManager.hexToRgb(hex);
            if (rgb) {
                // 更新输入框
                if (categorySettingsR)
                    categorySettingsR.value = String(rgb.r);
                if (categorySettingsG)
                    categorySettingsG.value = String(rgb.g);
                if (categorySettingsB)
                    categorySettingsB.value = String(rgb.b);
                if (categorySettingsRgbPreview)
                    categorySettingsRgbPreview.style.backgroundColor = hex;
                // 更新颜色管理器状态
                colorManager.setModalState('categorySettings', {
                    selectedColor: hex,
                    useCustomColor: true,
                    customColor: hex
                });
                // 清除预设颜色选中状态
                categorySettingsModal2.querySelectorAll('.color-option').forEach(el => {
                    el.classList.remove('ring-2', 'ring-offset-2');
                });
                // 立即应用颜色到当前分类
                const categoryIdInput = document.getElementById('categorySettingsId');
                const categoryId = categoryIdInput ? String(categoryIdInput.value) : '';
                const categoryIndex = categories.findIndex(c => String(c.id) === String(categoryId));
                if (categoryIndex !== -1) {
                    categories[categoryIndex].color = hex;
                    selectedColor = hex;
                    updateSingleCategoryColor(categoryId, hex);
                }
            }
        });
    }
    // 确定添加分类按钮
    const confirmAddCategoryBtn = document.getElementById('confirmAddCategoryBtn');
    if (confirmAddCategoryBtn) {
        confirmAddCategoryBtn.addEventListener('click', () => {
            const categoryNameInput = document.getElementById('categoryName');
            const categoryName = categoryNameInput ? categoryNameInput.value.trim() : '';
            const customIcon = document.getElementById('customIconInput') ? document.getElementById('customIconInput').value.trim() : '';
            if (!categoryName) {
                showToast('请输入分类名称');
                if (categoryNameInput)
                    categoryNameInput.focus();
                return;
            }
            // 检查分类名称是否已存在
            if (categories.some(c => c.name === categoryName)) {
                showToast('分类名称已存在');
                if (categoryNameInput)
                    categoryNameInput.focus();
                return;
            }
            // 使用ColorManager确定最终颜色
            let finalColor = colorManager.getFinalColor('addCategory');
            // 确定使用的图标（优先使用自定义图标）
            let finalIcon = selectedIcon;
            if (customIcon) {
                // 如果是SVG，直接使用；否则自动补全 fa- 前缀
                if (isSVG(customIcon)) {
                    finalIcon = customIcon;
                }
                else {
                    finalIcon = customIcon.startsWith('fa-') ? customIcon : 'fa-' + customIcon;
                }
            }
            // 创建新分类
            const newCategory = {
                id: String(Date.now()), // 使用时间戳作为唯一ID（字符串类型）
                name: categoryName,
                isDefault: false,
                icon: finalIcon,
                color: finalColor
            };
            // 添加到分类列表
            categories.push(newCategory);
            // 切换到新分类
            currentState.currentCategoryId = newCategory.id;
            currentState.currentPage = 1;
            // 保存数据
            saveAllData();
            // 更新UI
            renderCategories(false);
            renderApps();
            updatePagination();
            // 重新填充下拉菜单
            populateAppSettingsCategories(currentState.currentCategoryId);
            populateAddAppCategories();
            // 关闭模态框
            const addCategoryModalEl = document.getElementById('addCategoryModal');
            if (addCategoryModalEl)
                addCategoryModalEl.classList.add('hidden');
        });
    }
    // 分页按钮
    if (elements.prevPageBtn) {
        elements.prevPageBtn.addEventListener('click', () => {
            if (currentState.currentPage > 1) {
                currentState.currentPage--;
                saveAllData();
                renderApps();
                updatePagination();
            }
        });
    }
    if (elements.nextPageBtn) {
        elements.nextPageBtn.addEventListener('click', () => {
            const filteredApps = applications.filter(app => {
                const matchesCategory = String(app.categoryId) === String(currentState.currentCategoryId);
                const matchesSearch = currentState.searchQuery === '' ||
                    app.name.toLowerCase().includes(currentState.searchQuery.toLowerCase());
                return matchesCategory && matchesSearch;
            });
            const totalPages = Math.ceil(filteredApps.length / currentState.itemsPerPage);
            if (currentState.currentPage < totalPages) {
                currentState.currentPage++;
                saveAllData();
                renderApps();
                updatePagination();
            }
        });
    }
    // 应用设置模态框相关事件
    const closeAppSettingsModalBtn = document.getElementById('closeAppSettingsModalBtn');
    if (closeAppSettingsModalBtn) {
        closeAppSettingsModalBtn.addEventListener('click', () => {
            closeAppSettingsModal();
        });
    }
    const cancelAppSettingsBtn = document.getElementById('cancelAppSettingsBtn');
    if (cancelAppSettingsBtn) {
        cancelAppSettingsBtn.addEventListener('click', () => {
            closeAppSettingsModal();
        });
    }
    const confirmAppSettingsBtn = document.getElementById('confirmAppSettingsBtn');
    if (confirmAppSettingsBtn) {
        confirmAppSettingsBtn.addEventListener('click', () => {
            saveAppSettings();
        });
    }
    const appSettingsNameResetBtn = document.getElementById('appSettingsNameResetBtn');
    if (appSettingsNameResetBtn) {
        appSettingsNameResetBtn.addEventListener('click', () => {
            if (currentEditingAppId !== null) {
                const app = applications.find(a => a.id === currentEditingAppId);
                if (app) {
                    const appSettingsName = document.getElementById('appSettingsName');
                    if (appSettingsName) {
                        appSettingsName.value = app.originalName;
                    }
                }
            }
        });
    }
    const appSettingsPathBrowseBtn = document.getElementById('appSettingsPathBrowseBtn');
    const appSettingsPath = document.getElementById('appSettingsPath');
    const appSettingsPathInput = document.getElementById('appSettingsPathInput');
    // 浏览按钮：打开文件所在文件夹
    if (appSettingsPathBrowseBtn && appSettingsPath) {
        appSettingsPathBrowseBtn.addEventListener('click', () => {
            if (appSettingsPath.value.trim()) {
                try {
                    // 使用 IPC 打开文件所在文件夹
                    ipcRenderer.send('open-app-path-folder', appSettingsPath.value.trim());
                    showToast('正在打开文件所在文件夹');
                }
                catch (e) {
                    showToast('无法打开路径，请检查路径是否正确');
                }
            }
            else {
                showToast('请先输入或选择应用路径');
            }
        });
    }
    // 修改按钮：选择新的应用文件
    const appSettingsPathChangeBtn = document.getElementById('appSettingsPathChangeBtn');
    if (appSettingsPathChangeBtn && appSettingsPathInput) {
        appSettingsPathChangeBtn.addEventListener('click', async () => {
            try {
                // 使用 dialog.showOpenDialog 获取可靠文件路径
                const fullPath = await ipcRenderer.invoke('dialog-open-file');
                if (!fullPath) return;
            appSettingsPath.value = fullPath;
            // 自动获取可执行文件图标
            try {
                const result = await ipcRenderer.invoke('get-file-icon', fullPath);
                if (result.success && result.filePath === fullPath) {
                    const appSettingsIconPreview = document.getElementById('appSettingsIconPreview');
                    const appSettingsIconImage = document.getElementById('appSettingsIconImage');
                    if (appSettingsIconPreview && appSettingsIconImage) {
                        if (appSettingsUploadedIcon && !appSettingsUploadedIcon.startsWith('data:')) {
                            utils.safeDeleteCachedFile(getIconCacheDir(), appSettingsUploadedIcon);
                        }
                        const iconCacheDir = getIconCacheDir();
                        const base64Data = result.iconDataUrl.replace(/^data:image\/[^;]+;base64,/, '');
                        const fileName = generateUniqueFilename('icon.png');
                        const filePath = path.join(iconCacheDir, fileName);
                        fs.writeBase64File(filePath, base64Data);
                        const fileUrl = utils.pathToFileURL(filePath);
                        appSettingsIconPreview.classList.add('hidden');
                        appSettingsIconImage.classList.remove('hidden');
                        appSettingsIconImage.src = fileUrl;
                        appSettingsUploadedIcon = fileName;
                    }
                }
                else if (!result.success) {
                    showToast('获取图标失败: ' + result.error);
                }
            }
            catch (error) {
                console.error('获取应用图标失败:', error);
                showToast('获取图标失败: ' + (error instanceof Error ? error.message : String(error)));
            }
            } catch (err) {
                console.error('打开文件对话框失败:', err);
                showToast('打开文件对话框失败');
            }
        });
    }
    // 主题切换按钮
    if (elements.themeToggleBtn) {
        elements.themeToggleBtn.addEventListener('click', () => {
            const sunIcon = document.getElementById('sunIcon');
            const moonIcon = document.getElementById('moonIcon');
            const isDark = document.body.classList.toggle('dark-mode');
            // 更新图标显示
            if (isDark) {
                if (sunIcon)
                    sunIcon.classList.add('hidden');
                if (moonIcon)
                    moonIcon.classList.remove('hidden');
                currentState.theme = 'dark';
            }
            else {
                if (sunIcon)
                    sunIcon.classList.remove('hidden');
                if (moonIcon)
                    moonIcon.classList.add('hidden');
                currentState.theme = 'light';
            }
            // 同步更新独立模式样式（对于设置为跟随全局的模式）
            applyStyleSettings();
            // 更新背景透明度相关的应用卡片颜色
            applyBackgroundOpacity(currentState.backgroundOpacity);
            // 保存数据
            saveAllData();
        });
    }
    // 获取额外的DOM元素
    const sidebarTopRow = document.getElementById('sidebarTopRow');
    const sidebarBottomButtons = document.getElementById('sidebarBottomButtons');
    const sidebarBottomExpanded = document.getElementById('sidebarBottomExpanded');
    const sidebarSettingsBtnCollapsed = document.getElementById('sidebarSettingsBtnCollapsed');
    const expandSidebarBtn = document.getElementById('expandSidebarBtn');
    // 收起侧边栏按钮
    if (elements.collapseSidebarBtn) {
        elements.collapseSidebarBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('aside');
            if (!sidebar)
                return;
            // 收起侧边栏 - 使用类名切换，配合CSS过渡动画
            sidebar.classList.add('sidebar-collapsed');
            // 保存收起状态
            currentState.sidebarCollapsed = true;
            saveAllData();
            // 隐藏文字内容
            document.querySelectorAll('aside span').forEach(el => {
                el.classList.add('hidden');
            });
            // 隐藏顶部按钮行、展开状态的设置区域和展开状态的分类列表
            if (sidebarTopRow)
                sidebarTopRow.classList.add('hidden');
            if (sidebarBottomExpanded)
                sidebarBottomExpanded.classList.add('hidden');
            if (elements.categoriesListExpanded)
                elements.categoriesListExpanded.classList.add('hidden');
            // 延迟显示展开按钮，配合从右往左的动画
            setTimeout(() => {
                if (expandSidebarBtn)
                    expandSidebarBtn.classList.remove('hidden');
            }, 80);
            // 等待侧边栏动画基本完成后，同步显示收起状态按钮和收起状态的分类列表
            setTimeout(() => {
                // 隐藏展开状态分割线，显示收起状态分割线
                const sidebarTopDividerExpanded = document.getElementById('sidebarTopDividerExpanded');
                const sidebarTopDividerCollapsed = document.getElementById('sidebarTopDividerCollapsed');
                if (sidebarTopDividerExpanded)
                    sidebarTopDividerExpanded.classList.add('hidden');
                if (sidebarTopDividerCollapsed)
                    sidebarTopDividerCollapsed.classList.remove('hidden');
                // 先显示收起状态的按钮区域
                if (sidebarBottomButtons)
                    sidebarBottomButtons.classList.remove('hidden');
                // 显示收起状态的分类列表（保持原状，不重新渲染）
                if (elements.categoriesListCollapsed)
                    elements.categoriesListCollapsed.classList.remove('hidden');
            }, 200);
        });
    }
    function initSettingsControls() {
        // 初始化边框颜色选择器
        const savedBorderColor = currentState.borderColor;
        document.querySelectorAll('.border-color-option').forEach(el => {
            el.classList.remove('ring-2', 'ring-offset-2');
            if (el.dataset.color === savedBorderColor) {
                el.classList.add('ring-2', 'ring-offset-2');
            }
        });
        // 更新颜色预览
        const hexPreview = document.getElementById('hexPreview');
        if (hexPreview && colorManager.borderColorMap[savedBorderColor]) {
            hexPreview.style.backgroundColor = colorManager.borderColorMap[savedBorderColor];
        }
        // 初始化背景模式按钮
        let activeBgModeId;
        switch (currentState.backgroundMode) {
            case 'fill':
                activeBgModeId = 'bgModeFill';
                break;
            case 'cover':
                activeBgModeId = 'bgModeCover';
                break;
            case 'repeat':
                activeBgModeId = 'bgModeRepeat';
                break;
            case 'contain':
                activeBgModeId = 'bgModeContain';
                break;
            default:
                activeBgModeId = 'bgModeCover';
        }
        resetBgModeButtons(activeBgModeId);
        // 初始化背景视频播放/暂停开关状态
        const bgVideoPlayToggle = document.getElementById('bgVideoPlayToggle');
        if (bgVideoPlayToggle) {
            bgVideoPlayToggle.checked = currentState.backgroundVideoPlaying !== false;
        }
        // 初始化背景视频声音开关状态（注意：checkbox为未选中=静音，选中=有声音）
        const bgVideoMuteToggle = document.getElementById('bgVideoMuteToggle');
        if (bgVideoMuteToggle) {
            bgVideoMuteToggle.checked = !currentState.backgroundVideoMuted;
        }
        // 重置到第一页
        switchSettingsPage(1);
        // 绑定分页按钮事件
        bindSettingsPageButtons();
        // 初始化样式设置控件
        initStyleSettingsControls();
    }
    // 初始化样式设置控件
    function initStyleSettingsControls() {
        // 从 currentState 同步到全局 styleSettings
        if (currentState.styleSettings) {
            styleSettings.fontMode = currentState.styleSettings.fontMode || 'follow';
            styleSettings.iconMode = currentState.styleSettings.iconMode || 'follow';
            styleSettings.borderMode = currentState.styleSettings.borderMode || 'follow';
            styleSettings.appCardBgFollowOpacity = currentState.styleSettings.appCardBgFollowOpacity !== undefined ? currentState.styleSettings.appCardBgFollowOpacity : false;
            styleSettings.descDisplayMode = currentState.styleSettings.descDisplayMode || 'show';
            styleSettings.launchMode = currentState.styleSettings.launchMode || 'click';
        }
        // 更新按钮状态
        updateStyleButtons();
        // 更新应用卡片背景跟随透明度开关
        const appCardBgFollowCheckbox = document.getElementById('appCardBgFollowOpacity');
        if (appCardBgFollowCheckbox) {
            appCardBgFollowCheckbox.checked = styleSettings.appCardBgFollowOpacity;
        }
        // 绑定事件
        bindStyleSettingEvents();
        // 应用当前样式设置
        applyStyleSettings();
    }
    // 保存样式设置（保存到 currentState 并写入 config.dat）
    function saveStyleSettings() {
        currentState.styleSettings = {
            fontMode: styleSettings.fontMode,
            iconMode: styleSettings.iconMode,
            borderMode: styleSettings.borderMode,
            appCardBgFollowOpacity: styleSettings.appCardBgFollowOpacity,
            descDisplayMode: styleSettings.descDisplayMode,
            launchMode: styleSettings.launchMode
        };
        saveAllData();
    }
    // 更新样式按钮状态
    function updateStyleButtons() {
        // 更新字体按钮
        const fontButtons = {
            follow: 'fontFollowGlobal',
            light: 'fontLightMode',
            dark: 'fontDarkMode'
        };
        updateButtonGroup(fontButtons, styleSettings.fontMode);
        // 更新图标按钮
        const iconButtons = {
            follow: 'iconFollowGlobal',
            light: 'iconLightMode',
            dark: 'iconDarkMode'
        };
        updateButtonGroup(iconButtons, styleSettings.iconMode);
        // 更新边框按钮
        const borderButtons = {
            follow: 'borderFollowGlobal',
            light: 'borderLightMode',
            dark: 'borderDarkMode'
        };
        updateButtonGroup(borderButtons, styleSettings.borderMode);
        // 更新应用描述显示按钮
        const descButtons = {
            show: 'descShowDefault',
            hideWhenEmpty: 'descHideWhenEmpty',
            hide: 'descHideDefault'
        };
        updateButtonGroup(descButtons, styleSettings.descDisplayMode);
        // 更新应用启动方式按钮
        const launchButtons = {
            click: 'launchClick',
            dblclick: 'launchDblclick',
            icon: 'launchIcon'
        };
        updateButtonGroup(launchButtons, styleSettings.launchMode);
    }
    // 更新按钮组的选中状态
    function updateButtonGroup(buttonMap, activeValue) {
        // 遍历所有按钮，移除选中状态
        Object.values(buttonMap).forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.classList.remove('style-setting-btn-active');
            }
        });
        // 给选中的按钮添加选中状态
        const activeButtonId = buttonMap[activeValue];
        if (activeButtonId) {
            const activeButton = document.getElementById(activeButtonId);
            if (activeButton) {
                activeButton.classList.add('style-setting-btn-active');
            }
        }
    }
    // 绑定样式设置事件
    function bindStyleSettingEvents() {
        // 字体模式按钮
        setupStyleButton('fontFollowGlobal', 'font', 'follow');
        setupStyleButton('fontLightMode', 'font', 'light');
        setupStyleButton('fontDarkMode', 'font', 'dark');
        // 图标模式按钮
        setupStyleButton('iconFollowGlobal', 'icon', 'follow');
        setupStyleButton('iconLightMode', 'icon', 'light');
        setupStyleButton('iconDarkMode', 'icon', 'dark');
        // 边框模式按钮
        setupStyleButton('borderFollowGlobal', 'border', 'follow');
        setupStyleButton('borderLightMode', 'border', 'light');
        setupStyleButton('borderDarkMode', 'border', 'dark');
        // 应用描述显示按钮（需要触发卡片重渲染）
        setupStyleButtonWithRender('descShowDefault', 'descDisplay', 'show');
        setupStyleButtonWithRender('descHideWhenEmpty', 'descDisplay', 'hideWhenEmpty');
        setupStyleButtonWithRender('descHideDefault', 'descDisplay', 'hide');
        // 应用启动方式按钮（需要触发卡片重渲染，以切换播放图标/双击监听）
        setupStyleButtonWithRender('launchClick', 'launch', 'click');
        setupStyleButtonWithRender('launchDblclick', 'launch', 'dblclick');
        setupStyleButtonWithRender('launchIcon', 'launch', 'icon');
        // 应用卡片背景跟随透明度开关（事件绑定在 initApp 中统一处理，避免重复绑定）
    }
    // 设置单个样式按钮
    function setupStyleButton(buttonId, settingType, value) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.onclick = () => {
                // 更新设置
                styleSettings[settingType + 'Mode'] = value;
                // 更新按钮状态
                updateStyleButtons();
                // 应用样式
                applyStyleSettings();
                // 保存设置
                saveStyleSettings();
            };
        }
    }
    // 设置样式按钮（含卡片重渲染，用于描述显示等需要刷新卡片的设置）
    function setupStyleButtonWithRender(buttonId, settingType, value) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.onclick = () => {
                // 更新设置
                styleSettings[settingType + 'Mode'] = value;
                // 更新按钮状态
                updateStyleButtons();
                // 应用样式
                applyStyleSettings();
                // 保存设置
                saveStyleSettings();
                // 重新渲染卡片以反映更改
                renderApps();
                updatePagination();
            };
        }
    }
    // 设置按钮事件
    if (elements.sidebarSettingsBtn) {
        elements.sidebarSettingsBtn.addEventListener('click', () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                initSettingsPath();
                initSettingsControls();
                settingsModal.classList.remove('hidden');
            }
        });
    }
    // 收起状态下的设置按钮事件
    if (sidebarSettingsBtnCollapsed) {
        sidebarSettingsBtnCollapsed.addEventListener('click', () => {
            const settingsModal = document.getElementById('settingsModal');
            if (settingsModal) {
                initSettingsPath();
                initSettingsControls();
                settingsModal.classList.remove('hidden');
            }
        });
    }
    // 绑定设置弹窗分页按钮事件
    function bindSettingsPageButtons() {
        const page1Btn = document.getElementById('settingsPage1Btn');
        const page2Btn = document.getElementById('settingsPage2Btn');
        // 直接设置onclick属性，避免重复绑定
        if (page1Btn) {
            page1Btn.onclick = function (e) {
                e.preventDefault();
                switchSettingsPage(1);
            };
        }
        if (page2Btn) {
            page2Btn.onclick = function (e) {
                e.preventDefault();
                switchSettingsPage(2);
            };
        }
    }
    // 展开侧边栏按钮
    if (expandSidebarBtn) {
        expandSidebarBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('aside');
            if (!sidebar)
                return;
            // 移除收起类，通过CSS控制显示样式
            sidebar.classList.remove('sidebar-collapsed');
            // 保存展开状态
            currentState.sidebarCollapsed = false;
            saveAllData();
            // 显示文字内容
            document.querySelectorAll('aside span').forEach(el => {
                el.classList.remove('hidden');
            });
            // 隐藏展开按钮、收起状态的底部按钮和收起状态的分类列表
            if (expandSidebarBtn)
                expandSidebarBtn.classList.add('hidden');
            if (sidebarBottomButtons)
                sidebarBottomButtons.classList.add('hidden');
            if (elements.categoriesListCollapsed)
                elements.categoriesListCollapsed.classList.add('hidden');
            // 立即隐藏收起状态的分割线，避免和展开状态的分割线重叠
            const sidebarTopDividerCollapsed = document.getElementById('sidebarTopDividerCollapsed');
            if (sidebarTopDividerCollapsed)
                sidebarTopDividerCollapsed.classList.add('hidden');
            // 80ms时显示收起按钮和展开状态的分割线
            setTimeout(() => {
                if (sidebarTopRow)
                    sidebarTopRow.classList.remove('hidden');
                // 确保展开状态的分割线也显示（移除可能存在的hidden类）
                const sidebarTopDividerExpanded = document.getElementById('sidebarTopDividerExpanded');
                if (sidebarTopDividerExpanded)
                    sidebarTopDividerExpanded.classList.remove('hidden');
            }, 80);
            // 200ms时显示展开状态的按钮和分类列表
            setTimeout(() => {
                if (sidebarBottomExpanded)
                    sidebarBottomExpanded.classList.remove('hidden');
                // 显示展开状态的分类列表（保持原状，不重新渲染）
                if (elements.categoriesListExpanded)
                    elements.categoriesListExpanded.classList.remove('hidden');
            }, 200);
        });
    }
    // 视图切换按钮（保留元素，无额外功能）
    if (elements.gridViewBtn) {
        elements.gridViewBtn.addEventListener('click', () => {
            showToast('已切换为网格视图');
        });
    }
    if (elements.listViewBtn) {
        elements.listViewBtn.addEventListener('click', () => {
            showToast('列表视图开发中');
        });
    }
}
// 初始化主题
function initTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const sunIcon = document.getElementById('sunIcon');
    const moonIcon = document.getElementById('moonIcon');
    // 优先使用配置文件中的主题设置，其次系统偏好
    let isDark = false;
    if (currentState.theme === 'dark') {
        isDark = true;
    }
    else if (currentState.theme === 'light') {
        isDark = false;
    }
    else {
        isDark = prefersDark;
    }
    if (isDark) {
        document.body.classList.add('dark-mode');
        if (sunIcon)
            sunIcon.classList.add('hidden');
        if (moonIcon)
            moonIcon.classList.remove('hidden');
    }
    else {
        document.body.classList.remove('dark-mode');
        if (sunIcon)
            sunIcon.classList.remove('hidden');
        if (moonIcon)
            moonIcon.classList.add('hidden');
    }
}
// 获取默认配置文件路径
function getDefaultConfigPath() {
    let appData = api.process.env.APPDATA;
    if (!appData) {
        const userProfile = api.process.env.USERPROFILE;
        if (userProfile) {
            appData = path.join(userProfile, 'AppData', 'Roaming');
        }
        else {
            // 使用 api.__dirname（应用所在的固定目录）代替 process.cwd()（启动目录，不可预测）
            appData = path.join(api.__dirname, 'userData');
        }
    }
    return path.join(appData, 'Quick Launch Program', 'config.dat');
}
// 获取缓存目录路径
function getCacheDir() {
    let cacheDir;
    // 优先使用主进程通过环境变量传递的 userData 路径
    if (api.process.env.USER_DATA_PATH) {
        cacheDir = api.process.env.USER_DATA_PATH;
    }
    else {
        // 降级方案：从 resources/app/ 向上三级到 portable_app/data/
        cacheDir = path.join(api.__dirname, '..', '..', '..', 'data');
    }
    try {
        // 确保缓存目录存在
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        return cacheDir;
    }
    catch (e) {
        console.error('获取缓存目录失败:', e);
        return '';
    }
}
// 获取背景缓存目录
function getBackgroundCacheDir() {
    const cacheDir = getCacheDir();
    if (!cacheDir)
        return '';
    const bgDir = path.join(cacheDir, 'backgrounds');
    if (!fs.existsSync(bgDir)) {
        fs.mkdirSync(bgDir, { recursive: true });
    }
    return bgDir;
}
// 获取图标缓存目录
function getIconCacheDir() {
    const cacheDir = getCacheDir();
    if (!cacheDir)
        return '';
    const iconDir = path.join(cacheDir, 'icons');
    if (!fs.existsSync(iconDir)) {
        fs.mkdirSync(iconDir, { recursive: true });
    }
    return iconDir;
}
// 生成唯一文件名
// 正确处理文件名扩展名
// 原代码中 "README" 会变成 "timestamp.README"（把整个文件名当扩展名）
// 现在只在文件名确实包含点分隔的扩展名时才附加扩展名
function generateUniqueFilename(originalName) {
    let ext = '';
    if (originalName && originalName.includes('.')) {
        ext = originalName.split('.').pop() || '';
        // 只接受纯字母数字扩展名（长度 1-5），避免异常
        if (!/^[a-zA-Z0-9]{1,5}$/.test(ext)) {
            ext = '';
        }
    }
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    return ext ? `${base}.${ext}` : base;
}
// 配置文件格式版本
const CONFIG_VERSION = CONFIG_CURRENT_VERSION; // 统一使用顶部定义的常量
// 保存所有数据到配置文件（MessagePack 格式）
// saveAllData 改为异步写入 + 防抖，避免频繁阻塞主线程
let _saveAllDataTimer = null;
function saveAllData() {
    if (_saveAllDataTimer) {
        clearTimeout(_saveAllDataTimer);
    }
    _saveAllDataTimer = setTimeout(() => {
        _doSaveAllData();
    }, SAVE_DATA_DEBOUNCE_MS); // 200ms 防抖
}
// 立即同步写入一次（用于关闭窗口等关键场景）
function saveAllDataNow() {
    if (_saveAllDataTimer) {
        clearTimeout(_saveAllDataTimer);
        _saveAllDataTimer = null;
    }
    _doSaveAllData();
}
function _doSaveAllData() {
    const dataToSave = {
        v: CONFIG_VERSION,
        c: categories,
        a: applications,
        s: currentState,
        t: Date.now()
    };
    try {
        const configPath = currentState.configPath || getDefaultConfigPath();
        // 确保目录存在
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        // 使用 MessagePack 格式 —— 同步写入确保数据不丢失
        // 先写入临时文件，再原子替换，防止写入中断导致数据损坏
        let buffer;
        if (msgpackr) {
            buffer = msgpackr.pack(dataToSave);
        }
        else {
            // msgpackr 不可用时降级为 JSON
            buffer = api.Buffer.from(JSON.stringify(dataToSave), 'utf-8');
            if (!__msgpackrFallbackToastShown && typeof showToast === 'function') {
                showToast('已使用 JSON 格式保存配置');
                __msgpackrFallbackToastShown = true;
            }
        }
        const tmpPath = configPath + '.tmp';
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, configPath);
    }
    catch (e) {
        console.error('保存数据失败:', e);
        if (typeof showToast === 'function') {
            showToast('保存数据失败: ' + (e instanceof Error ? e.message : String(e)));
        }
    }
}
// 初始化侧边栏状态
function initSidebar() {
    const sidebar = document.querySelector('aside');
    const sidebarTopRow = document.getElementById('sidebarTopRow');
    const sidebarBottomButtons = document.getElementById('sidebarBottomButtons');
    const sidebarBottomExpanded = document.getElementById('sidebarBottomExpanded');
    const expandSidebarBtn = document.getElementById('expandSidebarBtn');
    const sidebarTopDividerCollapsed = document.getElementById('sidebarTopDividerCollapsed');
    const sidebarTopDividerExpanded = document.getElementById('sidebarTopDividerExpanded');
    // 获取分类列表元素（使用 dom.elements）
    const categoriesListExpanded = elements.categoriesListExpanded;
    const categoriesListCollapsed = elements.categoriesListCollapsed;
    if (currentState.sidebarCollapsed) {
        // 收起状态
        if (sidebar) {
            sidebar.classList.add('sidebar-collapsed');
        }
        if (sidebarTopRow)
            sidebarTopRow.classList.add('hidden');
        if (sidebarBottomExpanded)
            sidebarBottomExpanded.classList.add('hidden');
        if (sidebarBottomButtons)
            sidebarBottomButtons.classList.remove('hidden');
        if (expandSidebarBtn)
            expandSidebarBtn.classList.remove('hidden');
        if (categoriesListExpanded)
            categoriesListExpanded.classList.add('hidden');
        if (categoriesListCollapsed)
            categoriesListCollapsed.classList.remove('hidden');
        if (sidebarTopDividerExpanded)
            sidebarTopDividerExpanded.classList.add('hidden');
        if (sidebarTopDividerCollapsed)
            sidebarTopDividerCollapsed.classList.remove('hidden');
        // 隐藏文字内容
        document.querySelectorAll('aside span').forEach(el => {
            el.classList.add('hidden');
        });
    }
    else {
        // 展开状态
        if (sidebar)
            sidebar.classList.remove('sidebar-collapsed');
        if (sidebarTopRow)
            sidebarTopRow.classList.remove('hidden');
        if (sidebarBottomExpanded)
            sidebarBottomExpanded.classList.remove('hidden');
        if (sidebarBottomButtons)
            sidebarBottomButtons.classList.add('hidden');
        if (expandSidebarBtn)
            expandSidebarBtn.classList.add('hidden');
        if (categoriesListExpanded)
            categoriesListExpanded.classList.remove('hidden');
        if (categoriesListCollapsed)
            categoriesListCollapsed.classList.add('hidden');
        if (sidebarTopDividerCollapsed)
            sidebarTopDividerCollapsed.classList.add('hidden');
        if (sidebarTopDividerExpanded)
            sidebarTopDividerExpanded.classList.remove('hidden');
        // 显示文字内容
        document.querySelectorAll('aside span').forEach(el => {
            el.classList.remove('hidden');
        });
    }
}
// 初始化应用
function initApp() {
    // 初始化 DOM 元素引用
    initElements();
    // 初始化每页显示的项目数（根据窗口大小）
    currentState.itemsPerPage = calculateItemsPerPage();
    // 设置事件监听器
    setupEventListeners();
    // 异步加载数据，避免阻塞UI
    loadAllDataAsync().then(() => {
        // 数据加载完成后初始化所有UI状态
        initTheme(); // 初始化主题
        initSidebar(); // 初始化侧边栏状态
        selectedBorderColor = currentState.borderColor; // 初始化边框颜色
        // 从 currentState 同步样式设置到全局 styleSettings
        if (currentState.styleSettings) {
            styleSettings.fontMode = currentState.styleSettings.fontMode || 'follow';
            styleSettings.iconMode = currentState.styleSettings.iconMode || 'follow';
            styleSettings.borderMode = currentState.styleSettings.borderMode || 'follow';
            styleSettings.appCardBgFollowOpacity = currentState.styleSettings.appCardBgFollowOpacity !== undefined ? currentState.styleSettings.appCardBgFollowOpacity : false;
            styleSettings.descDisplayMode = currentState.styleSettings.descDisplayMode || 'show';
            styleSettings.launchMode = currentState.styleSettings.launchMode || 'click';
        }
        // 同步跟随开关 checkbox 到 DOM 状态（JS 状态为权威来源），并绑定事件
        // 这一步必须在 applyStyleSettings 之前完成，确保初始化时开关与 JS 状态一致
        const initCheckbox = document.getElementById('appCardBgFollowOpacity');
        if (initCheckbox) {
            initCheckbox.checked = !!styleSettings.appCardBgFollowOpacity;
            initCheckbox.onchange = (e) => {
                styleSettings.appCardBgFollowOpacity = e.target.checked;
                applyStyleSettings();
                currentState.styleSettings = {
                    fontMode: styleSettings.fontMode,
                    iconMode: styleSettings.iconMode,
                    borderMode: styleSettings.borderMode,
                    appCardBgFollowOpacity: styleSettings.appCardBgFollowOpacity,
                    descDisplayMode: styleSettings.descDisplayMode,
                    launchMode: styleSettings.launchMode
                };
                saveAllData();
            };
        }
        // 应用样式设置
        applyStyleSettings();
        applyBackgroundOpacity(currentState.backgroundOpacity); // 应用背景透明度
        // 确保背景模式样式已设置（即使没有背景图片）
        applyBackgroundMode(currentState.backgroundMode);
        // 渲染内容
        renderCategories();
        renderApps();
        updatePagination();
        // 延迟加载背景图片/视频
        if (currentState.backgroundImage) {
            // 检查是否有上次加载失败的记录，自动触发重试
            if (currentState.backgroundLoadFailed) {
                console.log('检测到上次背景加载失败，自动重试加载原背景资源...');
            }
            let bgImagePath = currentState.backgroundImage;
            // 如果不是 DataURL，从缓存文件夹加载
            if (!bgImagePath.startsWith('data:') && !bgImagePath.startsWith('file://')) {
                const bgCacheDir = getBackgroundCacheDir();
                const filePath = path.join(bgCacheDir, bgImagePath);
                // 检查文件是否存在
                if (!fs.existsSync(filePath)) {
                    console.warn('背景文件不存在', filePath);
                    if (currentState.backgroundLoadFailed) {
                        // 上次已尝试加载失败，文件确实不存在，清除引用
                        currentState.backgroundImage = '';
                        currentState.backgroundIsVideo = false;
                        currentState.backgroundLoadFailed = false;
                    }
                    else {
                        // 首次发现文件不存在，仍尝试加载，由 lazyLoad 触发失败标记
                        let normalizedPath = filePath.replace(/\\/g, '/');
                        if (!normalizedPath.startsWith('/')) {
                            normalizedPath = '/' + normalizedPath;
                        }
                        bgImagePath = `file://${encodeURI(normalizedPath).replace(/#/g, '%23')}`;
                    }
                }
                else {
                    // 将路径转为 URL 格式，正确处理 Windows 路径
                    let normalizedPath = filePath.replace(/\\/g, '/');
                    // 确保是绝对路径
                    if (!normalizedPath.startsWith('/')) {
                        normalizedPath = '/' + normalizedPath;
                    }
                    // 处理 file:// URL（Windows 下需要三个斜杠）
                    bgImagePath = `file://${encodeURI(normalizedPath).replace(/#/g, '%23')}`;
                }
            }
            else if (!bgImagePath.startsWith('data:') && bgImagePath.startsWith('file:')) {
                // 已经是 file:// 协议的 URL，检查文件是否存在
                try {
                    const filePath = decodeURI(bgImagePath.replace(/^file:\/\/\//, '').replace(/^file:\/\//, ''));
                    if (!fs.existsSync(filePath)) {
                        console.warn('背景文件不存在', filePath);
                        if (currentState.backgroundLoadFailed) {
                            // 上次已尝试加载失败，文件确实不存在，清除引用
                            currentState.backgroundImage = '';
                            currentState.backgroundIsVideo = false;
                            currentState.backgroundLoadFailed = false;
                            bgImagePath = '';
                        }
                        // 首次发现缺失：保留 bgImagePath，让 lazyLoad 触发失败标记
                    }
                }
                catch (e) {
                    console.error('检查背景文件失败', e);
                }
            }
            if (bgImagePath) {
                applyBackgroundImage(bgImagePath, currentState.backgroundIsVideo);
            }
        }
    }).catch((error) => {
        console.error('异步加载数据失败:', error);
        // 即使加载失败也要初始化默认UI
        initTheme();
        initSidebar();
        selectedBorderColor = currentState.borderColor;
        applyBackgroundOpacity(currentState.backgroundOpacity);
        // 确保背景模式样式已设置
        applyBackgroundMode(currentState.backgroundMode);
        renderCategories();
        renderApps();
        updatePagination();
    });
    // 监听容器大小变化 - 使用 ResizeObserver + window.resize 双重保障
    currentState.resizeTimeout = null;
    // 统一的尺寸变化处理（防抖）
    const handleSizeChange = () => {
        if (currentState.resizeTimeout) {
            clearTimeout(currentState.resizeTimeout);
        }
        currentState.resizeTimeout = setTimeout(updateItemsPerPage, RESIZE_DEBOUNCE_MS);
    };
    // 1. ResizeObserver: 监测 #appsGrid 容器自身尺寸变化
    //    比 window.resize 更精确，可捕捉侧边栏折叠、模态框等引起的布局变化
    if (elements.appsGrid && typeof ResizeObserver !== 'undefined') {
        currentState.gridResizeObserver = new ResizeObserver(() => {
            handleSizeChange();
        });
        currentState.gridResizeObserver.observe(elements.appsGrid);
    }
    // 2. window.resize: 兼容浏览器窗口缩放场景
    currentState.resizeHandler = handleSizeChange;
    window.addEventListener('resize', currentState.resizeHandler);
    // 页面卸载时清理资源并同步保存数据
    window.addEventListener('beforeunload', () => {
        if (currentState.resizeHandler) {
            window.removeEventListener('resize', currentState.resizeHandler);
        }
        if (currentState.gridResizeObserver) {
            currentState.gridResizeObserver.disconnect();
        }
        if (currentState.resizeTimeout) {
            clearTimeout(currentState.resizeTimeout);
        }
        // 确保数据在窗口关闭前同步写入
        saveAllDataNow();
    });
}
// 异步加载所有数据
function loadAllDataAsync() {
    return new Promise((resolve, reject) => {
        try {
            const fsSync = fs;
            const fsPromises = fs.promises;
            let configPath = currentState.configPath || getDefaultConfigPath();
            // 首先尝试读取 .dat 文件
            fsPromises.access(configPath, fsSync.constants.F_OK)
                .then(() => fsPromises.readFile(configPath))
                .then((buffer) => {
                let data;
                if (msgpackr) {
                    data = msgpackr.unpack(buffer);
                }
                else {
                    // msgpackr 不可用时尝试 JSON 解析
                    data = JSON.parse(buffer.toString('utf-8'));
                    if (!__msgpackrFallbackToastShown && typeof showToast === 'function') {
                        showToast('已使用 JSON 格式读取配置');
                        __msgpackrFallbackToastShown = true;
                    }
                }
                processLoadedData(data);
                resolve(true);
            })
                .catch((err) => {
                // 如果 .dat 不存在或解析失败，尝试读取 .json 文件
                const jsonPath = configPath.replace(/\.dat$/i, '.json');
                return fsPromises.access(jsonPath, fsSync.constants.F_OK)
                    .then(() => fsPromises.readFile(jsonPath, 'utf-8'))
                    .then((jsonStr) => {
                    const data = JSON.parse(jsonStr);
                    processLoadedData(convertOldFormatToNew(data));
                    // 自动保存为新格式
                    saveAllData();
                    showToast('已自动将旧配置转换为新格式');
                    resolve(true);
                })
                    .catch((jsonErr) => {
                    if (jsonErr.code === 'ENOENT') {
                        resolve(false);
                    }
                    else {
                        reject(jsonErr);
                    }
                });
            });
        }
        catch (e) {
            reject(e);
        }
    });
}
// 将旧格式数据转换为新格式
function convertOldFormatToNew(oldData) {
    // 检查是否已经是新格式
    if (oldData.v || (oldData.c !== undefined && oldData.a !== undefined)) {
        return oldData;
    }
    // 转换旧格式到新格式
    return {
        v: CONFIG_VERSION,
        c: oldData.categories || [],
        a: oldData.applications || [],
        s: (oldData.settings || {}),
        t: Date.now()
    };
}
// 处理加载的数据（抽取为独立函数）
function processLoadedData(data) {
    // 加载分类数据
    if (data.c && data.c.length > 0) {
        categories = data.c;
    }
    // 加载应用数据
    if (data.a) {
        applications = data.a;
    }
    // 加载设置数据（使用白名单字段过滤，防止意外属性覆盖）
    if (data.s) {
        const allowedKeys = [
            'currentCategoryId', 'searchQuery', 'currentPage', 'itemsPerPage',
            'backgroundImage', 'backgroundOpacity', 'backgroundMode',
            'backgroundIsVideo', 'backgroundVideoPlaying', 'backgroundVideoMuted',
            'backgroundLoadFailed', 'configPath', 'borderColor', 'sidebarCollapsed', 'theme', 'styleSettings'
        ];
        for (const key of allowedKeys) {
            if (data.s[key] !== undefined) {
                currentState[key] = data.s[key];
            }
        }
        // 更新边框颜色（设置可能已改变）
        selectedBorderColor = currentState.borderColor;
        // 确保 styleSettings 有完整的默认值（处理旧配置文件可能缺少新字段的情况）
        if (!currentState.styleSettings) {
            currentState.styleSettings = {};
        }
        currentState.styleSettings.fontMode = currentState.styleSettings.fontMode || 'follow';
        currentState.styleSettings.iconMode = currentState.styleSettings.iconMode || 'follow';
        currentState.styleSettings.borderMode = currentState.styleSettings.borderMode || 'follow';
        currentState.styleSettings.appCardBgFollowOpacity = currentState.styleSettings.appCardBgFollowOpacity !== undefined ? currentState.styleSettings.appCardBgFollowOpacity : false;
        currentState.styleSettings.descDisplayMode = currentState.styleSettings.descDisplayMode || 'show';
        currentState.styleSettings.launchMode = currentState.styleSettings.launchMode || 'click';
        // 确保背景视频开关有默认值（处理旧配置文件可能缺少新字段的情况）
        if (currentState.backgroundVideoPlaying === undefined) {
            currentState.backgroundVideoPlaying = true;
        }
        if (currentState.backgroundVideoMuted === undefined) {
            currentState.backgroundVideoMuted = true;
        }
    }
    // 自动将旧的 DataURL 格式的图标转换为文件保存（延迟执行避免阻塞 UI 渲染）
    setTimeout(() => {
        let hasMoved = false;
        const iconCacheDir = getIconCacheDir();
        const bgCacheDir = getBackgroundCacheDir();
        applications.forEach(app => {
            if (app.uploadedIcon && app.uploadedIcon.startsWith('data:')) {
                try {
                    const base64Data = app.uploadedIcon.replace(/^data:image\/[^;]+;base64,/, '');
                    const fileName = generateUniqueFilename('icon.png');
                    const filePath = path.join(iconCacheDir, fileName);
                    fs.writeBase64File(filePath, base64Data);
                    app.uploadedIcon = fileName;
                    hasMoved = true;
                }
                catch (e) {
                    console.error('转换图标失败:', app.name, e);
                }
            }
        });
        if (currentState.backgroundImage && currentState.backgroundImage.startsWith('data:')) {
            try {
                const dataUrl = currentState.backgroundImage;
                const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
                if (match) {
                    const mime = match[1];
                    const base64Data = match[2];
                    let ext = 'png';
                    if (mime.includes('jpeg') || mime.includes('jpg'))
                        ext = 'jpg';
                    else if (mime.includes('webp'))
                        ext = 'webp';
                    else if (mime.includes('gif'))
                        ext = 'gif';
                    else if (mime.includes('mp4'))
                        ext = 'mp4';
                    else if (mime.includes('webm'))
                        ext = 'webm';
                    const fileName = generateUniqueFilename(`background.${ext}`);
                    const filePath = path.join(bgCacheDir, fileName);
                    fs.writeBase64File(filePath, base64Data);
                    currentState.backgroundImage = fileName;
                    hasMoved = true;
                }
            }
            catch (e) {
                console.error('转换背景失败:', e);
            }
        }
        if (hasMoved) {
            saveAllData();
            showToast('已自动将旧数据转换为新格式');
        }
    }, 0);
}
// 初始化应用
document.addEventListener('DOMContentLoaded', initApp);