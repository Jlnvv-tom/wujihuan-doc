# 第2章 协议基础：理解Domain、Method与Event

> **本章导读**：本章深入剖析Chrome DevTools Protocol（CDP）的协议基础，从通信协议栈的底层原理出发，系统讲解Domain、Method与Event三大核心概念，并通过实战代码示例帮助你掌握CDP连接建立、命令调用与事件监听的完整流程。

---

## 2.1 CDP通信协议栈：WebSocket与JSON-RPC详解

### 2.1.1 CDP协议架构概览

Chrome DevTools Protocol 建立在 WebSocket 双向通信机制之上，采用 JSON-RPC 2.0 规范作为消息格式。理解这一协议栈是掌握CDP开发的第一步。

```
┌─────────────────────────────────────────────┐
│         你的应用程序 (Client)                │
│   (Node.js / Python / Go / Java ...)        │
└────────────────┬────────────────────────────┘
                 │ WebSocket (ws://)
┌────────────────▼────────────────────────────┐
│      Chrome DevTools Protocol (CDP)         │
│            JSON-RPC 2.0 消息格式             │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│          Chrome / Chromium 浏览器            │
│        --remote-debugging-port=9222         │
└─────────────────────────────────────────────┘
```

**图2-1：CDP协议通信架构图**（客户端通过WebSocket连接到浏览器的远程调试端口，所有命令和事件均通过JSON-RPC 2.0格式的消息进行交换）

### 2.1.2 WebSocket连接建立

Chrome 启动远程调试后，会在指定端口（默认9222）暴露一个HTTP服务，提供以下几个关键端点：

| 端点 | 说明 | 示例 |
|------|------|------|
| `/json/version` | 获取浏览器版本信息 | `http://localhost:9222/json/version` |
| `/json/list` | 列出所有可用Target（标签页） | `http://localhost:9222/json/list` |
| `/json/new?{url}` | 新建标签页并导航到指定URL | `http://localhost:9222/json/new?https://www.baidu.com` |
| `/json/close/{id}` | 关闭指定Target | `http://localhost:9222/json/close/target-id` |
| `/devtools/browser` | 浏览器级CDP WebSocket地址 | `ws://localhost:9222/devtools/browser` |

**第一步：获取WebSocket调试地址**

```javascript
// get_ws_endpoint.js
// 获取Chrome远程调试的WebSocket地址
import fetch from 'node-fetch';

async function getDebugTargets() {
  const response = await fetch('http://localhost:9222/json/list');
  const targets = await response.json();
  
  console.log('当前所有Target:');
  targets.forEach(target => {
    console.log(`- [${target.type}] ${target.title}`);
    console.log(`  webSocketDebuggerUrl: ${target.webSocketDebuggerUrl}`);
    console.log(`  id: ${target.id}`);
    console.log('');
  });
  
  return targets;
}

getDebugTargets().catch(console.error);
```

运行前确保Chrome已以远程调试模式启动：

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir=C:\temp\chrome-debug

# Linux
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug
```

### 2.1.3 JSON-RPC 2.0消息格式详解

CDP 所有消息均遵循 [JSON-RPC 2.0](https://www.jsonrpc.org/specification) 规范，分为三种类型：

#### 请求消息（Request）

客户端向浏览器发送命令：

```json
{
  "id": 1,
  "method": "Page.navigate",
  "params": {
    "url": "https://www.baidu.com"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 请求唯一标识符，用于匹配响应 |
| `method` | String | 命令名称，格式为 `Domain.method` |
| `params` | Object | 命令参数（可选） |

#### 响应消息（Response）

浏览器对请求的回复：

```json
{
  "id": 1,
  "result": {
    "frameId": "A9E4B5F6C7D8E9F0",
    "loaderId": "B8E3A5F7C9D0E1F2",
    "errorText": "",
    "httpStatusCode": 200
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Integer | 对应的请求ID |
| `result` | Object | 成功时的返回数据 |
| `error` | Object | 失败时的错误信息（与result互斥） |

#### 事件消息（Event）

浏览器主动推送的事件（无 `id` 字段）：

```json
{
  "method": "Page.loadEventFired",
  "params": {
    "timestamp": 12345.678
  }
}
```

> 📌 **关键区别**：Event消息没有 `id` 字段，这是区分命令响应与事件通知的最简单方式。

### 2.1.4 使用原生WebSocket连接CDP

下面是一段不依赖任何CDP库的「最小可用示例」，帮助你理解协议的底层运作：

```javascript
// minimal_cdp.js
// 使用原生WebSocket连接CDP，不依赖任何第三方库
import WebSocket from 'ws';
import fetch from 'node-fetch';

async function minimalCDPExample() {
  // 1. 获取可用Target列表
  const res = await fetch('http://localhost:9222/json/list');
  const targets = await response.json();
  
  if (targets.length === 0) {
    console.log('没有可用的Target，请先打开一个标签页');
    return;
  }
  
  const wsUrl = targets[0].webSocketDebuggerUrl;
  console.log(`连接到: ${wsUrl}`);
  
  // 2. 建立WebSocket连接
  const ws = new WebSocket(wsUrl);
  
  let messageId = 1;
  const pendingCommands = new Map();
  
  ws.on('open', () => {
    console.log('✅ WebSocket连接已建立');
    
    // 3. 发送第一条CDP命令：启用Page域
    const enableCmd = {
      id: messageId++,
      method: 'Page.enable',
      params: {}
    };
    console.log('📤 发送命令:', JSON.stringify(enableCmd));
    ws.send(JSON.stringify(enableCmd));
    pendingCommands.set(enableCmd.id, enableCmd);
    
    // 4. 发送导航命令
    setTimeout(() => {
      const navigateCmd = {
        id: messageId++,
        method: 'Page.navigate',
        params: { url: 'https://www.baidu.com' }
      };
      console.log('📤 发送导航命令:', JSON.stringify(navigateCmd));
      ws.send(JSON.stringify(navigateCmd));
      pendingCommands.set(navigateCmd.id, navigateCmd);
    }, 500);
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    
    // 5. 区分响应和事件
    if (message.id) {
      // 这是命令响应
      const originalCmd = pendingCommands.get(message.id);
      console.log(`📥 命令响应 (id=${message.id}):`, JSON.stringify(message));
      pendingCommands.delete(message.id);
    } else {
      // 这是事件通知
      console.log(`🔔 事件通知: ${message.method}`, JSON.stringify(message.params));
    }
  });
  
  ws.on('error', (err) => {
    console.error('❌ WebSocket错误:', err.message);
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket连接已关闭');
  });
  
  // 10秒后自动关闭
  setTimeout(() => {
    console.log('⏱️ 10秒超时，关闭连接');
    ws.close();
  }, 10000);
}

minimalCDPExample();
```

**运行结果示例输出：**

```
✅ WebSocket连接已建立
📤 发送命令: {"id":1,"method":"Page.enable","params":{}}
📥 命令响应 (id=1): {"id":1,"result":{}}
🔔 事件通知: Page.frameStartedLoading {"frameId":"A9E4..."}
📤 发送导航命令: {"id":2,"method":"Page.navigate","params":{"url":"https://www.baidu.com"}}
📥 命令响应 (id=2): {"id":2,"result":{"frameId":"...","httpStatusCode":200}}
🔔 事件通知: Page.frameNavigated {"frame":{...}}
🔔 事件通知: Page.loadEventFired {"timestamp":12345.678}
⏱️ 10秒超时，关闭连接
🔌 WebSocket连接已关闭
```

### 2.1.5 官方文档与协议浏览器

- **CDP官方协议浏览器**：[https://chromedevtools.github.io/devtools-protocol/](https://chromedevtools.github.io/devtools-protocol/)
- **JSON-RPC 2.0规范**：[https://www.jsonrpc.org/specification](https://www.jsonrpc.org/specification)
- **Chrome远程调试协议文档**：[https://developer.chrome.com/docs/chromedevtools/protocol/](https://developer.chrome.com/docs/chromedevtools/protocol/)

---

## 2.2 核心Domain概览：Target、Page、DOM与Runtime

### 2.2.1 Domain概念解析

在CDP中，**Domain（域）** 是按功能分类的命令与事件集合。每个Domain围绕浏览器的某个核心能力展开，类似于操作系统中的「子系统」。

```
Chrome DevTools Protocol (全部Domain)
├── Browser      - 浏览器全局操作（版本、窗口管理）
├── Target       - Target（标签页/iframe/Worker）生命周期管理
├── Page         - 页面导航、截图、PDF、生命周期事件
├── DOM          - DOM树查询、修改、监听
├── Runtime      - JavaScript执行环境操控
├── Network      - 网络请求监控与拦截
├── Input        - 鼠标、键盘、触摸输入模拟
├── Emulation    - 设备模拟（UA、视口、网络节流）
├── Security     - 安全策略与证书管理
├── Performance  - 性能指标采集
└── ...          (共30+个Domain)
```

**图2-2：CDP Domain功能分类树**（每个Domain独立管理一组相关功能，使用前需先调用 `Domain.enable` 方法启用事件通知）

### 2.2.2 Target Domain：浏览器「目标」管理

**Target** 是CDP中最基础的概念，代表浏览器中的一个可调试实体，包括：

| Target类型 | 说明 | 典型场景 |
|-----------|------|---------|
| `page` | 普通网页标签页 | 最常见的自动化对象 |
| `iframe` | 页面中的iframe | 跨域iframe操作 |
| `background_page` | 扩展后台页 | Chrome扩展自动化 |
| `service_worker` | Service Worker | PWA离线能力测试 |
| `browser` | 浏览器本身 | 跨Tab全局操作 |

#### 核心Target方法

```javascript
// target_domain_examples.js
// Target Domain常用方法示例

// 1. 获取所有Target
// method: Target.getTargets
// 文档: https://chromedevtools.github.io/devtools-protocol/tot/Target/#method-getTargets
{
  "id": 1,
  "method": "Target.getTargets"
}

// 2. 创建新Target（新标签页）
// method: Target.createTarget
{
  "id": 2,
  "method": "Target.createTarget",
  "params": {
    "url": "https://www.baidu.com",
    "width": 1280,
    "height": 720,
    "newWindow": false,
    "background": false
  }
}
// 响应中返回 targetId，可用于后续连接

// 3. 关闭指定Target
// method: Target.closeTarget
{
  "id": 3,
  "method": "Target.closeTarget",
  "params": {
    "targetId": "A9E4B5F6C7D8E9F0"
  }
}

// 4. 附加到Target（激活调试）
// method: Target.attachToTarget
{
  "id": 4,
  "method": "Target.attachToTarget",
  "params": {
    "targetId": "A9E4B5F6C7D8E9F0",
    "flatten": true
  }
}
// 响应返回 sessionId，后续命令需携带此ID
```

#### 使用chrome-remote-interface库的完整示例

```javascript
// target_management.js
// 使用chrome-remote-interface管理Target
import CDP from 'chrome-remote-interface';

async function targetManagementExample() {
  let client;
  
  try {
    client = await CDP({ port: 9222 });
    const { Target, Page, Runtime } = client;
    
    // 启用Target域事件
    await Target.enable();
    
    // 监听新Target创建事件
    Target.targetCreated((params) => {
      console.log(`🆕 新Target已创建: ${params.targetInfo.targetId}, 类型: ${params.targetInfo.type}`);
    });
    
    // 监听Target销毁事件
    Target.targetDestroyed((params) => {
      console.log(`🗑️ Target已销毁: ${params.targetId}`);
    });
    
    // 创建新标签页
    const { targetId } = await Target.createTarget({
      url: 'https://www.baidu.com',
      width: 1280,
      height: 720
    });
    console.log(`✅ 新标签页已创建: ${targetId}`);
    
    // 等待页面加载
    await Page.enable();
    await Page.loadEventFired();
    
    // 在新标签页中执行JS
    const result = await Runtime.evaluate({
      expression: 'document.title'
    });
    console.log(`📄 页面标题: ${result.result.value}`);
    
    // 关闭标签页
    await Target.closeTarget({ targetId });
    console.log(`✅ 标签页已关闭: ${targetId}`);
    
  } catch (err) {
    console.error('❌ 错误:', err.message);
  } finally {
    if (client) await client.close();
  }
}

targetManagementExample();
```

> 📚 **官方文档**：[Target Domain](https://chromedevtools.github.io/devtools-protocol/tot/Target/)

### 2.2.3 Page Domain：页面生命周期与渲染控制

Page Domain 是CDP中使用频率最高的Domain之一，负责页面导航、截图、PDF导出以及页面生命周期事件的管理。

#### 页面导航核心方法

```javascript
// page_navigation.js
// Page Domain导航相关方法

// 1. 导航到指定URL
// method: Page.navigate
// 文档: https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-navigate
const navigateResult = await Page.navigate({
  url: 'https://www.baidu.com',
  referrer: 'https://www.google.com',
  transitionType: 'typed'  // typed, link, address_bar, etc.
});
console.log('导航frameId:', navigateResult.frameId);
console.log('HTTP状态码:', navigateResult.httpStatusCode);

// 2. 重新加载页面
// method: Page.reload
await Page.reload({
  ignoreCache: true,       // 忽略缓存
  scriptToEvaluateOnLoad: 'console.log("注入的脚本")'
});

// 3. 前进/后退
// method: Page.goForward / Page.goBackward
await Page.goForward();
await Page.goBackward();

// 4. 获取导航历史
// method: Page.getNavigationHistory
const history = await Page.getNavigationHistory();
console.log(`当前索引: ${history.currentIndex}`);
history.entries.forEach((entry, i) => {
  console.log(`  [${i === history.currentIndex ? '→' : ' '}] ${entry.url}`);
});
```

#### 页面生命周期事件

```
页面加载时间线
│
├── Page.frameStartedLoading     ← 帧开始加载
├── Page.frameNavigated          ← 帧导航完成（收到HTML）
├── Page.domContentEventFired    ← DOMContentLoaded触发
├── Page.loadEventFired          ← window.onload触发
├── Page.frameStoppedLoading     ← 帧停止加载
└── Page.lifecycleEvent          ← 精细化生命周期（详见2.4节）
```

**图2-3：页面加载生命周期事件时序图**（理解这些事件的触发顺序，是实现精准等待策略的基础）

```javascript
// page_lifecycle.js
// 监听页面生命周期事件

await Page.enable();

// DOMContentLoaded事件
Page.domContentEventFired(() => {
  console.log('✅ DOMContentLoaded已触发');
});

// window.onload事件
Page.loadEventFired(() => {
  console.log('✅ window.onload已触发');
});

// 帧导航事件（可获取新页面的URL）
Page.frameNavigated((params) => {
  console.log(`📍 帧已导航: ${params.frame.url}`);
});

// 精细化生命周期事件（需要启用）
await Page.setLifecycleEventsEnabled({ enabled: true });
Page.lifecycleEvent((params) => {
  console.log(`🔄 生命周期: ${params.name}, 帧: ${params.frameId}`);
  // 常见name值: init, DOMContentLoaded, load, networkIdle, networkAlmostIdle
});
```

> 📚 **官方文档**：[Page Domain](https://chromedevtools.github.io/devtools-protocol/tot/Page/)

### 2.2.4 DOM Domain：DOM树操控

DOM Domain 提供了对页面DOM树的结构化访问能力，类似于在DevTools Elements面板中的操作。

#### DOM查询与遍历

```javascript
// dom_query.js
// DOM Domain查询与操作示例

await DOM.enable();

// 1. 获取整个DOM树
// method: DOM.getDocument
const { root } = await DOM.getDocument({
  depth: -1,          // -1表示不限制深度
  pierce: false       // 是否穿透Shadow DOM
});
console.log('DOM根节点nodeId:', root.nodeId);

// 2. 根据CSS选择器查询节点
// method: DOM.querySelector
const { nodeId } = await DOM.querySelector({
  nodeId: root.nodeId,   // 从根节点开始搜索
  selector: '#kw'        // 百度搜索框的ID
});
console.log('搜索框nodeId:', nodeId);

// 3. 查询所有匹配选择器的节点
// method: DOM.querySelectorAll
const { nodeIds } = await DOM.querySelectorAll({
  nodeId: root.nodeId,
  selector: 'a'
});
console.log(`页面中共有 ${nodeIds.length} 个<a>标签`);

// 4. 获取节点属性
// method: DOM.getAttributes
const { attributes } = await DOM.getAttributes({ nodeId });
// attributes是扁平数组: ["id", "kw", "name", "wd", "class", "s_ipt", ...]
const attrMap = {};
for (let i = 0; i < attributes.length; i += 2) {
  attrMap[attributes[i]] = attributes[i + 1];
}
console.log('节点属性:', attrMap);

// 5. 修改节点属性
// method: DOM.setAttributeValue
await DOM.setAttributeValue({
  nodeId,
  name: 'value',
  value: 'CDP自动化测试'
});
console.log('✅ 已修改输入框值');

// 6. 获取节点外HTML
// method: DOM.getOuterHTML
const { outerHTML } = await DOM.getOuterHTML({ nodeId: root.nodeId });
console.log('页面HTML长度:', outerHTML.length);
```

#### DOM事件监听

```javascript
// dom_events.js
// 监听DOM变更事件

await DOM.enable();

// 属性变更事件
DOM.attributeModified((params) => {
  console.log(`📝 属性已修改: nodeId=${params.nodeId}, ${params.name}=${params.value}`);
});

// 子节点插入事件
DOM.childNodeInserted((params) => {
  console.log(`➕ 子节点已插入: parent=${params.parentNodeId}, newNode=${params.node.nodeId}`);
});

// 节点被移除事件
DOM.childNodeRemoved((params) => {
  console.log(`➖ 子节点已移除: parent=${params.parentNodeId}, node=${params.node.nodeId}`);
});

// 文档更新事件（批量DOM操作通知）
DOM.documentUpdated(() => {
  console.log('📄 文档已更新（DOM树重建）');
});
```

> 📚 **官方文档**：[DOM Domain](https://chromedevtools.github.io/devtools-protocol/tot/DOM/)

### 2.2.5 Runtime Domain：JavaScript执行环境

Runtime Domain 允许你在页面的JavaScript上下文中执行任意代码，是实现复杂自动化逻辑的核心工具。

#### 代码执行与结果获取

```javascript
// runtime_evaluate.js
// Runtime Domain代码执行示例

await Runtime.enable();

// 1. 执行表达式并获取结果
// method: Runtime.evaluate
const result1 = await Runtime.evaluate({
  expression: '1 + 2 * 3',
  returnByValue: true    // 返回实际值而非远程对象引用
});
console.log('计算结果:', result1.result.value);  // 7

// 2. 执行表达式并获取复杂对象
const result2 = await Runtime.evaluate({
  expression: '({ name: "CDP", version: 2.0, features: ["DOM", "Network", "Page"] })',
  returnByValue: true
});
console.log('对象结果:', result2.result.value);
// { name: "CDP", version: 2.0, features: ["DOM", "Network", "Page"] }

// 3. 在指定执行上下文（iframe）中执行
// 先获取所有执行上下文
const contexts = await Runtime.executionContexts();
contexts.forEach(ctx => {
  console.log(`上下文: ${ctx.id}, 名称: ${ctx.name}, 来源: ${ctx.origin}`);
});

// 4. 执行异步代码（返回Promise）
const result3 = await Runtime.evaluate({
  expression: 'fetch("https://api.github.com/users/github").then(r => r.json())',
  awaitPromise: true,    // 等待Promise resolve
  returnByValue: true
});
console.log('异步请求结果:', result3.result.value.login);

// 5. 注入并执行函数
// method: Runtime.callFunctionOn
const { result: funcResult } = await Runtime.callFunctionOn({
  objectId: domNode.objectId,   // 某个DOM节点的远程引用
  functionDeclaration: 'function() { return this.textContent; }',
  returnByValue: true
});
console.log('节点文本内容:', funcResult.value);
```

#### 异常与错误处理

```javascript
// runtime_error_handling.js
// Runtime执行错误处理

const result = await Runtime.evaluate({
  expression: 'nonExistentVariable.undefinedProperty',
  silent: false,          // 不静默执行（会触发错误）
  returnByValue: true
});

if (result.exceptionDetails) {
  console.error('❌ 执行异常:');
  console.error('  异常类型:', result.exceptionDetails.exception?.className);
  console.error('  异常信息:', result.exceptionDetails.exception?.description);
  console.error('  脚本位置: 行${result.exceptionDetails.lineNumber}, 列${result.exceptionDetails.columnNumber}');
} else {
  console.log('✅ 执行成功:', result.result.value);
}
```

#### Runtime事件：控制台输出与异常监听

```javascript
// runtime_events.js
// 监听Runtime域事件

await Runtime.enable();

// 控制台输出事件（console.log/error/warn等）
Runtime.consoleAPICalled((params) => {
  const { type, args, stackTrace } = params;
  const values = args.map(arg => arg.value ?? arg.description).join(' ');
  console.log(`[页面Console.${type}] ${values}`);
  if (stackTrace) {
    console.log('  调用栈:', stackTrace.callFrames[0]?.url);
  }
});

// 未捕获异常事件
Runtime.exceptionThrown((params) => {
  console.error('💥 页面异常:', params.exceptionDetails.exception?.description);
  const frame = params.exceptionDetails.stackTrace?.callFrames[0];
  if (frame) {
    console.error(`  位置: ${frame.url}:${frame.lineNumber}`);
  }
});

// 执行上下文创建事件（新iframe、新脚本等）
Runtime.executionContextCreated((params) => {
  console.log(`🆕 执行上下文已创建: ${params.context.name} (${params.context.origin})`);
});
```

> 📚 **官方文档**：[Runtime Domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)

### 2.2.6 四个核心Domain的关系

```
用户代码 (Runtime.evaluate)
    │
    ▼
DOM Tree (DOM Domain)
    │
    ▼
渲染页面 (Page Domain)
    │
    ▼
浏览器Tab (Target Domain)
```

**图2-4：四个核心Domain的层级关系图**（Target管理Tab生命周期 → Page管理页面渲染 → DOM管理文档结构 → Runtime提供JS执行能力，自上而下依赖，自下而上查询）

---

## 2.3 Method调用实战：导航、截图与PDF导出

### 2.3.1 实战准备：封装CDP客户端

在深入具体Method之前，我们先封装一个可复用的CDP客户端基础类：

```javascript
// cdp_client.js
// 封装CDP客户端基础类
import CDP from 'chrome-remote-interface';

export class CDPClient {
  constructor(options = {}) {
    this.options = {
      port: 9222,
      host: '127.0.0.1',
      ...options
    };
    this.client = null;
    this.domains = {};
  }
  
  async connect(targetId = null) {
    this.client = await CDP({
      ...this.options,
      target: targetId ? { id: targetId } : undefined
    });
    
    // 暴露常用Domain
    this.domains = {
      Browser: this.client.Browser,
      Target: this.client.Target,
      Page: this.client.Page,
      DOM: this.client.DOM,
      Runtime: this.client.Runtime,
      Network: this.client.Network,
      Input: this.client.Input,
      Emulation: this.client.Emulation
    };
    
    console.log('✅ CDP客户端已连接');
    return this;
  }
  
  getDomain(name) {
    return this.domains[name];
  }
  
  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('🔌 CDP客户端已断开');
    }
  }
  
  // 便捷方法：在页面中执行JS
  async eval(expression, awaitPromise = false) {
    const Runtime = this.getDomain('Runtime');
    const result = await Runtime.evaluate({
      expression,
      returnByValue: true,
      awaitPromise
    });
    
    if (result.exceptionDetails) {
      throw new Error(`JS执行异常: ${result.exceptionDetails.exception?.description}`);
    }
    
    return result.result.value;
  }
  
  // 便捷方法：等待指定时间
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2.3.2 页面导航实战

```javascript
// navigation_example.js
// 页面导航完整实战
import { CDPClient } from './cdp_client.js';

async function navigationExample() {
  const client = new CDPClient();
  
  try {
    await client.connect();
    const { Page, Runtime } = client.domains;
    
    // 启用Page域以接收导航事件
    await Page.enable();
    
    // 设置等待导航完成的Promise
    const waitForLoad = new Promise((resolve) => {
      Page.loadEventFired(() => {
        console.log('✅ 页面加载完成 (loadEventFired)');
        resolve();
      });
    });
    
    // 执行导航
    console.log('📍 开始导航到百度...');
    const navigateResult = await Page.navigate({
      url: 'https://www.baidu.com'
    });
    console.log('导航frameId:', navigateResult.frameId);
    
    // 等待加载完成
    await waitForLoad;
    
    // 验证导航结果
    const title = await client.eval('document.title');
    console.log(`📄 页面标题: ${title}`);
    
    // 等待2秒观察结果
    await client.sleep(2000);
    
  } finally {
    await client.disconnect();
  }
}

navigationExample().catch(console.error);
```

### 2.3.3 截图功能实战

CDP提供两种截图方式：`Page.captureScreenshot`（可视区域截图）和 `Page.printToPDF`（整页截图/PDF）。

#### 可视区域截图

```javascript
// screenshot_example.js
// 截图功能实战

async function screenshotExample() {
  const client = new CDPClient();
  
  try {
    await client.connect();
    const { Page } = client.domains;
    
    await Page.enable();
    
    // 导航到目标页面
    await Page.navigate({ url: 'https://www.baidu.com' });
    await new Promise(r => Page.loadEventFired(r));
    
    // 等待页面完全渲染
    await client.sleep(1000);
    
    // 方法1：截取可视区域（默认）
    // method: Page.captureScreenshot
    // 文档: https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot
    const { data: screenshotData1 } = await Page.captureScreenshot({
      format: 'png',          // png 或 jpeg
      quality: 80,            // jpeg格式时有效（0-100）
      captureBeyondViewport: false  // 是否截取视口外内容
    });
    
    // 保存截图
    import fs from 'fs';
    fs.writeFileSync('baidu_viewport.png', Buffer.from(screenshotData1, 'base64'));
    console.log('✅ 可视区域截图已保存: baidu_viewport.png');
    
    // 方法2：截取完整页面（需要设置captureBeyondViewport=true）
    const { data: screenshotData2 } = await Page.captureScreenshot({
      format: 'png',
      captureBeyondViewport: true
    });
    
    fs.writeFileSync('baidu_fullpage.png', Buffer.from(screenshotData2, 'base64'));
    console.log('✅ 完整页面截图已保存: baidu_fullpage.png');
    
    // 方法3：指定截取区域
    const { data: screenshotData3 } = await Page.captureScreenshot({
      format: 'png',
      clip: {
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        scale: 2  // 2x高清截图
      }
    });
    
    fs.writeFileSync('baidu_clip.png', Buffer.from(screenshotData3, 'base64'));
    console.log('✅ 指定区域截图已保存: baidu_clip.png');
    
  } finally {
    await client.disconnect();
  }
}

screenshotExample().catch(console.error);
```

#### 截图参数详解

| 参数 | 类型 | 说明 |
|------|------|------|
| `format` | String | `png` 或 `jpeg`，默认`png` |
| `quality` | Integer | jpeg质量 0-100，默认80 |
| `captureBeyondViewport` | Boolean | 是否截取视口外内容，默认`false` |
| `fromSurface` | Boolean | 是否从Surface截取（含滚动条等），默认`true` |
| `clip` | Object | 指定截取区域 `{x, y, width, height, scale}` |

### 2.3.4 PDF导出实战

`Page.printToPDF` 是生成PDF报告的核心方法，支持丰富的打印参数：

```javascript
// pdf_export_example.js
// PDF导出实战

async function pdfExportExample() {
  const client = new CDPClient();
  
  try {
    await client.connect();
    const { Page } = client.domains;
    
    await Page.enable();
    
    // 导航到一个适合打印的页面
    await Page.navigate({ url: 'https://developer.chrome.com/docs/chromedevtools/' });
    await new Promise(r => Page.loadEventFired(r));
    await client.sleep(2000);
    
    // method: Page.printToPDF
    // 文档: https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-printToPDF
    const { data: pdfData } = await Page.printToPDF({
      // 页面设置
      landscape: false,           // 横向/纵向
      printBackground: true,      // 打印背景色
      scale: 1.0,                // 缩放比例
      
      // 纸张设置
      paperWidth: 8.5,           // 纸张宽度（英寸）
      paperHeight: 11.0,         // 纸张高度（英寸）
      marginTop: 0.4,            // 上边距
      marginBottom: 0.4,         // 下边距
      marginLeft: 0.4,           // 左边距
      marginRight: 0.4,          // 右边距
      
      // 高级选项
      pageRanges: '',             // 页码范围，如 "1-5,8"（空=全部）
      preferCSSPageSize: false,   // 是否优先使用CSS定义的页面大小
      generateTaggedPDF: true,    // 生成带标签的PDF（可访问性）
      generateDocumentOutline: true  // 生成文档大纲
    });
    
    // 保存PDF
    import fs from 'fs';
    fs.writeFileSync('chrome_devtools_docs.pdf', Buffer.from(pdfData, 'base64'));
    console.log('✅ PDF已导出: chrome_devtools_docs.pdf');
    
    // 获取文件大小
    const stats = fs.statSync('chrome_devtools_docs.pdf');
    console.log(`📁 文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
  } finally {
    await client.disconnect();
  }
}

pdfExportExample().catch(console.error);
```

#### PDF导出参数速查表

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `landscape` | `false` | `true`=横向，`false`=纵向 |
| `printBackground` | `false` | 是否打印背景色/背景图 |
| `scale` | `1.0` | 缩放 0.1-2.0 |
| `paperWidth` | `8.5` | 纸张宽度（英寸） |
| `paperHeight` | `11.0` | 纸张高度（英寸） |
| `marginTop/Bottom/Left/Right` | `0.4` | 边距（英寸） |
| `pageRanges` | `""` | 页码范围，空=全部页面 |
| `preferCSSPageSize` | `false` | 优先使用CSS `@page` 定义的大小 |
| `generateTaggedPDF` | `false` | 生成带语义标签的PDF |
| `transferMode` | `"ReturnAsBase64"` | `"ReturnAsStream"`可处理大文件 |

> ⚠️ **注意**：`transferMode: "ReturnAsStream"` 用于导出超大PDF，此时返回的是Stream ID而不是直接返回base64数据，需要通过 `IO.read` 方法流式读取。

### 2.3.5 综合实战：自动化网页截图报告生成器

```javascript
// screenshot_report_generator.js
// 综合实战：批量截图并生成报告

import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';

async function generateScreenshotReport(urls, outputDir = './screenshots') {
  // 创建输出目录
  fs.mkdirSync(outputDir, { recursive: true });
  
  const client = await CDP({ port: 9222 });
  const { Page, Runtime } = client;
  
  await Page.enable();
  
  const report = [];
  
  for (const url of urls) {
    console.log(`📸 处理: ${url}`);
    
    try {
      // 导航
      const navResult = await Page.navigate({ url });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('导航超时')), 15000);
        Page.loadEventFired(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      // 等待渲染
      await new Promise(r => setTimeout(r, 1500));
      
      // 获取页面信息
      const title = await Runtime.evaluate({
        expression: 'document.title',
        returnByValue: true
      }).then(r => r.result.value);
      
      const viewport = await Runtime.evaluate({
        expression: '{ width: window.innerWidth, height: window.innerHeight }',
        returnByValue: true
      }).then(r => r.result.value);
      
      // 截图
      const fileName = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.png`;
      const filePath = path.join(outputDir, fileName);
      
      const { data } = await Page.captureScreenshot({
        format: 'png',
        captureBeyondViewport: false
      });
      
      fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
      
      report.push({
        url,
        title,
        viewport: `${viewport.width}x${viewport.height}`,
        screenshot: filePath,
        status: 'success'
      });
      
      console.log(`  ✅ 截图已保存: ${filePath}`);
      
    } catch (err) {
      console.error(`  ❌ 处理失败: ${err.message}`);
      report.push({ url, status: 'failed', error: err.message });
    }
  }
  
  await client.close();
  
  // 生成Markdown报告
  const reportMd = generateMarkdownReport(report);
  fs.writeFileSync(path.join(outputDir, 'report.md'), reportMd);
  console.log(`📝 报告已生成: ${path.join(outputDir, 'report.md')}`);
  
  return report;
}

function generateMarkdownReport(report) {
  let md = '# 网页截图报告\n\n';
  md += `生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  md += `总页面数: ${report.length} | `;
  md += `成功: ${report.filter(r => r.status === 'success').length} | `;
  md += `失败: ${report.filter(r => r.status === 'failed').length}\n\n`;
  md += '---\n\n';
  
  for (const item of report) {
    md += `## ${item.title || item.url}\n\n`;
    md += `- URL: ${item.url}\n`;
    if (item.status === 'success') {
      md += `- 视口: ${item.viewport}\n`;
      md += `- 截图: ![${item.title}](${path.basename(item.screenshot)})\n\n`;
    } else {
      md += `- ❌ 失败: ${item.error}\n\n`;
    }
  }
  
  return md;
}

// 使用示例
const urlsToCapture = [
  'https://www.baidu.com',
  'https://www.github.com',
  'https://developer.chrome.com'
];

generateScreenshotReport(urlsToCapture).catch(console.error);
```

---

## 2.4 Event监听机制：网络请求拦截与生命周期钩子

### 2.4.1 CDP事件模型核心概念

CDP采用**发布-订阅（Pub/Sub）模式**实现事件通知。在使用事件之前，必须先调用对应Domain的 `enable` 方法，这相当于「订阅主题」。

```
事件流模型
│
│   Browser (事件源)
│       │
│       │ 产生事件
│       ▼
│   WebSocket连接
│       │
│       │ 推送JSON消息
│       ▼
│   你的应用程序
│       │
│       │ 注册回调函数
│       ▼
│   事件处理器 (Event Handler)
```

**图2-5：CDP事件流模型图**（Browser产生事件 → 通过WebSocket推送 → 应用程序通过回调处理）

### 2.4.2 Network Domain：网络请求拦截实战

Network Domain 是CDP中最强大的Domain之一，可以实现网络请求的监控、拦截、修改和Mock。

#### 启用Network监控

```javascript
// network_monitoring.js
// 网络请求监控基础

async function networkMonitoringExample() {
  const client = await CDP({ port: 9222 });
  const { Network, Page } = client;
  
  // ⚠️ 必须先启用Network域
  await Network.enable();
  await Page.enable();
  
  // 监听所有请求发起事件
  Network.requestWillBeSent((params) => {
    const { requestId, request, timestamp } = params;
    console.log(`📤 [${timestamp.toFixed(2)}] 请求发起: ${request.method} ${request.url}`);
    console.log(`   RequestId: ${requestId}`);
    console.log(`   Headers: ${JSON.stringify(request.headers).substring(0, 100)}...`);
  });
  
  // 监听响应接收事件
  Network.responseReceived((params) => {
    const { requestId, response, timestamp } = params;
    console.log(`📥 [${timestamp.toFixed(2)}] 响应接收: ${response.status} ${response.url}`);
    console.log(`   Content-Type: ${response.headers['content-type']}`);
    console.log(`   Size: ${response.headers['content-length'] || 'unknown'} bytes`);
  });
  
  // 监听请求完成事件
  Network.loadingFinished((params) => {
    const { requestId, timestamp, encodedDataLength } = params;
    console.log(`✅ [${timestamp.toFixed(2)}] 请求完成: ${requestId}, 大小: ${encodedDataLength} bytes`);
  });
  
  // 监听请求失败事件
  Network.loadingFailed((params) => {
    const { requestId, errorText, canceled } = params;
    console.log(`❌ 请求失败: ${requestId}`);
    console.log(`   错误: ${errorText}, 取消: ${canceled}`);
  });
  
  // 导航到测试页面
  await Page.navigate({ url: 'https://www.baidu.com' });
  
  // 等待10秒以收集网络事件
  await new Promise(r => setTimeout(r, 10000));
  
  await client.close();
}

networkMonitoringExample().catch(console.error);
```

#### 请求拦截与修改（Mock API）

CDP最强大的功能之一是可以在网络请求发出前进行拦截和修改，实现API Mock、请求重定向等高级功能。

```javascript
// network_interception.js
// 网络请求拦截与修改

async function networkInterceptionExample() {
  const client = await CDP({ port: 9222 });
  const { Network, Page } = client;
  
  await Network.enable();
  await Page.enable();
  
  // 步骤1：设置请求拦截模式
  // method: Network.setRequestInterception
  // 文档: https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-setRequestInterception
  await Network.setRequestInterception({
    patterns: [
      // 拦截所有请求
      { urlPattern: '*', resourceType: 'Document', interceptionStage: 'Request' },
      // 拦截所有XHR/Fetch请求
      { urlPattern: '*', resourceType: 'XHR', interceptionStage: 'Request' },
      { urlPattern: '*', resourceType: 'Fetch', interceptionStage: 'Request' }
    ]
  });
  
  console.log('🛡️ 请求拦截已启用');
  
  // 步骤2：处理拦截的请求
  Network.requestIntercepted(async (params) => {
    const { interceptionId, request, resourceType } = params;
    
    console.log(`🎯 拦截到请求: ${request.method} ${request.url} (${resourceType})`);
    
    if (request.url.includes('api.example.com')) {
      // 场景1：返回Mock响应
      console.log('  → 返回Mock数据');
      await Network.continueInterceptedRequest({
        interceptionId,
        rawResponse: Buffer.from(
          `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({
            mock: true,
            data: '这是Mock数据',
            timestamp: Date.now()
          })}`
        ).toString('base64')
      });
    } else if (request.url.includes('google-analytics')) {
      // 场景2：阻止请求（屏蔽分析追踪）
      console.log('  → 阻止分析请求');
      await Network.continueInterceptedRequest({
        interceptionId,
        errorReason: 'Aborted'  // 可选值: Failed, Aborted, TimedOut, etc.
      });
    } else if (request.url.includes('baidu.com')) {
      // 场景3：修改请求头
      console.log('  → 修改请求头');
      const modifiedHeaders = { ...request.headers };
      modifiedHeaders['X-CDP-Injected'] = 'true';
      modifiedHeaders['User-Agent'] = 'CDP Bot/1.0';
      
      await Network.continueInterceptedRequest({
        interceptionId,
        headers: Object.entries(modifiedHeaders).map(([name, value]) => ({
          name,
          value
        }))
      });
    } else {
      // 场景4：放行（不修改）
      await Network.continueInterceptedRequest({ interceptionId });
    }
  });
  
  // 导航到测试页面
  await Page.navigate({ url: 'https://www.baidu.com' });
  
  await new Promise(r => setTimeout(r, 5000));
  await client.close();
}

networkInterceptionExample().catch(console.error);
```

#### 获取完整的响应体

```javascript
// network_response_body.js
// 获取网络响应体内容

async function getResponseBody() {
  const client = await CDP({ port: 9222 });
  const { Network, Page } = client;
  
  await Network.enable();
  await Page.enable();
  
  // 记录所有请求的requestId与URL映射
  const requestMap = new Map();
  
  Network.requestWillBeSent((params) => {
    requestMap.set(params.requestId, params.request.url);
  });
  
  // 在请求完成时获取响应体
  Network.loadingFinished(async (params) => {
    const { requestId } = params;
    const url = requestMap.get(requestId);
    
    // 只处理API请求
    if (url && (url.includes('/api/') || url.endsWith('.json'))) {
      try {
        // method: Network.getResponseBody
        // 文档: https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-getResponseBody
        const { body, base64Encoded } = await Network.getResponseBody({ requestId });
        
        const responseBody = base64Encoded ? Buffer.from(body, 'base64').toString() : body;
        console.log(`📦 响应体 (${url}):`);
        console.log(responseBody.substring(0, 200));  // 只打印前200字符
      } catch (err) {
        console.error(`获取响应体失败 (${requestId}):`, err.message);
      }
    }
  });
  
  await Page.navigate({ url: 'https://www.github.com' });
  await new Promise(r => setTimeout(r, 8000));
  await client.close();
}

getResponseBody().catch(console.error);
```

### 2.4.3 页面生命周期钩子详解

精确的页面加载状态判断是自动化脚本稳定性的关键。CDP提供了多层次的生命周期事件：

```
页面加载状态层次
│
├── Page.frameStartedLoading      「帧开始加载」（最早）
├── Page.domContentEventFired     「DOM解析完成」（DOMContentLoaded）
├── Page.loadEventFired           「资源加载完成」（window.onload）
├── Page.lifecycleEvent(name=networkIdle)     「网络空闲」（最精确）
└── Page.lifecycleEvent(name=networkAlmostIdle) 「网络接近空闲」
```

**图2-6：页面加载状态层次图**（从最早到最精确，不同场景选择合适等待策略）

#### 使用LifecycleEvent实现精确等待

```javascript
// lifecycle_hooks.js
// 页面生命周期钩子实战

async function lifecycleHooksExample() {
  const client = await CDP({ port: 9222 });
  const { Page, Network } = client;
  
  await Page.enable();
  await Network.enable();
  
  // 启用精细化生命周期事件
  await Page.setLifecycleEventsEnabled({ enabled: true });
  
  // 监听所有生命周期事件
  Page.lifecycleEvent((params) => {
    const { frameId, name, timestamp } = params;
    console.log(`🔄 [${timestamp.toFixed(2)}] ${name}`);
  });
  
  // 监听网络请求数量变化（辅助判断网络空闲）
  let pendingRequests = 0;
  Network.requestWillBeSent(() => { pendingRequests++; });
  Network.loadingFinished(() => { pendingRequests--; });
  Network.loadingFailed(() => { pendingRequests--; });
  
  // 自定义等待函数：等待网络空闲
  async function waitForNetworkIdle(timeout = 5000, idleTime = 500) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let lastActivityTime = Date.now();
      
      const check = () => {
        const now = Date.now();
        
        if (pendingRequests === 0 && (now - lastActivityTime) >= idleTime) {
          console.log(`✅ 网络已空闲（等待了 ${now - startTime}ms）`);
          resolve();
        } else if (now - startTime > timeout) {
          console.warn(`⚠️ 等待网络空闲超时（仍有 ${pendingRequests} 个请求）`);
          resolve();  // 超时时也resolve，不阻塞
        } else {
          if (pendingRequests > 0) {
            lastActivityTime = now;
          }
          setTimeout(check, 100);
        }
      };
      
      check();
    });
  }
  
  // 导航并等待网络空闲
  console.log('📍 开始导航...');
  const navStart = Date.now();
  
  await Page.navigate({ url: 'https://www.baidu.com' });
  
  // 等待load事件
  await new Promise(r => Page.loadEventFired(r));
  console.log(`⏱️ load事件触发: ${Date.now() - navStart}ms`);
  
  // 继续等待网络完全空闲（SPA场景很重要）
  await waitForNetworkIdle();
  console.log(`⏱️ 网络完全空闲: ${Date.now() - navStart}ms`);
  
  await client.close();
}

lifecycleHooksExample().catch(console.error);
```

#### 各生命周期事件对比

| 事件 | 触发时机 | 适用场景 | 精度 |
|------|---------|---------|------|
| `Page.frameStartedLoading` | 帧开始加载 | 检测导航开始 |  earliest |
| `Page.domContentEventFired` | DOMContentLoaded触发 | DOM可操作时 | 中等 |
| `Page.loadEventFired` | window.onload触发 | 所有资源加载完成 | 较高 |
| `lifecycleEvent(name=networkIdle)` | 网络请求为0持续500ms | SPA路由切换完成 | 最高 |
| 自定义网络空闲检测 | 无pending请求 | 动态内容加载完成 | 最高（灵活） |

### 2.4.4 综合实战：网络流量分析与性能报告

```javascript
// network_analysis.js
// 综合实战：网络流量分析与性能报告生成

async function analyzeNetworkPerformance(url) {
  const client = await CDP({ port: 9222 });
  const { Network, Page, Runtime } = client;
  
  await Network.enable();
  await Page.enable();
  
  const requests = [];
  
  // 收集所有网络请求信息
  Network.requestWillBeSent((params) => {
    requests[params.requestId] = {
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      startTime: params.timestamp,
      type: params.type,  // Document, Stylesheet, Image, XHR, Fetch, etc.
      headers: params.request.headers,
      timing: null,
      response: null
    };
  });
  
  Network.responseReceived((params) => {
    const req = requests[params.requestId];
    if (req) {
      req.response = {
        status: params.response.status,
        statusText: params.response.statusText,
        headers: params.response.headers,
        mimeType: params.response.mimeType,
        timing: params.response.timing  // 包含详细的时序信息
      };
      req.endTime = params.timestamp;
    }
  });
  
  Network.loadingFinished((params) => {
    const req = requests[params.requestId];
    if (req) {
      req.encodedDataLength = params.encodedDataLength;
      req.decodedBodyLength = params.decodedBodyLength;
    }
  });
  
  // 导航并等待加载完成
  await Page.navigate({ url });
  await new Promise(r => Page.loadEventFired(r));
  await new Promise(r => setTimeout(r, 2000));  // 等待异步请求
  
  // 分析报告
  const validRequests = Object.values(requests).filter(r => r.response);
  
  console.log('\n===== 网络性能分析报告 =====');
  console.log(`URL: ${url}`);
  console.log(`总请求数: ${validRequests.length}`);
  
  // 按类型统计
  const byType = {};
  validRequests.forEach(r => {
    byType[r.type] = (byType[r.type] || 0) + 1;
  });
  console.log('\n按资源类型统计:');
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  // 最慢的5个请求
  const withTiming = validRequests.filter(r => r.response?.timing);
  const sortedByDuration = withTiming.sort((a, b) => {
    const durA = getDuration(a.response.timing);
    const durB = getDuration(b.response.timing);
    return durB - durA;
  });
  
  console.log('\n最慢的5个请求:');
  sortedByDuration.slice(0, 5).forEach(r => {
    const dur = getDuration(r.response.timing);
    console.log(`  ${dur.toFixed(0)}ms - ${r.url.substring(0, 80)}`);
  });
  
  // 失败请求
  const failed = validRequests.filter(r => r.response?.status >= 400);
  if (failed.length > 0) {
    console.log('\n失败的请求:');
    failed.forEach(r => {
      console.log(`  ${r.response.status} ${r.response.statusText} - ${r.url}`);
    });
  }
  
  await client.close();
  
  function getDuration(timing) {
    if (!timing) return 0;
    // timing中的时间都是相对于请求开始时间的偏移量（毫秒）
    return (timing.receiveHeadersEnd || 0) - (timing.requestTime * 1000 || 0);
  }
}

analyzeNetworkPerformance('https://www.baidu.com').catch(console.error);
```

---

## 2.5 会话管理：建立与维护稳定的CDP连接

### 2.5.1 CDP连接层次结构

CDP的连接管理涉及三个层次的概念：

```
CDP连接层次结构
│
├── Browser级别连接（全局）
│   └── ws://localhost:9222/devtools/browser
│       └── 可以管理所有Target，但无法直接操作页面内容
│
├── Target级别连接（单Tab）
│   └── ws://localhost:9222/devtools/page/PAGE_ID
│       └── 直接操作指定Tab，最常用
│
└── Session级别连接（多Tab隔离）
    └── 通过Target.attachToTarget获得sessionId
        └── 在同一WebSocket上多路复用多个Target的操作
```

**图2-7：CDP连接层次结构图**（Browser级连接权限最高但功能最抽象，Target级连接最常用，Session级连接支持多Tab并发操控）

### 2.5.2 连接建立策略对比

| 策略 | 连接方式 | 优点 | 缺点 | 适用场景 |
|------|---------|------|------|---------|
| **直接连接** | `ws://.../devtools/page/PAGE_ID` | 简单直接，独立连接 | 多Tab需要多个WebSocket | 单Tab自动化 |
| **Browser级+Attach** | 先连Browser级，再Attach到Target | 统一管理，支持多Tab | 需要处理sessionId路由 | 多Tab并发自动化 |
| **FlatSession** | Attach时设置`flatten=true` | 自动处理sessionId | 需Chrome 72+ | 复杂自动化场景 |

### 2.5.3 稳定的CDP连接封装

生产环境中，CDP连接可能因为浏览器崩溃、网络中断等原因断开。下面是一个具备自动重连能力的连接封装：

```javascript
// stable_cdp_connection.js
// 具备自动重连能力的CDP连接封装

import CDP from 'chrome-remote-interface';
import EventEmitter from 'events';

export class StableCDPConnection extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      port: 9222,
      host: '127.0.0.1',
      targetId: null,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      ...options
    };
    
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.domains = {};
    this.eventHandlers = new Map();  // 保存事件处理器用于重连后重新注册
  }
  
  async connect() {
    try {
      this.client = await CDP({
        port: this.options.port,
        host: this.options.host,
        target: this.options.targetId ? { id: this.options.targetId } : undefined
      });
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // 暴露Domain
      this.domains = {
        Browser: this.client.Browser,
        Target: this.client.Target,
        Page: this.client.Page,
        DOM: this.client.DOM,
        Runtime: this.client.Runtime,
        Network: this.client.Network,
        Input: this.client.Input,
        Emulation: this.client.Emulation,
        Security: this.client.Security,
        Performance: this.client.Performance
      };
      
      // 监听连接断开事件
      this.client.on('disconnect', () => {
        this.isConnected = false;
        this.emit('disconnect');
        console.warn('⚠️ CDP连接已断开');
        
        if (this.options.autoReconnect) {
          this.attemptReconnect();
        }
      });
      
      // 重新注册事件处理器
      this.restoreEventHandlers();
      
      this.emit('connect');
      console.log('✅ CDP连接已建立');
      
      return this;
      
    } catch (err) {
      console.error('❌ CDP连接失败:', err.message);
      
      if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
        await this.attemptReconnect();
      } else {
        throw err;
      }
    }
  }
  
  async attemptReconnect() {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error(`❌ 重连失败，已达最大重试次数 ${this.options.maxReconnectAttempts}`);
      this.emit('reconnect_failed');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.options.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);  // 指数退避
    
    console.log(`🔄 第${this.reconnectAttempts}次重连尝试，${delay}ms后重试...`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    
    await new Promise(r => setTimeout(r, delay));
    
    try {
      await this.connect();
      console.log('✅ 重连成功');
      this.emit('reconnected');
    } catch (err) {
      // connect()方法内部会再次触发重连
    }
  }
  
  // 注册事件处理器（自动保存，用于重连后恢复）
  onEvent(domain, event, handler) {
    const key = `${domain}.${event}`;
    this.eventHandlers.set(key, { domain, event, handler });
    
    if (this.domains[domain]) {
      this.domains[domain][event](handler);
    }
    
    return this;
  }
  
  restoreEventHandlers() {
    for (const { domain, event, handler } of this.eventHandlers.values()) {
      if (this.domains[domain]) {
        this.domains[domain][event](handler);
      }
    }
  }
  
  // 发送CDP命令（带重试）
  async sendCommand(domain, method, params = {}) {
    if (!this.isConnected) {
      throw new Error('CDP连接未建立');
    }
    
    try {
      const domainObj = this.domains[domain];
      if (!domainObj) {
        throw new Error(`Domain ${domain} 不存在`);
      }
      
      const result = await domainObj[method](params);
      return result;
    } catch (err) {
      if (err.message.includes('Connection is closed') || err.message.includes('not connected')) {
        this.isConnected = false;
        this.emit('disconnect');
        
        if (this.options.autoReconnect) {
          // 等待重连完成
          await new Promise(r => this.once('reconnected', r));
          // 重试一次
          return await this.sendCommand(domain, method, params);
        }
      }
      throw err;
    }
  }
  
  getDomain(name) {
    return this.domains[name];
  }
  
  async disconnect() {
    this.options.autoReconnect = false;  // 主动断开时不再重连
    if (this.client) {
      await this.client.close();
      this.isConnected = false;
      console.log('🔌 CDP连接已主动关闭');
    }
  }
  
  // 便捷方法：执行JS
  async eval(expression, awaitPromise = false) {
    const result = await this.sendCommand('Runtime', 'evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    });
    
    if (result.exceptionDetails) {
      throw new Error(`JS执行异常: ${result.exceptionDetails.exception?.description}`);
    }
    
    return result.result.value;
  }
}

// 使用示例
async function stableConnectionExample() {
  const connection = new StableCDPConnection({
    port: 9222,
    autoReconnect: true,
    maxReconnectAttempts: 3
  });
  
  // 监听连接事件
  connection.on('connect', () => console.log('事件: 连接已建立'));
  connection.on('disconnect', () => console.log('事件: 连接已断开'));
  connection.on('reconnecting', ({ attempt }) => console.log(`事件: 正在重连(${attempt})...`));
  connection.on('reconnected', () => console.log('事件: 重连成功'));
  
  // 注册事件处理器（会自动恢复）
  connection.onEvent('Page', 'loadEventFired', () => {
    console.log('📄 页面加载完成（事件处理器）');
  });
  
  connection.onEvent('Network', 'requestWillBeSent', (params) => {
    console.log(`📤 请求: ${params.request.url}`);
  });
  
  // 建立连接
  await connection.connect();
  
  // 使用连接进行操作
  const Page = connection.getDomain('Page');
  await Page.enable();
  await Page.navigate({ url: 'https://www.baidu.com' });
  
  await new Promise(r => setTimeout(r, 3000));
  
  // 断开连接（会自动重连）
  // connection.client.close();  // 模拟意外断开
  
  // 最终关闭
  await connection.disconnect();
}

stableConnectionExample().catch(console.error);
```

### 2.5.4 多Tab并发管理

在复杂的自动化场景中，往往需要同时操控多个标签页。使用 `Target.attachToTarget` 配合 `sessionId` 可以实现多Tab并发：

```javascript
// multi_tab_management.js
// 多Tab并发管理

async function multiTabManagementExample() {
  // 连接到Browser级端点
  const browserClient = await CDP({
    port: 9222,
    target: { type: 'browser' }  // Browser级连接
  });
  
  const { Target, Browser } = browserClient;
  await Target.enable();
  
  // 创建多个Tab
  console.log('📑 创建多个标签页...');
  const tabUrls = [
    'https://www.baidu.com',
    'https://www.github.com',
    'https://developer.chrome.com'
  ];
  
  const targets = [];
  for (const url of tabUrls) {
    const { targetId } = await Target.createTarget({
      url,
      width: 1280,
      height: 720
    });
    targets.push(targetId);
    console.log(`  ✅ 已创建Tab: ${targetId} -> ${url}`);
  }
  
  // 等待所有Tab加载完成
  console.log('\n⏳ 等待所有Tab加载完成...');
  
  const attachPromises = targets.map(async (targetId, index) => {
    // 附加到每个Target
    const { sessionId } = await Target.attachToTarget({
      targetId,
      flatten: true  // 重要：扁平化session，无需手动处理sessionId
    });
    
    console.log(`  🔗 已附加到Tab ${index + 1}, sessionId: ${sessionId}`);
    
    // 注意：flatten=true时，CDP库会自动处理sessionId
    // 这里需要为每个Tab创建独立的CDP连接
    return { targetId, sessionId };
  });
  
  await Promise.all(attachPromises);
  
  // 为每个Tab创建独立连接并操作
  const tabOperations = targets.map(async (targetId, index) => {
    const tabClient = await CDP({
      port: 9222,
      target: { id: targetId }
    });
    
    const { Page, Runtime } = tabClient;
    await Page.enable();
    
    // 等待加载完成
    await new Promise(r => Page.loadEventFired(r));
    await new Promise(r => setTimeout(r, 1000));
    
    // 获取页面信息
    const title = await Runtime.evaluate({
      expression: 'document.title',
      returnByValue: true
    }).then(r => r.result.value);
    
    const url = await Runtime.evaluate({
      expression: 'window.location.href',
      returnByValue: true
    }).then(r => r.result.value);
    
    console.log(`\n📄 Tab ${index + 1}:`);
    console.log(`    标题: ${title}`);
    console.log(`    URL: ${url}`);
    
    // 在每个Tab中执行不同操作
    if (index === 0) {
      console.log('    → 在百度中搜索...');
      // 这里可以添加搜索操作
    } else if (index === 1) {
      console.log('    → 在GitHub中滚动...');
      // 这里可以添加滚动操作
    }
    
    await tabClient.close();
  });
  
  await Promise.all(tabOperations);
  
  // 关闭所有创建的Tab
  console.log('\n🗑️ 清理：关闭所有创建的Tab...');
  for (const targetId of targets) {
    await Target.closeTarget({ targetId });
  }
  
  await browserClient.close();
  console.log('✅ 多Tab管理示例完成');
}

multiTabManagementExample().catch(console.error);
```

### 2.5.5 连接健康检查与监控

```javascript
// connection_health_monitor.js
// 连接健康检查与监控

export class CDPHealthMonitor {
  constructor(connection, options = {}) {
    this.connection = connection;
    this.options = {
      healthCheckInterval: 30000,   // 30秒检查一次
      healthCheckTimeout: 5000,     // 健康检查超时
      maxConsecutiveFailures: 3,    // 连续失败3次判定为不健康
      ...options
    };
    
    this.consecutiveFailures = 0;
    this.isHealthy = true;
    this.intervalId = null;
    this.metrics = {
      totalCommands: 0,
      failedCommands: 0,
      avgResponseTime: 0,
      lastHealthCheck: null
    };
  }
  
  start() {
    console.log(`💓 健康检查已启动（间隔: ${this.options.healthCheckInterval}ms）`);
    
    this.intervalId = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }
  
  async performHealthCheck() {
    const startTime = Date.now();
    
    try {
      // 发送一个简单的命令测试连接
      await Promise.race([
        this.connection.eval('1+1'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('健康检查超时')), this.options.healthCheckTimeout)
        )
      ]);
      
      const responseTime = Date.now() - startTime;
      
      // 更新指标
      this.metrics.totalCommands++;
      this.metrics.avgResponseTime = 
        (this.metrics.avgResponseTime * (this.metrics.totalCommands - 1) + responseTime) 
        / this.metrics.totalCommands;
      this.metrics.lastHealthCheck = new Date();
      
      // 重置连续失败计数
      if (this.consecutiveFailures > 0) {
        console.log(`💚 连接恢复（响应时间: ${responseTime}ms）`);
      }
      this.consecutiveFailures = 0;
      
      if (!this.isHealthy) {
        this.isHealthy = true;
        this.connection.emit('healthy');
      }
      
    } catch (err) {
      this.consecutiveFailures++;
      this.metrics.failedCommands++;
      
      console.error(`💔 健康检查失败 (${this.consecutiveFailures}/${this.options.maxConsecutiveFailures}):`, err.message);
      
      if (this.consecutiveFailures >= this.options.maxConsecutiveFailures) {
        this.isHealthy = false;
        console.error('❌ 连接判定为不健康');
        this.connection.emit('unhealthy');
        
        // 触发重连
        if (this.connection.options.autoReconnect) {
          console.log('🔄 触发自动重连...');
          this.connection.attemptReconnect();
        }
      }
    }
  }
  
  getMetrics() {
    return {
      ...this.metrics,
      isHealthy: this.isHealthy,
      consecutiveFailures: this.consecutiveFailures,
      successRate: this.metrics.totalCommands > 0 
        ? ((this.metrics.totalCommands - this.metrics.failedCommands) / this.metrics.totalCommands * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }
  
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('💓 健康检查已停止');
    }
  }
}

// 使用示例
async function healthMonitorExample() {
  const connection = new StableCDPConnection({ port: 9222 });
  await connection.connect();
  
  const monitor = new CDPHealthMonitor(connection, {
    healthCheckInterval: 10000,  // 10秒检查一次
    maxConsecutiveFailures: 2
  });
  
  // 监听健康状态变化
  connection.on('healthy', () => console.log('🟢 连接状态: 健康'));
  connection.on('unhealthy', () => console.log('🔴 连接状态: 不健康'));
  
  monitor.start();
  
  // 模拟一些操作
  for (let i = 0; i < 5; i++) {
    try {
      const title = await connection.eval('document.title');
      console.log(`操作${i + 1}: 当前页面标题 = ${title}`);
    } catch (err) {
      console.error(`操作${i + 1} 失败:`, err.message);
    }
    
    await new Promise(r => setTimeout(r, 5000));
  }
  
  // 打印最终指标
  console.log('\n📊 连接健康指标:');
  console.log(JSON.stringify(monitor.getMetrics(), null, 2));
  
  monitor.stop();
  await connection.disconnect();
}

healthMonitorExample().catch(console.error);
```

---

## 本章小结

本章我们系统学习了CDP协议的基础知识，核心要点总结如下：

1. **协议栈**：CDP基于WebSocket实现双向通信，消息格式遵循JSON-RPC 2.0规范，理解`id`、`method`、`params`、`result`四个核心字段是掌握CDP的基础。

2. **四大核心Domain**：
   - `Target`：管理浏览器中的标签页和iframe
   - `Page`：控制页面导航、截图和PDF导出
   - `DOM`：结构化访问和操作DOM树
   - `Runtime`：在页面JS上下文中执行代码

3. **Method调用**：每个命令调用都遵循`Domain.method`格式，需要先`enable`再使用，通过`id`字段匹配响应。

4. **Event监听**：事件是CDP的「推送」机制，启用对应Domain后自动接收事件通知，是实现异步等待和主动监控的核心。

5. **连接管理**：生产环境中必须使用具备自动重连、健康检查和多Tab管理能力的连接封装，这是构建稳定自动化系统的基础。

下一章我们将深入学习页面与DOM的深度操控技术，包括精准的元素定位、属性修改、JS注入以及模拟真实用户交互的高级技巧。

---

> **参考资源**
> - [CDP官方协议文档](https://chromedevtools.github.io/devtools-protocol/)
> - [JSON-RPC 2.0规范](https://www.jsonrpc.org/specification)
> - [Chrome DevTools Protocol Viewer](https://chromedevtools.github.io/devtools-protocol/)
> - [chrome-remote-interface库文档](https://github.com/cyrus-and/chrome-remote-interface)
> - [Puppeteer CDP文档](https://pptr.dev/)
