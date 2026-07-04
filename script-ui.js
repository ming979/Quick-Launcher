function showConfirmDialog(title, message, onConfirm, options = {}) {
    const confirmText = options.confirmText || '确定';
    const variant = options.variant || 'primary'; // 'primary' (蓝色) 或 'danger' (红色)

    // 复用单例弹窗，避免重复创建DOM
    let overlay = document.getElementById('confirmDialog');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirmDialog';
        overlay.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[30]';
        overlay.innerHTML = `
            <div class="confirm-dialog-box">
                <div class="confirm-dialog-body">
                    <div class="confirm-dialog-text">
                        <h3 class="confirm-dialog-title" id="confirmDialogTitle"></h3>
                        <p class="confirm-dialog-message" id="confirmDialogMessage"></p>
                    </div>
                </div>
                <div class="confirm-dialog-actions">
                    <button class="confirm-dialog-ok" id="confirmDialogOkBtn"></button>
                    <button class="confirm-dialog-cancel" id="confirmDialogCancelBtn">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#confirmDialogCancelBtn').addEventListener('click', () => {
            overlay.classList.add('hidden');
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    }

    // 更新弹窗内容
    overlay.querySelector('#confirmDialogTitle').textContent = title;
    overlay.querySelector('#confirmDialogMessage').textContent = message;
    const okBtn = overlay.querySelector('#confirmDialogOkBtn');
    okBtn.textContent = confirmText;
    okBtn.className = 'confirm-dialog-ok' + (variant === 'danger' ? ' confirm-dialog-ok-danger' : '');
    // 替换确认按钮事件（移除旧监听器，添加新监听器）
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    newOkBtn.addEventListener('click', () => {
        overlay.classList.add('hidden');
        if (typeof onConfirm === 'function') onConfirm();
    });

    overlay.classList.remove('hidden');
}
// 辅助函数：判断是否是SVG
function isSVG(str) {
    if (!str || typeof str !== 'string')
        return false;
    return str.trim().startsWith('<svg') || str.trim().startsWith('<SVG');
}
// 获取并清理分类图标，避免 SVG XSS
function getSafeCategoryIconHtml(categoryIcon) {
    if (isSVG(categoryIcon)) {
        return utils.sanitizeSvg(categoryIcon) || '';
    }
    return categoryIcon;
}
// 打开分类设置模态框
function openCategorySettingsModal(category) {
    const modalTitle = document.getElementById('categorySettingsModalTitle');
    const categoryNameInput = document.getElementById('categorySettingsName');
    const categorySettingsCustomIcon = document.getElementById('categorySettingsCustomIcon');
    const categorySettingsModal = document.getElementById('categorySettingsModal');
    if (!modalTitle || !categoryNameInput)
        return;
    modalTitle.textContent = '分类设置';
    categoryNameInput.value = category.name;
    if (categorySettingsCustomIcon)
        categorySettingsCustomIcon.value = '';
    // 使用ColorManager初始化颜色状态
    const colorElements = {
        hexInput: document.getElementById('categorySettingsHexColor'),
        hexPreview: document.getElementById('categorySettingsHexPreview'),
        r: document.getElementById('categorySettingsR'),
        g: document.getElementById('categorySettingsG'),
        b: document.getElementById('categorySettingsB'),
        rgbPreview: document.getElementById('categorySettingsRgbPreview'),
        colorWheel: document.getElementById('categorySettingsColorWheel')
    };
    colorManager.initModalFromCategory('categorySettings', category, colorElements);
    categoryNameInput.focus();
    // 重置选中状态- 分类颜色
    const isCustomColor = colorManager.isCustomHexColor(category.color);
    document.querySelectorAll('#categorySettingsModal .color-option').forEach(el => {
        el.classList.remove('ring-2', 'ring-offset-2');
        // 如果是当前分类的颜色，选中它
        if (!isCustomColor && el.dataset.color === category.color) {
            el.classList.add('ring-2', 'ring-offset-2');
        }
    });
    document.querySelectorAll('#categorySettingsModal .icon-option').forEach(el => {
        el.classList.remove('bg-gray-200');
        // 如果是当前分类的图标，选中它
        if (el.dataset.icon === category.icon) {
            el.classList.add('bg-gray-200');
        }
    });
    // 设置当前选中的值
    selectedColor = category.color;
    selectedIcon = category.icon;
    const categorySettingsId = document.getElementById('categorySettingsId');
    if (categorySettingsId)
        categorySettingsId.value = category.id;
    if (categorySettingsModal)
        categorySettingsModal.classList.remove('hidden');
}
// 获取当前全局边框颜色
function getGlobalBorderColor() {
    let globalBorderColor = DEFAULT_SELECTED_BORDER_COLOR;
    const hexInput2 = document.getElementById('hexInput2');
    if (customColorMode && hexInput2) {
        let hex = hexInput2.value.trim();
        if (hex) {
            const normalized = colorManager.normalizeHex(hex);
            if (normalized) {
                globalBorderColor = normalized;
            }
        }
    }
    else {
        if (colorManager.borderColorMap[selectedBorderColor]) {
            globalBorderColor = colorManager.borderColorMap[selectedBorderColor];
        }
    }
    return globalBorderColor;
}
// 更新分类选中状态（不重新渲染整个列表）
function updateCategorySelection() {
    if (!elements.categoriesListExpanded && !elements.categoriesListCollapsed)
        return;
    const globalBorderColor = getGlobalBorderColor();
    const defaultBorder = '#d1d5db';
    // 更新展开状态分类按钮的边框颜色
    if (elements.categoriesListExpanded) {
        const categoryItemsExpanded = elements.categoriesListExpanded.children;
        for (let i = 0; i < categoryItemsExpanded.length; i++) {
            const el = categoryItemsExpanded[i];
            const categoryId = el.dataset.categoryId;
            const finalBorder = String(categoryId) === String(currentState.currentCategoryId) ? globalBorderColor : defaultBorder;
            el.style.borderColor = finalBorder;
            el.style.setProperty('border-color', finalBorder, 'important');
        }
    }
    // 更新收起状态分类按钮的边框颜色
    if (elements.categoriesListCollapsed) {
        const categoryItemsCollapsed = elements.categoriesListCollapsed.children;
        for (let i = 0; i < categoryItemsCollapsed.length; i++) {
            const el = categoryItemsCollapsed[i];
            const categoryId = el.dataset.categoryId;
            const finalBorder = String(categoryId) === String(currentState.currentCategoryId) ? globalBorderColor : defaultBorder;
            el.style.borderColor = finalBorder;
            el.style.setProperty('border-color', finalBorder, 'important');
        }
    }
}
// 更新分类列表的边框颜色（直接调用 updateCategorySelection）
function updateSingleCategoryColor(categoryId, newColor) {
    if (!elements.categoriesListExpanded && !elements.categoriesListCollapsed)
        return;
    const isDarkMode = document.body.classList.contains('dark-mode');
    const bgOpacity = isDarkMode ? '44' : '33';
    const backgroundColor = `${newColor}${bgOpacity}`;
    // 更新展开状态容器中对应的分类元素
    if (elements.categoriesListExpanded) {
        const categoryItemsExpanded = elements.categoriesListExpanded.children;
        for (let i = 0; i < categoryItemsExpanded.length; i++) {
            const el = categoryItemsExpanded[i];
            const elCategoryId = el.dataset.categoryId;
            if (String(elCategoryId) === String(categoryId)) {
                el.style.backgroundColor = backgroundColor;
                el.style.setProperty('background-color', backgroundColor, 'important');
                break;
            }
        }
    }
    // 更新收起状态容器中对应的分类元素
    if (elements.categoriesListCollapsed) {
        const categoryItemsCollapsed = elements.categoriesListCollapsed.children;
        for (let i = 0; i < categoryItemsCollapsed.length; i++) {
            const el = categoryItemsCollapsed[i];
            const elCategoryId = el.dataset.categoryId;
            if (String(elCategoryId) === String(categoryId)) {
                el.style.backgroundColor = backgroundColor;
                el.style.setProperty('background-color', backgroundColor, 'important');
                break;
            }
        }
    }
}
// 渲染分类列表
// playAnimation: 是否播放入场动画，默认true（初始化时播放），分类操作时设为false
// 保存 setTimeout ID 以便清理，避免重复渲染时的动画冲突
let _renderCategoriesTimers = [];
function _clearRenderCategoriesTimers() {
    _renderCategoriesTimers.forEach(id => clearTimeout(id));
    _renderCategoriesTimers = [];
}
function renderCategories(playAnimation = true) {
    if (!elements.categoriesListExpanded || !elements.categoriesListCollapsed)
        return;
    // 清理旧动画timer，防止重复渲染时冲突
    _clearRenderCategoriesTimers();
    const isDarkMode = document.body.classList.contains('dark-mode');
    // 直接清空并重新渲染两个容器（不再包含顶部分割线，顶部分割线已经是单独容器）
    elements.categoriesListExpanded.innerHTML = '';
    elements.categoriesListCollapsed.innerHTML = '';
    // 获取全局边框颜色（来自设置页面）
    let globalBorderColor = DEFAULT_SELECTED_BORDER_COLOR; // 默认绿色
    // 如果设置页面有自定义颜色，使用自定义颜色
    const hexInput2 = document.getElementById('hexInput2');
    if (customColorMode && hexInput2) {
        let hex = hexInput2.value.trim();
        if (hex) {
            const normalized = colorManager.normalizeHex(hex);
            if (normalized) {
                globalBorderColor = normalized;
            }
        }
    }
    else {
        // 使用预设颜色
        if (colorManager.borderColorMap[selectedBorderColor]) {
            globalBorderColor = colorManager.borderColorMap[selectedBorderColor];
        }
    }
    // 渲染展开状态的分类按钮
    categories.forEach((category, index) => {
        const categoryEl = createCategoryButton(category, false, isDarkMode, globalBorderColor);
        elements.categoriesListExpanded.appendChild(categoryEl);
    });
    // 渲染收起状态的分类按钮（图标只显示图标
    categories.forEach((category, index) => {
        const categoryEl = createCategoryButton(category, true, isDarkMode, globalBorderColor);
        elements.categoriesListCollapsed.appendChild(categoryEl);
    });
    // 触发动画：所有分类按钮一起出现（不再逐个延迟）
    if (playAnimation) {
        // 统一延迟后，一次性为所有分类按钮添加animate-in类
        const showTimer = setTimeout(() => {
            // 展开状态：直接选择容器下的直接子元素（分类按钮）
            const expandedButtons = elements.categoriesListExpanded.children;
            for (let i = 0; i < expandedButtons.length; i++) {
                if (expandedButtons[i] && expandedButtons[i].classList) {
                    expandedButtons[i].classList.add('animate-in');
                }
            }
            // 收起状态：直接选择容器下的直接子元素（分类按钮）
            const collapsedButtons = elements.categoriesListCollapsed.children;
            for (let i = 0; i < collapsedButtons.length; i++) {
                if (collapsedButtons[i] && collapsedButtons[i].classList) {
                    collapsedButtons[i].classList.add('animate-in');
                }
            }
        }, 120); // 统一延迟 120ms，所有分类同时开始动画
        _renderCategoriesTimers.push(showTimer);
    }
    else {
        // 不播放动画时，直接添加animate-in类显示元素
        const expandedButtons = elements.categoriesListExpanded.children;
        const collapsedButtons = elements.categoriesListCollapsed.children;
        for (let i = 0; i < expandedButtons.length; i++) {
            if (expandedButtons[i] && expandedButtons[i].classList) {
                expandedButtons[i].classList.add('animate-in');
            }
        }
        for (let i = 0; i < collapsedButtons.length; i++) {
            if (collapsedButtons[i] && collapsedButtons[i].classList) {
                collapsedButtons[i].classList.add('animate-in');
            }
        }
    }
    // 更新当前分类名称
    const currentCategory = categories.find(c => String(c.id) === String(currentState.currentCategoryId));
    if (currentCategory && elements.currentCategoryName) {
        elements.currentCategoryName.textContent = currentCategory.name;
    }
}
// 创建分类按钮
function createCategoryButton(category, isCollapsed, isDarkMode, globalBorderColor) {
    const categoryEl = document.createElement('div');
    // 确定使用的分类颜色（背景色）
    let categoryColor = category.color;
    if (colorManager.isPresetColor(category.color)) {
        categoryColor = colorManager.presetToHex(category.color) || category.color;
    }
    // 计算背景颜色（带透明度）
    const bgOpacity = isDarkMode ? '44' : '33';
    const backgroundColor = `${categoryColor}${bgOpacity}`;
    // 边框颜色：未选中时使用灰色，选中时使用全局边框颜色
    const defaultBorder = '#d1d5db';
    const finalBorder = String(category.id) === String(currentState.currentCategoryId) ? globalBorderColor : defaultBorder;
    // 设置按钮样式
    if (isCollapsed) {
        // 收起状态：只显示图标
        categoryEl.className = 'flex items-center justify-center rounded-xl cursor-pointer border-2';
        categoryEl.style.height = '60px';
        categoryEl.style.width = '60px';
        categoryEl.style.backgroundColor = backgroundColor;
        categoryEl.style.setProperty('background-color', backgroundColor, 'important');
        categoryEl.style.borderColor = finalBorder;
        categoryEl.style.setProperty('border-color', finalBorder, 'important');
        // 只渲染图标（SVG内容先经过sanitizeSvg清理）
        let iconHtml = '';
        const safeIcon = getSafeCategoryIconHtml(category.icon);
        if (isSVG(safeIcon)) {
            // SVG图标不添加text-gray-800，保持原有颜色
            iconHtml = `<div class="w-6 h-6 flex items-center justify-center">${safeIcon}</div>`;
        }
        else {
            iconHtml = `<i class="fa ${escapeHtml(safeIcon)} text-2xl text-gray-800"></i>`;
        }
        categoryEl.innerHTML = iconHtml;
    }
    else {
        // 展开状态：显示完整内容
        categoryEl.className = 'flex items-center px-4 py-3 rounded-xl text-lg cursor-pointer border-2';
        categoryEl.style.height = '60px';
        categoryEl.style.backgroundColor = backgroundColor;
        categoryEl.style.setProperty('background-color', backgroundColor, 'important');
        categoryEl.style.borderColor = finalBorder;
        categoryEl.style.setProperty('border-color', finalBorder, 'important');
        // SVG内容先经过sanitizeSvg 清理
        let iconHtml = '';
        const safeIcon2 = getSafeCategoryIconHtml(category.icon);
        if (isSVG(safeIcon2)) {
            // SVG 图标：使用与收起状态相同的方式渲染，不添加额外样式
            iconHtml = `<div class="w-8 h-8 flex items-center justify-center mr-3">${safeIcon2}</div>`;
        }
        else {
            iconHtml = `<i class="fa ${escapeHtml(safeIcon2)} text-2xl mr-3 text-gray-800"></i>`;
        }
        categoryEl.innerHTML = `
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center">
                    ${iconHtml}
                    <span class="font-medium category-name">${escapeHtml(category.name)}</span>
                </div>
                <div class="flex items-center gap-2 category-actions">
                    <button class="settings-category-btn text-gray-500 hover:text-blue-500" data-category-id="${category.id}">
                        <i class="fa fa-cog text-lg"></i>
                    </button>
                    ${!category.isDefault ? `<button class="delete-category-btn text-gray-500 hover:text-red-500" data-category-id="${category.id}">
                        <i class="fa fa-times text-lg"></i>
                    </button>` : ''}
                </div>
            </div>
        `;
    }
    categoryEl.dataset.categoryId = category.id;
    // 为分类项添加点击事件（排除按钮）
    categoryEl.addEventListener('click', (e) => {
        // 如果点击的是按钮或其内部元素，不执行分类切换
        if (e.target.closest('.delete-category-btn') || e.target.closest('.settings-category-btn')) {
            return;
        }
        currentState.currentCategoryId = category.id;
        currentState.currentPage = 1;
        saveAllData();
        updateCategorySelection();
        renderApps();
        updatePagination();
        // 更新主栏左上角的分类名称
        const currentCategory = categories.find(c => String(c.id) === String(currentState.currentCategoryId));
        if (currentCategory && elements.currentCategoryName) {
            elements.currentCategoryName.textContent = currentCategory.name;
        }
    });
    // 只为展开状态的按钮添加设置和删除事件
    if (!isCollapsed) {
        // 为设置按钮添加事件监听（所有分类）
        const settingsBtn = categoryEl.querySelector('.settings-category-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                // 打开分类设置模态框
                openCategorySettingsModal(category);
            });
        }
        // 为自定义分类的删除按钮添加事件监听
        if (!category.isDefault) {
            const deleteBtn = categoryEl.querySelector('.delete-category-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // 阻止事件冒泡
                    const categoryId = deleteBtn.dataset.categoryId;
                    // 直接在这里处理删除逻辑
                    const categoryIndex = categories.findIndex(c => String(c.id) === String(categoryId));
                    if (categoryIndex === -1)
                        return;
                    const categoryToDelete = categories[categoryIndex];
                    // 确认删除
                    showConfirmDialog('删除分类', `确定要删除分类${categoryToDelete.name}"吗？`, () => {
                        // 如果当前正在查看要删除的分类，切换到默认分类
                        if (String(currentState.currentCategoryId) === String(categoryId)) {
                            currentState.currentCategoryId = '1'; // 默认分类ID（字符串类型）
                            currentState.currentPage = 1;
                        }
                        // 从数组中删除分类
                        categories.splice(categoryIndex, 1);
                        // 保存数据
                        saveAllData();
                        // 更新UI
                        renderCategories(false);
                        renderApps();
                        updatePagination();
                        // 重新填充下拉菜单
                        populateAppSettingsCategories(currentState.currentCategoryId);
                        populateAddAppCategories();
                    }, { confirmText: '删除', variant: 'danger' });
                });
            }
        }
    }
    return categoryEl;
}
// 全局应用样式设置函数
function applyStyleSettings() {
    const body = document.body;
    body.classList.remove('font-light-mode', 'font-dark-mode');
    body.classList.remove('icon-light-mode', 'icon-dark-mode');
    body.classList.remove('border-light-mode', 'border-dark-mode');
    const globalIsDark = document.body.classList.contains('dark-mode');
    // 应用字体模式
    if (styleSettings.fontMode === 'light') {
        body.classList.add('font-light-mode');
    }
    else if (styleSettings.fontMode === 'dark') {
        body.classList.add('font-dark-mode');
    }
    else {
        // 跟随全局：字体跟随全局主题
        if (globalIsDark) {
            body.classList.add('font-dark-mode');
        }
        else {
            body.classList.add('font-light-mode');
        }
    }
    // 应用图标模式
    if (styleSettings.iconMode === 'light') {
        body.classList.add('icon-light-mode');
    }
    else if (styleSettings.iconMode === 'dark') {
        body.classList.add('icon-dark-mode');
    }
    else {
        // 跟随全局：图标跟随全局主题
        if (globalIsDark) {
            body.classList.add('icon-dark-mode');
        }
        else {
            body.classList.add('icon-light-mode');
        }
    }
    // 应用边框模式
    if (styleSettings.borderMode === 'light') {
        body.classList.add('border-light-mode');
    }
    else if (styleSettings.borderMode === 'dark') {
        body.classList.add('border-dark-mode');
    }
    else {
        // 跟随全局：边框跟随全局主题
        if (globalIsDark) {
            body.classList.add('border-dark-mode');
        }
        else {
            body.classList.add('border-light-mode');
        }
    }
    // 应用卡片背景跟随透明度（统一通过容器类+CSS变量生效，无需逐卡遍历）
    updateAppCardOpacityBg();
}
// 渲染应用网格
function renderApps() {
    if (!elements.appsGrid)
        return;
    elements.appsGrid.innerHTML = '';
    // 过滤应用
    let filteredApps = applications.filter(app => {
        const matchesCategory = String(app.categoryId) === String(currentState.currentCategoryId);
        const matchesSearch = currentState.searchQuery === '' ||
            app.name.toLowerCase().includes(currentState.searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });
    // 分页
    const startIndex = (currentState.currentPage - 1) * currentState.itemsPerPage;
    const endIndex = startIndex + currentState.itemsPerPage;
    const paginatedApps = filteredApps.slice(startIndex, endIndex);
    if (elements.totalApps)
        elements.totalApps.textContent = String(filteredApps.length);
    paginatedApps.forEach(app => {
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'app-card-wrapper relative';
        const appCard = document.createElement('div');
        const cardClasses = 'app-card rounded-xl border-2 border-gray-300 overflow-hidden flex flex-col';
        appCard.className = cardClasses;
        // 图标HTML
        let iconHtml = '';
        if (app.uploadedIcon) {
            let iconSrc = app.uploadedIcon;
            // 如果不是 DataURL，从缓存文件夹加载
            if (!iconSrc.startsWith('data:') && !iconSrc.startsWith('file://')) {
                const iconCacheDir = getIconCacheDir();
                const filePath = path.join(iconCacheDir, iconSrc);
                // 使用统一的URL编码
                iconSrc = utils.pathToFileURL(filePath);
            }
            iconHtml = `<img src="${iconSrc}" style="width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; border-radius: 0.75rem; background: transparent;" alt="应用图标">`;
        }
        else {
            iconHtml = `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: #f3f4f6; border-radius: 0.75rem;"><i class="fa ${escapeHtml(app.icon)} text-gray-400" style="font-size: 110px; line-height: 1;"></i></div>`;
        }
        // 根据样式设置决定是否显示描述
        let descriptionHtml = '';
        const descMode = styleSettings.descDisplayMode || 'show';
        const hasDescription = app.description && app.description.trim() !== '';
        const showDesc = descMode === 'show' || (descMode === 'hideWhenEmpty' && hasDescription);
        if (showDesc) {
            const descText = hasDescription ? app.description : '暂无描述';
            descriptionHtml = `
                <!-- 应用描述 -->
                <div class="flex items-center justify-center flex-1" style="box-sizing: border-box; position: relative;">
                    <div class="text-xs text-gray-600 text-center">${escapeHtml(descText)}</div>
                    <div style="position: absolute; bottom: 0; left: 4px; right: 4px; height: 1px; background-color: #d1d5db;"></div>
                </div>`;
        }
        else {
            // 占位容器，保持布局不变，防止底部按钮移位
            descriptionHtml = `
                <!-- 应用描述占位 -->
                <div class="flex-1" style="box-sizing: border-box; position: relative;">
                    <div style="position: absolute; bottom: 0; left: 4px; right: 4px; height: 1px; background-color: #d1d5db;"></div>
                </div>`;
        }
        appCard.innerHTML = `
            <!-- 图标区域 - 正方形，与卡片相同圆角-->
            <div class="w-full flex-shrink-0" style="height: 155px; padding: 1px; margin: 0; box-sizing: border-box;">
                <div class="app-icon-container" style="width: 100%; height: 100%; border-radius: 0.75rem; border: 1px solid #d1d5db; overflow: hidden; box-sizing: border-box; position: relative;">
                    ${iconHtml}
                    ${styleSettings.launchMode === 'icon' ? `
                    <!-- 启动图标覆盖层（仅在"启动图标启动"模式显示）-->
                    <div class="app-launch-overlay">
                        <svg class="app-launch-icon" xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 20 20"><path fill="currentColor" d="M17.22 8.687a1.498 1.498 0 0 1 0 2.626l-9.997 5.499A1.5 1.5 0 0 1 5 15.499V4.501a1.5 1.5 0 0 1 2.223-1.313zm-.482 1.75a.5.5 0 0 0 0-.875L6.741 4.063A.5.5 0 0 0 6 4.501v10.998a.5.5 0 0 0 .741.438z"></path></svg>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- 内容容器 -->
            <div class="flex-1 flex flex-col" style="padding: 1px 8px; box-sizing: border-box;">
                <!-- 应用名称 -->
                <div class="flex items-center justify-center" style="height: 35px; box-sizing: border-box;">
                    <div class="text-sm font-semibold text-gray-800 text-center">${escapeHtml(app.name)}</div>
                </div>
                
                ${descriptionHtml}
                
                <!-- 操作按钮区域 -->
                <div class="app-card-action-bar flex items-center justify-center" style="height: 28px; box-sizing: border-box; position: relative;">
                    <!-- 设置按钮 -->
                    <button class="app-settings-btn flex items-center justify-center hover:bg-gray-50" style="width: 50%; height: 28px; box-sizing: border-box;">
                        <i class="fa fa-cog text-gray-700 text-base"></i>
                    </button>
                    <div style="position: absolute; left: 50%; top: 4px; bottom: 4px; width: 1px; background-color: #d1d5db; transform: translateX(-50%);"></div>
                    <!-- 删除按钮 -->
                    <button class="app-delete-btn flex items-center justify-center hover:bg-gray-50" style="width: 50%; height: 28px; box-sizing: border-box;">
                        <i class="fa fa-times text-gray-700 text-base"></i>
                    </button>
                </div>
            </div>
        `;
        // 存储appId到卡片上，用于事件委托
        appCard.dataset.appId = app.id;
        appCard.dataset.appName = app.name;
        // 添加时间显示元素
        const timeDisplay = document.createElement('div');
        timeDisplay.className = 'app-card-date';
        const displayTime = app.lastLaunchedAt || app.createdAt;
        timeDisplay.textContent = formatDateTime(displayTime);
        cardWrapper.appendChild(appCard);
        cardWrapper.appendChild(timeDisplay);
        elements.appsGrid.appendChild(cardWrapper);
    });
    // 渲染完成后，应用样式设置（包括应用卡片背景跟随透明度）
    applyStyleSettings();
    // 根据应用数量和当前页显示情况显示/隐藏悬浮添加按钮和添加应用卡片
    const floatingAddBtn = document.getElementById('floatingAddBtn');
    const isCurrentPageFull = paginatedApps.length >= currentState.itemsPerPage;
    if (filteredApps.length === 0 || isCurrentPageFull) {
        // 没有应用，或者当前页已满时，显示悬浮按钮
        if (floatingAddBtn) {
            floatingAddBtn.classList.remove('hidden');
        }
    }
    else {
        // 有应用且当前页未满时，隐藏悬浮按钮，显示添加应用卡片
        if (floatingAddBtn) {
            floatingAddBtn.classList.add('hidden');
        }
        // 添加应用卡片
        const addCardWrapper = document.createElement('div');
        addCardWrapper.className = 'app-card-wrapper relative';
        const addAppCard = document.createElement('div');
        addAppCard.className = 'app-card add-app-card rounded-xl border-2 border-gray-300 cursor-pointer hover:border-gray-400 transition-colors flex items-center justify-center';
        addAppCard.style.backgroundColor = 'transparent';
        addAppCard.innerHTML = `
            <i class="fa fa-plus text-5xl text-gray-700"></i>
        `;
        addAppCard.addEventListener('click', () => {
            openAddAppModal();
        });
        addCardWrapper.appendChild(addAppCard);
        elements.appsGrid.appendChild(addCardWrapper);
    }
}
// 打开应用设置模态框
function openAppSettingsModal(appId) {
    const app = applications.find(a => String(a.id) === String(appId));
    if (!app)
        return;
    currentEditingAppId = appId;
    appSettingsUploadedIcon = app.uploadedIcon || null;
    const appSettingsName = document.getElementById('appSettingsName');
    const appSettingsPath = document.getElementById('appSettingsPath');
    const appSettingsDescription = document.getElementById('appSettingsDescription');
    const appSettingsCategory = document.getElementById('appSettingsCategory');
    const appSettingsIconPreview = document.getElementById('appSettingsIconPreview');
    const appSettingsIconImage = document.getElementById('appSettingsIconImage');
    const appSettingsIconInput = document.getElementById('appSettingsIconInput');
    const appSettingsModalTitle = document.getElementById('appSettingsModalTitle');
    if (appSettingsName)
        appSettingsName.value = app.name;
    if (appSettingsPath)
        appSettingsPath.value = app.path || '';
    if (appSettingsDescription)
        appSettingsDescription.value = app.description || '';
    if (appSettingsModalTitle)
        appSettingsModalTitle.textContent = `应用设置 - ${app.name}`;
    if (appSettingsIconPreview && appSettingsIconImage) {
        if (app.uploadedIcon) {
            appSettingsIconPreview.classList.add('hidden');
            appSettingsIconImage.classList.remove('hidden');
            let iconSrc = app.uploadedIcon;
            // 如果不是 DataURL，从缓存文件夹加载
            if (!iconSrc.startsWith('data:') && !iconSrc.startsWith('file://')) {
                const iconCacheDir = getIconCacheDir();
                const filePath = path.join(iconCacheDir, iconSrc);
                // 使用统一的URL编码
                iconSrc = utils.pathToFileURL(filePath);
            }
            appSettingsIconImage.src = iconSrc;
        }
        else {
            appSettingsIconPreview.classList.remove('hidden');
            appSettingsIconImage.classList.add('hidden');
            appSettingsIconPreview.className = `fa ${app.icon} text-5xl text-gray-400`;
        }
    }
    if (appSettingsIconInput) {
        appSettingsIconInput.value = '';
    }
    // 填充分类选项
    populateAppSettingsCategories(app.categoryId);
    // 显示模态框
    const modal = document.getElementById('appSettingsModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}
// 填充应用设置模态框的分类选项
function populateAppSettingsCategories(selectedCategoryId) {
    if (!appSettingsDropdown) {
        appSettingsDropdown = new CustomDropdown('appSettingsCustomDropdown');
    }
    const categoryItems = categories.map(category => ({
        value: category.id,
        label: category.name
    }));
    appSettingsDropdown.populateOptions(categoryItems, selectedCategoryId);
}
// 关闭应用设置模态框
function closeAppSettingsModal() {
    const modal = document.getElementById('appSettingsModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentEditingAppId = null;
}
// 应用输入验证（名称、路径、描述）
// 返回 { valid: boolean, message: string }
function validateAppInput(name, filePath, description) {
    const MAX_NAME_LENGTH = 100;
    const MAX_DESC_LENGTH = 500;
    if (!name) {
        return { valid: false, message: '请输入应用名称' };
    }
    if (name.length > MAX_NAME_LENGTH) {
        return { valid: false, message: `应用名称不能超过 ${MAX_NAME_LENGTH} 个字符` };
    }
    // 名称不应包含路径分隔符或控制字符
    if (/[\x00-\x1f<>:"/\\|?*]/.test(name)) {
        return { valid: false, message: '应用名称包含不允许的字符' };
    }
    if (description && description.length > MAX_DESC_LENGTH) {
        return { valid: false, message: `应用描述不能超过 ${MAX_DESC_LENGTH} 个字符` };
    }
    return { valid: true, message: '' };
}
// 保存应用设置
function saveAppSettings() {
    if (currentEditingAppId === null)
        return;
    const app = applications.find(a => String(a.id) === String(currentEditingAppId));
    if (!app)
        return;
    const appSettingsName = document.getElementById('appSettingsName');
    const appSettingsPath = document.getElementById('appSettingsPath');
    const appSettingsDescription = document.getElementById('appSettingsDescription');
    const appSettingsCategory = document.getElementById('appSettingsCategory');
    // 输入验证
    const nameVal = appSettingsName ? appSettingsName.value.trim() : '';
    const pathVal = appSettingsPath ? appSettingsPath.value.trim() : '';
    const descVal = appSettingsDescription ? appSettingsDescription.value.trim() : '';
    const validation = validateAppInput(nameVal, pathVal, descVal);
    if (!validation.valid) {
        showToast(validation.message);
        return;
    }
    // 如果更换了新图标，安全删除旧的图标缓存文件（路径遍历防护）
    if (app.uploadedIcon && app.uploadedIcon !== appSettingsUploadedIcon &&
        !app.uploadedIcon.startsWith('data:')) {
        utils.safeDeleteCachedFile(getIconCacheDir(), app.uploadedIcon);
    }
    if (appSettingsName)
        app.name = appSettingsName.value;
    if (appSettingsPath)
        app.path = appSettingsPath.value;
    if (appSettingsDescription)
        app.description = appSettingsDescription.value;
    if (appSettingsCategory)
        app.categoryId = String(appSettingsCategory.value);
    app.uploadedIcon = appSettingsUploadedIcon;
    // 保存数据
    saveAllData();
    // 重新渲染
    renderApps();
    updatePagination();
    closeAppSettingsModal();
    showToast('应用设置已保存');
}
// 打开添加应用模态框
function openAddAppModal() {
    const addAppName = document.getElementById('addAppName');
    const addAppPath = document.getElementById('addAppPath');
    const addAppPathInput = document.getElementById('addAppPathInput');
    const addAppDescription = document.getElementById('addAppDescription');
    if (addAppName)
        addAppName.value = '';
    if (addAppPath)
        addAppPath.value = '';
    if (addAppPathInput)
        addAppPathInput.value = '';
    if (addAppDescription)
        addAppDescription.value = '';
    selectedAppIcon = 'fa-th-large';
    uploadedAppIcon = null;
    const addAppIconPreview = document.getElementById('addAppIconPreview');
    const addAppIconImage = document.getElementById('addAppIconImage');
    const addAppIconInput = document.getElementById('addAppIconInput');
    if (addAppIconPreview) {
        addAppIconPreview.className = 'fa ' + selectedAppIcon + ' text-5xl text-gray-400';
        addAppIconPreview.classList.remove('hidden');
    }
    if (addAppIconImage) {
        addAppIconImage.classList.add('hidden');
        addAppIconImage.src = '';
    }
    if (addAppIconInput) {
        addAppIconInput.value = '';
    }
    // 填充分类选项
    populateAddAppCategories();
    // 显示模态框
    const modal = document.getElementById('addAppModal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}
// 填充添加应用模态框的分类选项
function populateAddAppCategories() {
    if (!addAppDropdown) {
        addAppDropdown = new CustomDropdown('addAppCustomDropdown');
    }
    const categoryItems = categories.map(category => ({
        value: category.id,
        label: category.name
    }));
    addAppDropdown.populateOptions(categoryItems, currentState.currentCategoryId);
}
// 关闭添加应用模态框
function closeAddAppModal() {
    const modal = document.getElementById('addAppModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}
// 添加新应用
function addNewApp() {
    const addAppName = document.getElementById('addAppName');
    const addAppPath = document.getElementById('addAppPath');
    const addAppDescription = document.getElementById('addAppDescription');
    const addAppCategory = document.getElementById('addAppCategory');
    const name = addAppName ? addAppName.value.trim() : '';
    const appPath = addAppPath ? addAppPath.value.trim() : '';
    const description = addAppDescription ? addAppDescription.value.trim() : '';
    const categoryId = addAppCategory ? String(addAppCategory.value) : currentState.currentCategoryId;
    // 输入验证
    const validation = validateAppInput(name, appPath, description);
    if (!validation.valid) {
        showToast(validation.message);
        return;
    }
    const now = Date.now();
    const newApp = {
        // 显式字符串拼接，避免依赖隐式类型转换
        id: String(Date.now()) + Math.random().toString(36).slice(2, 11),
        name: name,
        icon: selectedAppIcon,
        uploadedIcon: uploadedAppIcon,
        categoryId: categoryId,
        path: appPath,
        description: description || '',
        originalName: name,
        createdAt: now,
        lastLaunchedAt: null
    };
    applications.push(newApp);
    // 如果当前分类是新应用的分类，切换到最后一页
    if (String(categoryId) === String(currentState.currentCategoryId)) {
        const filteredApps = applications.filter(app => String(app.categoryId) === String(currentState.currentCategoryId));
        const totalPages = Math.ceil(filteredApps.length / currentState.itemsPerPage);
        currentState.currentPage = totalPages;
    }
    // 保存数据
    saveAllData();
    // 重新渲染
    renderApps();
    updatePagination();
    closeAddAppModal();
    showToast(`已添加应用: ${name}`);
}
// 更新分页信息
function updatePagination() {
    const filteredApps = applications.filter(app => {
        const matchesCategory = String(app.categoryId) === String(currentState.currentCategoryId);
        const matchesSearch = currentState.searchQuery === '' ||
            app.name.toLowerCase().includes(currentState.searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });
    const totalPages = Math.ceil(filteredApps.length / currentState.itemsPerPage);
    if (elements.pageInfo)
        elements.pageInfo.textContent = `${currentState.currentPage} / ${totalPages || 1}`;
    if (elements.prevPageBtn) {
        elements.prevPageBtn.disabled = currentState.currentPage === 1;
        elements.prevPageBtn.classList.toggle('opacity-50', currentState.currentPage === 1);
    }
    if (elements.nextPageBtn) {
        elements.nextPageBtn.disabled = currentState.currentPage >= totalPages || totalPages === 0;
        elements.nextPageBtn.classList.toggle('opacity-50', currentState.currentPage >= totalPages || totalPages === 0);
    }
}
// 启动应用（封装公共逻辑，避免代码重复）
// 所有启动方式（单击/双击/启动图标）均调用此函数
async function launchApp(app) {
    if (!app || !app.path || !app.path.trim())
        return;
    try {
        // 更新最后启动时间
        app.lastLaunchedAt = Date.now();
        saveAllData();
        // 使用 ipcRenderer 通知主进程启动应用
        const res = await ipcRenderer.invoke('open-app', app.path.trim());
        if (res) console.error(res);
        showToast(`正在启动: ${app.name}`);
        // 重新渲染以更新时间显示
        renderApps();
    }
    catch (e) {
        console.error('启动应用失败:', e);
        showToast('启动应用失败');
    }
}
// 统一的图标上传处理函数（避免addApp和appSettings 中的重复代码）
// containerId - 预览容器 ID，inputId - 文件输入 ID，previewId - 图标预览 ID
// imageId - 图片元素 ID，getUploadedIcon - 获取上传图标变量函数，setUploadedIcon - 设置上传图标变量函数
function setupIconUpload(containerId, inputId, previewId, imageId, getUploadedIcon, setUploadedIcon) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const image = document.getElementById(imageId);
    if (!container || !input) return;
    container.addEventListener('click', () => input.click());
    input.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp', 'image/apng', 'image/vnd.microsoft.icon', 'image/x-icon'];
        const validExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.apng', '.ico'];
        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
        if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
            showToast('请选择PNG、JPG、GIF、SVG、WEBP、APNG或ICO格式的图片');
            return;
        }
        const iconCacheDir = getIconCacheDir();
        const fileName = generateUniqueFilename(file.name);
        const filePath = path.join(iconCacheDir, fileName);
        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result;
            const buffer = api.Buffer.from(new Uint8Array(arrayBuffer));
            fs.writeFileSync(filePath, buffer);
            setUploadedIcon(fileName);
            const fileUrl = utils.pathToFileURL(filePath);
            if (preview && image) {
                preview.classList.add('hidden');
                image.classList.remove('hidden');
                image.src = fileUrl;
            }
        };
        reader.onerror = () => showToast('读取图标文件失败');
        reader.readAsArrayBuffer(file);
    });
}
// 初始化设置模态框中的配置路径
function initSettingsPath() {
    const configPathInput = document.getElementById('configPathInput');
    if (configPathInput) {
        configPathInput.value = currentState.configPath || getDefaultConfigPath();
    }
}
// 切换设置弹窗分页
function switchSettingsPage(pageNum) {
    const page1 = document.getElementById('settingsPage1');
    const page2 = document.getElementById('settingsPage2');
    const page1Btn = document.getElementById('settingsPage1Btn');
    const page2Btn = document.getElementById('settingsPage2Btn');
    const title = document.getElementById('settingsModalTitle');
    if (page1 && page2 && page1Btn && page2Btn && title) {
        if (pageNum === 1) {
            page1.classList.remove('hidden');
            page2.classList.add('hidden');
            page1Btn.classList.add('bg-white', 'text-gray-800', 'shadow-sm', 'segmented-segment-active');
            page1Btn.classList.remove('text-gray-500', 'hover:text-gray-700');
            page2Btn.classList.remove('bg-white', 'text-gray-800', 'shadow-sm', 'segmented-segment-active');
            page2Btn.classList.add('text-gray-500', 'hover:text-gray-700');
            title.textContent = '设置';
        }
        else {
            page1.classList.add('hidden');
            page2.classList.remove('hidden');
            page2Btn.classList.add('bg-white', 'text-gray-800', 'shadow-sm', 'segmented-segment-active');
            page2Btn.classList.remove('text-gray-500', 'hover:text-gray-700');
            page1Btn.classList.remove('bg-white', 'text-gray-800', 'shadow-sm', 'segmented-segment-active');
            page1Btn.classList.add('text-gray-500', 'hover:text-gray-700');
            title.textContent = '样式设置';
        }
    }
}