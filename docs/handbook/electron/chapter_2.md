# Electron 开发实战（二）：核心概念深度详解 \| 进程通信\+窗口高级\+生命周期全掌握


哈喽大家好～在上一章中，我们成功搭建了 Electron 开发环境并跑通了 Hello World 项目。但想要真正开发可落地的桌面应用，必须吃透 Electron **核心底层概念**。

本章我们聚焦：**主 / 渲染进程深度拆解、IPC 进程通信、BrowserWindow 高级用法、完整应用生命周期、系统原生模块实战**，覆盖 Electron 开发 80% 的高频核心知识点，新手也能快速进阶。


## 2\.1 主进程与渲染进程的深度解析

Electron 最核心、最容易让新手困惑的就是**双进程模型**，所有窗口、通信、权限、系统调用都基于这个模型设计。吃透它，你就掌握了 Electron 的半壁江山。

### 1\. 核心定义与区别

Electron 基于 **Chromium 多进程架构 \+ Node\.js** 构建，分为两类独立进程：

|维度|主进程（Main Process）|渲染进程（Renderer Process）|
|---|---|---|
|数量|全局**唯一**|多实例，每个窗口一个独立进程|
|运行环境|Node\.js|Chromium 浏览器内核|
|权限等级|最高（可调用所有系统 API）|受限（默认无 Node 权限）|
|核心职责|窗口管理、生命周期、系统调用、进程调度|UI 渲染、用户交互、前端逻辑|
|入口文件|`main\.js`|`index\.html` 及前端脚本|

> 官方权威参考：[Electron 进程模型官方文档](https://www.electronjs.org/zh/docs/latest/tutorial/process-model)
> 
> 

### 2\. 深度运行原理

1. **应用启动**：Electron 读取 `package\.json` 的 `main` 字段，运行主进程脚本

2. **主进程初始化**：创建窗口、加载预加载脚本、配置系统权限

3. **渲染进程启动**：每个窗口对应一个渲染进程，加载 HTML/CSS/JS

4. **进程隔离**：两个进程内存独立、不能直接访问，必须通过 IPC 通信

### 3\. 安全规范（必看）

Electron 12\+ 版本**默认禁用**渲染进程直接访问 Node\.js API，强制使用 **预加载脚本（preload\.js）** 做安全中转，这是企业级开发的强制规范。

---

## 2\.2 进程间通信机制（IPC）

进程通信（IPC）是 Electron 开发**最常用、最重要**的能力，用于主进程 ↔ 渲染进程互相传递数据、调用方法。

### 1\. 通信核心 API

Electron 提供两套通信 API：

- `ipcMain`：主进程使用，监听 / 发送消息

- `ipcRenderer`：渲染进程使用，必须在 preload 中暴露

### 2\. 通信图解

```Plain Text
渲染进程 <--> preload.js（安全桥接） <--> 主进程
```

### 3\. 实战代码示例

#### （1）preload\.js（安全暴露通信 API）

```javascript
const { contextBridge, ipcRenderer } = require('electron')

// 安全暴露给渲染进程
contextBridge.exposeInMainWorld('ipc', {
  // 渲染进程 -> 主进程
  send: (channel, data) => ipcRenderer.send(channel, data),
  // 主进程 -> 渲染进程
  on: (channel, callback) => ipcRenderer.on(channel, callback)
})
```

引用来源：[Electron 官方 IPC 通信示例](https://www.electronjs.org/zh/docs/latest/tutorial/ipc)

#### （2）主进程监听消息（main\.js）

```javascript
const { app, BrowserWindow, ipcMain } = require('electron')

// 监听渲染进程消息
ipcMain.on('render-to-main', (event, data) => {
  console.log('收到渲染进程消息：', data)
  // 回复消息给渲染进程
  event.sender.send('main-to-render', '主进程已收到消息！')
})
```

#### （3）渲染进程发送 / 接收消息（index\.html）

```html
<script>
  // 发送消息到主进程
  window.ipc.send('render-to-main', 'Hello 主进程！')

  // 监听主进程回复
  window.ipc.on('main-to-render', (event, data) => {
    alert(data)
  })
</script>
```

### 4\. 通信模式总结

- **单向通信**：`ipcRenderer\.send` \+ `ipcMain\.on`

- **双向通信**：发送 \+ 回复

- **同步 / 异步**：Electron IPC 默认异步，不阻塞 UI

---

## 2\.3 BrowserWindow 模块的高级用法

`BrowserWindow` 是 Electron 最核心的 UI 模块，用于创建、控制桌面窗口。基础用法我们在上一章用过，本章讲解**企业级高级配置**。

### 1\. 常用高级配置项

```javascript
const mainWindow = new BrowserWindow({
  width: 1000,
  height: 700,
  minWidth: 600, // 最小宽度
  minHeight: 400, // 最小高度
  resizable: true, // 是否允许缩放
  title: 'Electron 高级窗口',
  frame: true, // 是否显示窗口边框
  transparent: false, // 窗口透明
  alwaysOnTop: false, // 窗口置顶
  // 安全核心配置
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false, // 关闭 Node 集成
    contextIsolation: true, // 开启上下文隔离（必开）
  }
})
```

### 2\. 窗口高级方法

```javascript
// 窗口居中
mainWindow.center()

// 窗口最大化
mainWindow.maximize()

// 窗口最小化
mainWindow.minimize()

// 关闭窗口
mainWindow.close()

// 打开调试工具
mainWindow.webContents.openDevTools()

// 加载远程网页
mainWindow.loadURL('https://juejin.cn/')
```

### 3\. 无边框窗口（自定义标题栏）

```javascript
const win = new BrowserWindow({ frame: false })
```

适用场景：客户端、播放器、工具类软件的沉浸式 UI。

> 实战参考：[掘金 \- Electron 自定义窗口标题栏实战](https://juejin.cn/post/7205222614889435192)
> 
> 

---

## 2\.4 应用生命周期管理

`app` 模块负责管理 Electron 应用的**完整生命周期**，从启动、就绪、窗口加载、后台运行到退出。

### 1\. 完整生命周期流程图解

```Plain Text
启动应用 → ready（就绪） → 创建窗口 → 运行中 → 关闭窗口 → 退出应用
```

### 2\. 核心生命周期事件（实战必备）

```javascript
// 1. 应用就绪（最核心，必须用它创建窗口）
app.whenReady().then(() => {
  createWindow()
})

// 2. 所有窗口关闭
app.on('window-all-closed', () => {
  // Mac 系统默认不退出，Windows/Linux 直接退出
  if (process.platform !== 'darwin') app.quit()
})

// 3. 应用激活（Mac 专属）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// 4. 应用即将退出
app.on('before-quit', () => {
  console.log('应用准备关闭...')
})

// 5. 应用退出
app.on('quit', () => {
  console.log('应用已退出')
})
```

### 3\. 生命周期关键点

- **`ready`**：Electron 初始化完成，唯一安全创建窗口的时机

- **`window\-all\-closed`**：控制跨平台退出行为

- **`activate`**：解决 Mac 点击 Dock 图标重新打开窗口

官方文档：[Electron app 生命周期](https://www.electronjs.org/zh/docs/latest/api/app)

---

## 2\.5 常用系统原生模块初探

Electron 最大优势就是可以直接调用**系统原生能力**，本节介绍 4 个开发中最常用的系统模块，附极简实战代码。

### 1\. dialog 弹窗模块（文件选择 / 系统提示）

作用：调用系统级弹窗，替代浏览器 `alert`，更美观更强大。

```javascript
const { dialog } = require('electron')

// 打开文件选择器
dialog.showOpenDialog({
  title: '选择文件',
  properties: ['openFile']
}).then(result => {
  console.log('选中文件：', result.filePaths)
})
```

### 2\. Menu 菜单模块（自定义顶部菜单）

```javascript
const { Menu } = require('electron')

const template = [
  { label: '文件', submenu: [{ label: '退出', role: 'quit' }] }
]

const menu = Menu.buildFromTemplate(template)
Menu.setApplicationMenu(menu)
```

### 3\. shell 模块（打开默认浏览器 / 文件夹）

```javascript
const { shell } = require('electron')

// 打开默认浏览器访问网页
shell.openExternal('https://juejin.cn/')

// 打开本地文件夹
shell.showItemInFolder('C:/Users/')
```

### 4\. globalShortcut 全局快捷键

```javascript
const { globalShortcut } = require('electron')

app.whenReady().then(() => {
  // 注册 Ctrl+X 快捷键
  globalShortcut.register('CommandOrControl+X', () => {
    console.log('触发全局快捷键')
  })
})
```

---

## 本章总结

本章我们完整吃透了 Electron 五大核心概念：

1. **主 / 渲染进程**：理解隔离机制、权限、运行环境

2. **IPC 通信**：掌握主进程 ↔ 渲染进程安全数据传递

3. **BrowserWindow**：学会窗口高级配置与方法

4. **应用生命周期**：掌控应用从启动到退出全流程

5. **系统原生模块**：快速实现弹窗、菜单、快捷键、打开外部链接

掌握本章内容，你已经具备开发**完整可落地 Electron 项目**的基础能力。

---

## 参考来源

\[1\] Electron 官方中文文档：[https://www\.electronjs\.org/zh/docs/latest/](https://www.electronjs.org/zh/docs/latest/)
\[2\] 掘金精品教程：Electron 进程通信与安全实践 [https://juejin\.cn/post/7581664885861302282](https://juejin.cn/post/7581664885861302282)
\[3\] 掘金实战：BrowserWindow 高级配置与自定义窗口 [https://juejin\.cn/post/7205222614889435192](https://juejin.cn/post/7205222614889435192)


