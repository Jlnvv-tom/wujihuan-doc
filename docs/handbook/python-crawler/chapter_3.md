# 第3章 手把手教你搭建代理服务

做爬虫的同学一定经历过这样的场景：脚本刚跑起来，数据还没抓几页，目标网站就返回了 403。你换了 User-Agent，加了 Referer，甚至模拟了完整的浏览器指纹，结果还是被封。这时候你打开 F12 看了看 Network 面板，发现请求头里干干净净，没有任何破绽。那问题到底出在哪？

答案大概率是一个字：IP。

不管你的请求头伪装得多完美，如果同一个 IP 在短时间内发送了大量请求，服务端的风控系统会毫不犹豫地把这个 IP 扔进黑名单。这种基于 IP 的频率限制是最简单也最有效的反爬手段之一。你可以在请求头上下功夫，但你没法改变自己的出口 IP。

代理 IP 就是解决这个问题的核心手段。通过在客户端和目标服务器之间引入一层代理服务器，让目标服务器看到的请求来源是代理服务器的 IP 而不是你的真实 IP。配合代理池轮换，可以有效绕过 IP 频率限制。

我是怕浪猫，今天这篇文章我们彻底聊透代理服务这件事。从服务商选型到 Squid 自建代理，从代理池架构设计到多节点加密部署，我把自己踩过的坑都给你梳理出来。这篇内容偏长偏硬核，涵盖从理论到实战的完整链路，建议先收藏再看。

> 代理不是万能的，但没有代理是万万不能的。爬虫工程师的段位，往往就体现在代理体系的搭建能力上。

## 3.1 代理 IP 服务商对比

### 3.1.1 代理 IP 的三种匿名等级

在对比服务商之前，我们先把一个基础概念搞清楚：代理 IP 的匿名等级。这个概念很多人模糊，怕浪猫在这里一次性讲透，因为它是后续所有代理选型决策的基础。

代理 IP 按匿名程度分为三种：透明代理、匿名代理、高匿代理。它们的区别在于目标服务器能否识别你的真实 IP，以及能否识别出请求经过了代理服务器。

**透明代理**会在 HTTP 请求头中携带 `X-Forwarded-For` 和 `Via` 字段。`X-Forwarded-For` 字段的值就是客户端的真实 IP，目标服务器不仅能看到代理 IP，还能看到你的真实 IP。这种代理基本没有匿名性可言，通常只用于企业内部的缓存加速或网关转发，不适合爬虫场景。

我们来看一个透明代理的请求头实际长什么样：

```
GET / HTTP/1.1
Host: target.com
X-Forwarded-For: 192.168.1.100  ← 你的真实IP
Via: 1.1 proxy-server            ← 代理服务器标识
```

目标服务器收到这个请求，一眼就能看到你的真实 IP 和代理路径，等于完全暴露。

**匿名代理**会隐藏你的真实 IP（不携带 `X-Forwarded-For`），但会在请求头中携带 `Via` 字段。目标服务器虽然看不到你的真实 IP，但能明确知道这个请求经过了代理服务器。对于有严格反爬策略的网站来说，看到 `Via` 字段就会对这个请求提高警惕，甚至直接拒绝。

```
GET / HTTP/1.1
Host: target.com
Via: 1.1 proxy-server  ← 没有真实IP，但暴露了代理身份
```

**高匿代理**既不携带 `X-Forwarded-For` 也不携带 `Via`，请求头和直接来自客户端的请求完全一样。目标服务器完全无法区分这个请求是直接来自客户端还是经过代理。这是爬虫场景下唯一推荐的代理类型。

```
GET / HTTP/1.1
Host: target.com
← 干干净净，没有任何代理痕迹
```

我们用一张表来对比三种代理的核心差异：

| 维度 | 透明代理 | 匿名代理 | 高匿代理 |
|------|---------|---------|---------|
| 真实 IP | 暴露 | 隐藏 | 隐藏 |
| 代理标识 | 暴露 | 暴露 | 隐藏 |
| 请求头特征 | XFF + Via | Via | 无 |
| 适用场景 | 缓存/网关 | 一般爬虫 | 高级爬虫 |
| 被封概率 | 高 | 中 | 低 |

> 爬虫选代理，高匿是底线。如果你用的代理连匿名性都保证不了，那跟裸奔没什么区别。

这里怕浪猫要特别提醒：有些代理商在宣传时说自己是高匿代理，但实际抓包一看请求头里带着 `Via` 字段。所以拿到代理后第一步一定是抓包验证，不要轻信宣传文案。验证方法很简单，用代理访问 `http://httpbin.org/headers`，看看返回的请求头里有没有 `X-Forwarded-For` 或 `Via` 字段。

```python
import requests

def verify_proxy_anonymity(proxy):
    """验证代理的匿名等级"""
    proxies = {"http": f"http://{proxy}", "https": f"http://{proxy}"}
    try:
        resp = requests.get("http://httpbin.org/headers",
                           proxies=proxies, timeout=10)
        headers = resp.json().get("headers", {})
        has_xff = "X-Forwarded-For" in headers
        has_via = "Via" in headers
        if has_xff:
            return "透明代理"
        elif has_via:
            return "匿名代理"
        else:
            return "高匿代理"
    except Exception as e:
        return f"检测失败: {e}"
```

这段代码可以直接用来验证任何代理的匿名等级。建议在接入新代理商时先跑一遍这个检测。

### 3.1.2 短效代理 vs 长效代理

代理 IP 按存活时间分为两类：短效代理和长效代理。选择哪种，取决于你的业务场景和目标网站的反爬策略。

**短效代理**的存活时间通常在 1-10 分钟，IP 更新频率极高。优势是 IP 池足够大，即使某个 IP 被封了，很快就会失效并被新 IP 替换，不需要额外的恢复机制。劣势是稳定性差，不适合需要维持会话状态的场景（比如需要登录的网站、需要维持购物车状态的电商平台）。短效代理适合批量抓取公开页面、不需要 Cookie 的场景，比如新闻资讯采集、公开数据抓取等。

**长效代理**的存活时间通常在 1 天以上，甚至几周。优势是稳定，可以维持较长时间的会话，适合需要登录态的场景。劣势是 IP 数量有限，价格更高，而且一旦被封需要手动处理恢复。

| 维度 | 短效代理 | 长效代理 |
|------|---------|---------|
| 存活时间 | 1-10 分钟 | 1 天以上 |
| IP 数量 | 大（万级） | 小（百级） |
| 稳定性 | 低 | 高 |
| 价格 | 低 | 高 |
| 会话保持 | 不支持 | 支持 |
| 适用场景 | 公开页面批量抓取 | 登录态/会话保持 |

怕浪猫的实际经验是：大多数爬虫场景用短效代理就够了。真正需要长效代理的场景其实不多，主要是需要维持登录态的爬虫（比如需要保持 Cookie 的社交平台爬虫）。如果你不确定该选哪种，先从短效代理开始，遇到会话保持问题再切换。

> 代理选型不是一步到位的决策。先用最便宜的方案跑起来，遇到瓶颈再升级，这是工程化的思路。

### 3.1.3 主流代理服务商对比

市面上代理 IP 服务商很多，怕浪猫这里选几个有代表性的做对比。注意，以下信息基于我个人的实际使用经验，不同时期服务商的策略和价格可能有所变化，建议以官网最新信息为准。相关官网链接：[快代理](https://www.kuaidaili.com/)、[青果代理](https://www.qg.net/)、[Bright Data](https://brightdata.com/)。

选服务商时需要关注几个维度：IP 池大小、IP 可用率、响应速度、API 调用频率限制、是否支持 SOCKS5、是否支持按地区提取、是否有 SDK、价格。不同服务商在这些维度上的表现差异很大，建议根据自己的业务需求确定优先级后再做选择。

**快代理**：国内老牌代理服务商，提供短效/长效代理，API 接入简单。产品线覆盖私密代理、独享代理、隧道代理等多种类型。优势是文档完善、稳定性尚可，有较为成熟的 SDK。劣势是价格偏高，高并发场景下 IP 可用率会下降，部分 IP 存在重复分配的问题。适合对稳定性有一定要求但不想折腾自建代理的团队。

**青果代理**：主打短效代理，IP 池较大。优势是性价比不错，API 灵活，支持按地区提取。劣势是部分 IP 的响应速度不稳定，偶尔出现大量 IP 同时失效的情况。适合预算有限、对延迟要求不高的场景。

**讯代理**：提供多种代理类型，支持按需提取。优势是 IP 质量较高，支持多种提取方式（API、JSON、TXT 格式）。劣势是新手接入门槛稍高，文档不够友好，需要仔细阅读才能正确接入。适合有一定开发经验的团队。

**Bright Data（原 Luminati）**：海外代理商，IP 池规模全球最大，提供住宅 IP、机房 IP、移动 IP 等多种类型。优势是 IP 质量极高、覆盖全球、支持精细化的地理定位（可以精确到城市级别）。劣势是价格昂贵，适合出海业务或对 IP 质量有极高要求的场景。如果你的目标网站在国内，用 Bright Data 反而可能因为延迟过高而不合适。

这里怕浪猫要提醒一点：选择代理商时，不要只看价格和 IP 数量，**IP 可用率**和**响应速度**才是核心指标。一个可用率 95% 的代理服务远比一个 IP 池大一倍但可用率只有 60% 的服务有价值。因为不可用的代理不仅浪费请求配额，还会拖慢整体爬取速度，增加重试开销。

如何评估代理商的真实质量？怕浪猫的建议是写一个测试脚本，用同一套评估标准跑一周：

```python
def evaluate_proxy_provider(api_url, days=7):
    """评估代理服务商质量，跑指定天数"""
    stats = {"total": 0, "success": 0, "latencies": []}
    for day in range(days):
        # 每天取 100 个代理测试
        for i in range(100):
            proxy = get_proxy_from_api(api_url)
            if not proxy:
                continue
            stats["total"] += 1
            start = time.time()
            try:
                resp = requests.get("http://httpbin.org/ip",
                                   proxies=proxy, timeout=5)
                if resp.status_code == 200:
                    stats["success"] += 1
                    stats["latencies"].append(
                        round((time.time() - start) * 1000))
            except:
                pass
    # 计算核心指标
    success_rate = stats["success"] / max(stats["total"], 1)
    avg_latency = sum(stats["latencies"]) / max(len(stats["latencies"]), 1)
    return {"success_rate": f"{success_rate:.1%}",
            "avg_latency_ms": round(avg_latency),
            "total_tested": stats["total"]}
```

用这个脚本跑一周，你就能拿到每个代理商的真实成功率、平均延迟、稳定性数据。用数据说话比看营销文案靠谱得多。

> 代理服务商的营销文案都写得漂亮，但只有跑起来才知道真实质量。建议每家先买最小套餐测试，别一上来就包月。

接下来看一个通用的第三方代理 API 调用示例。大多数代理商的 API 都是这个模式：调用一个 URL，返回一个或一批代理 IP：

```python
import requests

def get_proxy_from_api(api_url):
    """从第三方代理服务商获取代理IP"""
    try:
        resp = requests.get(api_url, timeout=10)
        if resp.status_code == 200:
            ip, port = resp.text.strip().split(":")
            return {"http": f"http://{ip}:{port}",
                    "https": f"http://{ip}:{port}"}
    except Exception as e:
        print(f"获取代理失败: {e}")
    return None

proxy = get_proxy_from_api("https://api.proxy.com/get")
resp = requests.get("https://target.com", proxies=proxy, timeout=10)
```

这段代码是第三方代理最基础的调用方式。实际项目中你需要加上重试机制、代理可用性检测和并发控制，后面代理池部分会详细讲。

## 3.2 Squid 自建代理服务

第三方代理用起来方便，但有几个绕不开的问题。第一，贵。高并发场景下每月代理费可能几千上万，随着业务量增长这笔费用会持续攀升。第二，不可控。代理商的 IP 池你无法掌控，质量全凭运气，有时候同一批 IP 被分配给多个用户，互相干扰。第三，安全风险。你的请求经过别人的服务器，请求内容和返回数据都对代理商透明，如果涉及敏感数据这是一个不小的隐患。

所以对于有一定技术团队的公司来说，自建代理服务是更优的选择。

自建代理的方案不止 Squid 一种，市面上还有 3proxy、TinyProxy、Dante 等开源代理软件。怕浪猫选 Squid 的原因有三：第一，Squid 从 1996 年发布至今已经稳定运行了将近 30 年，性能和可靠性都经过了大量生产环境的验证，社区活跃度高，遇到问题容易找到解决方案。第二，Squid 的认证体系成熟，支持 basic_auth、digest_auth、NTLM 等多种认证方式，可以和 NCSA、LDAP、PAM 等后端对接。第三，Squid 的 ACL 系统非常灵活，可以基于 IP、端口、域名、时间、请求方法等多种维度做访问控制，适合复杂的业务场景。相关文档可以参考 [Squid 官方文档](http://www.squid-cache.org/Doc/)。

下面这个对比表展示了主流开源代理软件的差异：

| 特性 | Squid | 3proxy | TinyProxy |
|------|-------|--------|----------|
| 认证方式 | basic/digest/NTLM | basic | basic |
| ACL 能力 | 强 | 中 | 弱 |
| 缓存功能 | 支持 | 不支持 | 不支持 |
| 性能 | 高 | 极高 | 中 |
| 社区活跃度 | 高 | 中 | 低 |
| 适用场景 | 生产环境 | 轻量级 | 开发测试 |

如果你的场景比较简单（比如只需要一个开发测试用的代理），TinyProxy 是更轻量的选择，配置只需要三五行。但如果是生产环境的爬虫代理，Squid 仍然是最稳妥的选择。

### 3.2.1 Squid 代理核心原理

Squid 的工作原理本质上是一个中间人转发。客户端把请求发给 Squid，Squid 再把请求转发给目标服务器，拿到响应后返回给客户端。整个过程 Squid 充当了一个正向代理（Forward Proxy）的角色。

核心流程如下：

```
客户端(你的爬虫)  →  Squid 代理服务器  →  目标服务器
   1.2.3.4            VPS: 5.6.7.8         target.com
                      端口: 3128
```

具体步骤拆解：
1. 客户端向 Squid 发送 HTTP 请求，请求中包含目标服务器地址
2. Squid 解析请求头，提取目标 URL
3. Squid 以自身 IP 向目标服务器发起请求
4. 目标服务器返回响应给 Squid
5. Squid 将响应转发回客户端

目标服务器看到的请求来源是 Squid 所在 VPS 的 IP（5.6.7.8），而不是客户端的真实 IP（1.2.3.4）。这就是代理的基本原理。

Squid 的配置文件 `squid.conf` 是核心，所有行为都通过这个文件控制。Squid 的配置指令非常多，官方文档有几百页，但爬虫代理场景用到的其实很少。下面是一个最简配置示例：

```conf
# /etc/squid/squid.conf
http_port 3128
# 允许所有客户端访问（生产环境务必收紧）
http_access allow all
# 代理服务器可见的主机名
visible_hostname proxy-server
# 日志路径
access_log /var/log/squid/access.log
cache_log /var/log/squid/cache.log
# 不缓存任何内容（爬虫代理不需要缓存）
cache deny all
```

这个配置实现了一个最基本的正向代理：监听 3128 端口，允许所有客户端连接，不缓存任何内容。对于爬虫场景来说，缓存不仅没有意义，反而可能导致数据不一致——你拿到的是缓存中的旧数据而不是目标网站的最新数据。

### 3.2.2 安装 Squid

在 Ubuntu/Debian 上安装 Squid 非常简单：

```bash
apt update && apt install squid -y
# 备份原始配置
cp /etc/squid/squid.conf /etc/squid/squid.conf.bak
# 编辑配置后重启
systemctl restart squid
systemctl enable squid
```

在 CentOS/RHEL 上：

```bash
yum install squid -y
systemctl start squid
systemctl enable squid
```

安装完成后，你可以用 curl 快速测试代理是否生效：

```bash
# 通过代理访问目标网站
curl -x http://你的VPS_IP:3128 http://httpbin.org/ip
# 返回的 origin 应该是 VPS 的 IP
```

如果返回的 IP 是你 VPS 的 IP，恭喜，Squid 代理已经跑起来了。如果连接被拒绝，检查一下防火墙是否放行了 3128 端口。

> 自建代理的第一步永远是最简单的，真正的挑战在加密认证和代理池管理上。

### 3.2.3 创建加密的 Squid 代理服务

默认的 Squid 配置没有任何认证，任何人只要知道你的 IP 和端口就能白嫖你的代理。这在生产环境中是绝对不可接受的。更严重的是，开放代理可能被不法分子利用来发送垃圾邮件、发起 DDoS 攻击，最终你的 VPS 会被服务商停机甚至面临法律责任。

Squid 支持两种主流认证方案：**basic_auth** 和 **digest_auth**。

**basic_auth** 使用 HTTP Basic 认证（RFC 7617），用户名密码以 Base64 编码传输。优点是实现简单、兼容性好，几乎所有 HTTP 客户端都支持。缺点是安全性低，Base64 不是加密，密码可以被中间人截获后直接解码。如果使用 HTTPS 代理端口则可以缓解这个问题。

**digest_auth** 使用 HTTP Digest 认证（RFC 7616），密码经过 MD5 摘要处理后传输，不会直接暴露明文密码。安全性高于 basic_auth。缺点是部分客户端兼容性不如 basic_auth，配置也稍微复杂一些。

对于爬虫代理场景，怕浪猫推荐使用 basic_auth + 非标准端口的方式。原因有三：第一，爬虫和代理服务器之间的通信通常在内网或 VPN 内进行，中间人攻击风险低。第二，basic_auth 的兼容性最好，requests、Scrapy、aiohttp 等框架都原生支持。第三，如果真的需要高安全性，在 Squid 前面加一层 SSH 隧道或 WireGuard 比 digest_auth 更实用。

下面是配置 basic_auth 的完整步骤：

```bash
# 安装 apache2-utils（提供 htpasswd 工具）
apt install apache2-utils -y
# 创建密码文件，添加用户 crawler
htpasswd -c /etc/squid/passwords crawler
# 输入两次密码，例如：PassW0rd123
# 验证密码文件
cat /etc/squid/passwords
# 应输出：crawler:$apr1$xxx...
```

`htpasswd` 工具创建的密码文件使用 Apache 的 `apr1` 算法加密，Squid 的 `basic_ncsa_auth` 程序可以读取这种格式。注意 `-c` 参数只在第一次创建文件时使用，后续添加用户去掉 `-c`，否则会覆盖已有文件。

然后在 `squid.conf` 中添加认证配置：

```conf
# /etc/squid/squid.conf
# 认证程序
auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwords
# 认证提示信息（客户端看到的认证弹窗内容）
auth_param basic realm "Proxy Authentication Required"
# 认证子进程数量（根据并发量调整）
auth_param basic children 5
# 认证缓存时间（减少重复认证开销）
auth_param basic credentialsttl 2 hours

# 定义认证 ACL
acl authenticated proxy_auth REQUIRED
# 先要求认证，再允许访问
http_access allow authenticated
# 拒绝其他所有访问
http_access deny all

http_port 3128
visible_hostname proxy-server
cache deny all
```

Squid 的 `http_access` 规则是从上到下顺序匹配的，匹配到一条就停止。所以规则顺序非常关键：先放行认证用户，再拒绝所有其他访问。如果把 `http_access deny all` 放在 `http_access allow authenticated` 前面，所有人都无法访问。

重启 Squid 后，无认证的请求将被拒绝：

```bash
# 不带认证 → 407 Proxy Authentication Required
curl -x http://VPS_IP:3128 http://httpbin.org/ip
# 带认证 → 正常访问
curl -x http://crawler:PassW0rd123@VPS_IP:3128 http://httpbin.org/ip
```

> 代理服务不加密，等于在互联网上裸奔。认证配置不是可选项，是必选项。

### 3.2.4 Squid 配置文件详解

上面的配置虽然能跑，但如果你想在生产环境使用，还需要了解一些关键配置项。怕浪猫把常用的配置项按功能分类讲解。

**http_port**：代理监听的端口和模式。默认 `3128`。可以配置多个端口：`http_port 3128` 和 `http_port 38888` 同时监听两个端口。如果要做 HTTPS 代理，可以配置 `https_port 3129 cert=/path/to/cert key=/path/to/key`。

**acl**：访问控制列表，Squid 的权限管理核心。你可以基于 IP、端口、域名、时间、请求方法等多种条件定义 ACL，然后用 `http_access` 控制访问。这是 Squid 最强大的功能之一。

```conf
# 基于 IP 的 ACL
acl my_network src 1.2.3.4/32
# 基于端口的 ACL
acl safe_ports port 80 443
# 基于域名的 ACL
acl blocked_sites dstdomain .badsite.com
# 基于时间的 ACL（工作时间禁止访问）
acl work_hours time MTWHF 09:00-18:00
# 基于请求方法的 ACL
acl connect_method method CONNECT

# 组合使用：允许认证用户访问安全端口
http_access deny blocked_sites
http_access allow authenticated safe_ports
http_access deny all
```

ACL 的组合规则是 AND 逻辑：`http_access allow authenticated safe_ports` 表示只有同时满足"已认证"和"目标端口是安全端口"两个条件才允许访问。

**cache_dir**：缓存目录配置。爬虫代理场景下一般 `cache deny all` 关闭缓存，所以不需要配置缓存目录。

**maximum_object_size**：单个缓存对象的最大大小。关闭缓存后无需关注。

一个生产级的安全配置示例：

```conf
# /etc/squid/squid.conf (生产级)
http_port 3128
visible_hostname proxy-server

# 认证配置
auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwords
auth_param basic realm "Proxy Auth"
auth_param basic children 10
auth_param basic credentialsttl 1 hour

# ACL 定义
acl authenticated proxy_auth REQUIRED
acl safe_ports port 80 443 8080
acl connect_method method CONNECT

# 访问规则（从上到下匹配，匹配即停止）
http_access deny !safe_ports
http_access allow authenticated safe_ports
http_access deny all

# 关闭缓存
cache deny all

# 日志
access_log /var/log/squid/access.log squid
cache_log /var/log/squid/cache.log

# 性能调优
max_filedescriptors 65536
```

这个配置做了四件事：要求认证、限制目标端口为常用 Web 端口、关闭缓存、提升文件描述符上限。对于爬虫代理来说，这就是一个够用的生产配置。

## 3.3 代理池技术方案

单个代理 IP 肯定不够用。假设你的爬虫每秒发 10 个请求，目标网站的风控阈值可能是每分钟 60 个请求同一 IP。一个 IP 撑不过一分钟就会被封。所以我们需要一个代理池，让请求分散到多个 IP 上。

代理池不是简单地把一堆代理 IP 放在一个列表里随机用。一个合格的代理池需要解决以下问题：代理从哪来、代理是否可用、代理怎么存、代理怎么分配。这就是代理池架构设计的核心。

### 3.3.1 代理池架构设计

一个完整的代理池系统包含四个核心模块：获取、验证、存储、调度。这四个模块形成一个闭环，保证代理池中始终有可用的 IP。这个架构不是我拍脑袋想出来的，而是经过多个项目迭代后沉淀下来的通用模式。无论你用什么语言、什么存储引擎，代理池的核心架构都离不开这四个模块。

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│  获取   │ →  │  验证   │ →  │  存储   │ →  │  调度   │
│ Fetch   │    │ Verify  │    │ Store   │    │ Schedule│
└─────────┘    └─────────┘    └─────────┘    └─────────┘
     ↑                                              │
     └──────────── 反馈 ←──────────────────────────┘
```

**获取模块**负责从各个来源获取代理 IP。来源可以是：第三方代理 API、Squid 自建代理节点、免费代理网站爬取（质量极低，不推荐用于生产环境）。获取模块需要支持多种来源的适配器模式，方便扩展新的代理来源。适配器模式的好处是：当你需要接入新的代理来源时，只需要新增一个适配器类，不需要修改已有代码。

获取模块的适配器接口设计：

```python
from abc import ABC, abstractmethod

class ProxyFetcher(ABC):
    """代理获取器抽象基类"""
    @abstractmethod
    def fetch(self):
        """获取一批代理IP，返回列表"""
        pass

class SquidFetcher(ProxyFetcher):
    def fetch(self):
        # 从Squid节点配置中获取代理
        return ["1.2.3.4:3128", "5.6.7.8:3128"]

class ApiFetcher(ProxyFetcher):
    def __init__(self, api_url):
        self.api_url = api_url
    def fetch(self):
        # 从第三方API获取代理
        import requests
        resp = requests.get(self.api_url, timeout=10)
        return resp.text.strip().split("\n")
```

这种设计让你可以灵活组合多种代理来源。比如平时用自建的 Squid 节点，高峰期用第三方 API 补充，只需要在获取模块中注册两个 Fetcher 即可。

**验证模块**负责检测代理 IP 的可用性。验证有两个层面：一是验证代理本身是否存活（能不能连通），二是验证代理是否能正常访问目标网站（有没有被目标网站封禁）。这两个层面的验证都很重要——代理能连通不代表能访问目标网站，可能代理 IP 已经被目标网站拉黑了。通过向目标网站发送测试请求，检查响应状态码和响应时间，判断代理是否可用。

**存储模块**负责管理代理 IP 的生命周期。包括存储可用代理、标记失效代理、记录代理的成功率和响应时间等指标。通常使用 Redis 作为存储引擎，因为 Redis 的 ZSet 数据结构天然适合按分数排序的场景。为什么不用 MySQL？因为代理池的读写频率非常高，每次爬虫请求都要读一次代理信息，每次请求完成都要更新代理状态，Redis 的内存读写性能远优于 MySQL。

**调度模块**负责从代理池中选取可用 IP 分配给爬虫。调度策略包括轮询、随机、按权重等。调度模块还需要处理代理使用反馈——爬虫报告某个代理请求失败时，调度模块需要降低该代理的权重或将其移出可用池。反馈机制是代理池自进化的关键——通过实际使用效果来动态调整代理的权重，让好代理浮上来、差代理沉下去。

### 3.3.2 代理池存储设计

我们用 Redis 来存储代理池数据。为什么选 Redis 而不是 MySQL？因为代理池的读写频率非常高，每次请求都需要读取代理信息，每次请求完成都需要更新代理状态，Redis 的内存读写性能远优于 MySQL。

数据结构设计如下：

```
# 可用代理集合（ZSet，score 为响应时间ms）
proxies:available → {"1.2.3.4:3128": 120, "5.6.7.8:3128": 350}

# 失效代理集合（Set）
proxies:unavailable → {"9.10.11.12:3128", "13.14.15.16:3128"}

# 代理详情（Hash，key 为 ip:port）
proxies:detail:1.2.3.4:3128 → {
    "success_count": 156,
    "fail_count": 2,
    "avg_latency": 125,
    "last_check": 1719504000,
    "source": "squid_vps_1",
    "username": "crawler",
    "password": "PassW0rd123"
}
```

用 ZSet 存储可用代理的好处是天然支持按 score（响应时间）排序，调度时可以优先选择响应快的代理。score 越小表示延迟越低，质量越好。

核心存储操作代码：

```python
import redis, json, time

class ProxyStore:
    def __init__(self, host="localhost", port=6379):
        self.redis = redis.Redis(host=host, port=port, db=0)

    def add_proxy(self, proxy, latency, meta=None):
        """添加代理到可用池"""
        self.redis.zadd("proxies:available", {proxy: latency})
        detail = {"success": 0, "fail": 0,
                  "latency": latency, "added": time.time()}
        if meta: detail.update(meta)
        self.redis.hset("proxies:detail", proxy, json.dumps(detail))

    def get_proxy(self):
        """获取延迟最低的代理"""
        proxies = self.redis.zrange("proxies:available", 0, 0)
        return proxies[0].decode() if proxies else None

    def mark_fail(self, proxy, threshold=3):
        """标记失败，超阈值则移入失效池"""
        self.redis.hincrby("proxies:detail:" + proxy, "fail", 1)
        fail_count = int(self.redis.hget(
            "proxies:detail:" + proxy, "fail") or 0)
        if fail_count >= threshold:
            self.redis.zrem("proxies:available", proxy)
            self.redis.sadd("proxies:unavailable", proxy)
```

这段代码实现了代理池存储的四个核心操作：添加代理、获取代理、标记成功/失败、恢复代理。当代理连续失败达到阈值（默认 3 次）时，自动从可用池移入失效池。恢复接口用于手动或自动将失效代理重新加入可用池进行测试。

### 3.3.3 代理可用性检测与自动剔除

代理 IP 的可用性是动态变化的。一个 IP 现在可用，不代表 5 分钟后还可用。VPS 可能重启、网络可能抖动、目标网站可能封禁某个 IP 段。所以我们需要一个后台任务定期检测代理池中所有 IP 的可用性。

检测策略的核心思路：向一个稳定的目标地址发送测试请求，如果能在超时时间内返回 200 状态码，则认为代理可用并更新响应时间；否则标记为不可用。

选择测试目标地址有几个原则：第一，目标要稳定可用（不能选一个你自己都不确定能不能访问的地址）。第二，响应要快（不能选一个需要 10 秒才返回的地址）。第三，不要频繁检测同一个目标（避免被目标网站封禁你的测试请求）。常用的选择是 `http://httpbin.org/ip`、`http://httpbin.org/headers` 等公开测试服务。

```python
import asyncio, aiohttp, time

async def check_proxy_async(proxy, timeout=5):
    """异步检测代理可用性"""
    start = time.time()
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "http://httpbin.org/ip",
                proxy=f"http://{proxy}",
                timeout=aiohttp.ClientTimeout(total=timeout)
            ) as resp:
                if resp.status == 200:
                    return True, round((time.time()-start)*1000)
    except:
        pass
    return False, -1

async def batch_check_async(store, concurrency=20):
    """并发批量检测代理池"""
    all_proxies = store.redis.zrange("proxies:available", 0, -1)
    sem = asyncio.Semaphore(concurrency)
    async def check_one(p):
        async with sem:
            proxy = p.decode()
            ok, lat = await check_proxy_async(proxy)
            if ok: store.redis.zadd("proxies:available", {proxy: lat})
            else: store.mark_fail(proxy)
    await asyncio.gather(*[check_one(p) for p in all_proxies])
```

这里我用了 `asyncio` + `aiohttp` 来做并发检测，相比同步的 `requests` 版本，检测速度可以提升 10-20 倍。100 个代理的并发检测只需要几秒钟就能完成。

> 代理检测不是一劳永逸的。建议每 5-10 分钟做一轮全量检测，同时在使用过程中做实时检测——用的时候发现不可用就立即标记。

除了定时全量检测，还需要做实时检测。实时检测发生在爬虫请求失败时：当爬虫通过某个代理请求目标网站失败（超时、连接错误、返回非 200 状态码），立即调用 `mark_fail` 降低该代理的权重。这样可以在下一轮全量检测之前就把问题代理降权，减少对爬虫效率的影响。

### 3.3.4 代理轮换策略

有了代理池，接下来就是怎么用。代理轮换策略决定了请求如何分配到不同的代理 IP 上。轮换策略的好坏直接影响爬虫的成功率和效率。

**轮询策略**：按顺序依次使用每个代理。优点是分配均匀，每个代理的使用次数基本相同。缺点是如果某个代理恰好被封，轮到它时这个请求就会失败。轮询策略适合代理质量比较均匀的场景。

**随机策略**：从可用代理池中随机选取一个。简单粗暴，但不保证均匀。在代理数量较多时，随机策略的效果接近轮询，但实现更简单。

**权重策略**：根据代理的成功率和响应时间计算权重，优先使用高质量的代理。这是生产环境推荐的策略。权重策略的核心思想是"好代理多用，差代理少用"，但同时给差代理保留一定的使用机会，避免"赢者通吃"导致单一 IP 被过度使用。

权重计算的核心思路：成功率高、响应时间短的代理获得更高的权重，被选中的概率更大。同时设置一个最低权重，避免低质量代理被完全饿死。

```python
import random

class ProxyScheduler:
    def __init__(self, store):
        self.store = store

    def get_proxy_weighted(self):
        """按权重获取代理"""
        proxies = self.store.redis.zrange(
            "proxies:available", 0, -1, withscores=True)
        if not proxies:
            return None
        # score 是响应时间(ms)，越低越好，转换为权重
        weights = []
        for proxy, score in proxies:
            latency = float(score)
            # 权重 = 1000 / 延迟，延迟越低权重越高
            weight = max(1, int(1000 / max(latency, 1)))
            weights.append((proxy.decode(), weight))
        # 加权随机选择
        total = sum(w for _, w in weights)
        r = random.uniform(0, total)
        cum = 0
        for proxy, w in weights:
            cum += w
            if r <= cum:
                return proxy
        return weights[-1][0]
```

这段代码实现了基于响应时间的加权随机选择。延迟 100ms 的代理比延迟 500ms 的代理被选中的概率高 5 倍。同时通过 `max(1, ...)` 保证每个代理至少有最低权重 1，不会被完全饿死。

> 轮换策略没有银弹。最好的策略是根据实际效果动态调整——让数据说话，让代理池自己进化。

## 3.4 第三方代理产品应用

### 3.4.1 第三方代理 API 的接入与封装

虽然自建代理池更灵活，但第三方代理 API 在项目快速启动阶段仍然是首选。不需要购买 VPS、不需要部署 Squid、不需要维护代理池，调一个 API 就能拿到代理 IP，几分钟就能跑起来。

大多数代理服务商的 API 模式都类似：你调用一个 URL，传入参数（代理类型、数量、格式等），返回一个或一批代理 IP。但直接在爬虫代码里调 API 有几个问题：第一，每次请求都调 API 获取代理，延迟高且可能触发服务商的频率限制。第二，没有缓存机制，代理 IP 的有效期没有充分利用。第三，没有容错，API 调用失败时爬虫直接崩溃。

我们需要封装的是：自动获取代理、缓存代理、检测可用性、自动切换。下面是一个生产级的封装方案：

```python
import requests, time, threading

class ProxyProvider:
    def __init__(self, api_url, ttl=60, min_cache=5):
        self.api_url = api_url
        self.ttl = ttl
        self.min_cache = min_cache
        self.cache = []
        self.lock = threading.Lock()

    def fetch_proxies(self):
        """从 API 批量获取代理"""
        try:
            resp = requests.get(self.api_url, timeout=10)
            if resp.status_code == 200:
                expire = time.time() + self.ttl
                return [(p.strip(), expire) for p in
                        resp.text.strip().split("\n") if p.strip()]
        except Exception as e:
            print(f"获取代理失败: {e}")
        return []

    def get_proxy(self):
        """获取可用代理，自动刷新缓存"""
        with self.lock:
            now = time.time()
            self.cache = [(p, t) for p, t in self.cache if t > now]
            if len(self.cache) < self.min_cache:
                self.cache.extend(self.fetch_proxies())
            return self.cache[0][0] if self.cache else None
```

这个封装实现了三个关键能力：线程安全的代理获取（通过 `threading.Lock`）、TTL 自动过期（通过 `expire_time` 判断）、缓存不足时自动拉取（当缓存数量低于 `min_cache` 时触发拉取）。在多线程爬虫中直接调用 `get_proxy()` 即可，不需要关心代理的获取和刷新逻辑。

> 第三方代理 API 的接入看似简单，但如果你不做缓存和自动刷新，每次请求都去 API 拉一次代理，不仅效率低，还可能触发服务商的频率限制。

### 3.4.2 自建代理 vs 第三方代理的成本分析

到底是自建还是用第三方？这个问题没有标准答案，取决于你的业务规模和技术能力。怕浪猫给你算一笔账。

假设你的爬虫需要 100 个并发代理 IP，每天运行 10 小时。

**第三方代理方案**：
- 快代理按量付费，大约 0.001 元/IP，100 IP/天 × 30 天 = 3000 元/月
- 不需要运维，接入即用
- IP 质量受服务商控制
- 无需关心 VPS 运维、IP 封禁恢复等问题

**自建代理方案**：
- 一台 2 核 2G 的 VPS 约 50 元/月，单机可跑 500+ 并发
- 需要部署 Squid、配置认证、搭建代理池
- 10 台 VPS = 500 元/月，可获得 10 个独立 IP
- IP 质量完全可控
- 需要至少半个运维人力来维护

两种方案的隐性成本也不同。第三方代理的隐性成本在于代理商服务不稳定时对业务的影响——代理商 IP 池突然大面积失效，你的爬虫就会停下来，而你对此无能为力。自建代理的隐性成本在于运维复杂度——VPS 宕机、IP 被封、Squid 进程崩溃这些问题都需要你自己处理。

| 维度 | 第三方代理 | 自建代理 |
|------|-----------|---------|
| 月成本 | 3000+ 元 | 500 元 |
| IP 数量 | 大（数千） | 小（数十） |
| IP 质量 | 不可控 | 可控 |
| 运维成本 | 低 | 中 |
| 适用规模 | 中小 | 中大 |
| 上手难度 | 低 | 中 |
| 数据安全 | 有风险 | 可控 |

结论：如果你的代理需求在 50 个 IP 以内，用第三方更省心。如果需要大规模代理且对 IP 质量有要求，自建更划算。混合方案（自建为主 + 第三方兜底）是很多大公司的选择——日常用自建代理，流量高峰时用第三方代理补充。

> 成本分析不能只看价格。运维人力、故障排查时间、业务中断损失，这些隐性成本都要算进去。

## 3.5 实战项目：Squid + VPS 搭建加密代理池

理论讲完了，现在进入实战环节。怕浪猫带你从零搭建一个多节点加密代理池。整个方案用到的组件：多台 VPS + Squid + Redis + Python。这套方案经过我实际生产环境验证，日均处理百万级请求稳定运行。

### 3.5.1 整体架构

```
                  ┌──────────────┐
                  │  爬虫客户端   │
                  └──────┬───────┘
                         │ 获取代理信息
                  ┌──────▼───────┐
                  │  代理调度器   │  ← Redis (代理池存储)
                  │  (Python)    │
                  └──┬───┬───┬───┘
                     │   │   │
              ┌──────┘   │   └──────┐
              ▼          ▼          ▼
         ┌────────┐ ┌────────┐ ┌────────┐
         │ VPS-1  │ │ VPS-2  │ │ VPS-3  │
         │Squid   │ │Squid   │ │Squid   │
         │认证    │ │认证    │ │认证    │
         │5.6.7.8 │ │9.10.11 │ │13.14.15│
         └────────┘ └────────┘ └────────┘
```

代理调度器从 Redis 中读取可用代理列表，按权重分配给爬虫。每个 VPS 上运行一个 Squid 实例，配置了用户名密码认证。爬虫通过代理调度器获取代理地址和认证信息，直接连接对应的 VPS 发送请求。健康检查后台任务定期检测所有 VPS 节点的可用性，自动剔除不可用节点。

### 3.5.2 在 VPS 上部署 Squid 代理服务

我们用一个部署脚本来自动化完成 Squid 的安装和配置。如果你有 5 台以上的 VPS，建议用 Ansible 批量部署。这里展示单台 VPS 的部署脚本：

```bash
#!/bin/bash
# deploy_squid.sh - 在 VPS 上部署 Squid 代理
apt update && apt install squid apache2-utils -y
# 创建认证用户
htpasswd -bc /etc/squid/passwords crawler Proxy@2024
# 写入 Squid 配置
cat > /etc/squid/squid.conf << 'EOF'
http_port 3128
visible_hostname proxy-node
auth_param basic program /usr/lib/squid/basic_ncsa_auth /etc/squid/passwords
auth_param basic realm "Proxy Auth"
auth_param basic children 5
acl authenticated proxy_auth REQUIRED
acl safe_ports port 80 443
http_access deny !safe_ports
http_access allow authenticated
http_access deny all
cache deny all
EOF
systemctl restart squid && systemctl enable squid
ufw allow 3128/tcp
echo "测试: curl -x http://crawler:Proxy@2024@IP:3128 http://httpbin.org/ip"
```

把这段脚本在每台 VPS 上执行一遍，Squid 代理服务就部署好了。注意每台 VPS 建议使用不同的密码以提高安全性——如果一台 VPS 的密码泄露了，不会影响其他节点。

### 3.5.3 配置代理认证

上一节的部署脚本已经包含了认证配置。这里怕浪猫补充一个新手极易踩的坑：密码中如果包含 `@`、`:`、`/` 等特殊字符，在 URL 中会被解析为分隔符，导致认证失败。

这个坑非常隐蔽。你在命令行里用 curl 测试时可能一切正常，但用 Python 的 requests 库时就会报 `ProxyError`。原因是在 URL 格式 `http://user:pass@host:port` 中，`@` 是用户名密码和主机之间的分隔符，如果密码里包含 `@`，解析器会把 `@` 前面的部分当成密码的一部分，导致解析错误。

解决方案有两种：

第一种，对密码做 URL 编码：

```python
from urllib.parse import quote
password = "Proxy@2024"
encoded_password = quote(password, safe="")
proxy_url = f"http://crawler:{encoded_password}@1.2.3.4:3128"
```

第二种，使用 requests 的 auth 参数，避免在 URL 中拼接密码：

```python
import requests
from requests.auth import HTTPProxyAuth

proxies = {"http": "http://1.2.3.4:3128",
           "https": "http://1.2.3.4:3128"}
auth = HTTPProxyAuth("crawler", "Proxy@2024")
resp = requests.get("http://httpbin.org/ip",
                    proxies=proxies, auth=auth, timeout=10)
```

> 这个密码特殊字符的坑我踩过，调试了两个小时才发现是 `@` 被当成了 URL 分隔符。希望你能跳过去。

### 3.5.4 搭建多节点代理池

现在多台 VPS 都部署好了 Squid，接下来要把它们组织成一个代理池。我们在一台管理服务器（可以是你的爬虫服务器本身）上运行代理池服务。

代理池服务需要做以下几件事：
1. 维护所有 VPS 节点的信息（IP、端口、用户名、密码）
2. 定期检测每个节点的可用性
3. 提供统一的代理获取接口给爬虫

```python
import redis, json, time, requests
from threading import Thread

class ProxyPool:
    def __init__(self, redis_host="localhost"):
        self.redis = redis.Redis(host=redis_host, port=6379, db=0)
        self.nodes = []

    def add_node(self, ip, port, username, password):
        """添加代理节点"""
        node = {"ip": ip, "port": port, "username": username, "password": password}
        self.nodes.append(node)
        key = f"{ip}:{port}"
        self.redis.hset("proxy:nodes", key, json.dumps(node))
        self.redis.zadd("proxy:available", {key: 100})

    def check_node(self, node):
        """检测节点可用性"""
        url = f"http://{node['username']}:{node['password']}@{node['ip']}:{node['port']}"
        start = time.time()
        try:
            resp = requests.get("http://httpbin.org/ip",
                               proxies={"http": url, "https": url}, timeout=5)
            if resp.status_code == 200:
                lat = round((time.time() - start) * 1000)
                k = f"{node['ip']}:{node['port']}"
                self.redis.zadd("proxy:available", {k: lat})
                return True, lat
        except: pass
        return False, -1
```

健康检查后台任务单独封装，启动后每 5 分钟自动检测所有节点：

```python
    def start_health_check(self, interval=300):
        """启动健康检查（每5分钟）"""
        def _run():
            while True:
                for n in self.nodes:
                    ok, _ = self.check_node(n)
                    key = f"{n['ip']}:{n['port']}"
                    if not ok:
                        self.redis.zrem("proxy:available", key)
                        self.redis.sadd("proxy:unavailable", key)
                time.sleep(interval)
        Thread(target=_run, daemon=True).start()
```

这个代理池实现了节点管理、可用性检测和自动剔除。健康检查每 5 分钟运行一次，不可用的节点会被从可用池移入失效池。`daemon=True` 确保主进程退出时健康检查线程也会退出，不会阻塞进程关闭。

### 3.5.5 实现代理可用性检测与自动轮换

代理池跑起来后，爬虫端需要一个代理轮换的中间件。每次请求前从代理池获取一个代理，如果请求失败则标记代理并换一个重试。这个中间件是连接代理池和爬虫的桥梁。

```python
import requests, random, redis, json

class ProxyMiddleware:
    def __init__(self, redis_host="localhost"):
        self.redis = redis.Redis(host=redis_host, port=6379, db=0)
        self.max_retry = 3

    def get_proxy(self):
        """从代理池按权重获取代理"""
        nodes = self.redis.zrange(
            "proxy:available", 0, -1, withscores=True)
        if not nodes: return None
        key, _ = random.choice(nodes)
        d = json.loads(self.redis.hget("proxy:nodes", key))
        url = f"http://{d['username']}:{d['password']}@{d['ip']}:{d['port']}"
        return {"http": url, "https": url, "key": key.decode()}

    def request_with_proxy(self, url, method="GET", **kwargs):
        """带代理轮换的请求"""
        for _ in range(self.max_retry):
            info = self.get_proxy()
            if not info: raise Exception("代理池为空")
            key = info.pop("key")
            try:
                resp = requests.request(method, url,
                                       proxies=info, timeout=10, **kwargs)
                if resp.status_code == 200: return resp
            except: pass
            self.redis.zincrby("proxy:available", -50, key)
        raise Exception(f"重试 {self.max_retry} 次后仍失败")
```

这段代码实现了带自动轮换的请求方法。每次请求失败后会降低该代理的权重（通过 `zincrby` 减少 score），连续失败的代理 score 会越来越低，最终因为延迟分数过高而被排在可用列表末尾，实际上被自然淘汰。三次重试都失败则抛出异常，由上层逻辑处理。

> 轮换中间件的关键不在于重试本身，而在于重试时要换一个代理。如果重试还用同一个代理，重试就没有意义。

### 3.5.6 封装 Python 代理调用接口

最后，我们把代理池封装成一个开箱即用的接口，方便爬虫项目直接调用。目标是让爬虫代码完全不关心代理的细节，只管发请求。这是代理池系统的"门面"（Facade）模式。

```python
class CrawlerProxy:
    """统一的代理调用接口"""
    def __init__(self, redis_host="localhost"):
        self.middleware = ProxyMiddleware(redis_host)

    def get(self, url, **kwargs):
        return self.middleware.request_with_proxy(url, "GET", **kwargs)

    def post(self, url, **kwargs):
        return self.middleware.request_with_proxy(url, "POST", **kwargs)

# 使用示例
crawler = CrawlerProxy()
resp = crawler.get("https://target.com/api/data")
print(resp.json())
```

爬虫代码只需要初始化 `CrawlerProxy`，然后像用 `requests` 一样调用 `get` 和 `post` 方法。代理的获取、轮换、重试、健康检查全部在底层自动完成。这种封装方式的好处是：如果以后要切换代理方案（比如从 Squid 换到 TinyProxy），只需要修改底层实现，爬虫代码完全不用改。

> 好的架构设计应该让复杂度对使用者透明。爬虫开发者不需要知道代理池的实现细节，只需要知道：调 get 方法就能拿到数据。

### 3.5.7 监控与告警

代理池上线后，你需要一套监控体系来掌握运行状态。怕浪猫建议监控以下几个核心指标：

**代理池容量**：可用代理数量。如果可用代理数量突然降到 0，说明所有节点都挂了，爬虫将无法工作。设置一个阈值（比如低于 3 个可用代理），触发告警。

**代理成功率**：成功请求数 / 总请求数。这个指标反映了代理池的整体质量。成功率低于 80% 时需要关注，低于 50% 时需要立即排查。

**平均响应延迟**：所有可用代理的平均响应时间。如果延迟突然飙升，可能是 VPS 所在机房网络出了问题，或者目标网站对你的代理 IP 段做了限速。

```python
def get_pool_stats(redis_client):
    """获取代理池统计数据"""
    available = redis_client.zcard("proxy:available")
    unavailable = redis_client.scard("proxy:unavailable")
    # 计算平均延迟
    all_scores = redis_client.zrange(
        "proxy:available", 0, -1, withscores=True)
    avg_latency = 0
    if all_scores:
        avg_latency = sum(s for _, s in all_scores) / len(all_scores)
    return {
        "available": available,
        "unavailable": unavailable,
        "avg_latency_ms": round(avg_latency, 1),
        "total": available + unavailable
    }
```

把这段代码接入你的监控系统（比如 Prometheus + Grafana），就能实时掌握代理池的健康状况。如果不想搭监控系统，至少写个脚本定时检查，发现异常发个钉钉/企业微信通知。

### 3.5.8 故障排查指南

代理池跑起来后难免遇到各种问题。怕浪猫把常见问题整理成册，方便你快速定位。

**问题一：curl 测试正常，但 Python requests 报 ProxyError。**
这个问题的原因 90% 是密码中包含特殊字符（如 @）。curl 在命令行中会对 URL 做特殊处理，但 requests 的处理方式不同。解决方案是使用 `HTTPProxyAuth` 参数而不是在 URL 中拼接密码，或者对密码做 URL 编码（`urllib.parse.quote`）。

**问题二：代理能访问 httpbin.org 但无法访问目标网站。**
可能原因有两个：一是目标网站封禁了该 IP 段（特别是云服务商 IP），二是 Squid 的 `acl safe_ports` 限制导致目标端口被拒绝。检查 Squid 日志中是否有 `ACCESS DENIED` 记录，如果是端口问题，扩大 `safe_ports` 的范围。

**问题三：代理池中所有代理都不可用，但单独测试每个 VPS 都是通的。**
这种情况通常是被目标网站批量封禁了，属于业务层面的问题而非技术问题。解决方案是更换 VPS 的 IP 地址，或者增加更多节点来分散请求。

**问题四：Squid 服务重启后代理不可用。**
检查 Squid 是否正常启动：`systemctl status squid`。如果启动失败，看 `/var/log/squid/cache.log` 中的错误日志。常见原因是配置文件语法错误或密码文件路径不对。

```bash
# 检查 Squid 配置文件语法
squid -k parse
# 查看 Squid 启动日志
tail -50 /var/log/squid/cache.log
# 检查 Squid 是否在监听
netstat -tlnp | grep 3128
```

**问题五：高并发时出现 "Too many open files" 错误。**
这是系统级文件描述符限制的问题。需要同时修改 Squid 配置和系统限制，参考 3.5.7 节的性能调优部分。注意修改系统限制后需要重新登录 SSH 会话才能生效。

**问题六：认证总是失败，返回 407。**
排查步骤：第一，确认密码文件存在且格式正确（`htpasswd -c /etc/squid/passwords user`）。第二，确认 `basic_ncsa_auth` 程序存在且路径正确（在 Debian/Ubuntu 上通常在 `/usr/lib/squid/basic_ncsa_auth`）。第三，用 Squid 日志确认认证失败的原因：`tail -f /var/log/squid/access.log | grep 407`。

```bash
# 手动测试认证程序
/usr/lib/squid/basic_ncsa_auth /etc/squid/passwords
# 输入用户名密码，回车
# 正确返回 OK，错误返回 ERR
```

### 3.5.9 部署注意事项

最后怕浪猫总结几个部署时的注意事项，都是实打实踩过坑的经验，每一条都值得认真对待。

**端口不要用默认值**。Squid 默认端口 3128 是很多自动化扫描器重点关照的目标。改成高位端口（如 38888）可以大幅减少被扫描的频率。这不能替代认证，但可以减少无用的扫描日志噪音。

**开启防火墙白名单**。如果你的爬虫服务器 IP 是固定的，在 VPS 防火墙中只允许爬虫服务器 IP 访问代理端口，从网络层杜绝未授权访问。这是纵深防御思路：即使认证被破解，网络层还有一道防线。

```bash
# UFW 白名单配置
ufw default deny incoming
ufw allow from 爬虫服务器IP to any port 38888
ufw allow 22/tcp  # SSH
ufw enable
```

**日志监控**。定期检查 Squid 的 access.log，关注异常访问模式。如果某个认证用户在短时间内产生大量请求，可能是密码泄露了。如果出现大量 407 状态码（认证失败），说明有人在暴力破解你的密码。

```bash
# 查看最近 100 条访问日志
tail -100 /var/log/squid/access.log
# 统计每个用户的请求量
awk '{print $8}' /var/log/squid/access.log | sort | uniq -c | sort -rn
# 检查认证失败次数
grep " 407 " /var/log/squid/access.log | wc -l
```

**VPS 的 IP 质量**。选择 VPS 时注意 IP 是否被目标网站封禁过。有些便宜的 VPS 用的 IP 段被很多网站标记为机房 IP，代理效果会大打折扣。建议选择提供住宅 IP 的 VPS 服务商，或者购买前先用 `http://httpbin.org/ip` 测试一下目标网站是否对该 IP 返回正常。一个简单的判断方法是看 IP 的 ASN 信息——如果 ASN 属于知名的云服务商（AWS、阿里云、腾讯云等），很多网站会对此类 IP 提高风控等级。

**Squid 性能调优**。默认配置下 Squid 的文件描述符限制可能不够用。在高并发场景下需要调整，否则会出现 "Too many open files" 错误导致代理服务停止响应。

```conf
# /etc/squid/squid.conf 性能调优
max_filedescriptors 65536
# worker 进程数（建议等于 CPU 核心数）
workers 2
# 每个 worker 的文件描述符
worker_rlimit 32768
```

同时修改系统级文件描述符限制：

```bash
echo "fs.file-max = 655350" >> /etc/sysctl.conf
sysctl -p
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf
```

修改完后需要重新登录 SSH 会话才能生效（`limits.conf` 的修改不会影响当前会话）。做完这些调整后重启 Squid，你的代理服务就能扛住高并发了。

> 部署不是一锤子买卖。上线后的第一周密切关注日志和监控，发现问题及时调整。很多性能问题只有在真实流量下才会暴露。

### 3.5.10 代理池的进阶优化

代理池跑稳之后，可以考虑做一些进阶优化来提升整体效率。

**代理预热**：在新节点加入代理池时，先做一轮预热检测，确认可用后再加入可用池。避免新节点刚上线就被分配给爬虫使用，结果发现不可用导致请求失败。

```python
def add_node_with_warmup(self, ip, port, username, password):
    """带预热的节点添加"""
    node = {"ip": ip, "port": port,
            "username": username, "password": password}
    ok, latency = self.check_node(node)
    if ok:
        self.nodes.append(node)
        self.redis.hset("proxy:nodes", f"{ip}:{port}",
                        json.dumps(node))
        self.redis.zadd("proxy:available",
                        {f"{ip}:{port}": latency})
        print(f"节点 {ip}:{port} 预热成功")
    else:
        print(f"节点 {ip}:{port} 预热失败")
```

**按目标网站分组**：不同网站对代理的封禁策略不同。同一个代理 IP 访问 A 网站可能正常，访问 B 网站可能被封。可以为不同的目标网站维护不同的代理子池，提高代理利用率。

```python
def get_proxy_for_target(self, target_domain):
    """获取针对特定目标网站的代理"""
    key = f"proxy:available:{target_domain}"
    proxies = self.redis.zrange(key, 0, 0)
    if proxies:
        return proxies[0].decode()
    return self.get_proxy()  # 回退到通用池
```

**自动恢复机制**：失效的代理不一定是永久失效。可能是网络抖动导致临时不可用，过一段时间就恢复了。可以定期对失效代理做恢复检测，能通的重新加入可用池。

```python
def recovery_check(self):
    """检测失效池中的代理是否恢复"""
    failed = self.redis.smembers("proxies:unavailable")
    for proxy_bytes in failed:
        proxy = proxy_bytes.decode()
        ok, latency = check_proxy(proxy)
        if ok:
            self.redis.srem("proxies:unavailable", proxy)
            self.redis.zadd("proxies:available",
                            {proxy: latency})
            self.redis.hset("proxies:detail:" + proxy,
                            "fail", 0)
```

建议恢复检测的频率比正常检测低一些，比如每小时做一次。因为大部分失效代理确实是不可恢复的（IP 被永久封禁），频繁检测只是浪费资源。

> 代理池的优化是一个持续过程。先用最简单的方案跑起来，根据实际数据逐步优化，不要一开始就过度设计。

## 本章总结

这篇文章我们从代理 IP 的基础知识出发，一路走过了服务商选型、Squid 自建代理、代理池架构设计、第三方代理封装，最后完成了一个完整的多节点加密代理池实战项目。内容覆盖了从理论到代码实现的全链路。

怕浪猫帮你划几个重点：

第一，代理 IP 的匿名等级是硬指标，爬虫场景必须选高匿代理。无论你用第三方还是自建，这个底线不能破。拿到代理后第一步永远是抓包验证匿名等级，不要轻信宣传。

第二，Squid 配置认证不是可选项。在公网暴露的代理端口如果没有认证保护，被白嫖还算小事，被拿来做违法的事情你就麻烦大了。basic_auth + 防火墙白名单是最基本的安全基线。

第三，代理池的核心是"获取-验证-存储-调度"四板斧。这四个模块形成一个闭环，任何一个环节缺失都会导致代理池不可用。Redis 的 ZSet 数据结构天然适合做代理池存储，按响应延迟排序的调度策略可以让好代理被优先使用。

第四，自建代理和第三方代理不是非此即彼的选择。根据业务规模灵活组合，自建为主保底、第三方为辅应对峰值，是很多大公司的实际做法。成本分析时要把运维人力和故障损失也算进去。

第五，部署代理服务时，端口、防火墙、日志监控、性能调优一个都不能少。安全意识和运维意识决定了你的代理服务能跑多久。默认配置只能跑 Demo，生产环境必须做调优。

> 代理服务搭建是一次性的工作，但代理池的维护是持续的工作。好的代理池系统不是搭出来的，是养出来的。

下章预告：第4章将破解加密登录，从JS逆向分析到Python重构加密函数，突破无限Debugger反调试。

怕浪猫说：代理池这块的内容看起来多，但核心逻辑并不复杂。真正难的不是技术实现，而是在生产环境中遇到各种边界情况时的处理能力。IP 被批量封禁怎么办、VPS 被服务商停机怎么办、代理延迟突增怎么办——这些问题只有实战才能教会你。如果你在搭建过程中遇到任何问题，欢迎在评论区交流，怕浪猫会逐条回复。

系列进度 3/11