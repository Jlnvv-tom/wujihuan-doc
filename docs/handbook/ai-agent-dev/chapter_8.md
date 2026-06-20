# 第8章 n8n 工作流实战：AI 自动化全流程

你以为 n8n 只是"连接器"？它其实是企业的数字神经系统。

我是怕浪猫，前面聊了阿里云百炼，今天来搞 n8n——开源工作流自动化的瑞士军刀。10个实战案例，从内容生成到公众号发布，帮你把企业的重复劳动全部自动化。

---

## 8.1 n8n 简介与部署

**n8n 是什么？**

n8n 是一个开源的工作流自动化工具，核心理念是"连接一切"。它不只是一个"IFTTT"，而是一个完整的业务流程自动化平台——200+ 预置集成，支持代码执行，支持自托管。

n8n 的核心特点：

1. **海量集成**：200+ 预置节点，涵盖数据库、API、文件存储
2. **可视化编排**：拖拽式设计，所见即所得
3. **代码执行**：内置 JavaScript 和 Python 代码节点
4. **自托管**：完全可控，数据不出内网
5. **开源免费**：核心功能免费，有付费云服务

**部署方案对比**

| 方案 | 优点 | 缺点 | 适合场景 |
|------|------|------|---------|
| n8n Cloud | 零配置，开箱即用 | 数据在第三方 | 个人/小团队试用 |
| Docker自托管 | 免费，灵活 | 需要维护 | 中小企业 |
| Kubernetes | 高可用 | 运维复杂 | 大型企业 |

**Docker 部署**

```bash
# 拉取镜像
docker pull n8nio/n8n

# 启动容器
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

启动后访问 `http://localhost:5678` 即可使用。

**汉化版部署**

如果你想用中文界面，可以使用中文汉化版：

```bash
docker pull n8nio/n8n:latest
# 启动后访问中文界面
```

官方文档：https://docs.n8n.io/

> n8n 的定位是"企业的数字神经系统"——连接企业的各个系统和数据，让信息流畅通无阻。

---

## 8.2 核心节点与操作入门

**常用节点分类**

| 类别 | 节点 | 用途 |
|------|------|------|
| 触发器 | Webhook、Schedule、CRON | 启动工作流 |
| HTTP | HTTP Request | 调用外部API |
| 编程 | Code（JS/Python） | 自定义逻辑 |
| 数据库 | PostgreSQL、MySQL、MongoDB | 数据库操作 |
| 文件 | Read/Write File | 文件处理 |
| AI | AI Agent、Embeddings | AI相关操作 |
| 通信 | Slack、Email、钉钉 | 消息通知 |
| 工具 | IF/ELSE、Switch、Loop | 流程控制 |

**工作流基本结构**

```
[触发器] → [处理节点1] → [处理节点2] → ... → [输出节点]
```

**创建第一个工作流**

1. 点击"新建工作流"
2. 从左侧拖拽节点到画布
3. 连接节点
4. 配置每个节点的参数
5. 点击"测试运行"
6. 保存并激活

---

## 8.3 实战：AI 内容生成工作流

第一个实战，用 n8n 做一个自动化的内容生成工作流。

**设计思路**

1. 定时触发（每天早上9点）
2. 从数据库读取今日话题
3. 调用 AI 生成内容
4. 保存到数据库或发送通知

**工作流编排**

```
[CRON触发器：每天9:00]
    → [数据库读取：获取今日话题]
    → [AI Agent：生成内容]
    → [数据库写入：保存内容]
    → [Slack通知：通知编辑]
```

**节点配置**

CRON 触发器：
```json
{
  "rule": {
    "interval": [
      {
        "field": "cron",
        "property": "",
        "value": "0 9 * * *"
      }
    ]
  }
}
```

数据库读取：
```json
{
  "operation": "find",
  "table": "daily_topics",
  "limit": 1,
  "where": "status = 'pending'"
}
```

AI Agent 节点（使用 OpenAI）：
```javascript
// 输入数据：{ topic: "今日话题内容" }
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { role: "system", content: "你是一个资深内容编辑。" },
    { role: "user", content: `根据以下话题生成一篇短文：${$input.first().json.topic}` }
  ]
});

return {
  json: {
    content: response.choices[0].message.content,
    topic: $input.first().json.topic,
    generated_at: new Date().toISOString()
  }
};
```

> AI 工作流的核心是"触发→生成→存储→通知"四步走。n8n 把每一步都封装成节点，你只需要用线把它们连起来。

---

## 8.4 实战：多模态画板集成

第二个实战，把 AI 图像生成集成到 n8n 工作流中。

**设计思路**

1. 接收用户的图片描述
2. 调用图像生成 API（如 Midjourney、DALL-E、通义万相）
3. 生成图片
4. 保存到 OSS 或发送回用户

**工作流编排**

```
[Webhook接收请求]
    → [AI图像生成]
    → [保存到OSS]
    → [返回图片URL]
```

**AI 图像生成节点（Code 节点）**

```javascript
// 调用通义万相 API
const prompt = $input.first().json.prompt;

const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${$env.DASHSCOPE_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "wanx2.1-t2i-turbo",
    input: { prompt }
  })
});

const result = await response.json();
return { json: { image_url: result.output.image_url } };
```

---

## 8.5 实战：商品推荐 Agent

第三个实战，用 n8n 做一个商品推荐 Agent。

**设计思路**

1. 接收用户的需求描述
2. 从商品库中检索相关商品
3. AI 排序和筛选
4. 生成推荐理由
5. 返回推荐结果

**工作流编排**

```
[Webhook接收请求]
    → [读取商品库]
    → [AI Agent：匹配推荐]
    → [格式化输出]
    → [返回结果]
```

**AI Agent 节点配置**

```javascript
const userNeeds = $input.first().json.needs;
const products = $('Read Products').first().json.data;

const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [
    { 
      role: "system", 
      content: `你是一个专业的电商导购。根据用户需求从商品列表中推荐最合适的3个商品。
商品列表：${JSON.stringify(products)}
要求：给出推荐理由和排序。`
    },
    { role: "user", content: `用户需求：${userNeeds}` }
  ]
});

 return {
  json: {
    recommendations: JSON.parse(response.choices[0].message.content),
    generated_at: new Date().toISOString()
  }
};
```

---

## 8.6 实战：视频处理流水线

第四个实战，做一个自动化的视频处理工作流。

**设计思路**

1. 接收上传的视频文件
2. 进行格式转换
3. 提取缩略图
4. 提取字幕
5. 上传到视频托管平台
6. 发送完成通知

**工作流编排**

```
[Webhook接收文件]
    → [下载文件]
    → [FFmpeg：格式转换]
    → [提取缩略图]
    → [提取字幕]
    → [上传到B站API]
    → [发送Slack通知]
```

**FFmpeg 节点配置（Code 节点）**

```javascript
const fs = require('fs');

// 假设 inputFile 是本地文件路径
const inputFile = $input.first().json.file_path;
const outputFile = inputFile.replace('.avi', '.mp4');

// 使用 ffmpeg 进行转换（需要在 n8n 容器中安装 ffmpeg）
const { execSync } = require('child_process');

execSync(`ffmpeg -i ${inputFile} -c:v libx264 -crf 23 ${outputFile}`);

return { json: { output_file: outputFile } };
```

---

## 8.7 实战：异常告警自动化

第五个实战，做一个系统异常告警工作流。

**设计思路**

1. 定时检查系统指标（CPU、内存、磁盘）
2. 如果超过阈值
3. 生成告警信息
4. 发送到相关人员的钉钉群

**工作流编排**

```
[CRON：每5分钟]
    → [读取系统指标]
    → [IF/ELSE：判断是否异常]
    → 异常 → [生成告警信息] → [发送钉钉消息]
    → 正常 → 结束
```

**告警阈值判断（IF 节点）**

```javascript
const cpuUsage = $input.first().json.cpu_usage;
const memoryUsage = $input.first().json.memory_usage;
const diskUsage = $input.first().json.disk_usage;

const isHighCpu = cpuUsage > 80;
const isHighMemory = memoryUsage > 85;
const isHighDisk = diskUsage > 90;

return {
  json: {
    isAlert: isHighCpu || isHighMemory || isHighDisk,
    alertReasons: [
      isHighCpu ? `CPU使用率过高: ${cpuUsage}%` : null,
      isHighMemory ? `内存使用率过高: ${memoryUsage}%` : null,
      isHighDisk ? `磁盘使用率过高: ${diskUsage}%` : null
    ].filter(Boolean)
  }
};
```

---

## 8.8 实战：小红书卡片自动生成

第六个实战，做一个小红书内容卡片的自动生成工作流。

**设计思路**

1. 接收内容主题
2. AI 生成文案和标签
3. 生成配套图片
4. 输出可发布格式

**工作流编排**

```
[Webhook接收主题]
    → [AI生成文案]
    → [AI生成图片]
    → [组装卡片]
    → [保存/发送]
```

---

## 8.9 实战：公众号自动发布

第七个实战，做一个公众号文章的自动发布工作流。

**设计思路**

1. 从 CMS 或数据库读取文章内容
2. 格式化标题、配图、正文
3. 调用公众号 API 发布
4. 发送发布结果通知

**工作流编排**

```
[定时触发/手动触发]
    → [读取文章数据]
    → [格式化HTML]
    → [调用公众号API]
    → [发送Slack通知]
```

**公众号发布节点（HTTP Request 节点）**

```json
{
  "method": "POST",
  "url": "https://api.weixin.qq.com/cgi-bin/material/add_news",
  "authentication": "genericCredentialType",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      { "name": "Content-Type", "value": "application/json" }
    ]
  },
  "sendBody": true,
  "bodyParameters": {
    "parameters": [
      { "name": "articles", "value": "{{ $json.articles }}" }
    ]
  }
}
```

---

## 8.10 工作流调试技巧与最佳实践

**调试技巧**

1. **小数据测试**：先用一条数据测试工作流
2. **节点独立测试**：右键节点 → "测试此节点"
3. **查看执行历史**：点击节点 → "执行历史"
4. **日志输出**：在 Code 节点中添加 console.log
5. **逐步执行**：断点调试，单步执行

**错误处理最佳实践**

| 问题 | 解决方案 |
|------|---------|
| API 调用超时 | 添加 Retry 节点，设置重试次数 |
| 数据格式错误 | 添加 IF 节点检查数据类型 |
| 节点执行失败 | 添加 Error Trigger 捕获错误 |
| 数据丢失 | 添加数据库记录执行状态 |

**n8n 高级技巧**

1. **变量命名**：使用有意义的变量名，方便调试
2. **节点复用**：把常用逻辑封装为子工作流
3. **环境变量**：敏感信息放在环境变量中
4. **版本控制**：导出 JSON 文件进行版本管理
5. **监控告警**：配置执行失败通知

> n8n 的上限取决于你对业务流程的理解和自动化意识。能把多少重复劳动自动化，决定了 n8n 能给你省多少时间。

---

**本章小结**

| 实战 | 核心能力 | 关键技术 |
|------|---------|---------|
| AI内容生成 | 定时任务+AI+RDB | CRON触发+OpenAI+数据库 |
| 多模态画板 | AI图像生成+OSS | 通义万相API |
| 商品推荐 | RAG+AI筛选 | OpenAI+向量检索 |
| 视频处理 | FFmpeg自动化 | 格式转换+缩略图 |
| 异常告警 | 监控+通知 | 阈值判断+钉钉API |
| 小红书卡片 | AI文案+AI图片 | 多模态生成 |
| 公众号发布 | API对接+自动化 | 公众号API |
| 调试技巧 | 小数据测试、断点 | 逐步执行 |

---

觉得有用？收藏起来，下次直接照抄。

你用 n8n 做过什么自动化工作流？评论区分享你的经验。

关注怕浪猫，下期我们讲综合实战——用 n8n 搭建有声书工业化生产系统。

系列进度 8/24

**下章预告：** 第9章我们将带来第一个综合实战项目——用 n8n 搭建有声书工业化生产系统，实现从文本到有声书的全自动化流水线。
