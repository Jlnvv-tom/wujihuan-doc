# 第5章 性能监控与自动化审计

> "你无法优化你无法衡量的东西。" —— Peter Drucker

在前四章中，我们掌握了 CDP 的通信机制、DOM 操控和网络层控制。现在，让我们进入每个前端工程师的"深水区"——**性能监控**。当页面加载变慢、交互卡顿、内存持续攀升时，CDP 提供的底层能力能让我们像"透视眼"一样看穿浏览器内核的运行状态。

本章将带你从 Performance Domain 的指标采集出发，经过移动设备仿真、Lighthouse 自动化审计，深入内存泄漏检测与长任务监控，最终构建一套**全自动化的性能诊断流水线**。

---

## 5.1 Performance Domain：采集 CPU、内存与渲染指标

### 5.1.1 Performance Domain 能做什么？

CDP 的 [`Performance`](https://chromedevtools.github.io/devtools-protocol/tot/Performance/) Domain 是浏览器性能数据的"自来水管"——它提供了持续性的指标流，而非一次性的快照。与 `Performance.now()` 等 Web API 不同，CDP 层面的 Performance Domain 能获取到**浏览器内核级别的指标**，包括：

| 指标类别 | 具体指标 | 说明 |
|---------|---------|------|
| CPU | `ScriptDuration` | JavaScript 执行耗时 |
| CPU | `TaskDuration` | 所有任务耗时（含浏览器内部任务） |
| 内存 | `JSHeapUsedSize` | JS 堆已使用大小 |
| 内存 | `JSHeapTotalSize` | JS 堆总大小 |
| 渲染 | `LayoutCount` | 布局（回流）次数 |
| 渲染 | `RecalcStyleCount` | 样式重算次数 |
| 渲染 | `LayoutDuration` | 布局耗时 |

> 📖 **官方文档**：[Performance Domain - Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)

### 5.1.2 启用指标采集

Performance Domain 默认是关闭的，需要先调用 `Performance.enable`：

```javascript
const CDP = require('chrome-remote-interface');

async function monitorPerformance() {
  const client = await CDP();
  const { Performance } = client;

  // 启用 Performance Domain
  await Performance.enable({ timeDomain: 'timeTicks' });

  // 监听指标事件
  Performance.metrics(({ metrics }) => {
    const data = {};
    metrics.forEach(m => data[m.name] = m.value);
    console.log('📊 性能指标:', data);
  });

  // 主动获取当前指标
  const { metrics } = await Performance.getMetrics();
  metrics.forEach(m => console.log(`${m.name}: ${m.value}`));
}
```

### 5.1.3 构建持续监控脚本

单独获取一次指标意义不大，我们真正需要的是**时间序列数据**——每隔一段时间采集一次，形成趋势图：

```javascript
async function continuousMonitor(client, intervalMs = 1000) {
  const { Performance } = client;
  await Performance.enable({ timeDomain: 'timeTicks' });

  const history = [];

  const timer = setInterval(async () => {
    const { metrics } = await Performance.getMetrics();
    const snapshot = {};
    metrics.forEach(m => { snapshot[m.name] = m.value; });
    snapshot.timestamp = Date.now();
    history.push(snapshot);
  }, intervalMs);

  // 返回控制句柄，便于随时停止
  return {
    stop: () => {
      clearInterval(timer);
      return history;
    },
    getHistory: () => history
  };
}
```

> 💡 **实践建议**：采集间隔不宜低于 500ms，过高的采集频率本身就会对性能造成干扰（Heisenbug 的典型场景）。

### 5.1.4 渲染指标深度解读

三个渲染指标——`LayoutCount`、`RecalcStyleCount` 和 `LayoutDuration`——是前端性能优化的"金矿"：

```
[图示位置：渲染指标趋势折线图]
- X轴：时间线（0s → 60s）
- Y轴：次数/耗时
- 三条曲线：LayoutCount（蓝色）、RecalcStyleCount（橙色）、LayoutDuration（绿色）
- 在某次用户交互处出现尖峰，标注"强制同步布局"
```

**强制同步布局（Forced Synchronous Layout）**是前端性能的头号杀手。它发生在 JavaScript 读写 DOM 属性交替进行时：

```javascript
// ❌ 触发多次强制同步布局
elements.forEach(el => {
  const height = el.offsetHeight; // 读取 → 触发布局
  el.style.height = height + 10 + 'px'; // 写入 → 使布局失效
  // 下次循环又读取 offsetHeight → 再次触发布局！
});

// ✅ 批量读取，批量写入
const heights = elements.map(el => el.offsetHeight); // 批量读
elements.forEach((el, i) => {
  el.style.height = heights[i] + 10 + 'px'; // 批量写
});
```

通过 CDP 持续监控 `LayoutCount` 的增长率，你可以精确判断某个交互是否触发了意外的布局抖动。

---

## 5.2 模拟移动设备：设备指标仿真与触摸事件

### 5.2.1 为什么需要移动设备仿真？

移动端的性能表现与桌面端截然不同——CPU 算力弱、内存有限、网络延迟高、触摸事件替代鼠标。在桌面 Chrome 上流畅运行的页面，到了真机上可能卡成 PPT。

CDP 提供了 [`Emulation`](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/) Domain，让你无需真机就能模拟移动环境，**在自动化流水线中完成移动端性能验证**。

> 📖 **官方文档**：[Emulation Domain - Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)

### 5.2.2 设备指标仿真：CPU 节流与 DPR

CPU 节流是移动端仿真的核心能力。`Emulation.setCPUThrottlingRate` 可以让桌面 CPU "变慢"：

```javascript
async function emulateMobile(client) {
  const { Emulation, Page } = client;

  // 模拟 iPhone 14 的设备指标
  await Emulation.setDeviceMetricsOverride({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,       // DPR = 3（Retina 屏）
    mobile: true,
    scaleFactor: 1
  });

  // CPU 节流 4 倍（模拟中端移动芯片）
  await Emulation.setCPUThrottlingRate({ rate: 4 });

  // 触摸事件仿真
  await Emulation.setTouchEmulationEnabled({
    enabled: true,
    maxTouchPoints: 5
  });

  // 模拟移动端 User-Agent
  await Emulation.setUserAgentOverride({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ...',
    platform: 'iPhone'
  });
}
```

> ⚠️ **注意**：`setDeviceMetricsOverride` 只改变视口和 DPR，不会自动调整 CPU 和网络。要完整模拟移动端体验，需要**同时配置 CPU 节流 + 网络节流**。

### 5.2.3 触摸事件模拟

移动端的交互逻辑依赖 Touch Event 而非 Mouse Event。CDP 的 [`Input`](https://chromedevtools.github.io/devtools-protocol/tot/Input/) Domain 提供了触摸事件的注入能力：

```javascript
async function simulateTap(client, x, y) {
  const { Input } = client;

  // 触摸开始
  await Input.dispatchTouchEvent({
    type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 1, radiusY: 1 }],
  });

  // 短暂延迟模拟真实触摸
  await new Promise(r => setTimeout(r, 50));

  // 触摸结束
  await Input.dispatchTouchEvent({
    type: 'touchEnd',
    touchPoints: [{ x, y, radiusX: 1, radiusY: 1 }],
  });
}

// 模拟滑动（Swipe）
async function simulateSwipe(client, startX, startY, endX, endY, durationMs = 300) {
  const { Input } = client;
  const steps = 10;

  await Input.dispatchTouchEvent({
    type: 'touchStart',
    touchPoints: [{ x: startX, y: startY }]
  });

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    await new Promise(r => setTimeout(r, durationMs / steps));
    await Input.dispatchTouchEvent({
      type: 'touchMove',
      touchPoints: [{
        x: startX + (endX - startX) * progress,
        y: startY + (endY - startY) * progress
      }]
    });
  }

  await Input.dispatchTouchEvent({
    type: 'touchEnd',
    touchPoints: [{ x: endX, y: endY }]
  });
}
```

### 5.2.4 常见移动设备参数速查表

| 设备 | 分辨率 | DPR | CPU 节流倍率 | 典型网络 |
|------|-------|-----|------------|---------|
| iPhone 14 | 390×844 | 3 | 4× | 4G |
| iPhone SE | 375×667 | 2 | 4× | 4G |
| Pixel 7 | 412×915 | 2.625 | 3× | 4G |
| Galaxy S23 | 360×780 | 3 | 3× | 4G |
| iPad Pro 11" | 834×1194 | 2 | 2× | WiFi |

```
[图示位置：移动设备仿真流程图]
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│  设备参数    │ →  │ Emulation Domain │ →  │  页面渲染    │
│  (DPR/分辨率) │    │  setDeviceMetric │    │  (移动端布局) │
└─────────────┘    └──────────────────┘    └─────────────┘
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│  CPU 节流    │ →  │ Emulation Domain │ →  │  JS 执行变慢 │
│  (4x 节流)   │    │  setCPUThrottling│    │  (长任务增多) │
└─────────────┘    └──────────────────┘    └─────────────┘
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│  触摸仿真    │ →  │  Input Domain    │ →  │  触摸事件触发 │
│  (5点触控)   │    │  dispatchTouch   │    │  (tap/swipe) │
└─────────────┘    └──────────────────┘    └─────────────┘
```

---

## 5.3 自动化 Lighthouse 审计：生成性能报告

### 5.3.1 Lighthouse 与 CDP 的关系

[Lighthouse](https://developer.chrome.com/docs/lighthouse/) 是 Google 出品的自动化审计工具，它底层正是通过 CDP 与浏览器通信。Lighthouse 8+ 版本提供了 [Lighthouse API](https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md#using-programmatically)，让我们可以在 Node.js 中编程式地运行审计。

> 📖 **官方文档**：[Lighthouse GitHub - Programmatic Usage](https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md#using-programmatically)

### 5.3.2 编程式运行 Lighthouse

```javascript
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

async function runLighthouse(url) {
  // 启动 Chrome（带 CDP 远程调试端口）
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
  });

  const options = {
    logLevel: 'info',
    output: 'json',
    port: chrome.port,
    onlyCategories: ['performance'],  // 只跑性能审计
  };

  const runnerResult = await lighthouse(url, options);

  // 提取核心指标
  const lhr = runnerResult.lhr;
  const metrics = {
    performanceScore: lhr.categories.performance.score * 100,
    FCP: lhr.audits['first-contentful-paint'].displayValue,
    LCP: lhr.audits['largest-contentful-paint'].displayValue,
    TBT: lhr.audits['total-blocking-time'].displayValue,
    CLS: lhr.audits['cumulative-layout-shift'].displayValue,
    SI: lhr.audits['speed-index'].displayValue,
  };

  console.log('🎯 性能得分:', metrics.performanceScore);
  console.log('📊 核心指标:', metrics);

  await chrome.kill();
  return { metrics, fullReport: lhr };
}
```

### 5.3.3 Core Web Vitals 解读

Lighthouse 审计的核心是 **Core Web Vitals**，Google 将它们作为搜索排名的参考因素：

| 指标 | 全称 | 含义 | 好的阈值 | 需优化 |
|------|------|------|---------|--------|
| LCP | Largest Contentful Paint | 最大内容渲染时间 | ≤ 2.5s | > 4.0s |
| FID | First Input Delay | 首次输入延迟 | ≤ 100ms | > 300ms |
| CLS | Cumulative Layout Shift | 累计布局偏移 | ≤ 0.1 | > 0.25 |
| INP | Interaction to Next Paint | 交互到下次绘制 | ≤ 200ms | > 500ms |

> 📖 **官方文档**：[Web Vitals - Essential metrics for a healthy site](https://web.dev/vitals/)

### 5.3.4 批量审计：对比优化前后的效果

真正的价值在于**对比**——优化前跑一次 Lighthouse，优化后再跑一次，量化改进效果：

```javascript
async function compareAudit(url, beforeOptimize, afterOptimize) {
  const before = await runLighthouse(url);
  console.log('📌 优化前:', before.metrics);

  // 执行优化操作（如注入代码、修改资源等）...
  await afterOptimize();

  const after = await runLighthouse(url);
  console.log('📌 优化后:', after.metrics);

  // 计算提升幅度
  const improvement = {};
  Object.keys(after.metrics).forEach(key => {
    if (typeof after.metrics[key] === 'number') {
      improvement[key] = +(after.metrics[key] - before.metrics[key]).toFixed(2);
    }
  });
  console.log('📈 提升幅度:', improvement);

  return { before, after, improvement };
}
```

### 5.3.5 生成 HTML 报告

Lighthouse 支持输出为 HTML 格式，可以直接在浏览器中查看交互式报告：

```javascript
const options = {
  output: 'html',  // 输出 HTML
  port: chrome.port,
};

const runnerResult = await lighthouse(url, options);
const reportHtml = runnerResult.report;

// 保存报告
const fs = require('fs');
fs.writeFileSync(`lighthouse-report-${Date.now()}.html`, reportHtml);
```

```
[图示位置：Lighthouse 报告截图示意]
- 顶部：性能得分圆环图（0-100 分，绿色=良好）
- 中部：Core Web Vitals 指标卡片（LCP、TBT、CLS 等）
- 底部：优化建议列表，每条标注"机会"或"诊断"
```

---

## 5.4 内存泄漏检测：堆快照与对象跟踪

### 5.4.1 为什么内存泄漏难以发现？

内存泄漏是前端最隐蔽的 Bug——它不会立刻崩溃，而是像慢性病一样，随着页面运行时间增长，内存缓缓攀升，最终导致页面卡顿甚至崩溃。

CDP 的 [`HeapProfiler`](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/) Domain 让我们能以编程方式抓取堆快照，对比差异，定位泄漏对象。

> 📖 **官方文档**：[HeapProfiler Domain - Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/)

### 5.4.2 抓取堆快照

```javascript
async function takeHeapSnapshot(client, label = '') {
  const { HeapProfiler, Runtime } = client;

  // 先执行 GC，减少噪声
  await Runtime.evaluate({ expression: 'if(gc) gc()' });

  return new Promise((resolve) => {
    const chunks = [];

    HeapProfiler.addHeapSnapshotChunk(({ chunk }) => {
      chunks.push(chunk);
    });

    HeapProfiler.reportHeapSnapshotProgress(({ done, total }) => {
      if (done === total) {
        const snapshot = JSON.parse(chunks.join(''));
        console.log(`📸 堆快照[${label}]: ${snapshot.nodes?.length || 0} 个节点`);
        resolve(snapshot);
      }
    });

    // 触发快照
    HeapProfiler.takeHeapSnapshot({ reportProgress: true });
  });
}
```

### 5.4.3 三快照法：定位内存泄漏

经典的内存泄漏定位方法是**三快照法（Three Snapshot Technique）**：

1. **快照 A**：操作前
2. **快照 B**：执行操作
3. **快照 C**：撤销操作（回到操作前的状态）

如果快照 C 的内存没有回到快照 A 的水平，说明有泄漏。而 B 与 C 之间**新增但未释放的对象**，就是嫌疑对象。

```javascript
async function detectMemoryLeak(client, operationFn) {
  const { Runtime } = client;

  // 快照 A：操作前
  const snapshotA = await takeHeapSnapshot(client, 'A');

  // 执行操作
  await operationFn();

  // 快照 B：操作后
  const snapshotB = await takeHeapSnapshot(client, 'B');

  // 等待 GC 机会
  await new Promise(r => setTimeout(r, 2000));
  await Runtime.evaluate({ expression: 'if(gc) gc()' });

  // 快照 C：GC 后
  const snapshotC = await takeHeapSnapshot(client, 'C');

  // 对比 A 与 C
  const leakedSize = snapshotC.meta?.node_fields?.length
    ? getUsedSize(snapshotC) - getUsedSize(snapshotA)
    : 0;

  if (leakedSize > 1024 * 100) { // 超过 100KB 视为可疑
    console.warn(`🚨 疑似内存泄漏: ${leakedSize} bytes 未释放`);
  } else {
    console.log('✅ 内存正常，未检测到泄漏');
  }

  return { snapshotA, snapshotB, snapshotC, leakedSize };
}
```

### 5.4.4 利用 Runtime 评估堆内存趋势

如果不需要完整的堆快照（数据量大、解析慢），可以用 `Runtime.evaluate` 配合 `performance.memory` 做轻量级监控：

```javascript
async function trackMemoryTrend(client, durationMs = 30000, intervalMs = 2000) {
  const { Runtime } = client;
  const data = [];
  const startTime = Date.now();

  while (Date.now() - startTime < durationMs) {
    const { result } = await Runtime.evaluate({
      expression: `JSON.stringify({
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      })`,
      returnByValue: true
    });

    const mem = JSON.parse(result.value);
    data.push({ ...mem, timestamp: Date.now() });
    await new Promise(r => setTimeout(r, intervalMs));
  }

  // 计算增长趋势
  const growth = data[data.length - 1].usedJSHeapSize - data[0].usedJSHeapSize;
  const growthMB = (growth / 1024 / 1024).toFixed(2);
  console.log(`📈 内存增长趋势: ${growthMB} MB / ${(durationMs / 1000).toFixed(0)}s`);

  return data;
}
```

```
[图示位置：内存趋势图]
- X轴：时间（0s → 30s）
- Y轴：内存使用量（MB）
- 红线：usedJSHeapSize（呈阶梯式上升，标注"疑似泄漏"）
- 蓝线：totalJSHeapSize（同步增长）
- 绿色虚线：预期稳定水位
```

### 5.4.5 常见内存泄漏模式速查

| 泄漏模式 | 典型代码 | 检测特征 |
|---------|---------|---------|
| 未清除的定时器 | `setInterval(() => {...}, 1000)` 组件卸载未清除 | Detached DOM 节点 + 闭包引用 |
| 闭包持有引用 | 事件处理函数引用了大对象 | GC 后 retained size 不降 |
| 全局变量累积 | `window.cache[key] = data` | 持续增长的全局对象 |
| DOM 引用未释放 | `const nodes = document.querySelectorAll(...)` 数组保留 | Detached HTMLDivElement |
| 未取消的事件监听 | `el.addEventListener('scroll', handler)` 未 removeEventListener | 事件监听器数量持续增长 |

---

## 5.5 长任务监控与优化建议生成

### 5.5.1 什么是长任务？

**长任务（Long Task）**是指执行时间超过 50ms 的任务。为什么是 50ms？根据 [Google RAIL 模型](https://web.dev/rail/)，用户能在 100ms 内感知到界面响应，而浏览器需要在 50ms 内完成工作，留出 50ms 给渲染流水线。

```
[图示位置：长任务与 RAIL 模型关系图]
┌──────────────────────────────────────────────┐
│              用户期望：100ms 内响应            │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │  JS 执行 ≤ 50ms │  │  渲染 ≤ 50ms    │   │
│  └─────────────────┘  └─────────────────┘   │
└──────────────────────────────────────────────┘
      ↓ 当 JS 执行 > 50ms 时 ↓
┌──────────────────────────────────────────────┐
│  ⚠️ 长任务！用户感知到卡顿                    │
│  ███████████████████████████░░░░  (120ms)     │
│  │←── 长任务 ──→│← 等待渲染 →│               │
└──────────────────────────────────────────────┘
```

### 5.5.2 通过 PerformanceObserver 监听长任务

在页面内注入 `PerformanceObserver`，是最直接的长任务监控方式：

```javascript
async function monitorLongTasks(client) {
  const { Runtime } = client;

  // 注入长任务监听代码
  await Runtime.evaluate({
    expression: `
      (function() {
        const longTasks = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push({
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime
            });
          }
        });
        observer.observe({ type: 'longtask', buffered: true });
        window.__longTasks = longTasks;
      })()
    `
  });
}
```

随后可以定期读取采集到的长任务数据：

```javascript
async function getLongTasks(client) {
  const { Runtime } = client;
  const { result } = await Runtime.evaluate({
    expression: 'JSON.stringify(window.__longTasks || [])',
    returnByValue: true
  });
  return JSON.parse(result.value);
}
```

### 5.5.3 通过 CDP Performance Domain 定位长任务

`Performance Domain` 的 `metrics` 事件中的 `TaskDuration` 和 `ScriptDuration` 可以帮助我们发现长任务的宏观趋势，但精确定位需要借助 [`Profiler`](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/) Domain：

```javascript
async function profileLongTasks(client, durationMs = 10000) {
  const { Profiler } = client;

  // 启用 Profiler
  await Profiler.enable();

  // 开始采样（每 100μs 采样一次）
  await Profiler.start({ callFrame: true });

  // 等待一段时间采集数据
  await new Promise(r => setTimeout(r, durationMs));

  // 停止并获取 Profile
  const { profile } = await Profiler.stop();

  // 分析耗时最长的调用
  const hotNodes = findHotNodes(profile.head, threshold = 50);
  console.log('🔥 耗时 >50ms 的调用:', hotNodes);

  return profile;
}

function findHotNodes(node, threshold, results = []) {
  if (node.hitCount > threshold) {
    results.push({
      functionName: node.callFrame.functionName || '(anonymous)',
      url: node.callFrame.url,
      lineNumber: node.callFrame.lineNumber,
      hitCount: node.hitCount
    });
  }
  if (node.children) {
    node.children.forEach(child => findHotNodes(child, threshold, results));
  }
  return results;
}
```

> 📖 **官方文档**：[Profiler Domain - Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/)

### 5.5.4 自动生成优化建议

将性能数据与规则引擎结合，可以自动生成优化建议：

```javascript
function generateOptimizationSuggestions(metrics, longTasks, heapData) {
  const suggestions = [];

  // 规则 1：布局抖动检测
  if (metrics.LayoutCount > 100 && metrics.LayoutDuration > 500) {
    suggestions.push({
      severity: 'high',
      category: 'rendering',
      title: '检测到布局抖动',
      detail: `布局次数 ${metrics.LayoutCount}，总耗时 ${metrics.LayoutDuration}ms`,
      fix: '批量读取 DOM 属性，避免读写交替。使用 requestAnimationFrame 批量写入。'
    });
  }

  // 规则 2：长任务告警
  const severeLongTasks = longTasks.filter(t => t.duration > 200);
  if (severeLongTasks.length > 0) {
    suggestions.push({
      severity: 'high',
      category: 'cpu',
      title: `${severeLongTasks.length} 个严重长任务 (>200ms)`,
      detail: `最长: ${Math.max(...severeLongTasks.map(t => t.duration)).toFixed(0)}ms`,
      fix: '将长任务拆分为小任务：使用 scheduler.yield()、requestIdleCallback 或 Web Worker。'
    });
  }

  // 规则 3：内存增长检测
  if (heapData && heapData.length > 5) {
    const growthRate = (heapData[heapData.length - 1].usedJSHeapSize - heapData[0].usedJSHeapSize)
      / heapData.length;
    if (growthRate > 50000) { // 每次采样增长 >50KB
      suggestions.push({
        severity: 'medium',
        category: 'memory',
        title: '内存持续增长，疑似泄漏',
        detail: `平均每次采样增长 ${(growthRate / 1024).toFixed(1)}KB`,
        fix: '检查未清除的定时器、事件监听器和闭包引用。使用三快照法定位泄漏对象。'
      });
    }
  }

  // 规则 4：JS 执行占比过高
  const scriptRatio = metrics.ScriptDuration / metrics.TaskDuration;
  if (scriptRatio > 0.7) {
    suggestions.push({
      severity: 'medium',
      category: 'cpu',
      title: 'JS 执行占比过高',
      detail: `JS 执行占比 ${(scriptRatio * 100).toFixed(1)}%`,
      fix: '考虑使用 Web Worker 将计算密集型任务移出主线程，或使用代码拆分延迟加载。'
    });
  }

  return suggestions.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}
```

### 5.5.5 输出可读的诊断报告

```javascript
function formatDiagnosticReport(suggestions) {
  const severityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };
  const categoryLabel = {
    rendering: '渲染', cpu: 'CPU', memory: '内存', network: '网络'
  };

  let report = '# 🔍 性能诊断报告\n\n';
  report += `生成时间：${new Date().toLocaleString()}\n\n`;

  if (suggestions.length === 0) {
    report += '✅ 未发现明显性能问题。\n';
    return report;
  }

  report += `共发现 ${suggestions.length} 个问题：\n\n`;

  suggestions.forEach((s, i) => {
    report += `## ${severityEmoji[s.severity]} 问题 ${i + 1}：${s.title}\n\n`;
    report += `- **严重程度**：${s.severity.toUpperCase()}\n`;
    report += `- **类别**：${categoryLabel[s.category]}\n`;
    report += `- **详情**：${s.detail}\n`;
    report += `- **修复建议**：${s.fix}\n\n`;
  });

  return report;
}
```

---

## 实战：构建端到端性能诊断流水线

将本章所学整合为一个完整的性能诊断脚本：

```javascript
const CDP = require('chrome-remote-interface');
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

async function performancePipeline(url) {
  console.log('🚀 启动性能诊断流水线...\n');

  // ── 阶段 1：Lighthouse 审计 ──
  console.log('📊 阶段 1/4：Lighthouse 审计');
  const lhr = await runLighthouse(url);
  console.log(`  性能得分: ${lhr.metrics.performanceScore}\n`);

  // ── 阶段 2：移动端仿真测试 ──
  console.log('📱 阶段 2/4：移动端仿真测试');
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const client = await CDP({ port: chrome.port });
  await emulateMobile(client);
  console.log('  已模拟 iPhone 14 环境\n');

  // ── 阶段 3：长任务与渲染指标采集 ──
  console.log('⏱️  阶段 3/4：性能指标采集（15s）');
  await monitorLongTasks(client);
  const { Performance } = client;
  await Performance.enable();
  await monitorPerformance(); // 15s 采集
  const { metrics } = await Performance.getMetrics();
  const longTasks = await getLongTasks(client);
  console.log(`  采集到 ${longTasks.length} 个长任务\n`);

  // ── 阶段 4：内存趋势分析 ──
  console.log('🧠 阶段 4/4：内存趋势分析');
  const memData = await trackMemoryTrend(client, 20000, 2000);
  console.log('  内存分析完成\n');

  // ── 生成报告 ──
  const metricsMap = {};
  metrics.forEach(m => { metricsMap[m.name] = m.value; });
  const suggestions = generateOptimizationSuggestions(
    metricsMap, longTasks, memData
  );
  const report = formatDiagnosticReport(suggestions);
  console.log(report);

  // 清理
  await client.close();
  await chrome.kill();

  return { lhr, metrics: metricsMap, longTasks, memData, suggestions, report };
}
```

---

## 本章小结

| 小节 | 核心能力 | CDP Domain | 典型场景 |
|------|---------|-----------|---------|
| 5.1 | CPU/内存/渲染指标采集 | Performance | 持续性能监控 |
| 5.2 | 移动设备仿真 | Emulation + Input | 移动端性能验证 |
| 5.3 | 自动化 Lighthouse 审计 | Lighthouse API | CI/CD 性能回归检测 |
| 5.4 | 内存泄漏检测 | HeapProfiler + Runtime | 长时间运行页面诊断 |
| 5.5 | 长任务监控与建议生成 | Profiler + Performance | 交互卡顿根因分析 |

```
[图示位置：第5章知识架构图]
                    ┌──────────────────┐
                    │  性能诊断流水线    │
                    └────────┬─────────┘
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ 指标采集      │  │ 自动化审计    │  │ 深度诊断      │
    └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
           │                 │                  │
    ┌──────┴───────┐  ┌─────┴────────┐  ┌─────┴────────┐
    │Performance   │  │Lighthouse    │  │HeapProfiler  │
    │Domain        │  │API           │  │Profiler      │
    │Emulation     │  │              │  │Runtime       │
    └──────────────┘  └──────────────┘  └──────────────┘
```

### 关键要点回顾

1. **Performance Domain** 提供浏览器内核级指标，持续采集比单次快照更有价值
2. **移动设备仿真**需要同时配置视口、DPR、CPU 节流和触摸事件，缺一不可
3. **Lighthouse 自动化**是 CI/CD 性能守门员的最佳选择，`onlyCategories` 可控制审计范围
4. **三快照法**是定位内存泄漏的经典方法，关键是"操作 → 撤销 → 对比"
5. **长任务**的 50ms 阈值来自 RAIL 模型，用 `PerformanceObserver` + CDP Profiler 双重定位
6. **规则引擎**可以将性能数据转化为可操作的优化建议，实现"监控 → 诊断 → 建议"的闭环

### 延伸阅读

- [Chrome DevTools Protocol 官方文档](https://chromedevtools.github.io/devtools-protocol/)
- [Web.dev Performance](https://web.dev/performance/)
- [Lighthouse GitHub 仓库](https://github.com/GoogleChrome/lighthouse)
- [RAIL 性能模型](https://web.dev/rail/)
- [Long Tasks API 规范](https://w3c.github.io/longtasks/)
