# 第4章 记忆模块开发：让聊天机器人拥有记忆

聊了3轮AI就忘了你叫什么？不是模型蠢，是你没给它装记忆。

我是怕浪猫，前面3章我们跑通了带UI的聊天机器人，但它有个致命问题——金鱼脑。每轮对话都得从头开始，前面聊的什么全忘了。这章给它装上记忆模块。

---

## 4.1 LLM 状态、上下文窗口与长度限制

**LLM是无状态的**

每次调用LLM API，模型都不知道上一次说了什么。多轮对话的"记忆感"，全靠代码把历史消息拼回去。

```
第1轮：[user: 你好] → [assistant: 你好！有什么可以帮助你的？]
第2轮：[user: 我叫小明] → [assistant: 你好小明！]
第3轮：[user: 我叫什么？] → ??? 

如果第3轮只传[user: 我叫什么？]，模型不知道你叫小明。
必须传完整历史：[user:你好, assistant:你好！, user:我叫小明, assistant:你好小明！, user:我叫什么？]
```

**上下文窗口**

| 模型 | 上下文窗口 | 约等于 |
|------|-----------|--------|
| GPT-3.5 | 4K/16K | 约3000-12000字 |
| GPT-4 | 8K/32K | 约6000-24000字 |
| GPT-4o | 128K | 约96000字 |
| Claude 3 | 200K | 约150000字 |
| DeepSeek | 128K | 约96000字 |

**Token计数**

```python
import tiktoken

def count_tokens(text, model='gpt-4'):
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

# 示例
print(count_tokens("你好，我是怕浪猫"))  # 约8-10 tokens
```

**上下文窗口溢出问题**

对话越来越长，历史消息越来越多，总Token数超过窗口限制就会报错。解决方案：

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| 截断 | 只保留最近N轮 | 简单对话 |
| 摘要 | 用LLM总结历史 | 长对话 |
| 滑动窗口 | 保留最近N个Token | 通用 |
| 实体提取 | 只保留关键实体 | 信息密集 |

> 上下文窗口不是"越大越好"，而是"越大越贵"。128K的窗口全塞满，一次请求的Token费用能让你心疼半天。记忆管理的本质，是用最少的Token保留最有用的信息。

---

## 4.2 LCEL 表达式深入

**LCEL与Runnable接口**

LCEL的核心是`Runnable`接口，所有组件都实现了这个接口，所以可以用`|`串联：

```python
from langchain_core.runnables import RunnablePassthrough, RunnableLambda

# RunnablePassthrough - 直接传递输入
# RunnableLambda - 包装自定义函数
# RunnableParallel - 并行执行

chain = (
    {
        "query": RunnablePassthrough(),
        "context": lambda x: get_context(x)
    }
    | prompt
    | llm
    | parser
)
```

**Runnable的绑定方法**

```python
# bind - 绑定运行时参数
chain = prompt | llm.bind(temperature=0.3) | parser

# with_config - 配置回调
chain = prompt | llm | parser
result = chain.invoke({"input": "你好"}, config={"callbacks": [handler]})

# with_fallbacks - 备用链
chain = (
    primary_chain
    .with_fallbacks([backup_chain])
)

# with_retry - 重试
chain = (
    prompt | llm | parser
).with_retry(stop_after_attempt=3)

# assign - 追加字段
chain = (
    prompt | llm | parser
).assign(usage=lambda x: x.metadata.get('token_usage'))
```

**LCEL实现带记忆的链**

```python
from langchain_core.runnables import RunnableParallel
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手"),
    MessagesPlaceholder(variable_name="history"),
    ("user", "{input}")
])

def get_history(conv_id):
    messages = Message.query.filter_by(conversation_id=conv_id).all()
    return [{"role": m.role, "content": m.content} for m in messages]

chain = (
    {
        "input": RunnablePassthrough(),
        "history": lambda x: get_history(x["conv_id"])
    }
    | prompt
    | llm
    | parser
)
```

---

## 4.3 LangChain 记忆组件：缓冲记忆 / 摘要记忆 / 实体记忆

**三种记忆策略对比**

| 策略 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 缓冲记忆 | 保留最近K轮对话 | 简单、精准 | 长对话丢失早期信息 |
| 摘要记忆 | LLM总结历史 | 压缩信息、节省Token | 摘要可能丢细节 |
| 实体记忆 | 提取关键实体 | 信息密度高 | 实现复杂 |

**缓冲记忆实现**

```python
from langchain.memory import ConversationBufferWindowMemory

# 只保留最近5轮
memory = ConversationBufferWindowMemory(k=5, return_messages=True)

# 手动管理
memory.save_context({"input": "我叫小明"}, {"output": "你好小明！"})
memory.save_context({"input": "我喜欢Python"}, {"output": "Python是很好的语言！"})

# 获取历史
print(memory.load_memory_variables({}))
# {"history": [HumanMessage("我叫小明"), AIMessage("你好小明！"), ...]}
```

**摘要记忆实现**

```python
from langchain.memory import ConversationSummaryMemory

memory = ConversationSummaryMemory(llm=llm, return_messages=True)

memory.save_context({"input": "我叫小明，是个Python开发者"}, {"output": "你好小明！"})
memory.save_context({"input": "我在学LangChain"}, {"output": "LangChain很棒！"})

# 获取摘要
print(memory.load_memory_variables({}))
# {"history": "用户叫小明，是Python开发者，正在学习LangChain"}
```

**实体记忆实现**

```python
from langchain.memory import ConversationEntityMemory

memory = ConversationEntityMemory(llm=llm)

memory.save_context(
    {"input": "我叫小明，在腾讯工作，用Python开发"},
    {"output": "你好小明！腾讯是很好的公司"}
)

# 获取实体
print(memory.entity_store)
# {"小明": "用户的名字，在腾讯工作，使用Python开发"}
```

> 摘要记忆是最实用的——既不浪费Token，又不丢关键信息。但摘要质量取决于LLM的总结能力，GPT-4的摘要明显优于GPT-3.5。

---

## 4.4 带历史对话总结的 Prompt 编写

**系统提示词模板**

```python
SUMMARY_PROMPT = """你是一个AI助手。以下是你和用户的对话摘要：

{summary}

当前对话：
{history}

请根据以上信息，回答用户的问题：{input}

注意：
1. 优先参考当前对话中的具体信息
2. 如果当前对话没有相关信息，参考摘要
3. 如果都没有，诚实地说不知道
"""
```

**动态构建消息**

```python
def build_messages(conv_id, user_input, max_tokens=4000):
    """构建带记忆的消息列表"""
    all_messages = Message.query.filter_by(
        conversation_id=conv_id
    ).order_by(Message.created_at).all()
    
    # 计算Token
    total_tokens = 0
    selected_messages = []
    
    for msg in reversed(all_messages):
        msg_tokens = count_tokens(msg.content)
        if total_tokens + msg_tokens > max_tokens:
            break
        selected_messages.insert(0, msg)
        total_tokens += msg_tokens
    
    # 如果有截断，生成摘要
    if len(selected_messages) < len(all_messages):
        truncated = all_messages[:len(all_messages) - len(selected_messages)]
        summary = generate_summary(truncated)
        system_msg = f"之前的对话摘要：{summary}"
    else:
        system_msg = "你是一个有帮助的AI助手"
    
    messages = [{"role": "system", "content": system_msg}]
    messages.extend([{"role": m.role, "content": m.content} for m in selected_messages])
    messages.append({"role": "user", "content": user_input})
    
    return messages
```

---

## 4.5 AutoGPT / MetaGPT 记忆模块拆解

**AutoGPT的记忆架构**

```
输入 → [短期记忆] → LLM → 输出
         ↑                    ↓
    [长期记忆] ←←←←←←←←←←←←←←
    (向量数据库)
```

AutoGPT的记忆分两层：
1. **短期记忆**：当前任务的上下文
2. **长期记忆**：向量数据库存储所有历史交互

**MetaGPT的记忆架构**

```python
# MetaGPT使用Memory类管理消息
class Memory:
    def __init__(self):
        self.storage = []
    
    def add(self, message):
        self.storage.append(message)
    
    def search(self, query, top_k=5):
        # 基于向量相似度检索
        return vector_search(query, self.storage, k=top_k)
```

**对我们的启发**

| 特性 | AutoGPT | MetaGPT | LLMOps采用 |
|------|---------|---------|-----------|
| 短期记忆 | 当前任务上下文 | 消息列表 | 数据库最近N轮 |
| 长期记忆 | 向量数据库 | 向量检索 | 向量数据库（后续） |
| 记忆检索 | 相似度搜索 | 相似度搜索 | RAG检索（后续） |
| 记忆压缩 | 自动总结 | 不压缩 | LLM摘要 |

---

## 4.6 LLM 对话/状态持久化到数据库

**数据库模型扩展**

```python
# models/conversation.py 新增字段
class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    model = db.Column(db.String(50), default='gpt-4')
    summary = db.Column(db.Text, default='')  # 新增：对话摘要
    total_tokens = db.Column(db.Integer, default=0)  # 新增：总Token数
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    messages = db.relationship('Message', backref='conversation', lazy='dynamic')
```

**对话摘要自动更新**

```python
# services/memory_service.py
class MemoryService:
    def __init__(self, llm_service):
        self.llm = llm_service
    
    def update_summary(self, conv_id):
        """更新对话摘要"""
        conv = Conversation.query.get(conv_id)
        
        # 获取所有历史消息
        messages = Message.query.filter_by(
            conversation_id=conv_id
        ).order_by(Message.created_at).all()
        
        # 生成摘要
        if conv.summary:
            prompt = f"基于以下已有摘要和新对话，更新摘要：\n\n已有摘要：{conv.summary}\n\n新对话："
            for msg in messages[-5:]:  # 最近5轮
                prompt += f"\n{msg.role}: {msg.content}"
        else:
            prompt = "总结以下对话的关键信息：\n\n"
            for msg in messages:
                prompt += f"\n{msg.role}: {msg.content}"
        
        result = self.llm.chat([{"role": "user", "content": prompt}])
        conv.summary = result['content']
        db.session.commit()
    
    def get_history_with_summary(self, conv_id, max_tokens=3000):
        """获取带摘要的历史消息"""
        conv = Conversation.query.get(conv_id)
        
        # 先获取最近的对话
        recent = Message.query.filter_by(
            conversation_id=conv_id
        ).order_by(Message.created_at.desc()).limit(10).all()
        recent.reverse()
        
        messages = []
        
        # 如果有摘要，加在最前面
        if conv.summary:
            messages.append({
                "role": "system",
                "content": f"之前对话的摘要：{conv.summary}"
            })
        
        # 加最近的对话
        for msg in recent:
            messages.append({"role": msg.role, "content": msg.content})
        
        return messages
```

---

## 4.7 Runnable 高级技巧与源码解析

**RunnableLambda动态路由**

```python
from langchain_core.runnables import RunnableLambda, RunnableBranch

# 根据输入动态选择链
def route_by_length(x):
    if len(x["input"]) > 100:
        return "long"
    return "short"

branch = RunnableBranch(
    (lambda x: len(x["input"]) > 100, long_chain),
    (lambda x: len(x["input"]) > 20, medium_chain),
    short_chain  # 默认
)
```

**RunnableParallel并行执行**

```python
from langchain_core.runnables import RunnableParallel

# 同时生成回答和评估质量
parallel = RunnableParallel({
    "answer": answer_chain,
    "quality": quality_chain
})

result = parallel.invoke({"input": "什么是RAG?"})
# {"answer": "...", "quality": {"score": 0.85}}
```

**源码核心逻辑**

```python
# Runnable的核心：invoke方法
class Runnable:
    def invoke(self, input, config=None):
        """同步执行"""
        return self._call(input, config)
    
    async def ainvoke(self, input, config=None):
        """异步执行"""
        return await self._acall(input, config)
    
    def __or__(self, other):
        """管道操作符：self | other"""
        return RunnableSequence(self, other)
    
    def pipe(self, other):
        """显式管道"""
        return self.__or__(other)
```

---

## 4.8 封装记忆链完成带记忆功能的机器人

**完整记忆链实现**

```python
# services/chat_service.py - 升级版
class ChatService:
    def __init__(self):
        self.llm = LLMService()
        self.memory = MemoryService(self.llm)
    
    def completions(self, message, conversation_id=None, model='gpt-4'):
        # 获取或创建对话
        if conversation_id:
            conv = Conversation.query.get(conversation_id)
        else:
            conv = Conversation(title=message[:30], model=model)
            db.session.add(conv)
            db.session.commit()
        
        # 保存用户消息
        user_msg = Message(conversation_id=conv.id, role='user', content=message)
        db.session.add(user_msg)
        
        # 获取带摘要的历史消息
        history = self.memory.get_history_with_summary(conv.id)
        
        # 调用LLM
        result = self.llm.chat(history, model=model)
        
        # 保存助手回复
        assistant_msg = Message(
            conversation_id=conv.id,
            role='assistant',
            content=result['content'],
            tokens=result['tokens']['total']
        )
        db.session.add(assistant_msg)
        
        # 更新Token统计
        conv.total_tokens = (conv.total_tokens or 0) + result['tokens']['total']
        db.session.commit()
        
        # 每5轮更新一次摘要
        msg_count = Message.query.filter_by(conversation_id=conv.id).count()
        if msg_count % 10 == 0:  # 每5轮对话(10条消息)
            self.memory.update_summary(conv.id)
        
        return {
            'conversation_id': conv.id,
            'message': result['content'],
            'tokens': result['tokens']
        }
```

**API层增加记忆控制**

```python
# routes/chat.py 新增
@chat_bp.route('/conversations/<int:conv_id>/summary', methods=['GET'])
def get_summary(conv_id):
    """获取对话摘要"""
    conv = Conversation.query.get_or_404(conv_id)
    return success(data={'summary': conv.summary})

@chat_bp.route('/conversations/<int:conv_id>/summary', methods=['PUT'])
def update_summary(conv_id):
    """手动更新对话摘要"""
    memory = MemoryService(LLMService())
    memory.update_summary(conv_id)
    conv = Conversation.query.get(conv_id)
    return success(data={'summary': conv.summary})
```

**前端记忆展示**

```javascript
// stores/chat.js 新增
async loadSummary(convId) {
  const res = await chatAPI.getSummary(convId)
  this.currentSummary = res.data.summary
}
```

> 记忆模块做好了，聊天机器人就从"复读机"进化成了"会聊天的助手"。但记忆只是第一步——下一步是让AI能查资料（RAG）和能行动（Agent）。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| LLM状态 | 无状态，靠代码维护历史 |
| 上下文窗口 | 各模型Token限制不同，需管理 |
| 记忆策略 | 缓冲/摘要/实体三种，摘要最实用 |
| LCEL | Runnable接口，管道式组合 |
| 对话持久化 | 数据库存消息+摘要字段 |
| 记忆链 | 历史消息+摘要→LLM→更新摘要 |
| Runnable高级 | 分支路由、并行执行、源码理解 |

---

觉得有用？收藏起来，下次直接照抄。

你的AI应用怎么处理长对话？评论区聊聊你的方案。

关注怕浪猫，下期我们搞RAG——让AI拥有专属知识库，告别幻觉。

系列进度 4/23

**下章预告：** 第5章进入RAG实战——向量数据库、文本嵌入、检索器、Rerank重排、10+种RAG优化策略，让AI回答有据可依。
