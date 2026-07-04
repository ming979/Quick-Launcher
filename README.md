# Quick-Launcher
一个基于 Electron 的本地快捷启动工具，用于快速管理和启动常用应用/路径/操作。

---

##  项目结构


.
├── index.html # UI入口
├── main.js # Electron 主进程
├── preload.js # 安全桥接层
├── script-core.js # 核心逻辑
├── script-main.js # 主流程控制
├── script-ui.js # UI交互逻辑
├── style.css # 页面样式
│
├── vendor/ # 前端依赖（无需 npm）
│ ├── tailwind.css
│ ├── tailwind.min.js
│ └── font-awesome 图标库
│
├── package.json
├── package-lock.json


---

##  功能特点

-  快速启动常用程序 / 路径 / 操作
-  简洁轻量的 UI 界面
-  本地运行，无需服务器
-  集成 Tailwind + FontAwesome UI 资源
-  使用 Electron preload 提高安全性
-  本地化数据，无云依赖

---

##  技术栈

- Electron
- JavaScript (Vanilla)
- HTML + CSS
- Tailwind CSS（本地引入）
- FontAwesome（本地引入）

## 代码结构说明

main.js
Electron 主进程，负责窗口创建、系统交互等。

preload.js
安全桥接层，用于限制 renderer 对 Node API 的直接访问。

script-core.js
核心逻辑层，例如数据处理、功能实现等。

script-ui.js
UI 渲染与交互逻辑。

script-main.js
整体流程控制与事件协调。
