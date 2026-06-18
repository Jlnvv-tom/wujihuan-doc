# 第11章 实战项目二：高阶数据采集与RPA

> 🤖 从"能采集"到"采集好"——本章聚焦动态渲染、验证码对抗、行为模拟和 AI 数据流水线，构建企业级数据采集系统。

## 11.1 动态渲染页面的数据提取策略

### 11.1.1 三类动态页面对比

| 类型 | 特征 | 数据加载方式 | CDP 策略 |
|------|------|------------|---------|
| CSR（客户端渲染） | 初始 HTML 为空 | JS 异步加载数据 | 等待 DOM 变化 + 网络空闲 |
| SSR + 水合 | 初始 HTML 有内容 | JS 增强 | 直接提取 + 等待增强 |
| ISR（增量渲染） | 部分预渲染 | 按需加载 | 监听特定请求 |

### 11.1.2 智能等待策略

```javascript
// src/smart-wait.js
class SmartWaiter {
  constructor(client) {
    this.client = client;
  }

  // 等待网络空闲（无新请求超过 N 毫秒）
  async waitForNetworkIdle(timeoutMs = 5000, idleTimeMs = 500) {
    const { Network } = this.client;
    let lastActivity = Date.now();
    let activeRequests = 0;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(); // 超时也返回
      }, timeoutMs);

      const checkIdle = () => {
        if (activeRequests === 0 && Date.now() - lastActivity > idleTimeMs) {
          cleanup();
          resolve();
        }
      };

      Network.requestWillBeSent(() => {
        activeRequests++;
        lastActivity = Date.now();
      });

      Network.loadingFinished(() => {
        activeRequests--;
        lastActivity = Date.now();
        checkIdle();
      });

      Network.loadingFailed(() => {
        activeRequests--;
        lastActivity = Date.now();
        checkIdle();
      });

      const cleanup = () => {
        clearTimeout(timer);
      };
    });
  }

  // 等待 DOM 选择器出现
  async waitForSelector(selector, timeoutMs = 10000) {
    const { Runtime } = this.client;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const { result } = await Runtime.evaluate({
        expression: `!!document.querySelector('${selector}')`,
        returnByValue: true,
      });

      if (result.value) return true;
      await new Promise(r => setTimeout(r, 200));
    }

    throw new Error(`等待选择器超时: ${selector}`);
  }

  // 等待特定网络请求完成
  async waitForRequest(urlPattern, timeoutMs = 10000) {
    const { Network } = this.client;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`等待请求超时: ${urlPattern}`));
      }, timeoutMs);

      Network.responseReceived((params) => {
        if (params.response.url.includes(urlPattern)) {
          clearTimeout(timer);
          resolve(params);
        }
      });
    });
  }
}
```

### 11.1.3 拦截 API 响应提取数据

```javascript
// 最高效的数据提取方式：直接拦截 API 响应
async function interceptApiData(client, apiPattern) {
  const { Network } = client;
  const collectedData = [];

  await Network.enable();

  Network.responseReceived(async (params) => {
    const { response, requestId } = params;

    if (response.url.includes(apiPattern) && response.status === 200) {
      try {
        const { body } = await Network.getResponseBody({ requestId });
        const data = JSON.parse(body);
        collectedData.push(data);
        console.log(`📦 拦截 API 数据: ${response.url}`);
      } catch (e) {
        // 非 JSON 响应，跳过
      }
    }
  });

  return collectedData;
}
```

### 11.1.4 DOM 快照提取

> 📖 官方文档：[DOMSnapshot Domain](https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/)

```javascript
const { DOMSnapshot } = client;

async function extractPageData() {
  const { documents } = await DOMSnapshot.captureSnapshot({
    computedStyles: [],
    includeDOMRects: true,
    includePaintOrder: true,
  });

  // 遍历 DOM 树提取数据
  const data = [];
  for (const doc of documents) {
    const nodes = doc.nodes;
    for (let i = 0; i < nodes.nodeName.length; i++) {
      // 提取特定节点的数据
      if (nodes.nodeName[i] === 'DIV' && nodes.attributes?.[i]) {
        // 根据属性提取...
      }
    }
  }
  return data;
}
```

---

## 11.2 滑块验证码与点选验证码的自动化破解

### 11.2.1 验证码类型概览

| 类型 | 难度 | 常见服务商 | 破解思路 |
|------|------|-----------|---------|
| 滑块验证 | ⭐⭐ | 极验、网易易盾 | 轨迹模拟 + 缺口定位 |
| 点选验证 | ⭐⭐⭐ | 极验、腾讯防水墙 | 图像识别 + 坐标映射 |
| 旋转验证 | ⭐⭐ | 极验 | 角度计算 + 模拟旋转 |
| 短信验证 | ⭐ | — | 接码平台 |
| reCAPTCHA | ⭐⭐⭐⭐ | Google | AI 图像识别 |

> ⚠️ **声明**：本节仅用于安全研究和自动化测试目的，请勿用于非法用途。

### 11.2.2 滑块验证码破解流程

```
1. 定位滑块元素 → 获取滑块尺寸和位置
2. 识别缺口位置 → Canvas 像素对比 / 边缘检测
3. 生成人类轨迹 → 贝塞尔曲线 + 随机抖动
4. 模拟拖拽操作 → CDP Input.dispatchMouseEvent
```

**缺口定位（Canvas 像素对比法）**：

```javascript
async function findGapPosition(client) {
  const { Runtime } = client;

  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        // 找到背景图和滑块图
        const bgImg = document.querySelector('.captcha-bg img');
        const sliceImg = document.querySelector('.captcha-slice img');

        if (!bgImg) return null;

        // 创建 Canvas 进行像素分析
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = bgImg.src;

        return new Promise(resolve => {
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;

            // 滑块区域通常有明显的边缘
            // 简化：查找亮度突变区域
            let gapX = 0;
            let maxDiff = 0;

            for (let x = 0; x < canvas.width - 10; x += 2) {
              let diff = 0;
              for (let y = 0; y < canvas.height; y++) {
                const idx = (y * canvas.width + x) * 4;
                const idx2 = (y * canvas.width + x + 5) * 4;
                diff += Math.abs(pixels[idx] - pixels[idx2]);
              }
              if (diff > maxDiff) {
                maxDiff = diff;
                gapX = x;
              }
            }

            resolve({ gapX, width: canvas.width });
          };
        });
      })()
    `,
    returnByValue: true,
    awaitPromise: true,
  });

  return result.value;
}
```

**人类轨迹生成**：

```javascript
function generateHumanTrack(distance, duration) {
  const track = [];
  let current = 0;
  const steps = Math.ceil(duration / 16);

  // 三段式轨迹：加速 → 匀速 → 减速
  const accelEnd = Math.floor(steps * 0.3);
  const decelStart = Math.floor(steps * 0.7);

  for (let i = 0; i < steps; i++) {
    let speed;
    if (i < accelEnd) {
      speed = (i / accelEnd) * (distance / steps) * 2;
    } else if (i < decelStart) {
      speed = distance / steps;
    } else {
      speed = (steps - i) / (steps - decelStart) * (distance / steps) * 1.5;
    }

    current += speed;
    track.push({
      x: current + (Math.random() - 0.5) * 1.5,  // 随机抖动
      y: (Math.random() - 0.5) * 2,                // Y轴微动
      t: 16 + Math.random() * 8,                    // 时间间隔
    });
  }

  return track;
}
```

**模拟拖拽**：

```javascript
async function dragSlider(client, startX, startY, distance) {
  const { Input } = client;
  const track = generateHumanTrack(distance, 800);

  // 鼠标按下
  await Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: startX, y: startY,
    button: 'left', clickCount: 1,
  });

  // 沿轨迹移动
  let curX = startX, curY = startY;
  for (const point of track) {
    curX = startX + point.x;
    curY = startY + point.y;

    await Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: curX, y: curY,
    });

    await new Promise(r => setTimeout(r, point.t));
  }

  // 鼠标松开
  await Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: curX, y: curY,
    button: 'left', clickCount: 1,
  });
}
```

### 11.2.3 点选验证码破解思路

```javascript
async function solveClickCaptcha(client, targetText) {
  const { Runtime, Input } = client;

  // 1. 获取验证码图片
  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        const img = document.querySelector('.captcha-image');
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
      })()
    `,
    returnByValue: true,
  });

  // 2. 调用图像识别 API（如 OpenAI Vision）
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: 'gpt-4-vision-preview',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `请找到图片中的"${targetText}"，返回其中心坐标 (x, y)，图片尺寸为已知。JSON格式: {"x": number, "y": number}` },
        { type: 'image_url', image_url: { url: result.value } },
      ],
    }],
  });

  // 3. 解析坐标并点击
  const coords = JSON.parse(response.choices[0].message.content);
  await Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: coords.x, y: coords.y,
    button: 'left', clickCount: 1,
  });
  await Input.dispatchMouseEvent({
    type: 'mouseReleased',
    x: coords.x, y: coords.y,
    button: 'left', clickCount: 1,
  });
}
```

---

## 11.3 模拟真实用户行为路径进行数据挖掘

### 11.3.1 行为路径建模

```javascript
class UserBehaviorSimulator {
  constructor(client) {
    this.client = client;
    this.currentUrl = '';
    this.visitHistory = [];
  }

  // 模拟浏览行为：查看 → 思考 → 交互
  async browsePage(url) {
    const { Page, Input, Runtime } = this.client;

    // 1. 访问页面
    await Page.navigate({ url });
    await this.smartWait();

    // 2. 模拟阅读（随机滚动）
    await this.scrollRead();

    // 3. 可能点击感兴趣的内容
    await this.maybeClickLink();

    this.visitHistory.push({
      url,
      timestamp: Date.now(),
      duration: Math.floor(Math.random() * 30000) + 10000,
    });
  }

  async scrollRead() {
    const { Input } = this.client;
    const scrollTimes = 2 + Math.floor(Math.random() * 4);

    for (let i = 0; i < scrollTimes; i++) {
      const distance = 200 + Math.random() * 300;
      await Input.dispatchMouseEvent({
        type: 'mouseWheel',
        x: 500, y: 400,
        deltaX: 0,
        deltaY: distance,
      });
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }
  }

  async maybeClickLink() {
    const { Runtime, Input } = this.client;
    const shouldClick = Math.random() > 0.5;
    if (!shouldClick) return;

    // 找到页面中的链接
    const { result } = await Runtime.evaluate({
      expression: `
        (function() {
          const links = [...document.querySelectorAll('a[href]')];
          if (links.length === 0) return null;
          const link = links[Math.floor(Math.random() * links.length)];
          const rect = link.getBoundingClientRect();
          return {
            href: link.href,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        })()
      `,
      returnByValue: true,
    });

    if (result.value) {
      const { x, y } = result.value;
      // 先移动鼠标到目标位置
      await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y });
      await new Promise(r => setTimeout(r, 300));
      // 点击
      await Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  }
}
```

### 11.3.2 会话行为画像

```javascript
class SessionProfile {
  constructor() {
    this.profile = {
      avgPageTime: 15000 + Math.random() * 20000,
      scrollDepth: 0.3 + Math.random() * 0.5,
      clickRate: 0.3 + Math.random() * 0.4,
      mouseSpeed: 200 + Math.random() * 300,
      typingSpeed: 50 + Math.random() * 80,
      timeOnSite: 300000 + Math.random() * 600000,
    };
  }

  // 每次访问后微调画像，保持一致性
  evolve(action) {
    this.profile.avgPageTime += (Math.random() - 0.5) * 2000;
    this.profile.scrollDepth += (Math.random() - 0.5) * 0.05;
    // 确保在合理范围内
    this.profile.scrollDepth = Math.max(0.2, Math.min(0.9, this.profile.scrollDepth));
  }
}
```

---

## 11.4 结合LangChain构建数据处理流水线

### 11.4.1 架构设计

```
CDP 采集层 → 数据清洗 → LangChain 处理 → 结构化输出 → 存储
    │              │           │              │           │
    ▼              ▼           ▼              ▼           ▼
 原始HTML/JSON   去噪去重   LLM提取/分类   JSON/表格   DB/文件
```

### 11.4.2 数据采集 Agent

```python
# src/collector_agent.py
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

class CDPDataCollector:
    def __init__(self, cdp_client, llm_model="gpt-4"):
        self.client = cdp_client
        self.llm = ChatOpenAI(model=llm_model)

    async def collect(self, url, extraction_rule):
        """采集页面数据并用 LLM 提取"""
        # 1. CDP 加载页面
        await self.client.Page.navigate(url=url)
        await self.client.Page.loadEventFired()

        # 2. 获取页面内容
        content = await self._extract_content()

        # 3. LLM 结构化提取
        result = await self._llm_extract(content, extraction_rule)
        return result

    async def _extract_content(self):
        result = await self.client.Runtime.evaluate(
            expression="document.body.innerText",
            returnByValue=True,
        )
        return result['result']['value']

    async def _llm_extract(self, content, rule):
        prompt = ChatPromptTemplate.from_messages([
            ("system", """你是一个数据提取专家。从网页内容中按照规则提取结构化数据。
规则: {rule}
输出格式: JSON"""),
            ("user", "网页内容:\n{content}"),
        ])

        chain = prompt | self.llm
        response = await chain.ainvoke({
            "rule": rule,
            "content": content[:8000],
        })

        return response.content
```

### 11.4.3 流水线编排

```python
# src/pipeline.py
from langchain_core.runnables import RunnablePassthrough

class DataPipeline:
    def __init__(self, collector, storage):
        self.collector = collector
        self.storage = storage
        self.processors = []

    def add_processor(self, processor):
        self.processors.append(processor)
        return self

    async def run(self, urls, extraction_rule):
        results = []

        for url in urls:
            # 1. 采集
            raw_data = await self.collector.collect(url, extraction_rule)

            # 2. 逐级处理
            processed = raw_data
            for processor in self.processors:
                processed = await processor(processed)

            # 3. 存储
            await self.storage.save(url, processed)
            results.append({ "url": url, "data": processed })

        return results

# 使用示例
pipeline = DataPipeline(collector, storage)
pipeline.add_processor(clean_html)     # 清洗 HTML
pipeline.add_processor(deduplicate)    # 去重
pipeline.add_processor(classify)       # 分类

results = await pipeline.run(
    urls=["https://example.com/page1", "https://example.com/page2"],
    extraction_rule="提取商品名称、价格、评分",
)
```

---

## 11.5 大规模数据采集的调度与监控系统

### 11.5.1 任务调度器

```typescript
// src/scheduler.ts
interface Task {
  id: string;
  url: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'running' | 'done' | 'failed';
}

export class TaskScheduler {
  private queue: Task[] = [];
  private running: Map<string, Task> = new Map();
  private maxConcurrency: number;

  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency;
  }

  enqueue(task: Task) {
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority);  // 优先级排序
  }

  async processQueue(worker: (task: Task) => Promise<void>) {
    while (this.queue.length > 0 || this.running.size > 0) {
      // 填充并发槽位
      while (this.running.size < this.maxConcurrency && this.queue.length > 0) {
        const task = this.queue.shift()!;
        task.status = 'running';
        this.running.set(task.id, task);

        worker(task)
          .then(() => {
            task.status = 'done';
          })
          .catch(async (err) => {
            task.retryCount++;
            if (task.retryCount < task.maxRetries) {
              task.status = 'pending';
              this.enqueue(task);  // 重新入队
            } else {
              task.status = 'failed';
            }
          })
          .finally(() => {
            this.running.delete(task.id);
          });
      }

      await new Promise(r => setTimeout(r, 1000));
    }
  }

  getStats() {
    return {
      pending: this.queue.length,
      running: this.running.size,
      total: this.queue.length + this.running.size,
    };
  }
}
```

### 11.5.2 监控面板

```javascript
// src/monitor.js
class CDPMonitor {
  constructor() {
    this.metrics = {
      requests: 0,
      success: 0,
      failures: 0,
      avgResponseTime: 0,
      dataCollected: 0,
      startTime: Date.now(),
    };
  }

  recordSuccess(durationMs, dataSize) {
    this.metrics.requests++;
    this.metrics.success++;
    this.metrics.dataCollected += dataSize;

    // 更新平均响应时间
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (this.metrics.requests - 1) + durationMs)
      / this.metrics.requests;
  }

  recordFailure(durationMs) {
    this.metrics.requests++;
    this.metrics.failures++;
  }

  getDashboard() {
    const elapsed = (Date.now() - this.metrics.startTime) / 1000;
    return `
╔══════════════════════════════════════╗
║        CDP 数据采集监控面板          ║
╠══════════════════════════════════════╣
║ 运行时间: ${(elapsed / 60).toFixed(1)} 分钟               ║
║ 总请求数: ${this.metrics.requests}                          ║
║ ✅ 成功:   ${this.metrics.success}                          ║
║ ❌ 失败:   ${this.metrics.failures}                          ║
║ 成功率:   ${this.metrics.requests ? ((this.metrics.success / this.metrics.requests) * 100).toFixed(1) : 0}%              ║
║ 平均耗时: ${this.metrics.avgResponseTime.toFixed(0)}ms                        ║
║ 数据量:   ${(this.metrics.dataCollected / 1024 / 1024).toFixed(2)} MB                    ║
╚══════════════════════════════════════╝`;
  }
}

// 使用
const monitor = new CDPMonitor();
setInterval(() => {
  console.log(monitor.getDashboard());
}, 30000);
```

### 11.5.3 健康检查与自动恢复

```javascript
class HealthChecker {
  constructor(client, monitor) {
    this.client = client;
    this.monitor = monitor;
  }

  async check() {
    const checks = {
      browser: await this.checkBrowser(),
      memory: await this.checkMemory(),
      network: await this.checkNetwork(),
    };

    const unhealthy = Object.entries(checks)
      .filter(([_, v]) => !v.healthy)
      .map(([k]) => k);

    if (unhealthy.length > 0) {
      console.log(`⚠️ 健康检查异常: ${unhealthy.join(', ')}`);
      await this.recover(unhealthy);
    }

    return checks;
  }

  async checkBrowser() {
    try {
      const { Runtime } = this.client;
      await Runtime.evaluate({ expression: '1+1' });
      return { healthy: true };
    } catch {
      return { healthy: false, reason: '浏览器无响应' };
    }
  }

  async checkMemory() {
    const { Performance } = this.client;
    const { metrics } = await Performance.getMetrics();
    const jsHeapUsed = metrics.find(m => m.name === 'JSHeapUsedSize')?.value;

    if (jsHeapUsed && jsHeapUsed > 500 * 1024 * 1024) {  // 500MB
      return { healthy: false, reason: `内存过高: ${(jsHeapUsed / 1024 / 1024).toFixed(0)}MB` };
    }
    return { healthy: true };
  }

  async checkNetwork() {
    const failureRate = this.monitor.metrics.failures /
      Math.max(1, this.monitor.metrics.requests);

    if (failureRate > 0.3) {
      return { healthy: false, reason: `失败率过高: ${(failureRate * 100).toFixed(1)}%` };
    }
    return { healthy: true };
  }

  async recover(issues) {
    for (const issue of issues) {
      switch (issue) {
        case 'browser':
          console.log('🔄 重启浏览器...');
          // 重启逻辑...
          break;
        case 'memory':
          console.log('🧹 清理内存...');
          await this.client.Runtime.evaluate({
            expression: 'if(window.gc) gc();',
          });
          break;
        case 'network':
          console.log('⏳ 降低请求频率...');
          // 降速逻辑...
          break;
      }
    }
  }
}
```

---

## 本章小结

| 主题 | 核心技术 | 一句话总结 |
|------|---------|-----------|
| 动态页面提取 | 网络拦截 + 智能等待 | 拦截 API 响应比解析 DOM 高效 10 倍 |
| 验证码对抗 | 轨迹模拟 + AI 图像识别 | 人类行为 + AI 视觉的双重模拟 |
| 行为模拟 | 随机延迟 + 轨迹抖动 + 行为画像 | 不完美才是人类 |
| LangChain 流水线 | CDP 采集 + LLM 提取 | 让 AI 做数据清洗和结构化 |
| 大规模调度 | 任务队列 + 健康检查 + 自动恢复 | 稳定运行 7×24 小时 |

> 🎯 **下章预告**：第12章将作为全书收官，展望 CDP 的未来发展，包括 WebCodecs、WebNN、Privacy Sandbox 等新方向。

> ⚠️ **合规提醒**：数据采集需遵守 robots.txt、服务条款和当地法律法规。采集前请确认合规性。

> 📖 参考资源：[Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) | [LangChain Docs](https://python.langchain.com/docs/)
