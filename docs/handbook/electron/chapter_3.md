# Electron 开发实战（三）：基础UI开发与布局全解

大家好，本篇是 Electron 实战系列第三章。前面章节我们掌握了 Electron 进程模型、IPC 通信、窗口生命周期、原生模块等底层核心能力，具备了桌面应用的底层开发基础。

而一款合格的桌面应用，除了底层功能稳定，**UI 美观度、适配兼容性、交互体验**是核心加分项。Electron 最大的优势就是复用前端 UI 技术栈，我们可以用熟悉的 HTML/CSS/React 快速搭建桌面端界面。

本章聚焦 Electron 专属 UI 开发实战，区别于普通网页开发，详解桌面端适配规则、自定义标题栏、样式隔离、主题切换以及 React 工程化最佳实践，所有代码精简可直接落地，适配企业级开发规范。

## 3\.1 HTML/CSS在Electron中的最佳实践

很多前端开发者会误以为：Electron UI 就是普通网页，直接写代码即可。实则不然，**桌面端场景和浏览器网页场景差异极大**，网页端的开发规范直接套用会出现适配错乱、滚动异常、样式兼容、窗口拖拽失效等问题。本节梳理 Electron 专属 HTML/CSS 开发最佳实践。

### 3\.1\.1 核心差异点（桌面端 VS 网页端）

- **窗口尺寸固定可控**：不同于浏览器自由缩放、地址栏占用空间，Electron 窗口尺寸可自定义限制，布局更稳定

- **无默认浏览器样式干扰**：无需兼容老旧浏览器，仅适配 Chromium 内核，CSS 新特性可直接使用

- **支持系统原生交互**：可结合系统级拖拽、置顶、磨砂透明等专属样式特性

- **禁止网页端弹性布局陋习**：桌面应用需固定布局层级、统一字体、禁止页面滚动溢出

### 3\.1\.2 落地最佳实践（附极简代码）

引用来源：[Electron 桌面端UI适配官方规范](https://www.electronjs.org/zh/docs/latest/tutorial/desktop-environment-integration)

#### 1\. 全局样式重置（桌面端专属）

清除默认边距、滚动条，统一全局字体，适配 Windows/Mac 系统默认字体差异：

```css
/* 桌面端全局样式重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  /* 适配双系统字体 */
  font-family: -apple-system, BlinkMacSystemFont, "Microsoft Yahei", sans-serif;
  /* 禁止页面拖拽选中文本 */
  user-select: none;
  /* 禁止默认滚动条 */
  overflow: hidden;
}

/* 自定义滚动条（桌面端美观适配） */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}
```

#### 2\. 交互规范优化

- 所有可点击按钮、卡片禁止 `user\-select` 文本选中，贴合桌面软件交互习惯

- 页面主体禁止全局滚动，局部内容单独开启滚动，避免整体页面滑动错乱

- 统一点击反馈，增加 hover、active 状态样式，弥补桌面端无触屏交互反馈

#### 3\. 资源引入规范

Electron 本地资源禁止使用网页端相对路径模糊写法，统一使用 `path` 绝对路径引入，避免打包后资源失效。

## 3\.2 响应式布局与多分辨率适配

桌面端存在 **1080P、2K、4K、高分屏缩放** 等多分辨率场景，Windows 系统默认 125%、150% 缩放极易导致 UI 错位、字体模糊、布局塌陷。本节讲解 Electron 多分辨率适配方案。

### 3\.2\.1 核心适配原理

Electron 依托 Chromium 内核支持 **DPI 自适应**，通过设备像素比（DPR）适配高分屏，只需开启系统缩放适配，配合 CSS 相对单位即可实现全分辨率兼容。

引用来源：[Electron DPI 适配官方API](https://www.electronjs.org/zh/docs/latest/api/app#appsetautohidedpiadjustmentenabledenabled)

### 3\.2\.2 全局DPI适配配置（主进程）

在主进程入口开启高分屏适配，解决字体模糊、布局缩放异常问题：

```javascript
// main.js 顶部配置
const { app } = require('electron')

// 开启高分屏DPI适配
app.commandLine.appendSwitch('high-dpi-support', '1')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
```

### 3\.2\.3 响应式布局最佳实践

桌面端不推荐移动端大量媒体查询，采用 **flex \+ 百分比 \+ min/max 尺寸限制** 实现自适应：

```css
.container {
  width: 90%;
  /* 限制最大最小宽度，避免超大/极小窗口布局错乱 */
  min-width: 600px;
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.card {
  /* 自适应宽度 */
  flex: 1;
  min-width: 200px;
  height: 120px;
  border-radius: 8px;
  background: #f5f5f5;
}
```

### 3\.2\.4 窗口尺寸适配约束

配合 BrowserWindow 配置，固定窗口缩放边界，从根源避免布局错乱：

```javascript
const mainWindow = new BrowserWindow({
  width: 800,
  height: 600,
  minWidth: 600,  // 最小宽度
  minHeight: 500, // 最小高度
  maxWidth: 1400, // 最大宽度
  maxHeight: 900  // 最大高度
})
```

## 3\.3 自定义窗口标题栏设计

默认 Electron 原生标题栏样式简陋、无法自定义颜色、图标、按钮，绝大多数商业级桌面应用（VS Code、钉钉、飞书）均采用**自定义无边框标题栏**。本节实现极简可商用的自定义标题栏。

引用来源：[掘金\-Electron 自定义标题栏商用方案](https://juejin.cn/post/7205222614889435192)

### 3\.3\.1 主进程关闭原生边框

```javascript
const mainWindow = new BrowserWindow({
  width: 800,
  height: 600,
  // 关闭原生标题栏和边框
  frame: false,
  // 开启窗口拖拽适配
  webPreferences: {
    preload: path.join(__dirname, 'preload.js')
  }
})
```

### 3\.3\.2 前端自定义标题栏样式

```html
<!-- 自定义标题栏 -->
<div class="title-bar">
  <div class="title-text">Electron 自定义客户端</div>
  <div class="title-btn">
    <span>−</span>
    <span>□</span>
    <span>×</span>
  </div>
</div>
```

```css
.title-bar {
  width: 100%;
  height: 32px;
  background: #24292f;
  /* 关键：开启窗口拖拽 */
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  color: #fff;
  font-size: 14px;
}

/* 按钮区域禁止拖拽，保证点击生效 */
.title-btn {
  -webkit-app-region: no-drag;
  display: flex;
  gap: 20px;
  cursor: pointer;
}
```

### 3\.3\.3 核心关键点解析

- **\-webkit\-app\-region: drag**：核心属性，实现窗口拖拽移动

- **\-webkit\-app\-region: no\-drag**：按钮区域取消拖拽，解决拖拽与点击冲突

- 无边框窗口默认自带系统阴影，无需额外样式适配，兼顾美观与性能

## 3\.4 跨窗口样式共享与隔离

复杂 Electron 项目会存在**多窗口场景**（主窗口、弹窗窗口、设置窗口），容易出现样式污染、全局样式覆盖、样式重复加载等问题，本节讲解样式共享与隔离方案。

### 3\.4\.1 样式隔离方案

Electron 每个窗口对应独立渲染进程，**默认样式完全隔离**，A 窗口样式不会污染 B 窗口，但全局引入的公共样式会重复加载，存在性能冗余。

### 3\.4\.2 样式共享最佳实践

1. **公共样式抽离**：将重置样式、全局字体、通用组件样式抽离为 `common\.css`，所有窗口统一引入

2. **模块化样式**：单个窗口专属样式使用 scoped 模式（React/Vue），避免全局污染

3. **禁止内联全局样式**：统一通过样式文件管理，便于多窗口统一迭代

### 3\.4\.3 动态样式注入（高级用法）

主进程统一注入公共样式，实现所有窗口样式统一，无需每个页面单独引入：

```javascript
// 主进程为所有窗口注入全局样式
mainWindow.webContents.on('dom-ready', () => {
  const css = `body { font-family: "Microsoft Yahei"; }`
  mainWindow.webContents.insertCSS(css)
})
```

## 3\.5 深色模式与主题切换实现

深浅色主题切换是现代桌面应用的标配功能，Electron 支持**系统跟随、手动切换、主题持久化**三种模式，实现简单且适配全平台。

引用来源：[Electron nativeTheme 主题官方API](https://www.electronjs.org/zh/docs/latest/api/native-theme)

### 3\.5\.1 核心模块：nativeTheme

Electron 内置 `nativeTheme` 模块，可读取系统主题、监听主题切换、手动强制切换主题。

### 3\.5\.2 完整主题切换代码

#### 1\. preload\.js 暴露主题API

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('themeApi', {
  // 切换深色/浅色模式
  setTheme: (mode) => ipcRenderer.send('set-theme', mode),
  // 监听系统主题变化
  onThemeChange: (cb) => ipcRenderer.on('theme-change', cb)
})
```

#### 2\. main\.js 主题逻辑

```javascript
const { nativeTheme, ipcMain } = require('electron')

// 手动切换主题
ipcMain.on('set-theme', (e, mode) => {
  nativeTheme.themeSource = mode // system / light / dark
})

// 监听系统主题自动变化
nativeTheme.on('updated', () => {
  mainWindow.webContents.send('theme-change', nativeTheme.shouldUseDarkColors)
})
```

#### 3\. 前端样式适配

```css
/* 浅色模式默认样式 */
body {
  background: #ffffff;
  color: #333;
}

/* 深色模式样式 */
body.dark {
  background: #1a1a1a;
  color: #f5f5f5;
}
```

### 3\.5\.3 主题持久化

搭配本地存储，记录用户上次主题选择，重启应用不重置，贴合商用需求。

## 3\.6 React在Electron中的最佳实践

目前主流 Electron 商业项目均采用 React 作为 UI 框架，相比原生 HTML，工程化、组件化、维护性更强。本节讲解 Electron \+ React 组合的企业级最佳实践。

引用来源：[掘金\-Electron\+React 工程化实战指南](https://juejin.cn/post/7643128972365148197)

### 3\.6\.1 项目搭建规范

不推荐手动配置，优先使用官方脚手架搭建，规避版本冲突：

```bash
# 初始化 React+Electron 项目
npm create electron-vite@latest electron-react-demo -- --template react
```

### 3\.6\.2 核心工程化规范

#### 1\. 目录结构规范

```Plain Text
electron-react-demo/
├── electron/         # 主进程、预加载脚本目录
├── src/              # React前端页面
├── public/           # 静态资源
└── package.json      # 统一配置
```

#### 2\. 安全规范强制落地

- 永久关闭 `nodeIntegration`，开启 `contextIsolation`

- 所有主进程 API、原生能力统一通过 preload 脚本暴露

- React 组件内禁止直接操作 Electron 原生 API，遵循分层架构

#### 3\. 样式方案选择

- 优先使用 Tailwind CSS / Styled Components，适配桌面端响应式

- 组件样式全部开启 scoped，杜绝多窗口样式污染

- 全局主题、公共样式统一抽离，适配深浅色切换

### 3\.6\.3 常见问题解决方案

- **打包资源路径报错**：配置 Vite 静态资源绝对路径，规避 Electron 打包后路径错乱

- **热更新失效**：开发环境开启主进程、渲染进程双热更新，提升开发效率

- **窗口闪烁**：开启窗口预加载，等待页面渲染完成后再显示窗口

```javascript
// 解决窗口闪烁问题
const mainWindow = new BrowserWindow({ show: false })
mainWindow.once('ready-to-show', () => {
  mainWindow.show()
})
```

## 本章总结

本章我们全面掌握了 Electron 桌面端 UI 开发核心能力，区别于普通网页开发，全部适配桌面端专属场景：

1. 掌握 Electron 专属 HTML/CSS 最佳实践，规避桌面端样式bug

2. 实现多分辨率、高分屏 DPI 适配，解决 UI 模糊、布局错乱问题

3. 落地商用级自定义无边框标题栏，适配主流客户端UI风格

4. 理清多窗口样式共享与隔离方案，适配复杂多窗口项目

5. 实现系统跟随、手动切换的深浅色主题功能，支持持久化存储

6. 掌握 React\+Electron 企业级工程化规范，适配大型项目开发

## 参考来源

\[1\] Electron 官方文档：桌面端UI开发规范 [https://www\.electronjs\.org/zh/docs/latest/tutorial/desktop\-environment\-integration](https://www.electronjs.org/zh/docs/latest/tutorial/desktop-environment-integration)

\[2\] Electron 官方文档：DPI适配API [https://www\.electronjs\.org/zh/docs/latest/api/app\#appsetautohidedpiadjustmentenabledenabled](https://www.electronjs.org/zh/docs/latest/api/app#appsetautohidedpiadjustmentenabledenabled)

\[3\] Electron 官方文档：主题切换nativeTheme [https://www\.electronjs\.org/zh/docs/latest/api/native\-theme](https://www.electronjs.org/zh/docs/latest/api/native-theme)

\[4\] 掘金技术博文：Electron自定义标题栏商用方案 [https://juejin\.cn/post/7205222614889435192](https://juejin.cn/post/7205222614889435192)

\[5\] 掘金技术博文：Electron\+React工程化实战 [https://juejin\.cn/post/7643128972365148197](https://juejin.cn/post/7643128972365148197)


