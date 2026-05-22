# Electron 开发实战（五）：文件系统与本地数据持久化全解

大家好，本章是 Electron 实战系列第五章。前面我们掌握了进程通信、UI 布局、主题切换等核心能力，一款完整的桌面应用，离不开**本地文件读写、目录管理、数据持久化**能力。

Electron 最大的优势之一就是**完整继承 Node\.js 文件系统能力**，同时结合桌面端专属对话框、安全路径规范，能够轻松实现浏览器网页无法做到的本地文件操作。

本章将从零讲解 Node\.js FS 模块在 Electron 中的实战用法、文件读写、目录操作、文件流处理、系统文件对话框，以及适配不同业务场景的**本地数据持久化方案**，所有代码精简可落地，适配生产环境。

参考来源前置：[Node\.js FS 官方文档](https://nodejs.org/api/fs.html)、[Electron Dialog 官方 API](https://www.electronjs.org/zh/docs/latest/api/dialog)、[掘金 Electron 本地存储最佳实践](https://juejin.cn/post/7420229457804099603)

## 5\.1 Node\.js文件系统模块

### 5\.1\.1 Electron 中 FS 模块的特殊性

普通网页受浏览器沙箱限制，无法直接操作本地文件，而 Electron 主进程完整搭载 Node\.js 环境，可直接使用内置 `fs` 模块实现任意本地文件、目录的读写操作。

结合前一章安全规范：**渲染进程禁止直接使用 fs 模块**，所有文件操作必须放在主进程执行，通过 IPC 通信调用，避免权限泄露与安全风险。

### 5\.1\.2 FS 模块核心分类

Node\.js 文件系统模块分为两类，适配不同业务场景：

- **回调式 API**：传统异步写法，通过回调函数获取结果，兼容旧项目

- **Promise 异步 API（推荐）**：`fs\.promises` 提供 async/await 支持，代码更简洁、可读性更高，生产环境首选

- **同步 API**：阻塞线程，仅适合初始化、配置读取等极少耗时场景

### 5\.1\.3  Electron 专属路径规范

桌面应用禁止将用户数据、配置文件存在安装目录（升级/卸载易丢失），Electron 提供官方安全路径 `app\.getPath\(\&\#39;userData\&\#39;\)`，用于存放应用专属持久化数据，跨平台兼容、安全稳定 。

```javascript
const { app } = require('electron')
const path = require('path')

// 获取应用专属数据目录（跨平台自动适配）
const USER_DATA_PATH = app.getPath('userData')
// 拼接自定义配置文件路径
const CONFIG_FILE_PATH = path.join(USER_DATA_PATH, 'config.json')

```

## 5\.2 读取与写入本地文件

文件读写是桌面应用最常用的能力，适用于**本地配置保存、日志记录、用户数据缓存、离线文件存储**等场景。本节使用 Promise 异步语法，实现标准读写方案。

### 5\.2\.1 写入本地文件（核心代码）

支持自动创建文件、覆盖写入，适配 JSON 结构化数据存储：

```javascript
// main.js 主进程代码
const fs = require('fs/promises')
const path = require('path')
const { app, ipcMain } = require('electron')

// 写入本地文件方法
async function writeLocalFile(fileName, data) {
  try {
    const filePath = path.join(app.getPath('userData'), fileName)
    // 将对象转为JSON字符串写入
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8')
    return { code: 200, msg: '写入成功' }
  } catch (error) {
    return { code: 500, msg: '写入失败', error }
  }
}

// IPC 暴露给渲染进程调用
ipcMain.handle('file-write', async (e, fileName, data) => {
  return await writeLocalFile(fileName, data)
})

```

### 5\.2\.2 读取本地文件（核心代码）

兼容文件不存在容错，避免应用报错崩溃：

```javascript
// 读取本地文件方法
async function readLocalFile(fileName) {
  try {
    const filePath = path.join(app.getPath('userData'), fileName)
    // 判断文件是否存在
    await fs.access(filePath)
    const res = await fs.readFile(filePath, 'utf8')
    return { code: 200, data: JSON.parse(res) }
  } catch (error) {
    return { code: 404, msg: '文件不存在或读取失败' }
  }
}

// IPC 暴露读取接口
ipcMain.handle('file-read', async (e, fileName) => {
  return await readLocalFile(fileName)
})

```

### 5\.2\.3 渲染进程调用（preload \+ 页面）

preload\.js 安全暴露文件操作 API：

```javascript
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('fileApi', {
  writeFile: (name, data) => ipcRenderer.invoke('file-write', name, data),
  readFile: (name) => ipcRenderer.invoke('file-read', name)
})

```

页面业务调用：

```javascript
// 写入数据
await window.fileApi.writeFile('userConfig.json', { theme: 'dark', fontSize: 14 })
// 读取数据
const res = await window.fileApi.readFile('userConfig.json')
console.log(res.data)

```

### 5\.2\.4 原子写入最佳实践（防文件损坏）

直接覆盖写入可能因程序崩溃导致文件损坏，生产环境推荐**临时文件\+重命名** 原子写入方案 ：

```javascript
async function safeWriteFile(fileName, data) {
  const basePath = app.getPath('userData')
  const filePath = path.join(basePath, fileName)
  const tempPath = path.join(basePath, `${fileName}.tmp`)
  // 先写入临时文件
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8')
  // 写入成功后替换原文件
  await fs.rename(tempPath, filePath)
}

```

## 5\.3 目录操作与文件流处理

### 5\.3\.1 常用目录操作

实际开发中常需要创建文件夹、遍历文件、删除目录等操作，以下是精简通用代码：

```javascript
// 创建目录（递归创建，自动创建多级目录）
async function createDir(dirName) {
  const dirPath = path.join(app.getPath('userData'), dirName)
  await fs.mkdir(dirPath, { recursive: true })
  return dirPath
}

// 遍历目录所有文件
async function readDir(dirName) {
  const dirPath = path.join(app.getPath('userData'), dirName)
  return await fs.readdir(dirPath)
}

// 删除空目录
async function delDir(dirName) {
  const dirPath = path.join(app.getPath('userData'), dirName)
  await fs.rmdir(dirPath)
}

```

### 5\.3\.2 文件流处理（大文件适配）

普通读写 API 会一次性加载文件内容，**大文件（视频、日志、压缩包）**会导致内存溢出。此时需使用文件流（Stream）分段读写，适合文件上传、分片复制、日志增量写入场景。

引用来源：[Node\.js Stream 流官方文档](https://nodejs.org/api/stream.html)

```javascript
const fs = require('fs')
// 大文件复制（流方式，低内存占用）
function copyBigFile(sourcePath, targetPath) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(sourcePath)
    const writeStream = fs.createWriteStream(targetPath)
    readStream.pipe(writeStream)
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
}

```

核心优势：分段读取、边读边写，不会将完整文件载入内存，完美适配 GB 级大文件处理。

## 5\.4 使用对话框选择文件或目录

Electron 内置 `dialog` 原生对话框模块，可调用系统原生文件选择窗口，比网页 input 选择器体验更好、权限更高，支持文件筛选、目录选择、多文件选择等能力。

引用来源：[Electron Dialog 官方 API](https://www.electronjs.org/zh/docs/latest/api/dialog)

### 5\.4\.1 文件选择对话框

```javascript
const { dialog, ipcMain } = require('electron')

// 打开文件选择器
ipcMain.handle('open-file-dialog', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择文件',
    // 限制可选文件类型
    filters: [{ name: '文本文件', extensions: ['txt', 'json', 'md'] }],
    properties: ['openFile']
  })
  return res.filePaths
})

```

### 5\.4\.2 目录选择对话框

```javascript
// 打开目录选择器
ipcMain.handle('open-dir-dialog', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择存储目录',
    properties: ['openDirectory']
  })
  return res.filePaths
})
```

### 5\.4\.3 保存文件对话框

```javascript
// 保存文件弹窗
ipcMain.handle('save-file-dialog', async (e, data) => {
  const res = await dialog.showSaveDialog({
    title: '保存文件',
    defaultPath: 'output.json'
  })
  // 写入用户选择的路径
  if (!res.canceled) {
    await fs.writeFile(res.filePath, JSON.stringify(data))
  }
  return res
})

```

### 5\.4\.4 渲染进程调用方式

```javascript
// preload 暴露API
contextBridge.exposeInMainWorld('dialogApi', {
  selectFile: () => ipcRenderer.invoke('open-file-dialog'),
  selectDir: () => ipcRenderer.invoke('open-dir-dialog'),
  saveFile: (data) => ipcRenderer.invoke('save-file-dialog', data)
})

```

## 5\.5 本地数据持久化方案

Electron 拥有多套本地存储方案，不同方案适配不同业务场景。本节对比主流持久化方案，提供**场景化选型 \+ 落地代码**，告别存储选型纠结。

引用来源：[掘金 Electron 多存储方案对比](https://juejin.cn/post/7420229457804099603)

### 5\.5\.1 方案选型对比

|存储方案|适用场景|优点|缺点|
|---|---|---|---|
|LocalStorage/SessionStorage|轻量临时配置、简单标记|零配置、前端原生支持|容量小、仅字符串、重启不持久、多窗口不同步|
|原生 FS 读写 JSON|自定义配置、中小型数据|无依赖、灵活可控、高性能|需手动封装增删改查|
|electron\-store（推荐）|项目主流配置、用户偏好设置|开箱即用、自动持久化、类型友好|不适合海量数据|
|NeDB/SQLite|大量结构化数据、离线业务数据|支持查询、分页、事务|引入额外依赖、配置稍复杂|

### 5\.5\.2 主流方案实战：electron\-store（商用首选）

`electron\-store` 是 Electron 官方社区推荐的持久化库，自动适配 `userData` 路径、自动序列化、开箱即用，是绝大多数桌面应用的首选方案。

#### 1\. 安装依赖

```bash
npm install electron-store --save
```

#### 2\. 主进程封装使用

```javascript
const Store = require('electron-store')
const store = new Store({
  // 默认配置
  defaults: {
    theme: 'light',
    fontSize: 14,
    autoSave: true
  }
})

// 写入数据
store.set('theme', 'dark')
// 读取数据
console.log(store.get('theme'))
// 删除单个字段
store.delete('fontSize')
// 清空所有数据
// store.clear()

```

#### 3\. IPC 暴露给渲染进程

```javascript
ipcMain.handle('store-set', (e, key, value) => store.set(key, value))
ipcMain.handle('store-get', (e, key) => store.get(key))

```

### 5\.5\.3 海量数据方案：NeDB 轻量数据库

针对日志、列表、离线数据等大量结构化数据，使用 NeDB 嵌入式数据库，无需安装服务，轻量高效 。

```bash
npm install nedb --save
```

```javascript
const Datastore = require('nedb')
const path = require('path')
const db = new Datastore({ filename: path.join(app.getPath('userData'), 'data.db'), autoload: true })

// 插入数据
db.insert({ name: '测试数据', time: Date.now() })
// 查询数据
db.find({}, (err, docs) => console.log(docs))

```

### 5\.5\.4 持久化方案最佳实践总结

- **简单配置、用户偏好**：优先使用 electron\-store，开发效率最高

- **自定义灵活配置**：使用 FS \+ JSON 原子写入，无第三方依赖

- **大量结构化数据**：使用 NeDB/SQLite 数据库

- **禁止使用 LocalStorage 存储核心数据**：窗口刷新、多窗口同步存在严重问题

## 本章总结

本章完整掌握了 Electron 文件系统与本地数据持久化的全套实战能力，核心知识点复盘：

1. 理解 Electron 中 Node\.js FS 模块的使用规范与安全边界，区分主/渲染进程文件操作权限

2. 掌握文件读写、原子写入、目录操作、文件流大文件处理核心代码

3. 熟练使用系统对话框实现文件/目录选择、文件保存功能

4. 吃透四大本地存储方案的选型场景，掌握 electron\-store、NeDB 商用落地写法

5. 遵循官方路径规范，解决数据丢失、文件损坏、多窗口不同步等常见问题

结合本章内容，你已经可以实现桌面应用**离线数据存储、配置持久化、本地文件管理**等核心业务能力。

## 参考来源

\[1\] Node\.js 官方文档：FS 文件系统模块 [https://nodejs\.org/api/fs\.html](https://nodejs.org/api/fs.html)

\[2\] Electron 官方文档：Dialog 对话框 API [https://www\.electronjs\.org/zh/docs/latest/api/dialog](https://www.electronjs.org/zh/docs/latest/api/dialog)

\[3\] 掘金技术博文：Electron 本地存储方案全对比 [https://juejin\.cn/post/7420229457804099603](https://juejin.cn/post/7420229457804099603)

\[4\] 掘金技术博文：Electron 文件原子写入最佳实践 [https://juejin\.cn/post/7637803221285863434](https://juejin.cn/post/7637803221285863434)

\[5\] GitHub 官方示例：Electron NeDB 存储方案 [https://github\.com/SimulatedGREG/electron\-vue](https://github.com/SimulatedGREG/electron-vue)


