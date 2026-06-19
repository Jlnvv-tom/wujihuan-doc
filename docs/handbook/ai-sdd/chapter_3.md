# 第3章 开发环境准备：从零搭建全栈工程环境

环境搭建是全栈开发的第一道门槛，也是 Vibe Coding 实践的基础设施。AI 编程工具再强大，如果本地环境配置不完整、依赖缺失、运行时版本冲突，一切都是空谈。本章从 AI 编程 IDE 的安装配置开始，逐步搭建 Repo Wiki、前后端运行环境，最终完成环境验收，确保后续实战能够顺畅推进。

---

## 3.1 AI 编程 IDE 实操安装与配置

**Cursor 安装**

Cursor 是当前最流行的 AI 原生 IDE，基于 VS Code 内核构建，对 VS Code 扩展生态完全兼容。

1. 下载安装包：https://cursor.com

2. 安装完成后首次启动，选择配置方式：

- 从 VS Code 导入配置（推荐）：自动继承已有的主题、快捷键、扩展
- 全新配置：适合没有 VS Code 使用经验的开发者

3. 登录账号：使用 Google 或 GitHub 账号登录 Cursor，激活 AI 功能

4. 模型配置：

打开 Settings > Models，配置默认使用的 AI 模型：

- Claude 3.5 Sonnet：推荐作为日常开发默认模型
- GPT-4o：适合需要强推理能力的场景
- 本地模型：如需离线使用，可配置 Ollama 本地模型

5. 关键快捷键配置：

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| Cmd+K | 行内编辑 | 选中代码后，用自然语言描述修改意图 |
| Cmd+L | 打开 Chat | 在侧边栏打开 AI 对话面板 |
| Cmd+I | Composer 模式 | 多文件编辑模式，适合跨文件修改 |
| Tab | 接受补全 | 接受 AI 的代码补全建议 |
| Esc | 拒绝补全 | 拒绝当前的补全建议 |

**Claude Code 安装**

Claude Code 作为命令行工具，安装方式已在第2章详述，此处补充项目级配置：

在项目根目录创建 `.claude/` 目录，用于存放 Claude Code 的项目配置：

```bash
mkdir -p .claude
```

创建 `CLAUDE.md` 文件，作为 Claude Code 的项目级上下文：

```markdown
# Project Context

## Tech Stack
- Frontend: React 18 + TypeScript + Vite
- Backend: Spring Boot 3 + Spring AI + PostgreSQL
- Cache: Redis 7

## Code Conventions
- API routes follow RESTful conventions
- Use camelCase for JavaScript/TypeScript
- Use snake_case for Python and database columns
- All API responses follow { code, message, data } format

## Key Directories
- src/main/java/com/project/ - Backend source
- src/frontend/src/ - Frontend source
```

这份文件会在每次 Claude Code 交互时自动加载为上下文，确保 AI 生成的代码符合项目规范。

---

## 3.2 Repo Wiki 的核心作用与构建方法

**为什么需要 Repo Wiki**

Vibe Coding 的核心挑战之一是上下文管理。AI 模型无法自动"理解"项目全貌，它需要一份结构化的项目知识库作为参考。Repo Wiki 就是这份知识库，它将项目的架构、技术栈、编码规范、关键决策等信息以结构化文档的形式存储在代码仓库中。

Repo Wiki 的价值体现在三个层面：

1. **为 AI 提供上下文**：每次交互前，AI 会读取 Repo Wiki，理解项目全貌
2. **为团队提供共识**：新成员通过 Repo Wiki 快速了解项目，减少沟通成本
3. **为 SDD 提供基础**：Spec 文档的撰写需要以 Repo Wiki 中的架构信息为参考

**Repo Wiki 的结构**

推荐在项目根目录创建 `docs/wiki/` 目录，包含以下文件：

```
docs/wiki/
├── ARCHITECTURE.md     # 系统架构文档
├── TECH_STACK.md       # 技术栈说明
├── CONVENTIONS.md      # 编码规范
├── API_SPEC.md         # API 接口规范
├── DATA_MODEL.md       # 数据模型文档
├── DECISIONS.md        # 关键技术决策记录
└── GLOSSARY.md         # 术语表
```

**核心文件内容示例**

ARCHITECTURE.md：

```markdown
# System Architecture

## Overview
This project follows a three-tier architecture:
- Frontend Layer: React SPA
- API Layer: Spring Boot REST API
- Data Layer: PostgreSQL + Redis Cache

## Module Dependencies
Frontend → API Gateway → Business Services → Data Access Layer → Database

## Key Design Decisions
- Use event-driven architecture for async operations
- Implement CQRS pattern for read-heavy modules
```

**用 AI 自动生成 Repo Wiki**

利用 Cursor 或 Claude Code，可以快速为已有项目生成 Repo Wiki：

```bash
# 使用 Claude Code 生成架构文档
claude "分析当前项目的代码结构，生成 ARCHITECTURE.md 文档，包含模块划分、依赖关系和数据流"
```

AI 会自动扫描项目结构，分析模块依赖，生成结构化的架构文档。这一过程通常只需几分钟，远快于手动编写。

---

## 3.3 前端多语言运行环境搭建

全栈开发需要同时支撑多种前端技术栈。本节搭建一个灵活的前端运行环境，覆盖 React/Vue/Next.js 等主流框架。

**Node.js 环境管理**

推荐使用 nvm（Node Version Manager）管理 Node.js 版本：

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 安装 LTS 版本
nvm install --lts

# 设置默认版本
nvm alias default node

# 验证安装
node --version
npm --version
```

**包管理器选择**

| 包管理器 | 特点 | 适用场景 |
|---------|------|---------|
| npm | Node.js 自带，兼容性最好 | 简单项目、快速原型 |
| pnpm | 磁盘占用小，安装速度快 | monorepo、多项目共用依赖 |
| yarn | 确定性安装，workspaces 支持 | 团队项目、需要锁定依赖版本 |
| bun | 速度极快，内置打包和测试 | 追求极致性能的项目 |

安装 pnpm 和 bun：

```bash
# 安装 pnpm
npm install -g pnpm

# 安装 bun
curl -fsSL https://bun.sh/install | bash
```

**前端框架项目初始化**

```bash
# React + Vite + TypeScript
pnpm create vite my-react-app --template react-ts

# Vue 3 + Vite + TypeScript
pnpm create vite my-vue-app --template vue-ts

# Next.js 14
npx create-next-app@latest my-nextjs-app --typescript --app

# Nuxt 3
npx nuxi@latest init my-nuxt-app
```

**VS Code / Cursor 推荐扩展**

| 扩展 | 功能 | 必要性 |
|------|------|--------|
| ESLint | 代码质量检查 | 必装 |
| Prettier | 代码格式化 | 必装 |
| TypeScript Vue Plugin | Vue TS 支持 | Vue 项目必装 |
| Tailwind CSS IntelliSense | Tailwind 类名补全 | 使用 Tailwind 时装 |
| Auto Rename Tag | HTML 标签自动重命名 | 推荐安装 |

---

## 3.4 后端多语言运行环境搭建

全栈开发同样需要灵活的后端环境。本节搭建 Java（Spring Boot）和 Python（FastAPI）两大主流后端运行环境。

**Java / Spring Boot 环境**

1. 安装 JDK 17+（推荐使用 SDKMAN 管理版本）：

```bash
# 安装 SDKMAN
curl -s "https://get.sdkman.io" | bash

# 安装 JDK 17
sdk install java 17.0.9-tem

# 验证
java -version
```

2. 安装 Maven 或 Gradle：

```bash
# 安装 Maven
sdk install maven

# 或安装 Gradle
sdk install gradle
```

3. Spring Boot 项目初始化：

```bash
# 使用 Spring Initializr CLI
curl https://start.spring.io/starter.zip \
  -d type=maven-project \
  -d language=java \
  -d bootVersion=3.2.0 \
  -d groupId=com.example \
  -d artifactId=demo \
  -d name=demo \
  -d packageName=com.example.demo \
  -d dependencies=web,data-jpa,postgresql,security \
  -o demo.zip && unzip demo.zip
```

Spring Boot 官方文档：https://spring.io/projects/spring-boot

**Python / FastAPI 环境**

1. 安装 Python 3.11+（推荐使用 pyenv 管理版本）：

```bash
# 安装 pyenv
curl https://pyenv.run | bash

# 安装 Python 3.11
pyenv install 3.11.7
pyenv global 3.11.7

# 验证
python --version
```

2. 创建虚拟环境并安装 FastAPI：

```bash
# 创建项目目录
mkdir my-api && cd my-api

# 创建虚拟环境
python -m venv venv
source venv/bin/activate

# 安装 FastAPI 和 Uvicorn
pip install fastapi uvicorn[standard]
```

3. FastAPI 最小应用：

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}
```

FastAPI 官方文档：https://fastapi.tiangolo.com

**数据库环境**

全栈项目通常需要关系型数据库和缓存：

```bash
# 使用 Docker 快速启动 PostgreSQL 和 Redis
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -e POSTGRES_DB=myapp \
  -p 5432:5432 \
  postgres:16

docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

**数据库管理工具**

推荐安装以下工具辅助数据库操作：

- DBeaver：通用数据库管理客户端
- pgAdmin：PostgreSQL 官方管理工具
- RedisInsight：Redis 官方可视化管理工具
- Prisma Studio：ORM 可视化管理（如使用 Prisma）

---

## 3.5 环境验收与常见问题排查

环境搭建完成后，必须进行系统性的验收，确保所有组件正常工作。

**验收清单**

逐一执行以下命令，确认各组件安装正确：

```bash
# 基础工具
node --version          # v18.x+
npm --version           # 9.x+
pnpm --version          # 8.x+

# Java 环境
java -version           # 17.x+
mvn -version            # 3.9.x+

# Python 环境
python --version        # 3.11.x+
pip --version           # 23.x+

# 数据库连接
psql -h localhost -U postgres -c "SELECT version();"  # PostgreSQL
redis-cli ping          # 应返回 PONG

# Docker 环境
docker --version        # 24.x+
docker compose version  # 2.x+

# AI 工具
claude --version        # Claude Code
cursor --version        # Cursor CLI（如安装）
```

**常见问题与解决方案**

问题一：Node.js 版本冲突

```bash
# 症状：运行项目时报 "unsupported engine" 错误
# 原因：项目要求的 Node.js 版本与当前版本不匹配
# 解决：使用 nvm 切换版本
nvm install 18
nvm use 18
```

问题二：Python 虚拟环境未激活

```bash
# 症状：pip install 安装到全局环境
# 原因：忘记激活虚拟环境
# 解决：每次进入项目先激活
source venv/bin/activate  # macOS/Linux
venv\Scripts\activate     # Windows
```

问题三：Docker 容器端口冲突

```bash
# 症状：docker run 报 "port is already allocated"
# 原因：端口被其他进程占用
# 解决：查找并释放端口
lsof -i :5432    # 查找占用 5432 端口的进程
kill -9 <PID>    # 终止进程
```

问题四：Maven 依赖下载缓慢

```bash
# 症状：mvn install 长时间卡在下载依赖
# 原因：默认使用中央仓库，国内访问慢
# 解决：配置阿里云镜像
# 编辑 ~/.m2/settings.xml，添加：
```

```xml
<mirror>
  <id>aliyun</id>
  <mirrorOf>central</mirrorOf>
  <url>https://maven.aliyun.com/repository/central</url>
</mirror>
```

问题五：Claude Code API 连接失败

```bash
# 症状：claude 命令报 "connection refused" 或 "authentication failed"
# 原因：API Key 未配置或网络问题
# 解决：
# 1. 检查 API Key 是否正确
echo $ANTHROPIC_API_KEY

# 2. 检查网络连接
curl -I https://api.anthropic.com

# 3. 如使用代理，配置环境变量
export HTTPS_PROXY=http://127.0.0.1:7890
```

**环境一键验收脚本**

创建 `scripts/check-env.sh`，将所有验收项整合为一个脚本：

```bash
#!/bin/bash

echo "=== Environment Check ==="

check_command() {
  if command -v $1 &> /dev/null; then
    echo "[OK] $1: $(command -v $1)"
  else
    echo "[MISSING] $1 is not installed"
  fi
}

check_command node
check_command npm
check_command pnpm
check_command java
check_command mvn
check_command python3
check_command docker
check_command claude

echo ""
echo "=== Service Check ==="

# Check PostgreSQL
if pg_isready -h localhost -p 5432 &> /dev/null; then
  echo "[OK] PostgreSQL is running"
else
  echo "[WARN] PostgreSQL is not running"
fi

# Check Redis
if redis-cli ping &> /dev/null; then
  echo "[OK] Redis is running"
else
  echo "[WARN] Redis is not running"
fi

echo ""
echo "=== Environment Check Complete ==="
```

```bash
chmod +x scripts/check-env.sh
./scripts/check-env.sh
```

运行此脚本后，所有项显示 `[OK]` 即表示环境准备就绪，可以进入后续的实战开发。

---

**本章小结**

| 环节 | 核心要点 |
|------|---------|
| AI IDE 安装 | Cursor 为主力编辑器，Claude Code 为终端辅助，CLAUDE.md 提供项目级上下文 |
| Repo Wiki | 为 AI 提供项目上下文，结构化存储架构、规范、决策，可由 AI 自动生成 |
| 前端环境 | nvm 管理 Node.js 版本，pnpm/bun 提升包管理效率，按需初始化框架项目 |
| 后端环境 | SDKMAN 管理 JDK，pyenv 管理 Python，Docker 快速启动数据库和缓存 |
| 环境验收 | 逐一验证各组件安装和服务状态，准备验收脚本实现一键检查 |

下一章，我们将进入第一个实战项目——用 Vibe Coding 从零搭建一个 ChatBot，完整体验从需求梳理到交付验收的全流程。
