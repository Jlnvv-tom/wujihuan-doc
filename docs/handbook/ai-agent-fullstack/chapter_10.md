# 第10章 审核模块开发：确保 AI 生成合规内容

AI生成了违规内容，责任算谁的？平台方。所以审核不是可选项，是必选项。

我是怕浪猫，这章做内容审核。LLMOps平台的审核要做两层——输入审核（用户不能说坏话）和输出审核（AI不能说坏话）。双保险，才能不留死角。

---

## 10.1 OpenAI 内置审核功能

**OpenAI Moderation API**

OpenAI提供了免费的内容审核API，可以检测暴力、仇恨、自残、性内容等违规类别。

```python
from openai import OpenAI

client = OpenAI()

def moderate_content(text):
    """使用OpenAI Moderation API审核内容"""
    response = client.moderations.create(input=text)
    result = response.results[0]
    
    if result.flagged:
        categories = [k for k, v in result.categories.model_dump().items() if v]
        return {
            "flagged": True,
            "categories": categories,
            "category_scores": result.category_scores.model_dump()
        }
    return {"flagged": False}
```

**审核类别**

| 类别 | 说明 | 危险等级 |
|------|------|---------|
| sexual | 性内容 | 中 |
| hate | 仇恨言论 | 高 |
| violence | 暴力内容 | 高 |
| self-harm | 自残内容 | 高 |
| sexual/minors | 涉及未成年人的性内容 | 极高 |
| hate/threat | 威胁性仇恨言论 | 极高 |
| violence/graphic | 图形暴力 | 高 |

**集成到聊天流程**

```python
# services/audit_service.py
class AuditService:
    def __init__(self, llm_service):
        self.client = OpenAI(api_key=Config.OPENAI_API_KEY)
        self.llm = llm_service
    
    def audit_input(self, text):
        """审核输入（用户消息）"""
        result = self.client.moderations.create(input=text).results[0]
        if result.flagged:
            return {
                "pass": False,
                "reason": f"输入内容被OpenAI审核标记为违规：{list(result.categories.model_dump().items())}"
            }
        return {"pass": True}
    
    def audit_output(self, text):
        """审核输出（AI回复）"""
        result = self.client.moderations.create(input=text).results[0]
        if result.flagged:
            return {
                "pass": False,
                "reason": f"AI生成内容被OpenAI审核标记为违规",
                "categories": [k for k, v in result.categories.model_dump().items() if v]
            }
        return {"pass": True}
```

---

## 10.2 LangChain 审核链

**LangChain的审核链**

LangChain提供了内置的审核链，可以方便地集成到LCEL管道中。

```python
from langchain.chains import OpenAIModerationChain
from langchain_openai import ChatOpenAI

# 创建审核链
moderation_chain = OpenAIModerationChain.from_llm(
    llm=ChatOpenAI(),
    error="输入内容不符合规范，请修改后重试"
)

# 集成到完整链
from langchain_core.runnables import RunnablePassthrough

full_chain = (
    {"input": RunnablePassthrough()}
    | RunnableLambda(lambda x: {
        "input": x["input"],
        "moderation_result": moderation_chain.invoke(x["input"])
    })
    | prompt
    | llm
    | parser
)
```

**自定义审核链**

```python
from langchain_core.runnables import RunnableLambda

def audit_input_chain(input_text):
    """输入审核链"""
    audit_result = audit_service.audit_input(input_text)
    if not audit_result["pass"]:
        raise ValueError(audit_result["reason"])
    return input_text

def audit_output_chain(llm_output):
    """输出审核链"""
    audit_result = audit_service.audit_output(llm_output)
    if not audit_result["pass"]:
        return "抱歉，我无法生成符合要求的内容。请换个方式提问。"
    return llm_output

# 集成到LCEL
chain = (
    RunnableLambda(audit_input_chain)
    | prompt
    | llm
    | parser
    | RunnableLambda(audit_output_chain)
)
```

---

## 10.3 自定义审核功能开发架构

**多层审核架构**

```
用户输入 → [输入审核层] → LLM处理 → [输出审核层] → 返回用户
            ↓ flag               ↓ flag
          拒绝并提示          替换/拒绝
```

**审核策略配置**

```python
# config/audit_config.py
AUDIT_CONFIG = {
    "input": {
        "enable": True,
        "strategies": ["openai", "keyword", "regex"],
        "openai_threshold": 0.5,  # OpenAI审核分数阈值
        "reject_message": "您的输入包含不当内容，请修改后重试"
    },
    "output": {
        "enable": True,
        "strategies": ["openai", "keyword"],
        "on_fail": "replace",  # replace（替换）或 reject（拒绝）
        "replace_message": "抱歉，我无法回答这个问题"
    },
    "whitelist": [],  # 白名单：不审核的用户/应用
    "blacklist": []   # 黑名单：直接拒绝
}
```

**审核服务架构**

```python
# services/audit_service.py
class AuditService:
    def __init__(self):
        self.strategies = {
            "openai": OpenAIAuditStrategy(),
            "keyword": KeywordAuditStrategy(),
            "regex": RegexAuditStrategy(),
            "llm": LLMAuditStrategy()
        }
    
    def audit(self, text, audit_type="input", config=None):
        """执行审核"""
        if config is None:
            config = AUDIT_CONFIG
        
        results = []
        for strategy_name in config[audit_type]["strategies"]:
            strategy = self.strategies.get(strategy_name)
            if strategy:
                result = strategy.audit(text)
                results.append(result)
                if not result["pass"]:
                    break  # 一个策略失败就停止
        
        passed = all(r["pass"] for r in results)
        
        return {
            "pass": passed,
            "type": audit_type,
            "results": results,
            "action": self._get_action(passed, audit_type, config)
        }
    
    def _get_action(self, passed, audit_type, config):
        if passed:
            return "allow"
        if audit_type == "input":
            return "reject"
        elif audit_type == "output":
            return config["output"].get("on_fail", "replace")
```

---

## 10.4 基于关键词的审核实现

**关键词库设计**

```python
# data/audit_keywords.json
{
  "violence": ["暴力", "杀", "炸", "攻击"],
  "hate": ["仇恨", "歧视", "种族"],
  "adult": ["色情", "裸", "性"],
  "political": ["政治敏感词示例"],
  "custom": ["竞品名称", "内部机密"]
}
```

**关键词审核实现**

```python
import json
import re

class KeywordAuditStrategy:
    def __init__(self, keyword_file="data/audit_keywords.json"):
        with open(keyword_file, 'r', encoding='utf-8') as f:
            self.keywords = json.load(f)
        
        # 编译正则表达式（提升性能）
        self.compiled = {}
        for category, words in self.keywords.items():
            self.compiled[category] = [
                re.compile(word, re.IGNORECASE) for word in words
            ]
    
    def audit(self, text):
        """关键词审核"""
        matched = []
        
        for category, patterns in self.compiled.items():
            for pattern in patterns:
                if pattern.search(text):
                    matched.append({
                        "category": category,
                        "pattern": pattern.pattern
                    })
        
        if matched:
            return {
                "pass": False,
                "strategy": "keyword",
                "matched": matched,
                "reason": f"命中关键词：{[m['pattern'] for m in matched]}"
            }
        
        return {"pass": True, "strategy": "keyword"}
```

**敏感词替换**

```python
def mask_sensitive_words(text, keywords):
    """替换敏感词为***"""
    for word in keywords:
        text = text.replace(word, "***")
    return text
```

---

## 10.5 流式输出模式下的关键词审核

**流式输出的审核挑战**

流式输出是逐chunk返回的，如果在全部生成完才审核，会出现"先显示违规内容再删除"的问题。需要边生成边审核。

**流式审核方案**

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| 缓冲区审核 | 攒够N个字符审核一次 | 简单 | 可能漏检 |
| 实时审核 | 每个chunk都审核 | 最安全 | 性能开销大 |
| 两阶段审核 | 先快速过滤+后完整审核 | 平衡 | 实现复杂 |

**缓冲区审核实现**

```python
def stream_with_audit(self, messages, buffer_size=50):
    """带审核的流式输出"""
    buffer = ""
    
    stream = self.llm.stream(messages)
    
    for chunk in stream:
        buffer += chunk
        yield chunk
        
        # 缓冲区达到阈值，审核一次
        if len(buffer) >= buffer_size:
            audit_result = self.audit_service.audit_output(buffer)
            if not audit_result["pass"]:
                # 停止生成
                yield "\n[内容审核未通过，生成已停止]"
                return
            
            # 清空缓冲区
            buffer = ""
    
    # 最后一段
    if buffer:
        audit_result = self.audit_service.audit_output(buffer)
        if not audit_result["pass"]:
            yield "\n[内容审核未通过]"
```

**前端流式审核处理**

```javascript
// 前端处理审核中断
const streamChat = async (data, onChunk, onAuditFail) => {
  const response = await fetch('/api/v1/chat/stream', {...})
  const reader = response.body.getReader()
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    const text = decoder.decode(value)
    const lines = text.split('\n')
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        
        if (data.audit_fail) {
          // 审核失败
          onAuditFail(data.reason)
          return
        }
        
        if (data.content) {
          onChunk(data.content)
        }
      }
    }
  }
}
```

---

## 10.6 应用编排草稿配置：输入输出审核、记忆、版本回退

**审核配置持久化**

```python
# models/audit_config.py
class AuditConfig(db.Model):
    __tablename__ = 'audit_configs'
    
    id = db.Column(db.Integer, primary_key=True)
    app_id = db.Column(db.Integer, db.ForeignKey('apps.id'))
    input_audit_enabled = db.Column(db.Boolean, default=True)
    output_audit_enabled = db.Column(db.Boolean, default=True)
    keyword_blacklist = db.Column(db.Text)  # JSON数组
    keyword_whitelist = db.Column(db.Text)   # JSON数组
    openai_audit_enabled = db.Column(db.Boolean, default=True)
    llm_audit_enabled = db.Column(db.Boolean, default=False)
    llm_audit_prompt = db.Column(db.Text)    # LLM审核的Prompt
    on_fail_action = db.Column(db.String(20), default='replace')
    replace_message = db.Column(db.Text, default='抱歉，我无法回答这个问题')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**审核配置API**

```python
@audit_bp.route('/configs', methods=['POST'])
def save_audit_config():
    """保存审核配置"""
    data = request.json
    app_id = data['app_id']
    
    config = AuditConfig.query.filter_by(app_id=app_id).first()
    if not config:
        config = AuditConfig(app_id=app_id)
    
    config.input_audit_enabled = data.get('input_audit_enabled', True)
    config.output_audit_enabled = data.get('output_audit_enabled', True)
    config.keyword_blacklist = json.dumps(data.get('keyword_blacklist', []))
    config.openai_audit_enabled = data.get('openai_audit_enabled', True)
    config.on_fail_action = data.get('on_fail_action', 'replace')
    
    db.session.add(config)
    db.session.commit()
    return success()

@audit_bp.route('/configs/<int:app_id>', methods=['GET'])
def get_audit_config(app_id):
    """获取审核配置"""
    config = AuditConfig.query.filter_by(app_id=app_id).first()
    if not config:
        return success(data=default_audit_config())
    
    return success(data={
        "input_audit_enabled": config.input_audit_enabled,
        "output_audit_enabled": config.output_audit_enabled,
        "keyword_blacklist": json.loads(config.keyword_blacklist or '[]'),
        "openai_audit_enabled": config.openai_audit_enabled,
        "on_fail_action": config.on_fail_action
    })
```

**与编排系统集成**

```python
# 在应用编排时，审核配置生效
def execute_app_with_audit(app_id, user_input):
    """执行应用（带审核）"""
    
    # 1. 加载审核配置
    audit_config = AuditConfig.query.filter_by(app_id=app_id).first()
    
    # 2. 输入审核
    if audit_config and audit_config.input_audit_enabled:
        audit_result = audit_service.audit(user_input, "input")
        if not audit_result["pass"]:
            return {
                "error": "输入审核未通过",
                "reason": audit_result.get("reason")
            }
    
    # 3. 执行应用逻辑
    result = execute_app(app_id, user_input)
    
    # 4. 输出审核
    if audit_config and audit_config.output_audit_enabled:
        audit_result = audit_service.audit(result["output"], "output")
        if not audit_result["pass"]:
            if audit_config.on_fail_action == "replace":
                result["output"] = audit_config.replace_message
            else:
                return {"error": "输出审核未通过"}
    
    return result
```

**前端审核配置界面**

```vue
<!-- views/AuditConfigView.vue -->
<template>
  <div class="p-6">
    <h2 class="text-xl font-bold mb-6">审核配置</h2>
    
    <div class="space-y-6">
      <!-- 输入审核 -->
      <div class="border p-4 rounded">
        <div class="flex items-center justify-between mb-4">
          <span>输入审核</span>
          <el-switch v-model="config.input_audit_enabled" />
        </div>
        <p class="text-sm text-gray-500">开启后，用户消息会先经过审核</p>
      </div>
      
      <!-- 输出审核 -->
      <div class="border p-4 rounded">
        <div class="flex items-center justify-between mb-4">
          <span>输出审核</span>
          <el-switch v-model="config.output_audit_enabled" />
        </div>
        <p class="text-sm text-gray-500">开启后，AI回复会先经过审核</p>
      </div>
      
      <!-- 关键词黑名单 -->
      <div class="border p-4 rounded">
        <h3 class="font-semibold mb-2">关键词黑名单</h3>
        <el-tag v-for="(word, i) in config.keyword_blacklist" :key="i"
                closable @close="removeKeyword(i)"
                class="mr-2 mb-2">
          {{ word }}
        </el-tag>
        <el-input v-model="newKeyword" @keyup.enter="addKeyword"
                  placeholder="输入关键词后回车" class="mt-2" />
      </div>
      
      <!-- 审核失败处理 -->
      <div class="border p-4 rounded">
        <h3 class="font-semibold mb-2">审核失败处理</h3>
        <el-radio-group v-model="config.on_fail_action">
          <el-radio value="replace">替换为固定回复</el-radio>
          <el-radio value="reject">拒绝回复</el-radio>
        </el-radio-group>
        <el-input v-if="config.on_fail_action === 'replace'"
                  v-model="config.replace_message"
                  type="textarea" class="mt-2" />
      </div>
      
      <el-button type="primary" @click="saveConfig">保存配置</el-button>
    </div>
  </div>
</template>
```

> 审核要做，但不要做死。让用户自己配置审核策略、关键词黑白名单、失败处理方式，LLMOps平台才能真正商业化。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| OpenAI审核 | Moderation API，免费，6大类别 |
| LangChain审核链 | 管道式集成，一行代码启用 |
| 自定义审核 | 多层架构：关键词+正则+LLM |
| 关键词审核 | 预编译正则，提升性能 |
| 流式审核 | 缓冲区审核，平衡性能与安全 |
| 配置持久化 | 审核配置与应用绑定，可定制 |
| 前端配置界面 | 开关+关键词管理+失败处理选择 |

---

觉得有用？收藏起来，下次直接照抄。

你的平台是怎么做内容审核的？用了什么方案？评论区分享。

关注怕浪猫，下期我们打通外部世界——开放API模块，让其他应用也能调用你的LLMOps平台。

系列进度 10/23

**下章预告：** 第11章开放API模块——开放API架构设计、秘钥管理、频率限制、鉴权中间件，让你的平台成为AI能力中心。
