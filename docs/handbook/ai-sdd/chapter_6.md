# 第6章 Codex 编程实战：开源项目二次开发

从零搭建项目是 Vibe Coding 最顺滑的场景——没有历史包袱，AI 可以自由发挥。但现实世界中，更多时候你面对的是已有项目：代码结构复杂、文档缺失、技术栈陈旧。二次开发考验的是 Vibe Coding 的"逆风局"能力。本章以开源 AI 聊天框架"小龙虾"（OpenClaw）为例，带你完整走一遍 AI 驱动的二次开发流程。

---

## 6.1 二次开发的设计思路与环境配置

**二次开发的挑战**

二次开发与从零开发的根本区别在于：你不是在空白画布上作画，而是在别人的画上添笔。这带来了三个核心挑战：

1. **理解成本高**：需要理解原作者的架构意图和设计决策
2. **修改风险大**：一处改动可能引发连锁反应
3. **规范约束强**：必须遵循已有代码的风格和约定

**Vibe Coding 驱动二次开发的设计思路**

核心思路是"先理解，再修改，后沉淀"：

1. 先用 AI 快速理解项目全貌（架构梳理、核心流程分析）
2. 在理解的基础上进行最小化修改（MVP 验证）
3. 将开发过程中的知识沉淀为 Rules 文档（防止上下文丢失）

**环境配置**

1. 克隆项目：

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
```

2. 安装项目依赖：

```bash
# 后端依赖
npm install

# 前端依赖（如有独立前端）
cd web && npm install && cd ..
```

3. 配置环境变量：

```bash
cp .env.example .env
# 编辑 .env，填入必要的 API Key 和数据库配置
```

4. 启动项目：

```bash
npm run dev
```

5. 验证项目正常运行：打开浏览器访问 http://localhost:3000

---

## 6.2 源码下载、项目启动与 Rules 沉淀

**Rules 沉淀——二次开发的关键实践**

在二次开发中，Rules 沉淀是最容易被忽视但最重要的实践。它解决的核心问题是：AI 的上下文窗口有限，无法在每次交互时都加载整个项目。你需要把项目的关键信息浓缩成一份 Rules 文档，作为 AI 每次交互的"速查手册"。

**创建 .cursorrules 文件**

在项目根目录创建 `.cursorrules`，内容涵盖：

```markdown
# Project: OpenClaw (小龙虾)

## Architecture Overview
- Monorepo structure: packages/core, packages/gateway, packages/web
- Gateway is the entry point, handles routing and auth
- Core contains business logic and AI integration
- Web is the frontend React app

## Key Conventions
- TypeScript strict mode enabled
- Use async/await, no raw Promises
- API responses follow { code, message, data } format
- All new features must have corresponding tests

## Module Map
- Gateway: src/gateway/ - HTTP routing, WebSocket, authentication
- Channel: src/channel/ - Platform adapters (Discord, Telegram, WeChat)
- Agent: src/agent/ - AI agent logic, tool execution, memory
- Storage: src/storage/ - Data persistence, conversation history

## Database
- PostgreSQL 15, migrations in prisma/migrations/
- Redis 7 for caching and session storage

## Do NOT
- Do not modify existing migration files
- Do not change the Gateway routing structure without updating docs
- Do not use any package not in package.json
```

**Rules 沉淀的迭代更新**

Rules 不是一次性写完就结束的，需要在开发过程中持续更新：

- 发现新的架构约束时，补充到 Rules
- 踩坑后，将教训写入 Rules
- 新增模块时，更新模块地图

---

## 6.3 架构梳理：客户端、Gateway、Channel、Agent

理解开源项目的架构是二次开发的前提。使用 AI 快速梳理架构，比手动阅读源码效率高数倍。

**客户端架构**

```bash
# 在 Cursor Chat 中
请分析 packages/web 的架构，包括：
1. 路由结构
2. 状态管理方案
3. 组件层次关系
4. 与后端的通信方式
```

AI 返回的结构化分析：

```
Web 架构分析：
- 路由：React Router v6，路由定义在 src/router/
- 状态管理：Zustand，store 定义在 src/store/
- 组件层次：App → Layout → Page → Section → Component
- 通信：WebSocket 实时消息 + REST API 配置管理
```

**Gateway 架构**

Gateway 是系统的入口，负责请求路由、认证、限流等：

```bash
# 使用 Claude Code 分析 Gateway
claude "分析 src/gateway/ 目录的代码，梳理 Gateway 的核心流程：
1. 请求如何从入口到达具体的 Channel
2. 认证和鉴权的实现方式
3. WebSocket 连接的生命周期管理"
```

典型的 Gateway 请求流程：

```
Client Request → HTTP/WebSocket → Gateway Router
    → Auth Middleware (JWT 验证)
    → Rate Limiter (限流)
    → Channel Router (分发到对应 Channel)
    → Channel Handler (处理请求)
    → Response
```

**Channel 架构**

Channel 是平台适配层，每个 Channel 对应一个聊天平台（Discord、Telegram、微信等）：

```
src/channel/
├── base/          # Channel 基类，定义通用接口
├── discord/       # Discord Channel 实现
├── telegram/      # Telegram Channel 实现
├── wechat/        # 微信 Channel 实现
├── webchat/       # Web 聊天 Channel 实现
└── factory.ts     # Channel 工厂，根据配置创建实例
```

关键接口定义：

```typescript
interface IChannel {
  // 启动 Channel，建立与平台的连接
  start(): Promise<void>;
  
  // 停止 Channel，断开连接
  stop(): Promise<void>;
  
  // 发送消息到平台
  sendMessage(chatId: string, content: string): Promise<void>;
  
  // 接收平台消息的回调
  onMessage(handler: MessageHandler): void;
}
```

**Agent 架构**

Agent 是 AI 逻辑的核心，负责理解用户意图、调用工具、管理记忆：

```
src/agent/
├── core/          # Agent 核心，消息处理循环
├── tools/         # 工具定义和执行
├── memory/        # 对话记忆管理
├── prompts/       # 系统 Prompt 管理
└── skills/        # 技能扩展
```

Agent 处理流程：

```
用户消息 → Agent Loop
  → 1. 加载上下文（历史消息 + 记忆 + 系统提示）
  → 2. 调用 LLM 生成回复
  → 3. 解析工具调用（如有）
  → 4. 执行工具并获取结果
  → 5. 将结果反馈给 LLM 继续生成
  → 6. 返回最终回复给用户
```

---

## 6.4 规范文档校验与开源项目升级

**规范文档校验**

二次开发必须遵循原有项目的规范。使用 AI 自动校验代码是否符合项目规范：

```bash
# 校验新增代码是否符合项目规范
claude "检查 src/channel/feishu/ 目录下我新增的代码，是否符合以下规范：
1. TypeScript strict mode
2. 异步操作使用 async/await
3. 错误处理使用 try/catch 并记录日志
4. 导出遵循项目的 barrel export 模式
5. 测试文件与源文件同级放置"
```

AI 会逐项检查并给出修改建议。这种自动化的规范校验比人工 Code Review 更高效，尤其在规范条目较多时。

**开源项目升级**

二次开发常常面临一个两难：如何在不丢失自定义修改的前提下同步上游更新？

推荐策略：Fork + Rebase

1. 将原项目 Fork 到自己的仓库
2. 在 Fork 上创建开发分支，进行二次开发
3. 定期从上游同步更新，使用 Rebase 保持提交历史整洁

```bash
# 添加上游仓库
git remote add upstream https://github.com/openclaw/openclaw.git

# 同步上游更新
git fetch upstream
git rebase upstream/main

# 解决冲突（如有）
git mergetool

# 继续变基
git rebase --continue
```

升级后的验证：

```bash
# 运行项目测试套件
npm run test

# 运行类型检查
npm run typecheck

# 运行 Lint
npm run lint
```

---

## 6.5 接入自定义模型与自定义 Channel

**接入自定义模型**

小龙虾默认支持 OpenAI 和 Anthropic 模型，如果需要接入自定义模型（如 DeepSeek、本地部署的 Ollama），需要实现 Model Provider 接口：

```typescript
// src/agent/models/custom-provider.ts

export class CustomModelProvider implements IModelProvider {
  constructor(private config: CustomModelConfig) {}

  async chat(messages: Message[], options: ChatOptions): Promise<string> {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.modelName,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 4096,
      }),
    });

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async stream(messages: Message[], options: ChatOptions): AsyncIterable<string> {
    // 流式响应实现
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.modelName,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  }
}
```

注册自定义模型到配置：

```yaml
# config/models.yaml
models:
  deepseek:
    provider: custom
    endpoint: https://api.deepseek.com/v1/chat/completions
    modelName: deepseek-chat
    apiKey: ${DEEPSEEK_API_KEY}
```

**接入自定义 Channel**

以接入飞书（Feishu）为例，实现 IChannel 接口：

```typescript
// src/channel/feishu/index.ts

export class FeishuChannel implements IChannel {
  private client: FeishuClient;
  private messageHandler?: MessageHandler;

  constructor(config: FeishuConfig) {
    this.client = new FeishuClient(config);
  }

  async start(): Promise<void> {
    // 1. 获取飞书访问令牌
    await this.client.authenticate();
    
    // 2. 注册事件回调
    this.client.on('message', (event) => {
      this.handleMessage(event);
    });
    
    // 3. 启动长连接
    await this.client.startLongPolling();
  }

  async stop(): Promise<void> {
    this.client.disconnect();
  }

  async sendMessage(chatId: string, content: string): Promise<void> {
    await this.client.sendMessage({
      receiveId: chatId,
      msgType: 'text',
      content: JSON.stringify({ text: content }),
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  private handleMessage(event: FeishuEvent): void {
    const message: ChannelMessage = {
      chatId: event.message.chat_id,
      userId: event.sender.sender_id.user_id,
      content: event.message.content,
      timestamp: event.header.create_time,
    };
    this.messageHandler?.(message);
  }
}
```

注册自定义 Channel：

```yaml
# config/channels.yaml
channels:
  feishu:
    type: feishu
    appId: ${FEISHU_APP_ID}
    appSecret: ${FEISHU_APP_SECRET}
    enabled: true
```

---

## 6.6 接入自定义 Agent Skills 与项目总结

**Skills 扩展机制**

Skills 是小龙虾的技能扩展机制，允许为 Agent 添加新能力而不修改核心代码。每个 Skill 是一个独立模块，包含：

- `SKILL.md`：技能描述和触发条件
- `index.ts`：技能实现代码
- `test.ts`：技能测试

创建自定义 Skill 示例——天气查询：

```typescript
// src/agent/skills/weather/index.ts

export class WeatherSkill implements ISkill {
  name = 'weather';
  description = '查询指定城市的天气信息';
  triggers = ['天气', 'weather', '气温', '温度'];

  async execute(params: { city: string }): Promise<string> {
    const response = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${params.city}`
    );
    const data = await response.json();
    
    return `${data.location.name}当前天气：${data.current.temp_c}°C，${data.current.condition.text}，湿度 ${data.current.humidity}%`;
  }
}
```

SKILL.md：

```markdown
# Weather Skill

## Description
查询指定城市的实时天气信息

## Triggers
当用户消息中包含"天气"、"weather"、"气温"等关键词时触发

## Parameters
- city: 城市名称（必需）

## Examples
- "北京今天天气怎么样" → 查询北京天气
- "上海气温" → 查询上海气温
```

**项目总结**

| 维度 | 成果 | 经验 |
|------|------|------|
| 架构理解 | 2小时完成四层架构梳理 | AI 辅助架构理解效率远超手动读码 |
| Rules 沉淀 | 完整的 .cursorrules 文件 | Rules 是二次开发的知识锚点，持续更新 |
| 自定义模型 | DeepSeek 接入完成 | 实现 IModelProvider 接口即可扩展 |
| 自定义 Channel | 飞书 Channel 接入完成 | IChannel 接口标准化，新平台接入成本可控 |
| 自定义 Skill | 天气查询 Skill | 独立模块化，不影响核心代码 |
| 开发效率 | 总计 5 人天 | 比传统方式快 3 倍，关键在于理解成本降低 |

关键经验：

1. Rules 沉淀是二次开发的生命线，不沉淀 Rules 等于白做
2. 架构梳理用 AI 做，但验证要人工——AI 可能遗漏关键约束
3. 自定义扩展遵循接口约定，不要修改核心代码
4. 开源项目升级用 Rebase 策略，保持与上游同步的能力
5. MVP 先行：先做最小化验证，确认可行后再扩展

---

**本章小结**

| 步骤 | 核心要点 |
|------|---------|
| 设计思路 | 先理解再修改后沉淀，最小化修改降低风险 |
| Rules 沉淀 | .cursorrules 文件浓缩项目关键信息，AI 每次交互的速查手册 |
| 架构梳理 | AI 辅助快速理解四层架构，比手动读码效率高数倍 |
| 规范校验 | AI 自动校验代码规范，比人工 Review 更高效 |
| 自定义扩展 | Model/Channel/Skill 三种扩展机制，遵循接口约定 |
| 升级策略 | Fork + Rebase，定期同步上游，保持可升级能力 |

通过三个实战项目，你已经掌握了 Vibe Coding 在不同场景下的开发方法。下一章，我们进入理论深水区——系统学习 Harness Engineering 驾驭工程，理解如何让 AI 编程从"碰运气"变为"可控的工程"。
