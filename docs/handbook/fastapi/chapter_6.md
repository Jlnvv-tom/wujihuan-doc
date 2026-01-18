# FastAPI认证与授权完全指南：从JWT到OAuth2.0实战

> 认证和授权是Web应用安全的基石。一个漏洞可能让整个系统沦陷。本文带你从零构建企业级安全认证体系，掌握现代Web应用的身份验证最佳实践。

## 引言：为什么认证授权如此重要？

2023年OWASP十大安全风险中，**失效的访问控制**位列榜首。我曾亲眼见证一个线上事故：由于缺少权限验证，普通用户通过修改URL参数访问到了管理员数据，导致数万用户信息泄露。

FastAPI提供了强大的安全工具，但正确使用它们需要深入理解。本文将带你：

1. 区分认证（Authentication）和授权（Authorization）
2. 实现安全的JWT令牌系统
3. 集成OAuth2.0和第三方登录
4. 构建基于角色的访问控制（RBAC）
5. 掌握密码安全最佳实践

## 1. 认证与授权基础概念

### 核心区别

```python
# 认证：你是谁？（验证身份）
# 授权：你能做什么？（检查权限）

from enum import Enum
from typing import Union

class AuthType(Enum):
    """认证类型枚举"""
    # 认证方式
    PASSWORD = "password"      # 用户名密码
    JWT = "jwt"               # JSON Web Token
    OAUTH2 = "oauth2"         # OAuth 2.0
    API_KEY = "api_key"       # API密钥
    SAML = "saml"             # 企业单点登录

    # 授权级别
    PUBLIC = "public"         # 公开访问
    USER = "user"             # 普通用户
    ADMIN = "admin"           # 管理员
    SUPER_ADMIN = "super_admin" # 超级管理员
```

### 认证流程设计

```python
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel

class AuthFlow(BaseModel):
    """认证流程模型"""

    # 1. 用户提供凭证
    credentials: Union[str, dict]

    # 2. 验证凭证
    def authenticate(self) -> bool:
        """验证用户身份"""
        # 这里可以是密码验证、JWT验证、OAuth验证等
        pass

    # 3. 创建会话
    def create_session(self, user_id: str) -> dict:
        """创建用户会话"""
        return {
            "session_id": generate_session_id(),
            "user_id": user_id,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(hours=1),
            "permissions": self.get_user_permissions(user_id)
        }

    # 4. 授权检查
    def authorize(self,
                  required_permission: str,
                  user_permissions: list) -> bool:
        """检查用户是否有权限"""
        return required_permission in user_permissions

    # 5. 访问控制
    def access_control(self,
                       resource: str,
                       action: str,
                       user_context: dict) -> bool:
        """细粒度访问控制"""
        # RBAC: 基于角色的访问控制
        # ABAC: 基于属性的访问控制
        # PBAC: 基于策略的访问控制
        pass
```

## 2. JWT令牌原理与实现

### JWT结构解析

```python
import base64
import json
import hashlib
import hmac
from typing import Dict, Any

def decode_jwt_token(token: str) -> Dict[str, Any]:
    """手动解析JWT令牌（仅用于学习）"""
    # JWT格式: header.payload.signature
    parts = token.split('.')

    if len(parts) != 3:
        raise ValueError("无效的JWT格式")

    # 解码header
    header_b64 = parts[0]
    # 添加padding（如果缺失）
    padding = 4 - len(header_b64) % 4
    if padding != 4:
        header_b64 += "=" * padding

    header_json = base64.urlsafe_b64decode(header_b64)
    header = json.loads(header_json)

    # 解码payload
    payload_b64 = parts[1]
    padding = 4 - len(payload_b64) % 4
    if padding != 4:
        payload_b64 += "=" * padding

    payload_json = base64.urlsafe_b64decode(payload_b64)
    payload = json.loads(payload_json)

    return {
        "header": header,
        "payload": payload,
        "signature": parts[2]
    }

# 示例JWT令牌
sample_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." \
             "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ." \
             "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"

parsed = decode_jwt_token(sample_jwt)
print(f"算法: {parsed['header']['alg']}")
print(f"用户ID: {parsed['payload']['sub']}")
print(f"用户名: {parsed['payload']['name']}")
```

### FastAPI JWT完整实现

```python
from datetime import datetime, timedelta
from typing import Optional, Union
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# 配置
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# 密码哈希上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class Token(BaseModel):
    """令牌响应模型"""
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    refresh_token: Optional[str] = None

class TokenData(BaseModel):
    """令牌数据模型"""
    username: Optional[str] = None
    user_id: Optional[int] = None
    scopes: list[str] = []

class User(BaseModel):
    """用户模型"""
    id: int
    username: str
    email: str
    full_name: Optional[str] = None
    disabled: Optional[bool] = None
    is_superuser: bool = False

class AuthService:
    """认证服务"""

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """验证密码"""
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def get_password_hash(password: str) -> str:
        """生成密码哈希"""
        return pwd_context.hash(password)

    @staticmethod
    def create_access_token(
        data: dict,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """创建访问令牌"""
        to_encode = data.copy()

        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        to_encode.update({"exp": expire, "iat": datetime.utcnow()})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    def create_refresh_token(
        user_id: int,
        expires_delta: Optional[timedelta] = None
    ) -> str:
        """创建刷新令牌"""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

        to_encode = {
            "sub": str(user_id),
            "type": "refresh",
            "exp": expire,
            "iat": datetime.utcnow()
        }

        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    def verify_token(token: str) -> Optional[TokenData]:
        """验证并解析令牌"""
        try:
            payload = jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM]
            )

            # 检查令牌类型
            token_type = payload.get("type", "access")

            # 提取用户信息
            username: Optional[str] = payload.get("sub")
            user_id: Optional[int] = payload.get("user_id")
            scopes: list[str] = payload.get("scopes", [])

            if username is None:
                return None

            return TokenData(
                username=username,
                user_id=user_id,
                scopes=scopes
            )

        except JWTError:
            return None

    @staticmethod
    def create_tokens_for_user(
        user: User,
        include_refresh: bool = True
    ) -> Token:
        """为用户创建令牌对"""
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

        access_token = AuthService.create_access_token(
            data={
                "sub": user.username,
                "user_id": user.id,
                "scopes": ["read", "write"] if not user.disabled else []
            },
            expires_delta=access_token_expires
        )

        refresh_token = None
        if include_refresh:
            refresh_token = AuthService.create_refresh_token(user.id)

        return Token(
            access_token=access_token,
            token_type="bearer",
            expires_at=datetime.utcnow() + access_token_expires,
            refresh_token=refresh_token
        )
```

### JWT中间件实现

```python
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# 安全方案
security_scheme = HTTPBearer(
    bearerFormat="JWT",
    description="请输入JWT令牌，格式: Bearer <token>",
    auto_error=False  # 不自动抛出错误，我们自己处理
)

class JWTAuthMiddleware:
    """JWT认证中间件"""

    def __init__(self, auto_error: bool = True):
        self.auto_error = auto_error
        self.security = security_scheme

    async def __call__(
        self,
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
        db: Session = Depends(get_db)
    ) -> User:
        """验证JWT令牌并返回用户"""

        if credentials is None:
            if self.auto_error:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="未提供认证凭证",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return None

        token = credentials.credentials

        # 验证令牌
        token_data = AuthService.verify_token(token)
        if token_data is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的令牌或令牌已过期",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 查询用户
        user = db.query(User).filter(User.username == token_data.username).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在",
            )

        # 检查用户状态
        if user.disabled:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户已被禁用",
            )

        # 将用户信息添加到请求状态
        return user

# 创建认证依赖
get_current_user = JWTAuthMiddleware()
get_optional_user = JWTAuthMiddleware(auto_error=False)

# 在FastAPI应用中使用
app = FastAPI()

@app.get("/protected")
async def protected_route(
    current_user: User = Depends(get_current_user)
):
    """需要认证的端点"""
    return {
        "message": f"你好, {current_user.username}!",
        "user_id": current_user.id
    }

@app.get("/public")
async def public_route(
    current_user: Optional[User] = Depends(get_optional_user)
):
    """公开端点，但如果有认证用户会显示额外信息"""
    if current_user:
        return {"message": f"欢迎回来, {current_user.username}!"}
    return {"message": "欢迎访客!"}
```

## 3. OAuth2.0集成实战

### OAuth2.0工作流程

```python
from enum import Enum
from typing import Dict, Optional

class OAuth2FlowType(Enum):
    """OAuth2.0授权流程类型"""
    AUTHORIZATION_CODE = "authorization_code"  # 授权码模式（最安全）
    IMPLICIT = "implicit"                     # 隐式模式（已不推荐）
    PASSWORD = "password"                     # 密码模式（信任客户端）
    CLIENT_CREDENTIALS = "client_credentials" # 客户端凭证模式（机器对机器）

class OAuth2Client(BaseModel):
    """OAuth2.0客户端配置"""
    client_id: str
    client_secret: str
    redirect_uris: list[str]
    scope: str
    authorization_endpoint: str
    token_endpoint: str
    userinfo_endpoint: Optional[str] = None

    def get_authorization_url(
        self,
        state: str,
        code_challenge: Optional[str] = None,
        code_challenge_method: str = "S256"
    ) -> str:
        """生成授权URL（PKCE扩展）"""
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uris[0],
            "scope": self.scope,
            "state": state
        }

        # 添加PKCE参数（增强安全性）
        if code_challenge:
            params.update({
                "code_challenge": code_challenge,
                "code_challenge_method": code_challenge_method
            })

        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"{self.authorization_endpoint}?{query_string}"

# 配置第三方OAuth2.0提供商
OAUTH2_PROVIDERS = {
    "google": OAuth2Client(
        client_id="your-google-client-id",
        client_secret="your-google-client-secret",
        redirect_uris=["http://localhost:8000/auth/google/callback"],
        scope="openid email profile",
        authorization_endpoint="https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint="https://oauth2.googleapis.com/token",
        userinfo_endpoint="https://www.googleapis.com/oauth2/v3/userinfo"
    ),
    "github": OAuth2Client(
        client_id="your-github-client-id",
        client_secret="your-github-client-secret",
        redirect_uris=["http://localhost:8000/auth/github/callback"],
        scope="user:email",
        authorization_endpoint="https://github.com/login/oauth/authorize",
        token_endpoint="https://github.com/login/oauth/access_token",
        userinfo_endpoint="https://api.github.com/user"
    ),
    "microsoft": OAuth2Client(
        client_id="your-microsoft-client-id",
        client_secret="your-microsoft-client-secret",
        redirect_uris=["http://localhost:8000/auth/microsoft/callback"],
        scope="openid email profile",
        authorization_endpoint="https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_endpoint="https://login.microsoftonline.com/common/oauth2/v2.0/token",
        userinfo_endpoint="https://graph.microsoft.com/oidc/userinfo"
    )
}
```

### FastAPI OAuth2.0完整实现

```python
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
from authlib.integrations.starlette_client import OAuthError
from starlette.config import Config
import secrets
import hashlib
import base64

router = APIRouter(prefix="/auth", tags=["认证"])

# 配置OAuth
config = Config('.env')  # 从环境变量读取
oauth = OAuth(config)

# 注册OAuth提供商
oauth.register(
    name='google',
    client_id=config('GOOGLE_CLIENT_ID'),
    client_secret=config('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={
        'scope': 'openid email profile',
        'prompt': 'select_account'
    }
)

oauth.register(
    name='github',
    client_id=config('GITHUB_CLIENT_ID'),
    client_secret=config('GITHUB_CLIENT_SECRET'),
    access_token_url='https://github.com/login/oauth/access_token',
    authorize_url='https://github.com/login/oauth/authorize',
    api_base_url='https://api.github.com/',
    client_kwargs={'scope': 'user:email'}
)

class OAuth2Service:
    """OAuth2.0服务"""

    def __init__(self):
        self.state_store = {}  # 实际项目中应该使用Redis

    def generate_pkce_code(self) -> tuple:
        """生成PKCE code verifier和challenge"""
        # 生成随机的code_verifier
        code_verifier = secrets.token_urlsafe(64)

        # 生成code_challenge
        code_challenge = hashlib.sha256(code_verifier.encode()).digest()
        code_challenge = base64.urlsafe_b64encode(code_challenge).decode().replace('=', '')

        return code_verifier, code_challenge

    async def handle_oauth_callback(
        self,
        provider: str,
        code: str,
        state: str,
        stored_state: str,
        code_verifier: Optional[str] = None
    ) -> dict:
        """处理OAuth2.0回调"""

        # 验证state参数（防止CSRF攻击）
        if state != stored_state:
            raise HTTPException(status_code=400, detail="无效的state参数")

        try:
            # 获取访问令牌
            token = await oauth[provider].fetch_access_token(
                code=code,
                code_verifier=code_verifier
            )

            # 获取用户信息
            userinfo = await oauth[provider].userinfo(token=token)

            # 处理用户信息
            return await self.process_userinfo(provider, userinfo, token)

        except OAuthError as e:
            raise HTTPException(status_code=400, detail=str(e))

    async def process_userinfo(
        self,
        provider: str,
        userinfo: dict,
        token: dict
    ) -> dict:
        """处理第三方用户信息"""

        # 标准化用户信息
        standardized = {
            "provider": provider,
            "provider_user_id": userinfo.get("sub") or userinfo.get("id"),
            "email": userinfo.get("email"),
            "name": userinfo.get("name") or userinfo.get("login"),
            "picture": userinfo.get("picture") or userinfo.get("avatar_url"),
            "raw_data": userinfo,
            "access_token": token.get("access_token"),
            "refresh_token": token.get("refresh_token"),
            "expires_at": token.get("expires_at")
        }

        # 查找或创建本地用户
        user = await self.find_or_create_user(standardized)

        # 创建JWT令牌
        auth_tokens = AuthService.create_tokens_for_user(user)

        return {
            "user": user,
            "tokens": auth_tokens,
            "provider_data": standardized
        }

@router.get("/login/{provider}")
async def login_via_provider(
    request: Request,
    provider: str,
    redirect_uri: Optional[str] = None
):
    """发起OAuth2.0登录"""

    if provider not in oauth._clients:
        raise HTTPException(status_code=404, detail="不支持的认证提供商")

    # 生成state和PKCE参数
    state = secrets.token_urlsafe(16)
    code_verifier, code_challenge = OAuth2Service().generate_pkce_code()

    # 存储状态和verifier
    request.session['oauth_state'] = state
    request.session['oauth_code_verifier'] = code_verifier
    request.session['oauth_provider'] = provider

    # 生成重定向URL
    redirect_uri = redirect_uri or f"/auth/{provider}/callback"

    return await oauth[provider].authorize_redirect(
        request,
        redirect_uri,
        state=state,
        code_challenge=code_challenge,
        code_challenge_method='S256'
    )

@router.get("/{provider}/callback")
async def auth_callback(
    request: Request,
    provider: str,
    code: str,
    state: str
):
    """OAuth2.0回调处理"""

    # 获取存储的状态
    stored_state = request.session.get('oauth_state')
    code_verifier = request.session.get('oauth_code_verifier')

    if not stored_state:
        raise HTTPException(status_code=400, detail="会话已过期")

    # 清理session
    request.session.pop('oauth_state', None)
    request.session.pop('oauth_code_verifier', None)
    request.session.pop('oauth_provider', None)

    # 处理回调
    result = await OAuth2Service().handle_oauth_callback(
        provider=provider,
        code=code,
        state=state,
        stored_state=stored_state,
        code_verifier=code_verifier
    )

    # 重定向到前端或返回JSON
    return {
        "message": "登录成功",
        "user": result["user"],
        "tokens": result["tokens"]
    }

# 支持的前端配置
@router.get("/config")
async def get_oauth_config():
    """获取OAuth2.0前端配置"""
    return {
        "providers": [
            {
                "name": "google",
                "label": "Google",
                "color": "#4285F4",
                "icon": "https://www.google.com/favicon.ico"
            },
            {
                "name": "github",
                "label": "GitHub",
                "color": "#333",
                "icon": "https://github.com/favicon.ico"
            },
            {
                "name": "microsoft",
                "label": "Microsoft",
                "color": "#00A4EF",
                "icon": "https://www.microsoft.com/favicon.ico"
            }
        ],
        "pkce_supported": True
    }
```

## 4. 基于角色的访问控制（RBAC）

### RBAC模型设计

```python
from enum import Enum
from typing import List, Set
from pydantic import BaseModel
from sqlalchemy import Column, String, Integer, ForeignKey, Table
from sqlalchemy.orm import relationship

class Permission(str, Enum):
    """权限枚举"""
    # 用户权限
    USER_READ = "user:read"
    USER_WRITE = "user:write"
    USER_DELETE = "user:delete"

    # 文章权限
    ARTICLE_READ = "article:read"
    ARTICLE_WRITE = "article:write"
    ARTICLE_PUBLISH = "article:publish"
    ARTICLE_DELETE = "article:delete"

    # 管理员权限
    ADMIN_READ = "admin:read"
    ADMIN_WRITE = "admin:write"
    ADMIN_DELETE = "admin:delete"

    # 系统权限
    SYSTEM_MANAGE = "system:manage"

class Role(str, Enum):
    """角色枚举"""
    GUEST = "guest"        # 访客
    USER = "user"          # 普通用户
    EDITOR = "editor"      # 编辑
    MODERATOR = "moderator" # 审核员
    ADMIN = "admin"        # 管理员
    SUPER_ADMIN = "super_admin" # 超级管理员

# 角色-权限映射
ROLE_PERMISSIONS = {
    Role.GUEST: {
        Permission.ARTICLE_READ,
    },
    Role.USER: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.ARTICLE_READ,
        Permission.ARTICLE_WRITE,
    },
    Role.EDITOR: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.ARTICLE_READ,
        Permission.ARTICLE_WRITE,
        Permission.ARTICLE_PUBLISH,
    },
    Role.MODERATOR: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.ARTICLE_READ,
        Permission.ARTICLE_WRITE,
        Permission.ARTICLE_PUBLISH,
        Permission.ARTICLE_DELETE,
    },
    Role.ADMIN: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.USER_DELETE,
        Permission.ARTICLE_READ,
        Permission.ARTICLE_WRITE,
        Permission.ARTICLE_PUBLISH,
        Permission.ARTICLE_DELETE,
        Permission.ADMIN_READ,
        Permission.ADMIN_WRITE,
    },
    Role.SUPER_ADMIN: {
        Permission.USER_READ,
        Permission.USER_WRITE,
        Permission.USER_DELETE,
        Permission.ARTICLE_READ,
        Permission.ARTICLE_WRITE,
        Permission.ARTICLE_PUBLISH,
        Permission.ARTICLE_DELETE,
        Permission.ADMIN_READ,
        Permission.ADMIN_WRITE,
        Permission.ADMIN_DELETE,
        Permission.SYSTEM_MANAGE,
    }
}

# 数据库模型
class RoleModel(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, index=True)
    description = Column(String(200))

    # 与用户的关联
    users = relationship("User", secondary="user_roles", back_populates="roles")

    # 权限
    permissions = Column(String(1000), default="")  # 逗号分隔的权限字符串

class UserRoleModel(Base):
    """用户-角色关联表"""
    __tablename__ = "user_roles"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(Integer, ForeignKey("users.id"))

    # 关系
    user = relationship("User", back_populates="role_assignments")
    role = relationship("RoleModel")
    assigner = relationship("User", foreign_keys=[assigned_by])
```

### RBAC权限检查器

```python
from functools import wraps
from typing import Callable, List, Set
from fastapi import HTTPException, status

class PermissionChecker:
    """权限检查器"""

    def __init__(self, required_permissions: List[Permission]):
        self.required_permissions = set(required_permissions)

    def __call__(self, user: User) -> bool:
        """检查用户是否有权限"""
        if not user:
            return False

        # 获取用户所有权限
        user_permissions = self.get_user_permissions(user)

        # 检查是否包含所有必需权限
        return self.required_permissions.issubset(user_permissions)

    @staticmethod
    def get_user_permissions(user: User) -> Set[Permission]:
        """获取用户所有权限"""
        permissions = set()

        # 从角色获取权限
        for role in user.roles:
            if role.name in ROLE_PERMISSIONS:
                permissions.update(ROLE_PERMISSIONS[role.name])

        # 添加用户特定的权限
        if user.custom_permissions:
            custom_perms = user.custom_permissions.split(",")
            for perm in custom_perms:
                if perm in [p.value for p in Permission]:
                    permissions.add(Permission(perm))

        return permissions

    @classmethod
    def require_permissions(cls, *permissions: Permission):
        """权限检查装饰器"""
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(
                *args,
                current_user: User = Depends(get_current_user),
                **kwargs
            ):
                checker = cls(list(permissions))
                if not checker(current_user):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="权限不足"
                    )
                return await func(*args, current_user=current_user, **kwargs)
            return wrapper
        return decorator

# 使用示例
@router.get("/admin/users")
@PermissionChecker.require_permissions(Permission.ADMIN_READ)
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    """获取所有用户（需要管理员权限）"""
    # 这里实现获取用户的逻辑
    pass

@router.post("/admin/users/{user_id}/roles")
@PermissionChecker.require_permissions(
    Permission.ADMIN_WRITE,
    Permission.USER_WRITE
)
async def assign_role_to_user(
    user_id: int,
    role_name: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """为用户分配角色（需要管理员和用户写权限）"""
    # 实现角色分配逻辑
    pass
```

### 动态权限系统

```python
class DynamicRBAC:
    """动态RBAC系统，支持运行时权限管理"""

    def __init__(self):
        self.role_cache = {}
        self.permission_cache = {}

    async def can(
        self,
        user: User,
        action: str,
        resource: str,
        context: Optional[dict] = None
    ) -> bool:
        """检查用户是否有权限执行操作"""

        # 构建权限字符串
        permission_str = f"{resource}:{action}"

        # 1. 检查用户直接权限
        if permission_str in user.direct_permissions:
            return True

        # 2. 检查角色权限
        for role in user.roles:
            if await self.role_has_permission(role, permission_str, context):
                return True

        # 3. 检查基于属性的权限（ABAC）
        if context and await self.check_attribute_based(user, context):
            return True

        return False

    async def role_has_permission(
        self,
        role: RoleModel,
        permission: str,
        context: Optional[dict] = None
    ) -> bool:
        """检查角色是否有权限"""

        # 缓存检查
        cache_key = f"{role.id}:{permission}"
        if cache_key in self.role_cache:
            return self.role_cache[cache_key]

        # 检查角色权限
        has_perm = permission in role.permissions

        # 检查继承的角色
        if not has_perm and role.parent_role_id:
            parent_role = await self.get_role(role.parent_role_id)
            has_perm = await self.role_has_permission(parent_role, permission, context)

        # 缓存结果
        self.role_cache[cache_key] = has_perm

        return has_perm

    async def check_attribute_based(
        self,
        user: User,
        context: dict
    ) -> bool:
        """基于属性的访问控制（ABAC）"""

        # 示例规则：
        # - 用户只能编辑自己的文章
        # - 工作时间内可以访问某些资源
        # - 特定部门的用户可以访问部门数据

        rules = [
            # 规则1：用户只能访问自己的资源
            {
                "condition": lambda u, ctx: (
                    ctx.get("resource_owner_id") == u.id
                ),
                "permissions": ["article:write", "article:delete"]
            },

            # 规则2：工作时间限制
            {
                "condition": lambda u, ctx: (
                    9 <= datetime.now().hour <= 17
                ),
                "permissions": ["system:backup"]
            },

            # 规则3：部门限制
            {
                "condition": lambda u, ctx: (
                    u.department_id == ctx.get("department_id")
                ),
                "permissions": ["department:read", "department:write"]
            }
        ]

        for rule in rules:
            if rule["condition"](user, context):
                return True

        return False

# 在依赖中使用
def require_permission(resource: str, action: str):
    """基于资源的权限检查依赖"""
    def permission_dependency(
        current_user: User = Depends(get_current_user),
        rbac: DynamicRBAC = Depends(get_rbac),
        request: Request
    ):
        async def check():
            context = {
                "resource_owner_id": request.path_params.get("user_id"),
                "department_id": current_user.department_id,
                "resource": resource,
                "action": action
            }

            if not await rbac.can(current_user, action, resource, context):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"没有{resource}的{action}权限"
                )

            return current_user

        return Depends(check)

    return permission_dependency

# 使用示例
@router.put("/articles/{article_id}")
async def update_article(
    article_id: int,
    article_update: ArticleUpdate,
    current_user: User = Depends(require_permission("article", "write")),
    db: Session = Depends(get_db)
):
    """更新文章（需要文章写权限）"""
    # 这里会检查用户是否有article:write权限
    # 如果是用户自己的文章，ABAC规则会允许访问
    pass
```

## 5. 密码哈希与安全存储

### 密码安全最佳实践

```python
import bcrypt
import argon2
from passlib.context import CryptContext
from cryptography.fernet import Fernet
import secrets
import re

class PasswordValidator:
    """密码验证器"""

    MIN_LENGTH = 12
    REQUIRE_UPPERCASE = True
    REQUIRE_LOWERCASE = True
    REQUIRE_DIGITS = True
    REQUIRE_SYMBOLS = True
    COMMON_PASSWORDS = [
        "password", "123456", "qwerty", "admin",
        "welcome", "monkey", "password123"
    ]

    @classmethod
    def validate_password(cls, password: str) -> dict:
        """验证密码强度"""
        errors = []
        warnings = []

        # 长度检查
        if len(password) < cls.MIN_LENGTH:
            errors.append(f"密码至少需要{cls.MIN_LENGTH}个字符")

        # 大写字母检查
        if cls.REQUIRE_UPPERCASE and not re.search(r'[A-Z]', password):
            errors.append("密码必须包含至少一个大写字母")

        # 小写字母检查
        if cls.REQUIRE_LOWERCASE and not re.search(r'[a-z]', password):
            errors.append("密码必须包含至少一个小写字母")

        # 数字检查
        if cls.REQUIRE_DIGITS and not re.search(r'\d', password):
            errors.append("密码必须包含至少一个数字")

        # 特殊字符检查
        if cls.REQUIRE_SYMBOLS and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            errors.append("密码必须包含至少一个特殊字符")

        # 常见密码检查
        if password.lower() in cls.COMMON_PASSWORDS:
            errors.append("密码过于常见，请使用更复杂的密码")

        # 连续字符检查
        if re.search(r'(.)\1{2,}', password):
            warnings.append("密码包含重复字符，建议避免")

        # 顺序字符检查（如123、abc）
        if cls.has_sequential_chars(password, 3):
            warnings.append("密码包含连续字符，建议避免")

        # 计算密码强度分数
        score = cls.calculate_password_score(password)

        return {
            "is_valid": len(errors) == 0,
            "score": score,
            "strength": cls.get_strength_label(score),
            "errors": errors,
            "warnings": warnings
        }

    @staticmethod
    def has_sequential_chars(password: str, length: int) -> bool:
        """检查是否有连续字符"""
        for i in range(len(password) - length + 1):
            substr = password[i:i+length].lower()
            if substr.isalpha() and substr in "abcdefghijklmnopqrstuvwxyz":
                return True
            if substr.isdigit() and substr in "0123456789":
                return True
        return False

    @staticmethod
    def calculate_password_score(password: str) -> int:
        """计算密码强度分数（0-100）"""
        score = 0

        # 长度加分
        score += min(len(password) * 4, 40)

        # 字符种类加分
        if re.search(r'[A-Z]', password):
            score += 10
        if re.search(r'[a-z]', password):
            score += 10
        if re.search(r'\d', password):
            score += 10
        if re.search(r'[^A-Za-z0-9]', password):
            score += 20

        # 重复字符扣分
        for char in set(password):
            count = password.count(char)
            if count > 2:
                score -= (count - 2) * 2

        return min(max(score, 0), 100)

    @staticmethod
    def get_strength_label(score: int) -> str:
        """获取强度标签"""
        if score >= 80:
            return "非常强"
        elif score >= 60:
            return "强"
        elif score >= 40:
            return "中等"
        elif score >= 20:
            return "弱"
        else:
            return "非常弱"
```

### 多算法密码哈希

```python
class AdvancedPasswordHasher:
    """高级密码哈希器，支持多种算法和自适应哈希"""

    def __init__(self):
        # 配置密码上下文
        self.ctx = CryptContext(
            schemes=[
                "argon2",      # 首选：内存硬，抗GPU攻击
                "bcrypt",      # 备选：广泛使用，抗暴力破解
                "scrypt",      # 备选：内存和CPU双重防护
                "pbkdf2_sha256" # 兼容性方案
            ],
            default="argon2",

            # Argon2配置
            argon2__time_cost=2,      # 迭代次数
            argon2__memory_cost=1024, # 内存使用（KB）
            argon2__parallelism=2,    # 并行度
            argon2__salt_len=16,      # 盐长度

            # Bcrypt配置
            bcrypt__rounds=12,        # 工作因子

            # Scrypt配置
            scrypt__salt_size=16,
            scrypt__n=2**14,          # CPU/内存成本
            scrypt__r=8,              # 块大小
            scrypt__p=1,              # 并行度

            # PBKDF2配置
            pbkdf2_sha256__rounds=300000,  # 迭代次数
            pbkdf2_sha256__salt_size=16,

            # 弃用旧算法
            deprecated=["auto", "md5_crypt", "des_crypt"]
        )

        # 密钥加密（用于存储敏感信息）
        self.cipher_suite = Fernet(Fernet.generate_key())

    def hash_password(self, password: str) -> dict:
        """哈希密码，返回包含元数据的字典"""

        # 生成随机盐
        salt = secrets.token_bytes(16)

        # 哈希密码
        hashed = self.ctx.hash(password, salt=salt.hex())

        # 提取算法和参数
        algorithm, params_hash = hashed.split("$", 1)

        return {
            "hash": hashed,
            "algorithm": algorithm,
            "salt": salt.hex(),
            "created_at": datetime.utcnow(),
            "version": "1.0",
            "metadata": {
                "work_factor": self.get_work_factor(algorithm)
            }
        }

    def verify_password(self, password: str, stored_hash: dict) -> bool:
        """验证密码"""

        try:
            # 检查是否需要重新哈希（算法升级）
            if self.needs_rehash(stored_hash):
                return self.verify_and_upgrade(password, stored_hash)

            # 正常验证
            return self.ctx.verify(password, stored_hash["hash"])

        except Exception as e:
            # 安全考虑：记录但不泄露具体错误
            logger.warning(f"密码验证失败: {e}")
            return False

    def needs_rehash(self, stored_hash: dict) -> bool:
        """检查是否需要重新哈希"""

        algorithm = stored_hash.get("algorithm")
        work_factor = stored_hash.get("metadata", {}).get("work_factor")

        # 检查算法是否过时
        if algorithm == "pbkdf2_sha256":
            return True  # 升级到更安全的算法

        # 检查工作因子是否足够
        if algorithm == "bcrypt" and work_factor < 12:
            return True

        return False

    def verify_and_upgrade(
        self,
        password: str,
        stored_hash: dict
    ) -> tuple[bool, Optional[dict]]:
        """验证密码并返回新的哈希"""

        # 验证旧哈希
        if not self.ctx.verify(password, stored_hash["hash"]):
            return False, None

        # 生成新哈希
        new_hash = self.hash_password(password)

        return True, new_hash

    @staticmethod
    def get_work_factor(algorithm: str) -> int:
        """获取算法的当前工作因子"""
        factors = {
            "argon2": 2,
            "bcrypt": 12,
            "scrypt": 14,
            "pbkdf2_sha256": 300000
        }
        return factors.get(algorithm, 1)

    def encrypt_sensitive_data(self, data: str) -> str:
        """加密敏感数据"""
        return self.cipher_suite.encrypt(data.encode()).decode()

    def decrypt_sensitive_data(self, encrypted_data: str) -> str:
        """解密敏感数据"""
        return self.cipher_suite.decrypt(encrypted_data.encode()).decode()

# 使用示例
hasher = AdvancedPasswordHasher()

# 注册用户
def register_user(username: str, password: str):
    """注册用户并安全存储密码"""

    # 验证密码强度
    validation = PasswordValidator.validate_password(password)
    if not validation["is_valid"]:
        raise ValueError(f"密码强度不足: {validation['errors']}")

    # 哈希密码
    password_hash = hasher.hash_password(password)

    # 存储用户信息
    user_data = {
        "username": username,
        "password_hash": password_hash,
        "security_questions": {
            "question1": hasher.encrypt_sensitive_data("answer1"),
            "question2": hasher.encrypt_sensitive_data("answer2")
        }
    }

    return user_data

# 验证用户
def authenticate_user(username: str, password: str, stored_data: dict):
    """验证用户身份"""

    password_hash = stored_data["password_hash"]

    # 验证密码
    result = hasher.verify_password(password, password_hash)

    if isinstance(result, tuple):
        verified, new_hash = result
        if verified and new_hash:
            # 更新密码哈希
            stored_data["password_hash"] = new_hash
        return verified
    else:
        return result
```

## 6. 刷新令牌机制

### JWT刷新令牌实现

```python
from redis import Redis
import json
from typing import Optional

class RefreshTokenManager:
    """刷新令牌管理器"""

    def __init__(self, redis_client: Redis):
        self.redis = redis_client
        self.prefix = "refresh_token:"
        self.family_prefix = "token_family:"

    def create_refresh_token(
        self,
        user_id: int,
        device_info: Optional[dict] = None
    ) -> dict:
        """创建刷新令牌"""

        # 生成令牌ID和家族ID
        token_id = secrets.token_urlsafe(32)
        family_id = secrets.token_urlsafe(16)

        # 创建刷新令牌
        refresh_token = {
            "jti": token_id,  # JWT ID
            "sub": str(user_id),
            "type": "refresh",
            "family": family_id,
            "device": device_info or {},
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        }

        # 签名令牌
        signed_token = jwt.encode(
            refresh_token,
            SECRET_KEY,
            algorithm=ALGORITHM
        )

        # 存储到Redis
        self._store_token(user_id, token_id, family_id, device_info)

        return {
            "token": signed_token,
            "jti": token_id,
            "family": family_id
        }

    def _store_token(
        self,
        user_id: int,
        token_id: str,
        family_id: str,
        device_info: dict
    ):
        """存储令牌信息到Redis"""

        # 存储令牌信息
        token_key = f"{self.prefix}{token_id}"
        token_data = {
            "user_id": user_id,
            "family_id": family_id,
            "device": json.dumps(device_info),
            "created_at": datetime.utcnow().isoformat(),
            "last_used": datetime.utcnow().isoformat()
        }

        # 设置过期时间
        self.redis.hset(token_key, mapping=token_data)
        self.redis.expire(
            token_key,
            timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        )

        # 添加到用户令牌列表
        user_tokens_key = f"user:{user_id}:tokens"
        self.redis.sadd(user_tokens_key, token_id)
        self.redis.expire(
            user_tokens_key,
            timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS * 2)
        )

        # 添加到令牌家族
        family_key = f"{self.family_prefix}{family_id}"
        self.redis.sadd(family_key, token_id)
        self.redis.expire(
            family_key,
            timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS * 2)
        )

    def verify_refresh_token(
        self,
        refresh_token: str
    ) -> tuple[bool, Optional[dict]]:
        """验证刷新令牌"""

        try:
            # 解码令牌
            payload = jwt.decode(
                refresh_token,
                SECRET_KEY,
                algorithms=[ALGORITHM]
            )

            # 检查令牌类型
            if payload.get("type") != "refresh":
                return False, {"error": "不是刷新令牌"}

            # 检查Redis中是否存在
            token_id = payload["jti"]
            token_key = f"{self.prefix}{token_id}"

            if not self.redis.exists(token_key):
                return False, {"error": "令牌不存在或已过期"}

            # 更新最后使用时间
            self.redis.hset(
                token_key,
                "last_used",
                datetime.utcnow().isoformat()
            )

            return True, payload

        except JWTError as e:
            return False, {"error": str(e)}

    def rotate_tokens(
        self,
        old_refresh_token: str,
        device_info: Optional[dict] = None
    ) -> tuple[Optional[str], Optional[dict]]:
        """令牌轮换：使用旧刷新令牌获取新的访问令牌和刷新令牌"""

        # 验证旧令牌
        valid, payload = self.verify_refresh_token(old_refresh_token)
        if not valid:
            return None, None

        # 获取令牌信息
        token_id = payload["jti"]
        user_id = int(payload["sub"])
        family_id = payload["family"]

        # 检查令牌家族
        family_key = f"{self.family_prefix}{family_id}"
        family_tokens = self.redis.smembers(family_key)

        # 安全检测：如果家族中有多个活跃令牌，可能存在问题
        if len(family_tokens) > 3:
            # 可能是令牌泄露，撤销整个家族
            self._revoke_token_family(family_id)
            return None, None

        # 创建新的访问令牌
        access_token = AuthService.create_access_token({
            "sub": str(user_id),
            "user_id": user_id
        })

        # 创建新的刷新令牌（同一家族）
        new_refresh_token = self.create_refresh_token(
            user_id=user_id,
            device_info=device_info
        )

        # 撤销旧令牌
        self._revoke_token(token_id)

        return access_token, new_refresh_token

    def _revoke_token(self, token_id: str):
        """撤销单个令牌"""
        token_key = f"{self.prefix}{token_id}"
        token_data = self.redis.hgetall(token_key)

        if token_data:
            user_id = token_data[b"user_id"].decode()
            family_id = token_data[b"family_id"].decode()

            # 从Redis删除
            self.redis.delete(token_key)

            # 从用户令牌列表移除
            user_tokens_key = f"user:{user_id}:tokens"
            self.redis.srem(user_tokens_key, token_id)

            # 从令牌家族移除
            family_key = f"{self.family_prefix}{family_id}"
            self.redis.srem(family_key, token_id)

    def _revoke_token_family(self, family_id: str):
        """撤销整个令牌家族"""
        family_key = f"{self.family_prefix}{family_id}"
        family_tokens = self.redis.smembers(family_key)

        for token_id in family_tokens:
            self._revoke_token(token_id.decode())

        # 删除家族键
        self.redis.delete(family_key)

    def revoke_all_user_tokens(self, user_id: int):
        """撤销用户的所有令牌"""
        user_tokens_key = f"user:{user_id}:tokens"
        user_tokens = self.redis.smembers(user_tokens_key)

        for token_id in user_tokens:
            self._revoke_token(token_id.decode())

        self.redis.delete(user_tokens_key)

    def get_active_sessions(self, user_id: int) -> list:
        """获取用户的活动会话"""
        sessions = []
        user_tokens_key = f"user:{user_id}:tokens"
        token_ids = self.redis.smembers(user_tokens_key)

        for token_id in token_ids:
            token_key = f"{self.prefix}{token_id.decode()}"
            token_data = self.redis.hgetall(token_key)

            if token_data:
                session = {
                    "token_id": token_id.decode(),
                    "device": json.loads(token_data[b"device"].decode()),
                    "created_at": token_data[b"created_at"].decode(),
                    "last_used": token_data[b"last_used"].decode()
                }
                sessions.append(session)

        return sessions
```

### 刷新令牌端点

```python
@router.post("/token/refresh")
async def refresh_access_token(
    request: Request,
    refresh_request: RefreshTokenRequest,
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """刷新访问令牌"""

    # 获取设备信息
    device_info = {
        "ip": request.client.host,
        "user_agent": request.headers.get("user-agent"),
        "timestamp": datetime.utcnow().isoformat()
    }

    # 初始化令牌管理器
    token_manager = RefreshTokenManager(redis)

    # 轮换令牌
    access_token, new_refresh = token_manager.rotate_tokens(
        refresh_request.refresh_token,
        device_info
    )

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌"
        )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh["token"],
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }

@router.post("/token/revoke")
async def revoke_token(
    token_revoke: TokenRevokeRequest,
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis)
):
    """撤销令牌"""

    token_manager = RefreshTokenManager(redis)

    if token_revoke.token_id:
        # 撤销特定令牌
        token_manager._revoke_token(token_revoke.token_id)
    elif token_revoke.family_id:
        # 撤销令牌家族
        token_manager._revoke_token_family(token_revoke.family_id)
    else:
        # 撤销当前用户的所有令牌
        token_manager.revoke_all_user_tokens(current_user.id)

    return {"message": "令牌已撤销"}

@router.get("/sessions")
async def get_my_sessions(
    current_user: User = Depends(get_current_user),
    redis: Redis = Depends(get_redis)
):
    """获取当前用户的活跃会话"""

    token_manager = RefreshTokenManager(redis)
    sessions = token_manager.get_active_sessions(current_user.id)

    return {
        "user_id": current_user.id,
        "active_sessions": len(sessions),
        "sessions": sessions
    }
```

## 7. 第三方登录集成

### 通用第三方登录适配器

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class ThirdPartyAuthProvider(ABC):
    """第三方认证提供商抽象基类"""

    @abstractmethod
    async def get_authorization_url(
        self,
        redirect_uri: str,
        state: str,
        **kwargs
    ) -> str:
        """获取授权URL"""
        pass

    @abstractmethod
    async def exchange_code_for_token(
        self,
        code: str,
        redirect_uri: str,
        **kwargs
    ) -> Dict[str, Any]:
        """使用授权码交换令牌"""
        pass

    @abstractmethod
    async def get_user_info(
        self,
        access_token: str
    ) -> Dict[str, Any]:
        """获取用户信息"""
        pass

    @staticmethod
    def normalize_user_info(
        provider: str,
        raw_info: Dict[str, Any]
    ) -> Dict[str, Any]:
        """标准化用户信息"""
        normalizers = {
            "google": GoogleAuthProvider.normalize,
            "github": GitHubAuthProvider.normalize,
            "facebook": FacebookAuthProvider.normalize,
            "wechat": WeChatAuthProvider.normalize,
            "apple": AppleAuthProvider.normalize
        }

        normalizer = normalizers.get(provider)
        if normalizer:
            return normalizer(raw_info)

        # 默认标准化
        return {
            "id": raw_info.get("id") or raw_info.get("sub"),
            "email": raw_info.get("email"),
            "name": raw_info.get("name"),
            "avatar": raw_info.get("picture") or raw_info.get("avatar_url"),
            "raw": raw_info
        }

class GoogleAuthProvider(ThirdPartyAuthProvider):
    """Google认证提供商"""

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret

    async def get_authorization_url(
        self,
        redirect_uri: str,
        state: str,
        **kwargs
    ) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",  # 获取刷新令牌
            "prompt": "consent"        # 总是显示授权页面
        }

        params.update(kwargs)
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query_string}"

    async def exchange_code_for_token(
        self,
        code: str,
        redirect_uri: str,
        **kwargs
    ) -> Dict[str, Any]:
        import aiohttp

        data = {
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://oauth2.googleapis.com/token",
                data=data
            ) as response:
                return await response.json()

    async def get_user_info(self, access_token: str) -> Dict[str, Any]:
        import aiohttp

        headers = {"Authorization": f"Bearer {access_token}"}

        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers=headers
            ) as response:
                userinfo = await response.json()

            # 如果需要，获取邮箱验证状态
            async with session.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers=headers,
                params={"alt": "json"}
            ) as response:
                detailed_info = await response.json()
                userinfo.update(detailed_info)

        return userinfo

    @staticmethod
    def normalize(raw_info: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "provider": "google",
            "provider_id": raw_info["sub"],
            "email": raw_info["email"],
            "email_verified": raw_info.get("email_verified", False),
            "name": raw_info.get("name"),
            "given_name": raw_info.get("given_name"),
            "family_name": raw_info.get("family_name"),
            "picture": raw_info.get("picture"),
            "locale": raw_info.get("locale"),
            "hd": raw_info.get("hd")  # G Suite域名
        }

class GitHubAuthProvider(ThirdPartyAuthProvider):
    """GitHub认证提供商"""

    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret

    async def get_authorization_url(
        self,
        redirect_uri: str,
        state: str,
        **kwargs
    ) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "scope": "user:email",
            "state": state,
            "allow_signup": "true"
        }

        params.update(kwargs)
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"https://github.com/login/oauth/authorize?{query_string}"

    async def exchange_code_for_token(
        self,
        code: str,
        redirect_uri: str,
        **kwargs
    ) -> Dict[str, Any]:
        import aiohttp

        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "redirect_uri": redirect_uri
        }

        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://github.com/login/oauth/access_token",
                json=data,
                headers=headers
            ) as response:
                return await response.json()

    async def get_user_info(self, access_token: str) -> Dict[str, Any]:
        import aiohttp

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github.v3+json"
        }

        async with aiohttp.ClientSession() as session:
            # 获取基础用户信息
            async with session.get(
                "https://api.github.com/user",
                headers=headers
            ) as response:
                userinfo = await response.json()

            # 获取邮箱信息（GitHub邮箱需要单独请求）
            async with session.get(
                "https://api.github.com/user/emails",
                headers=headers
            ) as response:
                emails = await response.json()

                # 找到主邮箱
                primary_email = next(
                    (email for email in emails if email["primary"]),
                    emails[0] if emails else None
                )

                if primary_email:
                    userinfo["email"] = primary_email["email"]
                    userinfo["email_verified"] = primary_email["verified"]

        return userinfo

    @staticmethod
    def normalize(raw_info: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "provider": "github",
            "provider_id": str(raw_info["id"]),
            "email": raw_info.get("email"),
            "email_verified": raw_info.get("email_verified", False),
            "name": raw_info.get("name"),
            "login": raw_info.get("login"),
            "avatar_url": raw_info.get("avatar_url"),
            "company": raw_info.get("company"),
            "blog": raw_info.get("blog"),
            "location": raw_info.get("location"),
            "bio": raw_info.get("bio")
        }
```

### 第三方登录统一服务

```python
class ThirdPartyAuthService:
    """第三方登录统一服务"""

    def __init__(self):
        self.providers = {}
        self.setup_providers()

    def setup_providers(self):
        """设置所有支持的提供商"""
        from app.core.config import settings

        if settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET:
            self.providers["google"] = GoogleAuthProvider(
                settings.GOOGLE_CLIENT_ID,
                settings.GOOGLE_CLIENT_SECRET
            )

        if settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
            self.providers["github"] = GitHubAuthProvider(
                settings.GITHUB_CLIENT_ID,
                settings.GITHUB_CLIENT_SECRET
            )

        if settings.FACEBOOK_CLIENT_ID and settings.FACEBOOK_CLIENT_SECRET:
            self.providers["facebook"] = FacebookAuthProvider(
                settings.FACEBOOK_CLIENT_ID,
                settings.FACEBOOK_CLIENT_SECRET
            )

        # 可以继续添加其他提供商...

    async def handle_third_party_login(
        self,
        provider_name: str,
        code: str,
        redirect_uri: str,
        state: Optional[str] = None,
        db_session = None
    ) -> Dict[str, Any]:
        """处理第三方登录"""

        if provider_name not in self.providers:
            raise ValueError(f"不支持的认证提供商: {provider_name}")

        provider = self.providers[provider_name]

        try:
            # 1. 交换令牌
            token_data = await provider.exchange_code_for_token(
                code=code,
                redirect_uri=redirect_uri
            )

            if "error" in token_data:
                raise ValueError(f"令牌交换失败: {token_data['error']}")

            access_token = token_data["access_token"]

            # 2. 获取用户信息
            user_info = await provider.get_user_info(access_token)

            # 3. 标准化用户信息
            normalized_info = ThirdPartyAuthProvider.normalize_user_info(
                provider_name,
                user_info
            )

            # 4. 查找或创建本地用户
            local_user = await self.find_or_create_local_user(
                normalized_info,
                db_session
            )

            # 5. 记录登录历史
            await self.record_login_history(
                user_id=local_user.id,
                provider=provider_name,
                provider_user_id=normalized_info["provider_id"],
                ip_address=None,  # 从请求中获取
                user_agent=None   # 从请求中获取
            )

            # 6. 创建JWT令牌
            tokens = AuthService.create_tokens_for_user(local_user)

            return {
                "success": True,
                "user": local_user,
                "tokens": tokens,
                "provider_info": normalized_info,
                "is_new_user": normalized_info.get("is_new_user", False)
            }

        except Exception as e:
            logger.error(f"第三方登录失败: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "provider": provider_name
            }

    async def find_or_create_local_user(
        self,
        provider_info: Dict[str, Any],
        db_session
    ) -> User:
        """查找或创建本地用户"""

        # 1. 通过provider_id查找现有关联
        existing_link = await db_session.query(OAuthLink).filter_by(
            provider=provider_info["provider"],
            provider_user_id=provider_info["provider_id"]
        ).first()

        if existing_link:
            # 返回现有用户
            return await db_session.query(User).get(existing_link.user_id)

        # 2. 通过邮箱查找现有用户
        if provider_info.get("email"):
            existing_user = await db_session.query(User).filter_by(
                email=provider_info["email"]
            ).first()

            if existing_user:
                # 创建关联
                oauth_link = OAuthLink(
                    user_id=existing_user.id,
                    provider=provider_info["provider"],
                    provider_user_id=provider_info["provider_id"],
                    provider_email=provider_info["email"],
                    provider_data=json.dumps(provider_info)
                )
                db_session.add(oauth_link)
                await db_session.commit()

                return existing_user

        # 3. 创建新用户
        new_user = User(
            email=provider_info.get("email"),
            username=self.generate_username(provider_info),
            full_name=provider_info.get("name"),
            avatar_url=provider_info.get("avatar"),
            is_active=True,
            email_verified=provider_info.get("email_verified", False)
        )

        db_session.add(new_user)
        await db_session.flush()  # 获取用户ID

        # 创建OAuth关联
        oauth_link = OAuthLink(
            user_id=new_user.id,
            provider=provider_info["provider"],
            provider_user_id=provider_info["provider_id"],
            provider_email=provider_info.get("email"),
            provider_data=json.dumps(provider_info)
        )
        db_session.add(oauth_link)

        await db_session.commit()

        # 标记为新用户
        provider_info["is_new_user"] = True

        return new_user

    @staticmethod
    def generate_username(provider_info: Dict[str, Any]) -> str:
        """生成唯一的用户名"""
        base_name = provider_info.get("login") or \
                   provider_info.get("name") or \
                   provider_info.get("email", "").split("@")[0]

        # 清理用户名
        import re
        base_name = re.sub(r'[^a-zA-Z0-9_]', '', base_name)

        # 添加随机后缀确保唯一性
        import secrets
        suffix = secrets.token_hex(3)

        return f"{base_name}_{suffix}"

    async def get_available_providers(self) -> list:
        """获取可用的认证提供商"""
        providers = []

        for name, provider in self.providers.items():
            providers.append({
                "name": name,
                "display_name": self.get_display_name(name),
                "color": self.get_brand_color(name),
                "icon": self.get_icon_url(name),
                "scopes": self.get_default_scopes(name)
            })

        return providers

    @staticmethod
    def get_display_name(provider: str) -> str:
        """获取提供商显示名称"""
        names = {
            "google": "Google",
            "github": "GitHub",
            "facebook": "Facebook",
            "wechat": "微信",
            "apple": "Apple"
        }
        return names.get(provider, provider.capitalize())

    @staticmethod
    def get_brand_color(provider: str) -> str:
        """获取品牌颜色"""
        colors = {
            "google": "#4285F4",
            "github": "#333333",
            "facebook": "#1877F2",
            "wechat": "#07C160",
            "apple": "#000000"
        }
        return colors.get(provider, "#666666")
```

### FastAPI第三方登录端点

```python
@router.get("/providers")
async def get_auth_providers(
    auth_service: ThirdPartyAuthService = Depends(get_auth_service)
):
    """获取支持的认证提供商"""
    providers = await auth_service.get_available_providers()

    return {
        "providers": providers,
        "pkce_supported": True,
        "state_required": True
    }

@router.get("/{provider}/url")
async def get_provider_auth_url(
    provider: str,
    redirect_uri: str,
    request: Request,
    auth_service: ThirdPartyAuthService = Depends(get_auth_service)
):
    """获取第三方认证URL"""

    if provider not in auth_service.providers:
        raise HTTPException(
            status_code=404,
            detail=f"不支持的认证提供商: {provider}"
        )

    # 生成state参数（防止CSRF）
    state = secrets.token_urlsafe(16)

    # 生成PKCE参数
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(code_challenge).decode().replace('=', '')

    # 存储到session或Redis
    request.session[f"{provider}_state"] = state
    request.session[f"{provider}_code_verifier"] = code_verifier
    request.session[f"{provider}_redirect_uri"] = redirect_uri

    # 获取授权URL
    auth_url = await auth_service.providers[provider].get_authorization_url(
        redirect_uri=redirect_uri,
        state=state,
        code_challenge=code_challenge,
        code_challenge_method="S256"
    )

    return {
        "url": auth_url,
        "state": state
    }

@router.post("/{provider}/callback")
async def handle_provider_callback(
    provider: str,
    callback_data: ProviderCallback,
    request: Request,
    db: Session = Depends(get_db),
    auth_service: ThirdPartyAuthService = Depends(get_auth_service)
):
    """处理第三方认证回调"""

    # 验证state参数
    stored_state = request.session.get(f"{provider}_state")
    if not stored_state or stored_state != callback_data.state:
        raise HTTPException(
            status_code=400,
            detail="无效的state参数"
        )

    # 清理session
    request.session.pop(f"{provider}_state", None)
    code_verifier = request.session.pop(f"{provider}_code_verifier", None)
    redirect_uri = request.session.pop(f"{provider}_redirect_uri", None)

    # 处理登录
    result = await auth_service.handle_third_party_login(
        provider_name=provider,
        code=callback_data.code,
        redirect_uri=redirect_uri or callback_data.redirect_uri,
        state=callback_data.state,
        db_session=db
    )

    if not result["success"]:
        raise HTTPException(
            status_code=400,
            detail=result["error"]
        )

    # 设置session或cookie
    request.session["user_id"] = result["user"].id

    return {
        "message": "登录成功",
        "user": result["user"],
        "tokens": result["tokens"],
        "is_new_user": result.get("is_new_user", False)
    }

@router.get("/profile/connected-accounts")
async def get_connected_accounts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取用户已连接的第三方账户"""

    oauth_links = await db.query(OAuthLink).filter_by(
        user_id=current_user.id
    ).all()

    accounts = []
    for link in oauth_links:
        accounts.append({
            "provider": link.provider,
            "provider_user_id": link.provider_user_id,
            "connected_at": link.created_at,
            "last_used": link.updated_at
        })

    return {
        "user_id": current_user.id,
        "connected_accounts": accounts,
        "total_connected": len(accounts)
    }

@router.delete("/profile/connected-accounts/{provider}")
async def disconnect_account(
    provider: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """断开第三方账户连接"""

    # 确保用户至少保留一种登录方式
    total_methods = await db.query(OAuthLink).filter_by(
        user_id=current_user.id
    ).count()

    if total_methods <= 1:
        raise HTTPException(
            status_code=400,
            detail="不能断开唯一的登录方式"
        )

    # 删除连接
    await db.query(OAuthLink).filter_by(
        user_id=current_user.id,
        provider=provider
    ).delete()

    await db.commit()

    return {"message": f"已断开{provider}账户连接"}
```

## 安全最佳实践总结

### 1. **JWT安全配置**

```python
# 安全的JWT配置
SECURE_JWT_CONFIG = {
    "algorithm": "HS256",          # 使用HMAC SHA-256
    "secret_key": secrets.token_urlsafe(64),  # 足够长的密钥
    "access_token_expire": timedelta(minutes=15),  # 短期访问令牌
    "refresh_token_expire": timedelta(days=7),     # 长期刷新令牌
    "issuer": "your-api.com",      # 发行者
    "audience": ["web-app", "mobile-app"],  # 受众
    "leeway": 30,                  # 时间容差（秒）

    # 防重放攻击
    "jti_required": True,          # 要求JWT ID
    "max_reuse_count": 0,          # 令牌不允许重用
}
```

### 2. **OAuth2.0安全注意事项**

```python
OAUTH2_SECURITY_CHECKLIST = [
    # ✅ 必须使用HTTPS
    # ✅ 必须验证state参数
    # ✅ 必须使用PKCE（移动端和SPA）
    # ✅ 令牌必须存储在安全的地方
    # ✅ 刷新令牌必须安全存储
    # ✅ 必须验证重定向URI
    # ✅ 必须设置适当的scope
    # ✅ 必须处理令牌泄露（撤销机制）
    # ✅ 必须记录所有授权活动
    # ✅ 必须实现令牌轮换
]
```

### 3. **密码安全清单**

```python
PASSWORD_SECURITY_CHECKLIST = {
    "storage": [
        "使用bcrypt或argon2",
        "每个密码使用唯一盐值",
        "适当的工作因子（bcrypt: 12+）",
        "定期评估和升级算法"
    ],
    "policy": [
        "最小长度12个字符",
        "要求大小写字母、数字、特殊字符",
        "禁止常见密码",
        "密码过期策略（可选）",
        "密码历史记录（防止重用）",
        "失败尝试锁定",
        "显示密码强度指示器"
    ],
    "recovery": [
        "安全的密码重置流程",
        "多因素认证支持",
        "安全问题和答案",
        "备用邮箱/手机验证"
    ]
}
```

### 4. **监控和日志**

```python
class SecurityLogger:
    """安全事件日志记录器"""

    async def log_auth_event(
        self,
        event_type: str,
        user_id: Optional[int],
        ip_address: str,
        user_agent: str,
        success: bool,
        details: dict
    ):
        """记录认证事件"""

        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,  # login, logout, token_refresh, etc.
            "user_id": user_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "success": success,
            "details": details
        }

        # 记录到文件
        logger.info(f"安全事件: {event}")

        # 记录到数据库
        await self.save_to_db(event)

        # 发送到SIEM系统（如果配置）
        await self.send_to_siem(event)

        # 检查异常行为
        if not success:
            await self.check_for_attacks(ip_address, user_id)

    async def check_for_attacks(
        self,
        ip_address: str,
        user_id: Optional[int]
    ):
        """检查可能的攻击"""

        # 检查失败登录次数
        recent_failures = await self.get_recent_failures(ip_address, user_id)

        if len(recent_failures) > 5:  # 5分钟内失败5次
            # 可能是暴力破解尝试
            await self.alert_security_team(ip_address, recent_failures)

            # 暂时锁定IP
            if len(recent_failures) > 10:
                await self.block_ip_temporarily(ip_address)
```

## 完整项目结构

```
fastapi-auth-project/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── auth.py          # 认证路由
│   │   │   ├── users.py         # 用户路由
│   │   │   └── admin.py         # 管理路由
│   │   └── deps.py              # 依赖注入
│   ├── core/
│   │   ├── security.py          # 安全工具
│   │   ├── config.py            # 配置
│   │   └── redis.py             # Redis连接
│   ├── models/
│   │   ├── user.py              # 用户模型
│   │   ├── auth.py              # 认证相关模型
│   │   └── base.py              # 基础模型
│   ├── schemas/
│   │   ├── user.py              # 用户模式
│   │   ├── auth.py              # 认证模式
│   │   └── token.py             # 令牌模式
│   ├── services/
│   │   ├── auth_service.py      # 认证服务
│   │   ├── oauth_service.py     # OAuth服务
│   │   └── rbac_service.py      # RBAC服务
│   ├── crud/
│   │   └── user.py              # 用户CRUD
│   └── utils/
│       ├── password.py          # 密码工具
│       └── jwt.py              # JWT工具
├── tests/
│   ├── test_auth.py            # 认证测试
│   └── test_security.py        # 安全测试
├── alembic/                    # 数据库迁移
├── .env.example               # 环境变量示例
├── requirements.txt           # 依赖
└── main.py                    # 应用入口
```

## 部署和运维建议

### 1. **密钥管理**

```python
# 使用环境变量或密钥管理服务
import os
from google.cloud import secretmanager

class SecretManager:
    """密钥管理器"""

    @staticmethod
    def get_secret(secret_name: str) -> str:
        # 生产环境：使用云服务
        if os.getenv("ENVIRONMENT") == "production":
            client = secretmanager.SecretManagerServiceClient()
            name = f"projects/{PROJECT_ID}/secrets/{secret_name}/versions/latest"
            response = client.access_secret_version(name=name)
            return response.payload.data.decode("UTF-8")
        else:
            # 开发环境：使用环境变量
            return os.getenv(secret_name)
```

### 2. **生产环境配置**

```python
# config/production.py
PRODUCTION_CONFIG = {
    "security": {
        "cors_origins": ["https://your-domain.com"],
        "https_only": True,
        "hsts_enabled": True,
        "secure_cookies": True,
        "session_timeout": 3600,
    },
    "jwt": {
        "algorithm": "RS256",  # 生产环境使用非对称加密
        "private_key": SecretManager.get_secret("JWT_PRIVATE_KEY"),
        "public_key": SecretManager.get_secret("JWT_PUBLIC_KEY"),
        "access_token_expire": 900,  # 15分钟
        "refresh_token_expire": 604800,  # 7天
    },
    "rate_limit": {
        "enabled": True,
        "login_attempts": 5,  # 5次失败尝试
        "lockout_time": 900,  # 锁定15分钟
    }
}
```

## 常见问题解决

### 1. **JWT令牌被盗怎么办？**

```python
async def handle_token_theft(user_id: int, suspicious_token: str):
    """处理令牌被盗情况"""

    # 1. 立即撤销用户所有令牌
    token_manager.revoke_all_user_tokens(user_id)

    # 2. 记录安全事件
    security_logger.log_security_event(
        event_type="token_theft",
        user_id=user_id,
        severity="critical",
        details={"suspicious_token": suspicious_token}
    )

    # 3. 通知用户
    await notification_service.send_security_alert(
        user_id=user_id,
        alert_type="token_theft",
        action_required=True
    )

    # 4. 临时锁定账户（可选）
    await user_service.temporarily_lock_account(user_id)

    # 5. 强制重新认证
    return {
        "message": "检测到可疑活动，账户已被保护",
        "action_required": "请通过邮箱验证重新激活账户"
    }
```

### 2. **第三方登录邮箱冲突**

```python
async def handle_email_conflict(
    provider_email: str,
    existing_user_email: str
):
    """处理邮箱冲突"""

    # 提供用户选择
    return {
        "conflict": True,
        "options": [
            {
                "type": "merge",
                "description": "将第三方账户与现有账户合并",
                "requires_password": True
            },
            {
                "type": "create_new",
                "description": "创建新账户（使用不同邮箱）",
                "requires_email": True
            },
            {
                "type": "cancel",
                "description": "取消登录"
            }
        ]
    }
```

## 学习资源

- [FastAPI Security官方文档](https://fastapi.tiangolo.com/tutorial/security/)
- [OWASP认证指南](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT RFC 7519](https://tools.ietf.org/html/rfc7519)
- [OAuth2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [bcrypt密码哈希](https://auth0.com/blog/hashing-in-action-understanding-bcrypt/)

---

**最后提醒**：安全是一个持续的过程，不是一次性任务。定期审计你的认证系统，关注安全漏洞公告，保持依赖更新。记住，最薄弱的环节往往不是技术，而是人的因素。教育用户使用强密码，启用多因素认证，保持警惕！

> 安全就像洋葱，它有很多层，每一层都很重要。不要因为有了JWT就忽略其他安全措施，真正的安全是多层次防御的结果。
