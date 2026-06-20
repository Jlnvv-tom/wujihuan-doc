# 第7章 可视化编排开发：插件与知识库集成

让产品经理自己配AI应用，不用找开发——这就是可视化编排的价值。

我是怕浪猫，前面6章我们搭了一个功能完整的聊天机器人。但从这章开始，LLMOps平台要升级——让非技术人员也能配置AI应用，这就是可视化编排。

---

## 7.1 YAML + Python 动态导入实现可视化编排插件

**为什么用YAML**

YAML是人类可读的配置格式，适合非技术人员编辑。用YAML描述AI应用的配置，Python动态加载执行。

**YAML配置格式设计**

```yaml
# app_config.yaml
app:
  name: "智能客服"
  description: "电商智能客服系统"
  model: "gpt-4"
  temperature: 0.7

system_prompt: |
  你是一个电商客服助手。请根据用户的问题，提供准确、友好的回答。
  如果不确定，请说"我需要确认一下"，不要编造信息。

plugins:
  - name: "web_search"
    enabled: true
    config:
      max_results: 3
  - name: "knowledge_base"
    enabled: true
    config:
      knowledge_base_id: 1
      top_k: 5

memory:
  type: "summary"
  max_tokens: 3000

audit:
  input_enabled: true
  output_enabled: true
```

**Python动态加载**

```python
# services/app_config_service.py
import yaml
import importlib

class AppConfigService:
    def load_config(self, config_str):
        """加载YAML配置"""
        config = yaml.safe_load(config_str)
        return config
    
    def build_chain(self, config):
        """根据配置构建链"""
        app_config = config['app']
        
        # 1. 加载LLM
        llm = ChatOpenAI(
            model=app_config['model'],
            temperature=app_config['temperature']
        )
        
        # 2. 构建Prompt
        system_prompt = config.get('system_prompt', '')
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="history"),
            ("user", "{input}")
        ])
        
        # 3. 加载插件
        tools = []
        for plugin_config in config.get('plugins', []):
            if plugin_config.get('enabled', False):
                tool = self._load_plugin(plugin_config)
                if tool:
                    tools.append(tool)
        
        # 4. 构建链
        if tools:
            llm_with_tools = llm.bind_tools(tools)
            # Agent链
            chain = self._build_agent_chain(prompt, llm_with_tools, tools)
        else:
            chain = prompt | llm | StrOutputParser()
        
        return chain
    
    def _load_plugin(self, plugin_config):
        """动态加载插件"""
        plugin_name = plugin_config['name']
        try:
            module = importlib.import_module(f'plugins.{plugin_name}')
            plugin_class = getattr(module, f'{plugin_name.title().replace("_", "")}Plugin')
            return plugin_class(plugin_config.get('config', {}))
        except ImportError:
            print(f"插件 {plugin_name} 未找到")
            return None
```

**插件基类**

```python
# plugins/base.py
from abc import ABC, abstractmethod
from langchain_core.tools import BaseTool

class BasePlugin(ABC):
    def __init__(self, config):
        self.config = config
    
    @abstractmethod
    def get_tool(self) -> BaseTool:
        """返回LangChain工具"""
        pass
    
    @abstractmethod
    def validate_config(self):
        """验证配置"""
        pass
```

---

## 7.2 OpenAPI Schema 调整：将任意 API 接入 LLMOps

**OpenAPI Schema原理**

OpenAPI（Swagger）是描述REST API的标准格式。只要一个API有OpenAPI Schema，就能自动转换为LLM可调用的工具。

**从OpenAPI到LangChain工具**

```python
# services/openapi_tool_service.py
from langchain_community.utilities.openapi import OpenAPISpec
from langchain_community.tools import APIOperation
import requests

class OpenAPIToolService:
    def parse_spec(self, spec_url_or_dict):
        """解析OpenAPI规范"""
        spec = OpenAPISpec.from_url(spec_url_or_dict)
        operations = []
        
        for path, methods in spec.paths.items():
            for method, operation in methods.items():
                op = APIOperation.from_openapi_spec(spec, path, method)
                operations.append(op)
        
        return operations
    
    def create_tool_from_operation(self, operation):
        """从API操作创建工具"""
        @tool
        def api_tool(**kwargs):
            f"""{operation.description}"""
            url = f"{operation.base_url}{operation.path}"
            response = requests.request(
                method=operation.method,
                url=url,
                json=kwargs
            )
            return response.json()
        
        api_tool.name = operation.operation_id
        api_tool.description = operation.description
        return api_tool
```

**自定义API接入**

```python
# 用户在前端填入API信息
api_config = {
    "name": "快递查询",
    "description": "根据快递单号查询物流信息",
    "url": "https://api.example.com/express/query",
    "method": "POST",
    "parameters": {
        "tracking_number": {
            "type": "string",
            "description": "快递单号",
            "required": True
        }
    },
    "headers": {
        "Authorization": "Bearer xxx"
    }
}

# 自动生成工具
def create_custom_api_tool(config):
    @tool
    def custom_api(**kwargs):
        f"""{config['description']}"""
        response = requests.request(
            method=config['method'],
            url=config['url'],
            json=kwargs,
            headers=config.get('headers', {})
        )
        return response.json()
    
    custom_api.name = config['name']
    return custom_api
```

> OpenAPI接入是LLMOps平台的杀手级功能——用户只需要填API地址，平台自动生成工具。这就把"接入一个新API"从"写代码"变成了"填表单"。

---

## 7.3 零样本/低样本高质量 Prompt 编写技巧

**零样本Prompt**

不提供示例，只靠指令让LLM完成任务：

```
请根据以下用户问题，判断意图类别：
- 查询订单
- 退换货
- 投诉建议
- 其他

用户问题：{input}
意图类别：
```

**低样本Prompt**

提供几个示例，让LLM参考：

```
请根据用户问题判断意图类别。

示例：
用户：我的快递怎么还没到？ → 查询订单
用户：这件衣服我想退了 → 退换货
用户：你们服务太差了 → 投诉建议
用户：有XXX码吗？ → 其他

用户问题：{input}
意图类别：
```

**高质量Prompt模板**

```python
PROMPT_TEMPLATES = {
    "客服场景": """你是一个专业的电商客服。
    
核心规则：
1. 回答必须基于提供的信息，不要编造
2. 语气友好专业
3. 如果无法回答，引导用户联系人工客服
4. 回答简洁，不超过200字

可用的知识库信息：
{context}

用户问题：{input}
回答：""",

    "技术支持": """你是一个技术支持助手。

核心规则：
1. 先确认用户的具体问题
2. 给出分步骤的解决方案
3. 如果方案不work，提供替代方案
4. 专业术语给出简短解释

参考文档：
{context}

用户问题：{input}
回答：""",

    "创意写作": """你是一个创意写作助手。

核心规则：
1. 风格与用户要求一致
2. 内容原创，不抄袭
3. 结构清晰，逻辑连贯
4. 语言生动，有感染力

创作要求：{input}
写作风格：{style}
回答："""
}
```

---

## 7.4 知识库功能：文档分割、关键词提取、向量化、增删改查

**知识库数据模型**

```python
# models/knowledge_base.py
class KnowledgeBase(db.Model):
    __tablename__ = 'knowledge_bases'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    doc_count = db.Column(db.Integer, default=0)
    chunk_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Document(db.Model):
    __tablename__ = 'documents'
    
    id = db.Column(db.Integer, primary_key=True)
    knowledge_base_id = db.Column(db.Integer, db.ForeignKey('knowledge_bases.id'))
    title = db.Column(db.String(200))
    file_path = db.Column(db.String(500))
    file_type = db.Column(db.String(20))  # pdf/txt/docx/md
    chunk_count = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='pending')  # pending/processing/done/error
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**知识库CRUD API**

```python
# routes/knowledge_base.py
kb_bp = Blueprint('knowledge_base', __name__)

@kb_bp.route('/', methods=['POST'])
def create_kb():
    """创建知识库"""
    data = request.json
    kb = KnowledgeBase(
        name=data['name'],
        description=data.get('description', ''),
        user_id=current_user.id
    )
    db.session.add(kb)
    db.session.commit()
    return success(data={'id': kb.id, 'name': kb.name})

@kb_bp.route('/<int:kb_id>/documents', methods=['POST'])
def upload_document(kb_id):
    """上传文档到知识库"""
    file = request.files['file']
    
    # 保存文件
    file_path = f"uploads/{kb_id}/{file.filename}"
    file.save(file_path)
    
    # 创建文档记录
    doc = Document(
        knowledge_base_id=kb_id,
        title=file.filename,
        file_path=file_path,
        file_type=os.path.splitext(file.filename)[1][1:],
        status='pending'
    )
    db.session.add(doc)
    db.session.commit()
    
    # 异步处理文档（分割+向量化）
    process_document.delay(doc.id)
    
    return success(data={'id': doc.id, 'status': 'processing'})

@kb_bp.route('/<int:kb_id>/documents', methods=['GET'])
def list_documents(kb_id):
    """获取知识库文档列表"""
    docs = Document.query.filter_by(knowledge_base_id=kb_id).all()
    return success(data=[{
        'id': d.id, 'title': d.title,
        'status': d.status, 'chunk_count': d.chunk_count
    } for d in docs])

@kb_bp.route('/<int:kb_id>/documents/<int:doc_id>', methods=['DELETE'])
def delete_document(kb_id, doc_id):
    """删除文档"""
    doc = Document.query.get_or_404(doc_id)
    # 从向量数据库删除
    vector_store.delete_by_document(doc_id)
    # 从文件系统删除
    os.remove(doc.file_path)
    # 从数据库删除
    db.session.delete(doc)
    db.session.commit()
    return success()
```

---

## 7.5 Celery 处理耗时任务

**为什么需要异步任务**

文档上传后需要分割和向量化，这个过程可能需要几十秒甚至几分钟。如果同步处理，HTTP请求会超时。Celery是Python最成熟的异步任务框架。

**Celery配置**

```python
# celery_config.py
from celery import Celery

celery = Celery(
    'llmops',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/1'
)

celery.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Shanghai',
    task_track_started=True,
    task_time_limit=300,  # 5分钟超时
)
```

**文档处理任务**

```python
# tasks/document.py
from celery_config import celery
from services.rag_service import RAGService

@celery.task(bind=True)
def process_document(self, doc_id):
    """处理文档：分割 + 向量化 + 存储"""
    try:
        # 更新状态
        self.update_state(state='PROCESSING')
        doc = Document.query.get(doc_id)
        doc.status = 'processing'
        db.session.commit()
        
        # 分割
        rag = RAGService()
        chunk_count = rag.process_document(doc.file_path, doc.knowledge_base_id)
        
        # 更新状态
        doc.status = 'done'
        doc.chunk_count = chunk_count
        db.session.commit()
        
        # 更新知识库统计
        kb = KnowledgeBase.query.get(doc.knowledge_base_id)
        kb.doc_count += 1
        kb.chunk_count += chunk_count
        db.session.commit()
        
        return {'status': 'done', 'chunk_count': chunk_count}
    
    except Exception as e:
        doc = Document.query.get(doc_id)
        doc.status = 'error'
        db.session.commit()
        raise
```

**前端轮询任务状态**

```javascript
// api/knowledge_base.js
export const kbAPI = {
  getDocumentStatus: (kbId, docId) => 
    request.get(`/knowledge_base/${kbId}/documents/${docId}`),
}

// components/UploadDialog.vue
const checkStatus = async (docId) => {
  const poll = setInterval(async () => {
    const res = await kbAPI.getDocumentStatus(kbId.value, docId)
    if (res.data.status === 'done') {
      clearInterval(poll)
      ElMessage.success('文档处理完成')
    } else if (res.data.status === 'error') {
      clearInterval(poll)
      ElMessage.error('文档处理失败')
    }
  }, 3000)
}
```

---

## 7.6 LangChain 提示组件：用户自定义编排

**Prompt版本管理**

```python
# models/prompt_config.py
class PromptConfig(db.Model):
    __tablename__ = 'prompt_configs'
    
    id = db.Column(db.Integer, primary_key=True)
    app_id = db.Column(db.Integer, db.ForeignKey('apps.id'))
    version = db.Column(db.Integer, default=1)
    system_prompt = db.Column(db.Text)
    temperature = db.Column(db.Float, default=0.7)
    model = db.Column(db.String(50), default='gpt-4')
    max_tokens = db.Column(db.Integer, default=2000)
    is_active = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**Prompt编辑API**

```python
@kb_bp.route('/apps/<int:app_id>/prompts', methods=['POST'])
def save_prompt(app_id):
    """保存Prompt配置"""
    data = request.json
    
    # 递增版本号
    latest = PromptConfig.query.filter_by(app_id=app_id).order_by(
        PromptConfig.version.desc()
    ).first()
    version = (latest.version + 1) if latest else 1
    
    config = PromptConfig(
        app_id=app_id,
        version=version,
        system_prompt=data['system_prompt'],
        temperature=data.get('temperature', 0.7),
        model=data.get('model', 'gpt-4'),
        max_tokens=data.get('max_tokens', 2000),
        is_active=True
    )
    
    # 将旧版本设为非活跃
    PromptConfig.query.filter_by(app_id=app_id).update({'is_active': False})
    
    db.session.add(config)
    db.session.commit()
    return success(data={'version': version})
```

---

## 7.7 应用编排配置历史版本管理

**版本回退机制**

```python
@kb_bp.route('/apps/<int:app_id>/prompts/<int:version>/activate', methods=['POST'])
def activate_version(app_id, version):
    """激活指定版本的配置"""
    # 停用所有版本
    PromptConfig.query.filter_by(app_id=app_id).update({'is_active': False})
    
    # 激活指定版本
    config = PromptConfig.query.filter_by(app_id=app_id, version=version).first_or_404()
    config.is_active = True
    db.session.commit()
    
    return success(data={'version': version})

@kb_bp.route('/apps/<int:app_id>/prompts', methods=['GET'])
def list_versions(app_id):
    """获取所有版本"""
    configs = PromptConfig.query.filter_by(app_id=app_id).order_by(
        PromptConfig.version.desc()
    ).all()
    return success(data=[{
        'version': c.version,
        'is_active': c.is_active,
        'model': c.model,
        'temperature': c.temperature,
        'created_at': c.created_at.isoformat()
    } for c in configs])
```

---

## 7.8 AI 自动优化提示技巧

**AI自动优化Prompt**

让LLM分析Prompt质量，自动生成优化建议：

```python
@tool
def optimize_prompt(current_prompt: str) -> str:
    """优化给定的Prompt，使其更加清晰、具体、有效"""
    optimization_prompt = f"""请分析以下Prompt的质量，并给出优化版本。

当前Prompt：
{current_prompt}

请从以下维度分析：
1. 清晰度：指令是否明确无歧义
2. 完整性：是否覆盖了边界情况
3. 输出格式：是否指定了输出格式
4. 约束条件：是否设置了必要的限制
5. 示例：是否提供了few-shot示例

输出格式：
- 分析：当前Prompt的问题
- 优化后Prompt：改进后的版本
- 改动说明：每个改动的原因
"""
    
    result = llm.invoke(optimization_prompt)
    return result
```

**自动优化流程**

```
用户写Prompt → AI分析 → 生成优化建议 → 用户确认 → 保存为新版本
```

> AI优化Prompt不是替代人写Prompt，而是帮人发现盲点。人想逻辑，AI补细节，1+1>2。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| YAML编排 | 人类可读配置 + Python动态加载 |
| OpenAPI接入 | Schema自动生成工具，填表替代编码 |
| Prompt技巧 | 零样本/低样本/模板化 |
| 知识库CRUD | 文档上传+异步处理+增删改查 |
| Celery异步 | 文档处理不阻塞HTTP |
| 版本管理 | Prompt配置版本化+回退 |
| AI优化 | LLM分析+改进Prompt |

---

觉得有用？收藏起来，下次直接照抄。

你的平台有可视化编排功能吗？评论区聊聊。

关注怕浪猫，下期我们升级响应体验——流式传输、打字机效果、Token计数，让AI回复更丝滑。

系列进度 7/23

**下章预告：** 第8章响应模块升级——流式响应、队列+协程实现、前端打字机效果、Token计数与中断，让聊天体验起飞。
