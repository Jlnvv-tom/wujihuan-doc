# Electron 开发实战（七）：网络通信与 API 集成全解

大家好，本章是 Electron 实战系列第七章。前面我们搞定了本地文件读写、数据持久化、系统原生交互，一款完整的商业化桌面应用，必然离不开**网络请求、接口对接、实时通信、网络异常处理**能力。

Electron 网络环境和普通网页有明显区别：同时支持浏览器端网络 API \+ Node 原生网络能力，跨域规则、请求权限、离线处理逻辑完全不同。很多新手开发会遇到跨域报错、请求失败、WebSocket 断开重连、离线数据丢失等问题。

本章将系统讲解 Electron 网络通信全套方案，涵盖 HTTP/HTTPS 请求、RESTful 接口集成、WebSocket 实时通信、跨域解决方案、离线状态检测与容错处理，所有代码精简可落地，适配企业级项目开发。

参考前置：[Electron 官方 net 网络模块文档](https://www.electronjs.org/zh/docs/latest/api/net)、[Electron 跨域问题深度解决方案](https://juejin.cn/post/7631615998697947187)

## 7\.1 发起HTTP/HTTPS请求

Electron 提供两套网络请求方案：**渲染进程 fetch/axios**（浏览器内核）、**主进程 net 模块**（Node 原生），两套方案适配不同业务场景，各有优劣。

### 7\.1\.1 两种请求方案对比

- **渲染进程请求（fetch/axios）**：上手简单、适配前端习惯，受 Chromium 跨域策略限制，适合普通业务接口请求

- **主进程 net 模块**：无跨域限制、支持请求拦截、代理配置、更稳定，适合核心数据、敏感接口、大文件请求 

### 7\.1\.2 渲染进程 Fetch 极简请求

无需额外依赖，零配置即可使用，适合常规 GET/POST 接口：

```javascript
// 渲染进程直接调用
async function fetchData() {
  try {
    const res = await fetch('https://jsonplaceholder.typicode.com/todos/1', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await res.json()
    console.log('接口数据：', data)
  } catch (err) {
    console.error('请求失败：', err)
  }
}

```

### 7\.1\.3 主进程 Electron\-net 模块请求

`net` 是 Electron 内置专属网络模块，稳定性高于原生 HTTP，支持链式调用、超时配置、请求取消，生产环境首选 。

```javascript
// main.js 主进程
const { net } = require('electron')

function netRequest() {
  const request = net.request({
    method: 'GET',
    url: 'https://jsonplaceholder.typicode.com/todos/1'
  })
  // 超时时间 5s
  request.setTimeout(5000)

  request.on('response', (res) => {
    let data = ''
    res.on('data', (chunk) => data += chunk)
    res.on('end', () => console.log('net请求结果：', JSON.parse(data)))
  })

  request.on('error', (err) => console.error('请求异常：', err))
  request.end()
}

```

### 7\.1\.4 最佳使用规范

- 普通展示类接口：渲染进程 axios/fetch 快速开发

- 核心业务、支付、隐私数据、大文件：主进程 net 模块请求，更安全稳定

## 7\.2 集成第三方RESTful API

主流后端接口均为 RESTful 风格，具备 GET/POST/PUT/DELETE 规范。本节封装通用 API 请求方法，统一处理请求头、超时、异常、返回格式，适配第三方接口快速集成。

### 7\.2\.1 通用请求封装（主进程）

```javascript
const { net } = require('electron')

// 通用RESTful请求封装
async function requestApi(options) {
  const { url, method = 'GET', data = {} } = options
  return new Promise((resolve, reject) => {
    const req = net.request({ method, url })
    req.setHeader('Content-Type', 'application/json')
    req.setTimeout(8000)

    req.on('response', (res) => {
      let result = ''
      res.on('data', chunk => result += chunk)
      res.on('end', () => resolve(JSON.parse(result)))
    })
    req.on('error', reject)

    // POST/PUT 携带请求体
    if (['POST','PUT'].includes(method)) {
      req.write(JSON.stringify(data))
    }
    req.end()
  })
}

```

### 7\.2\.2 第三方接口实战调用

```javascript
// 调用第三方公开API
async function getDemoApi() {
  // GET请求
  const list = await requestApi({ url: 'https://jsonplaceholder.typicode.com/posts' })
  // POST请求
  const createRes = await requestApi({
    method: 'POST',
    url: 'https://jsonplaceholder.typicode.com/posts',
    data: { title: 'Electron测试', body: '网络请求集成' }
  })
  console.log('GET结果：', list, 'POST结果：', createRes)
}

```

### 7\.2\.3 IPC 暴露给渲染进程

遵循安全规范，渲染进程不直接发起敏感请求，通过 IPC 调用主进程封装方法：

```javascript
// main.js
ipcMain.handle('api-request', async (e, opts) => await requestApi(opts))

// preload.js
contextBridge.exposeInMainWorld('httpApi', {
  request: (opts) => ipcRenderer.invoke('api-request', opts)
})

```

## 7\.3 WebSocket实时通信

实时消息、日志推送、状态同步、在线协作等场景依赖 WebSocket 通信。Electron 同时支持前端原生 WebSocket 和 Node 端 `ws` 库，本节实现**稳定可重连的实时通信方案**。

引用来源：[掘金 Electron WebSocket 重连实战](https://juejin.cn/post/7389652165494677519)

### 7\.3\.1 基础 WebSocket 实现

```javascript
// 渲染进程/主进程均可使用
let ws = null
function initWebSocket() {
  ws = new WebSocket('wss://echo.websocket.org')

  // 连接成功
  ws.onopen = () => ws.send('Electron WebSocket 连接成功')
  // 接收服务端消息
  ws.onmessage = (e) => console.log('收到实时消息：', e.data)
  // 连接关闭
  ws.onclose = () => console.log('连接已关闭')
  // 异常监听
  ws.onerror = (err) => console.error('WS异常：', err)
}

```

### 7\.3\.2 自动重连（生产环境必备）

网络波动、服务重启会导致 WS 断开，添加自动重连逻辑，保证连接稳定性：

```javascript
let ws, reconnectTimer = null
function initWS() {
  ws = new WebSocket('wss://echo.websocket.org')
  ws.onclose = () => {
    // 3秒后自动重连
    reconnectTimer = setTimeout(() => initWS(), 3000)
  }
}
// 页面销毁清除定时器
window.onunload = () => clearTimeout(reconnectTimer)

```

### 7\.3\.3 最佳实践

- 长连接统一在**主进程初始化**，全局唯一连接，避免多窗口重复创建

- 通过 IPC 向各个渲染进程分发实时消息，统一数据流转

- 增加心跳检测、断线重连、重连次数限制，防止死循环请求

## 7\.4 处理跨域与代理设置

跨域是前端开发高频问题，Electron 渲染进程基于 Chromium 内核，默认遵循同源策略。本节提供**开发环境快速解决、生产环境安全解决**两套跨域方案，规避安全风险。

引用来源：[Electron 跨域深度解析](https://juejin.cn/post/7631615998697947187)

### 7\.4\.1 方案一：关闭安全策略（仅开发环境）

通过 `webSecurity: false` 关闭 Chromium 跨域校验，快速解决本地开发跨域问题 。

```javascript
// 开发环境窗口配置
const mainWindow = new BrowserWindow({
  webPreferences: {
    webSecurity: false, // 关闭跨域校验（仅开发使用！）
    preload: path.join(__dirname, 'preload.js')
  }
})

```

**严禁生产环境开启**：该配置会完全关闭浏览器安全校验，存在恶意接口攻击、数据泄露风险，仅用于本地调试。

### 7\.4\.2 方案二：主进程代理请求（生产环境推荐）

核心思路：渲染进程不直接请求跨域接口，通过 IPC 调用主进程 net 模块请求，主进程无跨域限制，完美规避问题，安全合规。

原理：**渲染进程 → IPC → 主进程（无跨域请求）→ 返回数据**

上文 7\.2 章节封装的主进程请求方法，即为生产环境标准跨域解决方案。

### 7\.4\.3 方案三：全局代理配置

适配需要全局代理的内网、测试环境，统一配置网络代理：

```javascript
// main.js 全局代理配置
app.whenReady().then(async () => {
  await mainWindow.webContents.session.setProxy({
    proxyRules: 'http=127.0.0.1:8080;https=127.0.0.1:8080'
  })
})

```

### 7\.4\.4 跨域方案选型总结

- 本地开发调试：临时关闭 webSecurity

- 生产打包上线：主进程代理请求（唯一安全方案）

- 内网测试环境：配置全局 session 代理

## 7\.5 离线状态检测与处理

桌面应用需要常驻后台，网络波动、断网是常态。Electron 提供多层级网络检测方案，可实现**实时网络监听、离线缓存、断网提示、联网自动重试**，大幅提升用户体验。

引用来源：[Electron 官方网络状态检测文档](https://www.electronjs.org/zh/docs/latest/tutorial/online-offline-events)

### 7\.5\.1 渲染进程快速检测

基于 HTML5 原生事件，快速监听网络开关状态：

```javascript
// 实时监听网络变化
window.addEventListener('online', () => alert('网络已恢复'))
window.addEventListener('offline', () => alert('网络已断开'))

// 获取当前网络状态
console.log('是否联网：', navigator.onLine)

```

局限性：仅检测网卡连接状态，无法判断**是否真的可以访问外网**，虚拟网卡会导致误判。

### 7\.5\.2 主进程精准网络检测

使用 Electron 内置 `net\.isOnline\(\)`，内核级检测外网连通性，精准度更高 ：

```javascript
const { net } = require('electron')
// 精准获取外网连通状态
console.log('网络是否可用：', net.isOnline())

// 定时轮询检测真实网络
setInterval(() => {
  const status = net.isOnline()
  mainWindow.webContents.send('network-change', status)
}, 3000)

```

### 7\.5\.3 离线业务容错方案（商用必备）

结合前文持久化存储能力，实现完整离线体验：

1. **离线缓存**：接口请求成功后，通过 electron\-store 缓存响应数据

2. **断网兜底**：离线状态优先读取本地缓存，保证页面正常展示

3. **联网重试**：网络恢复后自动刷新接口、同步离线操作数据

```javascript
// 伪代码：离线容错逻辑
async function getCacheData() {
  if (net.isOnline()) {
    const res = await requestApi({ url: 'xxx' })
    store.set('cacheData', res)
    return res
  } else {
    // 离线返回缓存数据
    return store.get('cacheData')
  }
}

```

## 本章总结

本章全面覆盖 Electron 网络通信核心能力，解决桌面应用网络开发的各类痛点，核心知识点复盘：

1. 掌握两套网络请求方案：渲染进程前端请求、主进程 net 原生请求，适配不同业务场景

2. 封装通用 RESTful API 请求方法，快速集成各类第三方接口

3. 实现 WebSocket 实时通信\+自动重连，适配消息推送、实时同步场景

4. 吃透三种跨域解决方案，区分开发/生产环境，规避安全漏洞

5. 掌握精准网络状态检测，实现离线缓存、断网容错、联网自动恢复能力

结合本章内容，你的 Electron 项目已具备**网络请求、实时通信、异常容错、离线可用**的完整商用级网络能力。

## 参考来源

\[1\] Electron 官方文档：网络模块 net [https://www\.electronjs\.org/zh/docs/latest/api/net](https://www.electronjs.org/zh/docs/latest/api/net)

\[2\] Electron 官方文档：网络状态检测 [https://www\.electronjs\.org/zh/docs/latest/tutorial/online\-offline\-events](https://www.electronjs.org/zh/docs/latest/tutorial/online-offline-events)

\[3\] 掘金技术博文：Electron 跨域问题深度解决方案 [https://juejin\.cn/post/7631615998697947187](https://juejin.cn/post/7631615998697947187)

\[4\] 掘金技术博文：Electron WebSocket 实时通信实战 [https://juejin\.cn/post/7389652165494677519](https://juejin.cn/post/7389652165494677519)

\[5\] 掘金技术博文：Electron 离线容错最佳实践 [https://juejin\.cn/post/7486691956340375593](https://juejin.cn/post/7486691956340375593)


