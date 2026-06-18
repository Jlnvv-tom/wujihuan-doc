# 第4章 网络层自动化：抓包与流量控制

> 本章导读：网络层是 CDP 自动化的"命脉"。无论是调试接口、篡改请求、模拟弱网，还是管理登录态——全都需要在网络层动手脚。本章从 Network Domain 的核心事件入手，逐步展开到流量拦截、弱网模拟、Cookie/Storage 管理以及 HTTPS 证书处理。每一节都配实战代码，讲清楚"是什么→为什么→怎么用"，帮你把网络层的操控能力从"会用"拉到"精通"。

---

## 4.1 Network Domain详解：监控请求与响应头

### 4.1.1 Network Domain 是什么

Network Domain 是 CDP 中专门负责网络请求监控的域。它不直接发起请求，而是让你**透视浏览器发出的每一个请求和收到的每一个响应**——从 URL、方法、请求头，到状态码、响应体、耗时，一网打尽。

👉 官方文档：[Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/)

### 4.1.2 启用与核心事件

启用 Network Domain 只需一条命令：

```typescript
// Puppeteer 中启用
const client = await page.createCDPSession();
await client.send('Network.enable');
```

启用后，浏览器会持续推送网络事件。最核心的事件链路如下：

```
requestWillBeSent → requestWillBeSentExtraInfo → 
responseReceived → responseReceivedExtraInfo → 
loadingFinished / loadingFailed
```

> 📌 **图示位置**：Network 事件生命周期流程图
> 
> 请求发出 → `requestWillBeSent`（携带 requestId、URL、method、headers）
> → `requestWillBeSentExtraInfo`（补充 Cookie 等敏感头）
> → 服务端响应 → `responseReceived`（状态码、响应头）
> → `responseReceivedExtraInfo`（补充 Set-Cookie 等）
> → 数据加载完成 → `loadingFinished`（或 `loadingFailed`）

### 4.1.3 监控请求与响应头

实战中最常见的需求：**记录所有请求的 URL、方法和响应状态码**。

```typescript
const client = await page.createCDPSession();
await client.send('Network.enable');

// 监听请求发出
client.on('Network.requestWillBeSent', (params) => {
  console.log(`→ ${params.request.method} ${params.request.url}`);
});

// 监听响应返回
client.on('Network.responseReceived', (params) => {
  const { status, url } = params.response;
  console.log(`← ${status} ${url}`);
});
```

### 4.1.4 获取响应体

⚠️ 响应体不会随 `responseReceived` 事件一起返回，需要额外调用 `Network.getResponseBody`：

```typescript
client.on('Network.loadingFinished', async (params) => {
  try {
    const { body, base64Encoded } = await client.send(
      'Network.getResponseBody', { requestId: params.requestId }
    );
    const content = base64Encoded 
      ? Buffer.from(body, 'base64').toString() 
      : body;
    console.log('响应体:', content.slice(0, 200));
  } catch (e) {
    // 请求可能已被重定向，原始 body 不可用
  }
});
```

> ⚡ **实战踩坑**：`loadingFinished` 的 requestId 与 `requestWillBeSent` 的 requestId 一致，但重定向场景中，原始 requestId 的 body 可能已失效，需要用最后一次重定向的 requestId 来获取。

### 4.1.5 请求头 vs 响应头的关键字段

| 信息类型 | 事件 | 关键字段 | 备注 |
|---------|------|---------|------|
| 请求头 | `requestWillBeSent` | `request.headers` | 不含 Cookie |
| 请求头（完整）| `requestWillBeSentExtraInfo` | `headers` | 含 Cookie 等敏感信息 |
| 响应头 | `responseReceived` | `response.headers` | 不含 Set-Cookie |
| 响应头（完整）| `responseReceivedExtraInfo` | `headers` | 含 Set-Cookie |

> 💡 **掘金经验**：如果你需要抓取完整的请求/响应头（比如审计 Cookie 策略），一定要同时监听 `ExtraInfo` 事件。普通事件中的 headers 会被浏览器"净化"，Cookie、Set-Cookie 等敏感字段不会出现。

---

## 4.2 拦截与修改HTTP(s)流量：实现请求重定向

### 4.2.1 为什么需要拦截流量

流量拦截是 CDP 最强大的能力之一，典型场景包括：

- 🔀 **接口 Mock**：后端接口还没开发完，前端先把请求拦截返回假数据
- 🔒 **安全审计**：检测页面是否请求了不安全的第三方域名
- 🧪 **A/B 测试**：修改请求参数，对比不同配置下的页面表现
- 🚫 **广告屏蔽**：拦截广告域名的请求，净化页面

### 4.2.2 启用请求拦截

启用拦截需要两步：`Network.enable` + `Network.setRequestInterception`：

```typescript
const client = await page.createCDPSession();
await client.send('Network.enable');
await client.send('Network.setRequestInterception', {
  patterns: [{ urlPattern: '*' }]  // 拦截所有请求
});
```

`patterns` 支持三种匹配方式：

| 匹配方式 | 参数 | 示例 | 适用场景 |
|---------|------|------|---------|
| URL 模式 | `urlPattern` | `'*api.example.com*'` | 精确匹配域名/路径 |
| 资源类型 | `resourceType` | `'Script'`、`'Stylesheet'` | 按类型拦截 |
| 请求方法 | `interceptedRequestHandling` | 配合其他条件 | 细粒度控制 |

### 4.2.3 拦截并修改请求

拦截启用后，浏览器不再自动发送被匹配的请求，而是推送 `Network.requestIntercepted` 事件，等待你的指令：

```typescript
client.on('Network.requestIntercepted', async (params) => {
  const { interceptionId, request } = params;
  
  // 拦截 API 请求，修改响应
  if (request.url.includes('/api/user')) {
    await client.send('Network.continueInterceptedRequest', {
      interceptionId,
      rawResponse: Buffer.from(
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: application/json\r\n\r\n' +
        '{"name":"mock_user","role":"admin"}'
      ).toString('base64')
    });
    return;
  }
  
  // 其他请求放行
  await client.send('Network.continueInterceptedRequest', {
    interceptionId
  });
});
```

### 4.2.4 请求重定向实战

将某个域名的请求重定向到本地服务：

```typescript
client.on('Network.requestIntercepted', async (params) => {
  const { interceptionId, request } = params;
  let url = request.url;
  
  // 将生产环境 API 重定向到本地
  if (url.includes('api.production.com')) {
    url = url.replace('api.production.com', 'localhost:3000');
  }
  
  await client.send('Network.continueInterceptedRequest', {
    interceptionId,
    url  // 修改后的 URL
  });
});
```

### 4.2.5 修改请求头与请求体

```typescript
client.on('Network.requestIntercepted', async (params) => {
  const { interceptionId, request } = params;
  
  // 注入自定义 Token
  const headers = { ...request.headers, 'X-Custom-Token': 'abc123' };
  
  await client.send('Network.continueInterceptedRequest', {
    interceptionId,
    headers: Object.entries(headers).map(
      ([name, value]) => ({ name, value })
    )
  });
});
```

> 🧠 **实战经验**：`continueInterceptedRequest` 的 `headers` 字段格式为对象数组 `[{name, value}]`，不是普通键值对对象，这里容易踩坑。另外，拦截的请求如果不调用 `continueInterceptedRequest`，该请求会**永远挂起**，所以务必保证每个拦截都有放行逻辑。

### 4.2.6 拦截决策流程

> 📌 **图示位置**：请求拦截决策流程
> 
> 请求进入 → `requestIntercepted` 事件 → 判断 URL/类型 →
> ① Mock 响应 → `continueInterceptedRequest({ rawResponse })`
> ② 修改请求 → `continueInterceptedRequest({ url/headers/method })`
> ③ 直接放行 → `continueInterceptedRequest({})`
> ④ 终止请求 → `continueInterceptedRequest({ errorReason: 'Aborted' })`

---

## 4.3 模拟弱网环境：节流与延迟测试

### 4.3.1 为什么需要弱网模拟

开发环境网络通常很快，但真实用户可能在地铁上、电梯里、4G 弱信号区。如果你的页面在 3G 网络下白屏 5 秒，用户早就跑了。弱网模拟让你**在开发阶段就发现性能问题**，而不是上线后从用户反馈中得知。

### 4.3.2 Network.emulateNetworkConditions

CDP 提供了专门的弱网模拟方法：

```typescript
const client = await page.createCDPSession();

await client.send('Network.emulateNetworkConditions', {
  offline: false,        // 是否断网
  latency: 200,          // 额外延迟(ms)
  downloadThroughput: 500 * 1024,  // 下载速度(bytes/s)
  uploadThroughput: 250 * 1024,    // 上传速度(bytes/s)
  connectionType: 'cellular3g'     // 连接类型标记
});
```

👉 官方文档：[Network.emulateNetworkConditions](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions)

### 4.3.3 常见网络环境预设

| 网络环境 | 延迟(ms) | 下载(KB/s) | 上传(KB/s) | connectionType |
|---------|---------|-----------|-----------|----------------|
| 离线 | - | 0 | 0 | `offline` |
| 2G | 3000 | 35 | 15 | `cellular2g` |
| 3G | 1500 | 500 | 250 | `cellular3g` |
| 4G | 300 | 4000 | 2000 | `cellular4g` |
| WiFi | 50 | 30000 | 15000 | `wifi` |
| 恢复正常 | 0 | -1(不限) | -1(不限) | - |

封装成工具函数：

```typescript
async function setNetworkProfile(
  client: any, 
  profile: 'offline' | '2g' | '3g' | '4g' | 'wifi' | 'reset'
) {
  const presets = {
    offline: { offline: true, latency: 0, 
      downloadThroughput: 0, uploadThroughput: 0 },
    '2g': { offline: false, latency: 3000, 
      downloadThroughput: 35 * 1024, uploadThroughput: 15 * 1024 },
    '3g': { offline: false, latency: 1500, 
      downloadThroughput: 500 * 1024, uploadThroughput: 250 * 1024 },
    '4g': { offline: false, latency: 300, 
      downloadThroughput: 4000 * 1024, uploadThroughput: 2000 * 1024 },
    'wifi': { offline: false, latency: 50, 
      downloadThroughput: 30000 * 1024, uploadThroughput: 15000 * 1024 },
    reset: { offline: false, latency: 0, 
      downloadThroughput: -1, uploadThroughput: -1 }
  };
  await client.send('Network.emulateNetworkConditions', presets[profile]);
}
```

### 4.3.4 弱网 + 性能指标联动测试

真正的弱网测试不是"设完就完"，而是**结合性能指标自动验证**：

```typescript
// 设置 3G 弱网
await setNetworkProfile(client, '3g');

// 导航并测量 LCP
await page.goto('https://example.com', { waitUntil: 'networkidle0' });

const lcp = await page.evaluate(() => {
  return new Promise((resolve) => {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      resolve(entries[entries.length - 1].startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
});

console.log(`3G环境下 LCP: ${(lcp / 1000).toFixed(2)}s`);
// 如果超过 4s，触发告警
if (lcp > 4000) console.warn('⚠️ LCP 超过 4s 阈值！');
```

### 4.3.5 恢复网络

测试完毕后务必恢复网络，否则后续所有请求都会受影响：

```typescript
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,  // -1 表示不限制
  uploadThroughput: -1
});
```

> ⚡ **踩坑提醒**：`-1` 代表不限速，而不是 `0`。`0` 表示速度为零（完全无法传输数据），这个 bug 我见过不止一次。

---

## 4.4 Cookie与Storage管理：会话保持与身份认证

### 4.4.1 为什么需要管理 Cookie

在自动化场景中，Cookie 管理是最基础也最关键的能力之一：

- 🔐 **登录态保持**：第一次手动登录后提取 Cookie，后续自动注入，免重复登录
- 🧪 **多账号切换**：不同 Cookie 对应不同用户，快速切换测试
- 🚀 **性能优化**：提前注入 Cookie 跳过登录流程，节省自动化执行时间

### 4.4.2 Network.Cookie 参数结构

CDP 中 Cookie 的完整结构如下：

```typescript
interface CookieParam {
  name: string;           // Cookie 名称
  value: string;          // Cookie 值
  url?: string;           // 关联的 URL（设置时可选）
  domain?: string;        // 域名，如 ".example.com"
  path?: string;          // 路径，默认 "/"
  secure?: boolean;       // 是否仅 HTTPS
  httpOnly?: boolean;     // 是否禁止 JS 访问
  sameSite?: 'Strict' | 'Lax' | 'None';  // 跨站策略
  expires?: number;       // 过期时间(Unix秒)，-1=Session
  priority?: 'Low' | 'Medium' | 'High';  // Cookie 优先级
  sameParty?: boolean;    // SameParty 属性
  sourceScheme?: 'Unset' | 'NonSecure' | 'Secure';  // 来源协议
}
```

👉 官方文档：[Network.Cookie](https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-Cookie)

### 4.4.3 Cookie 读写操作

**设置 Cookie**：

```typescript
const client = await page.createCDPSession();
await client.send('Network.enable');

await client.send('Network.setCookie', {
  name: 'session_token',
  value: 'eyJhbGciOiJIUzI1NiJ9.xxx',
  domain: '.example.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'Lax'
});
```

**获取 Cookie**：

```typescript
const { cookies } = await client.send('Network.getCookies', {
  urls: ['https://www.example.com']
});

cookies.forEach(c => {
  console.log(`${c.name}=${c.value} (domain: ${c.domain})`);
});
```

**删除 Cookie**：

```typescript
await client.send('Network.deleteCookies', {
  name: 'session_token',
  domain: '.example.com'
});
```

### 4.4.4 会话保持实战：保存与恢复登录态

```typescript
// 1. 登录后提取所有 Cookie
async function saveCookies(client: any, filePath: string) {
  const { cookies } = await client.send('Network.getAllCookies');
  const fs = require('fs');
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
  console.log(`✅ 已保存 ${cookies.length} 个 Cookie`);
}

// 2. 下次运行时恢复 Cookie
async function loadCookies(client: any, filePath: string) {
  const fs = require('fs');
  const cookies = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  for (const cookie of cookies) {
    await client.send('Network.setCookie', cookie);
  }
  console.log(`✅ 已恢复 ${cookies.length} 个 Cookie`);
}
```

### 4.4.5 Storage 管理

除了 Cookie，CDP 还支持操作 Web Storage（localStorage / sessionStorage）：

```typescript
// 获取 localStorage 数据
const { entries } = await client.send('DOMStorage.getDOMStorageItems', {
  storageId: {
    securityOrigin: 'https://example.com',
    isLocalStorage: true
  }
});

// 设置 localStorage
await client.send('DOMStorage.setDOMStorageItem', {
  storageId: {
    securityOrigin: 'https://example.com',
    isLocalStorage: true
  },
  key: 'user_preference',
  value: '{"theme":"dark","lang":"zh"}'
});
```

### 4.4.6 Cookie vs Storage 对比

| 特性 | Cookie | localStorage | sessionStorage |
|------|--------|-------------|----------------|
| 容量 | ~4KB | ~5MB | ~5MB |
| 随请求发送 | ✅ 自动 | ❌ | ❌ |
| 过期机制 | expires/max-age | 永久 | 标签页关闭 |
| 跨标签页 | ✅ | ✅ | ❌ |
| CDP 操作域 | Network | DOMStorage | DOMStorage |
| HttpOnly | 支持 | 不支持 | 不支持 |
| 适用场景 | 身份认证、会话 | 用户偏好、缓存 | 临时状态 |

> 💡 **掘金经验**：现代 Web 应用越来越多地把 Token 存在 localStorage 而非 Cookie 中。自动化时要**同时检查两种存储**，否则容易漏掉登录态。

---

## 4.5 处理HTTPS证书错误与安全上下文

### 4.5.1 为什么会遇到证书错误

在自动化测试中，HTTPS 证书错误是"常客"：

- 🏗️ **本地开发环境**：自签名证书，浏览器不信任
- 🔄 **代理抓包**：中间人代理（如 Charles、Fiddler）替换证书
- 🧪 **测试环境**：证书过期或域名不匹配
- 🐛 **CI/CD 环境**：内网服务无正式证书

浏览器默认会拦截证书错误的请求，显示安全警告页面。自动化中如果不处理，**请求直接失败，脚本中断**。

### 4.5.2 忽略证书错误

最简单的方式是启动浏览器时忽略证书错误：

```typescript
// Puppeteer 启动参数
const browser = await puppeteer.launch({
  args: ['--ignore-certificate-errors']
});
```

或者通过 CDP 的 `Security` 域更精细地控制：

```typescript
const client = await page.createCDPSession();
await client.send('Security.enable');

// 忽略证书错误
await client.send('Security.setOverrideCertificateErrors', {
  override: true
});

client.on('Security.certificateError', async (event) => {
  // 自动继续，忽略证书错误
  await client.send('Security.handleCertificateError', {
    eventId: event.eventId,
    action: 'continue'
  });
});
```

👉 官方文档：[Security Domain](https://chromedevtools.github.io/devtools-protocol/tot/Security/)

### 4.5.3 certificateError 事件详解

`Security.certificateError` 事件参数：

```typescript
interface CertificateErrorEvent {
  eventId: number;       // 事件ID，用于 handleCertificateError
  errorType: string;     // 错误类型
  requestURL: string;    // 请求 URL
}
```

常见的 `errorType`：

| errorType | 含义 | 是否建议忽略 |
|-----------|------|------------|
| `net::ERR_CERT_AUTHORITY_INVALID` | 证书颁发机构不可信 | ⚠️ 测试环境可忽略 |
| `net::ERR_CERT_COMMON_NAME_INVALID` | 域名与证书不匹配 | ⚠️ 本地开发可忽略 |
| `net::ERR_CERT_DATE_INVALID` | 证书过期 | ❌ 不建议忽略 |
| `net::ERR_CERT_REVOKED` | 证书已吊销 | ❌ 坚决不忽略 |

### 4.5.4 按需忽略：只放行特定域名

**不要一刀切忽略所有证书错误**，这是安全红线。更好的做法是按域名白名单放行：

```typescript
const TRUSTED_DOMAINS = ['localhost', 'dev.example.com', 'staging.example.com'];

client.on('Security.certificateError', async (event) => {
  const url = new URL(event.requestURL);
  const isTrusted = TRUSTED_DOMAINS.some(
    d => url.hostname === d || url.hostname.endsWith('.' + d)
  );
  
  await client.send('Security.handleCertificateError', {
    eventId: event.eventId,
    action: isTrusted ? 'continue' : 'cancel'
  });
  
  if (!isTrusted) {
    console.warn(`🔒 拦截不安全请求: ${event.requestURL} (${event.errorType})`);
  }
});
```

### 4.5.5 安全上下文（Secure Context）问题

即使忽略了证书错误，某些 Web API 仍然不可用，因为它们要求**安全上下文（Secure Context）**：

- 🔐 `crypto.subtle`（Web Crypto API）
- 📍 `navigator.geolocation`
- 🔔 `Notification API`
- 📱 `Service Worker`

浏览器通过 `window.isSecureContext` 判断当前是否为安全上下文：

```typescript
const isSecure = await page.evaluate(() => window.isSecureContext);
console.log('安全上下文:', isSecure);  // HTTPS 下为 true
```

在开发环境中，可以通过 Chrome 启动参数将特定域名标记为安全来源：

```typescript
const browser = await puppeteer.launch({
  args: [
    '--ignore-certificate-errors',
    '--unsafely-treat-insecure-origin-as-secure=http://localhost:3000'
  ]
});
```

### 4.5.6 证书错误处理最佳实践

| 场景 | 推荐方案 | 风险等级 |
|------|---------|---------|
| 本地开发（localhost） | `--ignore-certificate-errors` | 🟢 低 |
| 内网测试环境 | 域名白名单 + `Security.handleCertificateError` | 🟡 中 |
| 代理抓包（Charles等） | 安装代理 CA 证书到系统信任链 | 🟢 低 |
| 预发布环境 | 配置正式证书或通配符证书 | 🟢 低 |
| 生产环境 | **绝不忽略证书错误** | 🔴 禁止 |

> 🧠 **实战经验**：在 CI/CD 流水线中，推荐把自签名 CA 证书安装到系统信任链（`trust store`），而不是用 `--ignore-certificate-errors`。这样既能让浏览器信任证书，又不会降低安全水位。具体操作取决于操作系统：
> - **macOS**: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem`
> - **Linux**: `sudo cp cert.pem /usr/local/share/ca-certificates/ && sudo update-ca-certificates`

---

## 本章小结

本章围绕 CDP 网络层的五大核心能力展开：

1. **Network Domain 监控**：掌握 `requestWillBeSent` → `responseReceived` → `loadingFinished` 事件链，别忘了 `ExtraInfo` 事件才能拿到完整头信息
2. **流量拦截与修改**：通过 `setRequestInterception` + `continueInterceptedRequest` 实现请求重定向、Mock 和修改，注意每个拦截都必须有放行逻辑
3. **弱网模拟**：`emulateNetworkConditions` 一行代码模拟各种网络环境，`-1` 代表不限速而非 `0`
4. **Cookie 与 Storage**：`Network.setCookie` / `getCookies` 管理登录态，`DOMStorage` 域操作 localStorage/sessionStorage
5. **HTTPS 证书处理**：域名白名单放行优于全局忽略，安全上下文需要单独处理

网络层是自动化的基础设施，掌握这些能力后，你就能对浏览器的网络行为"看得到、管得住、改得了"。下一章我们将深入 Runtime Domain，探索 JavaScript 执行的更深层控制。
