# 第13章 性能优化：让 LLMOps 平台支撑高并发

性能优化不是锦上添花，是生死线。10个用户和10000个用户，代码跑起来天差地别。

我是怕浪猫，这章做性能优化。数据库索引、Redis缓存、连接池、异步任务，让你的平台从"能跑"进化到"能扛"。

---

## 13.1 数据库索引优化

**索引设计原则**

| 原则 | 说明 | 示例 |
|------|------|------|
| 高选择性 | 区分度高的字段优先 | user_id（每人唯一） |
| 常用查询 | WHERE/ORDER BY/GROUP BY | created_at（时间排序） |
| 组合索引 | 多字段联合索引 | (user_id, created_at) |
| 避免过度索引 | 索引占空间、影响写入 | 不常查询的字段不加 |

**当前索引分析**

```sql
-- 分析现有表索引
SELECT 
    schemaname, tablename, indexname, 
    idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- 找出缺少索引的慢查询
SELECT 
    query, mean_time, calls
FROM pg_stat_statements
WHERE mean_time > 100  -- 平均耗时超过100ms
ORDER BY mean_time DESC;
```

**添加索引**

```python
# migrations/add_indexes.py
from flask_migrate import Migrate

def upgrade():
    # 用户表
    db.engine.execute('CREATE INDEX idx_users_email ON users(email)')
    db.engine.execute('CREATE INDEX idx_users_github_id ON users(github_id)')
    
    # 对话表
    db.engine.execute('CREATE INDEX idx_conversations_user_id ON conversations(user_id)')
    db.engine.execute('CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC)')
    
    # 消息表
    db.engine.execute('CREATE INDEX idx_messages_conversation_id ON messages(conversation_id)')
    db.engine.execute('CREATE INDEX idx_messages_created_at ON messages(created_at)')
    
    # 知识库表
    db.engine.execute('CREATE INDEX idx_documents_kb_id ON documents(knowledge_base_id)')
    db.engine.execute('CREATE INDEX idx_documents_status ON documents(status)')
    
    # API Key表
    db.engine.execute('CREATE INDEX idx_api_keys_user_id ON api_keys(user_id)')
    db.engine.execute('CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash)')
    
    # 调用日志表（高频写入，少查询，索引要精简）
    db.engine.execute('CREATE INDEX idx_api_logs_created_at ON api_call_logs(created_at)')
    db.engine.execute('CREATE INDEX idx_api_logs_user_id ON api_call_logs(user_id)')
```

**索引使用监控**

```python
# services/db_optimize_service.py
class DBOptimizeService:
    def analyze_slow_queries(self):
        """分析慢查询"""
        sql = """
        SELECT 
            query,
            calls,
            total_time,
            mean_time,
            rows
        FROM pg_stat_statements
        WHERE mean_time > 50
        ORDER BY mean_time DESC
        LIMIT 20;
        """
        result = db.engine.execute(sql)
        return [dict(r) for r in result]
    
    def suggest_indexes(self, table_name):
        """建议索引"""
        # 分析该表的查询模式
        sql = f"""
        SELECT 
            query
        FROM pg_stat_statements
        WHERE query LIKE '%{table_name}%'
        ORDER BY calls DESC
        LIMIT 50;
        """
        # 解析WHERE条件，建议索引
        # 这需要更复杂的逻辑，这里简化
        return []
```

---

## 13.2 Redis 缓存策略

**缓存架构**

```
请求 → 查Redis → 命中 → 返回
              ↓ 未命中
             查数据库 → 写Redis → 返回
```

**缓存策略对比**

| 策略 | 原理 | 适用场景 |
|------|------|---------|
| Cache-Aside | 应用层管理缓存 | 通用 |
| Read-Through | 缓存层自动加载 | 读多写少 |
| Write-Through | 写时同步更新缓存 | 一致性要求高 |
| Write-Behind | 异步写数据库 | 写多读少 |

**Cache-Aside实现**

```python
# services/cache_service.py
import json
import redis
from config import Config

class CacheService:
    def __init__(self):
        self.redis = redis.Redis.from_url(Config.REDIS_URL)
    
    def get(self, key):
        """获取缓存"""
        data = self.redis.get(key)
        if data:
            return json.loads(data)
        return None
    
    def set(self, key, value, ttl=3600):
        """设置缓存"""
        self.redis.setex(key, ttl, json.dumps(value))
    
    def delete(self, key):
        """删除缓存"""
        self.redis.delete(key)
    
    def delete_pattern(self, pattern):
        """删除匹配模式的缓存"""
        keys = self.redis.keys(pattern)
        if keys:
            self.redis.delete(*keys)
```

**缓存使用场景**

```python
# 1. 用户信息缓存
def get_user_info(user_id):
    cache_key = f"user:{user_id}"
    cached = cache_service.get(cache_key)
    if cached:
        return cached
    
    user = User.query.get(user_id)
    user_data = user.to_dict()
    
    cache_service.set(cache_key, user_data, ttl=3600)
    return user_data

# 2. 对话列表缓存
def get_conversation_list(user_id):
    cache_key = f"conv_list:{user_id}"
    cached = cache_service.get(cache_key)
    if cached:
        return cached
    
    convs = Conversation.query.filter_by(user_id=user_id).all()
    conv_list = [c.to_dict() for c in convs]
    
    cache_service.set(cache_key, conv_list, ttl=300)  # 5分钟
    return conv_list

# 3. 知识库文档缓存
def get_kb_documents(kb_id):
    cache_key = f"kb_docs:{kb_id}"
    cached = cache_service.get(cache_key)
    if cached:
        return cached
    
    docs = Document.query.filter_by(knowledge_base_id=kb_id).all()
    doc_list = [d.to_dict() for d in docs]
    
    cache_service.set(cache_key, doc_list, ttl=600)
    return doc_list
```

**缓存失效策略**

```python
# 当用户信息更新时，删除缓存
def update_user(user_id, data):
    user = User.query.get(user_id)
    user.username = data.get('username', user.username)
    db.session.commit()
    
    # 删除缓存
    cache_service.delete(f"user:{user_id}")

# 当对话列表变化时，删除缓存
def create_conversation(user_id, title):
    conv = Conversation(user_id=user_id, title=title)
    db.session.add(conv)
    db.session.commit()
    
    # 删除对话列表缓存
    cache_service.delete(f"conv_list:{user_id}")
    return conv
```

---

## 13.3 数据库连接池配置

**SQLAlchemy连接池配置**

```python
# config.py
class Config:
    # 连接池配置
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,          # 连接池大小
        'max_overflow': 20,        # 超出pool_size后最多创建的连接数
        'pool_timeout': 30,        # 获取连接的超时时间
        'pool_recycle': 1800,      # 连接回收时间（30分钟）
        'pool_pre_ping': True,     # 每次获取连接前ping一下
    }
```

**连接池监控**

```python
# 监控连接池状态
def get_pool_status():
    engine = db.engine
    return {
        "pool_size": engine.pool.size(),
        "checked_in": engine.pool.checkedin(),
        "checked_out": engine.pool.checkedout(),
        "overflow": engine.pool.overflow(),
        "invalidated": engine.pool.invalidated()
    }
```

**连接泄漏检测**

```python
# 在请求结束时检查连接是否释放
@app.teardown_appcontext
def check_db_connection(exception):
    if exception:
        db.session.rollback()
    db.session.close()
```

---

## 13.4 异步任务与Celery优化

**Celery配置优化**

```python
# celery_config.py
from celery import Celery

celery = Celery(
    'llmops',
    broker='redis://localhost:6379/0',
    backend='redis://localhost:6379/1'
)

celery.conf.update(
    # 并发数（根据CPU核数设置）
    worker_concurrency=4,
    # 每个worker预取任务数
    worker_prefetch_multiplier=4,
    # 任务结果过期时间
    result_expires=3600,
    # 任务超时
    task_time_limit=300,
    # 任务软超时
    task_soft_time_limit=240,
    # 任务拒绝后重入队
    task_reject_on_worker_lost=True,
    # 任务确认机制
    task_acks_late=True,
)
```

**任务拆分**

```python
# 不好的做法：一个任务处理所有文档
@celery.task
def process_knowledge_base(kb_id):
    docs = Document.query.filter_by(knowledge_base_id=kb_id).all()
    for doc in docs:
        process_document(doc.id)  # 可能很慢

# 好的做法：每个文档一个任务
@celery.task
def process_document(doc_id):
    # 处理单个文档
    pass

def process_knowledge_base(kb_id):
    docs = Document.query.filter_by(knowledge_base_id=kb_id).all()
    for doc in docs:
        process_document.delay(doc.id)  # 异步处理
```

**任务结果回调**

```python
@celery.task(bind=True)
def process_document(self, doc_id):
    try:
        self.update_state(state='PROCESSING', meta={'progress': 0})
        # 处理逻辑
        self.update_state(state='PROCESSING', meta={'progress': 50})
        # 继续处理
        self.update_state(state='SUCCESS', meta={'progress': 100})
        return {'status': 'done'}
    except Exception as e:
        self.update_state(state='FAILURE', meta={'error': str(e)})
        raise
```

---

## 13.5 前端性能优化

**代码分割**

```javascript
// router/index.js
const routes = [
  {
    path: '/chat',
    component: () => import('@/views/ChatView.vue')  // 懒加载
  },
  {
    path: '/knowledge',
    component: () => import('@/views/KnowledgeView.vue')
  }
]
```

**虚拟滚动（长列表）**

```vue
<!-- 使用vue-virtual-scroller处理长对话列表 -->
<template>
  <RecycleScroller
    :items="messages"
    :item-size="80"
    key-field="id"
    class="message-list"
  >
    <template #default="{ item }">
      <div class="message-item">
        {{ item.content }}
      </div>
    </template>
  </RecycleScroller>
</template>
```

**防抖与节流**

```javascript
// 搜索防抖
import { debounce } from 'lodash-es'

const searchKnowledge = debounce(async (query) => {
  const res = await kbAPI.search({ query })
  searchResults.value = res.data
}, 300)

// 滚动节流
import { throttle } from 'lodash-es'

const handleScroll = throttle(() => {
  // 加载更多
}, 200)
```

---

## 13.6 压测与性能基准

**压测脚本**

```python
# tests/load_test.py
import asyncio
import aiohttp
import time

async def make_request(session, url, data):
    async with session.post(url, json=data) as response:
        return await response.json()

async def run_load_test(num_users=100, num_requests=10):
    url = "http://localhost:5000/api/v1/chat/completions"
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        for i in range(num_users):
            for j in range(num_requests):
                data = {
                    "message": f"测试消息 {i}-{j}",
                    "conversation_id": None
                }
                tasks.append(make_request(session, url, data))
        
        start = time.time()
        results = await asyncio.gather(*tasks)
        elapsed = time.time() - start
        
        print(f"总请求数: {len(tasks)}")
        print(f"总耗时: {elapsed:.2f}s")
        print(f"QPS: {len(tasks) / elapsed:.2f}")
        print(f"平均响应时间: {elapsed / len(tasks) * 1000:.2f}ms")

if __name__ == '__main__':
    asyncio.run(run_load_test())
```

**性能基准**

| 指标 | 目标 | 当前 | 优化后 |
|------|------|------|--------|
| 首页加载 | <1s | 2.5s | 0.8s |
| 聊天响应 | <2s | 5s | 1.5s |
| API响应 | <200ms | 500ms | 150ms |
| 并发用户 | 1000 | 100 | 1000+ |
| 数据库QPS | 1000 | 200 | 800+ |

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 数据库索引 | 高选择性+常用查询+组合索引 |
| Redis缓存 | Cache-Aside+合理TTL+失效策略 |
| 连接池 | pool_size+max_overflow+监控 |
| Celery | 任务拆分+并发优化+状态回调 |
| 前端优化 | 代码分割+虚拟滚动+防抖节流 |
| 压测 | 并发测试+性能基准+持续优化 |

---

觉得有用？收藏起来，下次直接照抄。

你的平台性能瓶颈在哪里？评论区聊聊优化经验。

关注怕浪猫，下期我们讲加解密——JSON Web Token、API Key加密存储、敏感数据保护，让平台更安全。

系列进度 13/23

**下章预告：** 第14章加解密——JWT签名验证、API Key加密存储、数据库敏感字段加密、HTTPS配置，让数据在传输和存储中安全无虞。
