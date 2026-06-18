# 第7章 AI赋能：智能内容识别与交互

> "让机器'看见'页面，不仅是像素，更是语义。"

在前六章中，我们已经掌握了 CDP 的通信机制、DOM 操控、网络层控制和性能监控。然而，真实世界的前端自动化充满了"意外"——Canvas 渲染的内容无法直接读取、验证码像一道道天堑横亘在自动化路上、页面元素加载时序不确定、传统选择器在动态页面中脆弱不堪。

本章将引入 **AI 能力**，用计算机视觉、自然语言处理和大语言模型来武装我们的 CDP 自动化脚本。让 AI 成为我们的"眼睛"和"大脑"，实现从"机械操作"到"智能理解"的跨越。

---

## 7.1 结合OCR技术：自动化识别Canvas与图片验证码

### 7.1.1 为什么Canvas是自动化的盲区？

现代 Web 应用中，Canvas 被广泛用于绘制图表、游戏、签名板、图片编辑器等场景。然而，Canvas 内部的像素数据对 CDP 的 DOM 层是完全"不透明"的——你可以通过 `DOM.getDocument()` 获取 Canvas 元素的属性（宽、高、样式），却无法得知它具体"画"了什么内容。

来看一个典型困境：

```javascript
// 通过 CDP 获取 Canvas 元素
const { nodes } = await DOM.querySelectorAll({
  selector: 'canvas'
});

// Canvas 的 attributes 列表：id、width、height、class、style
// ❌ 无法获取：Canvas 内部绘制的图形内容
// ❌ 无法获取：签名、图片验证码中的文字
```

这就是 OCR（光学字符识别）技术登场的地方。

### 7.1.2 截取Canvas内容： CDP 的截图能力

在做 OCR 之前，我们首先要把 Canvas 的内容"拍下来"。CDP 提供了 `Page.captureScreenshot` 方法，可以截取整个页面的可见区域，再结合元素坐标裁剪出目标区域：

```javascript
async function captureElement(client, nodeId) {
  const { DOM, Page, Runtime } = client;

  // 获取元素的边界框（视口坐标）
  const { model } = await DOM.getBoxModel({ nodeId });
  const { contentBoxSize, borderBox } = model;

  // 获取视口缩放比例
  const viewport = await Page.getLayoutMetrics();
  const scale = viewport.visualViewport.scale;

  const box = contentBoxSize[0]; // CSS 像素下的内容区域
  const x = Math.floor(borderBox[0].x * scale);
  const y = Math.floor(borderBox[0].y * scale);
  const w = Math.floor(box.width * scale);
  const h = Math.floor(box.height * scale);

  // 截取全页截图
  const { data } = await Page.captureScreenshot({ format: 'png' });
  // data 是 base64 编码的 PNG

  // 返回坐标信息，由调用方裁剪
  return { fullImage: data, x, y, width: w, height: h };
}
```

### 7.1.3 Tesseract OCR：浏览器外的文字识别引擎

Tesseract 是 Google 维护的开源 OCR 引擎，由 C++ 编写，支持 100+ 种语言。在 Node.js 环境中，我们使用 `tesseract.js` 作为 JavaScript 封装，实现纯 Node 端的文字识别：

```bash
npm install tesseract.js sharp
```

```javascript
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

// 模拟：裁剪 Canvas 区域后的 base64 图像数据
async function recognizeTextFromImage(imageBuffer) {
  // 预处理：提高对比度，转为灰度，提升识别率
  const processed = await sharp(imageBuffer)
    .greyscale()
    .normalize()
    .threshold(128)
    .toBuffer();

  const result = await Tesseract.recognize(processed, 'eng+chi_sim', {
    logger: m => console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`)
  });

  return {
    text: result.data.text.trim(),
    confidence: result.data.confidence,
    words: result.data.words  // 包含每个单词的坐标和置信度
  };
}

// 识别 Canvas 中的验证码
async function recognizeCaptcha(client, canvasNodeId) {
  const { fullImage, x, y, width, height } = await captureElement(client, canvasNodeId);

  const canvasImage = await sharp(Buffer.from(fullImage, 'base64'))
    .extract({ left: x, top: y, width, height })
    .toBuffer();

  const { text } = await recognizeTextFromImage(canvasImage);
  // 清理：去除空格和特殊字符
  const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned;
}
```

> 📖 **参考文档**：
> - [Tesseract OCR 官方仓库](https://github.com/tesseract-ocr/tesseract)
> - [tesseract.js 文档](https://github.com/naptha/tesseract.js)
> - [sharp 图像处理库](https://sharp.pixelplumbing.com/)

### 7.1.4 实战：自动化识别滑动验证码

滑动验证码（也叫"拖动拼图"）是自动化领域的老大难。它通常由两部分组成：抠图背景图和一张带缺口的滑块图。AI 识别的大致流程是：

1. 截取验证码区域的两张图片
2. 通过图像差异算法找出缺口位置
3. 计算滑动距离
4. 通过 CDP 模拟拖动轨迹

```javascript
async function solveSlideCaptcha(client, captchaContainerSelector) {
  const { DOM, Page } = client;

  // 获取验证码容器的节点
  const { nodeId } = await DOM.querySelector({
    selector: captchaContainerSelector
  });

  // 截图并裁剪
  const { fullImage, x, y, width, height } = await captureElement(client, nodeId);
  const captchaImg = await sharp(Buffer.from(fullImage, 'base64'))
    .extract({ left: x, top: y, width, height })
    .toBuffer();

  // 获取背景图和小图（通常验证码内有子元素区分）
  const slider = await sharp(captchaImg)
    .extract({ left: 0, top: height * 0.3, width: width * 0.15, height: height * 0.4 })
    .toBuffer();

  // 使用 template matching 思路：逐列扫描找缺口
  // 这里用简化的"边缘检测"策略
  const缺口位置 = await findGapPosition(captchaImg, slider);

  // 计算滑动轨迹（带加速和减速）
  const trail = generateSlideTrail(缺口位置);

  // 通过 CDP Input 模拟拖动
  await Input.dispatchMouseEvent({
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    clickCount: 1
  });

  for (const { x: tx, y: ty, delay } of trail) {
    await sleep(delay);
    await Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: tx,
      y: ty
    });
  }

  await Input.dispatchMouseEvent({ type: 'mouseReleased', x: trail.at(-1).x, y: trail.at(-1).y });
}

// 生成人类化的滑动轨迹
function generateSlideTrail(distance) {
  const trail = [];
  const steps = Math.min(30, Math.ceil(distance / 5));
  let current = 0;
  const halfSteps = Math.floor(steps * 0.7);

  // 前70%：缓慢加速
  for (let i = 0; i < halfSteps; i++) {
    current += distance / steps * (1 + Math.random() * 0.3);
    trail.push({ x: current, y: 0, delay: 15 + Math.random() * 10 });
  }
  // 后30%：快速到位 + 微调
  for (let i = halfSteps; i < steps; i++) {
    current += distance / steps * (0.5 + Math.random() * 0.2);
    trail.push({ x: current, y: (Math.random() - 0.5) * 3, delay: 8 + Math.random() * 15 });
  }

  return trail;
}
```

> 💡 **提示**：滑动验证码的核心难点在于"缺口识别"。进阶方案可以使用 OpenCV 的 `matchTemplate` 配合 `minMaxLoc` 找最佳匹配位置，比逐列扫描准确率高得多。在 Node.js 中可以使用 `opencv4nodejs` 或 `nativeomorphic/opencv` 封装。

---

## 7.2 视觉Diff测试：利用AI算法检测UI异常

### 7.2.1 传统断言的局限性

传统的前端自动化测试依赖 DOM 选择器和文本比对：

```javascript
// 传统方式：脆弱且语义弱
const title = await page.$eval('h1.title', el => el.textContent);
assert.strictEqual(title, '预期标题'); // ✅ 只验证文本

// ❌ 无法检测：
// - 文字颜色错误
// - 布局错位
// - 图片加载失败（显示裂图）
// - CSS 样式丢失
```

视觉 Diff 则将"页面应该长什么样"的判断权交给 AI，让算法自动发现像素级别的差异。

### 7.2.2 截图对比：朴素的像素 Diff

最直接的视觉 Diff 方案是截取两张图，逐像素比对差异：

```javascript
const sharp = require('sharp');

async function pixelDiff(img1Buffer, img2Buffer) {
  const img1 = await sharp(img1Buffer).raw().toBuffer();
  const img2 = await sharp(img2Buffer).raw().toBuffer();

  let diffPixels = 0;
  const totalPixels = img1.length; // RGB 三通道展平后的长度

  for (let i = 0; i < totalPixels; i++) {
    if (Math.abs(img1[i] - img2[i]) > 10) {
      diffPixels++;
    }
  }

  const diffRatio = diffPixels / (totalPixels / 3); // 除以3是因为RGB三通道
  return {
    diffPixels,
    diffRatio: Number(diffRatio.toFixed(4)),
    isPass: diffRatio < 0.01 // 差异率小于1%视为通过
  };
}
```

这种方法简单直接，但存在两个严重问题：

1. **截图尺寸不稳定**：即使页面内容相同，滚动条宽度、渲染时机等细微差异都会导致像素不一致
2. **无法定位差异区域**：只知道"不一样"，不知道"哪里不一样"

### 7.2.3 生成可视化Diff图

将差异区域标注出来，是调试视觉 Diff 的关键一步：

```javascript
async function generateDiffImage(img1Buffer, img2Buffer, threshold = 10) {
  const [img1, img2] = await Promise.all([
    sharp(img1Buffer).raw().toBuffer({ resolveWithObject: true }),
    sharp(img2Buffer).raw().toBuffer({ resolveWithObject: true })
  ]);

  const { data: diffData, info } = await sharp(img1Buffer)
    .merge(sharp(img2Buffer)) // 堆叠两张图
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 生成差异遮罩图
  const diffMask = Buffer.alloc(info.width * info.height);
  let diffCount = 0;

  for (let i = 0; i < img1.data.length; i++) {
    const rDiff = Math.abs(img1.data[i] - img2.data[i]);
    const gDiff = Math.abs(img1.data[i + 1] - img2.data[i + 1]);
    const bDiff = Math.abs(img1.data[i + 2] - img2.data[i + 2]);
    const avgDiff = (rDiff + gDiff + bDiff) / 3;

    if (avgDiff > threshold) {
      diffMask[i / 3] = 255; // 标记为差异像素
      diffCount++;
    }
  }

  // 将差异区域叠加红色高亮
  const highlighted = await sharp(img1Buffer)
    .composite([{
      input: diffMask,
      raw: { width: info.width, height: info.height, channels: 1 },
      blend: 'dest-in'
    }])
    .toBuffer();

  return {
    diffCount,
    highlighted
  };
}
```

### 7.2.4 AI增强的视觉Diff：SSIM算法

像素级 Diff 对微小变化过于敏感。SSIM（Structural Similarity Index，结构相似度）是更接近人类感知的图像质量评估算法，它综合考虑亮度、对比度和结构三个维度：

| 算法 | 衡量维度 | 对微小渲染差异的容忍度 |
|------|---------|---------------------|
| 像素 Diff | 逐像素RGB差值 | ❌ 极低，截图稍有不同就失败 |
| MSE/RMSE | 均方误差 | ❌ 同上 |
| SSIM | 亮度+对比度+结构 | ✅ 高，更符合人眼感知 |
| LPIPS | 深度学习特征距离 | ✅✅ 极高，能理解语义 |

```javascript
// 使用 node-ssim 实现结构相似度比较
const ssim = require('node-ssim');

async function compareImagesAI(img1Buffer, img2Buffer) {
  // 调整为相同尺寸
  const [resized1, resized2] = await Promise.all([
    sharp(img1Buffer).resize(512, null, { withoutEnlargement: true }).grayscale().toBuffer(),
    sharp(img2Buffer).resize(512, null, { withoutEnlargement: true }).grayscale().toBuffer()
  ]);

  // 计算 SSIM (1.0 = 完全相同, 0.0 = 完全不同)
  const score = await ssim(resized1, resized2);

  return {
    ssim: score.toFixed(4),
    isPass: score > 0.85,  // SSIM > 0.85 视为通过
    status: score > 0.95 ? 'PASS' : score > 0.85 ? 'MINOR_DIFF' : 'MAJOR_DIFF'
  };
}
```

### 7.2.5 构建视觉测试流水线

将上述能力串联起来，构建完整的视觉测试流程：

```javascript
class VisualRegressionTest {
  constructor(client, baselineDir = './screenshots/baseline') {
    this.client = client;
    this.baselineDir = baselineDir;
    fs.mkdirSync(baselineDir, { recursive: true });
  }

  async capture(pageName) {
    const { data } = await this.client.Page.captureScreenshot({
      format: 'png',
      quality: 90
    });
    return Buffer.from(data, 'base64');
  }

  async compare(pageName, currentBuffer) {
    const baselinePath = path.join(this.baselineDir, `${pageName}.png`);
    const baselineExists = fs.existsSync(baselinePath);

    if (!baselineExists) {
      // 首次运行：保存基线
      await sharp(currentBuffer).png().toFile(baselinePath);
      return { status: 'BASELINE_CREATED', report: null };
    }

    const baselineBuffer = fs.readFileSync(baselinePath);

    // 三重检查：像素Diff + SSIM + 生成Diff图
    const [pixelResult, ssimResult, diffResult] = await Promise.all([
      pixelDiff(baselineBuffer, currentBuffer),
      compareImagesAI(baselineBuffer, currentBuffer),
      generateDiffImage(baselineBuffer, currentBuffer)
    ]);

    const report = {
      pixelDiff: pixelResult.diffRatio,
      ssim: ssimResult.ssim,
      status: ssimResult.status,
      diffImage: diffResult.highlighted,
      timestamp: new Date().toISOString()
    };

    // 如果差异显著，自动保存截图用于审查
    if (report.status === 'MAJOR_DIFF') {
      const reportDir = `./screenshots/reports/${pageName}`;
      fs.mkdirSync(reportDir, { recursive: true });
      await sharp(diffResult.highlighted)
        .png()
        .toFile(path.join(reportDir, `${Date.now()}_diff.png`));
    }

    return { status: 'COMPLETE', report };
  }
}
```

> 📖 **参考文档**：
> - [SSIM 算法原理 - Wang et al. (2004)](https://www.cns.nyu.edu/~lcv/ssim/)
> - [node-ssim GitHub](https://github.com/rsmbl/node-ssim)
> - [Perceptual Similarity - LPIPS](https://richzhang.github.io/PerceptualSimilarity/)

> 📊 **图示位置：视觉Diff流水线流程图**
> - 左侧：CDP 截取当前页面截图
> - 中间：与 baseline 目录中的历史截图进行 SSIM + 像素 Diff 对比
> - 右侧：输出测试报告（通过/失败/轻微差异），失败时附带高亮差异区域的标注图
> - 下方：异常截图自动存入 reports 目录供人工审查

---

## 7.3 智能等待策略：基于视觉元素的动态等待

### 7.3.1 固定等待的困境

传统的自动化脚本中，最常见的等待方式是硬编码延时：

```javascript
await page.goto('https://example.com');
await new Promise(r => setTimeout(r, 3000)); // 等待3秒
await page.click('#submit-btn');
```

这种方式有三个致命缺陷：

- **浪费等待**：实际只需 500ms，却等了 3000ms
- **仍然失败**：网速慢时 3000ms 根本不够
- **难以调试**：失败后不知道是真没加载，还是时间不够

### 7.3.2 CDP 原生等待：DOM 和网络层面的成熟方案

CDP 已经提供了一些内置的等待能力：

```javascript
// 等待特定 DOM 节点出现
const { nodeId } = await DOM.waitFor({
  selector: '#loading-complete',  // 通过选择器等待
  visible: true,
  timeout: 10000
});

// 等待网络空闲
await Network.waitForIdle({ maxTimeout: 15000 });

// 等待 JavaScript 条件满足
await Runtime.evaluate({
  expression: `(() => {
    return document.querySelector('.data-loaded') !== null;
  })()`,
  awaitPromise: true,
  returnByValue: true
}, { timeout: 10000 });
```

### 7.3.3 视觉等待：AI赋能的新维度

但真正的"智能等待"需要 AI 的介入。CDP 截图 + 图像识别算法可以感知到纯 DOM 无法描述的状态：

- ✅ 加载动画（spinner）是否消失
- ✅ 图片是否成功加载（而非显示裂图占位符）
- ✅ 图表是否渲染完成
- ✅ 弹窗是否完全展开

```javascript
class SmartWaiter {
  constructor(client) {
    this.client = client;
  }

  // 等待目标元素在视觉上可见（图像识别）
  async waitForVisualElement(
    templateImageBuffer,  // 目标元素的截图作为模板
    { timeout = 15000, threshold = 0.8 } = {}
  ) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const { data } = await this.client.Page.captureScreenshot({
        format: 'png',
        clip: undefined  // 截取整个视口
      });
      const currentBuffer = Buffer.from(data, 'base64');

      const similarity = await this.templateMatch(currentBuffer, templateImageBuffer);

      if (similarity >= threshold) {
        return { found: true, waitTime: Date.now() - start };
      }

      await sleep(200); // 每200ms检查一次
    }

    return { found: false, waitTime: timeout };
  }

  // 等待加载动画消失
  async waitForLoaderGone(loaderTemplatePath, { timeout = 15000 } = {}) {
    const loaderBuffer = fs.readFileSync(loaderTemplatePath);
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const { data } = await this.client.Page.captureScreenshot({ format: 'png' });
      const currentBuffer = Buffer.from(data, 'base64');

      const score = await this.templateMatch(currentBuffer, loaderBuffer);

      // 匹配度低说明加载动画已消失（或变了）
      if (score < 0.3) {
        return { gone: true, duration: Date.now() - start };
      }

      await sleep(300);
    }

    return { gone: false, duration: timeout };
  }

  // 等待文字出现在页面上（OCR驱动）
  async waitForText(text, { timeout = 10000 } = {}) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const { data } = await this.client.Page.captureScreenshot({ format: 'png' });
      const screenshot = Buffer.from(data, 'base64');

      const { text: pageText } = await recognizeTextFromImage(screenshot);

      if (pageText.includes(text)) {
        return { found: true, waitTime: Date.now() - start };
      }

      await sleep(500);
    }

    return { found: false, waitTime: timeout };
  }
}
```

### 7.3.4 自适应等待策略

将多种等待条件组合成"自适应链"，自动选择最快满足的策略：

```javascript
async function smartWait(client, conditions) {
  const waiter = new SmartWaiter(client);

  const results = await Promise.allSettled(
    conditions.map(async (cond) => {
      switch (cond.type) {
        case 'dom':
          return waiter.waitForDOMNode(cond.selector, cond.options);
        case 'visual':
          return waiter.waitForVisualElement(cond.template, cond.options);
        case 'text':
          return waiter.waitForText(cond.text, cond.options);
        case 'network':
          return waiter.waitForNetworkIdle(cond.options);
        case 'js':
          return waiter.waitForJSExpression(cond.expression, cond.options);
        default:
          throw new Error(`Unknown condition type: ${cond.type}`);
      }
    })
  );

  // 返回最快满足的条件结果
  const successful = results
    .filter(r => r.status === 'fulfilled' && r.value?.found)
    .sort((a, b) => a.value.waitTime - b.value.waitTime);

  return successful[0]?.value ?? { found: false };
}

// 使用示例
await smartWait(client, [
  { type: 'dom', selector: '#dashboard-loaded', options: { timeout: 20000 } },
  { type: 'visual', template: './templates/dashboard-complete.png', options: { threshold: 0.75, timeout: 25000 } },
  { type: 'text', text: '数据加载完成', options: { timeout: 30000 } }
]);
```

> 📊 **图示位置：自适应等待策略流程图**
> - 顶部输入：多个并行等待条件（DOM/视觉/文字/网络/JS）
> - 中部：各条件独立倒计时，CDP 并行探测
> - 底部：最快满足的条件触发成功事件，超时则整体失败
> - 右侧标注：每个条件的等待时间，用于性能分析和调优

---

## 7.4 自动化表单填充：基于上下文的智能识别

### 7.4.1 表单填充的经典困境

表单自动化看似简单，实则暗藏玄机：

| 困难场景 | 传统方案的应对 |
|---------|--------------|
| 动态渲染的表单字段 | 选择器失效 |
| 表单字段没有 `id` 或稳定的 `name` | 只能靠 `placeholder` 或 `aria-label` |
| 多步骤向导表单 | 每步都要硬编码选择器 |
| 表单验证失败后的重试 | 无法感知验证状态 |
| 动态下拉选项 | 需要等待异步数据加载 |

### 7.4.2 语义化表单解析器

通过分析表单的语义信息（`label`、`placeholder`、`aria-label`）来推断字段意图：

```javascript
async function parseForm(client, formRootSelector) {
  const { DOM, Runtime } = client;

  const { nodeId } = await DOM.querySelector({ selector: formRootSelector });

  // 获取所有表单输入元素及其关联标签
  const { nodes } = await DOM.querySelectorAll({
    nodeId,
    selector: 'input, textarea, select, [contenteditable="true"]'
  });

  const fields = [];

  for (const n of nodes) {
    const attrs = await DOM.getAttributes({ nodeId: n.nodeId });

    // 查找关联的 label
    const labelResult = await Runtime.evaluate({
      expression: `(function() {
        const el = document.querySelector('[data-node-id="${n.nodeId}"]');
        const label = document.querySelector('label[for="' + el.id + '"]');
        if (label) return label.textContent.trim();
        const parent = el.closest('div,td,th');
        if (parent) {
          const prev = parent.querySelector('label');
          if (prev) return prev.textContent.trim();
        }
        return el.placeholder || el.getAttribute('aria-label') || '';
      })()`
    });

    fields.push({
      nodeId: n.nodeId,
      id: attrs.attributes?.find(a => a.name === 'id')?.value ?? '',
      name: attrs.attributes?.find(a => a.name === 'name')?.value ?? '',
      type: attrs.attributes?.find(a => a.name === 'type')?.value ?? 'text',
      label: labelResult.result.value,
      required: attrs.attributes?.some(a => a.name === 'required'),
      readonly: attrs.attributes?.some(a => a.name === 'readonly')
    });
  }

  return fields;
}

// 输出示例：
// [
//   { nodeId: 123, id: 'username', name: 'user', type: 'text', label: '用户名', required: true },
//   { nodeId: 124, id: 'password', name: 'pwd', type: 'password', label: '密码', required: true }
// ]
```

### 7.4.3 智能数据映射

将自然语言数据映射到表单字段，是 AI 驱动表单填充的核心：

```javascript
class SmartFormFiller {
  constructor(client) {
    this.client = client;
    this.dom = client.DOM;
    this.input = client.Input;
    this.runtime = client.Runtime;
  }

  async fillByIntent(formRootSelector, intentData) {
    const fields = await parseForm(this.client, formRootSelector);
    const filled = [];

    for (const field of fields) {
      const matchedKey = this.matchField(field, intentData);

      if (matchedKey && !field.readonly) {
        const value = intentData[matchedKey];

        if (field.type === 'select-one' || field.type === 'select-multiple') {
          await this.selectOption(field.nodeId, value);
        } else if (field.type === 'checkbox') {
          await this.setCheckbox(field.nodeId, Boolean(value));
        } else {
          await this.typeInto(field.nodeId, String(value));
        }

        filled.push({ label: field.label, value, via: matchedKey });
      }
    }

    return filled;
  }

  // 语义匹配：将字段标签与数据键智能对应
  matchField(field, dataMap) {
    const aliases = {
      '用户名': ['username', 'user', 'name', 'login', 'account'],
      '邮箱': ['email', 'mail', 'e-mail', '邮箱'],
      '密码': ['password', 'pwd', 'pass', 'secret'],
      '手机': ['phone', 'mobile', 'tel', '手机', '电话号码'],
      '地址': ['address', 'addr', 'location', '地址', '收货地址'],
      '姓名': ['name', 'fullname', 'full_name', 'username', '姓名', '真实姓名']
    };

    for (const [label, keys] of Object.entries(aliases)) {
      if (field.label.includes(label) || field.id.includes(label)) {
        return keys.find(k => k in dataMap) ?? keys[0];
      }
    }

    // 兜底：按字段 ID 或 name 精确匹配
    const directKey = Object.keys(dataMap).find(
      k => field.id.includes(k) || field.name.includes(k)
    );
    return directKey;
  }

  async typeInto(nodeId, value) {
    await this.dom.focus({ nodeId });
    await this.runtime.evaluate({
      expression: `(function() {
        const el = document.querySelector('[data-node-id="${nodeId}"]');
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })()`
    });

    // 逐字符输入，模拟真实打字节奏
    for (const char of value) {
      await this.input.dispatchKeyEvent({ type: 'keyRawInserted', text: char });
      await sleep(20 + Math.random() * 30);
    }

    await this.dom.resolveNode({ nodeId }); // 触发 blur 和 change 事件
  }

  async selectOption(nodeId, optionText) {
    await this.runtime.evaluate({
      expression: `(function() {
        const el = document.querySelector('[data-node-id="${nodeId}"]');
        const opts = Array.from(el.options);
        const match = opts.find(o =>
          o.textContent.includes('${optionText}') ||
          o.value.includes('${optionText}')
        );
        if (match) {
          el.value = match.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()`
    });
  }
}
```

### 7.4.4 验证反馈感知

表单提交后，AI 需要能感知验证结果，并做出相应的决策：

```javascript
async function submitAndHandleValidation(client, submitSelector) {
  const { Page, Runtime } = client;

  // 截图记录提交前的状态
  await Page.click(submitSelector);

  // 等待一段合理时间让验证运行
  await sleep(1500);

  // 检查是否有错误提示
  const errors = await Runtime.evaluate({
    expression: `Array.from(document.querySelectorAll('.error, .field-error, [role="alert"]'))
      .map(el => el.textContent.trim())
      .filter(t => t.length > 0)`
  });

  // 截图记录提交后的状态
  const { data } = await Page.captureScreenshot({ format: 'png' });
  const afterScreenshot = Buffer.from(data, 'base64');

  // OCR 检查页面上是否有明显的错误信息
  const { text: visibleText } = await recognizeTextFromImage(afterScreenshot);

  const hasError = errors.result.value.length > 0 ||
    /error|错误|失败|invalid|required/i.test(visibleText);

  return {
    success: !hasError,
    errors: errors.result.value,
    visibleText,
    screenshot: afterScreenshot
  };
}
```

---

## 7.5 利用LLM解析页面结构与生成操作指令

### 7.5.1 为什么需要LLM参与浏览器自动化？

传统的浏览器自动化需要程序员预先编写"每一步操作"——打开哪个 URL、点击哪个按钮、输入什么内容。但 AI Agent 的出现改变了这一范式：

> 用户告诉 AI："帮我买一张明天北京到上海的高铁票"，AI 自动完成从搜索、选择、填写信息到支付的完整流程。

这个过程中，LLM 需要：

1. **理解页面语义**：看到页面上密密麻麻的 DOM 节点，能理解"这是日期选择器"、"这是座位类型下拉框"
2. **规划操作序列**：判断应该先选日期还是先选车次，表单填写顺序如何
3. **处理异常情况**：页面元素变了怎么办？弹窗突然出现怎么处理？
4. **自我纠错**：操作失败了，如何从错误中恢复？

这正是 CDP + LLM 的黄金组合发挥作用的地方。

### 7.5.2 提取页面语义树

LLM 无法直接理解 HTML，需要我们先把 DOM 结构转换为它能处理的语义描述：

```javascript
async function extractPageSemantics(client) {
  const { DOM, Runtime } = client;

  // 获取文档根节点
  const { root } = await DOM.getDocument({ depth: -1 });

  // 通过 Runtime.evaluate 在页面上下文中执行复杂的 DOM 分析
  const semantics = await Runtime.evaluate({
    expression: `(() => {
      function getSemantics(node, depth = 0) {
        if (depth > 5) return null; // 限制深度

        const el = node.nodeType === Node.ELEMENT_NODE ? node : null;
        if (!el) return null;

        // 过滤：忽略脚本、样式、隐藏元素
        const tag = el.tagName?.toLowerCase();
        if (['script', 'style', 'noscript', 'meta', 'link'].includes(tag)) return null;
        if (el.offsetParent === null && tag !== 'body') return null;

        const isInteractive = el.tagName === 'BUTTON' ||
          el.tagName === 'A' ||
          el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' ||
          el.tagName === 'TEXTAREA' ||
          el.getAttribute('role') === 'button' ||
          el.getAttribute('role') === 'link' ||
          el.onclick !== null;

        return {
          tag,
          id: el.id || undefined,
          className: el.className?.split(' ').filter(Boolean).slice(0, 3) || undefined,
          role: el.getAttribute('role') || undefined,
          text: el.innerText?.trim().slice(0, 200) || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          ariaLabel: el.getAttribute('aria-label') || undefined,
          href: el.href || undefined,
          type: el.type || undefined,
          isInteractive,
          rect: el.getBoundingClientRect ?
            { x: Math.round(el.getBoundingClientRect().x),
              y: Math.round(el.getBoundingClientRect().y),
              width: Math.round(el.getBoundingClientRect().width),
              height: Math.round(el.getBoundingClientRect().height)
            } : null,
          children: Array.from(el.children)
            .map(c => getSemantics(c, depth + 1))
            .filter(Boolean)
            .slice(0, 20) // 限制子节点数量
        };
      }

      return JSON.stringify(getSemantics(document.body));
    })()`,
    returnByValue: true
  });

  return JSON.parse(semantics.result.value);
}
```

输出示例结构如下：

```json
[
  {
    "tag": "div",
    "className": ["container", "main-content"],
    "role": "main",
    "text": "...",
    "isInteractive": false,
    "rect": { "x": 0, "y": 80, "width": 1280, "height": 600 },
    "children": [
      {
        "tag": "input",
        "id": "search-input",
        "placeholder": "搜索商品...",
        "isInteractive": true,
        "rect": { "x": 100, "y": 120, "width": 400, "height": 40 }
      },
      {
        "tag": "button",
        "text": "搜索",
        "isInteractive": true,
        "rect": { "x": 510, "y": 120, "width": 80, "height": 40 }
      }
    ]
  }
]
```

### 7.5.3 构建LLM Agent自动化框架

将 CDP 的页面感知能力与 LLM 的决策能力整合成完整的 Agent 框架：

```javascript
class BrowserAgent {
  constructor(client, llmClient) {
    this.client = client;
    this.llm = llmClient;
    this.conversationHistory = [];
  }

  // 核心循环：感知 → 决策 → 执行 → 验证
  async run(userIntent, maxSteps = 10) {
    this.conversationHistory.push({
      role: 'user',
      content: userIntent
    });

    for (let step = 0; step < maxSteps; step++) {
      // Step 1: 感知 — 提取页面语义
      const pageSemantics = await extractPageSemantics(this.client);

      // Step 2: 决策 — 让 LLM 决定下一步操作
      const decision = await this.llm.chat({
        messages: [
          ...this.conversationHistory,
          {
            role: 'system',
            content: `你是一个浏览器自动化 Agent。基于用户意图和当前页面结构，决定下一步操作。

页面结构（JSON）：
${JSON.stringify(pageSemantics, null, 2)}

可用的操作：
- click [node_id] — 点击元素
- type [node_id] [text] — 向输入框输入文本
- scroll [direction] [pixels] — 滚动页面
- wait [condition] — 等待条件满足
- screenshot — 截图观察
- done — 任务完成

请以 JSON 格式输出你的决策：{"action": "操作类型", "target": "目标描述", "reasoning": "你的推理"}`
          }
        ]
      });

      const action = JSON.parse(decision.content);

      // Step 3: 执行
      await this.executeAction(action);

      // Step 4: 记录历史
      this.conversationHistory.push({
        role: 'assistant',
        content: JSON.stringify(action)
      });

      if (action.action === 'done') {
        return { success: true, steps: step + 1 };
      }
    }

    return { success: false, reason: '超出最大步数限制' };
  }

  async executeAction(action) {
    const { DOM, Input, Page } = this.client;

    switch (action.action) {
      case 'click':
        const nodeId = await this.findNodeByDescription(action.target);
        if (nodeId) {
          await DOM.scrollIntoViewIfNeeded({ nodeId });
          const box = await DOM.getBoxModel({ nodeId });
          const point = box.model.border[0];
          await Input.dispatchMouseEvent({
            type: 'mousePressed',
            x: point.x,
            y: point.y,
            button: 'left',
            clickCount: 1
          });
          await Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y });
        }
        break;

      case 'type':
        const [typeNodeId, text] = action.target.split('::');
        const targetNode = await this.findNodeByDescription(typeNodeId);
        if (targetNode) {
          await DOM.focus({ nodeId: targetNode });
          await Input.dispatchKeyEvent({ type: 'keyRawInserted', text });
        }
        break;

      case 'screenshot':
        const { data } = await Page.captureScreenshot({ format: 'png' });
        console.log(`[Screenshot captured, size: ${data.length} bytes]`);
        break;
    }
  }

  async findNodeByDescription(description) {
    // 将 LLM 输出的描述与 DOM 节点匹配
    const semantics = await extractPageSemantics(this.client);
    return this.fuzzyMatch(semantics, description);
  }

  fuzzyMatch(tree, description) {
    const desc = description.toLowerCase();
    const search = (nodes) => {
      for (const node of nodes) {
        const matchText = [
          node.text, node.placeholder, node.ariaLabel,
          node.id, ...(node.className || [])
        ].filter(Boolean).join(' ').toLowerCase();

        if (matchText.includes(desc) || desc.includes(matchText)) {
          return this.getNodeIdFromSemantics(node); // 实际实现中需要维护映射
        }
        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return search(Array.isArray(tree) ? tree : [tree]);
  }
}
```

### 7.5.4 多模态Agent：让LLM直接"看"页面

更进一步，我们可以把截图直接发送给多模态 LLM（如 GPT-4V、Claude Vision），让它像人一样"看"页面做决策：

```javascript
async function runMultimodalAgent(client, llmClient, userIntent) {
  const { Page } = client;

  // 截取当前页面
  const { data } = await Page.captureScreenshot({ format: 'png', quality: 85 });
  const screenshotBase64 = data;

  // 构建多模态 prompt
  const response = await llmClient.chat({
    model: 'gpt-4-vision-preview', // 或 claude-3-opus 等多模态模型
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `用户目标：${userIntent}

当前页面截图如下。请描述页面内容，并决定下一步操作。
如果需要执行操作，请说明要点击或填写什么元素。

响应格式：
{
  "page_description": "页面描述",
  "next_action": "click/type/scroll/done",
  "target": "操作目标描述",
  "reasoning": "你的推理"
}`
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/png;base64,${screenshotBase64}`
          }
        }
      ]
    }]
  });

  const decision = JSON.parse(response.content);
  return decision;
}
```

### 7.5.5 完整示例：用自然语言完成购票任务

下面展示一个完整的端到端示例，让 Agent 自动完成"查询北京到上海的高铁票"：

```javascript
async function bookTrainTicket() {
  const client = await CDP({ port: 9222 });
  const { Page, DOM, Runtime } = client;

  const llm = new LLMClient({ apiKey: process.env.OPENAI_API_KEY });
  const agent = new BrowserAgent(client, llm);

  await Page.enable();
  await DOM.enable();

  const result = await agent.run(
    '打开12306官网，查询2024年7月1日北京到上海的高铁票，并告诉我二等座的票价和出发时间',
    { maxSteps: 15 }
  );

  console.log('执行结果:', result);
  await client.close();
}
```

执行过程大致如下：

| 步骤 | 页面状态 | LLM 决策 | 执行动作 |
|------|---------|---------|---------|
| 1 | 首页 | "需要先打开12306" | `goto(https://www.12306.cn)` |
| 2 | 登录页 | "需要登录才能购票" | `click(账号密码登录入口)` |
| 3 | 登录后首页 | "需要填写出发地和目的地" | `type(出发地, 北京)` → `type(目的地, 上海)` |
| 4 | 日期选择器 | "需要选择日期" | `click(日期输入框)` → `click(7月1日)` |
| 5 | 搜索结果页 | "找到了多趟列车" | `done(返回结果摘要)` |

> 📖 **参考文档**：
> - [Anthropic Claude API - 多模态支持](https://docs.anthropic.com/claude/docs/vision)
> - [OpenAI GPT-4V 官方文档](https://platform.openai.com/docs/guides/vision)
> - [Playwright 的 AI helpers](https://playwright.dev/docs/api/class-locator#locator-get-by-role)

> 📊 **图示位置：LLM驱动的浏览器Agent架构图**
> - 最左侧：用户输入自然语言指令（如"帮我买票"）
> - 中部循环：① CDP 截图获取页面 → ② 多模态LLM分析页面 → ③ 解析操作指令 → ④ CDP执行操作 → ⑤ 验证结果 → 循环
> - 最右侧：CDP 直接控制 Chrome 浏览器（点击、输入、滚动等）
> - 底部：Agent维护对话历史和操作上下文，支持多轮交互

---

## 本章小结

本章我们为 CDP 自动化插上了 AI 的翅膀，覆盖了四大核心能力：

| 能力 | 核心技术 | 解决的问题 |
|------|---------|-----------|
| **内容识别** | Tesseract OCR + 图像处理 | Canvas内容读取、验证码识别 |
| **视觉Diff** | SSIM + 像素Diff | UI回归检测、样式异常发现 |
| **智能等待** | 视觉元素感知 + 多策略并行 | 加载时序不定、动态渲染场景 |
| **表单智能填充** | 语义解析 + 自然语言映射 | 表单字段多、动态渲染、无稳定选择器 |
| **LLM Agent** | 多模态理解 + 决策生成 | 自然语言驱动、页面语义理解、自我纠错 |

这些能力的组合，使我们的浏览器自动化脚本从"机械执行预设指令"进化为"智能感知与决策"。在 AI Agent 大行其道的今天，掌握 CDP 与 AI 的融合技术，就是掌握了下一代浏览器自动化的核心武器。

下一章我们将进入**扩展与实战**部分，综合运用本书所学的所有技术，构建真正可用于生产环境的完整自动化系统。
