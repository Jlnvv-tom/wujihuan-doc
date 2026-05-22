# Electron 开发实战（六）：系统交互与原生功能实战全解

哈喽大家好！前面章节我们掌握了 Electron 进程通信、UI 布局、本地文件与数据持久化能力，已经可以搭建功能完整的桌面应用主体框架。

而**系统原生交互能力**，是 Electron 应用区别于普通 Web 项目的核心优势，也是提升桌面端用户体验的关键。商业级桌面软件几乎都会用到托盘常驻、系统通知、全局快捷键、自定义菜单、剪贴板、截图能力。

本章聚焦 Electron 六大原生系统能力，从零讲解落地实战方案，代码精简可直接商用，适配 Windows/Mac 跨平台兼容，补齐桌面应用最后一块能力拼图。

参考前置：[Electron Tray 官方文档](https://www.electronjs.org/zh/docs/latest/api/tray)、[全局快捷键官方API](https://www.electronjs.org/zh/docs/latest/api/global-shortcut)、[掘金原生菜单实战指南](https://juejin.cn/post/7400671870873419810)

## 6\.1 系统托盘与通知功能

系统托盘（Tray）是桌面常驻应用的标配功能，可实现**最小化隐藏托盘、后台常驻、右键菜单、系统消息推送**，适配聊天软件、工具类、后台服务类应用场景。搭配系统通知，可实现离线消息、任务完成、状态提醒等交互。

### 6\.1\.1 系统托盘 Tray 实战

核心模块：`Tray`，仅主进程可调用，需搭配托盘图标与右键菜单使用。

引用来源：[Electron Tray 官方API](https://www.electronjs.org/zh/docs/latest/api/tray)

```javascript
// main.js 主进程
const { app, Tray, Menu } = require('electron')
const path = require('path')

let tray = null

app.whenReady().then(() => {
  // 初始化托盘，需传入本地图标（建议16*16/32*32透明png）
  tray = new Tray(path.join(__dirname, 'tray.png'))
  // 托盘悬浮提示
  tray.setToolTip('Electron 桌面客户端')

  // 托盘右键菜单
  const trayMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow.show() },
    { label: '隐藏窗口', click: () => mainWindow.hide() },
    { type: 'separator' }, // 分割线
    { label: '退出应用', click: () => app.quit() }
  ])

  tray.setContextMenu(trayMenu)

  // 托盘图标双击事件
  tray.on('double-click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })
})

```

### 6\.1\.2 系统通知 Notification

Electron 兼容系统原生通知，无需额外权限，支持标题、内容、图标、点击回调，跨平台自动适配系统样式。

```javascript
// 渲染进程 / 主进程均可使用
function showSystemNotice() {
  const notice = new Notification({
    title: '系统通知',
    body: 'Electron 原生通知推送成功！',
    icon: path.join(__dirname, 'logo.png')
  })
  // 通知点击回调
  notice.on('click', () => mainWindow.focus())
  notice.show()
}

```

### 6\.1\.3 最佳实践与避坑

- 托盘图标必须使用**透明底 PNG**，避免 Windows 托盘背景突兀

- Mac 托盘图标为状态栏展示，Windows 为右下角任务栏，代码无需兼容适配

- 应用退出时必须销毁托盘实例，避免托盘图标残留内存泄漏

## 6\.2 全局快捷键与本地快捷键

快捷键分为**全局快捷键**和**本地快捷键**，是提升桌面操作效率的核心功能。全局快捷键全局生效，窗口最小化/后台依旧触发；本地快捷键仅窗口聚焦时生效。

引用来源：[Electron 全局快捷键官方文档](https://www.electronjs.org/zh/docs/latest/api/global-shortcut)

### 6\.2\.1 全局快捷键（globalShortcut）

全局快捷键由主进程 `globalShortcut` 模块注册，系统全局监听，不受窗口焦点影响。

```javascript
const { app, globalShortcut } = require('electron')

app.whenReady().then(() => {
  // 注册全局快捷键 Ctrl+Shift+S
  const isRegister = globalShortcut.register('Ctrl+Shift+S', () => {
    console.log('全局快捷键触发：截图/保存')
  })

  // 判断是否注册成功（处理快捷键冲突）
  if (!isRegister) {
    console.log('快捷键注册失败，已被占用')
  }
})

// 应用退出注销所有快捷键（必写，防止系统残留监听）
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

```

### 6\.2\.2 本地快捷键（菜单快捷键）

本地快捷键依托 Menu 菜单实现，仅应用窗口激活时生效，无全局冲突风险，适合页面刷新、新建、保存等场景。

```javascript
const { Menu } = require('electron')
const menuTemplate = [
  {
    label: '操作',
    submenu: [
      {
        label: '刷新页面',
        accelerator: 'Ctrl+R', // 本地快捷键
        click: () => mainWindow.webContents.reload()
      }
    ]
  }
]
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

```

### 6\.2\.3 快捷键核心规范

- 跨平台统一修饰键：`CommandOrControl`，自动适配 Mac\(Command\) / Windows\(Ctrl\)

- 全局快捷键必须在应用退出时主动注销，避免后台占用

- 优先使用不常用组合键，规避系统、浏览器、输入法快捷键冲突

## 6\.3 菜单栏与上下文菜单

Electron 支持两种原生菜单：顶部**应用菜单栏**、右键**上下文菜单**，可完全自定义样式、点击事件、快捷键，替代系统默认简陋菜单。

引用来源：[掘金 Electron 自定义菜单实战](https://juejin.cn/post/7400671870873419810)

### 6\.3\.1 顶部应用菜单栏自定义

```javascript
const { Menu, app } = require('electron')

// 菜单模板
const menuTemplate = [
  {
    label: '文件',
    submenu: [
      { label: '新建窗口', accelerator: 'Ctrl+N', click: () => createWindow() },
      { type: 'separator' },
      { label: '退出', accelerator: 'Ctrl+Q', role: 'quit' }
    ]
  },
  {
    label: '视图',
    submenu: [
      { label: '全屏', role: 'togglefullscreen' },
      { label: '开发者工具', accelerator: 'F12', role: 'toggledevtools' }
    ]
  }
]

// 挂载全局菜单
const menu = Menu.buildFromTemplate(menuTemplate)
Menu.setApplicationMenu(menu)

```

内置 `role` 属性可直接调用系统原生行为，无需手动写逻辑，兼容性更强。

### 6\.3\.2 右键上下文菜单

实现页面右键自定义菜单，覆盖浏览器默认右键菜单：

```javascript
// 主进程监听页面右键事件
mainWindow.webContents.on('context-menu', (e, params) => {
  const contextMenu = Menu.buildFromTemplate([
    { label: '复制', accelerator: 'Ctrl+C', role: 'copy' },
    { label: '粘贴', accelerator: 'Ctrl+V', role: 'paste' },
    { type: 'separator' },
    { label: '刷新页面', click: () => mainWindow.reload() }
  ])
  // 弹出右键菜单
  contextMenu.popup()
})

```

### 6\.3\.3 隐藏默认菜单栏

极简客户端可直接关闭顶部默认菜单，沉浸式展示页面：

```javascript
// 关闭全局菜单栏
Menu.setApplicationMenu(null)
// 仅Windows生效，隐藏菜单栏空白区域
mainWindow.setMenuBarVisibility(false)

```

## 6\.4 剪贴板操作

Electron 内置 `clipboard` 原生剪贴板模块，支持**文本、图片、富文本**读写，跨进程、跨软件通用，比前端原生剪贴板 API 兼容性更强、权限更高。

引用来源：[Electron clipboard 官方API](https://www.electronjs.org/zh/docs/latest/api/clipboard)

### 6\.4\.1 文本剪贴板读写

```javascript
const { clipboard } = require('electron')

// 写入剪贴板（复制）
clipboard.writeText('Electron 剪贴板测试文本')

// 读取剪贴板（粘贴）
const text = clipboard.readText()
console.log('剪贴板文本：', text)

```

### 6\.4\.2 图片剪贴板操作

支持截图、本地图片写入剪贴板，适配截图分享、图片复制场景：

```javascript
const { clipboard, nativeImage } = require('electron')
const path = require('path')

// 读取本地图片写入剪贴板
const img = nativeImage.createFromPath(path.join(__dirname, 'test.png'))
clipboard.writeImage(img)

// 读取剪贴板图片
const clipImg = clipboard.readImage()
// 判断剪贴板是否存在图片
if (!clipImg.isEmpty()) {
  clipImg.save(path.join(__dirname, 'save.png'))
}

```

### 6\.4\.3 业务场景总结

- 文本复制、密钥拷贝、链接分享

- 截图后自动写入剪贴板，用户直接粘贴使用

- 跨软件图片、文本同步传输

## 6\.5 桌面截图与原生图片处理

Electron 依托 `desktopCapturer` 模块实现原生桌面截图、窗口截图能力，无需依赖第三方截图工具，可自定义截图逻辑、保存图片、剪贴板同步。

引用来源：[desktopCapturer 截图官方文档](https://www.electronjs.org/zh/docs/latest/api/desktop-capturer)

### 6\.5\.1 获取桌面截图源

支持获取所有屏幕、打开窗口的截图源，实现全屏/指定窗口截图：

```javascript
const { desktopCapturer } = require('electron')

// 获取所有桌面截图源
async function getScreenCapture() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window']
  })
  // 获取主屏截图
  const mainScreen = sources.find(item => item.name === '整个屏幕')
  console.log('截图源信息：', mainScreen)
}

```

### 6\.5\.2 截图保存与图片处理

结合 nativeImage、fs 模块，实现截图预览、本地保存、剪贴板同步：

```javascript
async function screenShotAndSave() {
  const sources = await desktopCapturer.getSources({ types: ['screen'] })
  const source = sources[0]
  // 获取截图位图
  const image = source.thumbnail
  // 保存到本地
  const savePath = path.join(app.getPath('userData'), 'screenshot.png')
  image.save(savePath)
  // 同步到剪贴板
  clipboard.writeImage(image)
}

```

### 6\.5\.3 原生图片处理能力

`nativeImage` 是 Electron 专属图片处理模块，支持图片缩放、裁剪、格式转换、base64 互转：

```javascript
const { nativeImage } = require('electron')

// 图片缩放
const img = nativeImage.createFromPath('test.png')
const resizeImg = img.resize({ width: 400, height: 300 })

// 转base64用于页面预览
const base64 = resizeImg.toDataURL()

```

### 6\.5\.4 实战场景

- 自定义截图工具、自动截图存档

- 聊天软件截图发送、bug 反馈截图上传

- 图片压缩、尺寸调整、格式统一处理

## 本章总结

本章全覆盖 Electron 主流系统原生交互能力，补齐桌面应用核心体验功能，核心知识点复盘：

1. 掌握**系统托盘\+系统通知**常驻后台能力，实现商用软件后台运行、消息提醒

2. 区分全局/本地快捷键差异，熟练实现跨平台快捷键注册、冲突处理、注销规范

3. 精通顶部菜单栏、右键上下文菜单自定义，适配极简/传统两种UI风格

4. 掌握剪贴板文本、图片读写，实现跨软件数据复制粘贴

5. 落地桌面截图、窗口截图与原生图片缩放、保存、预览能力

至此，你已经掌握 Electron **进程、通信、UI、文件存储、系统原生交互**全套基础能力，完全具备独立开发商用桌面应用的能力。

## 参考来源

\[1\] Electron 官方文档：Tray 系统托盘 [https://www\.electronjs\.org/zh/docs/latest/api/tray](https://www.electronjs.org/zh/docs/latest/api/tray)

\[2\] Electron 官方文档：globalShortcut 全局快捷键 [https://www\.electronjs\.org/zh/docs/latest/api/global\-shortcut](https://www.electronjs.org/zh/docs/latest/api/global-shortcut)

\[3\] Electron 官方文档：clipboard 剪贴板 [https://www\.electronjs\.org/zh/docs/latest/api/clipboard](https://www.electronjs.org/zh/docs/latest/api/clipboard)

\[4\] Electron 官方文档：desktopCapturer 截图能力 [https://www\.electronjs\.org/zh/docs/latest/api/desktop\-capturer](https://www.electronjs.org/zh/docs/latest/api/desktop-capturer)

\[5\] 掘金技术博文：Electron 自定义菜单实战全解 [https://juejin\.cn/post/7400671870873419810](https://juejin.cn/post/7400671870873419810)

\[6\] 掘金技术博文：Electron 快捷键冲突解决方案 [https://juejin\.cn/post/7437040574156439603](https://juejin.cn/post/7437040574156439603)


