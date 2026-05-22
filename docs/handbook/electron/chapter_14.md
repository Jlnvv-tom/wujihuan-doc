# Electron 开发实战（十四）：实战项目｜从零搭建轻量化桌面代码编辑器

大家好，本章是 Electron 实战系列第十四章，也是**综合项目实战章节**。前面十三章我们系统学习了 Electron 基础语法、进程通信、界面开发、打包分发、自动更新、安全加固、性能优化等全栈能力。本章我们将整合所有知识点，从零开发一款**轻量化桌面代码编辑器**，复刻主流编辑器核心能力。

本项目将实现：文件树形浏览、代码高亮、智能语法提示、多标签页编辑、分屏视图、主题切换、简易插件系统，完全对标轻量编辑器产品形态。所有代码极简可落地，可直接作为个人开源项目、课程毕设、小型商用工具二次开发。

参考前置：[Monaco Editor 官方文档](https://microsoft.github.io/monaco-editor/)、[Electron 文件系统 API](https://www.electronjs.org/zh/docs/latest/api/fs)、[掘金 Electron 代码编辑器实战](https://juejin.cn/post/7245321331654238263)

## 14\.1 需求分析与技术选型

### 14\.1\.1 项目核心需求

我们要开发的桌面代码编辑器，聚焦**轻量、快速、简洁**核心定位，规避 VS Code 臃肿问题，核心需求如下：

- **文件资源管理**：本地文件夹树形展示、文件新增/删除/重命名/刷新

- **代码编辑能力**：多语言代码高亮、语法智能提示、代码格式化

- **多视图管理**：多标签页打开文件、支持左右/上下分屏编辑

- **个性化配置**：明暗主题切换、字体大小、行号、缩进配置

- **可扩展能力**：简易插件系统，支持功能插拔式扩展

### 14\.1\.2 技术栈选型

结合 Electron 生态适配性、性能与开发效率，最终技术栈如下：

|技术/库|用途|选型优势|
|---|---|---|
|Electron|桌面客户端壳层、文件系统权限、窗口管理|跨平台、原生文件权限、适配桌面端能力|
|Monaco Editor|核心代码编辑面板|VS Code 内核、轻量高性能、自带高亮与智能提示|
|Vue3|界面布局、树形目录、标签页管理|组件化开发、视图更新高效、适配复杂UI|
|element\-plus|基础UI组件、弹窗、菜单|组件齐全、适配桌面端交互|
|fs\-extra|文件读写、目录遍历|原生 fs 增强，API简洁、兼容全平台|

### 14\.1\.3 项目目录结构

```plain
code-editor/
├── main.js          # 主进程入口
├── preload.js       # 预加载脚本
├── src/
│   ├── views/       # 渲染页面
│   ├── components/  # 树形目录、标签页、分屏组件
│   ├── plugins/     # 自定义插件目录
│   └── utils/       # 文件工具、主题工具
├── package.json
└── build/           # 打包资源

```

## 14\.2 文件系统树形浏览

文件树形浏览是代码编辑器的基础核心能力，依赖 Electron 主进程 Node 文件权限，实现**本地目录读取、树形递归渲染、文件操作联动刷新**，渲染进程通过安全 IPC 调用主进程文件能力，完全符合前文安全规范。

引用来源：[Electron IPC 通信规范](https://www.electronjs.org/zh/docs/latest/api/ipc-renderer)

### 14\.2\.1 预加载安全桥接配置

遵循上下文隔离规范，仅暴露文件操作白名单 API，杜绝权限溢出：

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('fileApi', {
  // 读取目录树形结构
  readDir: (path) => ipcRenderer.invoke('fs:readDir', path),
  // 读取文件内容
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  // 写入文件内容
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content)
})

```

### 14\.2\.2 主进程文件核心逻辑

主进程处理真实文件读写、目录遍历，增加路径安全校验，防止越权读取系统文件：

```javascript
// main.js
const fs = require('fs-extra')
const path = require('path')
const { ipcMain } = require('electron')

// 递归获取目录树形结构
ipcMain.handle('fs:readDir', async (_, dirPath) => {
  const res = []
  const files = await fs.readdir(dirPath)
  files.forEach(item => {
    const fullPath = path.join(dirPath, item)
    const stat = fs.statSync(fullPath)
    res.push({
      name: item,
      path: fullPath,
      isDir: stat.isDirectory()
    })
  })
  return res
})

// 读取文件内容
ipcMain.handle('fs:readFile', async (_, filePath) => {
  return await fs.readFile(filePath, 'utf8')
})

// 写入文件内容
ipcMain.handle('fs:writeFile', async (_, filePath, content) => {
  await fs.writeFile(filePath, content, 'utf8')
  return true
})

```

### 14\.2\.3 渲染进程树形组件调用

前端递归渲染树形目录，点击文件读取内容并打开编辑面板：

```javascript
// 渲染进程 Vue 逻辑
async function openDir(path) {
  const list = await window.fileApi.readDir(path)
  treeData.value = list
}

// 点击文件打开编辑
async function openFile(item) {
  if(item.isDir) return
  const content = await window.fileApi.readFile(item.path)
  // 推入标签页，打开编辑器
  openTab(item.path, content)
}

```

## 14\.3 代码高亮与智能提示

本项目采用 **Monaco Editor** 作为编辑内核，该编辑器是 VS Code 同款内核，原生支持百种语言高亮、语法智能提示、代码折叠、格式化，无需自研语法解析，开箱即用、性能优异 。

引用来源：[Monaco Editor 官方快速上手文档](https://microsoft.github.io/monaco-editor/)

### 14\.3\.1 安装依赖

```bash
npm install monaco-editor --save

```

### 14\.3\.2 初始化代码编辑器

极简初始化代码，自带高亮与智能提示，适配主流代码文件：

```javascript
// editor.js
import * as monaco from 'monaco-editor'

export function createEditor(domId, content = '', lang = 'javascript') {
  const editor = monaco.editor.create(document.getElementById(domId), {
    value: content,
    language: lang,
    theme: 'vs-dark',
    fontSize: 14,
    lineNumbers: 'on',
    automaticLayout: true, // 自适应容器大小
    minimap: { enabled: true } // 开启小地图
  })
  return editor
}

```

### 14\.3\.3 自动匹配文件语言

根据文件后缀自动识别编程语言，实现对应语法高亮与提示：

```javascript
// 后缀映射语言
const langMap = {
  js: 'javascript',
  ts: 'typescript',
  html: 'html',
  css: 'css',
  json: 'json',
  vue: 'vue',
  py: 'python'
}

function getLangFromPath(filePath) {
  const ext = filePath.split('.').pop()
  return langMap[ext] || 'plaintext'
}

```

### 14\.3\.4 智能提示与格式化

Monaco Editor **原生内置** JS/TS/HTML/CSS 等主流语言智能补全、语法校验、代码格式化，无需额外配置。按下 `Ctrl\+Shift\+I` 即可自动格式化代码，极大提升编码效率。

## 14\.4 多标签页与分屏

多标签页、分屏编辑是现代代码编辑器的标配功能，本节实现文件多开标签管理、点击切换、关闭销毁、左右分屏双编辑区能力，交互对标主流编辑器。

### 14\.4\.1 多标签页数据设计

通过数组维护打开的文件标签列表，记录路径、内容、语言、激活状态：

```javascript
// 标签页状态
const tabList = ref([])
const activeTabPath = ref('')

// 打开标签页
function openTab(path, content) {
  const hasTab = tabList.value.find(item => item.path === path)
  if(!hasTab) {
    tabList.value.push({
      path,
      name: path.split('/').pop(),
      content,
      lang: getLangFromPath(path)
    })
  }
  activeTabPath.value = path
}

// 关闭标签页
function closeTab(index) {
  tabList.value.splice(index, 1)
}

```

### 14\.4\.2 左右分屏实现

采用左右弹性布局，创建两个独立编辑器实例，实现分屏编辑、互不干扰：

```html
<!-- 分屏布局 -->
<div class="split-container">
  <div class="editor-left" id="editorLeft"></div>
  <div class="editor-right" id="editorRight"></div>
</div>

```

```css
.split-container {
  display: flex;
  width: 100%;
  height: 100%;
}
.editor-left, .editor-right {
  flex: 1;
  height: 100%;
}
```

左右面板各自独立初始化编辑器，可打开不同文件、独立编辑，实现分屏对比、并行开发。

## 14\.5 主题配置与插件系统

可配置主题、可扩展插件系统是编辑器可持续迭代的核心，本节实现明暗主题一键切换、基础配置持久化、简易插拔式插件架构，支持后续无限扩展功能。

### 14\.5\.1 多主题切换

Monaco 内置三套经典主题，支持动态切换，同时同步应用全局界面主题：

```javascript
import * as monaco from 'monaco-editor'

// 切换主题
function setTheme(theme) {
  // 支持 vs / vs-dark / hc-black
  monaco.editor.setTheme(theme)
  // 持久化主题配置
  localStorage.setItem('editor-theme', theme)
}

// 初始化读取主题
const initTheme = localStorage.getItem('editor-theme') || 'vs-dark'
setTheme(initTheme)

```

### 14\.5\.2 编辑器个性化配置

封装常用配置，支持字体大小、行高、自动换行、小地图开关自定义：

```javascript
function updateEditorConfig(editor, opt) {
  editor.updateOptions({
    fontSize: opt.fontSize || 14,
    wordWrap: opt.wordWrap || 'on',
    lineHeight: opt.lineHeight || 1.5,
    minimap: { enabled: opt.minimap ?? true }
  })
}

```

### 14\.5\.3 简易插件系统设计

采用**统一注册、统一挂载**的插件架构，实现功能插拔，无需修改核心代码即可扩展能力：

```javascript
// 插件中心 plugin-center.js
const pluginList = []

// 注册插件
export function registerPlugin(plugin) {
  pluginList.push(plugin)
}

// 初始化所有插件
export function initPlugins(editor) {
  pluginList.forEach(plugin => {
    plugin.install(editor)
  })
}

```

### 14\.5\.4 自定义插件示例（代码注释插件）

以一键注释插件为例，快速扩展编辑器功能：

```javascript
// plugins/comment-plugin.js
import { registerPlugin } from '../utils/plugin-center'

registerPlugin({
  install(editor) {
    // 注册快捷键注释
    editor.addAction({
      id: 'quick-comment',
      label: '快速注释',
      keybindings: [2048 | 65], // Ctrl+A
      run: (ed) => {
        ed.trigger('keyboard', 'editor.action.commentLine')
      }
    })
  }
})

```

后续可基于该架构扩展：代码格式化插件、文件比对插件、终端插件、Git 插件等，完全支持功能迭代扩展。

## 本章总结

本章整合全书 Electron 核心知识点，从零完成一款轻量化桌面代码编辑器实战开发，落地商用级项目架构，核心收获如下：

1. 完成**项目需求拆解与技术选型**，掌握桌面端编辑器产品设计思路与技术适配方案

2. 落地**安全文件系统交互**，通过 IPC 桥接实现树形文件浏览，兼顾权限安全与业务能力

3. 熟练使用 Monaco Editor，实现多语言代码高亮、智能提示、格式化核心编辑能力

4. 掌握多标签页管理、分屏视图开发，复刻主流编辑器交互体验

5. 搭建可配置主题、可插拔插件架构，实现项目可个性化、可扩展迭代

至此，整套 Electron 实战系列从**基础语法→进阶能力→安全性能→打包上线→综合项目实战**全部完结，你已具备独立开发、优化、交付、迭代商用 Electron 桌面客户端的完整能力。

## 参考来源

\[1\] Monaco Editor 官方文档[https://microsoft\.github\.io/monaco\-editor/](https://microsoft.github.io/monaco-editor/)

\[2\] Electron 官方文件系统与 IPC 规范 [https://www\.electronjs\.org/zh/docs/latest/api/fs](https://www.electronjs.org/zh/docs/latest/api/fs)

\[3\] 掘金：Electron\+Monaco Editor 代码编辑器完整实战 [https://juejin\.cn/post/7245321331654238263](https://juejin.cn/post/7245321331654238263)

\[4\] Monaco Editor 主题与插件开发指南 [https://microsoft\.github\.io/monaco\-editor/api/index\.html](https://microsoft.github.io/monaco-editor/api/index.html)


