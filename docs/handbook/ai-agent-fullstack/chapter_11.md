# 第11章 开放 API 模块开发：让外部应用接入 LLMOps

你的LLMOps平台不能只是个聊天工具，得成为AI能力中心——其他应用通过API调用你的平台，这才是正道。

我是怕浪猫，这章做开放API。让第三方应用能通过API Key + 接口调用你的LLMOps平台，就像调用OpenAI API一样。

---

## 11.1 开放 API 架构设计

**架构总览**

```
第三方应用 → API网关 → 鉴权中间件 → 频率限制 → 路由分发 → 业务逻辑
                ↓
         秘钥管理(生成/吊销)
         频率限制(令牌桶)
         日志记录(调用统计)
```

**核心组件**

| 组件 | 职责 | 技术选型 |
|------|------|---------|
| API网关 | 路由分发、统一入口 | Flask Blueprint |
| 鉴权中间件 | 验证API Key | 自定义装饰器 |
| 频率限制 | 限流、防刷 | Redis + 令牌桶 |
| 秘钥管理 | 生成/吊销API Key | 数据库 + 加密 |
| 日志记录 | 调用记录、统计 | 数据库 + 异步写入 |

**开放API列表**

| 接口 | 方法 | 说明 |
|------|------|------|
| /v1/chat/completions | POST | 聊天补全 |
| /v1/chat/completions/stream | POST | 流式聊天补全 |
| /v1/knowledge/bases | GET | 知识库列表 |
| /v1/knowledge/search | POST | 知识库检索 |
| /v1/apps | GET | 应用列表 |
| /v1/apps/{id}/run | POST | 运行指定应用 |

---

## 11.2 秘钥管理：生成、验证、吊销

**API Key数据模型**

```python
# models/api_key.py
import secrets
import hashlib

class ApiKey(db.Model):
    __tablename__ = 'api_keys'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    name = db.Column(db.String(100))  # Key名称，便于管理
    key_hash = db.Column(db.String(64), unique=True)  # Key的hash值
    key_prefix = db.Column(db.String(8))  # Key前缀，用于展示
    is_active = db.Column(db.Boolean, default=True)
    rate_limit = db.Column(db.Integer, default=100)  # 每分钟请求限制
    total_calls = db.Column(db.Integer, default=0)  # 总调用次数
    last_used_at = db.Column(db.DateTime)
    expires_at = db.Column(db.DateTime)  # 过期时间
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    @staticmethod
    def generate_key():
        """生成API Key"""
        raw_key = f"sk-{secrets.token_hex(24)}"  # sk-开头，48位hex
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:8]  # sk-xxxx
        return raw_key, key_hash, key_prefix
    
    def verify(self, raw_key):
        """验证Key是否匹配"""
        return hashlib.sha256(raw_key.encode()).hexdigest() == self.key_hash
```

**秘钥管理API**

```python
# routes/api_key.py
key_bp = Blueprint('api_keys', __name__)

@key_bp.route('/', methods=['POST'])
@token_required
def create_key():
    """创建API Key"""
    data = request.json
    raw_key, key_hash, key_prefix = ApiKey.generate_key()
    
    api_key = ApiKey(
        user_id=g.current_user_id,
        name=data.get('name', '默认密钥'),
        key_hash=key_hash,
        key_prefix=key_prefix,
        rate_limit=data.get('rate_limit', 100),
        expires_at=datetime.utcnow() + timedelta(days=365)  # 1年有效期
    )
    db.session.add(api_key)
    db.session.commit()
    
    # 只有创建时返回完整Key，之后只显示前缀
    return success(data={
        'id': api_key.id,
        'key': raw_key,  # 完整Key，只展示一次
        'prefix': key_prefix,
        'name': api_key.name,
        'rate_limit': api_key.rate_limit
    })

@key_bp.route('/', methods=['GET'])
@token_required
def list_keys():
    """列出用户的API Key"""
    keys = ApiKey.query.filter_by(user_id=g.current_user_id).all()
    return success(data=[{
        'id': k.id,
        'prefix': k.key_prefix,
        'name': k.name,
        'is_active': k.is_active,
        'rate_limit': k.rate_limit,
        'total_calls': k.total_calls,
        'last_used_at': k.last_used_at.isoformat() if k.last_used_at else None,
        'expires_at': k.expires_at.isoformat() if k.expires_at else None
    } for k in keys])

@key_bp.route('/<int:key_id>/revoke', methods=['POST'])
@token_required
def revoke_key(key_id):
    """吊销API Key"""
    api_key = ApiKey.query.filter_by(
        id=key_id, user_id=g.current_user_id
    ).first_or_404()
    api_key.is_active = False
    db.session.commit()
    return success()
```

> API Key只展示一次是安全常识。就像GitHub的Token，生成后只显示一次，丢了就重新生成，不提供查看。

---

## 11.3 频率限制：基于 Redis 的令牌桶算法

**令牌桶算法原理**

```
固定速率往桶里放令牌 → 每次请求取一个令牌 → 桶空则拒绝
```

**Redis实现**

```python
# services/rate_limit_service.py
import redis
import time

class RateLimitService:
    def __init__(self, redis_client):
        self.redis = redis_client
    
    def check_rate_limit(self, key, limit=100, window=60):
        """令牌桶限流
        
        Args:
            key: 限流key（如api_key_id）
            limit: 窗口内最大请求数
            window: 窗口大小（秒）
        """
        now = time.time()
        window_start = now - window
        
        pipe = self.redis.pipeline()
        
        # 1. 移除窗口外的记录
        pipe.zremrangebyscore(f"rate_limit:{key}", 0, window_start)
        
        # 2. 获取当前窗口内的请求数
        pipe.zcard(f"rate_limit:{key}")
        
        # 3. 添加当前请求
        pipe.zadd(f"rate_limit:{key}", {str(now): now})
        
        # 4. 设置过期时间
        pipe.expire(f"rate_limit:{key}", window)
        
        results = pipe.execute()
        current_count = results[1]
        
        if current_count >= limit:
            return {
                "allowed": False,
                "remaining": 0,
                "reset_at": now + window
            }
        
        return {
            "allowed": True,
            "remaining": limit - current_count - 1,
            "reset_at": now + window
        }
```

**频率限制中间件**

```python
# middleware/rate_limit_middleware.py
from functools import wraps
from flask import request, g

def rate_limit_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = getattr(g, 'api_key', None)
        if not api_key:
            return f(*args, **kwargs)
        
        limit_service = RateLimitService(redis_client)
        result = limit_service.check_rate_limit(
            key=f"api_key:{api_key.id}",
            limit=api_key.rate_limit
        )
        
        if not result["allowed"]:
            return error("请求频率超限，请稍后重试", 429, headers={
                "Retry-After": int(result["reset_at"] - time.time()),
                "X-RateLimit-Limit": api_key.rate_limit,
                "X-RateLimit-Remaining": 0
            })
        
        # 设置响应头
        g.rate_limit_headers = {
            "X-RateLimit-Limit": api_key.rate_limit,
            "X-RateLimit-Remaining": result["remaining"]
        }
        
        return f(*args, **kwargs)
    return decorated
```

---

## 11.4 鉴权中间件开发

**API Key鉴权**

```python
# middleware/api_auth_middleware.py
from functools import wraps
from flask import request, g

def api_key_required(f):
    """API Key鉴权装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        # 从Header获取API Key
        api_key_str = request.headers.get('Authorization', '')
        if api_key_str.startswith('Bearer '):
            api_key_str = api_key_str[7:]
        
        if not api_key_str:
            return error("缺少API Key", 401)
        
        # 验证Key
        key_hash = hashlib.sha256(api_key_str.encode()).hexdigest()
        api_key = ApiKey.query.filter_by(key_hash=key_hash, is_active=True).first()
        
        if not api_key:
            return error("无效的API Key", 401)
        
        # 检查过期
        if api_key.expires_at and api_key.expires_at < datetime.utcnow():
            return error("API Key已过期", 401)
        
        # 更新使用统计
        api_key.total_calls += 1
        api_key.last_used_at = datetime.utcnow()
        db.session.commit()
        
        # 存入上下文
        g.api_key = api_key
        g.current_user_id = api_key.user_id
        
        return f(*args, **kwargs)
    return decorated
```

**组合鉴权：JWT或API Key**

```python
def auth_required(f):
    """支持JWT或API Key两种鉴权方式"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            
            # 先尝试JWT
            payload = auth_service.verify_token(token)
            if payload:
                g.current_user_id = payload['user_id']
                g.auth_type = 'jwt'
                return f(*args, **kwargs)
            
            # 再尝试API Key
            key_hash = hashlib.sha256(token.encode()).hexdigest()
            api_key = ApiKey.query.filter_by(key_hash=key_hash, is_active=True).first()
            if api_key:
                g.api_key = api_key
                g.current_user_id = api_key.user_id
                g.auth_type = 'api_key'
                return f(*args, **kwargs)
        
        return error("未认证", 401)
    return decorated
```

---

## 11.5 开放 API 路由设计

**兼容OpenAI API格式**

```python
# routes/open_api.py
open_bp = Blueprint('open_api', __name__, url_prefix='/v1')

@open_bp.route('/chat/completions', methods=['POST'])
@api_key_required
@rate_limit_required
def chat_completions():
    """聊天补全（兼容OpenAI格式）"""
    data = request.json
    
    # 验证参数
    messages = data.get('messages', [])
    model = data.get('model', 'gpt-4')
    temperature = data.get('temperature', 0.7)
    stream = data.get('stream', False)
    
    if not messages:
        return error("messages不能为空", 400)
    
    # 流式响应
    if stream:
        return stream_chat(messages, model, temperature)
    
    # 非流式
    result = chat_service.completions(
        message=messages[-1]['content'],
        model=model,
        temperature=temperature
    )
    
    # 返回OpenAI兼容格式
    return jsonify({
        "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
        "object": "chat.completion",
        "model": model,
        "choices": [{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": result['message']
            },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": result.get('tokens', {}).get('prompt', 0),
            "completion_tokens": result.get('tokens', {}).get('completion', 0),
            "total_tokens": result.get('tokens', {}).get('total', 0)
        }
    })

@open_bp.route('/models', methods=['GET'])
@api_key_required
def list_models():
    """列出可用模型（兼容OpenAI格式）"""
    models = [
        {"id": "gpt-4", "object": "model", "owned_by": "openai"},
        {"id": "gpt-4o", "object": "model", "owned_by": "openai"},
        {"id": "gpt-3.5-turbo", "object": "model", "owned_by": "openai"},
    ]
    return jsonify({"object": "list", "data": models})
```

> 兼容OpenAI API格式是让第三方应用无缝接入的关键。用OpenAI SDK的应用，只需改base_url就能调用你的平台。

---

## 11.6 API 调用日志与统计

**调用日志模型**

```python
class ApiCallLog(db.Model):
    __tablename__ = 'api_call_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    api_key_id = db.Column(db.Integer, db.ForeignKey('api_keys.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    endpoint = db.Column(db.String(200))
    method = db.Column(db.String(10))
    request_body = db.Column(db.Text)  # 脱敏后的请求体
    response_status = db.Column(db.Integer)
    response_time_ms = db.Column(db.Integer)
    prompt_tokens = db.Column(db.Integer)
    completion_tokens = db.Column(db.Integer)
    total_tokens = db.Column(db.Integer)
    ip_address = db.Column(db.String(50))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
```

**异步日志记录**

```python
# 中间件：记录API调用
@app.after_request
def log_api_call(response):
    if request.path.startswith('/v1/'):
        log_data = {
            "api_key_id": getattr(g, 'api_key', None) and g.api_key.id,
            "user_id": getattr(g, 'current_user_id', None),
            "endpoint": request.path,
            "method": request.method,
            "response_status": response.status_code,
            "ip_address": request.remote_addr
        }
        
        # 异步写入日志
        log_api_call.delay(log_data)
    
    return response

@celery.task
def log_api_call(data):
    """异步写入API调用日志"""
    log = ApiCallLog(**data)
    db.session.add(log)
    db.session.commit()
```

**统计面板API**

```python
@key_bp.route('/stats', methods=['GET'])
@token_required
def get_stats():
    """获取API调用统计"""
    from sqlalchemy import func
    
    # 今日调用量
    today = datetime.utcnow().date()
    today_calls = ApiCallLog.query.filter(
        ApiCallLog.user_id == g.current_user_id,
        func.date(ApiCallLog.created_at) == today
    ).count()
    
    # Token消耗
    token_usage = db.session.query(
        func.sum(ApiCallLog.total_tokens)
    ).filter(
        ApiCallLog.user_id == g.current_user_id,
        func.date(ApiCallLog.created_at) == today
    ).scalar() or 0
    
    # 7天趋势
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    daily_stats = db.session.query(
        func.date(ApiCallLog.created_at).label('date'),
        func.count(ApiCallLog.id).label('calls'),
        func.sum(ApiCallLog.total_tokens).label('tokens')
    ).filter(
        ApiCallLog.user_id == g.current_user_id,
        ApiCallLog.created_at >= seven_days_ago
    ).group_by(func.date(ApiCallLog.created_at)).all()
    
    return success(data={
        "today_calls": today_calls,
        "today_tokens": token_usage,
        "daily_stats": [{
            "date": str(s.date),
            "calls": s.calls,
            "tokens": s.tokens or 0
        } for s in daily_stats]
    })
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| 架构设计 | 网关+鉴权+限流+日志四层架构 |
| 秘钥管理 | 生成一次、hash存储、只展示前缀 |
| 频率限制 | Redis令牌桶，滑动窗口计数 |
| 鉴权中间件 | JWT+API Key双模式 |
| OpenAI兼容 | 格式兼容，base_url替换即可接入 |
| 调用日志 | 异步写入，脱敏存储 |
| 统计面板 | 今日/7天趋势，Token消耗统计 |

---

觉得有用？收藏起来，下次直接照抄。

你的开放API是怎么设计的？评论区聊聊。

关注怕浪猫，下期我们上线部署——Docker容器化、CI/CD流水线、K8s弹性伸缩，让平台从开发环境走向生产环境。

系列进度 11/23

**下章预告：** 第12章部署上线——Docker镜像构建、Docker Compose编排、CI/CD流水线、Nginx配置，让LLMOps平台稳定跑在生产环境。
