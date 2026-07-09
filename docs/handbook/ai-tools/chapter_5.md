# 第5章 AI开发工具——编程助手的开源选择

GitHub Copilot每月10美元，这5个开源工具免费替代。

我是怕浪猫，AI提效工具系列第5章。这章给开发者朋友写的——AI编程助手的开源方案。

## 5.1 Continue：VS Code与JetBrains的开源AI编程助手

Continue是2025年最成熟的开源AI编程助手，GitHub星标超2.2万。

**四大核心功能**

| 功能 | 说明 | 快捷键 |
|------|------|--------|
| Chat | 侧边栏与AI对话，理解代码上下文 | Cmd+L |
| Autocomplete | 实时代码补全 | 自动触发 |
| Edit | 自然语言指令直接修改代码 | Cmd+I |
| Actions | 快捷操作（解释/重构/测试） | 右键菜单 |

**模型支持**

| 模型类型 | 示例 | 用途 |
|---------|------|------|
| 商业API | GPT-4o/Claude/Gemini | 最高质量 |
| 国产API | DeepSeek/Qwen/智谱 | 性价比高 |
| 本地模型 | Ollama/LM Studio | 隐私+免费 |
| 自定义 | 任何OpenAI兼容API | 灵活配置 |

**Continue vs GitHub Copilot**

| 维度 | Continue | Copilot |
|------|----------|---------|
| 价格 | 免费 | $10/月 |
| 模型选择 | 任意 | 固定 |
| IDE支持 | VS Code/JetBrains | VS Code/JetBrains |
| 代码补全 | 有 | 有 |
| 对话 | 有 | 有 |
| 代理能力 | 有（Agent模式） | 有 |
| 隐私 | 可全本地 | 云端 |
| 自定义 | 高 | 低 |
| 上手难度 | 中 | 低 |

> Continue的最大优势是"模型自由"。你可以用DeepSeek（便宜）做日常补全，用Claude（强）做复杂重构，用本地模型处理敏感代码。

**配置指南**

| 配置项 | 说明 | 示例 |
|--------|------|------|
| Chat Model | 对话用模型 | deepseek/deepseek-chat |
| Autocomplete Model | 补全用模型 | qwen2.5-coder:7b（本地） |
| Embeddings Model | 代码库索引 | nomic-embed-text |
| Context Providers | 上下文来源 | file/codebase/git |
| Slash Commands | 自定义命令 | /test /review /doc |

## 5.2 Cline：自主代理式编程工具

Cline（原Claude Dev）是另一种思路的AI编程工具——它不只是补全，而是自主完成任务。

**核心差异**

| 维度 | Continue | Cline |
|------|----------|-------|
| 工作方式 | 辅助式（你写+AI补全） | 代理式（AI写+你审查） |
| 自主性 | 低 | 高 |
| 文件操作 | 建议→你执行 | 直接创建/修改文件 |
| 终端 | 不执行 | 可执行命令 |
| 浏览器 | 无 | 可打开网页 |
| 适合 | 日常编码 | 明确任务委托 |

**Cline工作流程**

```
你描述任务 → Cline分析 → 读文件 → 写代码 → 运行测试 → 修复错误 → 完成交付
```

| 阶段 | Cline操作 | 你的操作 |
|------|-----------|---------|
| 1. 接收任务 | 理解需求，规划步骤 | 描述任务 |
| 2. 探索代码 | 读取相关文件 | 等待 |
| 3. 编写代码 | 创建/修改文件 | 审查diff |
| 4. 执行测试 | 运行测试命令 | 确认结果 |
| 5. 修复问题 | 分析错误，修改代码 | 确认修复 |
| 6. 完成 | 总结变更 | 最终审查 |

**Cline配置**

| 配置项 | 说明 |
|--------|------|
| API Provider | OpenAI Compatible/Anthropic/Ollama |
| Base URL | API地址（如硅基流动） |
| API Key | 密钥 |
| Model ID | 模型名（如deepseek-ai/DeepSeek-R1） |
| 自动执行 | 是否自动运行命令 |
| 工作目录 | 项目路径 |

> Cline + DeepSeek-R1 = 免费的自主编程代理。效果不如Claude，但性价比无敌。

## 5.3 LocalAI：本地运行大模型的开源方案

LocalAI是一个完整的本地AI推理服务器，API完全兼容OpenAI。

**核心特性**

| 功能 | 说明 |
|------|------|
| 文本生成 | 兼容OpenAI Chat API |
| 代码补全 | 兼容OpenAI Completion API |
| 图像生成 | 兼容DALL-E API |
| 语音转文字 | 兼容Whisper API |
| 文字转语音 | 兼容TTS API |
| 嵌入向量 | 兼容Embeddings API |
| 硬件 | CPU即可运行，无需GPU |
| 部署 | Docker一行命令 |

**LocalAI vs Ollama**

| 维度 | LocalAI | Ollama |
|------|---------|--------|
| 定位 | 全功能AI服务器 | LLM运行器 |
| 模型格式 | GGUF/GGML/自定义 | GGUF |
| API兼容 | OpenAI全套 | OpenAI Chat |
| 图像生成 | 支持 | 不支持 |
| 语音 | 支持 | 不支持 |
| 硬件要求 | CPU可跑 | CPU可跑 |
| 易用性 | 中 | 高 |
| 适合 | 全栈AI本地化 | 纯文本模型 |

> 只需要跑文本模型→选Ollama（更简单）。需要图像/语音/嵌入全套→选LocalAI（更全面）。

## 5.4 开源代码模型：DeepSeek-Coder与CodeLlama

**模型对比**

| 模型 | 参数量 | 显存(4bit) | 编程能力 | 中文 | 许可证 |
|------|--------|-----------|---------|------|--------|
| DeepSeek-Coder-V2-Lite | 16B | 10GB | 优秀 | 优秀 | MIT |
| DeepSeek-R1-Distill-Qwen-7B | 7B | 5GB | 好 | 优秀 | MIT |
| Qwen2.5-Coder-7B | 7B | 5GB | 好 | 优秀 | Apache 2.0 |
| Qwen2.5-Coder-32B | 32B | 18GB | 优秀 | 优秀 | Apache 2.0 |
| CodeLlama-7B | 7B | 5GB | 中 | 中 | Llama 2 |
| CodeLlama-34B | 34B | 20GB | 好 | 中 | Llama 2 |
| StarCoder2-15B | 15B | 9GB | 好 | 中 | BigCode |

**HumanEval得分对比**

| 模型 | 得分 | 说明 |
|------|------|------|
| DeepSeek-Coder-V2-Lite | 81.1% | 开源最强之一 |
| Qwen2.5-Coder-32B | 78.0% | Apache协议友好 |
| DeepSeek-R1-7B | 73.5% | 性价比高 |
| CodeLlama-34B | 67.8% | Meta出品 |
| StarCoder2-15B | 72.6% | 多语言支持好 |

> 2025年开源代码模型首选：DeepSeek（能力最强）或Qwen2.5-Coder（协议最友好）。CodeLlama已经落后。

## 5.5 实战：用Continue+DeepSeek搭建免费编程助手

**完整搭建流程**

| 步骤 | 操作 | 说明 |
|------|------|------|
| 1. 安装Ollama | ollama pull deepseek-coder-v2:16b | 下载代码模型 |
| 2. 安装Continue | VS Code扩展商店搜索"Continue" | 安装插件 |
| 3. 配置Chat模型 | 选择Ollama→选deepseek-coder-v2 | 对话用 |
| 4. 配置补全模型 | 选择Ollama→选qwen2.5-coder:7b | 补全用（更快） |
| 5. 配置嵌入 | 选择Ollama→nomic-embed-text | 代码库索引 |
| 6. 测试 | 打开项目，Cmd+L对话 | 验证工作 |

**配置文件示例（config.json）**

```json
{
  "models": [
    {
      "title": "DeepSeek Coder V2",
      "provider": "ollama",
      "model": "deepseek-coder-v2:16b"
    }
  ],
  "tabAutocompleteModel": {
    "title": "Qwen2.5 Coder 7B",
    "provider": "ollama",
    "model": "qwen2.5-coder:7b"
  },
  "embeddingsProvider": {
    "provider": "ollama",
    "model": "nomic-embed-text"
  }
}
```

**效率对比**

| 任务 | 无AI辅助 | Continue+本地模型 | Continue+Claude API |
|------|---------|------------------|-------------------|
| 写一个函数 | 2分钟 | 30秒 | 15秒 |
| 添加单元测试 | 10分钟 | 3分钟 | 1分钟 |
| 代码审查 | 15分钟 | 5分钟 | 3分钟 |
| Bug修复 | 30分钟 | 10分钟 | 5分钟 |
| 重构 | 1小时 | 20分钟 | 10分钟 |

**成本对比**

| 方案 | 月成本 | 隐私 | 质量 |
|------|--------|------|------|
| GitHub Copilot | $10 | 云端 | 高 |
| Continue + 本地模型 | $0（电费） | 完全本地 | 中高 |
| Continue + DeepSeek API | ~$2-5 | 云端 | 高 |
| Continue + Claude API | ~$10-20 | 云端 | 最高 |

> 本地模型适合隐私敏感+日常编码，API方案适合复杂任务。Continue的模型切换功能让你两者兼顾。

---

你用过哪些AI编程工具？体验如何？评论区交流一下。

收藏这章，5款开源编程工具的对比表和配置指南随时查阅。

关注怕浪猫，下期做全场景工具链路整合——从创意到交付的完整AI工作流。

系列进度 5/8 — 下一篇：全场景工具链与选型决策
