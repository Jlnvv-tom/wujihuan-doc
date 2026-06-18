# 第8章 反检测与反反爬虫策略

> 🕵️ "你检测到我不如我根本不需要被检测。" —— 在自动化与反自动化博弈中，理解双方武器是制胜关键。

## 8.1 识别WebDriver特征：常见的检测指纹分析

### 8.1.1 为什么需要反检测

随着浏览器自动化技术普及，越来越多的网站开始检测爬虫和自动化工具。检测的主要动机包括：

| 动机 | 说明 | 典型场景 |
|------|------|---------|
| 反爬虫 | 防止数据被批量采集 | 电商、搜索引擎 |
| 防作弊 | 阻止自动化操作 | 投票、点赞、秒杀 |
| 安全风控 | 识别恶意行为 | 登录、支付 |
| 合规约束 | 限制自动化访问 | 版权内容 |

> 📖 官方文档：[ChromeDriver WebDriver Detection](https://chromedevtools.github.io/devtools-protocol/#webdriver-active)

### 8.1.2 最著名的检测指标：navigator.webdriver

Chrome 在开启自动化模式时，`navigator.webdriver` 属性被设为 `true`：

```javascript
// 在自动化 Chrome 中运行
console.log(navigator.webdriver);
// → true
```

正常浏览器中该属性为 `false` 或 `undefined`。

**检测原理**：浏览器启动时如果传入 `--remote-debugging-port` 或使用 ChromeDriver，会自动设置此标志。

### 8.1.3 常见检测指纹清单

> 📖 官方文档：[Privacy Sandbox - Fingerprinting](https://developer.chrome.com/docs/privacy-sandbox/fingerprinting/)

```javascript
// 网站常用的自动化检测脚本
(function() {
  const checks = [];

  // 1. navigator.webdriver
  checks.push({ name: 'webdriver', value: navigator.webdriver });

  // 2. chrome.runtime (自动化工具通常注入)
  checks.push({ name: 'chrome.runtime', value: !!chrome?.runtime });

  // 3. 插件检测
  checks.push({ name: 'plugins', value: navigator.plugins.length });

  // 4. languages 检测
  checks.push({ name: 'languages', value: navigator.languages?.join(',') });

  // 5. User-Agent
  checks.push({ name: 'userAgent', value: navigator.userAgent });

  // 6. WebGL 渲染器 (虚拟化环境下异常)
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
  checks.push({
    name: 'webglRenderer',
    value: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'null',
  });

  return checks;
})();
```

### 8.1.4 检测层级模型

```
Layer 1: 基础属性检测
   └── navigator.webdriver, userAgent, plugins
Layer 2: 行为特征检测
   └── 鼠标轨迹、点击间隔、滚动模式
Layer 3: 渲染指纹检测
   └── WebGL, Canvas, AudioContext, Fonts
Layer 4: 环境一致性检测
   └── 时区 vs IP地区、语言 vs 系统语言
Layer 5: 机器学习检测
   └── 基于行为模式的异常判定
```

---

## 8.2 隐藏自动化痕迹：修改navigator属性与WebGL指纹

### 8.2.1 CDP 层面的属性覆盖

CDP 的 `Page.addScriptToEvaluateOnNewDocument` 是最核心的反检测手段——它在页面任何脚本执行前注入你的代码：

> 📖 官方文档：[Page.addScriptToEvaluateOnNewDocument](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-addScriptToEvaluateOnNewDocument)

```javascript
const { Page } = client;

await Page.addScriptToEvaluateOnNewDocument({
  source: `
    // 覆盖 webdriver 属性
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: false,
      enumerable: true,
    });

    // 覆盖 plugins 长度
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        return { length: 5, item: () => null, namedItem: () => null };
      },
      configurable: false,
    });

    // 覆盖 languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['zh-CN', 'zh', 'en'],
      configurable: false,
    });

    // 覆盖 chrome.runtime
    if (window.chrome) {
      delete window.chrome.runtime;
    }
  `,
});
```

### 8.2.2 使用 Emulation 覆盖 User-Agent

> 📖 官方文档：[Network.setUserAgentOverride](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-setUserAgentOverride)

```javascript
await Network.setUserAgentOverride({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  acceptLanguage: 'zh-CN,zh;q=0.9',
  platform: 'macOS',
});

// 对每个新页面也生效
await Page.addScriptToEvaluateOnNewDocument({
  source: `
    Object.defineProperty(navigator, 'platform', {
      get: () => 'MacIntel',
      configurable: false,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 8,
      configurable: false,
    });
  `,
});
```

### 8.2.3 WebGL 指纹覆盖

WebGL 指纹是高级反爬虫的利器。Canvas 指纹在虚拟化环境下与真实浏览器有明显差异：

```javascript
await Page.addScriptToEvaluateOnNewDocument({
  source: `
    // 覆盖 Canvas 指纹
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
      if (this.width === 1 && this.height === 1) {
        // 对极小画布返回常量值，模拟真实浏览器行为
        return 'data:image/png;base64,iVBORw0KGgoAAAANS...';
      }
      return originalToDataURL.call(this, type, quality);
    };

    // 覆盖 WebGL 参数
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      const fakeParams = {
        [0x9248]: 'Intel Inc.',           // UNMASKED_VENDOR_WEBGL
        [0x9249]: 'Intel Iris OpenGL Engine', // UNMASKED_RENDERER_WEBGL
        [0x1F03]: 0.25,                   // MAX_TEXTURE_MAX_ANISOTROPY
      };
      return parameter in fakeParams
        ? fakeParams[parameter]
        : getParameter.call(this, parameter);
    };

    // 覆盖 AudioContext 指纹
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function(channel) {
      const data = originalGetChannelData.call(this, channel);
      // 对特定位置注入微小噪声，模拟真实设备差异
      if (this.length > 100) {
        data[50] += 0.0001;
      }
      return data;
    };
  `,
});
```

### 8.2.4 验证修改是否生效

```javascript
// 验证脚本
await Page.addScriptToEvaluateOnNewDocument({
  source: `
    const checks = {
      webdriver: navigator.webdriver === undefined || navigator.webdriver === false,
      platform: navigator.platform === 'MacIntel',
      languages: JSON.stringify(navigator.languages),
      pluginsLen: navigator.plugins.length >= 3,
    };
    console.log('🛡️ 反检测验证:', checks);
  `,
});
```

---

## 8.3 无头浏览器的"人性化"配置

### 8.3.1 无头模式的选择

Chrome 在 v96+ 之后引入了"新型无头模式"（`--headless=new`），行为更接近有头模式：

```bash
# 旧版无头（检测难度较低）
chrome --headless --remote-debugging-port=9222

# 新版无头（推荐，更不易被检测）
chrome --headless=new --remote-debugging-port=9222

# 有头模式（最不易被检测）
chrome --remote-debugging-port=9222
```

### 8.3.2 浏览器启动参数优化

```python
# 使用 Python + selenium-wire 演示最佳参数配置
from seleniumwire import webdriver

options = webdriver.ChromeOptions()

# 使用新无头模式
options.add_argument('--headless=new')

# 基础参数
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')
options.add_argument('--disable-gpu')

# 禁用自动化标志
options.add_argument('--disable-blink-features=AutomationControlled')

# 窗口大小（固定大小比自适应更可疑）
options.add_argument('--window-size=1920,1080')

# 语言设置
options.add_argument('--lang=zh-CN')

# 禁用自动化扩展
options.add_experimental_option('excludeSwitches', ['enable-automation'])
options.add_experimental_option('useAutomationExtension', False)

driver = webdriver.Chrome(options=options)
```

### 8.3.3 伪装屏幕与输入设备

```javascript
// CDP 伪装屏幕信息
const { Emulation } = client;

await Emulation.setDeviceMetricsOverride({
  width: 1920,
  height: 1080,
  deviceScaleFactor: 2,
  mobile: false,
  screenOrientation: { type: 'landscapePrimary', angle: 0 },
});

// 伪装触屏信息
await Emulation.setTouchEmulationEnabled({
  enabled: false,  // 模拟非触屏设备
  configuration: 'none',
});
```

### 8.3.4 人类行为模拟

```javascript
// 模拟人类鼠标移动
async function humanMouseMove(page, startX, startY, endX, endY) {
  const steps = 10 + Math.floor(Math.random() * 5);  // 随机步数
  for (let i = 1; i <= steps; i++) {
    // 贝塞尔曲线插值
    const t = i / steps;
    const x = startX + (endX - startX) * t + Math.sin(t * Math.PI * 2) * 3;
    const y = startY + (endY - startY) * t + Math.cos(t * Math.PI * 4) * 2;

    await page.mouse.move(x, y);
    await page.waitForTimeout(10 + Math.random() * 20);
  }
}

// 模拟人类输入
async function humanType(page, selector, text) {
  await page.click(selector);
  await page.waitForTimeout(100 + Math.random() * 200);

  for (const char of text) {
    await page.keyboard.type(char, {
      delay: 50 + Math.random() * 100,
    });
  }
}

// 模拟人类滚动
async function humanScroll(page, distance) {
  const steps = Math.ceil(Math.abs(distance) / 50);
  const stepDistance = distance / steps;

  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => {
      window.scrollBy(0, d);
    }, stepDistance);
    await page.waitForTimeout(50 + Math.random() * 100);
  }
}
```

> 💡 **关键原则**：人类行为的核心特征是"不完美"——鼠标轨迹有抖动、输入速度有波动、滚动不是匀速的。

---

## 8.4 绕过Cloudflare等防护机制的实战技巧

### 8.4.1 Cloudflare 防护等级

| 防护等级 | 检测手段 | 绕过难度 |
|---------|---------|---------|
| Basic | IP 频率限制、User-Agent 检测 | ⭐ |
| Medium | JS 挑战（5秒盾）、Cookie 验证 | ⭐⭐ |
| Managed | 浏览器指纹、行为分析 | ⭐⭐⭐ |
| Enterprise | WAF、CAPTCHA、机器学习 | ⭐⭐⭐⭐ |

### 8.4.2 应对 JS Challenge

Cloudflare 的 JS Challenge（"检查浏览器"页面）通过 JavaScript 计算验证令牌：

```javascript
// 使用 Page.addScriptToEvaluateOnNewDocument 提前覆盖
await Page.addScriptToEvaluateOnNewDocument({
  source: `
    // Cloudflare 会检测 Date.now 精度
    const originalNow = Date.now;
    Date.now = function() {
      return originalNow.call(this);
    };

    // 确保 Performance API 正常
    const originalPerformance = performance.now.bind(performance);

    // 确保 Navigator.sendBeacon 正常
    if (!navigator.sendBeacon) {
      navigator.sendBeacon = async (url, data) => {
        try {
          await fetch(url, { method: 'POST', body: data, keepalive: true });
          return true;
        } catch { return false; }
      };
    }
  `,
});
```

### 8.4.3 CDP 级别的 IP 代理配置

> 📖 官方文档：[Network.emulateNetworkConditions](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions)

```javascript
// 方案1：通过启动参数设置代理
chrome --proxy-server=http://proxy.example.com:8080 \
       --proxy-bypass-list=<-loopback> \
       --remote-debugging-port=9222

// 方案2：运行时动态切换代理需要重启浏览器
// CDP 不提供运行时修改代理的 API
```

### 8.4.4 Cookie 保持与 IP 轮换策略

```javascript
// 结合代理池实现 IP + Cookie 双保持
const proxies = [
  { host: 'proxy1.example.com', port: 8080 },
  { host: 'proxy2.example.com', port: 8080 },
];

// 重启浏览器 + 换代理
async function switchProxy(proxy) {
  // 关闭当前浏览器连接
  await client.close();

  // 重启 Chrome 带新代理
  const chrome = await launchChrome({
    args: [
      `--proxy-server=http://${proxy.host}:${proxy.port}`,
      '--remote-debugging-port=9222',
    ],
  });

  // 建立新 CDP 连接
  client = await CDP({ port: 9222 });

  // 恢复 Cookie（如果有）
  if (savedCookies.length > 0) {
    const { Network } = client;
    await Network.enable();
    for (const cookie of savedCookies) {
      await Network.setCookie(cookie);
    }
  }
}
```

### 8.4.5 Headless Chrome 的隐形模式

```javascript
// 高级反检测配置
async function setupUndetectableChrome() {
  const { Page, Network, Emulation, Runtime } = client;

  // 1. 语言环境
  await Network.setUserAgentOverride({
    userAgent: langConfigs.zhCN.userAgent,
    acceptLanguage: langConfigs.zhCN.language,
  });

  // 2. 屏幕参数
  await Emulation.setDeviceMetricsOverride({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    mobile: false,
  });

  // 3. 注入反检测脚本
  await Page.addScriptToEvaluateOnNewDocument({
    source: ANTI_DETECTION_SCRIPT,
  });

  // 4. 禁用自动化隐藏的痕迹
  await Page.addScriptToEvaluateOnNewDocument({
    source: `
      // 覆盖 Permissions API 以防检测
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = async (desc) => {
        if (desc.name === 'notifications') {
          return { state: 'denied' };
        }
        return originalQuery(desc);
      };
    `,
  });

  console.log('🕵️ 隐身模式已启用');
}
```

---

## 8.5 持续集成中的稳定性与容错处理

### 8.5.1 抗反爬的三大策略

| 策略 | 描述 | 实现方式 |
|------|------|---------|
| 速率控制 | 降低请求频率，模拟人类行为 | 随机延迟、请求间隔 |
| 指纹轮换 | 每次 Session 使用不同指纹 | UA/屏幕/WebGL 随机化 |
| 降级策略 | 检测到封锁后自动切换方案 | 换 IP → 换指纹 → 换浏览器 |

### 8.5.2 智能速率控制

```javascript
class SmartRateLimiter {
  constructor() {
    this.requests = { count: 0, windowStart: Date.now() };
    this.delays = [2000, 3000, 4000, 5000];  // 逐步调整
    this.failures = 0;
  }

  async waitBeforeRequest() {
    const now = Date.now();
    const windowElapsed = now - this.requests.windowStart;

    // 每分钟最多 20 个请求
    if (this.requests.count >= 20 && windowElapsed < 60000) {
      const waitTime = 60000 - windowElapsed;
      console.log(`⏳ 速率限制，等待 ${waitTime}ms`);
      await sleep(waitTime);
      this.resetWindow();
    }

    // 自适应延迟
    const delay = this.delays[Math.min(this.failures, this.delays.length - 1)];
    const jitter = Math.random() * 1000;
    await sleep(delay + jitter);

    this.requests.count++;
  }

  recordFailure() {
    this.failures++;
    console.log(`⚠️ 失败次数: ${this.failures}`);
  }

  recordSuccess() {
    this.failures = Math.max(0, this.failures - 1);
  }

  resetWindow() {
    this.requests = { count: 0, windowStart: Date.now() };
  }
}

// 使用
const limiter = new SmartRateLimiter();

for (const url of urls) {
  await limiter.waitBeforeRequest();
  try {
    await Page.navigate({ url });
    limiter.recordSuccess();
    // 处理页面...
  } catch (e) {
    limiter.recordFailure();
    if (limiter.failures > 5) {
      console.log('🚨 受阻严重，更换策略');
      await switchProxy();
      limiter.resetWindow();
    }
  }
}
```

### 8.5.3 多浏览器实例容错

```javascript
class ResilientBrowserCluster {
  constructor(size = 5) {
    this.instances = [];
    this.current = 0;
    this.size = size;
  }

  async init() {
    for (let i = 0; i < this.size; i++) {
      this.instances.push(await this.launchBrowser(i));
    }
  }

  async launchBrowser(id) {
    const port = 9222 + id;
    const proxy = await getNextProxy();

    const chrome = await launchChrome({
      args: [
        `--remote-debugging-port=${port}`,
        `--proxy-server=http://${proxy.host}:${proxy.port}`,
        `--user-data-dir=/tmp/chrome-user-${id}`,
      ],
    });

    const client = await CDP({ port });
    await this.applyAntiDetection(client);

    return { chrome, client, proxy, port, id };
  }

  async applyAntiDetection(client) {
    const { Page, Network, Emulation } = client;

    // 每个实例用不同的指纹
    await Network.setUserAgentOverride({
      userAgent: RANDOM_UAS[Math.floor(Math.random() * RANDOM_UAS.length)],
    });

    await Page.addScriptToEvaluateOnNewDocument({
      source: generateAntiDetectionScript(),
    });
  }

  async getInstance() {
    // 轮换实例
    const instance = this.instances[this.current];
    this.current = (this.current + 1) % this.size;

    // 检查实例是否存活
    try {
      await instance.client.Runtime.evaluate({ expression: '1+1' });
      return instance;
    } catch {
      // 替换死掉的实例
      const newInstance = await this.launchBrowser(instance.id);
      this.instances[instance.id] = newInstance;
      return newInstance;
    }
  }
}
```

### 8.5.4 检测响应与降级

```javascript
async function detectAndDowngrade(page) {
  const indicators = await page.evaluate(() => {
    return {
      title: document.title,
      bodyText: document.body.innerText.substring(0, 500),
      hasChallenge: document.querySelector('#challenge-form') !== null,
      hasCaptcha: document.querySelector('.g-recaptcha') !== null,
      url: window.location.href,
    };
  });

  // 检测封锁
  if (
    indicators.title.includes('Just a moment') ||  // Cloudflare 5秒盾
    indicators.title.includes('Attention Required') || // Cloudflare 验证
    indicators.bodyText.includes('Your request has been blocked') ||
    indicators.hasChallenge ||
    indicators.hasCaptcha
  ) {
    console.log('🚫 检测到防护机制');
    return 'blocked';
  }

  // 检测降级
  if (
    indicators.bodyText.includes('captcha') ||
    indicators.url.includes('captcha')
  ) {
    console.log('⚠️ 触发降级验证');
    return 'downgraded';
  }

  return 'ok';
}

async function handleResponse(result) {
  switch (result) {
    case 'blocked':
      // 换IP + 换指纹
      await switchProxy();
      await refreshFingerprint();
      break;
    case 'downgraded':
      // 加延迟 + 重试
      await sleep(10000);
      break;
    case 'ok':
      // 正常处理
      break;
  }
}
```

### 8.5.5 CI/CD 管道中的最佳实践

```yaml
# GitHub Actions 示例
name: Web Automation Tests
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      chrome:
        image: browserless/chrome:latest
        ports:
          - 9222:3000

    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        env:
          CHROME_URL: ws://localhost:9222
          PROXY_URL: ${{ secrets.PROXY_URL }}
        run: |
          npm install
          node run_tests.js
```

```javascript
// CI 优化配置
const CI_CONFIG = {
  // 加大超时时间，避免网络波动导致失败
  pageLoadTimeout: 60000,
  navigationTimeout: 30000,

  // 重试策略
  maxRetries: 3,
  retryDelay: 5000,

  // 速率控制（CI 环境下网络波动更大）
  minDelay: 3000,
  maxDelay: 8000,

  // 降级策略
  onBlock: 'switch-proxy',    // 阻塞时换代理
  onError: 'retry-page',      // 错误时重试
  onTimeout: 'skip-skip',     // 超时时跳过+标记
};
```

---

## 本章小结

| 主题 | 核心方法 | 一句话总结 |
|------|---------|-----------|
| 检测分析 | `navigator.webdriver` / WebGL / Canvas | 知己知彼，百战不殆 |
| 痕迹隐藏 | `Page.addScriptToEvaluateOnNewDocument` | 在页面脚本执行前覆盖所有痕迹 |
| 行为模拟 | 鼠标轨迹 + 输入延迟 + 滚动模式 | 不完美才是人类的特征 |
| 防护绕过 | IP轮换 + Cookie保持 + 指纹多样性 | 多维度组合是王道 |
| CI/CD 容错 | 速率控制 + 多实例 + 降级策略 | 自动化也要稳如磐石 |

> 🎯 **下章预告**：第9章将探索 CDP 与浏览器的多协议交互，学习 WebSocket、Service Worker、IndexedDB 等高级技术。

> ⚠️ **道德提醒**：本章技术应用于合法用途，如自动化测试、性能分析、可访问性验证。请勿用于破坏网站服务条款的非法采集或攻击行为。

> 📖 完整 API 参考：[Page Domain](https://chromedevtools.github.io/devtools-protocol/tot/Page/) | [Network Domain](https://chromedevtools.github.io/devtools-protocol/tot/Network/) | [Emulation Domain](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)
