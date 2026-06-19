# 第15章 AI 编程的安全与合规

AI 编程工具带来效率提升的同时，也引入了新的安全风险。生成的代码可能有漏洞、使用的数据可能有合规问题、AI 工具本身的安全配置也需要关注。本章从代码安全、数据合规、工具配置三个层面，系统性地学习如何安全地使用 AI 编程工具。

---

## 15.1 AI 生成代码的安全风险与防范

**常见安全风险**

AI 生成的代码在安全性上存在几类常见风险：

1. **SQL 注入**：AI 可能在构造 SQL 时使用字符串拼接而非参数化查询

```java
// 危险：AI 生成的代码（字符串拼接）
String sql = "SELECT * FROM users WHERE name = '" + name + "'";

// 安全：正确做法
@Select("SELECT * FROM users WHERE name = #{name}")
List<User> findByName(@Param("name") String name);
```

2. **硬编码密钥**：AI 可能在代码中硬编码 API Key、数据库密码等

```java
// 危险：硬编码密钥
private static final String API_KEY = "sk-1234567890abcdef";

// 安全：正确做法
@Value("${ai.api-key}")
private String apiKey;
```

3. **XSS 漏洞**：AI 在前端代码中可能未做输入转义

```tsx
// 危险：直接渲染用户输入
<div>{userInput}</div>

// 安全：正确做法
<div dangerouslySetInnerHTML={{ __html: escapeHtml(userInput) }} />
```

**安全审查清单**

```markdown
# AI 生成代码安全审查清单

## SQL 安全
- [ ] 是否使用了参数化查询？
- [ ] 是否有 ORDER BY / LIMIT 参数动态拼接？（需要白名单验证）
- [ ] 是否有表名动态拼接？（需要白名单验证）

## 认证授权
- [ ] API 是否有权限校验？
- [ ] 是否验证了用户身份？
- [ ] 是否验证了资源归属？（A 用户不能访问 B 用户的数据）

## 输入校验
- [ ] 用户输入是否经过校验？
- [ ] 文件上传是否有类型和大小限制？
- [ ] API 参数是否有范围检查？

## 敏感信息
- [ ] 是否有密钥硬编码？
- [ ] 是否有密码明文存储？
- [ ] 敏感信息是否出现在日志中？

## 加密传输
- [ ] 是否使用 HTTPS？
- [ ] 是否有敏感数据本地存储？（需加密）
```

**安全审查自动化**

```bash
# 使用 AI 自动审查代码安全性
claude "审查最近修改的代码安全性：

审查范围：src/main/java/com/travelwise/
审查维度：
1. SQL 注入风险（检查是否有字符串拼接 SQL）
2. 硬编码密钥（检查是否有明文密钥）
3. XSS 风险（检查是否有直接渲染用户输入）
4. 认证授权（检查 API 是否有权限校验）

输出格式：
- 问题文件路径
- 问题代码片段
- 问题严重程度（Critical/High/Medium/Low）
- 修复建议"
```

---

## 15.2 数据合规与隐私保护

**数据分类**

| 类别 | 定义 | 示例 | 合规要求 |
|------|------|------|---------|
| 公开数据 | 任何人都可以访问 | 景点介绍、公开文章 | 无特殊要求 |
| 内部数据 | 仅内部员工可见 | 用户行为分析、业务数据 | 访问控制 |
| 敏感数据 | 需要保护的数据 | 用户手机号、邮箱、地址 | 加密存储、访问审计 |
| 机密数据 | 高度敏感的数据 | 身份证号、银行卡号、密码 | 加密存储 + 脱敏展示 |

**敏感数据处理规范**

```java
// 手机号脱敏展示
public String maskPhoneNumber(String phone) {
    if (phone == null || phone.length() < 11) {
        return phone;
    }
    return phone.substring(0, 3) + "****" + phone.substring(7);
}

// 身份证号脱敏
public String maskIdCard(String idCard) {
    if (idCard == null || idCard.length() < 15) {
        return idCard;
    }
    return idCard.substring(0, 6) + "********" + idCard.substring(14);
}

// 日志脱敏
@Aspect
@Component
public class SensitiveDataAspect {

    @Around("execution(* com.travelwise..*Controller.*(..))")
    public Object maskSensitiveData(ProceedingJoinPoint joinPoint) throws Throwable {
        Object[] args = joinPoint.getArgs();
        Object[] maskedArgs = Arrays.stream(args)
                .map(this::maskIfNeeded)
                .toArray();
        
        log.info("API调用: {} 参数: {}", 
            joinPoint.getSignature().getName(), maskedArgs);
        
        return joinPoint.proceed(args);
    }
}
```

**数据合规审查**

```markdown
# 数据合规审查清单

## GDPR 合规（如涉及欧盟用户）
- [ ] 是否有用户同意机制？
- [ ] 是否有数据删除权保障？（用户可以删除账号和数据）
- [ ] 是否有数据导出功能？
- [ ] 隐私政策是否更新？

## 数据本地化
- [ ] 中国用户数据是否存储在中国境内？
- [ ] 是否使用中国境内的云服务商？
- [ ] 跨境数据传输是否有安全评估？

## 数据保留
- [ ] 数据保留期限是否明确？
- [ ] 过期的数据是否及时清理？
- [ ] 是否有数据备份和恢复机制？
```

---

## 15.3 AI 工具的安全配置

**API Key 安全**

```bash
# 环境变量存储密钥，不要硬编码
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export DATABASE_PASSWORD="..."

# .gitignore 中排除 .env 文件
cat > .gitignore << 'EOF'
.env
.env.local
.env.*.local
*.pem
*.key
credentials.json
EOF
```

**GitHub Actions 密钥配置**

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup environment
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          DATABASE_PASSWORD: ${{ secrets.DATABASE_PASSWORD }}
        run: |
          echo "OPENAI_API_KEY=$OPENAI_API_KEY" >> .env
          echo "DATABASE_PASSWORD=$DATABASE_PASSWORD" >> .env
      
      - name: Run tests
        run: pnpm test
```

**Cursor/Claude Code 安全配置**

```markdown
# AI 工具安全配置

## 禁止的操作
1. 禁止执行 rm -rf / 或任何删除根目录的命令
2. 禁止修改 /etc/、/usr/ 等系统目录
3. 禁止访问 ~/.ssh/ 目录
4. 禁止执行包含敏感信息的命令（密钥明文打印）

## 文件访问限制
1. 只允许访问项目目录（通过 .claude/CLAUDE.md 限制）
2. 禁止访问项目外的文件
3. 禁止修改 .env 以外的配置文件

## 网络访问限制
1. 只允许访问必要的 API 端点
2. 禁止访问内网敏感服务
3. 禁止发起 DNS 查询到可疑域名
```

---

## 15.4 企业级 AI 编程合规管理

**AI 编程政策制定**

企业应该制定明确的 AI 编程使用政策：

```markdown
# TravelWise AI 编程使用政策

## 允许使用 AI 编程的场景
- 代码生成和补全
- 代码审查和优化建议
- 文档生成和维护
- 测试用例生成
- 技术调研和方案设计

## 需要人工审查的场景
- 所有 AI 生成的代码（必须人工审查）
- 安全相关代码（必须安全审查）
- 数据库操作代码（必须 DBO 审查）
- 第三方集成代码（必须架构审查）

## 禁止使用 AI 编程的场景
- 生成涉及法律合规的文案
- 生成涉及政治敏感的内容
- 处理未授权的隐私数据
- 生成恶意代码或攻击工具

## 代码归属和知识产权
- AI 生成的代码版权归公司所有
- 需要记录 AI 工具的使用情况
- 需要评估 AI 生成代码的许可证合规性
```

**AI 使用记录和审计**

```yaml
# .claude/audit.md - 记录 AI 使用情况

## AI 使用记录

### 2026-06-20
- 用途：生成景点搜索接口
- 工具：Claude Code
- 人工审查：是（张三审查）
- 安全审查：是（李四审查）
- 备注：无安全问题

### 2026-06-21
- 用途：重构订单模块
- 工具：Claude Code
- 人工审查：是（王五审查）
- 安全审查：是（赵六审查）
- 备注：发现一处 SQL 注入风险，已修复
```

---

## 15.5 开源许可证与 AI 生成代码的法律问题

**主流 AI 编程工具的许可证**

| 工具 | 生成代码的版权归属 | 许可证 |
|------|------------------|--------|
| GitHub Copilot | 使用者拥有 | 订阅制 |
| Claude Code | 使用者拥有 | 按 token 计费 |
| Cursor | 使用者拥有 | 订阅制 |
| GPT-4 API | 使用者拥有 | 按 token 计费 |

**开源许可证兼容性**

AI 生成的代码可能"巧合地"与开源代码相似，引发许可证纠纷：

1. **GPL 传染**：如果 AI 生成的代码与 GPL 代码过于相似，发布时可能需要开源
2. **许可证违规**：AI 可能生成使用受限库的代码，导致许可证违规
3. **商标侵权**：AI 可能生成包含商标的代码

**防范措施**

```bash
# 使用 AI 生成的代码前，运行许可证检查
claude "检查项目中使用的第三方库和 AI 生成的代码：
1. 列出所有第三方依赖及其许可证
2. 检查是否有 GPL/AGPL 许可证的依赖
3. 评估许可证兼容性风险
4. 给出许可证合规建议"
```

```bash
# 使用 license-cop 检查代码相似度
npm install -g license-cop
license-cop check --files "src/**/*.java"
```

---

**本章小结**

| 维度 | 核心要点 |
|------|---------|
| 代码安全风险 | SQL 注入、硬编码密钥、XSS 是三大风险，必须人工审查 |
| 安全审查清单 | SQL 安全 + 认证授权 + 输入校验 + 敏感信息 + 加密传输 |
| 数据合规 | 数据分类、脱敏处理、GDPR 合规、数据本地化 |
| 工具安全 | API Key 环境变量存储、文件访问限制、网络访问限制 |
| 企业合规 | AI 编程政策、人工审查制度、使用记录审计 |
| 法律问题 | 版权归属、开源许可证兼容、代码相似度检查 |

下一章是全书的最后一章，我们将对 Vibe Coding 到 Harness x SDD 的全栈开发之路进行总结与展望。
