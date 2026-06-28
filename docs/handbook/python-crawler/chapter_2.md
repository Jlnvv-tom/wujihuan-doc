# 第2章 必须掌握的 HTTP 网络基础知识

90%的爬虫工程师，连一次完整的 TLS 握手都说不出个所以然。更扎心的是，大多数人遇到 403 就只知道换 User-Agent，遇到 429 就只知道加 sleep。如果你的爬虫存活率低于 10%，大概率不是目标网站反爬太强，而是你对 HTTP 协议的理解还停留在"发请求收响应"的层面。

我是怕浪猫，一个在爬虫坑里摸爬滚打多年的开发者。从最早的 requests 爬到现在的 TLS 指纹对抗，我踩过的坑比很多人写过的代码都多。这一章我会把 HTTP 网络基础知识掰碎了讲，从 HTTPS 安全机制到 HTTP 协议演进，从请求头指纹到证书认证，每个知识点都配实战代码和踩坑经验。看完这篇，你写爬虫时会有一种"开了天眼"的感觉。

## 2.1 HTTPS 安全机制

### 2.1.1 为什么 HTTPS 是安全的

要理解 HTTPS 为什么安全，得先搞清楚 HTTP 为什么不安全。

HTTP 是明文传输协议。你在网络上发送的每一个请求、每一行数据，都是裸奔的。这就好比你寄明信片，从你手里到对方手里，中间经过邮递员、分拣员、快递站，任何一个环节的人低头一看就能知道全部内容。在网络世界里，"邮递员"可能是你的宽带运营商、咖啡馆的 WiFi 提供者、公司网管，甚至是某个在中间链路上做流量劫持的攻击者。

明文传输带来了三个核心安全问题。第一是窃听风险，任何人只要能在网络链路上抓包，就能看到你传输的全部内容，包括密码、Cookie、个人隐私数据。你可能在咖啡店连了免费 WiFi，然后登录了某个网站，隔壁桌的人用 Wireshark 抓包就拿到了你的密码。第二是篡改风险，中间人可以修改你发送或接收的数据，比如往网页里注入广告、恶意脚本，或者修改服务器返回的数据。第三是冒充风险，你访问的 `www.bank.com` 可能根本不是真正的银行网站，而是攻击者搭建的钓鱼站点。你的浏览器看起来连接的是银行，实际上连的是攻击者的服务器。

HTTPS = HTTP + TLS/SSL。它在 HTTP 和 TCP 之间加了一层加密，专门解决上述三个问题：

- **机密性**：数据加密传输，即使中间人抓到了数据包，也只能看到一堆乱码，无法还原明文内容。加密使用的是高强度算法（如 AES-256），暴力破解在计算上不可行
- **完整性**：每个数据包都带校验码（MAC），数据传输过程中如果被篡改一个字节，校验就会失败，连接会被立即终止。这保证了数据从服务器到客户端的传输过程中不被修改
- **身份认证**：通过数字证书验证服务器身份，确保你连接的是真正的 `www.bank.com` 而不是钓鱼网站。证书由受信任的第三方机构（CA）签发，伪造证书在计算上不可行

> 爬虫工程师不懂 HTTPS，就像司机不懂刹车原理。平时没事，一旦出事就是抓瞎。

现在几乎所有主流网站都强制使用 HTTPS。Chrome 浏览器从 2018 年开始就把 HTTP 网站标记为"不安全"。对于爬虫来说，HTTPS 是你必须面对的基础环境，不是可选项。理解 HTTPS 的工作原理，不仅帮助你写出更健壮的爬虫，还能帮你排查各种 SSL 错误和抓包问题。

### 2.1.2 对称加密 vs 非对称加密 vs 混合加密

HTTPS 的加密方案不是单一选择，而是三种方式的巧妙组合。理解这一点，是理解 TLS 握手过程的前提。很多爬虫开发者对加密一知半解，导致遇到 SSL 相关问题时完全不知道从何排查，只能去搜索引擎找现成的答案，知其然不知其所以然。

**对称加密：** 加密和解密用同一把钥匙。就像你用一个密码锁箱，锁上和打开用的是同一个密码。AES、DES、ChaCha20 都是对称加密算法。对称加密的优势是速度快，适合加密大量数据，性能比非对称加密快 100 到 1000 倍。现代 CPU 还针对 AES 做了硬件加速（AES-NI 指令集），加密解密几乎不产生额外开销。

对称加密的致命问题在于钥匙怎么安全地给对方。如果你把对称密钥也通过网络发给服务器，那任何能截获这个包的人都能拿到密钥，后续的加密就形同虚设了。这就是所谓的"密钥分发问题"。在互联网环境下，客户端和服务器之间可能经过十几个中间节点，任何一个节点都可能截获你的密钥。

**非对称加密：** 使用一对数学上关联的密钥——公钥和私钥。公钥加密的数据只能用私钥解密，私钥加密的数据只能用公钥解密。公钥可以公开给任何人，私钥必须严格保密。RSA、ECC（椭圆曲线）、DSA 都是非对称加密算法。

非对称加密完美解决了密钥分发问题：服务器把公钥发给客户端，客户端用公钥加密数据，只有持有私钥的服务器才能解密。即使中间人截获了公钥和加密数据，没有私钥也无法解密。但非对称加密的计算开销极大，加密 1MB 数据用 RSA 可能需要几百毫秒，用 AES 只要不到 1 毫秒。所以非对称加密不适合直接用于业务数据传输，只适合加密少量数据（如密钥本身）。

**混合加密：** HTTPS 的实际方案，结合了两者的优势。先用非对称加密协商出一个对称密钥（这步叫密钥交换），之后的数据传输全部使用对称加密。既解决了密钥分发问题，又保证了传输性能。这个过程就像两个人先用复杂的暗号确认对方身份并约定一个简单的密码，之后所有通信都用这个简单密码加密，效率极高。

```
┌──────────────────────────────────────────────────┐
│           HTTPS 混合加密三步走                    │
├──────────────────────────────────────────────────┤
│                                                  │
│  第一步：密钥协商（非对称加密，慢但安全）         │
│  ┌────────┐                            ┌────────┐│
│  │ Client │ ── 公钥加密 ──────────>  │ Server ││
│  │        │ <─ 证书+公钥 ──────────  │        ││
│  │        │ ── 加密的密钥 ─────────>  │        ││
│  └────────┘                            └────────┘│
│                                                  │
│  第二步：密钥生成（双方各自计算，不传输）         │
│  Client 和 Server 用相同算法生成相同的对称密钥    │
│                                                  │
│  第三步：数据传输（对称加密，快且安全）           │
│  ┌────────┐ <══ 对称加密通道 ══> ┌────────┐     │
│  │ Client │   所有业务数据走这   │ Server │     │
│  └────────┘                      └────────┘     │
└──────────────────────────────────────────────────┘
```

对爬虫来说，这个混合加密机制意味着什么？你无法简单地"截获"HTTPS 流量来分析接口参数。你的爬虫发送的请求在网络上是被加密的，用 Wireshark 抓包只能看到密文。如果你想分析自己的爬虫请求或目标网站的接口，需要用 MITM（中间人代理）工具如 mitmproxy 或 Charles。这些工具的原理就是在客户端和服务器之间插入一个"假服务器"：它向真正的服务器冒充客户端，向客户端冒充服务器。前提是你的爬虫要信任这个假服务器的根证书，否则 TLS 握手会失败。这就是为什么配置 mitmproxy 时需要安装它的 CA 证书。

### 2.1.3 TLS/SSL 握手过程详解

TLS 握手是 HTTPS 建立加密连接的核心过程。我在面试中问过很多爬虫工程师，能完整说出来的不到 20%。但这个知识点对理解 HTTPS 抓包和 TLS 指纹反爬至关重要。你不理解握手过程，就无法理解为什么有些网站能在你发请求的第一秒就判定你是爬虫。

以 TLS 1.2 为例，完整握手流程分为四个阶段，每个阶段都有明确的目的：

**阶段一：协商参数（ClientHello 和 ServerHello）**

客户端首先发送 ClientHello 消息，包含：客户端支持的 TLS 版本列表（如 TLS 1.0、1.1、1.2、1.3）、客户端支持的加密套件列表（如 AES-256-GCM-SHA384、ECDHE-RSA-AES128-GCM-SHA256）、客户端生成的随机数（Client Random，32 字节）、会话 ID（用于会话恢复）、扩展字段（SNI、支持的椭圆曲线、签名算法等）。

服务器收到 ClientHello 后回复 ServerHello，包含：服务器选定的 TLS 版本（从客户端列表中选一个）、服务器选定的加密套件（从客户端列表中选一个）、服务器生成的随机数（Server Random，32 字节）、会话 ID。

这个阶段就像双方互相亮明身份，确认彼此能说什么"语言"（加密算法）。客户端说"我会说 AES、ChaCha20、RSA"，服务器说"那我们用 AES 加密、RSA 签名"。

**阶段二：证书交换与验证**

服务器把自己的数字证书发给客户端。证书里包含服务器的公钥、域名、有效期、签发机构等信息。如果服务器需要客户端证书（双向认证，在银行等高安全场景中使用），还会发 CertificateRequest 请求。

客户端收到证书后进行严格验证。第一检查证书是否由受信任的 CA 签发，通过证书链追溯到系统内置的根证书。第二检查证书是否在有效期内，过期的证书不可信。第三检查证书中的域名是否与实际访问的域名匹配，这包括精确匹配和通配符匹配（如 `*.example.com`）。第四检查证书是否被吊销，通过 OCSP（在线证书状态协议）或 CRL（证书吊销列表）检查。

如果任何一项验证失败，客户端会中断连接并报错。这就是你在浏览器里看到"您的连接不是私密连接"警告的时刻。在爬虫中，这表现为 `ssl.SSLCertVerificationError` 异常。

**阶段三：密钥交换**

客户端生成第三个随机数 PreMasterSecret，用服务器的公钥加密后发送给服务器。服务器用自己的私钥解密得到 PreMasterSecret。这个步骤是整个握手过程中最关键的安全环节——中间人即使截获了加密的 PreMasterSecret，没有服务器的私钥也无法解密。

此时双方都有了 Client Random、Server Random、PreMasterSecret 三个值。双方用相同的伪随机函数（PRF）将这三个值计算出相同的对称密钥（Master Secret），再从 Master Secret 派生出加密密钥、MAC 密钥、IV 等会话密钥材料。

这个设计很巧妙：三个随机数中两个是明文传输的，但第三个 PreMasterSecret 是加密传输的，所以即使中间人截获了所有握手消息，没有私钥也无法计算出相同的对称密钥。而且三个随机数保证了每次连接的密钥都不同，即使某次会话密钥泄露也不会影响其他会话。

**阶段四：切换到加密通信**

双方互发 ChangeCipherSpec 消息，表示"从现在开始，我发的消息都是加密的了"。然后各发一条 Finished 消息，内容是前面所有握手消息的摘要加密后的值。对方解密后比对，如果一致，说明握手过程没有被篡改。至此，加密通道建立完毕，可以开始传输业务数据了。

```
┌────────┐                                          ┌────────┐
│ Client │                                          │ Server │
└───┬────┘                                          └───┬────┘
     │  阶段一：协商参数                                │
     │  1. ClientHello (版本+套件+随机数A)              │
     │ ─────────────────────────────────────────────> │
     │  2. ServerHello (选定套件+随机数B)               │
     │ <───────────────────────────────────────────── │
     │                                                   │
     │  阶段二：证书验证                                  │
     │  3. Certificate (服务器证书+公钥)                 │
     │  4. ServerHelloDone                               │
     │ <───────────────────────────────────────────── │
     │  5. 客户端验证证书 (CA签名/有效期/域名)            │
     │                                                   │
     │  阶段三：密钥交换                                  │
     │  6. ClientKeyExchange (公钥加密的PreMaster)       │
     │  7. 双方用 随机数A+随机数B+PreMasterSecret        │
     │     计算出相同的对称密钥                            │
     │                                                   │
     │  阶段四：切换加密                                  │
     │  8. ChangeCipherSpec + Finished (加密验证)        │
     │ ─────────────────────────────────────────────> │
     │  9. ChangeCipherSpec + Finished (加密验证)        │
     │ <───────────────────────────────────────────── │
     │                                                   │
     │  ═════════ 加密通道建立，开始传输数据 ═════════  │
     │ <═════════════════════════════════════════════> │
```

> 爬虫工程师为什么要懂 TLS 握手？因为有些高级反爬会在 TLS 指纹上做文章。你的 Python requests 库的 TLS 握手行为和真实浏览器不一样，服务器在握手阶段就能识别出来。

用 Python 验证 TLS 握手过程：

```python
import ssl
import socket

def inspect_tls_handshake(hostname, port=443):
    context = ssl.create_default_context()
    with socket.create_connection((hostname, port)) as sock:
        with context.wrap_socket(
            sock, server_hostname=hostname
        ) as ssock:
            cert = ssock.getpeercert()
            cipher = ssock.cipher()
            version = ssock.version()
            print(f"TLS版本: {version}")
            print(f"加密套件: {cipher[0]}")
            print(f"密钥长度: {cipher[2]}位")
            print(f"证书主体: {cert['subject']}")
            print(f"证书签发者: {cert['issuer']}")
            print(f"有效期: {cert['notAfter']}")

inspect_tls_handshake('www.python.org')
```

这段代码能让你直观看到握手协商的结果：用了哪个 TLS 版本、哪个加密套件、密钥长度多少、证书是谁签发的。调试 HTTPS 问题时非常有用。比如你怀疑某个网站启用了 TLS 1.3 而你的 Python 版本不支持，运行这段代码就能确认。

关于 TLS 指纹识别的反爬技术，可以参考 [Cloudflare 的 JA3 指纹文档](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-jsa3/) 了解更多。JA3 通过对 TLS ClientHello 中的版本、加密套件、扩展等字段做 MD5 哈希，生成一个指纹。不同客户端（Chrome、Firefox、Python requests、curl）的 JA3 指纹各不相同，服务器可以在握手阶段就据此拦截非浏览器流量。要绕过 JA3 检测，可以使用 `curl_cffi` 库模拟浏览器的 TLS 指纹，或者用 Playwright/Selenium 等浏览器自动化方案。

### 2.1.4 证书链验证机制

证书不是凭空来的，它是一个树形信任结构。理解证书链，对于排查 SSL 错误和理解 HTTPS 身份认证至关重要。

根证书（Root CA）是自签名的，它的公钥内置在操作系统和浏览器中。像 DigiCert、GlobalSign、Let's Encrypt 这些名字你可能见过，它们就是根 CA。中间证书（Intermediate CA）由根 CA 签发，用于签发终端网站证书。为什么要有中间层？因为根 CA 的私钥极其珍贵，直接用根 CA 签发证书意味着每次签发都要使用根私钥，增加泄露风险。通过中间层，即使中间 CA 的私钥泄露，只需要吊销该中间证书，不影响根 CA 的其他业务。

```
          ┌──────────────┐
          │  Root CA     │  ← 操作系统/浏览器内置信任
          │  (自签名)     │     如 DigiCert, Let's Encrypt
          └──────┬───────┘
                 │ 签发
          ┌──────▼───────┐
          │ Intermediate │  ← 可能有多层
          │  CA          │     如 Let's Encrypt R3
          └──────┬───────┘
                 │ 签发
          ┌──────▼───────┐
          │  网站证书     │  ← 服务器返回给你的
          │  (python.org) │     包含公钥+域名+有效期
          └──────────────┘
```

验证过程：服务器返回证书时，会带上完整的证书链（网站证书加中间证书，根证书不需要发因为客户端已经有了）。客户端从网站证书开始往上追溯：用中间证书的公钥验证网站证书的签名，再用根证书的公钥验证中间证书的签名。如果最终能追溯到一个本地信任的根证书，整条链验证通过。

如果链中任何一环验证失败——签名不匹配、证书过期、证书被吊销——连接就会被拒绝。有些服务器配置不当，只返回了网站证书而没返回中间证书，这会导致某些客户端（特别是 Java、Python）验证失败，而 Chrome 因为有证书缓存可能不受影响。这种问题在爬虫开发中经常遇到，表现就是"浏览器能访问但代码报 SSL 错误"，让很多人一头雾水。

## 2.2 HTTP 状态码

### 2.2.1 HTTP 状态码告诉我们哪个环节出了问题

每次 HTTP 请求都会返回一个三位数的状态码，它是最直接的诊断信号。爬虫工程师应该对常见状态码形成条件反射——看到某个码就知道问题出在哪、该怎么处理。这就像医生看化验单一样，每个指标异常都对应着不同的病因。

状态码按首位数字分为五类：

| 范围 | 类别 | 含义 | 爬虫关注度 |
|------|------|------|------------|
| 1xx | 信息性 | 请求已接收，继续处理 | 低 |
| 2xx | 成功 | 请求已成功处理 | 中 |
| 3xx | 重定向 | 需要进一步操作 | 高 |
| 4xx | 客户端错误 | 请求有误或被拒绝 | 极高 |
| 5xx | 服务端错误 | 服务器处理失败 | 高 |

> 状态码是爬虫的仪表盘。忽视状态码就等于蒙眼开车，翻车只是时间问题。

很多爬虫开发者有一个坏习惯：只判断 `resp.status_code == 200` 就认为请求成功，其他情况一律忽略。这在数据量小的时候没问题，但当你每天爬几百万个页面时，不对状态码做精细化处理，你根本不知道有多少请求实际上失败了、为什么失败。更糟糕的是，有些网站在反爬时不是返回 403，而是返回 200 但内容是验证码页面。所以状态码只是第一道检查，还要检查响应内容。

### 2.2.2 2xx / 3xx / 4xx / 5xx 在爬虫中的含义

**2xx 成功类：** 200 OK 是最理想的响应，表示请求成功。但要注意 206 Partial Content，它表示返回的是部分内容，通常出现在 Range 请求中。爬虫在下载大文件（图片、视频、PDF）时经常会用到断点续传，这时服务器就返回 206。还有 201 Created，表示资源创建成功，常见于 POST 请求创建数据的场景。在爬虫中 2xx 是好状态码，但不要忘了检查响应体是否是真正的业务数据，有些反爬会用 200 状态码返回验证码或空数据。

**3xx 重定向类：** 爬虫最常遇到的状态码之一。301 永久重定向意味着目标地址永久变更了，你应该更新 URL 记录，下次直接访问新地址。302 临时重定向表示资源暂时在另一个地址，下次请求还是应该用原 URL。303 See Other 表示请用 GET 方法访问新地址，常见于 POST 表单提交后重定向到结果页。304 Not Modified 配合缓存使用，表示资源自上次请求以来未修改，可以用本地缓存，这在条件请求时能节省带宽。307 和 308 是 302 和 301 的严格版本，区别在于不会改变请求方法（302 可能将 POST 变为 GET，307 不会）。

**4xx 客户端错误类：** 爬虫工程师最头疼的区间。400 Bad Request 表示请求参数有误，可能是 URL 编码问题或缺少必要参数。401 Unauthorized 表示未认证，需要登录或提供认证 Token。403 Forbidden 表示服务器拒绝你的请求，这是反爬最常用的状态码。404 Not Found 表示 URL 不存在，可能是页面被删除或 URL 结构变了。429 Too Many Requests 表示请求频率超限，服务器在告诉你"慢一点"。

**5xx 服务端错误类：** 500 Internal Server Error 是服务器内部错误，通常是代码异常。502 Bad Gateway 是网关收不到上游服务器的响应，可能是上游服务挂了。503 Service Unavailable 是服务暂时不可用，可能是维护中或过载。504 Gateway Timeout 是网关等待上游超时。遇到 5xx 通常重试就能解决，但如果频繁出现，可能是你的请求参数触发了服务器某个 bug，需要检查请求是否异常。

### 2.2.3 301/302 重定向处理

重定向处理是爬虫的基本功。requests 库默认会自动跟随重定向，但很多场景你需要手动控制重定向行为，加入自定义逻辑。

```python
import requests

# 默认自动跟随重定向
resp = requests.get('http://example.com/old-page')
print(f"最终URL: {resp.url}")
print(f"状态码: {resp.status_code}")
print(f"重定向历史: {[r.status_code for r in resp.history]}")

# 禁用自动重定向，手动处理
resp = requests.get('http://example.com/old-page',
                    allow_redirects=False)
if resp.status_code in (301, 302, 303, 307, 308):
    location = resp.headers.get('Location')
    print(f"重定向目标: {location}")
    if 'login' in location.lower():
        print("被重定向到登录页，Cookie可能已过期")
```

实际踩坑经验：很多网站的登录态失效后不会返回 401，而是 302 重定向到登录页。如果你不做检测，爬虫会默默地爬一堆登录页的 HTML，还以为数据都抓到了。我就遇到过一次，爬虫跑了整整一天，第二天检查数据发现全是登录页的 HTML，白白浪费了 24 小时的机器资源和代理 IP。从那以后，我每次请求后都会检查 `resp.url` 是否跳到了登录页。另外有些重定向会从 HTTP 跳到 HTTPS，或者从 `www.example.com` 跳到 `example.com`，这种跨域重定向可能导致你的 Cookie 丢失，因为 Cookie 有域名限制。解决方案是在 Session 中配置好所有相关域名的 Cookie。

### 2.2.4 403 Forbidden / 429 Too Many Requests 的反爬含义

403 和 429 是反爬对抗中最常见的两个状态码，但它们的含义完全不同，应对策略也截然不同。分不清这两者的爬虫工程师，往往会用错药——该换头的时候去加延时，该降速的时候去换 IP，越修越乱。

**403 Forbidden 的含义：** 服务器明确拒绝你的请求，和频率无关。原因可能包括：User-Agent 被识别为爬虫、IP 地址被封禁、请求头不完整缺少关键字段、Referer 验证失败、Cookie 缺失或已过期、请求行为模式被风控系统判定为非人类。403 是"静态拦截"，服务器在握手或请求解析阶段就判定你不是合法用户，不看你的请求频率。

应对 403 的策略：逐一排查请求头是否完整、是否与真实浏览器一致；检查 IP 是否被封（换代理测试）；检查是否需要登录态（补充 Cookie）；检查是否有隐藏的签名参数（分析前端 JS 代码）。

**429 Too Many Requests 的含义：** 请求频率超限。这是"动态限流"，服务器认为你的请求频率超过了正常用户的行为模式。429 通常会伴随 `Retry-After` 响应头，告诉你多久后再试。429 说明你的身份没问题（如果身份有问题就直接 403 了），问题出在速度上。

应对 429 的策略：降低请求频率；使用指数退避重试；分散请求到多个 IP（代理池）；在非高峰时段加大并发量。

```python
import requests
import time
import random

def request_with_retry(url, max_retries=3):
    for attempt in range(max_retries):
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            return resp
        elif resp.status_code == 429:
            wait = int(resp.headers.get(
                'Retry-After', 5))
            wait += random.randint(0, 3)
            print(f"被限流，等待{wait}秒后重试")
            time.sleep(wait)
        elif resp.status_code == 403:
            print("被拦截，需检查请求头或更换IP")
            break
        elif resp.status_code >= 500:
            backoff = 2 ** attempt
            print(f"服务器错误，{backoff}秒后重试")
            time.sleep(backoff)
        else:
            print(f"未处理的状态码: {resp.status_code}")
            return resp
    return None
```

> 403 是身份问题（你不是合法用户），429 是行为问题（你太快了）。分清这两者，反爬策略才不会南辕北辙。

重试时加随机抖动是一个重要细节。如果你和别的爬虫同时被限流，都精确等待 5 秒后重试，又会同时打过去再次被限流。加上 0 到 3 秒的随机抖动可以避免这种"惊群效应"。指数退避也是关键策略：第一次等 1 秒，第二次等 2 秒，第三次等 4 秒，逐渐增加间隔，给服务器喘息的空间。

HTTP 状态码的完整定义可以参考 [RFC 9110](https://datatracker.ietf.org/doc/html/rfc9110#name-status-codes) 和 [MDN 文档](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Status)。

## 2.3 HTTP 请求头与反爬

### 2.3.1 这些 HTTP 请求头信息出卖了爬虫

请求头是爬虫和服务器之间的"身份证"。很多开发者只关注 User-Agent，却忽略了其他请求头。实际上，现代反爬系统会综合分析所有请求头来判断你是否是真实浏览器。任何一个请求头的缺失或不合理，都可能成为反爬系统的判断依据。

一个真实 Chrome 浏览器的请求头通常包含十几个字段，而且字段之间有内在一致性。比如 Accept-Language 和浏览器语言设置要匹配，Accept-Encoding 和浏览器类型要匹配，Referer 和当前页面要有逻辑关系，Sec-Fetch 系列头的值要和请求场景吻合。这种一致性是很难完全伪造的，因为你不清楚每个字段的取值规则。

来看一个对比，这是真实 Chrome 浏览器发送的请求头：

```
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,
        image/avif,image/webp,image/apng,*/*;q=0.8
Accept-Encoding: gzip, deflate, br, zstd
Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
Cache-Control: max-age=0
Connection: keep-alive
Cookie: session_id=xxx; csrf_token=yyy
Host: www.example.com
Sec-Ch-Ua: "Google Chrome";v="125", "Chromium";v="125"
Sec-Ch-Ua-Mobile: ?0
Sec-Ch-Ua-Platform: "macOS"
Sec-Fetch-Dest: document
Sec-Fetch-Mode: navigate
Sec-Fetch-Site: none
Sec-Fetch-User: ?1
Upgrade-Insecure-Requests: 1
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)
            AppleWebKit/537.36 (KHTML, like Gecko)
            Chrome/125.0.0.0 Safari/537.36
```

而 Python requests 默认发送的请求头只有四个：

```
User-Agent: python-requests/2.31.0
Accept-Encoding: gzip, deflate
Accept: */*
Connection: keep-alive
```

差距一目了然。requests 默认只发 4 个请求头，其中 User-Agent 直接暴露了 `python-requests`。这在任何有点反爬意识的网站面前都活不过一秒。更要命的是，即使你改了 User-Agent，其他头的缺失同样会暴露你。真实浏览器会发送 Sec-Fetch 系列头、Sec-Ch-Ua 系列头、Accept-Encoding 中的 br 和 zstd，这些 requests 默认都不带。

### 2.3.2 User-Agent 指纹识别与伪装

User-Agent 是最基础也是最容易伪造的反爬检测点。但很多人只做了一步：把 UA 改成浏览器的，就以为万事大吉了。现代反爬系统的 UA 检测远不止简单的关键词匹配，而是多层次的交叉验证。

第一层检测：UA 字符串中是否包含 `python-requests`、`scrapy`、`curl`、`Java`、`Go-http-client` 等已知爬虫标识。这是最低级的检测，改个 UA 就能绕过。大多数教程只教到这一层。

第二层检测：UA 与其他请求头的一致性。你声称是 Chrome 125，但 Sec-Ch-Ua 头里写的却是 Chrome 120，直接露馅。或者你声称是 macOS 上的 Chrome，但 Sec-Ch-Ua-Platform 写的是 Windows，同样矛盾。这一层检测需要你理解 Sec-Ch-Ua 系列头与 UA 的对应关系。

第三层检测：UA 与 TLS 指纹的交叉验证。你的 UA 说是 Chrome，但 TLS 握手时的 JA3 指纹却是 Python ssl 模块的特征。这种检测不看请求头，直接在 TCP 层就能识别。目前只有 Cloudflare、Akamai 等顶级反爬服务才做到这一层，绕过难度最高。

```python
import requests
import random

BROWSER_PROFILES = [
    {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X '
                       '10_15_7) AppleWebKit/537.36 (KHTML, like '
                       'Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";'
                     'v="125", "Not.A/Brand";v="24"',
        'Sec-Ch-Ua-Platform': '"macOS"',
    },
    {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                       'AppleWebKit/537.36 (KHTML, like Gecko) '
                       'Chrome/125.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Google Chrome";v="125", "Chromium";'
                     'v="125", "Not.A/Brand";v="24"',
        'Sec-Ch-Ua-Platform': '"Windows"',
    },
]

headers = random.choice(BROWSER_PROFILES)
headers.update({
    'Accept': 'text/html,application/xhtml+xml,'
              'application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
})
resp = requests.get('https://www.example.com', headers=headers)
```

注意上面的代码不仅设置了 UA，还配套设置了 Sec-Ch-Ua 系列头。这些是 Chrome 浏览器自动发送的客户端提示头，缺了它们反而可疑。另外 UA 池不宜过大，同一天内频繁切换不同 UA 比固定一个 UA 更可疑——真实用户的浏览器不会每隔几分钟变一个型号。

还有一个高级技巧是使用 `fake-useragent` 库生成真实的浏览器 UA。这个库会从真实浏览器中采集 UA 字符串，比手动维护的 UA 池更真实、更全面。但要注意定期更新 UA 库，因为浏览器版本在不断迭代。

对于更高级的反爬场景，如果目标网站使用 TLS 指纹检测，你可能需要用 `curl_cffi` 库来模拟真实浏览器的 TLS 握手行为。`curl_cffi` 底层使用 libcurl 和 BoringSSL（Chrome 使用的 SSL 库），能生成与 Chrome 浏览器一致的 JA3 指纹。这是目前绕过 Cloudflare 等 TLS 指纹检测最有效的方案之一。

### 2.3.3 Referer 来源验证

Referer 告诉服务器"我是从哪个页面跳过来的"。很多网站的接口会检查 Referer，确保请求来自合法的页面流程。这在图片防盗链和接口防刷场景中特别常见。

比如你在爬一个图片网站，直接访问图片 URL 可能返回 403，但如果带上从详情页来的 Referer 就能正常下载。这是因为服务器认为，只有通过页面浏览的用户才会请求图片资源，直接访问图片 URL 的大概率是爬虫。这种防盗链机制在很多图片站、视频站、壁纸站中都有应用。

```python
headers = {
    'Referer': 'https://www.example.com/search?q=python',
    'User-Agent': 'Mozilla/5.0 ... Chrome/125.0.0.0',
}
resp = requests.get(
    'https://www.example.com/detail/12345', headers=headers
)
```

踩坑提示：Referer 的值必须是完整 URL，包括协议（https://）。有些反爬系统还会检查 Referer 的域名是否与目标 URL 属于同一站点。如果你从 `a.com` 跳转到 `b.com` 但带了 `a.com` 的 Referer，某些系统会认为这是异常行为。另外一个容易忽略的点是：翻页时每一页的 Referer 应该是上一页的 URL，而不是首页的 URL。有些反爬系统会检查 Referer 和实际请求 URL 的逻辑关系，如果翻到第 10 页了 Referer 还是首页 URL，就会被判定为异常。

### 2.3.4 Accept-Language / Accept-Encoding 特征分析

这两个头虽然不起眼，但高级反爬系统会利用它们做特征分析。因为这些头的值和用户的操作系统、浏览器设置强相关，伪造起来比 User-Agent 难得多。

**Accept-Language** 表示用户偏好的语言。一个中文用户使用的浏览器通常发送 `zh-CN,zh;q=0.9`，表示最偏好简体中文，其次是中文，然后是其他语言。如果你的 UA 声称是中文 Windows 用户，但 Accept-Language 却是 `en-US,en;q=0.9`，这种不一致就是反爬系统的判断依据。`q` 值表示偏好权重，从 0 到 1，Chrome 默认的格式是 `zh-CN,zh;q=0.9,en;q=0.8`，你可以照着这个格式设置。

**Accept-Encoding** 表示客户端支持的内容编码。Chrome 浏览器会发送 `gzip, deflate, br, zstd`，其中 `br`（Brotli 压缩）和 `zstd`（Zstandard 压缩）是现代浏览器才支持的算法。requests 默认只发送 `gzip, deflate`，在反爬系统看来这就是一个非浏览器特征。Brotli 压缩率比 gzip 高 15% 到 25%，现代网站越来越倾向于使用 br 压缩。

```python
headers = {
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
}
```

注意如果声明支持 `br` 编码，需要安装 brotli 库才能正确解码响应体，否则 requests 会返回未解码的压缩数据，看起来就是一堆乱码：

```bash
pip install brotli
```

> 反爬不是单点检测，是综合判定。你伪装了 10 个请求头特征，漏掉 1 个，前面的努力就可能白费。

### 2.3.5 X-Requested-With 与 AJAX 请求识别

`X-Requested-With: XMLHttpRequest` 是一个非标准但广泛使用的请求头，用于标识 AJAX 请求。jQuery 和早期 Axios 会自动添加这个头，现代 fetch API 默认不加。

服务器端经常用这个头来区分正常页面访问和 AJAX 接口调用。如果接口要求这个头而你没带，就会返回 403 或重定向到首页。反过来，有些接口只在 AJAX 请求时返回 JSON，非 AJAX 请求返回 HTML 页面。所以在爬取 API 接口时，带上这个头有时是必须的。

```python
headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
}
resp = requests.get(
    'https://www.example.com/api/data', headers=headers
)
```

最佳做法是用浏览器开发者工具（F12 Network 面板）抓包，看看目标网站的实际请求带了哪些头。每个网站的习惯不同，有的用 `X-Requested-With`，有的用自定义头如 `X-Request-Type`，有的检查 `Accept` 头是否包含 `application/json`。照着真实请求模拟就行，不要凭空猜。

## 2.4 HTTP 协议演进

### 2.4.1 每次 HTTP 协议升级分别解决什么问题

HTTP 协议从 1996 年的 HTTP/1.0 发展到现在的 HTTP/3，每一次升级都是为了解决前一代的性能瓶颈。理解这个演进过程，能帮你理解为什么有些爬虫请求慢、有些快，以及为什么同样的代码在不同网站上性能表现差异巨大。选择合适的 HTTP 客户端库，有时比优化代码逻辑更能提升爬虫效率。

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  HTTP/1.0   │ -> │   HTTP/1.1   │ -> │   HTTP/2     │ -> │   HTTP/3     │
│  1996年     │    │   1999年     │    │   2015年     │    │   2022年     │
├─────────────┤    ├──────────────┤    ├──────────────┤    ├──────────────┤
│ 短连接      │    │ 长连接       │    │ 多路复用     │    │ 基于QUIC     │
│ 每请求新建  │    │ Keep-Alive   │    │ 单连接多请求 │    │ UDP传输      │
│ TCP连接     │    │ 管线化       │    │ 头部压缩     │    │ 无队头阻塞   │
│ 无Host头    │    │ Host头       │    │ 服务端推送   │    │ 连接迁移     │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

### 2.4.2 HTTP/1.0 到 HTTP/1.1 的关键改进

HTTP/1.0 的最大问题是短连接：每次请求都要新建 TCP 连接，请求完成后关闭。一次完整的 HTTPS 请求需要经历 DNS 查询、TCP 三次握手、TLS 握手、HTTP 请求响应、TCP 四次挥手。对于 HTTPS 来说，TLS 握手的开销甚至比 TCP 握手还大，可能需要 1 到 2 个 RTT。如果你要请求同一个网站的 20 个页面，HTTP/1.0 要做 20 次 TCP 加 TLS 握手，大部分时间都浪费在握手上了，实际传输数据的时间占比可能不到 30%。

HTTP/1.1 做了三个关键改进：

**长连接（Persistent Connection）：** 默认开启 `Connection: keep-alive`，一个 TCP 连接可以发送多个请求和响应，不需要每次都重建连接。这大幅减少了握手开销。爬虫中使用 `requests.Session()` 就是利用了这个特性，Session 对象会自动复用 TCP 连接。如果不用 Session，每个 `requests.get()` 都会新建连接，性能差距很大。

**Host 头：** HTTP/1.0 不支持虚拟主机，一个 IP 地址只能对应一个域名。HTTP/1.1 引入 Host 头，使得一个 IP 上可以托管多个域名（虚拟主机）。这对爬虫很重要——你的请求头必须带 Host，否则某些服务器会返回 400 Bad Request。不过 requests 库会自动添加 Host 头，你通常不需要手动处理。

**管线化（Pipelining）：** 理论上允许客户端不等前一个响应就发送下一个请求。但由于存在队头阻塞问题（前一个响应慢了，后面的全部阻塞），主流浏览器都默认禁用管线化。实际上 HTTP/1.1 时代的并发请求还是靠多开 TCP 连接实现的，浏览器对同一域名限制 6 个并发连接就是这个时代的产物。

HTTP/1.1 还引入了范围请求（Range 请求），允许客户端只请求资源的某一部分。爬虫在下载大文件时可以利用这个特性实现断点续传——如果下载中断了，下次从断点处继续下载，不用重新下载整个文件。这在网络不稳定的环境下特别有用。实现方式是在请求头中添加 `Range: bytes=起始位置-` 字段，服务器返回 206 Partial Content 和对应范围的数据。

### 2.4.3 HTTP/2 多路复用对爬虫的影响

HTTP/2 是一次重大升级，核心特性是**多路复用**（Multiplexing）。在一个 TCP 连接上可以同时发送多个请求和响应，每个请求被拆分成带编号的帧传输，互不阻塞。这是 HTTP 协议的一次架构性变革。

```
HTTP/1.1 (需要6个TCP连接，每个串行)：
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│Req 1│ │Req 2│ │Req 3│ │Req 4│ │Req 5│ │Req 6│
└──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
   ▼       ▼       ▼       ▼       ▼       ▼
 Resp1   Resp2   Resp3   Resp4   Resp5   Resp6

HTTP/2 (1个TCP连接，多路复用)：
┌─────────────────────────────────────────────┐
│         单个 TCP 连接                        │
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐                  │
│  │R1││R2││R3││R4││R5││R6│  ← 帧交错传输   │
│  └─┬┘└─┬┘└─┬┘└─┬┘└─┬┘└─┬┘                  │
│    ▼   ▼   ▼   ▼   ▼   ▼                     │
│  Rsp1 Rsp2 Rsp3 Rsp4 Rsp5 Rsp6               │
└─────────────────────────────────────────────┘
```

HTTP/2 的其他重要特性还包括：**头部压缩**（HPACK 算法，压缩重复的请求头，减少带宽消耗），**服务端推送**（Server Push，服务器可以主动推送资源到客户端），**流优先级**（可以给重要请求更高优先级，让服务器优先处理）。

对爬虫的实际影响：

**连接数限制变松了。** HTTP/1.1 时代，浏览器对同一域名限制 6 个并发连接。爬虫也受此约束，想要更高并发就得开多个 TCP 连接，每个连接都要做 TLS 握手。HTTP/2 单连接就能处理几百个并发请求，减少了连接管理开销和内存占用。

**但要注意 TCP 层的队头阻塞。** HTTP/2 解决了 HTTP 层的队头阻塞，但 TCP 层的队头阻塞依然存在。如果某个 TCP 包丢了，这条连接上所有流都得等重传完成。HTTP/3 用 UDP 替代 TCP，每个流独立，才彻底解决了这个问题。

**实际工具选择：** Python 的 `httpx` 库原生支持 HTTP/2，requests 则不支持。对于支持 HTTP/2 的网站，用 httpx 可以获得更好的性能。但要注意，不是所有网站都支持 HTTP/2，httpx 会自动协商降级到 HTTP/1.1。

```python
import httpx
import asyncio

async def fetch_with_http2():
    async with httpx.AsyncClient(http2=True) as client:
        urls = [
            f'https://httpbin.org/get?id={i}'
            for i in range(5)
        ]
        tasks = [client.get(url) for url in urls]
        results = await asyncio.gather(*tasks)
        for r in results:
            print(f"状态码: {r.status_code}, "
                  f"HTTP版本: {r.http_version}")

asyncio.run(fetch_with_http2())
```

需要安装 httpx 的 HTTP/2 支持：

```bash
pip install "httpx[http2]"
```

> 工具选对了，事半功倍。requests 适合简单场景，httpx 适合需要 HTTP/2 和高并发的场景。

HTTP/3 是基于 QUIC 协议的，QUIC 运行在 UDP 之上而非 TCP。这个变化是革命性的——TCP 是可靠传输协议，任何丢包都会触发重传并阻塞整条连接上的所有数据流，这就是 TCP 层的队头阻塞。QUIC 为每个流提供独立的可靠性保证，一个流的丢包只会影响该流，不会阻塞其他流。此外 QUIC 还支持连接迁移——你从 WiFi 切换到 4G 时，TCP 连接会断开需要重建，而 QUIC 连接可以无缝迁移，因为连接标识符与 IP 地址解耦。对于移动端爬虫来说，这意味着更稳定的连接。

关于 HTTP/2 的完整规范，可以参考 [RFC 9113](https://datatracker.ietf.org/doc/html/rfc9113)。关于 HTTP/3 和 QUIC 协议，参考 [RFC 9114](https://datatracker.ietf.org/doc/html/rfc9114)。

## 2.5 HTTPS 证书认证

### 2.5.1 爬虫如何解决 HTTPS 证书认证

HTTPS 证书认证是双向的：服务器验证客户端的身份（通常跳过，除非是双向 TLS 认证，常见于银行和金融系统），客户端验证服务器的身份（默认必须验证）。对于爬虫来说，主要问题是客户端如何正确验证服务器证书。

正常情况下，Python 的 requests 库使用 `certifi` 包提供的 CA 证书库自动完成验证，你不需要做任何额外配置。`certifi` 是一个定期更新的 CA 证书集合，包含了几十个受信任的根 CA 证书。但实际工作中你会遇到各种证书相关的异常场景：证书过期、自签名证书、证书链不完整、域名不匹配等。这些问题如果不理解证书机制，排查起来会非常痛苦。

### 2.5.2 verify=False 的风险与替代方案

很多教程教你用 `verify=False` 来跳过证书验证，这是最常见也最危险的爬虫写法。我在代码审查中看到过无数次，甚至有些"资深"开发者也这么写。这个写法虽然能"解决"眼前的 SSL 错误，但它埋下了更大的隐患。

```python
# 危险写法：跳过证书验证
import requests
import urllib3
urllib3.disable_warnings()
resp = requests.get('https://example.com', verify=False)
```

**为什么不推荐 verify=False：**

第一，安全风险。关闭证书验证后，你完全无法验证服务器身份。中间人攻击可以随意截获、篡改你的数据，你的爬虫在公共 WiFi 或不安全网络中毫无防护。虽然爬虫的请求数据可能不含敏感信息，但如果你的 Cookie 或 Token 被截获，攻击者可以冒充你的身份。

第二，环境差异。你的代码在开发环境跑得好好的（因为 verify=False 掩盖了证书问题），上了生产环境可能因为证书配置不同而出错。或者反过来，生产环境有代理做 TLS 终结，开发环境直连，行为不一致。这种"在我电脑上能跑"的问题排查起来特别头疼。

第三，掩盖问题。`verify=False` 只是把问题藏起来，不解决根本原因。如果是证书过期了，你应该去更新证书或升级 certifi。如果是自签名证书，你应该把证书加入信任列表。用 verify=False 对付所有 SSL 错误，就像用 try-except 吞掉所有异常一样，是消极的防御性编程，迟早会出大问题。

**正确的替代方案：**

```python
import requests
import certifi

# 方案1：使用certifi的CA证书库（requests默认行为）
resp = requests.get('https://example.com',
                    verify=certifi.where())

# 方案2：指定自己的CA证书文件
resp = requests.get('https://example.com',
                    verify='/path/to/cacert.pem')

# 方案3：更新certifi解决证书过期问题
# pip install --upgrade certifi
```

有时候你的系统 CA 证书库太旧，导致新签发的证书验证失败。这种情况运行 `pip install --upgrade certifi` 就能解决。如果用的是系统 Python 而不是虚拟环境，可能还需要更新操作系统的 `ca-certificates` 包。

### 2.5.3 自签名证书处理

自签名证书是不通过 CA 机构签发、自己给自己签名的证书。常见于企业内网系统、开发测试环境、NAS 设备、IoT 设备等。这类证书不在系统信任的 CA 列表中，默认会被拒绝连接。在爬取企业内网数据或调试本地开发环境时，你一定会遇到这个问题。

处理自签名证书有两种方式：

**方式一：将自签名证书添加到信任列表（推荐）**

```python
import requests

# 把自签名CA证书文件路径传给verify参数
resp = requests.get(
    'https://internal-server.local',
    verify='/path/to/self-signed-ca.pem'
)
```

这种方式只对特定请求生效，不影响全局安全设置。你需要先获取自签名证书的 CA 证书文件（通常是 `.pem` 或 `.crt` 格式），可以通过浏览器导出或用 openssl 命令提取。

**方式二：使用 Session 级别配置**

```python
import requests

session = requests.Session()
session.verify = '/path/to/self-signed-ca.pem'
# 后续所有通过该session的请求都使用这个证书
resp = session.get('https://internal-server.local/api/data')
```

方式二适合需要多次请求同一个自签名证书服务器的场景，不用每次都传 verify 参数。

> verify=False 是技术债务。今天偷的懒，明天排查 SSL 错误时要加倍偿还。

来看一个完整的 HTTPS 证书问题排查函数。当你的爬虫报 SSL 错误时，用这个函数快速定位问题根因：

```python
import ssl
import socket
from urllib.parse import urlparse

def diagnose_ssl(url):
    parsed = urlparse(url)
    hostname = parsed.hostname
    port = parsed.port or 443
    context = ssl.create_default_context()
    try:
        sock = socket.create_connection(
            (hostname, port), timeout=10)
        with context.wrap_socket(
            sock, server_hostname=hostname
        ) as ssock:
            cert = ssock.getpeercert()
            print(f"主体: {cert['subject']}")
            print(f"签发者: {cert['issuer']}")
            print(f"有效期至: {cert['notAfter']}")
            print("验证通过")
    except ssl.SSLCertVerificationError as e:
        print(f"验证失败: {e.verify_message}")
    except ssl.SSLError as e:
        print(f"SSL错误: {e}")
    except Exception as e:
        print(f"其他: {e}")

diagnose_ssl('https://www.example.com')
```

这个函数在你遇到 SSL 错误时特别有用。常见的错误码包括：`certificate has expired`（证书过期）、`hostname doesn't match`（域名不匹配）、`unable to get local issuer certificate`（找不到签发者证书，通常是证书链不完整或 CA 不受信任）。根据不同的错误码采取不同的修复策略，而不是一刀切用 `verify=False`。关于 Python SSL 模块的更多用法，参考 [Python 官方文档](https://docs.python.org/3/library/ssl.html)。

在实际爬虫项目中，我建议把 HTTPS 证书处理封装成统一的工具函数。当遇到 SSL 错误时，先调用诊断函数获取详细的错误信息，再根据错误类型选择对应的修复策略。这样比直接 `verify=False` 要专业得多，而且能避免很多潜在的安全风险。有些企业级爬虫项目还会使用代理做 TLS 终结，代理服务器负责与目标网站建立 HTTPS 连接，爬虫与代理之间可以是 HTTP 或自签名 HTTPS。这种架构下，证书验证的行为取决于代理的配置，需要特别注意安全边界。如果代理服务器的证书不受信任，你需要在爬虫端配置代理的 CA 证书，而不是关闭整个验证流程。

还有一个容易被忽略的问题：当你的爬虫代码部署到不同环境（开发机、测试服务器、生产服务器）时，CA 证书库可能不一致。有些精简的 Docker 镜像甚至不包含完整的 CA 证书库，这会导致所有 HTTPS 请求都失败。解决方法是使用 `certifi` 包提供的证书库，或者在 Dockerfile 中安装 `ca-certificates` 包。

这里需要特别提醒一个很多人忽略的细节：当你使用 Session 复用 TCP 连接时，如果某个请求触发了重定向到另一个域名，Session 会自动处理 Cookie 的域名隔离。但如果你手动构造请求头中的 Cookie 字段，就需要自己处理跨域问题。另外，有些网站会在 Set-Cookie 响应头中设置 HttpOnly 和 Secure 属性。HttpOnly 意味着这个 Cookie 只能通过 HTTP 请求传输，不能通过 JavaScript 访问，这是为了防止 XSS 攻击窃取 Cookie。Secure 表示这个 Cookie 只能通过 HTTPS 连接发送。在爬虫中，你不需要关心这些属性，因为你是直接在 HTTP 层面操作 Cookie 的。

还有一个实战经验：有些网站会在 Cookie 中嵌入指纹信息，比如用你的 IP 地址和时间戳生成一个签名。如果你直接复制浏览器的 Cookie 到爬虫中使用，可能很快就会失效，因为 IP 变了或者时间过了。这种情况下，你需要分析 Cookie 的生成逻辑，在爬虫中动态生成 Cookie 而不是复制粘贴。

## 实战总结：HTTP 知识图谱

把本章的核心知识点整理成一个知识图谱，方便收藏查阅：

```
HTTP 网络基础知识
│
├── HTTPS 安全机制
│   ├── 混合加密：非对称加密协商密钥+对称加密传输数据
│   ├── TLS 握手四阶段：协商参数→验证证书→交换密钥→加密通信
│   ├── 证书链：Root CA → Intermediate CA → 网站证书
│   └── TLS 指纹：JA3 指纹可识别非浏览器客户端
│
├── 状态码体系
│   ├── 2xx 成功：200 OK / 206 部分内容
│   ├── 3xx 重定向：301 永久 / 302 临时 / 304 缓存
│   ├── 4xx 客户端错误：403 被拦截 / 429 被限流
│   └── 5xx 服务端错误：500/502/503/504 需重试
│
├── 请求头反爬
│   ├── User-Agent：需与 Sec-Ch-Ua 系列头配套使用
│   ├── Referer：模拟页面跳转来源
│   ├── Accept-Language/Encoding：保持与UA一致性
│   └── X-Requested-With：AJAX 请求标识
│
├── 协议演进
│   ├── HTTP/1.0：短连接，每次新建TCP连接
│   ├── HTTP/1.1：长连接，Keep-Alive，Host头
│   ├── HTTP/2：多路复用，头部压缩，服务端推送
│   └── HTTP/3：基于QUIC(UDP)，无队头阻塞
│
└── 证书认证
    ├── verify=False：不推荐，有安全风险
    ├── 指定CA证书：推荐方案，精确控制信任范围
    └── 自签名证书：传证书文件路径给verify参数
```

## 收藏清单：爬虫 HTTP 必备速查表

| 场景 | 状态码/特征 | 应对策略 |
|------|-------------|----------|
| 登录态失效 | 302 重定向到登录页 | 检测 resp.url，更新 Cookie |
| 被反爬拦截 | 403 Forbidden | 检查 UA/Referer/请求头完整性 |
| 频率限制 | 429 Too Many Requests | 读 Retry-After 头，指数退避重试 |
| SSL 证书过期 | SSLError | 升级 certifi 包 |
| 自签名证书 | SSLCertVerificationError | 传证书路径给 verify 参数 |
| 接口需 AJAX 标识 | 403 或重定向 | 添加 X-Requested-With 头 |
| HTTP/2 站点 | 并发性能差 | 换用 httpx 库，开启 http2=True |
| 页面不存在 | 404 Not Found | 更新 URL，检查网站是否改版 |
| 服务器过载 | 503 Service Unavailable | 延迟重试，降低并发 |
| 大文件下载 | 206 Partial Content | 使用 Range 头实现断点续传 |
| Cookie 失效 | 401 Unauthorized | 重新登录获取新 Cookie |
| 请求参数错误 | 400 Bad Request | 检查 URL 编码和参数格式 |

## 写在最后

这一章我们从 HTTPS 底层机制讲到 HTTP 协议演进，从请求头伪装讲到证书认证处理。这些知识看起来"基础"，但恰恰是大多数爬虫工程师的短板。我自己刚入行时也觉得这些不重要，觉得"能跑就行"，直到有一次排查一个诡异的 403 问题，花了三天才发现是 Accept-Encoding 头少了 `br` 导致的。从那以后我明白了，爬虫的天花板不在于你会用多少框架，而在于你对底层协议的理解有多深。

> 基础不牢，地动山摇。爬虫的天花板，往往不在框架和工具，而在你对协议理解的深度。

如果你觉得这篇文章有帮助，**收藏起来**，写爬虫遇到问题时常回来翻翻速查表。**评论区说说你遇到过最坑的 HTTP 反爬是什么？** 我会把典型案例整理到后续章节中，让更多人受益。

**怕浪猫**说：网络协议是爬虫的底层操作系统。你不需要成为协议专家，但每个知识点都值得了解一遍。因为某一天，救你命的可能就是某个你曾经忽略的请求头。

这是「Python 高级爬虫实战」系列的第二篇。**关注我，追更不迷路。**

系列进度 2/11

预告：第3章将手把手教你搭建代理服务，从 Squid 自建代理到代理池架构设计，解决 IP 封禁问题。