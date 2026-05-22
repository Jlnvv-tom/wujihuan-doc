# Electron 开发实战（一）：从零入门核心基础与环境搭建

哈喽，各位前端开发者！以往我们写前端代码，大多只能运行在浏览器中，想要开发桌面端软件，往往需要学习 Java、C\+\+、Swift 等小众桌面开发语言，学习成本高、跨平台适配难度大。

而 **Electron** 的出现彻底打破了这个壁垒，让前端开发者可以用熟悉的 HTML、CSS、JavaScript 技术栈，快速开发出 Windows、Mac、Linux 三端跨平台桌面应用。如今 VS Code、钉钉、飞书、Figma 桌面端等爆款软件均基于 Electron 开发。

本文作为 Electron 实战系列第一章，将从行业现状、核心原理、环境搭建、项目运行、结构解析全方位带你入门，全程干货无废话，附可直接运行的极简代码，新手也能一键上手。

## 1\.1 桌面应用开发的现状与趋势

### 1\. 传统桌面开发的痛点

在 Electron 普及之前，桌面应用开发存在诸多行业痛点，也是很多前端开发者不愿涉足桌面开发的核心原因：

- **技术栈割裂**：Windows 端需学习 C\+\+/C\#、Mac 端需要 Swift、Linux 端适配 C 语言，各平台技术完全不互通

- **开发效率低**：原生桌面开发语法繁琐、UI 搭建复杂，迭代更新周期长

- **跨平台成本极高**：一套功能需要针对三个系统分别开发、适配、调试，人力和时间成本翻倍

- **前端技术无法复用**：成熟的前端组件库、工程化方案无法应用于桌面开发

### 2\. 现代跨平台桌面开发趋势

当下桌面开发行业已经全面向 **跨平台、轻量化、前端化** 转型，两大主流方案占据市场主流：Flutter、Electron。其中 Electron 凭借 **零学习成本（前端栈）、生态成熟、迭代快速** 的优势，成为互联网公司桌面应用开发的首选方案。

目前行业核心趋势：

- 绝大多数 ToB 办公软件、工具类软件优先采用 Electron 开发

- 依托 Chromium 内核，完美兼容网页特性，支持热更新、在线迭代

- 轻量化、轻量化部署，无需复杂的系统环境依赖

- 前端工程化体系完全复用，组件、打包、调试流程无缝衔接

## 1\.2 Electron核心架构与工作原理

很多新手开发 Electron 只会照搬代码，不懂底层原理，遇到进程报错、通信异常、权限问题就无从下手。掌握 Electron 核心架构，是进阶实战的关键。

Electron 核心基于 **Chromium \+ Node\.js \+ 原生桌面框架** 整合而成，最核心的设计就是 **主进程 \+ 渲染进程 双进程架构**，官方架构参考：[Electron 官方进程模型文档](https://www.electronjs.org/zh/docs/latest/tutorial/process-model)。

### 1\. 双进程核心架构

#### （1）主进程（Main Process）

项目入口文件运行的进程，**全局唯一**，基于 Node\.js 运行，拥有完整的 Node\.js API 和 Electron 原生桌面 API 权限。

核心职责：创建应用窗口、管理生命周期、调用系统原生能力（文件读写、弹窗、快捷键、菜单）、管控所有渲染进程。

#### （2）渲染进程（Renderer Process）

每一个 Electron 窗口对应一个独立的渲染进程，基于 Chromium 内核运行，本质就是一个浏览器页面。

核心职责：负责页面 UI 渲染、用户交互、页面逻辑处理。**Electron 12\+ 版本默认关闭渲染进程 Node 权限**，保障应用安全，需通过预加载脚本实现进程通信 。

#### （3）预加载脚本（Preload）

介于主进程和渲染进程之间的中间脚本，拥有特殊权限，可打通两个进程的通信通道，是 Electron 安全开发的核心机制 。

### 2\. 架构运行流程图解

极简运行逻辑：**主进程启动 → 创建窗口（渲染进程）→ 预加载脚本注入 → 页面渲染 \+ 进程通信交互**

核心特点：进程隔离、权限分级、安全可控，既保留 Node\.js 原生能力，又规避浏览器跨域和权限风险。

## 1\.3 搭建第一个开发环境

Electron 开发环境搭建极简，无需复杂配置，仅需基础前端环境，适配 Windows/Mac/Linux 全平台。

### 1\. 环境依赖要求

必须提前安装：**Node\.js 16\.x 及以上版本**（推荐 LTS 稳定版）、npm/yarn 包管理工具、VS Code 编辑器 。

验证环境是否就绪，终端执行以下命令：

```bash
# 查看Node版本
node -v
# 查看npm版本
npm -v
```

输出版本号即环境正常，若未安装需先前往 Node\.js 官网安装 LTS 版本。

### 2\. 全局辅助工具（可选）

安装 electron 全局命令，方便终端快速启动、调试项目：

```bash
npm install -g electron
```

## 1\.4 创建并运行Hello World应用

本节从零搭建最简 Electron 项目，全程 5 步，代码极简、无冗余，可直接复制运行，官方入门示例改编 。

### 步骤1：初始化项目文件夹

```bash
# 创建项目文件夹
mkdir electron-hello-demo
# 进入项目目录
cd electron-hello-demo
# 初始化package.json配置文件
npm init -y
```

### 步骤2：安装Electron依赖

```bash
# 本地安装开发依赖
npm install --save-dev electron
```

### 步骤3：创建核心项目文件

在项目根目录新建 3 个核心文件，构成最简 Electron 项目：

- main\.js：主进程入口文件（项目核心）

- preload\.js：预加载脚本文件

- index\.html：页面渲染文件

#### 1\. main\.js（主进程代码）

```javascript
const { app, BrowserWindow } = require('electron')
const path = require('path')

// 创建窗口函数
function createWindow () {
  // 初始化浏览器窗口
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    title: 'Electron Hello World',
    // 绑定预加载脚本
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // 加载本地页面
  mainWindow.loadFile('index.html')
  // 自动打开调试控制台（开发环境）
  mainWindow.webContents.openDevTools()
}

// 应用就绪后创建窗口
app.whenReady().then(createWindow)

// 窗口全部关闭后退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

#### 2\. preload\.js（预加载脚本极简代码）

```javascript
const { contextBridge } = require('electron')

// 安全暴露全局API（基础示例）
contextBridge.exposeInMainWorld('electronEnv', {
  platform: process.platform
})
```

说明：通过 contextBridge 安全暴露变量，避免渲染进程直接操作 Node API，符合 Electron 新版安全规范 。

#### 3\. index\.html（页面UI）

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Electron 实战入门</title>
  <style>
    body { text-align: center; margin-top: 200px; font-size: 20px; }
  </style>
</head>
<body>
  <h1>✅ Hello Electron！桌面应用启动成功</h1>
  <p>当前系统平台：<span id="platform"></span></p>
  <script>
    // 获取预加载暴露的全局变量
    document.getElementById('platform').innerText = window.electronEnv.platform
  </script>
</body>
</html>
```

### 步骤4：配置启动脚本

修改 package\.json，指定入口文件和启动命令，替换原有 scripts 配置：

```json
{
  "name": "electron-hello-demo",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron ."
  },
  "devDependencies": {
    "electron": "^30.0.0"
  }
}
```

关键配置说明：**main** 字段为 Electron 项目必须配置的入口文件，缺失会导致启动失败 。

### 步骤5：运行项目

```bash
npm start
```

执行命令后，会自动弹出桌面窗口，展示 Hello Electron 页面，同时显示当前运行的系统平台，代表项目运行成功！

## 1\.5 项目结构与核心文件解析

通过上面的 Hello World 案例，我们解析最简 Electron 项目的完整结构，理清每个文件的核心作用，为后续复杂实战开发打基础。

### 1\. 最简项目完整结构

```Plain Text
electron-hello-demo/
├── node_modules/       # 项目依赖包
├── main.js             # 主进程入口文件（核心）
├── preload.js          # 预加载脚本（安全通信）
├── index.html          # 渲染进程页面
└── package.json        # 项目配置文件
```

### 2\. 核心文件深度解析

#### （1）package\.json 配置文件

项目的核心配置文件，除了常规 npm 配置，Electron 专属核心字段：

- **main**：必填字段，指定主进程入口文件，Electron 启动的第一执行文件

- **scripts\.start**：项目启动命令，固定为 electron \.

- **devDependencies**：存放 Electron 开发依赖，不参与打包后的生产代码

#### （2）main\.js 主进程文件

整个桌面应用的“总指挥”，拥有最高权限，核心能力：

- 管控应用生命周期（启动、关闭、唤醒）

- 创建、销毁、置顶、缩放桌面窗口

- 调用系统原生 API（文件、菜单、弹窗、快捷键）

- 处理主进程与渲染进程的 IPC 通信

#### （3）preload\.js 预加载脚本

Electron 安全开发的核心文件，运行在独立上下文，权限高于渲染进程、低于主进程 。

核心作用：安全打通进程通信、暴露受限原生 API、处理页面加载前置逻辑，是新版 Electron 开发的必备文件。

#### （4）index\.html 渲染页面

纯前端页面，支持 HTML/CSS/JS/Vue/React 等所有前端技术栈，负责用户可视化界面和交互逻辑，运行在 Chromium 渲染进程中。

## 总结

本章我们完成了 Electron 入门全流程：理清了桌面开发行业趋势、吃透了 **双进程核心架构**、从零搭建开发环境、运行首个桌面应用、解析了项目核心结构。

核心重点回顾：

1. Electron 核心优势：前端栈开发、三端跨平台、低成本高效迭代

2. 核心架构：主进程管控全局，渲染进程负责 UI，预加载脚本保障安全通信

3. 必备规范：新版 Electron 禁止渲染进程直接使用 Node API，必须通过 preload 脚本中转

## 参考来源

\[1\] 掘金技术社区：[从0到1开发跨平台桌面应用:Electron 实战全指南](https://juejin.cn/post/7581664885861302282)

\[2\] Electron 官方文档：[创建您的第一个应用程序](https://www.electronjs.org/zh/docs/latest/tutorial/tutorial-first-app)

\[3\] 掘金技术社区：[Electron入门指南:从零开始构建跨平台桌面应用](https://juejin.cn/post/7592152007839760384)


