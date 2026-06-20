# 第2章 LLMOps 后端搭建与基础聊天机器人

后端搭不好，AI应用就是空中楼阁。我搭了3遍才找到最优方案，这份指南帮你一次到位。

我是怕浪猫，上一章我们搞清楚了LLMOps平台的架构设计，这章直接上手——搭建Python后端，对接OpenAI，跑通第一个聊天机器人。

---

## 2.1 Python 环境搭建与开发工具配置

**Python版本选择**

| 版本 | 状态 | 推荐 |
|------|------|------|
| 3.8 | 已停止安全更新 | 不推荐 |
| 3.9 | 安全更新中 | 可用 |
| 3.10 | 积极维护 | 推荐 |
| 3.11 | 积极维护 | 推荐 |
| 3.12 | 最新稳定 | 推荐 |

**环境搭建步骤**

```bash
# 1. 安装pyenv（Python版本管理）
curl https://pyenv.run | bash

# 2. 安装Python 3.11
pyenv install 3.11.7
pyenv global 3.11.7

# 3. 创建项目目录
mkdir llmops && cd llmops

# 4. 创建虚拟环境
python -m venv venv
source venv/bin/activate

# 5. 安装核心依赖
pip install flask sqlalchemy openai langchain langchain-openai
```

**开发工具配置**

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| VSCode | 编辑器 | 官网下载 |
| Python扩展 | 代码补全 | VSCode扩展商店 |
| REST Client | API调试 | VSCode扩展商店 |
| .env支持 | 环境变量 | pip install python-dotenv |

**项目结构**

```
llmops/
├── backend/
│   ├── app.py              # Flask入口
│   ├── config.py           # 配置文件
│   ├── models/             # 数据模型
│   ├── routes/             # API路由
│   ├── services/           # 业务逻辑
│   ├── utils/              # 工具函数
│   └── requirements.txt    # 依赖清单
├── frontend/               # 前端项目（后续）
├── .env                    # 环境变量
└── docker-compose.yml      # 容器编排
```

---

## 2.2 LLMOps 项目后端开发约定与规范

**代码规范**

| 规范 | 说明 | 工具 |
|------|------|------|
| 代码风格 | PEP 8 | flake8 / black |
| 类型提示 | Python Type Hints | mypy |
| 文档字符串 | Google Style | pydocstyle |
| 提交规范 | Conventional Commits | commitlint |

**API设计规范**

```
RESTful API设计原则：

1. URL用名词不用动词
   ✅ GET /api/v1/conversations
   ❌ GET /api/v1/getConversations

2. 用HTTP方法表示操作
   GET    → 查询
   POST   → 创建
   PUT    → 更新
   DELETE → 删除

3. 统一响应格式
   {
     "code": 200,
     "message": "success",
     "data": {...}
   }

4. 版本控制
   /api/v1/...  /api/v2/...
```

**目录约定**

```python
# routes/chat.py - 路由层：处理HTTP请求
@chat_bp.route('/completions', methods=['POST'])
def completions():
    data = request.json
    result = chat_service.completions(data)
    return jsonify(result)

# services/chat_service.py - 服务层：业务逻辑
class ChatService:
    def completions(self, data):
        # 业务逻辑
        pass

# models/conversation.py - 模型层：数据定义
class Conversation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))
```

> 好的项目结构不是一开始就完美的，而是在迭代中逐渐稳定的。但约定必须先定——约定比结构更重要。

---

## 2.3 统一 API 接口设计与开发

**Flask应用初始化**

```python
# app.py
from flask import Flask
from flask_cors import CORS
from extensions import db
from routes.chat import chat_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')
    
    # 初始化扩展
    CORS(app)
    db.init_app(app)
    
    # 注册蓝图
    app.register_blueprint(chat_bp, url_prefix='/api/v1/chat')
    
    return app

if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)
```

**统一响应封装**

```python
# utils/response.py
from flask import jsonify

def success(data=None, message="success", code=200):
    return jsonify({
        "code": code,
        "message": message,
        "data": data
    }), code

def error(message="error", code=400, data=None):
    return jsonify({
        "code": code,
        "message": message,
        "data": data
    }), code
```

**API接口设计**

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 创建对话 | POST | /api/v1/chat/conversations | 新建对话 |
| 获取对话列表 | GET | /api/v1/chat/conversations | 列表查询 |
| 发送消息 | POST | /api/v1/chat/completions | 对话补全 |
| 获取历史消息 | GET | /api/v1/chat/messages/{conv_id} | 历史记录 |
| 删除对话 | DELETE | /api/v1/chat/conversations/{id} | 删除 |

**聊天补全接口实现**

```python
# routes/chat.py
from flask import Blueprint, request
from services.chat_service import ChatService
from utils.response import success, error

chat_bp = Blueprint('chat', __name__)
chat_service = ChatService()

@chat_bp.route('/completions', methods=['POST'])
def completions():
    data = request.json
    
    # 参数校验
    if not data or 'message' not in data:
        return error("message参数必填")
    
    try:
        result = chat_service.completions(
            message=data['message'],
            conversation_id=data.get('conversation_id'),
            model=data.get('model', 'gpt-4')
        )
        return success(data=result)
    except Exception as e:
        return error(str(e), code=500)
```

---

## 2.4 PostgreSQL 安装与 ORM 模型使用

**PostgreSQL安装**

```bash
# macOS
brew install postgresql@16
brew services start postgresql@16

# Ubuntu
sudo apt install postgresql-16
sudo systemctl start postgresql

# Docker
docker run -d --name pg \
  -e POSTGRES_PASSWORD=llmops \
  -e POSTGRES_DB=llmops \
  -p 5432:5432 \
  postgres:16
```

**SQLAlchemy配置**

```python
# config.py
class Config:
    SQLALCHEMY_DATABASE_URI = 'postgresql://postgres:llmops@localhost:5432/llmops'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = 'your-secret-key'
    OPENAI_API_KEY = 'sk-xxx'
```

**数据模型定义**

```python
# models/conversation.py
from extensions import db
from datetime import datetime

class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False, default='新对话')
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    model = db.Column(db.String(50), default='gpt-4')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 关系
    messages = db.relationship('Message', backref='conversation', lazy='dynamic')

class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id'))
    role = db.Column(db.String(20), nullable=False)  # user/assistant/system
    content = db.Column(db.Text, nullable=False)
    tokens = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

> 数据模型是整个应用的骨架，骨架不稳，后面全是补丁。花时间想清楚对话和消息的关系，比写100行代码更重要。

---

## 2.5 数据库迁移与版本控制

**Flask-Migrate配置**

```python
# extensions.py
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate

db = SQLAlchemy()
migrate = Migrate()
```

```python
# app.py中初始化
migrate.init_app(app, db)
```

**迁移命令**

```bash
# 初始化迁移
flask db init

# 生成迁移脚本
flask db migrate -m "add conversations and messages"

# 执行迁移
flask db upgrade

# 回滚
flask db downgrade

# 查看历史
flask db history
```

**迁移脚本示例**

```python
# migrations/versions/001_add_conversations.py
def upgrade():
    op.create_table('conversations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('model', sa.String(50), server_default='gpt-4'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversations.id')),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('tokens', sa.Integer(), server_default='0'),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade():
    op.drop_table('messages')
    op.drop_table('conversations')
```

---

## 2.6 PyTest 代码测试与版本控制

**测试配置**

```python
# tests/conftest.py
import pytest
from app import create_app
from extensions import db

@pytest.fixture
def app():
    app = create_app()
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///test.db'
    app.config['TESTING'] = True
    
    with app.app_context():
        db.create_all()
        yield app
        db.drop_all()

@pytest.fixture
def client(app):
    return app.test_client()
```

**API测试示例**

```python
# tests/test_chat.py
def test_create_conversation(client):
    response = client.post('/api/v1/chat/conversations', 
        json={'title': '测试对话'})
    assert response.status_code == 200
    data = response.get_json()
    assert data['code'] == 200
    assert data['data']['title'] == '测试对话'

def test_completions(client):
    # 先创建对话
    conv = client.post('/api/v1/chat/conversations',
        json={'title': '测试'})
    conv_id = conv.get_json()['data']['id']
    
    # 发送消息
    response = client.post('/api/v1/chat/completions',
        json={'message': '你好', 'conversation_id': conv_id})
    assert response.status_code == 200
```

**Git版本控制规范**

```bash
# .gitignore
venv/
__pycache__/
.env
*.db
*.pyc
migrations/
```

```
提交规范：
feat: 新功能
fix: 修复bug
refactor: 重构
test: 测试
docs: 文档
chore: 构建/工具
```

---

## 2.7 Postman 快速调试后端接口

**Postman环境配置**

| 变量 | 值 | 说明 |
|------|------|------|
| base_url | http://localhost:5000 | 后端地址 |
| token | 留空 | 认证后填入 |

**调试流程**

1. 先调通健康检查接口：`GET /api/v1/health`
2. 测试创建对话：`POST /api/v1/chat/conversations`
3. 测试发送消息：`POST /api/v1/chat/completions`
4. 检查数据库：确认数据写入正确

**常见问题排查清单**

| 问题 | 原因 | 解决 |
|------|------|------|
| 404 Not Found | 路由未注册 | 检查Blueprint注册 |
| 500 Internal Error | 代码异常 | 查看Flask日志 |
| CORS错误 | 跨域未配置 | 添加CORS扩展 |
| 连接超时 | OpenAI API不通 | 检查网络和Key |
| 数据库连接失败 | 配置错误 | 检查SQLALCHEMY_DATABASE_URI |

---

## 2.8 对接 OpenAI 实现第一个聊天机器人

**OpenAI API封装**

```python
# services/llm_service.py
from openai import OpenAI
from config import Config

class LLMService:
    def __init__(self):
        self.client = OpenAI(api_key=Config.OPENAI_API_KEY)
    
    def chat(self, messages, model='gpt-4', temperature=0.7):
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature
        )
        return {
            'content': response.choices[0].message.content,
            'tokens': {
                'prompt': response.usage.prompt_tokens,
                'completion': response.usage.completion_tokens,
                'total': response.usage.total_tokens
            }
        }
```

**ChatService完整实现**

```python
# services/chat_service.py
from models.conversation import Conversation, Message
from services.llm_service import LLMService
from extensions import db

class ChatService:
    def __init__(self):
        self.llm = LLMService()
    
    def completions(self, message, conversation_id=None, model='gpt-4'):
        # 获取或创建对话
        if conversation_id:
            conv = Conversation.query.get(conversation_id)
        else:
            conv = Conversation(title=message[:30], model=model)
            db.session.add(conv)
            db.session.commit()
        
        # 保存用户消息
        user_msg = Message(
            conversation_id=conv.id,
            role='user',
            content=message
        )
        db.session.add(user_msg)
        
        # 构建历史消息
        history = Message.query.filter_by(
            conversation_id=conv.id
        ).order_by(Message.created_at).all()
        
        messages = [{'role': m.role, 'content': m.content} for m in history]
        
        # 调用LLM
        result = self.llm.chat(messages, model=model)
        
        # 保存助手回复
        assistant_msg = Message(
            conversation_id=conv.id,
            role='assistant',
            content=result['content'],
            tokens=result['tokens']['total']
        )
        db.session.add(assistant_msg)
        db.session.commit()
        
        return {
            'conversation_id': conv.id,
            'message': result['content'],
            'tokens': result['tokens']
        }
```

> 第一个聊天机器人不需要多复杂，核心就三步：收消息、调LLM、存结果。但这三步里藏着的错误处理、超时控制、Token计数，才是生产级代码和Demo的区别。

---

## 2.9 LangChain 框架入门

**为什么用LangChain**

直接调OpenAI API能实现基本对话，但要加记忆、RAG、工具调用，代码量会指数级增长。LangChain把这些能力封装成了可组合的组件。

**LangChain核心概念**

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. Model - LLM模型
llm = ChatOpenAI(model="gpt-4", temperature=0.7)

# 2. Prompt - 提示模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的AI助手"),
    ("user", "{input}")
])

# 3. OutputParser - 输出解析
parser = StrOutputParser()

# 4. Chain - 链式调用
chain = prompt | llm | parser

# 5. 执行
result = chain.invoke({"input": "什么是LLMOps?"})
print(result)
```

**LangChain vs 直接调API**

| 维度 | 直接调API | LangChain |
|------|----------|-----------|
| 记忆管理 | 手动维护messages | 内置Memory组件 |
| Prompt管理 | 字符串拼接 | 模板化+变量化 |
| 输出解析 | 手动解析 | 自动解析为结构化数据 |
| 工具调用 | 手动解析function_call | Agent自动决策 |
| 链式调用 | 嵌套回调 | LCEL管道操作 |
| 可观测性 | 手动打日志 | LangSmith集成 |

---

## 2.10 LangChain 核心组件详解

**LCEL（LangChain Expression Language）**

LCEL是LangChain的管道语法，用`|`连接组件：

```python
# 基础链
chain = prompt | llm | parser

# 带变量的链
chain = (
    {"input": RunnablePassthrough(), "history": get_history}
    | prompt
    | llm
    | parser
)

# 并行链
from langchain_core.runnables import RunnableParallel

chain = RunnableParallel({
    "joke": joke_chain,
    "poem": poem_chain
})
```

**Prompt组件**

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# 基础模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是{role}"),
    ("user", "{input}")
])

# 带历史消息的模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手"),
    MessagesPlaceholder(variable_name="history"),
    ("user", "{input}")
])
```

**OutputParser组件**

```python
from langchain_core.output_parsers import StrOutputParser, JsonOutputParser
from langchain_core.pydantic_v1 import BaseModel

# 字符串解析
str_parser = StrOutputParser()

# JSON解析
class QAResponse(BaseModel):
    question: str
    answer: str
    confidence: float

json_parser = JsonOutputParser(pydantic_object=QAResponse)

prompt = ChatPromptTemplate.from_messages([
    ("system", "回答用户问题。{format_instructions}"),
    ("user", "{input}")
])

chain = prompt | llm | json_parser
```

**Callback组件**

```python
from langchain_core.callbacks import BaseCallbackHandler

class TokenCounter(BaseCallbackHandler):
    def __init__(self):
        self.total_tokens = 0
    
    def on_llm_end(self, response, **kwargs):
        self.total_tokens += response.llm_output['token_usage']['total_tokens']

counter = TokenCounter()
chain = prompt | llm | parser
result = chain.invoke({"input": "你好"}, config={"callbacks": [counter]})
print(f"Total tokens: {counter.total_tokens}")
```

**Runnable高级用法**

```python
from langchain_core.runnables import RunnablePassthrough, RunnableLambda

# 数据转换
def format_input(data):
    return {"input": data["query"].strip()}

chain = (
    RunnableLambda(format_input)
    | prompt
    | llm
    | parser
)

# 带fallback的链
chain = (
    primary_chain
    .with_fallbacks([fallback_chain])
    .with_retry(stop_after_attempt=3)
)
```

> LangChain的核心不是"帮你调API"，而是"把LLM应用的开发模式标准化"。LCEL的管道语法、Prompt模板、OutputParser这些抽象，让复杂链变得可读可维护。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 环境搭建 | Python 3.11 + Flask + SQLAlchemy |
| 开发规范 | 三层架构(路由/服务/模型) + 统一响应 |
| API设计 | RESTful + 版本控制 + 参数校验 |
| 数据库 | PostgreSQL + SQLAlchemy ORM + 迁移 |
| 测试 | PyTest + conftest + 测试隔离 |
| OpenAI对接 | LLMService封装 + 消息持久化 |
| LangChain入门 | LCEL管道 + Prompt + OutputParser |

---

觉得有用？收藏起来，下次直接照抄。

你搭后端时踩过什么坑？评论区聊聊。

关注怕浪猫，下期我们搭前端——Vue.js + TailwindCSS，把聊天机器人装进漂亮的UI里。

系列进度 2/23

**下章预告：** 第3章开始前端开发——Node.js环境搭建、Vue3项目初始化、前后端联调，最终实现一个带UI的完整聊天机器人。
