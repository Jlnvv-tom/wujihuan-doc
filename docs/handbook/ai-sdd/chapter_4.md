# 第4章 Vibe Coding 快速实战：ChatBot 从 0 到 1

理论讲了三章，现在开始动手。本章用一个 ChatBot 项目带你走完 Vibe Coding 的完整流程：设定开发目标、梳理需求、拆分任务、搭建项目、编写前后端代码、联调优化，最终交付一个可运行的对话机器人。这是你第一次完整体验 AI 驱动全栈开发的全流程，重点不在代码多复杂，而在于感受 Vibe Coding 的开发节奏和效率。

---

## 4.1 开发目标设定与需求梳理

**设定开发目标**

任何项目的第一步都是明确目标。我们这个 ChatBot 项目的目标是：

构建一个基于大模型的对话机器人 Web 应用，支持多轮对话、上下文记忆、Markdown 渲染，用户可以通过浏览器与 AI 进行自然语言交互。

核心功能：

- 多轮对话：支持连续提问，AI 记住上下文
- 流式响应：AI 回复逐字显示，提升交互体验
- Markdown 渲染：AI 回复中的代码块、列表、表格正确渲染
- 对话管理：支持创建新对话、查看历史对话列表
- 模型切换：支持选择不同的 AI 模型

非功能需求：

- 响应时间：首 Token 延迟 < 2 秒
- 并发能力：支持 10 用户同时使用
- 部署方式：Docker 容器化部署

**需求梳理**

用 Vibe Coding 的方式，我们将需求梳理的过程也交给 AI 辅助。在 Cursor 中打开 Chat 面板：

```
我需要构建一个 ChatBot Web 应用，核心功能包括多轮对话、流式响应、
Markdown 渲染、对话管理和模型切换。请帮我梳理需求，列出功能清单
和技术方案建议。
```

AI 会返回一个结构化的需求清单，我们在此基础上进行补充和调整。这个过程的要点是：人类负责确定方向和边界，AI 负责展开细节和发现遗漏。

---

## 4.2 需求拆分与任务规划

需求梳理完成后，需要将其拆分为可执行的开发任务。这一步是 Vibe Coding 效率的关键——任务拆得越精确，AI 生成的代码质量越高。

**按模块拆分**

将需求按前后端模块拆分：

后端任务：

| 编号 | 任务 | 优先级 | 预估时间 |
|------|------|--------|---------|
| B1 | Spring Boot 项目初始化 + 配置 | P0 | 10min |
| B2 | 对话管理接口（创建/列表/详情） | P0 | 15min |
| B3 | AI 对话接口（流式响应） | P0 | 20min |
| B4 | 上下文记忆管理 | P1 | 15min |
| B5 | 模型切换支持 | P2 | 10min |

前端任务：

| 编号 | 任务 | 优先级 | 预估时间 |
|------|------|--------|---------|
| F1 | React + Vite 项目初始化 | P0 | 5min |
| F2 | 对话界面布局和样式 | P0 | 15min |
| F3 | 消息列表和 Markdown 渲染 | P0 | 15min |
| F4 | 流式响应处理 | P0 | 10min |
| F5 | 对话管理（新建/切换/列表） | P1 | 10min |
| F6 | 模型选择器 | P2 | 5min |

**任务依赖关系**

```
B1 → B2 → B3 → B4
                 ↘ B5

F1 → F2 → F3 → F4
                 ↘ F5 → F6
```

后端 B3 完成后，前端 F4 才能联调。这种依赖关系在任务规划时就要明确，避免并行开发时的接口不匹配。

---

## 4.3 项目搭建与工程初始化

**后端项目搭建**

使用 Claude Code 快速搭建 Spring Boot 项目：

```bash
# 在项目根目录执行
claude "创建一个 Spring Boot 3 项目，包含以下依赖：
- Spring Web
- Spring AI (OpenAI)
- Lombok
- PostgreSQL Driver

项目结构遵循 Controller-Service-Repository 分层架构，
包名为 com.example.chatbot"
```

Claude Code 会自动生成项目骨架，包含：

```
chatbot-server/
├── pom.xml
├── src/main/java/com/example/chatbot/
│   ├── ChatbotApplication.java
│   ├── controller/
│   ├── service/
│   ├── repository/
│   ├── model/
│   └── config/
└── src/main/resources/
    ├── application.yml
    └── schema.sql
```

关键配置文件 `application.yml`：

```yaml
server:
  port: 8080

spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o
          temperature: 0.7

  datasource:
    url: jdbc:postgresql://localhost:5432/chatbot
    username: postgres
    password: secret
```

**前端项目搭建**

```bash
# 使用 Vite 创建 React + TypeScript 项目
pnpm create vite chatbot-client --template react-ts

cd chatbot-client

# 安装核心依赖
pnpm add react-markdown remark-gfm
pnpm add -D @types/react
```

项目结构：

```
chatbot-client/
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── ChatWindow.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageInput.tsx
│   │   └── Sidebar.tsx
│   ├── hooks/
│   │   └── useChat.ts
│   ├── services/
│   │   └── api.ts
│   └── types/
│       └── index.ts
└── package.json
```

---

## 4.4 前端工程开发

**核心组件实现**

在 Cursor 中，通过 Composer 模式（Cmd+I）一次性生成多个组件文件。以下是关键组件的实现思路。

对话窗口组件 ChatWindow.tsx：

```tsx
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface ChatWindowProps {
  conversationId: string;
  onSendMessage: (content: string) => void;
}

export function ChatWindow({ conversationId, onSendMessage }: ChatWindowProps) {
  return (
    <div className="flex flex-col h-full">
      <MessageList conversationId={conversationId} />
      <MessageInput onSend={onSendMessage} />
    </div>
  );
}
```

消息列表组件 MessageList.tsx：

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[80%] rounded-lg p-3 ${
            msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'
          }`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content}
            </ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}
```

**流式响应处理**

流式响应是 ChatBot 体验的核心。使用 Fetch API 读取 SSE（Server-Sent Events）流：

```typescript
export async function streamChat(
  conversationId: string,
  message: string,
  onChunk: (chunk: string) => void
) {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId, message }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value));
  }
}
```

---

## 4.5 后端工程开发与前后端联调

**后端核心接口**

对话控制器 ChatController.java：

```java
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    @PostMapping("/stream")
    public Flux<ServerSentEvent<String>> streamChat(
            @RequestBody ChatRequest request) {
        return chatService.streamChat(request)
                .map(chunk -> ServerSentEvent.<String>builder()
                        .data(chunk)
                        .build());
    }

    @PostMapping("/conversations")
    public Conversation createConversation() {
        return chatService.createConversation();
    }

    @GetMapping("/conversations")
    public List<Conversation> listConversations() {
        return chatService.listConversations();
    }
}
```

对话服务 ChatService.java：

```java
@Service
public class ChatService {

    private final ChatClient chatClient;
    private final ConversationRepository conversationRepo;

    public Flux<String> streamChat(ChatRequest request) {
        List<Message> history = getHistory(request.getConversationId());
        history.add(new UserMessage(request.getMessage()));

        return chatClient.prompt()
                .messages(history)
                .stream()
                .content();
    }
}
```

**前后端联调**

1. 启动后端服务：

```bash
cd chatbot-server
mvn spring-boot:run
```

2. 启动前端开发服务器：

```bash
cd chatbot-client
pnpm dev
```

3. 配置代理解决跨域问题，在 `vite.config.ts` 中添加：

```typescript
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
```

4. 在浏览器中打开 http://localhost:5173，测试对话功能

**联调常见问题**

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 流式响应不显示 | 前端未正确处理 SSE | 检查 streamChat 函数的 reader 逻辑 |
| 上下文丢失 | 后端未正确传递历史消息 | 检查 ChatService 中 history 拼接 |
| Markdown 不渲染 | 缺少 remark-gfm 插件 | 确认 react-markdown + remark-gfm 已安装 |
| 跨域报错 | Vite 代理未配置 | 添加 vite.config.ts 中的 proxy 配置 |

---

## 4.6 效果优化与交付验收

**UI 优化**

使用 Cursor 的行内编辑（Cmd+K）快速优化界面细节：

- 添加消息加载动画（打字机效果）
- 优化代码块样式（语法高亮）
- 添加侧边栏对话列表
- 移动端响应式适配

代码块语法高亮安装：

```bash
pnpm add react-syntax-highlighter
pnpm add -D @types/react-syntax-highlighter
```

```tsx
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 在 ReactMarkdown 的 components 配置中
components={{
  code({ node, inline, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <SyntaxHighlighter style={oneDark} language={match[1]} PreTag="div">
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className={className} {...props}>{children}</code>
    );
  }
}}
```

**性能优化**

1. 对话消息虚拟滚动（消息量大时避免卡顿）

```bash
pnpm add react-virtuoso
```

2. 后端添加 Redis 缓存对话历史

3. 流式响应添加超时和错误重试机制

**交付验收**

验收标准：

| 验收项 | 标准 | 验证方式 |
|--------|------|---------|
| 多轮对话 | 连续 5 轮对话，AI 正确引用上下文 | 手动测试 |
| 流式响应 | 首 Token 延迟 < 2 秒，逐字显示 | 浏览器 Network 面板 |
| Markdown 渲染 | 代码块、表格、列表正确显示 | 发送包含多种格式的消息 |
| 对话管理 | 新建/切换/列表功能正常 | 手动测试 |
| Docker 部署 | docker compose up 一键启动 | 执行部署命令 |

Docker 部署配置：

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: ./chatbot-server
    ports:
      - "8080:8080"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - postgres
      - redis

  web:
    build: ./chatbot-client
    ports:
      - "80:80"
    depends_on:
      - app

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: chatbot
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  pgdata:
```

---

**本章小结**

| 步骤 | 核心要点 |
|------|---------|
| 目标设定 | 明确核心功能和非功能需求，AI 辅助展开细节 |
| 需求拆分 | 按前后端模块拆分任务，标注优先级和依赖关系 |
| 项目搭建 | Claude Code 生成后端骨架，Vite 初始化前端项目 |
| 前端开发 | React 组件化开发，SSE 流式响应，Markdown 渲染 |
| 后端联调 | Spring AI 流式接口，Vite 代理解决跨域 |
| 优化交付 | UI 细节打磨，性能优化，Docker 容器化部署验收 |

通过这个 ChatBot 项目，你应该已经感受到 Vibe Coding 的核心节奏：人类负责方向和审查，AI 负责细节和实现。下一章，我们将进入更复杂的实战——用 Codex 构建企业级智能问数据平台。
