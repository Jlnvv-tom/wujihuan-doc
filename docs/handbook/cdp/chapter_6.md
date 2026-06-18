# 第6章 媒体与感知自动化

> "让浏览器以为自己在东京的咖啡馆里连着摄像头，而你其实坐在北京的工位上。" —— 一位自动化工程师的日常

在前面的章节中，我们掌握了 CDP 对 DOM、网络和性能的操控能力。但真实世界的应用远不止"点按钮、看请求"——地图应用依赖地理位置、视频会议需要摄像头麦克风、测试报告要截图录屏、文件下载需要自动归档。这些**感知与媒体**层面的自动化，恰恰是 CDP 最"魔法"的能力之一。

本章将带你深入 CDP 的设备仿真与媒体控制能力，从模拟地理位置、伪造传感器数据，到操控摄像头麦克风输入、截图录屏生成报告，再到下载管理与 PDF 自动化。学完本章，你将拥有让浏览器"活"在任何场景中的能力——无论是东京街头的地图测试，还是无人值守的视觉回归报告。

---

## 6.1 模拟地理位置与传感器数据

### 6.1.1 为什么需要模拟位置和传感器？

现代 Web 应用越来越依赖设备感知能力：

- **地图/出行类应用**（高德地图、Uber）：核心功能基于地理位置
- **LBS 营销**：不同区域展示不同内容，需要测试多地域覆盖
- **AR 应用**：依赖设备朝向（Orientation）和运动传感器
- **IoT 仪表盘**：读取环境传感器数据（温度、光照等）

在真实设备上逐个测试这些场景成本极高。CDP 提供了在浏览器层面直接"欺骗"这些感知数据的能力，让你无需离开工位就能模拟全球任何位置、任何设备姿态。

> 📖 **官方文档**：[Emulation Domain - Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)

### 6.1.2 模拟地理位置

CDP 通过 `Emulation.setGeolocationOverride` 方法覆盖浏览器的地理位置。这会影响 `navigator.geolocation` API 的返回值，且**无需用户授权弹窗**（因为 CDP 本身就拥有最高权限）。

```javascript
const CDP = require('chrome-remote-interface');

async function simulateLocation() {
  const client = await CDP();
  const { Emulation, Page } = client;

  await Page.enable();

  // 模拟东京塔位置（纬度、经度、精度）
  await Emulation.setGeolocationOverride({
    latitude: 35.6586,    // 纬度
    longitude: 139.7454,  // 经度
    accuracy: 10          // 精度（米）
  });

  // 在页面中验证
  await Page.navigate({ url: 'https://map.baidu.com' });
  await Page.loadEventFired();

  // 执行JS确认地理位置已生效
  const { result } = await client.send('Runtime.evaluate', {
    expression: `
      new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          }),
          err => resolve({ error: err.message })
        );
      })
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('📍 当前位置:', result.value);
  // 输出: { lat: 35.6586, lng: 139.7454 }
}
```

**关键参数说明：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `latitude` | number | 纬度，范围 -90 ~ 90 |
| `longitude` | number | 经度，范围 -180 ~ 180 |
| `accuracy` | number | 精度（米），默认 0 |

> ⚠️ **注意**：`setGeolocationOverride` 不会自动授予定位权限。如果页面请求地理位置权限，还需要配合 `Page.setGeolocationOverride` 或者在启动 Chrome 时添加 `--disable-geolocation` 标志。更推荐的方式是使用 `Browser.grantPermissions` 主动授权：

```javascript
// 授予当前上下文地理位置权限
await client.send('Browser.grantPermissions', {
  origin: 'https://map.baidu.com',
  permissions: ['geolocation']
});
```

### 6.1.3 模拟设备朝向与运动传感器

对于 AR、游戏类应用，仅有位置还不够，还需要模拟设备的**朝向（Orientation）**——即设备的 α（Z轴旋转）、β（X轴旋转）、γ（Y轴旋转）三个欧拉角。

CDP 没有直接提供 Orientation 相关方法，但我们可以通过 `Page.setDeviceOrientationOverride` 来实现：

```javascript
// 模拟手机竖屏倾斜45度
await client.send('Page.setDeviceOrientationOverride', {
  alpha: 0,    // Z轴旋转（0~360），类似指南针方向
  beta: 45,    // X轴旋转（-180~180），前后倾斜
  gamma: 0     // Y轴旋转（-90~90），左右倾斜
});
```

**三个角度的直观理解：**

| 角度 | 含义 | 直觉类比 | 典型值 |
|------|------|---------|--------|
| α (alpha) | Z轴旋转 | 指南针方向 | 手机竖屏时≈0/360 |
| β (beta) | X轴旋转 | 前后倾斜 | 平放≈0，竖持≈90 |
| γ (gamma) | Y轴旋转 | 左右倾斜 | 正常竖持≈0 |

> 📊 **图示位置：设备朝向三轴示意**
> - 展示一个手机模型，标注 X/Y/Z 三轴
> - alpha：绕Z轴旋转（像旋转门）
> - beta：绕X轴旋转（像翻书）
> - gamma：绕Y轴旋转（像拧水龙头）

### 6.1.4 模拟触摸屏与传感器

对于移动端测试，CDP 还提供了触摸屏模拟能力：

```javascript
// 启用触摸事件模拟
await Emulation.setTouchEmulationEnabled({
  enabled: true,
  maxTouchPoints: 5  // 模拟5点触控
});

// 设置模拟设备（影响媒体查询和UA）
await Emulation.setDeviceMetricsOverride({
  width: 375,
  height: 812,
  deviceScaleFactor: 3,      // Retina屏
  mobile: true,
  screenWidth: 375,
  screenHeight: 812
});
```

**一个完整的移动场景测试脚本：**

```javascript
async function testMobileMapApp() {
  const client = await CDP();
  const { Emulation, Page } = client;
  await Page.enable();

  // 1. 设置移动设备视口
  await Emulation.setDeviceMetricsOverride({
    width: 375, height: 812,
    deviceScaleFactor: 3, mobile: true
  });

  // 2. 启用触摸
  await Emulation.setTouchEmulationEnabled({ enabled: true });

  // 3. 设置地理位置（上海外滩）
  await Emulation.setGeolocationOverride({
    latitude: 31.2397, longitude: 121.4917, accuracy: 5
  });

  // 4. 授权地理位置权限
  await client.send('Browser.grantPermissions', {
    origin: 'https://example-map.com',
    permissions: ['geolocation']
  });

  // 5. 导航并测试
  await Page.navigate({ url: 'https://example-map.com' });
  console.log('✅ 移动端地图场景已就绪');
}
```

> 📖 **参考文档**：
> - [Emulation.setGeolocationOverride](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setGeolocationOverride)
> - [Emulation.setDeviceMetricsOverride](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setDeviceMetricsOverride)
> - [Emulation.setTouchEmulationEnabled](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setTouchEmulationEnabled)
> - [Browser.grantPermissions](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-grantPermissions)

---

## 6.2 媒体设备仿真：摄像头与麦克风输入

### 6.2.1 为什么需要媒体设备仿真？

视频会议、在线教育、人脸识别……越来越多的 Web 应用依赖摄像头和麦克风。但在自动化测试中，你不可能每次都架一个真摄像头、对着一群人说话。CDP 提供了**虚拟媒体设备**能力，让你用一张图片代替摄像头、用一段音频文件代替麦克风输入。

### 6.2.2 虚拟摄像头：用图片替代实时视频

CDP 的 `Page.setDeviceMetricsOverride` 并不直接处理摄像头，但我们可以通过 Chrome 启动参数 + CDP 配合实现摄像头仿真。核心思路是：

1. 启动 Chrome 时指定虚拟摄像头
2. 通过 CDP 授予媒体权限
3. 页面调用 `getUserMedia` 时自动使用虚拟设备

```bash
# 启动Chrome，使用虚拟摄像头（指定图片作为视频源）
chrome --use-fake-device-for-media-stream \
       --use-fake-ui-for-media-stream \
       --remote-debugging-port=9222
```

关键启动参数：

| 参数 | 作用 |
|------|------|
| `--use-fake-device-for-media-stream` | 用虚拟设备替代真实摄像头/麦克风 |
| `--use-fake-ui-for-media-stream` | 自动授权媒体权限（跳过弹窗） |
| `--use-file-for-fake-video-capture=/path/to/video.y4m` | 指定视频文件作为摄像头输入 |

在 CDP 连接后，我们还需要处理媒体权限：

```javascript
async function setupVirtualCamera() {
  const client = await CDP();
  const { Page } = client;
  await Page.enable();

  // 授予摄像头和麦克风权限
  await client.send('Browser.grantPermissions', {
    origin: 'https://meet.example.com',
    permissions: ['videoCapture', 'audioCapture']
  });

  // 导航到视频会议页面
  await Page.navigate({ url: 'https://meet.example.com' });
  await Page.loadEventFired();

  // 验证虚拟摄像头是否生效
  const { result } = await client.send('Runtime.evaluate', {
    expression: `
      navigator.mediaDevices.enumerateDevices().then(devices =>
        devices.filter(d => d.kind === 'videoinput').map(d => ({
          label: d.label,
          deviceId: d.deviceId
        }))
      )
    `,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('📹 可用摄像头:', result.value);
}
```

### 6.2.3 用真实视频文件模拟摄像头

默认的虚拟摄像头只会显示一个彩条测试画面。如果你需要更真实的场景（比如人脸识别测试），可以指定一个 `.y4m` 格式的视频文件：

```bash
# 先将mp4转换为y4m格式
ffmpeg -i test-face.mp4 -pix_fmt yuv420p test-face.y4m

# 用该文件作为虚拟摄像头输入
chrome --use-fake-device-for-media-stream \
       --use-file-for-fake-video-capture=./test-face.y4m \
       --remote-debugging-port=9222
```

> 💡 **Y4M 格式说明**：Y4M 是一种无压缩的视频格式，Chrome 原生支持将其作为虚拟摄像头输入。可以用 FFmpeg 轻松转换：
> ```bash
> ffmpeg -i input.mp4 -pix_fmt yuv420p output.y4m
> ```

### 6.2.4 虚拟麦克风：音频文件输入

与摄像头类似，可以通过启动参数指定虚拟麦克风输入：

```bash
# 使用WAV文件作为虚拟麦克风输入
chrome --use-fake-device-for-media-stream \
       --use-file-for-fake-audio-capture=./test-audio.wav \
       --remote-debugging-port=9222
```

### 6.2.5 动态控制媒体流：选择摄像头和麦克风

有时你需要在测试过程中动态切换摄像头或麦克风设备。CDP 没有直接的"切换设备"命令，但可以通过 `Runtime.evaluate` 配合 Web API 实现：

```javascript
async function switchCamera(client, deviceId) {
  // 停止当前视频流
  await client.send('Runtime.evaluate', {
    expression: `
      (async () => {
        // 获取当前所有视频流并停止
        const streams = document.querySelectorAll('video');
        streams.forEach(v => {
          if (v.srcObject) {
            v.srcObject.getTracks().forEach(t => t.stop());
          }
        });

        // 用指定设备重新获取流
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: '${deviceId}' } }
        });

        // 将新流绑定到video元素
        const video = document.querySelector('video');
        if (video) video.srcObject = stream;
      })()
    `,
    awaitPromise: true
  });
}
```

### 6.2.6 媒体仿真完整测试流程

将以上能力组合起来，一个完整的视频会议自动化测试流程如下：

```javascript
async function testVideoConference() {
  // 1. 启动Chrome（带虚拟媒体设备参数）
  const browser = await puppeteer.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-video-capture=./fixtures/test-face.y4m'
    ]
  });

  const page = await browser.newPage();

  // 2. 授予媒体权限
  const cdp = await page.target().createCDPSession();
  await cdp.send('Browser.grantPermissions', {
    origin: 'https://meet.example.com',
    permissions: ['videoCapture', 'audioCapture']
  });

  // 3. 导航到会议页面
  await page.goto('https://meet.example.com/room/123');

  // 4. 等待视频元素出现
  await page.waitForSelector('video', { timeout: 10000 });

  // 5. 截图验证
  await page.screenshot({ path: 'conference-test.png' });
  console.log('✅ 视频会议测试完成');
}
```

> 📖 **参考文档**：
> - [Browser.grantPermissions](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-grantPermissions)
> - Chrome 启动参数：[Chromium Command Line Switches](https://peter.sh/experiments/chromium-command-line-switches/)

---

## 6.3 截图与录屏：生成可视化报告

### 6.3.1 视觉证据：自动化测试的"黑匣子"

一个仅有文字日志的测试报告是苍白的。当你告诉同事"登录页面在移动端布局乱了"，远不如直接甩一张截图有说服力。截图和录屏是自动化的**视觉证据**——它们让失败的测试"说话"，让回归问题无所遁形。

CDP 提供了强大的截图与录屏能力，而且远比 Selenium 的 `TakesScreenshot` 更灵活。

### 6.3.2 基础截图：Page.captureScreenshot

`Page.captureScreenshot` 是 CDP 截图的核心方法，支持全页面、可视区域、指定元素等多种模式：

```javascript
async function takeScreenshot(client) {
  const { Page } = client;
  await Page.enable();

  // 基础截图（可视区域）
  const { data } = await Page.captureScreenshot({
    format: 'png',      // png / jpeg / webp
    quality: 80,         // 仅jpeg有效，0-100
  });

  // data 是 Base64 编码的图片数据
  const fs = require('fs');
  fs.writeFileSync('screenshot.png', Buffer.from(data, 'base64'));
  console.log('📸 截图已保存');
}
```

**截图参数详解：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `format` | string | 图片格式：`png`、`jpeg`、`webp` |
| `quality` | integer | JPEG/WebP 质量（0-100），仅 format 为 jpeg/webp 时有效 |
| `clip` | Viewport | 截取指定区域 `{x, y, width, height, scale}` |
| `fromSurface` | boolean | 是否从表面捕获（默认 true），设 false 可获取更底层内容 |
| `captureBeyondViewport` | boolean | 是否截取视口之外的内容（默认 false） |

### 6.3.3 全页面截图：捕获完整内容

很多页面内容超出视口高度，需要滚动截取。`captureBeyondViewport` 参数可以一步到位：

```javascript
// 全页面截图
const { data } = await Page.captureScreenshot({
  format: 'png',
  captureBeyondViewport: true,
  clip: {
    x: 0,
    y: 0,
    width: 1280,
    height: 0,  // height=0 表示自动获取完整页面高度
    scale: 1
  }
});
```

不过，`captureBeyondViewport` 有时在某些 Chrome 版本中表现不一致。更可靠的全页面截图方式是先获取页面尺寸，再分段截取：

```javascript
async function fullPageScreenshot(client) {
  const { Page, Runtime } = client;

  // 获取页面完整高度
  const { result } = await Runtime.evaluate({
    expression: `({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    })`,
    returnByValue: true
  });

  const { width, height } = result.value;

  // 设置视口为完整页面大小
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });

  // 等待渲染完成
  await new Promise(r => setTimeout(r, 500));

  // 截图
  const { data } = await Page.captureScreenshot({ format: 'png' });

  // 恢复原始视口...
  return data;
}
```

### 6.3.4 元素级截图：精确捕获目标区域

有时我们只需要截取页面中的某个特定元素（如某个图表、某个卡片），而不是整个页面。结合 `Runtime.evaluate` 获取元素位置 + `clip` 参数即可实现：

```javascript
async function elementScreenshot(client, selector) {
  const { Page, Runtime } = client;

  // 获取元素位置和尺寸
  const { result } = await Runtime.evaluate({
    expression: `
      const el = document.querySelector('${selector}');
      const rect = el.getBoundingClientRect();
      JSON.stringify({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      })
    `,
    returnByValue: true
  });

  const rect = JSON.parse(result.value);

  // 精确截取该区域
  const { data } = await Page.captureScreenshot({
    format: 'png',
    clip: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      scale: 1
    }
  });

  return data;
}

// 使用：只截取页面中的数据图表
const chartPng = await elementScreenshot(client, '#main-chart');
```

### 6.3.5 录屏：Page.startScreencast

截图只能捕获静态画面，而录屏能记录完整的操作过程。CDP 提供了 `Page.startScreencast` 方法，以帧为单位持续推送屏幕画面：

```javascript
async function startScreencast(client) {
  const { Page } = client;
  await Page.enable();

  const frames = [];

  // 监听每一帧
  Page.screencastFrame(async ({ data, metadata, sessionId }) => {
    // 保存帧数据
    frames.push({
      data,
      timestamp: metadata.timestamp,
      width: metadata.deviceWidth,
      height: metadata.deviceHeight
    });

    // 必须确认收到，才会推送下一帧
    await Page.screencastFrameAck({ sessionId });
  });

  // 开始录屏
  await Page.startScreencast({
    format: 'png',
    quality: 80,
    maxWidth: 1280,
    maxHeight: 720,
    everyNthFrame: 1  // 每帧都捕获（可设为2/3降低帧率）
  });

  // 运行5秒后停止
  await new Promise(r => setTimeout(r, 5000));
  await Page.stopScreencast();

  console.log(`🎬 录屏完成，共 ${frames.length} 帧`);
  return frames;
}
```

**录屏参数说明：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `format` | string | 帧格式：`png` 或 `jpeg` |
| `quality` | integer | JPEG 质量（0-100） |
| `maxWidth` | integer | 最大宽度（按比例缩放） |
| `maxHeight` | integer | 最大高度（按比例缩放） |
| `everyNthFrame` | integer | 每N帧捕获1帧，1=全帧，2=半帧... |

### 6.3.6 将录屏帧合成为 GIF/视频

捕获到的帧序列可以进一步合成为 GIF 或 MP4：

```javascript
const fs = require('fs');
const { execSync } = require('child_process');

async function framesToGif(frames, outputPath = 'recording.gif') {
  // 1. 保存所有帧为临时PNG文件
  const tmpDir = './tmp-frames';
  fs.mkdirSync(tmpDir, { recursive: true });

  frames.forEach((frame, i) => {
    const paddedIndex = String(i).padStart(5, '0');
    fs.writeFileSync(
      `${tmpDir}/frame-${paddedIndex}.png`,
      Buffer.from(frame.data, 'base64')
    );
  });

  // 2. 用FFmpeg合成为GIF
  execSync(
    `ffmpeg -y -framerate 10 -i ${tmpDir}/frame-%05d.png ` +
    `-vf "fps=10,scale=640:-1:flags=lanczos" ` +
    `-loop 0 ${outputPath}`
  );

  // 3. 清理临时文件
  fs.rmSync(tmpDir, { recursive: true });
  console.log(`🎬 GIF 已生成: ${outputPath}`);
}

// 合成为MP4视频（更小体积）
async function framesToMp4(frames, outputPath = 'recording.mp4') {
  const tmpDir = './tmp-frames';
  fs.mkdirSync(tmpDir, { recursive: true });

  frames.forEach((frame, i) => {
    const paddedIndex = String(i).padStart(5, '0');
    fs.writeFileSync(
      `${tmpDir}/frame-${paddedIndex}.png`,
      Buffer.from(frame.data, 'base64')
    );
  });

  execSync(
    `ffmpeg -y -framerate 10 -i ${tmpDir}/frame-%05d.png ` +
    `-c:v libx264 -pix_fmt yuv420p -crf 23 ${outputPath}`
  );

  fs.rmSync(tmpDir, { recursive: true });
  console.log(`🎬 MP4 已生成: ${outputPath}`);
}
```

### 6.3.7 构建可视化测试报告

将截图和录屏能力整合到测试框架中，就能生成图文并茂的测试报告：

```javascript
class VisualReporter {
  constructor(client) {
    this.client = client;
    this.steps = [];
  }

  async step(name, fn) {
    const { Page } = this.client;
    const startTime = Date.now();

    try {
      await fn();

      // 步骤成功 → 截图
      const { data } = await Page.captureScreenshot({ format: 'png' });
      this.steps.push({
        name,
        status: 'passed',
        screenshot: data,
        duration: Date.now() - startTime
      });
    } catch (err) {
      // 步骤失败 → 也截图（关键！）
      const { data } = await Page.captureScreenshot({ format: 'png' });
      this.steps.push({
        name,
        status: 'failed',
        error: err.message,
        screenshot: data,
        duration: Date.now() - startTime
      });
      throw err;
    }
  }

  generateHTML() {
    const stepsHtml = this.steps.map(step => `
      <div class="step ${step.status}">
        <h3>${step.status === 'passed' ? '✅' : '❌'} ${step.name}</h3>
        <p>耗时: ${step.duration}ms</p>
        ${step.error ? `<p class="error">错误: ${step.error}</p>` : ''}
        <img src="data:image/png;base64,${step.screenshot}" 
             alt="${step.name}" style="max-width:600px;border:1px solid #ddd">
      </div>
    `).join('');

    return `<!DOCTYPE html>
      <html><head><title>可视化测试报告</title>
      <style>
        .step { margin: 20px 0; padding: 15px; border-radius: 8px; }
        .passed { background: #f0fdf4; border: 1px solid #86efac; }
        .failed { background: #fef2f2; border: 1px solid #fca5a5; }
        .error { color: #dc2626; font-weight: bold; }
      </style></head><body>
      <h1>📊 可视化测试报告</h1>
      <p>生成时间: ${new Date().toLocaleString()}</p>
      ${stepsHtml}
      </body></html>`;
  }
}

// 使用示例
async function runVisualTest() {
  const client = await CDP();
  const reporter = new VisualReporter(client);

  await reporter.step('打开首页', async () => {
    await client.send('Page.navigate', { url: 'https://example.com' });
    await client.send('Page.enable');
    await new Promise(r => setTimeout(r, 2000));
  });

  await reporter.step('搜索关键词', async () => {
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('input').value = 'CDP'`
    });
    await client.send('Runtime.evaluate', {
      expression: `document.querySelector('form').submit()`
    });
    await new Promise(r => setTimeout(r, 2000));
  });

  // 生成报告
  const fs = require('fs');
  fs.writeFileSync('report.html', reporter.generateHTML());
  console.log('📊 报告已生成: report.html');
}
```

> 📊 **图示位置：可视化测试报告示例**
> - 展示一个HTML报告页面，包含多个步骤
> - 每个步骤有 ✅/❌ 状态标识、截图、耗时
> - 失败步骤用红色高亮，成功步骤用绿色

> 📖 **参考文档**：
> - [Page.captureScreenshot](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot)
> - [Page.startScreencast](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-startScreencast)
> - [Page.screencastFrame](https://chromedevtools.github.io/devtools-protocol/tot/Page/#event-screencastFrame)

---

## 6.4 下载管理：监听与控制文件下载路径

### 6.4.1 下载——自动化中的"隐形人"

在自动化脚本中，点击一个下载按钮后会发生什么？文件下载到哪了？下载完了吗？文件名是什么？这些问题在传统的 Selenium 方案中几乎是"盲区"——你只能傻等，然后去默认下载目录里碰运气。

CDP 的 `Browser.setDownloadBehavior` 和下载事件监听，让你对下载过程拥有完全的控制力。

### 6.4.2 设置下载行为

通过 `Browser.setDownloadBehavior`，你可以指定文件下载的目标目录，甚至决定是否允许下载：

```javascript
async function setupDownload(client, downloadDir) {
  const fs = require('fs');
  fs.mkdirSync(downloadDir, { recursive: true });

  // 设置下载路径
  await client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',           // allow / deny / allowAndName
    downloadPath: downloadDir,
    eventsEnabled: true          // 启用下载事件通知
  });
}
```

**`behavior` 三种模式对比：**

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `allow` | 允许下载，保存到指定目录 | 常规自动化 |
| `deny` | 拒绝所有下载 | 安全审计、防止意外下载 |
| `allowAndName` | 允许下载，文件名由 CDP 指定（而非服务器建议） | 需要精确控制文件名的场景 |

### 6.4.3 监听下载事件

设置 `eventsEnabled: true` 后，可以通过 `Browser.downloadWillBegin` 和 `Browser.downloadProgress` 事件实时追踪下载进度：

```javascript
async function monitorDownloads(client) {
  const { Browser } = client;

  // 监听下载开始
  Browser.downloadWillBegin(({ downloadId, url, filename }) => {
    console.log(`⬇️ 下载开始: ${filename}`);
    console.log(`   来源: ${url}`);
    console.log(`   ID: ${downloadId}`);
  });

  // 监听下载进度
  Browser.downloadProgress(({ downloadId, state, receivedBytes, totalBytes }) => {
    switch (state) {
      case 'inProgress':
        const percent = totalBytes > 0
          ? ((receivedBytes / totalBytes) * 100).toFixed(1)
          : '未知';
        console.log(`📥 下载中 [${downloadId}]: ${percent}%`);
        break;
      case 'completed':
        console.log(`✅ 下载完成 [${downloadId}]`);
        break;
      case 'canceled':
        console.log(`🚫 下载取消 [${downloadId}]`);
        break;
    }
  });
}
```

### 6.4.4 等待下载完成的实用封装

在自动化脚本中，我们经常需要"等待下载完成后再继续"。下面是一个实用的封装：

```javascript
async function waitForDownload(client, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('下载超时'));
    }, timeoutMs);

    client.on('Browser.downloadProgress', ({ state, downloadId }) => {
      if (state === 'completed') {
        clearTimeout(timer);
        resolve(downloadId);
      } else if (state === 'canceled') {
        clearTimeout(timer);
        reject(new Error('下载被取消'));
      }
    });
  });
}

// 使用示例
async function downloadAndVerify(client) {
  const downloadDir = '/tmp/cdp-downloads';
  await setupDownload(client, downloadDir);
  await monitorDownloads(client);

  // 触发下载
  await client.send('Runtime.evaluate', {
    expression: `document.querySelector('.download-btn').click()`
  });

  // 等待下载完成
  try {
    const downloadId = await waitForDownload(client, 15000);
    console.log(`✅ 下载完成: ${downloadId}`);
  } catch (err) {
    console.error(`❌ 下载失败: ${err.message}`);
  }
}
```

### 6.4.5 下载文件名控制

使用 `allowAndName` 模式，CDP 会在下载事件中提供一个由系统生成的文件名，格式为 `<guid>.<ext>`。这在需要精确关联文件时非常有用：

```javascript
// allowAndName 模式：CDP自动命名
await client.send('Browser.setDownloadBehavior', {
  behavior: 'allowAndName',
  downloadPath: '/tmp/cdp-downloads',
  eventsEnabled: true
});

// 下载开始事件中会包含建议文件名和实际文件名
client.on('Browser.downloadWillBegin', ({ downloadId, filename, suggestedFilename }) => {
  console.log(`建议文件名: ${suggestedFilename}`);  // 原始文件名
  console.log(`实际文件名: ${filename}`);            // CDP生成的名称
});
```

### 6.4.6 下载场景实战：批量下载报表

一个真实的业务场景——从后台系统批量下载多个报表文件：

```javascript
async function batchDownloadReports(client, reportIds) {
  const downloadDir = '/tmp/reports';
  await setupDownload(client, downloadDir);

  const results = [];

  for (const id of reportIds) {
    try {
      // 构造下载URL
      const downloadUrl = `https://admin.example.com/api/reports/${id}/export`;

      // 直接通过CDP下载（而非点击按钮）
      await client.send('Page.navigate', { url: downloadUrl });

      // 等待下载完成
      await waitForDownload(client, 30000);

      results.push({ id, status: 'success' });
      console.log(`✅ 报表 ${id} 下载成功`);

      // 间隔1秒，避免服务器限流
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      results.push({ id, status: 'failed', error: err.message });
      console.error(`❌ 报表 ${id} 下载失败: ${err.message}`);
    }
  }

  // 输出汇总
  const success = results.filter(r => r.status === 'success').length;
  console.log(`\n📊 下载完成: ${success}/${results.length} 成功`);
  return results;
}
```

> 📖 **参考文档**：
> - [Browser.setDownloadBehavior](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-setDownloadBehavior)
> - [Browser.downloadWillBegin](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#event-downloadWillBegin)
> - [Browser.downloadProgress](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#event-downloadProgress)

---

## 6.5 打印预览与PDF生成自动化

### 6.5.1 从"打印"到"PDF工厂"

浏览器内置的"打印为PDF"功能，在 CDP 中被暴露为 `Page.printToPDF` 方法。这不仅仅是一个"截图保存"——它生成的是**真正的 PDF 文档**，包含文字可选择/可搜索、矢量图形、分页控制等特性。

在自动化场景中，这个能力的价值不可估量：

- **自动化报告生成**：将 HTML 报告直接转为 PDF 归档
- **电子发票/证书**：批量生成标准化的 PDF 文档
- **网页存档**：将页面内容以 PDF 形式永久保存
- **合同签署流程**：在线预览→确认→生成 PDF→发送

### 6.5.2 基础 PDF 生成

```javascript
async function generatePDF(client) {
  const { Page } = client;
  await Page.enable();

  // 先导航到目标页面
  await Page.navigate({ url: 'https://example.com/report' });
  await Page.loadEventFired();
  await new Promise(r => setTimeout(r, 1000)); // 等待渲染完成

  // 生成PDF
  const { data } = await Page.printToPDF({
    paperWidth: 8.27,      // A4宽度（英寸）
    paperHeight: 11.69,    // A4高度（英寸）
    marginTop: 0.4,        // 页边距（英寸）
    marginBottom: 0.4,
    marginLeft: 0.4,
    marginRight: 0.4,
    printBackground: true,  // 打印背景色和图片
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',   // 页眉模板
    footerTemplate: `
      <div style="font-size:9px;text-align:center;width:100%;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>
    `
  });

  // 保存PDF
  const fs = require('fs');
  fs.writeFileSync('report.pdf', Buffer.from(data, 'base64'));
  console.log('📄 PDF 已生成: report.pdf');
}
```

### 6.5.3 PDF 参数详解

`Page.printToPDF` 提供了丰富的参数控制：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `paperWidth` | number | 8.5 | 纸张宽度（英寸） |
| `paperHeight` | number | 11 | 纸张高度（英寸） |
| `marginTop` | number | 0.4 | 上边距（英寸） |
| `marginBottom` | number | 0.4 | 下边距（英寸） |
| `marginLeft` | number | 0.4 | 左边距（英寸） |
| `marginRight` | number | 0.4 | 右边距（英寸） |
| `printBackground` | boolean | false | 是否打印背景色和背景图 |
| `landscape` | boolean | false | 是否横向打印 |
| `displayHeaderFooter` | boolean | false | 是否显示页眉页脚 |
| `headerTemplate` | string | - | 页眉 HTML 模板 |
| `footerTemplate` | string | - | 页脚 HTML 模板 |
| `scale` | number | 1 | 缩放比例（0.1~2） |
| `preferCSSPageSize` | boolean | false | 优先使用 CSS @page 规则 |

**常用纸张尺寸速查：**

| 纸张 | 宽度（英寸） | 高度（英寸） |
|------|-------------|-------------|
| A4 | 8.27 | 11.69 |
| A3 | 11.69 | 16.54 |
| Letter | 8.5 | 11 |
| Legal | 8.5 | 14 |

### 6.5.4 页眉页脚模板

页眉页脚模板是特殊的 HTML 片段，支持以下占位符：

- `<span class="pageNumber"></span>` —— 当前页码
- `<span class="totalPages"></span>` —— 总页数
- `<span class="date"></span>` —— 打印日期
- `<span class="title"></span>` —— 页面标题
- `<span class="url"></span>` —— 页面URL

```javascript
const headerTemplate = `
  <div style="font-size:10px;width:100%;padding:0 20px;">
    <span style="float:left;">机密报告</span>
    <span style="float:right;" class="date"></span>
  </div>
`;

const footerTemplate = `
  <div style="font-size:9px;width:100%;text-align:center;padding:0 20px;">
    第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页
  </div>
`;

await Page.printToPDF({
  displayHeaderFooter: true,
  headerTemplate,
  footerTemplate,
  paperWidth: 8.27,
  paperHeight: 11.69
});
```

> 💡 **注意**：页眉页脚模板中的内容不会自动显示，需要通过 CSS 设置可见性。模板的默认高度是 0，必须通过 `font-size` 和 `padding` 等样式撑开。

### 6.5.5 横向打印与分页控制

对于宽表格或仪表盘，横向打印更合适：

```javascript
// 横向A4
await Page.printToPDF({
  landscape: true,
  paperWidth: 11.69,   // 横向后宽高互换
  paperHeight: 8.27,
  printBackground: true
});
```

还可以通过 CSS 的 `page-break-before` 和 `page-break-after` 属性精确控制分页：

```javascript
// 先注入分页样式
await client.send('Runtime.evaluate', {
  expression: `
    const style = document.createElement('style');
    style.textContent = \`
      .page-break { page-break-after: always; }
      .no-break { page-break-inside: avoid; }
    \`;
    document.head.appendChild(style);
  `
});
```

### 6.5.6 批量生成 PDF 的实用方案

一个常见的业务需求：将一组 HTML 模板批量渲染为 PDF（如月度报表、证书、发票等）：

```javascript
const fs = require('fs');
const path = require('path');

async function batchGeneratePDF(client, templates, outputDir) {
  const { Page } = client;
  await Page.enable();
  fs.mkdirSync(outputDir, { recursive: true });

  for (const tmpl of templates) {
    // 将HTML内容写入临时页面
    await Page.navigate({
      url: `data:text/html,${encodeURIComponent(tmpl.html)}`
    });
    await Page.loadEventFired();
    await new Promise(r => setTimeout(r, 500));

    // 生成PDF
    const { data } = await Page.printToPDF({
      paperWidth: 8.27,
      paperHeight: 11.69,
      printBackground: true,
      marginTop: 0.5,
      marginBottom: 0.5,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#999;">${tmpl.title}</div>`,
      footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
    });

    const outputPath = path.join(outputDir, `${tmpl.filename}.pdf`);
    fs.writeFileSync(outputPath, Buffer.from(data, 'base64'));
    console.log(`✅ 已生成: ${outputPath}`);
  }
}

// 使用示例
const templates = [
  {
    title: '2026年6月月度报告',
    filename: 'report-2026-06',
    html: `<html><body><h1>月度报告</h1><p>这里是报告内容...</p></body></html>`
  },
  {
    title: '员工证书-张三',
    filename: 'cert-zhangsan',
    html: `<html><body><h1>优秀员工证书</h1><p>兹证明张三同志...</p></body></html>`
  }
];

await batchGeneratePDF(client, templates, './output/pdfs');
```

### 6.5.7 PDF 生成中的常见陷阱

| 陷阱 | 现象 | 解决方案 |
|------|------|---------|
| 中文字体缺失 | PDF 中中文显示为方框 | 确保系统安装了中文字体，或在 HTML 中通过 `@font-face` 加载 Web 字体 |
| 背景色不打印 | 彩色背景变成白色 | 设置 `printBackground: true` |
| 内容被截断 | 表格/图表被分页切断 | 使用 CSS `page-break-inside: avoid` |
| 图片未加载完成 | PDF 中图片为空白 | 导航后增加等待时间，或等待图片 `onload` 事件 |
| 页眉页脚不显示 | 模板内容为空 | 确保模板有 `font-size` 和可见内容（默认高度为 0） |
| 尺寸与预期不符 | A4纸比预期大/小 | 检查 `deviceScaleFactor` 和 `scale` 参数 |

> 📊 **图示位置：PDF 生成流程图**
> - 左侧：HTML 模板列表
> - 中间：CDP 导航→渲染→printToPDF
> - 右侧：PDF 文件输出
> - 下方：关键参数配置面板（纸张、边距、页眉页脚）

> 📖 **参考文档**：
> - [Page.printToPDF](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-printToPDF)

---

## 本章小结

本章我们深入探讨了 CDP 在媒体与感知层面的自动化能力，这些能力让浏览器不再是一个"被动显示"的工具，而是一个可以被精确操控的"感知终端"：

| 能力 | 核心 CDP 方法 | 典型应用 |
|------|-------------|---------|
| 地理位置模拟 | `Emulation.setGeolocationOverride` | 地图/LBS测试 |
| 传感器模拟 | `Page.setDeviceOrientationOverride` | AR/游戏测试 |
| 触摸模拟 | `Emulation.setTouchEmulationEnabled` | 移动端测试 |
| 摄像头仿真 | Chrome 启动参数 + `Browser.grantPermissions` | 视频会议/人脸识别 |
| 截图 | `Page.captureScreenshot` | 视觉回归/报告 |
| 录屏 | `Page.startScreencast` | 操作录制/演示 |
| 下载管理 | `Browser.setDownloadBehavior` | 文件下载自动化 |
| PDF 生成 | `Page.printToPDF` | 报表/证书批量生成 |

这些能力组合起来，就构成了一套完整的**浏览器感知与媒体自动化**方案。在下一章中，我们将进入更深层的领域——安全与隐私，探索如何通过 CDP 管理 Cookie、处理证书、绕过安全限制（合规前提下），以及构建安全可靠的自动化流程。

> 🎯 **关键收获**：
> 1. CDP 可以在协议层"欺骗"浏览器的所有感知数据，无需物理设备
> 2. 截图录屏不仅是调试工具，更是构建可视化报告的核心能力
> 3. 下载管理和 PDF 生成让 CDP 从"浏览器控制器"升级为"文档工厂"
> 4. 这些能力的组合，为 AI Agent 提供了完整的"看"和"听"的能力
