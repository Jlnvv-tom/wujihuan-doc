# 第9章 多浏览器上下文与移动端调试

> 🌍 现代浏览器不仅仅是单页面容器——标签页、iframe、Service Worker、WebView 构成了一个复杂的多上下文世界。CDP 让你能精确管理每一个上下文。

## 9.1 Target管理：多标签页与iframe通信

### 9.1.1 Target 概念模型

在 CDP 中，一切可调试的对象都是 **Target**：

| Target 类型 | 说明 | 典型场景 |
|-------------|------|---------|
| `page` | 普通网页标签页 | 最常见的调试目标 |
| `iframe` | 内嵌框架 | 广告、嵌入式内容 |
| `service_worker` | Service Worker | 离线缓存、推送通知 |
| `shared_worker` | Shared Worker | 多标签共享后台线程 |
| `other` | 其他（如 DevTools 自身） | — |

> 📖 官方文档：[Target Domain](https://chromedevtools.github.io/devtools-protocol/tot/Target/)

### 9.1.2 枚举所有 Target

```javascript
const CDP = require('chrome-remote-interface');

async function listTargets() {
  const { Target } = await CDP();

  const { targetInfos } = await Target.getTargets();
  targetInfos.forEach(t => {
    console.log(`📌 ${t.type}: ${t.title || '(无标题)'}`);
    console.log(`   URL: ${t.url}`);
    console.log(`   ID: ${t.targetId}`);
    console.log(`   附加: ${t.attached ? '是' : '否'}`);
  });
}
```

### 9.1.3 创建新标签页

```javascript
const { Target } = client;

// 创建新标签页
const { targetId } = await Target.createTarget({
  url: 'https://example.com',
  width: 1920,
  height: 1080,
  newWindow: false,  // 在同一窗口中创建
});

console.log(`🆕 新标签页已创建: ${targetId}`);

// 附加到新标签页
const session = await Target.attachToTarget({
  targetId,
  flatten: true,  // 使用 flat 模式，推荐
});

// 通过 session 操作新标签页
```

### 9.1.4 监听 Target 变化

```javascript
await Target.setDiscoverTargets({ discover: true });

Target.targetCreated((params) => {
  const { targetInfo } = params;
  console.log(`🆕 Target 创建: ${targetInfo.type} - ${targetInfo.url}`);
});

Target.targetDestroyed((params) => {
  console.log(`🗑️ Target 销毁: ${params.targetId}`);
});

Target.targetInfoChanged((params) => {
  const { targetInfo } = params;
  console.log(`🔄 Target 变化: ${targetInfo.title}`);
});
```

### 9.1.5 iframe 通信

CDP 通过 `Target.setAutoAttach` 自动附加到 iframe：

```javascript
await Target.setAutoAttach({
  autoAttach: true,
  waitForDebuggerOnStart: false,
  flatten: true,
  filter: [
    { type: 'iframe' },
  ],
});

Target.attachedToTarget((params) => {
  const { targetInfo, sessionId } = params;
  console.log(`📎 已附加到 iframe: ${targetInfo.url}`);
  console.log(`   Session ID: ${sessionId}`);
});

// 向特定 iframe 发送 CDP 命令
await client.send('Runtime.evaluate', {
  expression: 'document.title',
}, sessionId);
```

---

## 9.2 创建独立的浏览器上下文：隔离Cookie与缓存

### 9.2.1 Browser Context 介绍

**Browser Context** 是浏览器级别的隔离容器，类似于 Chrome 的"访客模式"：

| 特性 | 同一 Context | 不同 Context |
|------|-------------|-------------|
| Cookie | 共享 | 隔离 |
| localStorage | 共享 | 隔离 |
| Cache | 共享 | 隔离 |
| Service Worker | 共享 | 隔离 |
| HSTS | 共享 | 隔离 |

> 📖 官方文档：[Target.createBrowserContext](https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-createBrowserContext)

### 9.2.2 创建与使用 Browser Context

```javascript
async function isolatedBrowsing() {
  const { Target } = client;

  // 创建隔离的浏览器上下文
  const { browserContextId } = await Target.createBrowserContext({
    disposeOnDetach: true,  // 断开后自动清理
    proxyServer: 'http://proxy:8080',  // 可选：为上下文设置独立代理
  });

  console.log(`🧊 创建隔离上下文: ${browserContextId}`);

  // 在隔离上下文中创建标签页
  const { targetId } = await Target.createTarget({
    url: 'https://example.com',
    browserContextId,  // 绑定到隔离上下文
  });

  // 附加并操作
  await Target.attachToTarget({ targetId, flatten: true });

  // ... 操作隔离上下文中的页面 ...

  // 清理隔离上下文（所有关联页面会被关闭）
  await Target.disposeBrowserContext({ browserContextId });
  console.log('🧹 隔离上下文已清理');
}
```

### 9.2.3 实战：多账号并行测试

```javascript
async function multiAccountTest(accounts) {
  const contexts = [];

  for (const account of accounts) {
    // 每个账号一个独立上下文
    const { browserContextId } = await Target.createBrowserContext({
      disposeOnDetach: true,
    });

    const { targetId } = await Target.createTarget({
      url: 'https://example.com/login',
      browserContextId,
    });

    const session = await Target.attachToTarget({
      targetId,
      flatten: true,
    });

    contexts.push({ browserContextId, targetId, session, account });
    console.log(`👤 为 ${account.name} 创建隔离上下文`);
  }

  // 并行登录
  await Promise.all(contexts.map(async (ctx) => {
    const sessionClient = /* 基于 ctx.session 创建的 CDP 客户端 */;
    // 填写登录表单...
    console.log(`✅ ${ctx.account.name} 登录完成`);
  }));

  // 清理
  for (const ctx of contexts) {
    await Target.disposeBrowserContext({
      browserContextId: ctx.browserContextId,
    });
  }
}
```

### 9.2.4 Browser Context vs Incognito

| 对比项 | Browser Context | Chrome 无痕模式 |
|--------|----------------|----------------|
| Cookie 隔离 | ✅ | ✅ |
| 缓存隔离 | ✅ | ✅ |
| Service Worker | ✅ 隔离 | ✅ 隔离 |
| 代理设置 | ✅ 可独立配置 | ❌ 继承主配置 |
| CDP 可编程 | ✅ 完全可编程 | ❌ 启动参数控制 |
| 创建方式 | `Target.createBrowserContext` | `--incognito` 启动参数 |

---

## 9.3 远程调试Android WebView与Chrome

### 9.3.1 连接 Android 设备

远程调试 Android 需要以下步骤：

```
1. USB 连接 Android 设备
2. 开启 USB 调试模式
3. 端口转发: adb forward tcp:9222 localabstract:chrome_devtools_remote
4. 连接 CDP: ws://localhost:9222
```

```bash
# 确认设备已连接
adb devices

# 端口转发（Chrome 浏览器）
adb forward tcp:9222 localabstract:chrome_devtools_remote

# 端口转发（WebView）
adb forward tcp:9222 localabstract:webview_devtools_remote_<package>

# 查看已转发的端口
adb forward --list
```

### 9.3.2 调试 WebView

Android 4.4+ 的 WebView 支持远程调试，但需要在 App 中启用：

```java
// Android 端代码，启用 WebView 调试
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
    WebView.setWebContentsDebuggingEnabled(true);
}
```

```javascript
// PC 端 CDP 连接
async function debugWebView() {
  // 通过 adb 端口转发连接
  const client = await CDP({ port: 9222 });
  const { Page, Runtime } = client;

  await Page.enable();

  // 在 WebView 中执行 JavaScript
  const { result } = await Runtime.evaluate({
    expression: `
      JSON.stringify({
        url: window.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
      })
    `,
    returnByValue: true,
  });

  console.log('📱 WebView 信息:', result.value);
}
```

### 9.3.3 移动端设备模拟

> 📖 官方文档：[Emulation.setDeviceMetricsOverride](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setDeviceMetricsOverride)

```javascript
const DEVICE_PRESETS = {
  iPhone14: {
    width: 390, height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) ...',
    touch: true,
  },
  Pixel7: {
    width: 412, height: 915,
    deviceScaleFactor: 2.625,
    mobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) ...',
    touch: true,
  },
  iPadPro: {
    width: 1024, height: 1366,
    deviceScaleFactor: 2,
    mobile: false,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) ...',
    touch: true,
  },
};

async function emulateDevice(device) {
  const config = DEVICE_PRESETS[device];
  const { Emulation, Network } = client;

  // 设置设备参数
  await Emulation.setDeviceMetricsOverride({
    width: config.width,
    height: config.height,
    deviceScaleFactor: config.deviceScaleFactor,
    mobile: config.mobile,
  });

  // 启用触摸
  await Emulation.setTouchEmulationEnabled({
    enabled: config.touch,
    configuration: 'mobile',
  });

  // 设置 UA
  await Network.setUserAgentOverride({
    userAgent: config.userAgent,
  });

  console.log(`📱 已切换到 ${device} 模式`);
}
```

---

## 9.4 跨域问题处理与CORS绕过策略

### 9.4.1 理解 CORS 限制

CORS（跨域资源共享）是浏览器安全策略，但自动化测试中常常需要绕过：

```
同源策略三要素:
├── 协议 (http/https)
├── 域名 (example.com)
└── 端口 (80/443)
任一不同 = 跨域
```

### 9.4.2 CDP 方式：禁用 Web Security

最直接但最危险的方式：

```bash
# 启动参数
chrome --disable-web-security \
       --user-data-dir=/tmp/chrome-test \
       --remote-debugging-port=9222
```

⚠️ **警告**：仅限测试环境！这会完全关闭同源策略。

### 9.4.3 优雅方案：Fetch 拦截 + 代理

```javascript
async function setupCorsProxy() {
  const { Fetch } = client;

  await Fetch.enable({
    patterns: [
      { urlPattern: 'https://api.other-domain.com/*', requestStage: 'Request' },
    ],
  });

  Fetch.requestPaused(async (params) => {
    const { requestId, request } = params;

    // 通过 CDP 的 continueRequest 修改请求头，添加 CORS 头
    await Fetch.continueRequest({
      requestId,
      headers: [
        ...Object.entries(request.headers).map(([name, value]) => ({ name, value })),
      ],
    });

    // 但响应头也需要处理
  });

  // 同时修改响应头
  await Fetch.enable({
    patterns: [
      { urlPattern: 'https://api.other-domain.com/*', requestStage: 'Response' },
    ],
  });

  Fetch.requestPaused(async (params) => {
    const { requestId, responseHeaders } = params;

    // 添加 CORS 响应头
    const headers = [
      ...(responseHeaders || []),
      { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE' },
      { name: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
    ];

    await Fetch.continueResponse({ requestId, headers });
  });
}
```

### 9.4.4 预检请求处理

```javascript
async function handlePreflight() {
  const { Fetch } = client;

  await Fetch.enable({
    patterns: [{ urlPattern: '*', requestStage: 'Request' }],
  });

  Fetch.requestPaused(async (params) => {
    const { requestId, request } = params;

    if (request.method === 'OPTIONS') {
      // 直接响应预检请求
      await Fetch.fulfillRequest({
        requestId,
        responseCode: 204,
        responseHeaders: [
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Max-Age', value: '86400' },
        ],
      });
      console.log('✈️ 预检请求已自动响应');
    } else {
      await Fetch.continueRequest({ requestId });
    }
  });
}
```

---

## 9.5 服务工作线程与推送通知调试

### 9.5.1 Service Worker 生命周期

```
安装中 (installing) → 已安装 (installed/waiting) → 激活中 (activating) → 已激活 (activated) → 冗余 (redundant)
```

> 📖 官方文档：[ServiceWorker Domain](https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/)

### 9.5.2 监控 Service Worker

```javascript
async function monitorServiceWorker() {
  const { ServiceWorker } = client;
  await ServiceWorker.enable();

  ServiceWorker.workerRegistrationUpdated((params) => {
    const { registrations } = params;
    registrations.forEach(reg => {
      console.log(`🔧 SW 注册: ${reg.scopeURL}`);
      console.log(`   是否激活: ${reg.isDeleted ? '否' : '是'}`);
    });
  });

  ServiceWorker.workerVersionUpdated((params) => {
    const { versions } = params;
    versions.forEach(v => {
      console.log(`🔄 SW 版本 [${v.versionId}]: ${v.status}`);
      console.log(`   URL: ${v.scriptURL}`);
      console.log(`   运行状态: ${v.runningStatus}`);
    });
  });

  ServiceWorker.workerErrorReported((params) => {
    const { errorMessage } = params;
    console.log(`❌ SW 错误: ${errorMessage.errorMessage}`);
    console.log(`   行号: ${errorMessage.lineNumber}`);
  });
}
```

### 9.5.3 控制Service Worker

```javascript
// 强制更新 Service Worker
await ServiceWorker.updateRegistration({
  scopeURL: 'https://example.com/',
});

// 卸载 Service Worker
await ServiceWorker.unregister({
  scopeURL: 'https://example.com/',
});
console.log('🗑️ Service Worker 已卸载');

// 启动 Service Worker
await ServiceWorker.startWorker({
  scopeURL: 'https://example.com/',
});

// 停止 Service Worker
await ServiceWorker.stopWorker({
  versionId: 'sw-version-id',
});
```

### 9.5.4 推送通知调试

```javascript
async function testPushNotification() {
  const { ServiceWorker } = client;
  await ServiceWorker.enable();

  // 监听推送事件
  ServiceWorker.workerVersionUpdated(async (params) => {
    const activeWorker = params.versions.find(v => v.status === 'activated');
    if (!activeWorker) return;

    // 模拟推送消息
    await ServiceWorker.deliverPushMessage({
      origin: 'https://example.com',
      registrationId: activeWorker.registrationId,
      data: Buffer.from(JSON.stringify({
        title: '测试推送',
        body: '这是一条推送通知',
        icon: '/icon.png',
      })).toString('base64'),
    });

    console.log('📩 推送消息已发送');
  });
}
```

### 9.5.5 Background Sync 和 Periodic Background Sync

```javascript
// 模拟 Background Sync 事件
await ServiceWorker.dispatchSyncEvent({
  origin: 'https://example.com',
  registrationId: 'sw-reg-id',
  tag: 'sync-data',
  lastChance: false,  // 是否为最后一次重试
});

// 模拟 Periodic Background Sync 事件
await ServiceWorker.dispatchPeriodicSyncEvent({
  origin: 'https://example.com',
  registrationId: 'sw-reg-id',
  tag: 'periodic-update',
});
```

### 9.5.6 Service Worker 缓存管理

```javascript
const { Storage } = client;

// 获取缓存存储信息
const { cacheStorageNames } = await Storage.getStorageInfoForOrigin({
  origin: 'https://example.com',
});
console.log('📦 缓存列表:', cacheStorageNames);

// 清除 Service Worker 缓存
await Storage.clearDataForOrigin({
  origin: 'https://example.com',
  storageTypes: 'cache_storage',
});
console.log('🧹 SW 缓存已清除');

// 清除所有存储（包括 SW）
await Storage.clearDataForOrigin({
  origin: 'https://example.com',
  storageTypes: 'all',
});
```

---

## 本章小结

| 主题 | 核心 API | 一句话总结 |
|------|---------|-----------|
| Target 管理 | `Target.getTargets/createTarget/attachToTarget` | 一切可调试对象皆是 Target |
| 浏览器上下文 | `Target.createBrowserContext` | Cookie/缓存/代理全面隔离 |
| 移动端调试 | `adb forward` + `Emulation.setDeviceMetricsOverride` | 桌面即移动实验室 |
| CORS 处理 | `Fetch.continueResponse` + 响应头注入 | 优雅绕过，不要简单粗暴 |
| Service Worker | `ServiceWorker.enable/deliverPushMessage` | PWA 调试神器 |

> 🎯 **下章预告**：第10章将深入 CDP 的性能分析能力，学习如何通过 Performance、Profiler 等 Domain 精准定位性能瓶颈。

> 📖 完整 API 参考：[Target Domain](https://chromedevtools.github.io/devtools-protocol/tot/Target/) | [ServiceWorker Domain](https://chromedevtools.github.io/devtools-protocol/tot/ServiceWorker/) | [Emulation Domain](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/) | [Storage Domain](https://chromedevtools.github.io/devtools-protocol/tot/Storage/)
