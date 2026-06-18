# 第10章 实战项目一：AI驱动的自动化测试平台

> 🚀 理论学完，该动手了！本章将带你从零构建一个完整的 CDP 自动化测试平台，融合 AI 能力实现智能断言和报告生成。

## 10.1 需求分析：录制与回放工具设计

### 10.1.1 平台架构设计

```
┌─────────────────────────────────────────────────────┐
│               AI 自动化测试平台                      │
├─────────────────────────────────────────────────────┤
│  Web UI (React)                                    │
│  ├── 测试用例管理                                  │
│  ├── 录制控制台                                    │
│  └── 报告查看器                                    │
├─────────────────────────────────────────────────────┤
│  核心引擎 (Node.js)                                │
│  ├── CDP 控制器 (chrome-remote-interface)          │
│  ├── 操作录制器 (Input/Network 事件捕获)           │
│  ├── 回放引擎 (事件序列重放)                       │
│  └── AI 验证器 (LLM API 集成)                     │
├─────────────────────────────────────────────────────┤
│  存储层                                             │
│  ├── 测试用例 (JSON)                               │
│  ├── 执行记录 (SQLite)                              │
│  └── 截图/视频 (本地文件系统)                       │
├─────────────────────────────────────────────────────┤
│  浏览器层                                           │
│  └── Chrome Headless + CDP                         │
└─────────────────────────────────────────────────────┘
```

### 10.1.2 核心功能清单

| 功能模块 | 说明 | 技术实现 |
|---------|------|---------|
| 操作录制 | 捕获用户在页面上的所有操作 | `Input`、`Page` Domain 事件 |
| 智能回放 | 重放录制的操作序列 | `Input`、`Runtime` Domain |
| AI 断言 | 自动验证页面状态是否符合预期 | LLM API + 截图分析 |
| 测试报告 | 生成可视化测试报告 | 截图 + Performance + Markdown |
| 分布式执行 | 多浏览器实例并行执行 | Browser Context + 队列 |

### 10.1.3 项目初始化

```bash
mkdir ai-test-platform && cd ai-test-platform
npm init -y
npm install chrome-remote-interface puppeteer-core express ws sqlite3 openai
npm install -D typescript @types/node
```

```json
// package.json
{
  "name": "ai-test-platform",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

---

## 10.2 操作录制：捕获鼠标键盘事件流

### 10.2.1 录制器核心类

```typescript
// src/recorder.ts
import CDP from 'chrome-remote-interface';

export interface RecordedEvent {
  timestamp: number;
  type: 'mouse' | 'keyboard' | 'scroll' | 'navigation' | 'screenshot';
  action: string;
  data: any;
}

export class Recorder {
  private events: RecordedEvent[] = [];
  private client: any;
  private startTime: number = Date.now();

  constructor(client: any) {
    this.client = client;
  }

  async start() {
    const { Input, Page, Network, Runtime } = this.client;

    await Input.enable();
    await Page.enable();
    await Network.enable();

    // 1. 鼠标事件
    Input.mousePressed((params: any) => {
      this.recordEvent('mouse', 'press', {
        x: params.x, y: params.y,
        button: params.button,
        clickCount: params.clickCount,
      });
    });

    Input.mouseReleased((params: any) => {
      this.recordEvent('mouse', 'release', {
        x: params.x, y: params.y,
        button: params.button,
      });
    });

    Input.mouseMoved((params: any) => {
      // 采样记录，避免事件过多
      if (this.events.length === 0 ||
          Date.now() - this.events[this.events.length - 1].timestamp > 100) {
        this.recordEvent('mouse', 'move', {
          x: params.x, y: params.y,
        });
      }
    });

    // 2. 键盘事件
    Input.keyPressed((params: any) => {
      this.recordEvent('keyboard', 'press', {
        key: params.key,
        code: params.code,
        text: params.text,
        modifiers: params.modifiers,
      });
    });

    // 3. 导航事件
    Page.navigatedWithinDocument((params: any) => {
      this.recordEvent('navigation', 'hashchange', { url: params.url });
    });

    Page.loadEventFired(() => {
      this.recordEvent('navigation', 'load', {});
    });

    // 4. 网络请求（用于智能等待）
    Network.requestWillBeSent((params: any) => {
      this.recordEvent('network', 'request', {
        url: params.request.url,
        method: params.request.method,
      });
    });

    console.log('🔴 录制已开始...');
  }

  private recordEvent(type: any, action: string, data: any) {
    this.events.push({
      timestamp: Date.now() - this.startTime,
      type,
      action,
      data,
    });
  }

  getEvents(): RecordedEvent[] {
    return this.events;
  }

  saveToFile(path: string) {
    const fs = require('fs');
    fs.writeFileSync(path, JSON.stringify(this.events, null, 2));
    console.log(`💾 已保存 ${this.events.length} 个事件到 ${path}`);
  }
}
```

### 10.2.2 鼠标点击定位优化

```typescript
// 记录时同时捕获元素选择器
async function captureClickTarget(client: any, x: number, y: number) {
  const { Runtime } = client;

  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        const el = document.elementFromPoint(${x}, ${y});
        if (!el) return null;

        // 生成 CSS 选择器
        function getSelector(el) {
          if (el.id) return '#' + el.id;
          if (el === document.body) return 'body';

          let path = [];
          while (el && el !== document.body) {
            let name = el.localName || el.tagName.toLowerCase();
            if (el.id) {
              name = '#' + el.id;
              path.unshift(name);
              break;
            }
            // 计算同级位置
            const siblings = el.parentNode?.children || [];
            const index = Array.from(siblings).indexOf(el) + 1;
            path.unshift(name + ':nth-child(' + index + ')');
            el = el.parentNode;
          }
          return path.join(' > ');
        }

        return {
          selector: getSelector(el),
          text: el.textContent?.trim().substring(0, 50),
          tagName: el.tagName,
          className: el.className,
        };
      })()
    `,
    returnByValue: true,
  });

  return result.value;
}
```

### 10.2.3 完整录制示例

```typescript
// src/cli.ts
import { spawn } from 'child_process';
import CDP from 'chrome-remote-interface';
import { Recorder } from './recorder';

async function main() {
  // 启动 Chrome
  const chrome = spawn('chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--no-sandbox',
  ]);

  await new Promise(r => setTimeout(r, 2000)); // 等待 Chrome 启动

  const client = await CDP({ port: 9222 });
  const recorder = new Recorder(client);

  await recorder.start();

  // 监听退出信号
  process.on('SIGINT', () => {
    recorder.saveToFile('./test-case-1.json');
    chrome.kill();
    process.exit(0);
  });

  console.log('🎬 录制控制台已启动');
  console.log('   按 Ctrl+C 停止录制并保存');
}

main().catch(console.error);
```

---

## 10.3 智能断言：基于AI的预期结果验证

### 10.3.1 AI 断言器设计

```typescript
// src/ai-assertor.ts
import OpenAI from 'openai';

export class AIAssertor {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async assertScreenshot(
    screenshotBase64: string,
    expectation: string
  ): Promise<{ pass: boolean; reason: string }> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `请分析这张网页截图，判断是否满足以下预期：\n"${expectation}"\n\n请回答：通过/不通过，并给出理由。`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${screenshotBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const answer = response.choices[0].message.content || '';
    const pass = !answer.includes('不通过') && !answer.includes('失败');

    return {
      pass,
      reason: answer,
    };
  }

  async assertDOM(
    domSnapshot: string,
    expectation: string
  ): Promise<{ pass: boolean; reason: string }> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: '你是一个 Web 测试专家，负责判断 DOM 快照是否符合预期。',
        },
        {
          role: 'user',
          content: `
预期结果：${expectation}

DOM 快照（简化）：
${domSnapshot.substring(0, 4000)}

请判断预期是否满足，并给出理由。格式：通过/不通过 | 理由`,
        },
      ],
      temperature: 0,
    });

    const answer = response.choices[0].message.content || '';
    const pass = !answer.includes('不通过') && !answer.includes('失败');

    return { pass, reason: answer };
  }
}
```

### 10.3.2 集成到测试流程

```typescript
// src/test-runner.ts
export class TestRunner {
  private cdp: any;
  private ai: AIAssertor;

  constructor(cdpClient: any, aiAssertor: AIAssertor) {
    this.cdp = cdpClient;
    this.ai = aiAssertor;
  }

  async runTest(testCase: any) {
    const results = [];

    for (const step of testCase.steps) {
      console.log(`▶️  执行步骤: ${step.description}`);

      // 1. 执行操作
      await this.executeAction(step.action);

      // 2. 等待条件
      if (step.waitFor) {
        await this.waitFor(step.waitFor);
      }

      // 3. AI 断言
      if (step.assertion) {
        const screenshot = await this.captureScreenshot();
        const { pass, reason } = await this.ai.assertScreenshot(
          screenshot,
          step.assertion
        );

        results.push({
          step: step.description,
          pass,
          reason,
          screenshot: `./screenshots/step-${results.length}.png`,
        });

        if (!pass && step.critical) {
          console.log(`❌ 关键步骤失败: ${reason}`);
          break;
        }
      }
    }

    return results;
  }

  private async executeAction(action: any) {
    const { Input, Runtime } = this.cdp;

    switch (action.type) {
      case 'click':
        await Input.dispatchMouseEvent({
          type: 'mousePressed',
          x: action.x, y: action.y,
          button: 'left', clickCount: 1,
        });
        await new Promise(r => setTimeout(r, 50));
        await Input.dispatchMouseEvent({
          type: 'mouseReleased',
          x: action.x, y: action.y,
          button: 'left', clickCount: 1,
        });
        break;

      case 'type':
        for (const char of action.text) {
          await Input.dispatchKeyEvent({
            type: 'keyDown',
            text: char,
            key: char,
          });
          await new Promise(r => setTimeout(r, 30 + Math.random() * 50));
        }
        break;

      case 'evaluate':
        await Runtime.evaluate({ expression: action.script });
        break;
    }
  }

  private async captureScreenshot(): Promise<string> {
    const { Page } = this.cdp;
    const { data } = await Page.captureScreenshot({
      format: 'png',
      captureBeyondViewport: false,
    });
    return data;
  }
}
```

---

## 10.4 测试报告生成：整合性能与截图证据

### 10.4.1 报告数据结构

```typescript
interface TestReport {
  id: string;
  name: string;
  timestamp: string;
  duration: number;
  status: 'pass' | 'fail' | 'partial';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  steps: TestStepResult[];
  performance: PerformanceMetrics;
  screenshots: string[];
  video?: string;
}

interface PerformanceMetrics {
  fcp: number;   // First Contentful Paint
  lcp: number;   // Largest Contentful Paint
  cls: number;   // Cumulative Layout Shift
  ttfb: number;  // Time to First Byte
}
```

### 10.4.2 性能数据收集

```typescript
// src/performance-collector.ts
export class PerformanceCollector {
  async collect(client: any): Promise<PerformanceMetrics> {
    const { Performance } = client;

    await Performance.enable();

    return new Promise((resolve) => {
      const metrics: any = {};

      Performance.metrics((params: any) => {
        const { metrics: m } = params;

        // 提取关键指标
        const extract = (name: string) =>
          m.find((x: any) => x.name === name)?.value;

        metrics.fcp = extract('FirstContentfulPaint');
        metrics.lcp = extract('LargestContentfulPaint');
        metrics.cls = extract('CumulativeLayoutShift');
        metrics.ttfb = extract('TimeToFirstByte');

        if (Object.keys(metrics).length >= 4) {
          resolve(metrics);
        }
      });

      // 触发一次性能数据收集
      Performance.getMetrics();
    });
  }
}
```

### 10.4.3 HTML 报告生成

```typescript
// src/report-generator.ts
export class ReportGenerator {
  generateHTML(report: TestReport): string {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>测试报告 - ${report.name}</title>
  <style>
    body { font-family: system-ui; max-width: 960px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 600; }
    .pass { background: #10b981; }
    .fail { background: #ef4444; }
    .partial { background: #f59e0b; }
    .step { border-left: 4px solid #e5e7eb; padding: 16px; margin: 12px 0; }
    .step.pass { border-color: #10b981; }
    .step.fail { border-color: #ef4444; }
    .screenshot { max-width: 100%; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧪 ${report.name}</h1>
    <p>执行时间: ${report.timestamp} | 耗时: ${(report.duration / 1000).toFixed(1)}s</p>
    <span class="badge ${report.status}">${report.status.toUpperCase()}</span>
  </div>

  <h2>📊 摘要</h2>
  <table>
    <tr><th>总步骤</th><td>${report.summary.total}</td></tr>
    <tr><th>✅ 通过</th><td style="color:#10b981">${report.summary.passed}</td></tr>
    <tr><th>❌ 失败</th><td style="color:#ef4444">${report.summary.failed}</td></tr>
    <tr><th>⏭️ 跳过</th><td style="color:#6b7280">${report.summary.skipped}</td></tr>
  </table>

  <h2>📈 性能指标</h2>
  <table>
    <tr><th>FCP</th><td>${(report.performance.fcp / 1000).toFixed(2)}s</td></tr>
    <tr><th>LCP</th><td>${(report.performance.lcp / 1000).toFixed(2)}s</td></tr>
    <tr><th>CLS</th><td>${report.performance.cls.toFixed(3)}</td></tr>
    <tr><th>TTFB</th><td>${(report.performance.ttfb / 1000).toFixed(2)}s</td></tr>
  </table>

  <h2>📸 步骤详情</h2>
  ${report.steps.map((step, i) => `
    <div class="step ${step.pass ? 'pass' : 'fail'}">
      <h3>${i + 1}. ${step.step}</h3>
      <p>状态: <span class="badge ${step.pass ? 'pass' : 'fail'}">${step.pass ? '通过' : '失败'}</span></p>
      <p>原因: ${step.reason}</p>
      ${step.screenshot ? `<img class="screenshot" src="${step.screenshot}" alt="步骤截图">` : ''}
    </div>
  `).join('')}
</body>
</html>
    `.trim();
  }
}
```

---

## 10.5 分布式测试执行：利用CDP集群

### 10.5.1 浏览器集群管理

```typescript
// src/browser-cluster.ts
export class BrowserCluster {
  private instances: BrowserInstance[] = [];
  private taskQueue: TestTask[] = [];
  private activeTasks: Map<string, TestTask> = new Map();

  constructor(size: number) {
    this.initCluster(size);
  }

  private async initCluster(size: number) {
    for (let i = 0; i < size; i++) {
      const port = 9222 + i;
      const instance = await this.launchBrowser(port, i);
      this.instances.push(instance);
    }
    console.log(`🚀 浏览器集群已启动: ${size} 个实例`);
  }

  private async launchBrowser(port: number, id: number): Promise<BrowserInstance> {
    const { spawn } = require('child_process');

    const proc = spawn('chrome', [
      `--remote-debugging-port=${port}`,
      '--headless=new',
      '--no-sandbox',
      `--user-data-dir=/tmp/chrome-cluster-${id}`,
    ]);

    await new Promise(r => setTimeout(r, 1000));

    const CDP = require('chrome-remote-interface');
    const client = await CDP({ port });

    return {
      id,
      port,
      process: proc,
      client,
      busy: false,
    };
  }

  async submitTask(task: TestTask): Promise<TestResult> {
    // 找到空闲实例
    const instance = this.instances.find(i => !i.busy);

    if (!instance) {
      // 无空闲实例，加入队列
      return new Promise((resolve) => {
        this.taskQueue.push({ ...task, resolve });
      });
    }

    return this.executeTask(instance, task);
  }

  private async executeTask(instance: BrowserInstance, task: TestTask): Promise<TestResult> {
    instance.busy = true;
    this.activeTasks.set(task.id, task);

    try {
      const runner = new TestRunner(instance.client, task.aiAssertor);
      const result = await runner.runTest(task.testCase);

      instance.busy = false;
      this.activeTasks.delete(task.id);

      // 处理队列中的下一个任务
      this.processQueue();

      return result;
    } catch (error) {
      instance.busy = false;
      throw error;
    }
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    const instance = this.instances.find(i => !i.busy);
    if (!instance) return;

    const task = this.taskQueue.shift()!;
    this.executeTask(instance, task).then(task.resolve);
  }

  async shutdown() {
    for (const instance of this.instances) {
      instance.process.kill();
    }
    console.log('🔌 浏览器集群已关闭');
  }
}
```

### 10.5.2 测试任务调度

```typescript
// 使用集群执行测试套件
async function runTestSuite() {
  const cluster = new BrowserCluster(5);  // 5个浏览器实例

  const testCases = [
    { id: 'login-test', name: '登录测试', path: './test-cases/login.json' },
    { id: 'search-test', name: '搜索测试', path: './test-cases/search.json' },
    { id: 'checkout-test', name: '结账测试', path: './test-cases/checkout.json' },
    // ... 更多测试用例
  ];

  const results = await Promise.all(
    testCases.map(tc =>
      cluster.submitTask({
        id: tc.id,
        testCase: require(tc.path),
        aiAssertor: new AIAssertor(process.env.OPENAI_API_KEY!),
      })
    )
  );

  // 生成汇总报告
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
  };

  console.log(`📊 测试套件完成: ${summary.passed}/${summary.total} 通过`);

  await cluster.shutdown();
  return results;
}
```

### 10.5.3 Docker 化部署

```dockerfile
# Dockerfile
FROM node:20-alpine

# 安装 Chrome
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml - 多实例集群
version: '3.8'
services:
  test-platform:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - CHROME_INSTANCES=5
    deploy:
      replicas: 3
```

---

## 本章小结

| 模块 | 核心技术 | 一句话总结 |
|------|---------|-----------|
| 操作录制 | `Input`、`Page` Domain 事件监听 | 把用户操作变成可重放的数据 |
| AI 断言 | GPT-4 Vision + 截图分析 | 让 AI 成为你的测试工程师 |
| 测试报告 | Performance Metrics + HTML 生成 | 数据可视化，问题一目了然 |
| 分布式执行 | Browser Cluster + 任务队列 | 5个浏览器并发，测试速度翻倍 |

> 🎯 **下章预告**：第11章将探索 CDP 在 CI/CD 管道中的深度集成，实现真正的自动化测试流水线。

> 📖 完整项目代码：[GitHub - ai-test-platform](https://github.com/example/ai-test-platform)（示例链接）

> 💡 **实战建议**：先实现基础录制回放，再逐步加入 AI 断言和分布式执行。不要试图一步到位！
