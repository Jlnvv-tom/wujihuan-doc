# 第14章 加解密模块：保护敏感数据安全

API Key明文存数据库？等着被拖库吧。这章做加解密，让敏感数据在存储和传输中都不裸奔。

我是怕浪猫，这章做安全加解密。JWT签名、API Key加密存储、数据库敏感字段加密、HTTPS配置，四道防线保护你的数据。

---

## 14.1 JSON Web Token 签名验证

**JWT签名原理**

```
Header + Payload → Base64URL编码 → 用密钥签名 → Signature
验证时：重新签名 → 对比Signature → 一致则有效
```

**HMAC-SHA256签名**

```python
import hmac
import hashlib
import base64
import json

def base64url_encode(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def base64url_decode(data):
    padding = 4 - len(data) % 4
    data += '=' * padding
    return base64.urlsafe_b64decode(data)

def sign_jwt(payload, secret):
    """手动实现JWT签名（理解原理）"""
    header = {"alg": "HS256", "typ": "JWT"}
    
    header_b64 = base64url_encode(json.dumps(header))
    payload_b64 = base64url_encode(json.dumps(payload))
    
    signing_input = f"{header_b64}.{payload_b64}"
    signature = hmac.new(
        secret.encode('utf-8'),
        signing_input.encode('utf-8'),
        hashlib.sha256
    ).digest()
    signature_b64 = base64url_encode(signature)
    
    return f"{signing_input}.{signature_b64}"

def verify_jwt(token, secret):
    """手动验证JWT"""
    parts = token.split('.')
    if len(parts) != 3:
        return None
    
    header_b64, payload_b64, signature_b64 = parts
    
    # 重新签名
    signing_input = f"{header_b64}.{payload_b64}"
    expected_sig = hmac.new(
        secret.encode('utf-8'),
        signing_input.encode('utf-8'),
        hashlib.sha256
    ).digest()
    expected_sig_b64 = base64url_encode(expected_sig)
    
    # 对比签名
    if signature_b64 != expected_sig_b64:
        return None
    
    # 解码payload
    payload = json.loads(base64url_decode(payload_b64))
    
    # 检查过期
    if payload.get('exp', 0) < datetime.utcnow().timestamp():
        return None
    
    return payload
```

**生产环境使用PyJWT**

```python
import jwt
from datetime import datetime, timedelta

class JWTService:
    def __init__(self, secret, algorithm='HS256'):
        self.secret = secret
        self.algorithm = algorithm
    
    def create_token(self, user_id, username, role='user', expires_hours=168):
        """创建JWT"""
        payload = {
            'user_id': user_id,
            'username': username,
            'role': role,
            'iat': datetime.utcnow(),
            'exp': datetime.utcnow() + timedelta(hours=expires_hours),
            'jti': str(uuid.uuid4())  # JWT ID，用于吊销
        }
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)
    
    def verify_token(self, token):
        """验证JWT"""
        try:
            payload = jwt.decode(
                token, 
                self.secret, 
                algorithms=[self.algorithm],
                options={'require': ['exp', 'iat']}
            )
            return payload
        except jwt.ExpiredSignatureError:
            raise AuthError('Token已过期')
        except jwt.InvalidTokenError:
            raise AuthError('无效Token')
    
    def refresh_token(self, token):
        """刷新Token"""
        payload = self.verify_token(token)
        # 移除旧的exp和iat
        payload.pop('exp', None)
        payload.pop('iat', None)
        payload.pop('jti', None)
        # 生成新Token
        return self.create_token(
            payload['user_id'],
            payload['username'],
            payload.get('role', 'user')
        )
```

**Token吊销机制**

```python
# 使用Redis存储已吊销的Token
class TokenBlacklist:
    def __init__(self, redis_client):
        self.redis = redis_client
    
    def revoke(self, token):
        """吊销Token"""
        payload = jwt.decode(token, options={'verify_signature': False})
        jti = payload.get('jti')
        exp = payload.get('exp', 0)
        ttl = max(exp - datetime.utcnow().timestamp(), 0)
        
        if ttl > 0:
            self.redis.setex(f"token_blacklist:{jti}", int(ttl), "1")
    
    def is_revoked(self, token):
        """检查Token是否已吊销"""
        payload = jwt.decode(token, options={'verify_signature': False})
        jti = payload.get('jti')
        return bool(self.redis.get(f"token_blacklist:{jti}"))
```

---

## 14.2 API Key 加密存储

**为什么API Key不能明文存储**

```
如果数据库被拖库：
  明文存储 → 攻击者直接拿到所有Key → 所有用户的API额度被盗
  Hash存储 → 攻击者拿到Hash → 无法反推Key → 安全
```

**加密存储方案**

```python
import hashlib
import secrets
from cryptography.fernet import Fernet

class ApiKeyCrypto:
    """API Key加密存储服务"""
    
    def __init__(self, encryption_key):
        self.fernet = Fernet(encryption_key)
    
    @staticmethod
    def generate_raw_key():
        """生成原始API Key"""
        return f"sk-{secrets.token_hex(24)}"
    
    @staticmethod
    def hash_key(raw_key):
        """计算Key的SHA256 Hash（用于查找）"""
        return hashlib.sha256(raw_key.encode()).hexdigest()
    
    def encrypt_key(self, raw_key):
        """加密Key（用于需要还原Key的场景，如代理转发）"""
        return self.fernet.encrypt(raw_key.encode()).decode()
    
    def decrypt_key(self, encrypted_key):
        """解密Key"""
        return self.fernet.decrypt(encrypted_key.encode()).decode()
    
    def create_api_key(self, user_id, name='默认密钥'):
        """创建API Key"""
        raw_key = self.generate_raw_key()
        key_hash = self.hash_key(raw_key)
        key_prefix = raw_key[:8]  # sk-xxxx，用于展示
        
        api_key = ApiKey(
            user_id=user_id,
            name=name,
            key_hash=key_hash,
            key_prefix=key_prefix
        )
        db.session.add(api_key)
        db.session.commit()
        
        return {
            'raw_key': raw_key,      # 只返回一次
            'key_hash': key_hash,     # 存数据库
            'key_prefix': key_prefix  # 展示用
        }
    
    def verify_api_key(self, raw_key):
        """验证API Key"""
        key_hash = self.hash_key(raw_key)
        api_key = ApiKey.query.filter_by(
            key_hash=key_hash, is_active=True
        ).first()
        
        if not api_key:
            return None
        
        if api_key.expires_at and api_key.expires_at < datetime.utcnow():
            return None
        
        return api_key
```

> API Key的处理遵循三个原则：1）只展示一次 2）Hash存储不可逆 3）验证时用Hash比对，不需要还原明文。

---

## 14.3 数据库敏感字段加密

**字段级加密**

```python
from cryptography.fernet import Fernet
import base64

class FieldEncryption:
    """数据库字段加密工具"""
    
    def __init__(self, key):
        self.fernet = Fernet(key)
    
    def encrypt(self, plaintext):
        """加密字段"""
        if not plaintext:
            return plaintext
        return self.fernet.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext):
        """解密字段"""
        if not ciphertext:
            return ciphertext
        return self.fernet.decrypt(ciphertext.encode()).decode()

# 全局实例
field_crypto = FieldEncryption(Config.FIELD_ENCRYPTION_KEY)
```

**SQLAlchemy加密字段类型**

```python
from sqlalchemy import TypeDecorator, String

class EncryptedString(TypeDecorator):
    """加密字符串类型"""
    impl = String(512)
    
    def process_bind_param(self, value, dialect):
        """存储时加密"""
        if value:
            return field_crypto.encrypt(value)
        return value
    
    def process_result_value(self, value, dialect):
        """读取时解密"""
        if value:
            return field_crypto.decrypt(value)
        return value

# 使用加密字段
class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80))
    email = db.Column(EncryptedString)  # 加密存储
    phone = db.Column(EncryptedString)  # 加密存储
    api_key = db.Column(EncryptedString)  # 加密存储
```

**哪些字段需要加密**

| 字段 | 是否加密 | 原因 |
|------|---------|------|
| username | 否 | 需要查询 |
| email | 是 | 敏感信息 |
| phone | 是 | 敏感信息 |
| password_hash | 否 | 已经是hash |
| api_key | 是 | 高敏感 |
| access_token | 是 | 高敏感 |
| system_prompt | 否 | 业务数据 |

---

## 14.4 HTTPS 与传输层加密

**TLS原理简述**

```
客户端 → 发送支持的TLS版本和加密套件
服务端 → 选择加密套件 + 发送证书
客户端 → 验证证书 → 生成会话密钥 → 用公钥加密发送
服务端 → 用私钥解密 → 获得会话密钥
双方 → 用会话密钥加密通信
```

**Nginx HTTPS配置**

```nginx
server {
    listen 443 ssl http2;
    server_name llmops.example.com;

    ssl_certificate /etc/ssl/certs/llmops.crt;
    ssl_certificate_key /etc/ssl/private/llmops.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS（强制HTTPS）
    add_header Strict-Transport-Security "max-age=63072000" always;
    
    location / {
        proxy_pass http://backend:5000;
    }
}

# HTTP→HTTPS重定向
server {
    listen 80;
    server_name llmops.example.com;
    return 301 https://$server_name$request_uri;
}
```

**Let's Encrypt自动证书**

```bash
# 安装certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d llmops.example.com

# 自动续期（certbot自动添加cron）
certbot renew --dry-run
```

---

## 14.5 密码安全：Hash + Salt

**安全的密码存储**

```python
from werkzeug.security import generate_password_hash, check_password_hash
import bcrypt  # 更安全的替代方案

# 方式一：werkzeug（Flask默认）
password_hash = generate_password_hash('mypassword')
is_valid = check_password_hash(password_hash, 'mypassword')

# 方式二：bcrypt（更安全，自带salt）
import bcrypt

def hash_password(password):
    salt = bcrypt.gensalt(rounds=12)  # 计算轮数，越高越安全越慢
    return bcrypt.hashpw(password.encode(), salt).decode()

def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode(), password_hash.encode())
```

**密码策略**

```python
import re

class PasswordPolicy:
    @staticmethod
    def validate(password):
        """密码强度验证"""
        errors = []
        
        if len(password) < 8:
            errors.append("密码长度至少8位")
        if not re.search(r'[A-Z]', password):
            errors.append("密码必须包含大写字母")
        if not re.search(r'[a-z]', password):
            errors.append("密码必须包含小写字母")
        if not re.search(r'\d', password):
            errors.append("密码必须包含数字")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            errors.append("密码必须包含特殊字符")
        
        return {"valid": len(errors) == 0, "errors": errors}
```

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| JWT签名 | HMAC-SHA256+过期检查+吊销机制 |
| API Key加密 | SHA256 Hash存储+只展示一次 |
| 字段加密 | SQLAlchemy自定义类型+自动加解密 |
| HTTPS | TLS1.2+1.3+HSTS+Let's Encrypt |
| 密码安全 | bcrypt+Salt+密码策略 |

---

觉得有用？收藏起来，下次直接照抄。

你的加解密方案是怎么做的？评论区聊聊。

关注怕浪猫，下期我们做日志与可观测性——请求追踪、错误监控、性能指标，让线上问题无处藏身。

系列进度 14/23

**下章预告：** 第15章日志与可观测性——结构化日志、请求追踪、错误告警、性能指标采集，让LLMOps平台的运行状态透明可见。
