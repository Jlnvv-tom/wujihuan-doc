# 第3章 页面与DOM深度操控

> 本章导读：本章聚焦 CDP 中与页面、DOM 交互最密切的几个核心能力——从页面生命周期的精确感知，到 DOM 节点的查询修改，再到 JavaScript 的动态注入，最后覆盖资源拦截和用户模拟交互。无论你是做自动化测试、爬虫开发还是 RPA，这些能力都是绕不开的地基。全文围绕"发现→操控→验证"的闭环展开，每节配实战代码，建议跟着动手跑一遍。

---

## 3.1 页面生命周期管理：Load、DOMContentLoad 与 NetworkIdle

### 3.1.1 为什么生命周期如此重要

在 CDP 自动化场景中，我们最常遇到的坑就是「操作早了」——页面还没完全加载，元素找不到，click 点了寂寞。更隐蔽的坑是「等过头了」——死等一个永远不会触发的网络请求，白白浪费大量时间。

浏览器页面生命周期（Page Lifecycle）是一套由浏览器内部维护的状态机。CDP 通过 `Page.lifecycleEvent` 事件将这套状态机暴露出来，让我们能够精确监听每一个阶段：

```
blank → navigation started → committed → DOMContentLoaded → 
Loading → networkIdle (or networkAlmostIdle) → complete → 
hidden → freezable → terminated
```

### 3.1.2 Page.lifecycleEvent 详解

开启生命周期事件监听非常简单，只需要一条命令：

```typescript
// Node.js + Puppeteer
await page.evaluate(() => {
  // 在页面上下文中注册一个标志
  window.__lifecycleEvents = [];
});

page.on('lifecycleevent', (event) => {
  console.log(`[Lifecycle] ${event.name} — timestamp: ${event.timestamp}`);
});
```

如果你直接使用 CDP（不经过 Puppeteer），则通过 `Page.setLifecycleEventsEnabled` 开启后，浏览器会推送如下格式的事件：

```json
{
  "method": "Page.lifecycleEvent",
  "params": {
    "name": "networkIdle",
    "timestamp": 1718000000.123
  }
}
```

CDP 规范中定义的标准生命周期事件名称包括：

| 事件名称 | 含义 | 适用场景 |
|---------|------|---------|
| `init` | 页面初始化，文档开始解析 | 最早可干预时机 |
| `DOMContentLoaded` | HTML 解析完毕，DOM 树构建完成 | 执行脚本、查询节点 |
| `load` | 所有资源（图片/CSS/脚本）加载完毕 | 截图、PDF 导出 |
| `networkIdle` | 连续 500ms 无网络活动 | 动态页面完成标志 |
| `networkAlmostIdle` | 连续 1s 无超过 2 个并发请求 | 松散等待场景 |
| `commit` | 导航被提交（navigation committed） | 监听 URL 变化 |
| `interactive` | 页面已可交互（资源可能仍在加载） | 提前交互 |
| `complete` | 所有任务完成，页面进入空闲 | 最终状态确认 |

> **官方文档**：[Page.setLifecycleEventsEnabled](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-setLifecycleEventsEnabled) | [Page.lifecycleEvent](https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-lifecycleEvent)

### 3.1.3 三种等待策略的对比与选择

实际开发中，我们最常用的是三种等待策略。它们的语义不同，性能影响也截然不同：

```typescript
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();

// 策略一：等待 networkIdle（最保守，最耗时）
// 适用场景：SPA 单页应用，页面内容靠 Ajax 动态加载
await page.goto('https://example.com', {
  waitUntil: 'networkidle0',  // 等待 0 个请求持续 500ms
});
console.log('networkidle0 满足，页面已完全加载');

// 策略二：等待 DOMContentLoaded（中等保守）
// 适用场景：静态页面，资源加载不影响主要功能
await page.goto('https://example.com', {
  waitUntil: 'domcontentloaded',
});

// 策略三：等待 load（最宽松）
// 适用场景：已知资源分布，需要脚本尽早执行
await page.goto('https://example.com', {
  waitUntil: 'load',
});

// 策略四（高级）：基于自定义条件
// 等某个元素出现，或某个条件满足
await page.waitForFunction(() => {
  return document.querySelector('#app').dataset.ready === 'true';
}, { timeout: 30000 });
```

> **图示说明**：以下是三种策略在时间轴上的差异示意：
> ```
> 时间线 ──────────────────────────────────────────────────►
>         ▲ DOMContentLoaded      ▲ load           ▲ networkIdle
>         │                       │                │
>         ├──────┤                 │                │
>         │  DOM树  │               │                │
>         │  构建   │               │                │
>         │        ├─────┤          │                │
>         │        │图片 │          │                │
>         │        │字体 │          │                │
>         │        │CSS  │          │                │
>         │        │     ├──────┤   │                │
>         │        │     │ Ajax │   │                │
>         │        │     │ XHR  ├───┼──────┤         │
>         │        │     │     │   │      │         │
>         ├────────┴─────┴─────┴───┴──────┴─────────┤
>         │                                           │
>         waitUntil: 'domcontentloaded'               │
>                           waitUntil: 'load'         │
>                                              waitUntil: 'networkidle0'
> ```

> **官方文档**：[Page.goto / waitUntil](https://puppeteer.github.io/puppeteer/class.Page#goto) | [Navigation Lifecycle](https://github.com/nicojs/chrome-debugging-client-docs/blob/master/docs/navigation-lifecycle.md)

### 3.1.4 在原生 CDP 中实现精确等待

如果你使用原生 CDP 协议，需要自己维护状态。以下是一个手写的 `waitForLifecycle` 辅助函数：

```typescript
import CDP from 'chrome-remote-interface';

async function waitForLifecycle(client: CDP.Client, targetEvent: string, timeout = 30000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.Page.removeListener('lifecycleEvent', handler);
      reject(new Error(`Timeout waiting for lifecycle event: ${targetEvent}`));
    }, timeout);

    const handler = (event: { name: string; timestamp: number }) => {
      if (event.name === targetEvent) {
        clearTimeout(timer);
        client.Page.removeListener('lifecycleEvent', handler);
        resolve();
      }
    };

    client.Page.on('lifecycleEvent', handler);
  });
}

// 使用示例
await waitForLifecycle(client, 'networkIdle');
console.log('页面已进入 networkIdle 状态');
```

---

## 3.2 DOM节点操作：查询、修改属性与内容注入

### 3.2.1 DOM Domain 概览

CDP 的 `DOM` Domain 是操控页面的核心工具集。它提供的能力远超 JavaScript `document.querySelector`——因为这些操作发生在浏览器渲染进程的 DevTools Agent 层，绕过了页面的 JavaScript 沙箱上下文，可以访问到普通脚本无法触碰的 Shadow DOM、跨域 iframe 以及尚未挂载到文档的节点。

`DOM` Domain 的核心方法分为三类：**快照类**（获取文档结构）、**引用类**（通过 nodeId 持有节点句柄）、**操作类**（增删改）。

> **官方文档**：[Chrome DevTools Protocol - DOM Domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/)

### 3.2.2 获取文档快照与节点查询

获取 DOM 树的第一步是 `DOM.getDocument`，它返回文档根节点（通常 nodeId 为 1）：

```typescript
const { Root } = await client.DOM.getDocument({ depth: 0 });
console.log('文档根节点 nodeId:', Root.nodeId); // 通常是 1
```

但更实用的方式是直接用 `DOM.querySelector`——在给定节点下查找 CSS 选择器匹配的节点。这避免了下载整个 DOM 树：

```typescript
// 开启 DOM 域的追踪能力
await client.DOM.enable();

// 在整个文档中查找 class 为 "article-content" 的节点
const { nodeId } = await client.DOM.querySelector({
  nodeId: 1, // 从根节点开始
  selector: '.article-content'
});

if (nodeId === 0) {
  console.log('未找到目标节点');
} else {
  // 获取节点详细信息
  const { node } = await client.DOM.describeNode({ nodeId });
  console.log('找到节点:', node.nodeName, node.attributes);
}
```

### 3.2.3 批量查找：querySelectorAll 的等效实现

CDP 没有直接的 `querySelectorAll` 方法，但我们可以通过组合调用实现批量查询：

```typescript
// 利用 JavaScript 在页面内执行批量查询，再通过 CDP 获取结果
const { result } = await client.Runtime.evaluate({
  expression: `
    Array.from(document.querySelectorAll('a.card-link')).map((el, i) => ({
      index: i,
      text: el.textContent.trim(),
      href: el.href
    }))
  `,
  returnByValue: true  // 重要：要求返回值按值传递，而非引用
});

console.log('找到的链接列表:', result.result.value);
// 输出: [{ index: 0, text: '文章标题1', href: 'https://...' }, ...]
```

### 3.2.4 修改元素属性

通过 `DOM.setAttributeValue` 和 `DOM.removeAttribute` 可以直接修改元素的属性，不需要执行 JavaScript：

```typescript
// 修改 input 的 value 属性（绕过只读限制）
await client.DOM.setAttributeValue({
  nodeId: inputNodeId,
  name: 'value',
  value: 'hello@world.com'
});

// 移除某个属性
await client.DOM.removeAttribute({
  nodeId: buttonNodeId,
  name: 'disabled'
});

// 添加新属性
await client.DOM.setAttributeValue({
  nodeId: targetNodeId,
  name: 'data-cdp-injected',
  value: 'true'
});
```

### 3.2.5 内容注入：innerHTML 与 textContent

向 DOM 注入内容有两种方式，各有取舍：

```typescript
// 方式一：通过 Runtime.evaluate 执行 JavaScript（灵活，支持复杂 DOM 操作）
await client.Runtime.evaluate({
  expression: `
    const container = document.querySelector('#app');
    container.innerHTML = \`
      <div class="cdp-injected">
        <h2>注入内容</h2>
        <p>通过 CDP 注入的 HTML 片段</p>
      </div>
    \`;
    'content_injected';
  `,
  returnByValue: true
});

// 方式二：通过 DOM 方法直接操作（无需页面执行脚本，但功能有限）
// 获取目标节点后，使用 DOM.setOuterHTML
const { content } = await client.DOM.getOuterHTML({ nodeId: targetNodeId });
const newHTML = '<div class="replaced">完全替换的内容</div>';
await client.DOM.setOuterHTML({ nodeId: targetNodeId, outerHTML: newHTML });
```

> **图示说明**：两种注入方式的执行路径对比：
> ```
> 方式一（Runtime.evaluate）：
>   你的代码 → CDP Client → WebSocket → Chrome DevTools Agent
>             → JavaScript 上下文 → document.querySelector → innerHTML
>             → 路径长，但功能完整

> 方式二（DOM Domain）：
>   你的代码 → CDP Client → WebSocket → Chrome DevTools Agent
>             → 直接操作 DOM 树（渲染进程内）
>             → 路径短，但只支持基础操作
> ```

### 3.2.6 获取渲染后的 HTML（包含动态内容）

普通 JavaScript 拿到的 `innerHTML` 可能不包含浏览器渲染后的最终状态（比如经过 Vue/React 虚拟 DOM 处理的输出）。通过 CDP 的 `DOM.getOuterHTML` 则能获取渲染后的真实 DOM：

```typescript
// 渲染后的真实 DOM（包含浏览器处理后的内容）
const { outerHTML } = await client.DOM.getOuterHTML({ nodeId: targetNodeId });
console.log('渲染后 HTML:', outerHTML);

// 如果只想获取 HTML 片段，不需要 nodeId：
// 先 querySelector 找到节点，再用 describeNode 确认节点信息
```

> **官方文档**：[DOM.getOuterHTML](https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-getOuterHTML) | [DOM.setOuterHTML](https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-setOuterHTML) | [DOM.querySelector](https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-querySelector)

---

## 3.3 执行JavaScript：在Runtime域中评估表达式

### 3.3.1 Runtime Domain 的核心角色

如果说 `DOM` Domain 是页面的"读卡器"，那么 `Runtime` Domain 就是页面的"遥控器"。几乎所有与 JavaScript 上下文交互的工作都经过这里——评估表达式、获取对象引用、监听控制台消息、追踪异常。

`Runtime.evaluate` 是使用频率最高的方法，但它也是 CDP 新手最容易踩坑的地方。

> **官方文档**：[Runtime Domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)

### 3.3.2 evaluate 的两种模式：值传递 vs 引用传递

这是最关键的区分，理解清楚能避免大量调试时间：

```typescript
// 【值传递模式】—— 返回 JSON 序列化的值
// 适用于简单数据：字符串、数字、布尔、数组、对象
const { result } = await client.Runtime.evaluate({
  expression: 'document.title',
  returnByValue: true  // 默认 true
});
console.log(result.result.value); // 直接拿到字符串

// 【引用传递模式】—— 返回远程对象引用
// 适用于复杂对象、DOM 节点、函数、Promise 等
const { result } = await client.Runtime.evaluate({
  expression: 'document.body',  // DOM 节点是对象引用
  returnByValue: false         // 返回 RemoteObject
});
console.log(result.result); // { type: 'object', objectId: '...', className: 'HTMLBodyElement' }
```

引用传递返回的对象包含一个 `objectId`，这是 CDP 的远程对象句柄。通过 `Runtime.callFunctionOn` 可以对这个对象执行方法：

```typescript
// 获取 document.body 的引用
const { result } = await client.Runtime.evaluate({
  expression: 'document.body',
  returnByValue: false
});

// 使用 objectId 调用该对象的方法
const { result: boundingResult } = await client.Runtime.callFunctionOn({
  functionDeclaration: 'function() { return this.getBoundingClientRect(); }',
  objectId: result.result.objectId
});
console.log('body 的尺寸:', boundingResult.result.value);
// { x: 0, y: 0, width: 1200, height: 800, top: 0, ... }
```

### 3.3.3 在页面上下文中注入函数

一个常见需求是：定义一个复杂的处理函数，然后在页面中多次调用。我们可以通过 `Runtime.evaluate` 注入函数定义：

```typescript
// 一次性注入工具函数到页面全局作用域
await client.Runtime.evaluate({
  expression: `
    window.__cdpUtils = {
      getAllImages() {
        return Array.from(document.images).map(img => ({
          src: img.src,
          width: img.naturalWidth,
          alt: img.alt
        }));
      },
      scrollToBottom() {
        window.scrollTo(0, document.body.scrollHeight);
      },
      waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
          const el = document.querySelector(selector);
          if (el) return resolve(el);
          const obs = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) { obs.disconnect(); resolve(el); }
          });
          obs.observe(document.body, { childList: true, subtree: true });
          setTimeout(() => { obs.disconnect(); reject(new Error('Timeout')); }, timeout);
        });
      }
    };
    'utils_injected';
  `,
  returnByValue: true
});

// 后续直接调用注入的工具函数
const images = await client.Runtime.evaluate({
  expression: 'window.__cdpUtils.getAllImages()',
  returnByValue: true
});
console.log('页面图片数量:', images.result.value.length);
```

### 3.3.4 异步表达式与 Promise 处理

`Runtime.evaluate` 支持 `await` 关键字，但需要通过 `awaitPromise` 参数控制：

```typescript
// 默认行为：返回 Promise 对象本身（不等待 resolve）
const { result } = await client.Runtime.evaluate({
  expression: 'fetch("/api/user").then(r => r.json())',
  returnByValue: false
});
// result.type === 'promise'

// 等待 Promise resolve（设置 awaitPromise: true）
const { result } = await client.Runtime.evaluate({
  expression: 'fetch("/api/user").then(r => r.json())',
  awaitPromise: true,
  returnByValue: true,
  timeout: 10000
});
console.log('API 响应:', result.result.value);
```

### 3.3.5 异常捕获与堆栈跟踪

`Runtime.evaluate` 返回的 `exceptionDetails` 字段包含了执行期间发生的所有异常信息：

```typescript
const { result, exceptionDetails } = await client.Runtime.evaluate({
  expression: '(function() { throw new Error("故意抛出的错误"); })()',
  returnByValue: true
});

if (exceptionDetails) {
  console.error('执行异常:');
  console.error('  错误信息:', exceptionDetails.exception.description);
  console.error('  行号:', exceptionDetails.lineNumber);
  console.error('  列号:', exceptionDetails.columnNumber);
  console.error('  堆栈:', exceptionDetails.exception.value);
}
```

> **官方文档**：[Runtime.evaluate](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate) | [Runtime.callFunctionOn](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-callFunctionOn)

---

## 3.4 资源拦截与阻断：屏蔽图片与广告以提升性能

### 3.4.1 拦截原理：Fetch Domain

从 Chrome 66 起，`Page` Domain 中原本负责资源拦截的方法被废弃，统一迁移到了 `Fetch` Domain。`Fetch` 提供了**请求拦截（interception）**和**响应修改**两大核心能力。

> **官方文档**：[Fetch Domain](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/)

### 3.4.2 启用拦截与注册处理器

使用 Fetch 的标准流程是：启用域 → 注册请求处理器 → 在事件回调中决定如何响应：

```typescript
await client.Fetch.enable({});

// 拦截所有资源请求（patterns 中匹配规则留空表示全部拦截）
await client.Fetch.enable({
  patterns: [{ urlPattern: '*' }]  // 拦截所有 URL
});
```

### 3.4.3 屏蔽图片与静态资源

最常见的场景：自动化测试中屏蔽图片、CSS、字体以提升页面加载速度：

```typescript
// 存储被拦截的请求，用于后续分析
const blockedRequests: string[] = [];

client.Fetch.on('requestpaused', async (event) => {
  const url = event.request.url;
  const resourceType = event.request.resourceType;

  // 拦截规则：屏蔽图片、视频、广告域名
  const blockConditions = [
    resourceType === 'image',
    resourceType === 'media',
    resourceType === 'font',
    url.includes('doubleclick.net'),
    url.includes('googlesyndication.com'),
    url.includes('.ad.'),
  ];

  if (blockConditions.some(Boolean)) {
    blockedRequests.push(url);
    // 直接以空内容响应，绕过实际网络请求
    await client.Fetch.fulfillRequest({
      requestId: event.requestId,
      responseCode: 204,  // No Content
      body: '',            // 空响应体
    });
  } else {
    // 非拦截资源，继续正常请求
    await client.Fetch.continueRequest({
      requestId: event.requestId,
    });
  }
});
```

### 3.4.4 修改响应内容（注入脚本/替换数据）

Fetch 的另一个强大能力是可以在服务器响应到达浏览器之前进行修改：

```typescript
client.Fetch.on('requestpaused', async (event) => {
  const url = event.request.url;

  // 将特定 API 的响应替换为本地 mock 数据
  if (url.includes('/api/user-info')) {
    await client.Fetch.fulfillRequest({
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Access-Control-Allow-Origin', value: '*' }
      ],
      body: JSON.stringify({
        userId: 'mock_12345',
        username: 'TestUser',
        email: 'test@example.com',
        balance: 9999.99
      }),
    });
    return;
  }

  await client.Fetch.continueRequest({ requestId: event.requestId });
});
```

### 3.4.5 对比：Fetch vs Network 拦截

CDP 中有两套可以影响网络请求的机制，它们的定位不同：

| 特性 | Fetch Domain | Network Domain |
|------|------------|----------------|
| 拦截时机 | 请求发出前（最早） | 请求已发出后 |
| 修改请求 | ✅ 可修改 headers/URL | ❌ 只读 |
| 修改响应 | ✅ 可完全替换 body | ✅ 可改动 body |
| 取消请求 | ✅ `cancel` / `fulfill` | ✅ `cancel` |
| 匹配规则 | 支持 Glob 模式 | 支持请求 ID |
| 适用场景 | Mock 数据、屏蔽资源 | 监控、日志 |

> **图示说明**：Fetch 与 Network 拦截在请求生命周期中的位置：
> ```
> 发起请求
>   │
>   ▼
> ┌─────────────────────┐
> │  Fetch Domain       │ ← 最早拦截，可修改/取消/伪造
> │  (requestpaused)    │
> └─────────────────────┘
>   │ continueRequest()
>   ▼
> ┌─────────────────────┐
> │  Network Domain     │ ← 请求已发出，只能监控
> │  (requestWillBeSent) │
> └─────────────────────┘
>   │
>   ▼
> 服务器响应
> ```

> **官方文档**：[Fetch.enable](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-enable) | [Fetch.requestPaused](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#event-requestPaused) | [Fetch.fulfillRequest](https://chromedevtools.github.io/devtools-protocol/tot/Fetch/#method-fulfillRequest)

---

## 3.5 模拟用户交互：点击、输入与鼠标移动的底层实现

### 3.5.1 从 Puppeteer 到 CDP：分层抽象

大多数开发者通过 Puppeteer 或 Playwright 的高级 API 模拟用户交互。但理解底层 CDP 实现，能让我们在高级 API 失效时（如处理自定义组件、Canvas 游戏、拖拽场景）精准地解决问题。

用户交互在 CDP 中的分层如下：

```
高层 API（Puppeteer / Playwright）
  ↓
Input Domain（Input.dispatchMouseEvent / Input.dispatchKeyEvent）
  ↓
渲染进程的输入事件处理
  ↓
页面 JavaScript 事件监听器
```

> **官方文档**：[Input Domain](https://chromedevtools.github.io/devtools-protocol/tot/Input/)

### 3.5.2 鼠标点击：从坐标到事件

一次完整的鼠标点击需要经历以下事件序列：`mousedown` → `mouseup` → `click`。CDP 的 `Input.dispatchMouseEvent` 可以一次性模拟这个序列：

```typescript
// 辅助函数：根据元素获取中心坐标
async function getElementCenter(client: CDP.Client, selector: string) {
  const { result } = await client.Runtime.evaluate({
    expression: `
      (() => {
        const el = document.querySelector('${selector}');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()
    `,
    returnByValue: true
  });
  return result.result.value as { x: number; y: number } | null;
}

// 执行一次完整的点击操作
async function clickElement(client: CDP.Client, selector: string) {
  const pos = await getElementCenter(client, selector);
  if (!pos) throw new Error(`元素未找到: ${selector}`);

  await client.Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: pos.x,
    y: pos.y,
    button: 'left',
    clickCount: 1,
  });

  await client.Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: pos.x,
    y: pos.y,
    button: 'left',
    clickCount: 1,
  });

  console.log(`已在坐标 (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}) 执行点击`);
}

// 使用
await clickElement(client, '#submit-btn');
```

### 3.5.3 鼠标移动：hover 效果与拖拽

`mouseMoved` 事件类型用于模拟鼠标移动，通常配合 hover 效果或拖拽操作使用：

```typescript
// 模拟鼠标从起点移动到终点的轨迹（模拟真实用户的移动路径）
async function smoothMove(
  client: CDP.Client,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  steps = 10
) {
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    // 使用缓动函数，让移动更自然
    const easeProgress = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    const x = fromX + (toX - fromX) * easeProgress;
    const y = fromY + (toY - fromY) * easeProgress;

    await client.Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x,
      y,
    });

    // 每步间隔 16ms（约 60fps）
    await new Promise(r => setTimeout(r, 16));
  }
}

// 拖拽操作：从 A 元素拖到 B 元素
async function dragAndDrop(client: CDP.Client, fromSelector: string, toSelector: string) {
  const from = await getElementCenter(client, fromSelector);
  const to = await getElementCenter(client, toSelector);
  if (!from || !to) throw new Error('拖拽目标元素未找到');

  // 按下
  await client.Input.dispatchMouseEvent({
    type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1
  });

  // 移动（分步模拟）
  await smoothMove(client, from.x, from.y, to.x, to.y, 15);

  // 释放
  await client.Input.dispatchMouseEvent({
    type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1
  });

  console.log(`拖拽完成: ${fromSelector} → ${toSelector}`);
}
```

### 3.5.4 键盘输入：字符输入与特殊键

键盘事件的处理分为两类：**模拟原始按键**（`rawKeyDown` → `keyDown` → `keyUp`）和**直接插入文本**（`insertText`）：

```typescript
// 方式一：直接插入文本（推荐，用于普通输入框）
// 优点：绕过输入法，直接输入字符，绕过 JS 的 keydown/keypress 事件
// 缺点：不会触发某些依赖真实键盘事件的库
await client.Input.insertText({ text: 'hello world' });

// 方式二：完整的按键序列（适用于需要监听 keydown/keyup 的场景）
async function typeText(client: CDP.Client, text: string) {
  for (const char of text) {
    await client.Input.dispatchKeyEvent({
      type: 'keyDown',
      text: char,
      key: char,
    });
    await client.Input.dispatchKeyEvent({
      type: 'keyUp',
      text: char,
      key: char,
    });
  }
}

// 常用特殊键的 key 值
const specialKeys = {
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  ArrowDown: 'ArrowDown',
  Ctrl: 'Control',
  Cmd: 'Meta',  // macOS 的 Command 键
};
```

### 3.5.5 完整的表单填写实战

将以上技能组合，实现一个完整的表单填写与提交流程：

```typescript
async function fillAndSubmitForm(
  client: CDP.Client,
  formData: Record<string, string>
) {
  const selectors: Record<string, string> = {
    username: '#username',
    email: 'input[name="email"]',
    password: 'input[type="password"]',
    submit: 'button[type="submit"]',
  };

  // 聚焦并填写每个字段
  for (const [field, selector] of Object.entries(selectors)) {
    if (field === 'submit') continue; // 跳过提交按钮

    const pos = await getElementCenter(client, selectors[field]);
    if (!pos) {
      console.warn(`字段 ${field} 未找到，跳过`);
      continue;
    }

    // 点击聚焦
    await client.Input.dispatchMouseEvent({
      type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1
    });
    await client.Input.dispatchMouseEvent({
      type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1
    });

    // 全选并清空
    await client.Input.dispatchKeyEvent({ type: 'rawKeyDown', windowsVirtualKeyCode: 65, modifiers: 2 }); // Ctrl+A
    await client.Input.dispatchKeyEvent({ type: 'keyUp', windowsVirtualKeyCode: 65, modifiers: 2 });
    await client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Backspace' });
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Backspace' });

    // 输入内容
    await client.Input.insertText({ text: formData[field] });

    // Tab 跳到下一个字段
    await client.Input.dispatchKeyEvent({ type: 'keyDown', key: 'Tab' });
    await client.Input.dispatchKeyEvent({ type: 'keyUp', key: 'Tab' });
  }

  // 点击提交
  const submitPos = await getElementCenter(client, selectors.submit);
  if (submitPos) {
    await client.Input.dispatchMouseEvent({
      type: 'mousePressed', x: submitPos.x, y: submitPos.y, button: 'left', clickCount: 1
    });
    await client.Input.dispatchMouseEvent({
      type: 'mouseReleased', x: submitPos.x, y: submitPos.y, button: 'left', clickCount: 1
    });
    console.log('表单已提交');
  }
}

// 使用示例
await fillAndSubmitForm(client, {
  username: 'testuser',
  email: 'test@example.com',
  password: 'SecurePass123!',
});
```

### 3.5.6 触摸事件模拟（移动端）

在移动端测试中，CDP 同样支持触摸事件：

```typescript
// 模拟触摸点击
await client.Input.dispatchTouchEvent({
  type: 'touchStart',
  touchPoints: [{ x: 375, y: 667 }],  // iPhone 屏幕尺寸示例
});

await client.Input.dispatchTouchEvent({
  type: 'touchEnd',
  touchPoints: [],
});

// 模拟触摸拖动（滑动操作）
const startY = 800;
const endY = 200;

for (let y = startY; y > endY; y -= 50) {
  await client.Input.dispatchTouchEvent({
    type: 'touchMove',
    touchPoints: [{ x: 375, y }],
  });
  await new Promise(r => setTimeout(r, 10));
}

await client.Input.dispatchTouchEvent({
  type: 'touchEnd',
  touchPoints: [],
});
```

> **官方文档**：[Input.dispatchMouseEvent](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchMouseEvent) | [Input.dispatchKeyEvent](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchKeyEvent) | [Input.insertText](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-insertText) | [Input.dispatchTouchEvent](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchTouchEvent)

---

## 本章小结

本章覆盖了 CDP 在页面和 DOM 操作层面最核心的能力：

| 能力 | 核心方法 | 典型场景 |
|------|---------|---------|
| 生命周期感知 | `Page.lifecycleEvent` | 精确等待页面就绪，避免"操作早了" |
| DOM 查询修改 | `DOM.querySelector` / `DOM.setAttributeValue` | 元素定位、属性修改、内容注入 |
| JavaScript 执行 | `Runtime.evaluate` / `callFunctionOn` | 页面内逻辑执行、复杂数据提取 |
| 资源拦截阻断 | `Fetch.enable` / `requestPaused` | 屏蔽广告图片、Mock API 响应 |
| 用户交互模拟 | `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` | 自动化点击、表单填写、拖拽 |

这些能力组合起来，就构成了完整的「发现→操控→验证」自动化闭环。下一章我们将深入网络层，学习如何监控、拦截和修改 HTTP 流量——这在 API 测试、爬虫开发和性能分析中尤为关键。

---

> **参考资料**
> - [Chrome DevTools Protocol - 官方文档](https://chromedevtools.github.io/devtools-protocol/)
> - [Puppeteer API 文档](https://pptr.dev/)
> - [Page Lifecycle W3C Editor's Draft](https://www.w3.org/TR/page-lifecycle/)
> - [Fetch Intercept - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
