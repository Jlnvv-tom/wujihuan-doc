# 第16章 MCP 协议实战：AI 与外部世界的标准接口

Agent 没有手，MCP 就是它的手。

我是怕浪猫，前面15章聊了各种 Agent 框架和平台，今天来搞 MCP——Model Context Protocol，AI 和外部世界的标准接口协议。这是让 AI Agent 真正"能做事"的关键基础设施。

---

## 16.1 MCP 协议核心原理

**MCP 是什么？**

MCP（Model Context Protocol）是 Anthropic 提出的开放协议，定义了 AI 模型和外部工具之间的标准通信方式。

核心架构：

```
┌─────────────┐     MCP协议     ┌─────────────┐
│  AI 应用    │ ←────────────→ │  MCP Server │
│ (Host/Client)│                 │  (工具提供方)│
└─────────────┘                 └──────┬──────┘
                                       │
                                ┌──────▼──────┐
                                │  外部服务    │
                                │ (API/数据库) │
                                └─────────────┘
```

三个核心概念：

1. **Host**：发起连接的 AI 应用（如 Claude Desktop、Cursor）
2. **Client**：和 Server 保持1:1连接的协议客户端
3. **Server**：提供工具、资源和提示词的服务端

**MCP 提供三种能力**

| 能力 | 说明 | 示例 |
|------|------|------|
| Tools | AI 可调用的函数 | 查询天气、执行代码 |
| Resources | AI 可读取的数据 | 文件内容、数据库记录 |
| Prompts | AI 可使用的提示模板 | 特定任务的提示词模板 |

---

## 16.2 MCP Server 开发入门

**用 Python 开发 MCP Server**

```bash
pip install mcp
```

**最简单的 MCP Server**

```python
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("my-tools")

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="get_weather",
            description="获取指定城市的当前天气",
            inputSchema={
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "城市名称"
                    }
                },
                "required": ["city"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    if name == "get_weather":
        city = arguments["city"]
        # 调用天气API
        weather = get_weather_from_api(city)
        return [TextContent(type="text", text=f"{city}：{weather}")]
    
    raise ValueError(f"Unknown tool: {name}")

if __name__ == "__main__":
    import asyncio
    from mcp.server.stdio import stdio_server
    
    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())
    
    asyncio.run(main())
```

**用 TypeScript 开发 MCP Server**

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({
  name: "my-tools",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler("tools/list", async () => ({
  tools: [{
    name: "get_weather",
    description: "获取指定城市的当前天气",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "城市名称" }
      },
      required: ["city"]
    }
  }]
}));

server.setRequestHandler("tools/call", async (request) => {
  if (request.params.name === "get_weather") {
    const city = request.params.arguments.city;
    return {
      content: [{ type: "text", text: `${city}：晴天，25度` }]
    };
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## 16.3 工具、资源与提示词模板

**工具（Tools）**

工具是 MCP 最核心的能力——让 AI 能"做事"。

```python
@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="search_web",
            description="搜索互联网获取信息",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"}
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="execute_code",
            description="执行Python代码并返回结果",
            inputSchema={
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python代码"},
                    "timeout": {"type": "number", "description": "超时秒数"}
                },
                "required": ["code"]
            }
        )
    ]
```

**资源（Resources）**

资源是 AI 可读取的数据源。

```python
@server.list_resources()
async def list_resources():
    return [
        {
            "uri": "file:///data/report.csv",
            "name": "销售报告",
            "description": "2024年月度销售数据",
            "mimeType": "text/csv"
        }
    ]

@server.read_resource()
async def read_resource(uri):
    if uri == "file:///data/report.csv":
        content = open("./data/report.csv").read()
        return content
    raise ValueError(f"Unknown resource: {uri}")
```

**提示词模板（Prompts）**

```python
@server.list_prompts()
async def list_prompts():
    return [
        {
            "name": "code_review",
            "description": "代码审查提示模板",
            "arguments": [
                {"name": "language", "description": "编程语言", "required": True}
            ]
        }
    ]

@server.get_prompt()
async def get_prompt(name, arguments):
    if name == "code_review":
        language = arguments["language"]
        return {
            "messages": [{
                "role": "user",
                "content": f"请审查以下{language}代码，关注安全性、性能和可读性。"
            }]
        }
```

---

## 16.4 实战：数据库 MCP Server

**场景**

开发一个 MCP Server，让 AI 能查询和操作 MySQL 数据库。

```python
from mcp.server import Server
from mcp.types import Tool, TextContent
import pymysql

server = Server("database-tools")

def get_db_connection():
    return pymysql.connect(
        host="localhost",
        user="root",
        password="password",
        database="company"
    )

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="query_database",
            description="执行SQL查询语句（只允许SELECT）",
            inputSchema={
                "type": "object",
                "properties": {
                    "sql": {"type": "string", "description": "SQL查询语句"}
                },
                "required": ["sql"]
            }
        ),
        Tool(
            name="list_tables",
            description="列出数据库中的所有表",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="describe_table",
            description="查看表结构",
            inputSchema={
                "type": "object",
                "properties": {
                    "table": {"type": "string", "description": "表名"}
                },
                "required": ["table"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        if name == "query_database":
            sql = arguments["sql"]
            # 安全检查：只允许SELECT
            if not sql.strip().upper().startswith("SELECT"):
                return [TextContent(type="text", text="错误：只允许SELECT查询")]
            cursor.execute(sql)
            results = cursor.fetchall()
            return [TextContent(type="text", text=str(results))]
        
        elif name == "list_tables":
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            return [TextContent(type="text", text=str(tables))]
        
        elif name == "describe_table":
            cursor.execute(f"DESCRIBE {arguments['table']}")
            schema = cursor.fetchall()
            return [TextContent(type="text", text=str(schema))]
    
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]
    finally:
        conn.close()
```

---

## 16.5 实战：API 调用 MCP Server

**场景**

开发一个 MCP Server，封装常用的 API 调用。

```python
from mcp.server import Server
from mcp.types import Tool, TextContent
import httpx

server = Server("api-tools")

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="call_api",
            description="调用外部API",
            inputSchema={
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": ["GET", "POST", "PUT", "DELETE"]},
                    "url": {"type": "string", "description": "API URL"},
                    "headers": {"type": "object", "description": "请求头"},
                    "body": {"type": "object", "description": "请求体"}
                },
                "required": ["method", "url"]
            }
        ),
        Tool(
            name="translate",
            description="翻译文本",
            inputSchema={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "要翻译的文本"},
                    "target_lang": {"type": "string", "description": "目标语言"}
                },
                "required": ["text", "target_lang"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name, arguments):
    if name == "call_api":
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=arguments["method"],
                url=arguments["url"],
                headers=arguments.get("headers", {}),
                json=arguments.get("body")
            )
            return [TextContent(type="text", text=response.text)]
    
    elif name == "translate":
        # 调用翻译API
        result = await translate_text(arguments["text"], arguments["target_lang"])
        return [TextContent(type="text", text=result)]
```

---

## 16.6 实战：文件系统 MCP Server

**场景**

开发一个 MCP Server，让 AI 能读写文件系统。

```python
import os
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("filesystem-tools")

ALLOWED_DIR = "/workspace"  # 限制可访问的目录

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="read_file",
            description="读取文件内容",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径"}
                },
                "required": ["path"]
            }
        ),
        Tool(
            name="write_file",
            description="写入文件",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "文件路径"},
                    "content": {"type": "string", "description": "文件内容"}
                },
                "required": ["path", "content"]
            }
        ),
        Tool(
            name="list_directory",
            description="列出目录内容",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "目录路径"}
                },
                "required": ["path"]
            }
        )
    ]

def validate_path(path):
    """安全检查：防止路径穿越攻击"""
    abs_path = os.path.abspath(path)
    if not abs_path.startswith(ALLOWED_DIR):
        raise ValueError(f"访问被拒绝：{path} 不在允许的目录内")
    return abs_path

@server.call_tool()
async def call_tool(name, arguments):
    try:
        if name == "read_file":
            path = validate_path(arguments["path"])
            content = open(path, "r").read()
            return [TextContent(type="text", text=content)]
        
        elif name == "write_file":
            path = validate_path(arguments["path"])
            with open(path, "w") as f:
                f.write(arguments["content"])
            return [TextContent(type="text", text=f"文件写入成功：{path}")]
        
        elif name == "list_directory":
            path = validate_path(arguments["path"])
            entries = os.listdir(path)
            return [TextContent(type="text", text="\n".join(entries))]
    
    except ValueError as e:
        return [TextContent(type="text", text=f"安全错误：{str(e)}")]
    except Exception as e:
        return [TextContent(type="text", text=f"错误：{str(e)}")]
```

> 文件系统 MCP Server 的核心风险是"路径穿越攻击"。必须做路径校验，限制可访问的目录范围。AI 是不可信的输入源。

---

## 16.7 MCP 生态与未来展望

**现有 MCP 生态**

| 类别 | Server | 功能 |
|------|--------|------|
| 数据库 | @modelcontextprotocol/server-postgres | PostgreSQL操作 |
| 文件系统 | @modelcontextprotocol/server-filesystem | 文件读写 |
| GitHub | @modelcontextprotocol/server-github | GitHub操作 |
| Slack | @modelcontextprotocol/server-slack | Slack消息 |
| Google Drive | @modelcontextprotocol/server-gdrive | Google Drive |
| Brave Search | @modelcontextprotocol/server-brave-search | 网络搜索 |
| Sentry | @modelcontextprotocol/server-sentry | 错误监控 |

**MCP 的价值**

1. **标准化**：一套协议适配所有AI应用
2. **可复用**：一次开发，所有MCP兼容应用都能用
3. **可组合**：不同Server可以组合使用
4. **安全**：权限控制和审计

> MCP 之于 AI，就像 USB 之于电脑——标准化的接口协议，让 AI 能即插即用地接入任何外部工具和服务。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| MCP协议 | AI与外部世界的标准接口，Tools+Resources+Prompts |
| Python开发 | mcp库，stdio_server传输 |
| TypeScript开发 | @modelcontextprotocol/sdk |
| 数据库Server | SQL查询+表结构查看+安全检查 |
| API Server | HTTP调用封装 |
| 文件系统Server | 文件读写+路径穿越防护 |
| MCP生态 | GitHub/Slack/Postgres等现成Server可用 |

---

觉得有用？收藏起来，下次直接照抄。

你开发过 MCP Server 吗？评论区分享你的经验。

关注怕浪猫，下期我们讲 Agent 安全与治理——AI Agent 的安全红线和治理框架，这是每个 Agent 开发者都必须了解的。

系列进度 16/24

**下章预告：** 第17章我们将深入 AI Agent 的安全与治理，从常见攻击到防御策略，从合规框架到安全审计清单，帮你构建安全的 Agent 系统。
