# Electron 开发实战（十）：应用打包与分发｜全平台打包、签名、自定义协议实战

大家好，本章是 Electron 实战系列最后一章核心技术篇。前面我们完成了 Electron 环境搭建、业务开发、原生交互、网络通信、多媒体处理、调试优化全流程开发，所有代码功能落地后，最后一步也是上线必备环节：**项目打包、跨平台分发、应用上线配置**。

很多开发者开发阶段功能正常，打包后出现白屏、资源丢失、启动报错、无法安装、Mac 被拦截、Linux 无法运行等问题，本质是不熟悉 Electron 打包机制与各平台分发规范。

本章基于业界主流的 **electron\-builder** 工具，全覆盖 Windows/Mac/Linux 三端打包方案，讲解平台专属配置、签名认证、命令行参数、自定义协议唤起，所有配置开箱即用，完全适配商用项目上线分发标准。

参考前置：[electron\-builder 官方文档](https://www.electron.build/)、[掘金 electron\-builder 全平台打包指南](https://juejin.cn/post/7492797097433104393)、[Electron 签名与分发实战](https://juejin.cn/post/7350495799661477926)

## 10\.1 使用 electron\-builder 进行打包

**electron\-builder** 是目前 Electron 生态最主流、功能最全的打包构建工具，零冗余配置、支持多平台并行打包、自动资源适配、内置代码签名、增量构建，完全替代老旧的 electron\-packager，是商用项目首选打包方案 。

### 10\.1\.1 环境安装与基础配置

仅需安装开发依赖，无需全局挂载，适配所有 Electron 项目：

```bash
# 安装打包核心依赖
npm install electron-builder --save-dev
# yarn 安装
yarn add electron-builder -D
# pnpm 安装
pnpm add electron-builder -D

```

### 10\.1\.2 基础打包脚本配置

在 `package\.json` 中配置统一打包命令，区分开发打包、全量打包、分平台打包：

```json
{
  "name": "electron-demo",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "dev": "electron .",
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  }
}

```

### 10\.1\.3 通用打包核心配置（全平台生效）

在 `package\.json` 新增 `build` 配置项，统一配置应用信息、资源过滤、输出目录，适配三端通用：

```json
{
  "build": {
    "productName": "Electron实战客户端",
    "appId": "com.electron.demo",
    "copyright": "Copyright © 2026 Electron开发实战",
    "output": "release",
    "files": [
      "**/*",
      "!node_modules/.cache",
      "!.vscode",
      "!README.md"
    ]
  }
}

```

配置说明：

- **productName**：应用展示名称（桌面图标、安装界面显示）

- **appId**：应用唯一标识（签名、更新、协议唤起必备，不可重复）

- **output**：打包产物输出目录，统一归集文件

- **files**：打包资源过滤，剔除无用文件，减小包体积

### 10\.1\.4 打包常见前置避坑

- 静态资源路径统一使用**相对路径**，绝对路径会导致打包后资源丢失、白屏

- 开发依赖与生产依赖严格区分，减少最终安装包体积

- 首次打包需联网下载平台编译依赖，可配置淘宝镜像加速

## 10\.2 Windows平台安装包制作

Windows 是桌面应用分发最主流平台，electron\-builder 支持生成 **NSIS 安装包、便携免安装包、msi 安装包**，适配普通用户安装、企业部署等不同场景 。

### 10\.2\.1 Windows专属配置

在 build 节点下新增 `win` 配置，自定义图标、安装模式、架构、卸载逻辑：

```json
{
  "build": {
    "win": {
      "icon": "./build/icon.ico",
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    }
  }
}

```

### 10\.2\.2 配置参数详解

- **icon**：Windows 图标必须为 `\.ico` 格式，推荐 256\*256 分辨率

- **target: nsis**：主流安装包格式，支持自定义安装路径、快捷方式

- **oneClick: false**：关闭一键安装，允许用户自主选择安装目录

- **allowToChangeInstallationDirectory**：开启安装路径自定义，贴合用户使用习惯

### 10\.2\.3 打包与产物说明

执行打包命令：`npm run build:win`，最终在 release 目录生成：

- `xxx Setup 1\.0\.0\.exe`：标准安装包，支持安装、卸载、创建快捷方式

- 配套安装日志、校验文件，用于版本校验与更新

### 10\.2\.4 Windows打包常见问题

- 打包后白屏：大概率是路由模式为 history、静态资源绝对路径错误

- 图标不生效：确认 ico 格式合规、路径配置正确

- 杀毒软件误报：商用项目需配置代码签名证书

## 10\.3 macOS应用打包与签名

macOS 平台分发规则严格，未签名应用会被系统拦截、提示「无法验证开发者」，无法正常打开。本节讲解 **dmg 安装包打包、开发者签名、公证** 完整流程，适配 Mac 正式分发 。

### 10\.3\.1 macOS基础打包配置

Mac 图标需使用 `\.icns` 格式，专属配置如下：

```json
{
  "build": {
    "mac": {
      "icon": "./build/icon.icns",
      "target": "dmg",
      "hardenedRuntime": true
    }
  }
}

```

执行打包命令：`npm run build:mac`，生成 `\.dmg` 镜像安装包，Mac 用户可直接拖拽安装。

### 10\.3\.2 代码签名配置（商用必备）

开发环境可无签名测试，**上线分发必须签名\+公证**，否则 macOS 系统会拦截运行：

1. 登录 Apple 开发者账号，申请开发者证书（Developer ID Application）

2. 本地安装证书到钥匙串

3. 配置打包环境变量，自动关联证书签名

```bash
# Mac 打包前配置证书环境变量
export CSC_NAME="你的开发者证书名称"
npm run build:mac

```

### 10\.3\.3 应用公证（解决系统拦截）

Mac 新版系统要求应用必须公证，否则无法打开，electron\-builder 支持自动公证，配置后可直接分发：

```json
{
  "build": {
    "afterSign": "build/notarize.js"
  }
}

```

搭配官方公证脚本，实现打包后自动公证，规避「恶意软件拦截」问题。

## 10\.4 Linux发行版包生成

Linux 平台常用于服务端、国产化系统、开源工具分发，electron\-builder 支持生成主流的 `\.deb`、`\.AppImage` 格式，适配 Ubuntu、CentOS 等主流发行版 。

### 10\.4\.1 Linux打包配置

```json
{
  "build": {
    "linux": {
      "icon": "./build/icon.png",
      "target": ["deb", "AppImage"],
      "category": "Utility"
    }
  }
}

```

### 10\.4\.2 产物格式说明

- **deb**：Debian/Ubuntu 系列安装包，支持命令行安装、卸载、版本管理

- **AppImage**：便携免安装包，赋予权限后直接运行，适配所有 Linux 发行版

### 10\.4\.3 运行与安装命令

```bash
# AppImage 赋予权限并运行
chmod +x xxx.AppImage
./xxx.AppImage

# deb 安装
sudo dpkg -i xxx.deb

```

## 10\.5 命令行参数与自定义协议

命令行参数用于应用启动传参、日志调试、静默启动；自定义协议是桌面应用核心能力，支持**浏览器唤起应用、第三方软件跳转应用、参数透传**，常用于分享跳转、授权唤起、 deepLink 场景。

### 10\.5\.1 命令行参数获取

主进程可通过 `process\.argv` 获取启动参数，实现个性化启动逻辑：

```javascript
// main.js 获取启动参数
function getLaunchArgs() {
  // 过滤默认参数，获取自定义入参
  const args = process.argv.slice(2)
  console.log('应用启动参数：', args)
  return args
}

// 示例：静默启动判断
if (getLaunchArgs().includes('--silent')) {
  console.log('静默启动，不展示窗口')
}

```

启动命令传参：`electron \. \-\-silent \-\-token=123456`

### 10\.5\.2 自定义协议注册（DeepLink）

注册自定义协议后，可通过浏览器链接 `electrondemo://xxx` 直接唤起本地应用，跨平台通用。

#### 1\. 打包配置协议

```json
{
  "build": {
    "protocols": {
      "name": "electron-demo-protocol",
      "schemes": ["electrondemo"]
    }
  }
}

```

#### 2\. 监听协议唤起与参数解析

```javascript
// main.js 监听协议唤起
app.on('open-url', (event, url) => {
  event.preventDefault()
  // 解析协议参数：electrondemo://open?token=123
  console.log('协议唤起链接：', url)
  // 执行业务跳转、授权登录等逻辑
})

```

#### 3\. 测试唤起

浏览器地址栏输入：`electrondemo://open?action=login\&amp;id=1001`，即可唤起应用并解析参数。

### 10\.5\.3 多开防冲突处理

协议唤起默认会重复打开应用，通过 Electron 原生方法限制单实例运行：

```javascript
// 单实例锁
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  // 第二个实例唤起时聚焦窗口
  app.on('second-instance', (event, argv, url) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

```

## 本章总结

本章全覆盖 Electron 商用应用打包与分发核心能力，解决打包白屏、安装失败、系统拦截、无法唤起等上线高频问题，核心知识点复盘：

1. 掌握 **electron\-builder** 基础配置、脚本命令、资源优化，实现项目快速打包构建

2. 熟练 Windows 平台 NSIS 安装包制作，自定义安装逻辑、快捷方式、用户权限

3. 精通 macOS 打包、代码签名、应用公证流程，解决系统拦截问题，合规上线分发

4. 掌握 Linux 多格式包生成，适配国产化系统与开源分发场景

5. 实现命令行参数解析、自定义协议唤起、单实例防多开，拓展应用联动能力

至此，整套 Electron 开发实战系列教程全部完结，从**环境搭建→业务开发→原生交互→网络多媒体→调试优化→打包上线**，完整覆盖商用桌面应用全链路开发流程。

## 参考来源

\[1\] electron\-builder 官方文档 [https://www\.electron\.build/](https://www.electron.build/)

\[2\] 掘金技术博文：electron\-builder 全平台打包实战 [https://juejin\.cn/post/7492797097433104393](https://juejin.cn/post/7492797097433104393)

\[3\] 掘金技术博文：Electron 签名与公证完整解决方案 [https://juejin\.cn/post/7350495799661477926](https://juejin.cn/post/7350495799661477926)

\[4\] 掘金技术博文：Electron 自定义协议 DeepLink 实战 [https://juejin\.cn/post/7421567898765434893](https://juejin.cn/post/7421567898765434893)

\[5\] Electron 官方分发规范 [https://www\.electronjs\.org/zh/docs/latest/tutorial/distribution](https://www.electronjs.org/zh/docs/latest/tutorial/distribution)


