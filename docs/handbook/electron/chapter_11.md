# Electron 开发实战（十一）：自动更新机制｜服务架构、公私网更新、版本回滚全解

大家好，本章是 Electron 实战系列第十一章，也是**商用客户端上线运维核心章节**。上一章我们完成了全平台打包、签名、分发配置，应用可以正常安装使用。但桌面客户端区别于 Web 项目，无法用户手动刷新更新，版本迭代、漏洞修复、功能升级都依赖**自动更新机制**落地。

很多新手项目上线后，只能靠用户卸载重装完成迭代，用户体验极差、版本碎片化严重。本章将从零搭建企业级 Electron 自动更新体系，覆盖更新服务架构设计、electron\-updater 核心使用、GitHub 公有更新、私有服务器部署、更新日志展示、版本回滚容错全流程，所有代码可直接上线使用。

本章方案适配 **Windows / macOS / Linux** 三端，支持静默更新、手动更新、增量更新、异常回滚，完全满足商业化客户端迭代需求。

参考前置：[electron\-builder 官方自动更新文档](https://www.electron.build/auto-update)、[掘金 Electron 自动更新全解](https://juejin.cn/post/7517040607706120244)、[Electron 全量/增量更新实战](https://juejin.cn/post/7416311252580352034)

## 11\.1 设计更新服务器架构

在编写代码之前，我们需要先理清 Electron 自动更新的完整架构与更新流程，避免后续开发逻辑混乱。Electron 自动更新采用 **客户端主动轮询 \+ 服务端静态资源托管** 架构，无需复杂后端接口，轻量化、高可用。

### 11\.1\.1 整体架构流程

标准商用更新流程分为 5 个核心步骤：

1. **版本检测**：客户端启动/用户手动点击，请求服务端版本信息文件

2. **版本比对**：对比本地版本与服务端最新版本，判断是否需要更新

3. **资源下载**：存在新版本则自动/手动下载对应平台安装包与校验文件

4. **静默安装**：下载完成后，等待用户关闭应用或直接后台重启更新

5. **版本落地**：更新完成，覆盖旧版本，记录更新日志与版本信息

### 11\.1\.2 服务端文件规范

更新服务器仅需托管静态文件，无需动态服务，核心文件如下（electron\-builder 自动生成）：

- `latest\.yml`：版本配置文件（核心），记录最新版本号、更新描述、包地址、文件哈希值

- 各平台安装包：exe / dmg / AppImage / deb

- 校验文件：保证安装包完整性，防止传输篡改

### 11\.1\.3 两种更新架构选型

|更新模式|适用场景|优势|劣势|
|---|---|---|---|
|GitHub Releases 公有更新|开源项目、外网公开客户端|零服务器成本、开箱即用、无需运维|不支持内网、速度慢、无法私有化部署|
|私有服务器更新|商用项目、内网客户端、私有化部署|速度快、安全可控、支持权限控制、增量更新|需简单静态服务器托管|

## 11\.2 使用electron\-updater模块

**electron\-updater** 是 Electron 官方配套的自动更新模块，深度适配 electron\-builder，内置版本比对、断点续传、哈希校验、静默安装、更新事件监听，是目前生态唯一商用级更新方案，完全替代自研更新逻辑。

### 11\.2\.1 模块安装

```bash
# 安装核心更新模块
npm install electron-updater --save
# yarn
yarn add electron-updater
# pnpm
pnpm add electron-updater

```

### 11\.2\.2 基础全局配置

在主进程初始化全局更新配置，统一控制更新行为，适配生产环境：

```javascript
// main.js 主进程
const { autoUpdater } = require('electron-updater')
const { app } = require('electron')

// 全局更新配置
autoUpdater.autoDownload = true // 检测到新版本自动下载
autoUpdater.autoInstallOnAppQuit = true // 关闭应用自动安装更新
autoUpdater.allowDowngrade = false // 禁止版本降级
autoUpdater.logger = require('electron-log') // 绑定更新日志
autoUpdater.logger.transports.file.level = 'info'

console.log('当前应用版本：', app.getVersion())

```

### 11\.2\.3 核心更新事件监听

完整监听更新全生命周期事件，实现进度展示、状态提示、异常捕获：

```javascript
// 等待渲染进程窗口初始化完成后再监听
function initUpdateEvent(mainWindow) {
  // 开始检测更新
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update:status', '正在检测最新版本...')
  })

  // 发现新版本
  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('update:available', info)
  })

  // 无新版本
  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update:status', '当前已是最新版本')
  })

  // 更新下载进度
  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('update:progress', progress.percent.toFixed(2))
  })

  // 下载完成
  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update:finished', '更新包下载完成，重启即可生效')
  })

  // 更新报错
  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('update:error', '更新失败：' + err.message)
  })
}

```

### 11\.2\.4 主动检测更新方法

```javascript
// 主动触发版本检测
async function checkUpdate() {
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    console.error('版本检测异常：', err)
  }
}

```

## 11\.3 GitHub Releases自动更新

GitHub Releases 更新方案适合开源、外网公开项目，无需自建服务器，打包后上传 Release 即可自动适配更新，零成本、快速落地 。

### 11\.3\.1 package\.json 配置

在 build 节点新增 GitHub 发布配置，绑定仓库地址：

```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "你的GitHub用户名",
      "repo": "你的项目仓库名",
      "releaseType": "release"
    }
  }
}

```

### 11\.3\.2 发布更新流程

1. 修改 `package\.json` 中的 `version` 版本号（必须递增）

2. 执行打包命令，生成各平台安装包与 `latest\.yml` 文件

3. GitHub 仓库新建 Release，上传所有打包产物

4. 客户端启动自动检测，即可触发更新流程

### 11\.3\.3 优缺点与避坑

- **优点**：零运维、全自动、无需服务器、官方适配

- **缺点**：国内访问速度慢、更新失败率高、不支持内网私有化

- **避坑**：必须打正式 Release 标签，草稿版本无法触发更新；版本号必须严格递增

## 11\.4 私有服务器更新实现

商用项目、内网项目、私有化部署项目，必须使用**私有静态服务器更新**，速度快、安全可控、支持权限校验、增量更新，是企业级首选方案 。

### 11\.4\.1 私有服务配置

修改 publish 为通用静态资源模式，适配任意 HTTP 服务器（Nginx / Apache / 静态托管服务）：

```json
{
  "build": {
    "publish": {
      "provider": "generic",
      "url": "https://你的更新服务器地址/update/"
    }
  }
}

```

### 11\.4\.2 服务端部署步骤

1. 搭建静态文件服务器（Nginx 最简配置即可）

2. 将打包产物（exe、dmg、AppImage、latest\.yml）全部上传至服务器 `/update/` 目录

3. 开启服务器跨域、静态资源访问权限

4. 客户端启动后自动请求服务端 `latest\.yml` 比对版本

### 11\.4\.3 Nginx 极简配置示例

```nginx
server {
  listen 80;
  server_name 你的域名;
  root /服务器文件存放路径/update;
  index latest.yml;

  # 允许跨域
  add_header Access-Control-Allow-Origin *;
  # 静态资源缓存
  location ~* \.(yml|exe|dmg|AppImage)$ {
    expires 1h;
  }
}
```

### 11\.4\.4 手动切换更新地址（适配多环境）

支持开发/测试/生产环境切换不同更新服务器地址：

```javascript
// 根据环境动态设置更新地址
if(process.env.NODE_ENV === 'production') {
  autoUpdater.setFeedURL('https://生产服务器/update/')
} else {
  autoUpdater.setFeedURL('https://测试服务器/update/')
}

```

## 11\.5 更新日志与版本回滚

完整的更新体系，不仅包含升级能力，还需要**更新日志展示、版本容错、异常回滚**机制，解决更新失败、新版本 Bug、用户误更新等线上问题。

### 11\.5\.1 更新日志展示

`latest\.yml` 支持自定义更新描述，客户端可直接读取展示更新日志：

#### 1\. 配置更新日志

```json
{
  "build": {
    "releaseNotes": "1. 修复已知Bug\n2. 新增自动更新功能\n3. 优化网络请求稳定性"
  }
}

```

#### 2\. 客户端读取展示

```javascript
// 在 update-available 事件中获取更新日志
autoUpdater.on('update-available', (info) => {
  console.log('新版本号：', info.version)
  console.log('更新日志：', info.releaseNotes)
  // 渲染进程弹窗展示更新内容
})

```

### 11\.5\.2 手动重启更新

默认关闭应用自动更新，可手动触发立即重启安装，提升用户体验：

```javascript
// 手动立即更新重启
function quitAndInstall() {
  autoUpdater.quitAndInstall()
}

```

### 11\.5\.3 版本回滚与容错机制（商用核心）

线上新版本存在严重 Bug 时，需要快速回滚、禁止用户更新、兜底旧版本，实现方案如下：

1. **服务端下架新版本**：删除服务器最新包，重新上传稳定旧版本包与 `latest\.yml`

2. **客户端禁止降级保护**：通过 `allowDowngrade: false` 防止异常降级

3. **强制更新兜底**：极低版本客户端强制升级至稳定版本

### 11\.5\.4 更新异常重试策略

```javascript
// 更新失败自动重试
let retryCount = 0
autoUpdater.on('error', async () => {
  if(retryCount < 3) {
    retryCount++
    setTimeout(() => {
      checkUpdate()
    }, 5000)
  }
})

```

## 本章总结

本章完整落地 Electron 商用级自动更新体系，彻底解决客户端版本迭代、更新运维难题，核心知识点复盘：

1. 掌握自动更新**整体架构与服务规范**，理解客户端\+服务端完整更新流程

2. 熟练使用 electron\-updater 模块，实现更新检测、下载、进度监听、自动安装全逻辑

3. 掌握 GitHub Releases 公有更新方案，快速落地开源项目自动迭代

4. 精通私有服务器更新部署，适配企业内网、私有化商用项目

5. 实现更新日志展示、异常重试、版本回滚容错，完善线上运维能力

结合本章内容，你的 Electron 项目已具备**开发→打包→分发→自动迭代→运维容错**完整商业化能力，完全满足上线交付标准。

## 参考来源

\[1\] electron\-builder 官方自动更新文档 [https://www\.electron\.build/auto\-update](https://www.electron.build/auto-update)

\[2\] 掘金：Electron 私有服务器自动更新完整实战 [https://juejin\.cn/post/7517040607706120244](https://juejin.cn/post/7517040607706120244)

\[3\] 掘金：Electron 全量/增量更新深度解析 [https://juejin\.cn/post/7416311252580352034](https://juejin.cn/post/7416311252580352034)

\[4\] 掘金：Electron 企业级自动更新架构设计 [https://juejin\.cn/post/7535006257344577588](https://juejin.cn/post/7535006257344577588)

\[5\] 掘金：GitHub Releases 自动更新落地教程 [https://juejin\.cn/post/7397013935104606259](https://juejin.cn/post/7397013935104606259)


