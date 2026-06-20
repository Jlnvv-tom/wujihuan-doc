# 第9章 授权认证模块开发：保障应用安全

不做认证的AI平台，等于把钥匙挂在门上。JWT + 第三方登录，给你的平台加上安全锁。

我是怕浪猫，这章解决一个工程问题——安全。LLMOps平台如果谁都能免费调用API，Token消耗会像漏水一样止不住。这章做完整的认证授权体系。

---

## 9.1 JWT 授权认证原理

**Session vs JWT**

| 维度 | Session | JWT |
|------|---------|-----|
| 存储位置 | 服务端session + 客户端session_id | 客户端token |
| 状态管理 | 有状态（服务端存储） | 无状态（自包含） |
| 扩展性 | 多服务器需要Redis共享session |天然分布式 |
| 适用场景 | 传统Web应用 | API / SPA / 移动端 |
| 安全性 | CSRF风险 | 无CSRF，但有XSS风险 |

**JWT结构**

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJzdWIiOiIxMjM0NTY3ODkwIiwidXNlcl9pZCI6MSwidXNlcm5hmeSI6IumbmeKJmiIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxNzM4MTc1MDIyfQ.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
         ↓           ↓           ↓
      Header      Payload     Signature
```

**JWT Payload结构**

```python
import jwt
import datetime

payload = {
    "sub": "1234567890",        # 用户ID
    "user_id": 1,
    "username": "怕浪猫",
    "role": "admin",            # 角色
    "permissions": ["read", "write", "delete"],
    "iat": 1516239022,          # 签发时间
    "exp": 1738175022           # 过期时间（7天）
}
```

**JWT生成与验证**

```python
# services/auth_service.py
import jwt
from datetime import datetime, timedelta
from config import Config

class AuthService:
    def __init__(self):
        self.secret = Config.SECRET_KEY
        self.algorithm = 'HS256'
        self.expire_hours = 24 * 7  # 7天过期
    
    def generate_token(self, user_id, username, role='user'):
        """生成JWT"""
        payload = {
            "user_id": user_id,
            "username": username,
            "role": role,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=self.expire_hours)
        }
        token = jwt.encode(payload, self.secret, algorithm=self.algorithm)
        return token
    
    def verify_token(self, token):
        """验证JWT"""
        try:
            payload = jwt.decode(token, self.secret, algorithms=[self.algorithm])
            return payload
        except jwt.ExpiredSignatureError:
            return None  # 过期
        except jwt.InvalidTokenError:
            return None  # 无效
```

---

## 9.2 GitHub 第三方授权认证原理

**OAuth2.0流程**

```
用户 → 点击"GitHub登录"
  ↓
跳转GitHub授权页 → 用户点击"授权"
  ↓
GitHub回调 → code
  ↓
后端用code换access_token
  ↓
用access_token获取用户信息
  ↓
创建/查找本地用户 → 生成JWT → 登录成功
```

**GitHub OAuth配置**

```
1. 访问 https://github.com/settings/applications/new
2. 填写：
   - Application name: LLMOps
   - Homepage URL: http://localhost:5173
   - Authorization callback URL: http://localhost:5000/api/v1/auth/github/callback
3. 获取 Client ID 和 Client Secret
```

**GitHub OAuth实现**

```python
# routes/auth.py
import requests

@auth_bp.route('/github')
def github_login():
    """跳转到GitHub授权页"""
    client_id = Config.GITHUB_CLIENT_ID
    redirect_uri = Config.GITHUB_CALLBACK_URL
    
    url = f"https://github.com/login/oauth/authorize?client_id={client_id}&redirect_uri={redirect_uri}&scope=read:user"
    return redirect(url)

@auth_bp.route('/github/callback')
def github_callback():
    code = request.args.get('code')
    
    # 1. 用code换access_token
    token_url = "https://github.com/login/oauth/access_token"
    token_data = {
        "client_id": Config.GITHUB_CLIENT_ID,
        "client_secret": Config.GITHUB_CLIENT_SECRET,
        "code": code
    }
    headers = {"Accept": "application/json"}
    token_response = requests.post(token_url, json=token_data, headers=headers).json()
    access_token = token_response.get("access_token")
    
    # 2. 用access_token获取用户信息
    user_url = "https://api.github.com/user"
    headers = {"Authorization": f"Bearer {access_token}"}
    user_response = requests.get(user_url, headers=headers).json()
    
    github_id = str(user_response["id"])
    username = user_response.get("login", "github_user")
    email = user_response.get("email")
    avatar = user_response.get("avatar_url")
    
    # 3. 创建或查找本地用户
    user = User.query.filter_by(github_id=github_id).first()
    if not user:
        user = User(
            github_id=github_id,
            username=username,
            email=email,
            avatar=avatar,
            role='user'
        )
        db.session.add(user)
        db.session.commit()
    
    # 4. 生成JWT
    jwt_token = auth_service.generate_token(user.id, user.username, user.role)
    
    # 5. 跳转回前端并带上token
    frontend_url = f"{Config.FRONTEND_URL}/auth/callback?token={jwt_token}"
    return redirect(frontend_url)
```

---

## 9.3 Flask-Login 实现后端授权认证

**Flask-Login配置**

```python
# extensions.py
from flask_login import LoginManager

login_manager = LoginManager()

def init_extensions(app):
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'

# models/user.py
from flask_login import UserMixin

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True)
    password_hash = db.Column(db.String(255))  # 密码登录用
    github_id = db.Column(db.String(100), unique=True)  # GitHub登录用
    avatar = db.Column(db.String(500))
    role = db.Column(db.String(20), default='user')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def get_id(self):
        return str(self.id)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))
```

**用户注册与登录**

```python
from werkzeug.security import generate_password_hash, check_password_hash

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json
    
    # 检查用户名是否存在
    if User.query.filter_by(username=data['username']).first():
        return error("用户名已存在")
    
    # 创建用户
    user = User(
        username=data['username'],
        email=data.get('email'),
        password_hash=generate_password_hash(data['password']),
        role='user'
    )
    db.session.add(user)
    db.session.commit()
    
    # 生成token
    token = auth_service.generate_token(user.id, user.username, user.role)
    return success(data={'token': token, 'user': user.to_dict()})

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    
    if not user or not check_password_hash(user.password_hash, data['password']):
        return error("用户名或密码错误")
    
    token = auth_service.generate_token(user.id, user.username, user.role)
    return success(data={'token': token, 'user': user.to_dict()})
```

**Token中间件**

```python
# middleware/auth_middleware.py
from functools import wraps
from flask import request, g

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
        
        if not token:
            return error("缺少认证令牌", 401)
        
        payload = auth_service.verify_token(token)
        if not payload:
            return error("无效或已过期的令牌", 401)
        
        g.current_user_id = payload['user_id']
        g.current_username = payload['username']
        g.current_role = payload.get('role', 'user')
        
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    @token_required
    def decorated(*args, **kwargs):
        if g.current_role != 'admin':
            return error("需要管理员权限", 403)
        return f(*args, **kwargs)
    return decorated
```

---

## 9.4 前端 fetch 封装：授权接口携带令牌

**Axios请求封装**

```javascript
// api/request.js
import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000
})

// 请求拦截器：添加Token
request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：处理401/403
request.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response) {
      const { status, data } = error.response
      
      if (status === 401) {
        // Token过期，跳转登录
        localStorage.removeItem('token')
        ElMessage.error('登录已过期，请重新登录')
        router.push('/login')
      } else if (status === 403) {
        ElMessage.error(data.message || '权限不足')
      } else if (status >= 500) {
        ElMessage.error('服务器错误')
      }
    }
    return Promise.reject(error)
  }
)

export default request
```

**Token存储**

```javascript
// stores/auth.js
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null')
  }),
  
  getters: {
    isLoggedIn: state => !!state.token,
    isAdmin: state => state.user?.role === 'admin'
  },
  
  actions: {
    setToken(token, user) {
      this.token = token
      this.user = user
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
    },
    
    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    },
    
    async fetchUserInfo() {
      if (!this.token) return
      const res = await request.get('/auth/me')
      this.user = res.data
      localStorage.setItem('user', JSON.stringify(res.data))
    }
  }
})
```

---

## 9.5 前端路由守卫守护页面安全

**路由守卫实现**

```javascript
// router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  { path: '/login', component: LoginView, meta: { public: true } },
  { path: '/register', component: RegisterView, meta: { public: true } },
  { path: '/', redirect: '/chat' },
  { path: '/chat', component: ChatView },
  { path: '/knowledge', component: KnowledgeView },
  { path: '/settings', component: SettingsView, meta: { admin: true } },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 全局前置守卫
router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  
  // 公开页面直接通过
  if (to.meta.public) {
    next()
    return
  }
  
  // 需要登录
  if (!auth.isLoggedIn) {
    next('/login')
    return
  }
  
  // 需要管理员权限
  if (to.meta.admin && !auth.isAdmin) {
    next('/chat')
    ElMessage.error('需要管理员权限')
    return
  }
  
  next()
})

export default router
```

**GitHub登录回调处理**

```javascript
// views/AuthCallback.vue
<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

onMounted(() => {
  const token = route.query.token
  if (token) {
    auth.setToken(token)
    router.push('/chat')
  } else {
    router.push('/login')
  }
})
</script>
```

---

## 9.6 前后端接口对接与测试完善

**测试用例**

```python
# tests/test_auth.py
def test_register(client):
    response = client.post('/api/v1/auth/register', json={
        'username': 'testuser',
        'password': 'testpass123',
        'email': 'test@example.com'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert 'token' in data['data']
    assert data['data']['user']['username'] == 'testuser'

def test_login(client):
    # 先注册
    client.post('/api/v1/auth/register', json={
        'username': 'testuser', 'password': 'testpass123'
    })
    
    # 再登录
    response = client.post('/api/v1/auth/login', json={
        'username': 'testuser', 'password': 'testpass123'
    })
    assert response.status_code == 200
    data = response.get_json()
    assert 'token' in data['data']

def test_protected_route(client):
    # 无token访问受保护接口
    response = client.get('/api/v1/user/me')
    assert response.status_code == 401
    
    # 获取token
    reg = client.post('/api/v1/auth/register', json={
        'username': 'test', 'password': 'pass'
    })
    token = reg.get_json()['data']['token']
    
    # 带token访问
    response = client.get('/api/v1/user/me',
        headers={'Authorization': f'Bearer {token}'})
    assert response.status_code == 200
```

**Postman测试集合**

| 测试用例 | 预期结果 |
|---------|---------|
| POST /auth/register | 201，成功返回token |
| POST /auth/login | 200，成功返回token |
| GET /auth/me (无token) | 401 |
| GET /auth/me (有token) | 200，返回用户信息 |
| GET /chat/conversations (无token) | 401 |
| GET /chat/conversations (有token) | 200，返回对话列表 |

> 认证授权是平台的基础设施，做得好用户无感，做得差处处报错。把token刷新、权限校验这些细节做好，后面的功能开发才能安心。

---

**本章小结**

| 主题 | 核心要点 |
|------|---------|
| JWT原理 | Header+Payload+Signature，无状态令牌 |
| GitHub OAuth | code换token→token换用户信息→创建用户 |
| Flask-Login | UserMixin+user_loader+login_manager |
| 密码存储 | werkzeug密码hash，不存明文 |
| Token中间件 | @token_required装饰器保护接口 |
| 前端拦截器 | Axios请求拦截加token，响应拦截处理401 |
| 路由守卫 | 前端路由层的权限控制 |

---

觉得有用？收藏起来，下次直接照抄。

你的平台认证是怎么做的？用过什么有趣的方案？评论区聊聊。

关注怕浪猫，下期我们做内容审核——让AI生成的内容安全合规，不踩红线。

系列进度 9/23

**下章预告：** 第10章审核模块——OpenAI Moderation API、关键词审核、流式输出下的审核、多级审核流程，让AI生成的内容安全合规。
