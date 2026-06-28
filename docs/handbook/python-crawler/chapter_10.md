# 第10章 课程终极测验

学到这里，你已经走过了 HTTP 基础、代理服务、JS 逆向、Cookie 管理、浏览器调度、数据加密、分布式爬虫、大数据存储这一整条技术链路。但知道每个知识点和能在实战中灵活运用是两回事。很多工程师能单独讲清楚代理 IP 的原理，但遇到"代理池 + Cookie 池 + JS 加密"三层反爬组合时却无从下手。问题不在于知识点没记住，而在于知识点之间没有连成网。

我是怕浪猫，一个在爬虫工程领域摸爬多年的老兵。这一章不做新知识讲授，而是以测验题加详细解析的形式，把前面九章的核心知识点全部拉出来做一次体系化复盘。每道题我会给出答案和背后的原理解释，不是让你背答案，而是让你理解每个技术点的"为什么"和"在什么场景下用"。

这篇文章覆盖八大模块、数十道测验题，相当于全课程的知识体系地图。建议先收藏，后面遇到具体技术问题时可以快速定位到对应模块复习。

> 知识点记住多少不重要，重要的是知道在什么场景下用哪个知识点。体系化认知才是工程师的核心竞争力。

## 10.1 HTTP 基础测验

HTTP 协议是爬虫的地基。你发出的每一个请求都遵循 HTTP 规范，目标网站的每一个响应都带着 HTTP 状态码和响应头。如果对这些基础概念理解不到位，后续的伪装、代理、加密都无从谈起。

### 10.1.1 HTTP 协议主流版本与状态码

**测验题：HTTP 协议的主流版本有哪些？200、302、404、500 状态码分别代表什么含义？**

HTTP 协议目前主流的版本有三个：HTTP/1.0、HTTP/1.1 和 HTTP/2。HTTP/1.0 是最早的版本，每个 TCP 连接只能发送一个请求，目前已经基本淘汰。HTTP/1.1 在此基础上加入了持久连接（Keep-Alive）、管道化请求（Pipeline）和分块传输编码（Chunked Transfer Encoding），绝大多数网站目前仍在使用这个版本。HTTP/2 是 2015 年正式发布的升级版，引入了多路复用（Multiplexing）、头部压缩（HPACK 算法）和服务端推送（Server Push）三大核心特性，在高延迟和高并发场景下性能提升显著。HTTP/3 则基于 QUIC 协议，目前还在逐步推广中。

从爬虫工程师的角度看，HTTP 版本的选择会影响你使用的工具。Python 的 requests 库仅支持 HTTP/1.1，不支持 HTTP/2。如果目标网站启用了 HTTP/2，你需要使用 httpx 库配合 httpcore 后端，或者直接使用 Chrome DevTools Protocol（CDP）通过浏览器发请求。实际项目中大多数目标网站仍然是 HTTP/1.1，所以 requests 库在大多数场景下足够用了。


从爬虫角度看，你用 requests 库发出的请求默认是 HTTP/1.1。如果目标网站启用了 HTTP/2，requests 库不支持 HTTP/2，你需要用 httpx 库：

```python
import httpx

# httpx 支持 HTTP/2
client = httpx.Client(http2=True)
response = client.get('https://http2.example.com/data')
print(response.status_code)
print(response.http_version)  # 输出 HTTP/2
```

状态码是服务端对请求结果的标准化表达。搞清楚状态码的含义，是排查爬虫问题的第一步。

| 状态码 | 含义 | 爬虫场景 |
|--------|------|----------|
| 200 | 请求成功 | 正常获取数据 |
| 301 | 永久重定向 | 域名迁移，需更新 URL |
| 302 | 临时重定向 | 登录跳转、反爬重定向 |
| 304 | 资源未修改 | 协商缓存命中 |
| 403 | 禁止访问 | 反爬拦截，需伪装 |
| 404 | 资源不存在 | URL 失效或被删除 |
| 429 | 请求过多 | 频率限制，需降速 |
| 500 | 服务器内部错误 | 服务端异常 |
| 503 | 服务不可用 | 维护中或过载 |

实战中最需要关注的是 302、403 和 429。302 往往意味着你的请求被重定向到了验证页面或登录页面；403 说明你的请求被识别为爬虫；429 则是频率限制的信号。

> 状态码是服务端和你对话的语言。看不懂状态码，就等于听不懂对方在说什么。

### 10.1.2 请求头与 HTTPS 安全原理

**测验题：UA 和 Referer 请求头的含义是什么？HTTPS 的安全原理是什么？**

User-Agent（UA）是请求头中标识客户端类型的字段。服务端通过 UA 来判断请求来源是浏览器、手机还是爬虫。requests 库默认的 UA 是 `python-requests/2.x.x`，这等于直接告诉对方"我是爬虫"。所以在写爬虫时，更换 UA 是最基础也是最重要的伪装手段。

Referer 是请求头中标识请求来源页面 URL 的字段。服务端通过 Referer 来判断用户是从哪个页面跳转过来的。很多网站会校验 Referer，如果请求没有 Referer 或 Referer 不是本站域名，就会拒绝访问。Referer 的设置要符合正常用户的浏览逻辑，比如从列表页点击进入详情页时，Referer 应该是列表页的 URL，而不是直接写详情页的 URL。

除了 UA 和 Referer，还有一些请求头也是爬虫中经常需要处理的。Accept-Language 表示客户端可接受的语言类型，配合 UA 使用可以让你的请求看起来更像真实浏览器。Accept-Encoding 表示可接受的编码类型，通常设置为 gzip、deflate、br。Connection 控制是否保持连接，常用值是 keep-alive。DNT（Do Not Track）是用户隐私设置，虽然服务端一般不强制校验，但带上 `DNT: 1` 会让请求看起来更正常。


```python
import requests

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) '
                  'Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.example.com/list?page=1'
}
response = requests.get(
    'https://www.example.com/api/data',
    headers=headers
)
```

HTTPS 的安全原理是爬虫工程师必须理解的核心知识。HTTPS 并非一个新的协议，而是 HTTP over TLS/SSL，即在 HTTP 和 TCP 之间加了一层加密。其安全机制包含两个核心部分：加密和身份验证。

加密过程的核心是 TLS 握手。TLS 握手的核心原理可以用以下流程概括：

```
客户端                              服务端
  |                                   |
  |------ ClientHello --------------->|
  |  (支持的加密套件、随机数A)          |
  |                                   |
  |<----- ServerHello ----------------|
  |  (选定加密套件、随机数B、证书)       |
  |                                   |
  |  验证证书合法性                    |
  |  生成预主密钥(用服务端公钥加密)      |
  |------ Encrypted Premaster ------->|
  |                                   |
  |  双方用随机数A+B+预主密钥           |
  |  生成会话密钥                      |
  |                                   |
  |<==== 加密通信开始 ================>|
```

握手完成后，双方使用对称加密进行数据传输。非对称加密（RSA/ECDHE）只在握手阶段使用，因为它计算开销大。会话密钥是对称密钥，加密解密速度快，适合大量数据传输。

身份验证通过数字证书实现。服务端的证书由 CA（证书颁发机构）签发，证书中包含服务端的公钥和 CA 的数字签名。客户端（浏览器或爬虫）会验证证书的签名链，确保证书没有被篡改。如果证书验证失败，浏览器会弹出安全警告，而 requests 库默认会抛出 `SSLError` 异常。

在爬虫中，如果目标网站使用了自签名证书，你可以用 `verify=False` 跳过证书验证，但这会降低安全性。更推荐的做法是把自签名证书加入信任链。

> HTTPS 不是不可破解的墙，而是增加破解成本的门槛。爬虫不需要破解加密，只需要让目标网站相信你是正常的浏览器客户端。

实战中还有一个常见问题：目标网站启用了证书固定（Certificate Pinning），只接受特定的证书或 CA 签发的证书。这种情况下，即使你用 `verify=False` 跳过证书验证，仍然可能被目标网站拒绝连接（连接直接被重置）。常见的证书固定场景在移动端 APP 的 HTTPS 流量中，APP 使用了网络安全配置只信任特定证书，Charles/Fiddler 抓包时需要安装对应证书才能解密。爬虫中遇到这种情况，通常的解法是降级到 HTTP（如果目标支持）、使用 mitmproxy 配合自签名证书中间人、或者直接用浏览器自动化工具绕过证书验证。

## 10.2 代理服务测验

代理 IP 是爬虫工程师最常用的反反爬手段。但当你的爬虫规模扩大到需要管理成百上千个代理 IP 时，问题就从"怎么用代理"变成了"怎么管理代理"。

### 10.2.1 代理 IP 类型与请求转发软件

**测验题：代理 IP 有哪些类型？常见的请求转发软件有哪些？**

代理 IP 按匿名程度分为三类：透明代理、普通匿名代理和高匿代理。

| 代理类型 | Remote_Addr | HTTP_VIA | HTTP_X_FORWARDED_FOR | 服务端可见性 |
|---------|-------------|----------|---------------------|-------------|
| 透明代理 | 代理 IP | 有 | 真实 IP | 能看到真实 IP |
| 普通匿名 | 代理 IP | 有 | 无 | 知道在用代理 |
| 高匿代理 | 代理 IP | 无 | 无 | 无法识别代理 |

爬虫必须用高匿代理。透明代理和普通匿名代理会在请求头中暴露你的真实 IP，目标网站只需要检查 `X-Forwarded-For` 头就能识别你的真实身份。

代理 IP 按协议类型分为 HTTP 代理、HTTPS 代理和 SOCKS5 代理。HTTP 代理只能代理 HTTP 请求，HTTPS 代理通过 CONNECT 方法建立隧道来代理 HTTPS 请求，SOCKS5 代理则可以代理任意 TCP 流量。

```python
import requests

# HTTP/HTTPS 代理
proxies = {
    'http': 'http://1.2.3.4:8080',
    'https': 'http://1.2.3.4:8080'
}
response = requests.get(
    'https://www.example.com/data',
    proxies=proxies,
    timeout=10
)

# SOCKS5 代理（需要 pip install requests[socks]）
socks_proxies = {
    'http': 'socks5://1.2.3.4:1080',
    'https': 'socks5://1.2.3.4:1080'
}
response = requests.get(
    'https://www.example.com/data',
    proxies=socks_proxies,
    timeout=10
)
```

请求转发软件方面，Squid 是最经典的代理服务器软件，支持正向代理和反向代理，配置灵活，性能稳定。TinyProxy 是轻量级代理软件，适合个人使用。3proxy 支持多平台，配置简单。Varnish 主要做反向代理和缓存加速，但在某些场景下也可以用作正向代理。

Squid 的核心配置示例：

```
# /etc/squid/squid.conf 核心配置
http_port 3128
acl allowed_network src 192.168.0.0/16
http_access allow allowed_network
http_access deny all
forwarded_for off  # 关闭 X-Forwarded-For，提升匿名性
```

> 代理不是万能的，但没有代理是万万不能的。关键不在于用不用代理，而在于用对代理类型。

在代理的实际使用中，还有一个常见坑：代理供应商提供的代理并不都是高匿代理。很多低价代理池里混有透明代理或普通匿名代理，你以为在用高匿代理，实际上目标网站可以轻松识别你的真实 IP。验证代理匿名性的方法是访问 `http://httpbin.org/ip`，这个接口会返回请求的来源 IP。如果返回的是代理 IP，且没有 `Via` 或 `X-Forwarded-For` 头，说明是高匿代理。如果返回的是代理 IP 但有 `X-Forwarded-For` 显示真实 IP，说明是普通匿名代理。如果直接返回你的真实 IP，说明是透明代理。

### 10.2.2 短效 vs 长效代理选择

**测验题：短效代理和长效代理各自的适用场景是什么？**

短效代理的存活时间通常在 1 到 30 分钟之间，IP 池大、单价低、适合高频轮换。长效代理的存活时间在数小时到数天之间，IP 稳定、适合需要维持会话状态的场景。

两种代理的选择本质上是在"反爬规避"和"业务需求"之间做权衡。

短效代理适用于以下场景：高频数据采集（每秒数十个请求）、不需要登录态的公开数据抓取、大规模分布式爬虫中的请求分发。这类场景下 IP 频繁更换是优势，因为目标网站来不及封禁。

长效代理适用于以下场景：需要登录态的接口采集（同一个 IP 维持 Cookie 会话）、WebSocket 长连接数据采集、需要 IP 白名单认证的接口调用。这类场景下 IP 频繁更换会导致会话失效。

在实际项目中，怕浪猫通常会混合使用两种代理。核心策略是：列表页等高频请求用短效代理，详情页和需要登录态的接口用长效代理。这样可以兼顾成本和业务连续性。

代理池管理的核心逻辑是健康检查和过期淘汰。一个基本的代理池架构如下：

```python
import time
import threading
import requests

class ProxyPool:
    def __init__(self):
        self.proxies = []  # [{'ip': '1.2.3.4:8080', 'expire': ts}]
        self.lock = threading.Lock()

    def add_proxy(self, ip, ttl=300):
        with self.lock:
            self.proxies.append({
                'ip': ip, 'expire': time.time() + ttl
            })

    def get_proxy(self):
        with self.lock:
            now = time.time()
            # 清理过期代理
            self.proxies = [
                p for p in self.proxies if p['expire'] > now
            ]
            if not self.proxies:
                return None
            # 随机选一个
            import random
            return random.choice(self.proxies)['ip']

    def remove_proxy(self, ip):
        with self.lock:
            self.proxies = [
                p for p in self.proxies if p['ip'] != ip
            ]
```

这段代码实现了代理池的核心逻辑：添加代理、获取代理、清理过期代理、移除失效代理。在实际生产环境中，还需要加上健康检查线程（定期请求测试 URL 验证代理可用性）和动态补充逻辑（当可用代理低于阈值时自动从代理供应商拉取新 IP）。

> 代理池不是一个池子，而是一个有进有出的生态系统。只进不出的池子会变成死水，只出不进的池子会干涸。

关于代理的成本控制，怕浪猫有一个实用的经验：不要追求 100% 的代理可用率。在实际生产中，代理池的可用率能维持在 85% 以上就已经足够好了。与其花大价钱买高端代理，不如设计好代理的动态淘汰机制，让爬虫在代理失效时自动切换，同时用更低的成本维持稳定的采集速度。很多新入行的工程师会花大量时间在"找一个完美的代理"上，但真正重要的工程能力是让你的爬虫在代理不稳定的情况下依然能稳定运行。

## 10.3 JS 逆向测验

JS 逆向是爬虫工程师的进阶能力。很多网站的接口参数经过前端 JS 加密处理，如果你不能还原加密逻辑，就无法构造有效的请求。

### 10.3.1 无限 Debugger 与断点调试

**测验题：无限 Debugger 产生的原因是什么？JS 断点应该添加在什么位置？**

无限 Debugger 是前端反调试技术的典型手段。其原理是在 JS 代码中插入 `debugger` 语句或定时器触发的 `debugger`，当代码执行到 `debugger` 时，如果浏览器开发者工具处于打开状态，执行就会暂停。攻击者通过不断触发 `debugger`，让调试者无法在开发者工具中正常分析代码。

无限 Debugger 的常见实现方式有三种。

第一种是直接在代码中写 `debugger` 语句，配合循环或定时器：

```javascript
// 简单的无限 debugger
setInterval(function() {
    debugger;
}, 100);

// 条件 debugger
function check() {
    debugger;
    setTimeout(check, 100);
}
check();
```

第二种是通过 `Function` 构造器动态生成 `debugger` 语句，使得在源码中搜索不到关键字：

```javascript
// 动态生成 debugger
setInterval(function() {
    (function(){}).constructor('debugger')();
}, 100);
```

第三种是通过 `eval` 执行包含 `debugger` 的字符串：

```javascript
setInterval(function() {
    eval('debugger');
}, 100);
```

绕过无限 Debugger 的方法有多种。最简单的是在 Chrome DevTools 的 Sources 面板中，右键点击行号选择"Never pause here"，让调试器在该行不再暂停。更彻底的方法是用 Chrome 的 "Override content" 功能替换 JS 文件，把 `debugger` 语句删掉。

JS 断点应该添加在什么位置？这取决于你的逆向目标。

如果目标是找到加密函数的入口，断点应该添加在 Ajax 请求发送前。具体方法是在 Network 面板中找到目标请求，右键选择"Initiator"查看调用栈，在调用栈中找到加密函数的调用位置添加断点。

如果目标是分析加密函数的内部逻辑，断点应该添加在函数内部的关键步骤。比如 AES 加密中，断点应该添加在密钥生成、明文转换、加密执行这三步的衔接处。

如果目标是跟踪参数的传递过程，断点应该添加在参数赋值的位置。可以通过搜索参数名（比如 `sign`、`token`、`encrypt`）来定位赋值代码。

> 逆向不是蛮力破解，而是顺着数据流找到源头。断点就是你在数据流上设置的观察哨。

补充一个实战技巧：当你遇到经过 webpack 或 rollup 打包混淆后的代码时，代码中的变量名和函数名都是随机生成的 A、B、C 这类单字母或无意义字符串，阅读难度极大。这时候可以用 Source Map 来还原源码。Source Map 是打包工具生成的映射文件，记录了混淆后代码和原始代码之间的对应关系。如果目标网站的 JS 文件目录下有 `.map` 文件，浏览器开发者工具可以自动加载，你就能看到可读性极高的原始代码。不过很多生产环境会禁用 Source Map，这时候就只能靠代码分析和经验了。

### 10.3.2 Python 调度 JS 代码与重构选择

**测验题：可以用哪些 Python 库来调度执行 JS 代码？Python 重构和调度 JS 各自适用于什么场景？**

Python 调度执行 JS 代码的常用库有三个：PyExecJS、Node.js 子进程调用、以及 Playwright/Puppeteer 的 `evaluate` 方法。

PyExecJS 是最简单的方案，它通过调用系统已安装的 JS 运行时（如 Node.js）来执行 JS 代码：

```python
import execjs

# 执行简单的 JS 表达式
ctx = execjs.compile("""
    function encrypt(text) {
        var CryptoJS = require('crypto-js');
        return CryptoJS.MD5(text).toString();
    }
""")
result = ctx.call('encrypt', 'hello world')
print(result)  # 输出 MD5 哈希值
```

PyExecJS 的优点是简单直接，缺点是每次调用都会启动一个新的 JS 运行时进程，性能较差，且不支持 JS 运行时的状态保持。

Node.js 子进程调用是性能更好的方案。通过 `subprocess` 模块调用 Node.js，把 JS 代码写入文件，通过命令行参数传递输入数据：

```python
import subprocess
import json

def call_js_encrypt(text):
    result = subprocess.run(
        ['node', 'encrypt.js', text],
        capture_output=True, text=True, timeout=10
    )
    return json.loads(result.stdout)

encrypted = call_js_encrypt('hello world')
```

Playwright 的 `evaluate` 方法适合需要在浏览器环境中执行 JS 的场景，比如需要访问 `window` 对象或 DOM：

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://www.example.com')
    # 在页面上下文中执行 JS
    result = page.evaluate("""
        () => {
            return window.encrypt(document.getElementById('data').value);
        }
    """)
    browser.close()
```

Python 重构 vs 调度 JS 的选择，怕浪猫总结了以下判断原则。

| 对比维度 | Python 重构 | 调度 JS |
|---------|------------|---------|
| 执行性能 | 高（原生 Python 执行） | 低（跨语言调用开销） |
| 开发成本 | 高（需理解算法并翻译） | 低（直接复用 JS 代码） |
| 维护成本 | 中（算法变更需重写） | 低（替换 JS 文件即可） |
| 环境依赖 | 仅需 Python | 需要 Node.js 或浏览器 |
| 适用场景 | 算法简单稳定 | 算法复杂或频繁变更 |

实战中的选择标准：如果加密算法是标准的 MD5、AES、RSA 等公开算法，用 Python 重构（直接调用 `hashlib` 或 `pycryptodome`）。如果加密算法是自研的混淆算法，且 JS 代码量超过 500 行，直接调度 JS。如果算法变更频繁（比如每次发版都换加密逻辑），调度 JS 更容易维护。

> 重构是理解后的复刻，调度是拿来主义的运用。两者没有优劣，只有场景是否匹配。

在实际逆向工作中，怕浪猫发现一个规律：大多数国内网站的加密方案都可以归为几类套路。第一类是经典的 MD5 + 时间戳签名，这是最容易破解的，加密参数通常叫 sign、token、t、_t 之类的名字。第二类是 AES/DES 对称加密配合固定密钥或服务端返回的密钥，这类需要找到密钥的来源。第三类是 RSA 配合公钥加密，通常在登录场景中出现，需要找到页面中嵌入的公钥字符串。第四类是自定义的变种加密，混淆程度最高，需要深入分析算法逻辑或直接调度 JS。理解这些套路可以让你在面对新目标时快速定位加密逻辑，少走弯路。

### 10.3.3 加解密算法与 ReRes 插件

**测验题：常见的加解密算法有哪些？ReRes 插件的工作原理是什么？**

爬虫逆向中常见的加解密算法可以分为三类。

对称加密：AES、DES、3DES。加密和解密使用同一个密钥。AES 是目前最常用的对称加密算法，支持 128/192/256 位密钥。在网页中常见 AES-ECB 和 AES-CBC 模式。ECB 模式不需要初始向量（IV），但相同明文会加密成相同密文，安全性较低。CBC 模式需要 IV，相同明文加密后密文不同，安全性更高。

非对称加密：RSA、ECC。加密和解密使用不同的密钥（公钥和私钥）。在网页中通常用于加密少量关键数据（如密码），或用于交换对称加密的会话密钥。

摘要算法：MD5、SHA-1、SHA-256。这类算法不可逆，通常用于生成签名。在爬虫中常见的场景是对请求参数排序后拼接，再做 MD5 签名。

```python
# AES-CBC 加密示例（Python 重构）
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
import base64

def aes_encrypt(plaintext, key, iv):
    cipher = AES.new(key.encode(), AES.MODE_CBC, iv.encode())
    encrypted = cipher.encrypt(pad(plaintext.encode(), 16))
    return base64.b64encode(encrypted).decode()

# MD5 签名示例
import hashlib

def generate_sign(params: dict, secret: str) -> str:
    # 参数按 key 排序拼接
    sorted_str = '&'.join(
        f'{k}={v}' for k, v in sorted(params.items())
    )
    raw = sorted_str + '&key=' + secret
    return hashlib.md5(raw.encode()).hexdigest().upper()
```

ReRes 插件是 Chrome 浏览器的一个开发者工具扩展，它的核心功能是拦截浏览器请求并根据规则把请求重定向到本地文件。工作原理如下：

1. 浏览器发起 HTTP 请求
2. ReRes 拦截请求，检查 URL 是否匹配规则
3. 如果匹配，ReRes 用本地文件的内容作为响应返回
4. 如果不匹配，请求正常发送到服务端

在 JS 逆向中，ReRes 的典型用法是替换目标网站的 JS 文件。假设目标网站的加密逻辑在 `app.js` 中，你可以把 `app.js` 下载到本地，格式化后添加 `console.log` 语句输出中间变量，然后配置 ReRes 规则把 `https://www.example.com/js/app.js` 指向本地的 `app.js` 文件。这样浏览器加载的就是你修改过的版本，中间变量的值会直接输出到控制台。

> ReRes 的本质是"偷梁换柱"。它不改变服务端的任何东西，只是让浏览器加载你修改过的版本。这是调试混淆 JS 的利器。

使用 ReRes 时有一个注意事项：如果目标网站启用了 CSP（Content Security Policy）内容安全策略，它会限制页面加载的外部资源，包括你通过 ReRes 映射的本地文件。如果直接用 file:// 协议映射本地文件，浏览器会因为 CSP 策略拒绝加载。这时候需要用一个本地 HTTP 服务器来托管修改后的 JS 文件，比如 `python -m http.server 8080`，然后配置 ReRes 把目标 URL 映射到 `http://localhost:8080/app.js`。这样既能绕过 CSP 限制，又能用你修改过的 JS 文件替换原始文件。

## 10.4 Cookie 管理测验

Cookie 管理是爬虫从"能抓数据"到"能稳定抓数据"的关键分水岭。很多网站的登录态、频率限制、风控标记都依赖 Cookie，理解 Cookie 的生命周期和管理策略至关重要。

### 10.4.1 Cookie 与 Session 的异同及 Cookie 池

**测验题：Cookie 和 Session 有什么异同？Cookie 池适用于什么场景？**

Cookie 和 Session 都是用来维持 HTTP 状态的机制，但它们的存储位置和工作原理不同。

| 对比维度 | Cookie | Session |
|---------|--------|---------|
| 存储位置 | 客户端（浏览器） | 服务端 |
| 数据大小 | 限制 4KB 左右 | 无特殊限制 |
| 安全性 | 较低（可被篡改） | 较高（客户端只持有 Session ID） |
| 生命周期 | 由 expires/max-age 决定 | 由服务端配置决定 |
| 传输方式 | 每次请求自动携带 | 通过 Cookie 中的 Session ID 关联 |

在实际工作中，Cookie 和 Session 是配合使用的。服务端创建 Session 后，把 Session ID 通过 Set-Cookie 响应头写入客户端的 Cookie。后续请求中客户端自动携带 Cookie，服务端通过 Cookie 中的 Session ID 找到对应的 Session 数据。

Cookie 池适用于以下场景：

第一，多账号轮换。当目标网站对单个账号有请求频率限制时，准备多个账号的 Cookie，轮流使用可以提升总采集速度。

第二，登录态维护。某些网站的登录态有效期较短（如 30 分钟），需要准备多个登录态 Cookie 进行轮换，同时后台持续刷新即将过期的 Cookie。

第三，风控规避。目标网站可能对单个 Cookie 的行为进行风控分析，多 Cookie 轮换可以分散风险。

Cookie 池的基本管理逻辑：

```python
import time
import random
import threading

class CookiePool:
    def __init__(self):
        self.cookies = {}  # {cookie_str: {'expire': ts, 'in_use': False}}
        self.lock = threading.Lock()

    def add_cookie(self, cookie_str, ttl=3600):
        with self.lock:
            self.cookies[cookie_str] = {
                'expire': time.time() + ttl,
                'in_use': False,
                'fail_count': 0
            }

    def get_cookie(self):
        with self.lock:
            now = time.time()
            available = [
                k for k, v in self.cookies.items()
                if v['expire'] > now
                and not v['in_use']
                and v['fail_count'] < 3
            ]
            if not available:
                return None
            selected = random.choice(available)
            self.cookies[selected]['in_use'] = True
            return selected

    def release_cookie(self, cookie_str, success=True):
        with self.lock:
            if cookie_str in self.cookies:
                self.cookies[cookie_str]['in_use'] = False
                if not success:
                    self.cookies[cookie_str]['fail_count'] += 1
```

这段代码实现了 Cookie 池的核心逻辑：添加 Cookie、获取 Cookie（标记为使用中）、释放 Cookie（标记为可用，并记录失败次数）。失败次数超过 3 次的 Cookie 会被淘汰，避免影响采集效率。

> Cookie 池不是简单的列表，而是一个需要生命周期管理的微型系统。好的管理策略能让你的爬虫稳定性提升一个量级。

这里特别说明一下 SameSite 属性。这个属性是 CSRF（跨站请求伪造）防护的重要手段，但它对爬虫的影响很多人没有意识到。如果目标网站的 Cookie 设置了 `SameSite=Strict`，那么从其他域名发起的请求不会携带这个 Cookie。这意味着你的爬虫在请求目标网站时，如果 Referer 不是目标网站的域名，Cookie 就不会被发送出去。很多工程师在排查"Cookie 明明设置了但请求不生效"的问题时，发现根本原因就是 SameSite 限制。所以当你在开发爬虫时，如果遇到了 Cookie 明明存在但始终不生效的情况，检查一下 SameSite 属性是一个值得尝试的方向。

### 10.4.2 Cookie 属性与池管理方案

**测验题：Cookie 有哪些属性？Cookie 池的管理和维护方案是什么？**

Cookie 的属性包括以下几项。

`name` 和 `value`：Cookie 的键值对，这是实际携带的数据。`domain`：Cookie 的作用域名，只有匹配的域名才会携带。`path`：Cookie 的作用路径，只有匹配的路径才会携带。`expires`/`max-age`：Cookie 的过期时间，`expires` 是绝对时间点，`max-age` 是相对秒数。`secure`：标记 Cookie 只在 HTTPS 下传输。`HttpOnly`：标记 Cookie 不能通过 JS 访问，防止 XSS 攻击。`SameSite`：控制跨站请求是否携带 Cookie，可选值为 `Strict`、`Lax`、`None`。

```python
# 从浏览器复制 Cookie 字符串时，注意各属性的对应关系
# 原始格式：
# name=value; Domain=.example.com; Path=/; Expires=Wed, 28 Jun 2026 12:00:00 GMT; Secure; HttpOnly; SameSite=Lax

# 在 requests 中使用时，通常只需要 name=value 部分
import requests

session = requests.Session()
session.headers['Cookie'] = 'sessionid=abc123; csrftoken=xyz789'
response = session.get('https://www.example.com/user/profile')
```

Cookie 池的完整管理和维护方案包含以下五个模块。

**入库模块**：负责将新获取的 Cookie 加入池中。Cookie 来源包括手动登录获取、自动化登录获取（Selenium/Playwright 模拟登录）、以及接口登录获取（POST 账号密码到登录接口）。入库时需要记录 Cookie 的来源、账号、获取时间、预估有效期。

**健康检查模块**：定期检测池中 Cookie 的可用性。方法是用每个 Cookie 请求一个需要登录态的接口，如果返回 200 说明 Cookie 有效，如果返回 302（重定向到登录页）或 403 说明 Cookie 已失效。

**淘汰模块**：清理失效 Cookie。淘汰条件包括：健康检查失败、连续请求失败次数超过阈值、Cookie 已超过最大存活时间。淘汰后需要通知补充模块获取新 Cookie。

**补充模块**：当可用 Cookie 数量低于设定阈值时触发。补充方式取决于 Cookie 获取方式：如果是接口登录，直接调用登录接口获取新 Cookie；如果是浏览器登录，触发自动化登录流程。

**调度模块**：根据业务需求分配 Cookie。常见策略有轮询（Round Robin）、随机选择、按账号权重分配。调度模块还需要处理 Cookie 的并发使用问题——同一个 Cookie 不应同时被多个请求使用，避免触发异地登录风控。

> Cookie 池的管理本质上是资源调度问题。把它想象成一个停车场：车进车出，要有入口、出口、巡查和调度，缺一不可。

在实际项目中，Cookie 池的运维是一个容易被忽视的问题。Cookie 会过期、会因为异常登录被封禁、需要定期更新。一个成熟的 Cookie 池系统应该有完善的监控和告警机制。监控指标包括：当前可用 Cookie 数量、最近一小时 Cookie 消耗速度、健康检查通过率、Cookie 平均寿命。当可用 Cookie 数量低于设定阈值（比如 10 个）或者健康检查通过率低于 80% 时，系统应该触发告警通知运维人员介入。这个告警阈值需要根据实际的采集速度和 Cookie 供应商的供货能力来设定，初期可以保守一些，随着运营数据积累再逐步调整。

## 10.5 浏览器调度测验

当目标网站的反爬手段升级到需要执行 JS、渲染页面、模拟交互时，requests 库就不够用了。浏览器调度是处理这类场景的终极手段。

### 10.5.1 Selenium vs PhantomJS 选型

**测验题：Selenium 和 PhantomJS 应该选哪个？为什么？**

PhantomJS 是一个无界面的 WebKit 浏览器，曾经是爬虫界做无头浏览器的首选。但它在 2018 年正式停止维护，不再更新。Chrome 和 Firefox 相继推出了原生的 Headless 模式，性能和兼容性都优于 PhantomJS。

Selenium 是一个浏览器自动化框架，支持 Chrome、Firefox、Edge 等多种浏览器。Selenium 本身不是浏览器，而是通过 WebDriver 协议控制浏览器。

选型结论非常明确：选 Selenium + Headless Chrome。

| 对比维度 | Selenium + Chrome | PhantomJS |
|---------|-------------------|-----------|
| 维护状态 | 活跃维护 | 已停止维护 |
| 浏览器引擎 | Blink（Chrome） | WebKit |
| JS 执行 | 完整支持 | 部分兼容 |
| 性能 | 较高 | 一般 |
| 反爬检测 | 可规避 | 容易被检测 |
| 社区支持 | 活跃 | 已萎缩 |

Selenium 配合 Headless Chrome 的基础用法：

```python
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

options = Options()
options.add_argument('--headless')
options.add_argument('--disable-blink-features=AutomationControlled')
options.add_argument('--user-agent=Mozilla/5.0 ...')

service = Service('/path/to/chromedriver')
driver = webdriver.Chrome(service=service, options=options)
driver.get('https://www.example.com')
# 执行 JS 获取动态数据
data = driver.execute_script(
    'return window.__INITIAL_STATE__;'
)
driver.quit()
```

注意 `--disable-blink-features=AutomationControlled` 这个参数，它用来隐藏 Selenium 的自动化特征。如果不加这个参数，`navigator.webdriver` 属性会返回 `true`，目标网站可以通过这个特征识别你是自动化工具。

> 浏览器调度是爬虫的核武器。威力大但成本也高，不到万不得已不要用。能用接口解决的，别开浏览器。

在使用 Selenium 时，还有一个容易被忽略的问题：Chrome 版本和 chromedriver 版本必须严格匹配。如果版本不匹配，Selenium 会在启动时报错。正确的做法是先确认 Chrome 的版本号，然后去 ChromeDriver 官网下载对应版本的驱动。或者使用 webdriver-manager 这个库，它能自动检测 Chrome 版本并下载匹配的 chromedriver，避免了手动管理的麻烦。

### 10.5.2 滑块验证码算法对比

**测验题：常见的滑块验证码有哪些？其算法原理有什么区别？**

滑块验证码是目前最常见的行为验证码类型。主流的滑块验证码方案有三种：极验（GeeTest）、易盾（网易）和阿里滑块。

极验滑块的核心验证流程是：服务端生成带缺口的背景图和滑块拼图，前端展示给用户拖动，前端在拖动过程中采集轨迹数据（鼠标坐标、时间戳），拖动完成后把轨迹数据和加密参数提交给服务端，服务端通过轨迹分析判断是否为人类操作。

三种滑块验证码的核心差异在于轨迹分析算法和加密强度。

| 对比维度 | 极验 | 易盾 | 阿里滑块 |
|---------|------|------|---------|
| 轨迹采集 | 坐标+时间戳 | 坐标+时间戳+速度 | 坐标+时间戳+加速度 |
| 加密方式 | RSA + 自定义混淆 | AES + 自定义混淆 | 自定义算法 |
| 缺口识别 | 服务端比对 | 服务端比对 | 客户端+服务端双重 |
| 重试限制 | 较严格 | 中等 | 较宽松 |
| 机器学习 | 有行为模型 | 有行为模型 | 有行为模型 |

破解滑块验证码的技术路径有两个。

第一条路径是模拟人类轨迹。核心是生成符合人类行为特征的拖动轨迹。人类的拖动轨迹不是匀速直线，而是有加速、减速、微调的过程。一个常用的轨迹生成算法：

```python
import random
import math

def generate_track(distance):
    """生成人类滑动轨迹"""
    track = []
    current = 0
    # 初速度
    v = 0
    # 中间点，在距离的 4/5 处
    mid = distance * 4 / 5
    # 时间间隔
    t = 0.2
    while current < distance:
        if current < mid:
            # 加速阶段
            a = 2
        else:
            # 减速阶段
            a = -3
        v += a * t
        move = v * t + random.uniform(-0.5, 0.5)
        current += move
        track.append(round(current))
    # 末尾微调
    for _ in range(3):
        track.append(distance + random.randint(-2, 2))
    return track
```

第二条路径是利用机器学习模型直接预测缺口位置，然后配合轨迹模拟完成验证。这条路径的门槛更高，但在面对频繁更换缺口图片的场景时更稳定。

> 验证码和反验证码是一场持续的军备竞赛。没有永远的破解方案，只有不断更新的对抗策略。

关于滑块验证码，还有一个重要的方向是图像识别。许多开源项目（如 ddddocr）提供了通用的滑块缺口识别能力，可以自动识别背景图中的缺口位置。这类工具对于常见的简单滑块效果不错，但对于有高强度干扰线、色彩接近、色块缺失等复杂情况的滑块，识别准确率会显著下降。实际使用中，建议先用开源工具测试目标网站的滑块，如果识别率低于 80%，再考虑自己训练专门的图像识别模型或者人工打码。

## 10.6 数据加密测验

数据加密反爬是最高级别的反爬手段之一。目标网站把数据在服务端加密后传输到前端，前端通过 JS 解密后渲染。如果你只抓接口返回的密文，拿到的就是一堆乱码。

### 10.6.1 字体渲染与 Base64 应用

**测验题：字体渲染的全过程是什么？Base64 在网页中有哪些应用？**

字体反爬是一种利用自定义字体文件来混淆数据的反爬手段。其核心原理是：服务端返回的 HTML 中，关键数据（如价格、评分）的字符被替换成了自定义的 Unicode 编码，这些编码在自定义字体文件中映射到正确的字形。浏览器加载自定义字体后能正确显示数据，但爬虫直接解析 HTML 拿到的是错误的字符。

字体渲染的全过程可以分为五步。

第一步，服务端生成自定义字体文件（通常是 .woff 或 .woff2 格式），在这个字体文件中，字符的编码和字形之间的映射关系被打乱。比如正常情况下 Unicode 编码 `0x0031` 对应数字"1"的字形，但在自定义字体中，`0x0031` 可能对应数字"7"的字形。

第二步，服务端在 HTML 中引用这个自定义字体文件。引用方式通常是通过 CSS 的 `@font-face` 规则。

第三步，HTML 中的关键数据使用自定义的 Unicode 编码。比如价格"199"在 HTML 中可能写成 `&#xefb1;&#xefb2;&#xefb3;`，这三个编码在自定义字体中分别对应"1"、"9"、"9"的字形。

第四步，浏览器加载 HTML 后，根据 CSS 规则请求字体文件，下载完成后用自定义字体的字形映射关系渲染文本。用户在页面上看到的是正确的"199"。

第五步，爬虫如果直接用 requests + BeautifulSoup 解析 HTML，拿到的就是 `&#xefb1;&#xefb2;&#xefb3;`，而不是"199"。

破解字体反爬的核心是建立正确的编码-字符映射表。方法有两种。

第一种是静态分析。下载字体文件，用 fontTools 库解析字体文件中的 cmap 表（字符映射表），找到编码和字形的对应关系。但自定义字体的字形名称可能是打乱的，需要通过比对字形数据来确认实际对应关系。

```python
from fontTools.ttLib import TTFont

# 解析字体文件
font = TTFont('custom.woff')
cmap = font.getBestCmap()
# cmap 格式：{unicode_int: glyph_name}
# 例如：{61441: 'uni3', 61442: 'uni7', ...}

# 获取字形坐标，用于比对识别
for code, glyph_name in cmap.items():
    glyph = font['glyf'][glyph_name]
    coordinates = glyph.coordinates
    print(f'{hex(code)} -> {glyph_name}, coords: {coordinates}')
```

第二种是动态比对。把字体文件中的每个字形渲染成图片，用 OCR 识别图片中的字符，建立映射表。这种方法更通用但速度较慢。

Base64 在网页中的应用主要有三个场景。

第一，小图片内联。把小体积的图片转换为 Base64 编码字符串，直接嵌入 HTML 或 CSS 中，避免额外的 HTTP 请求。这在大图片的 Base64 编码会显著增大文件体积，所以通常只用于几 KB 以内的小图标。

第二，字体文件内联。在 CSS 中用 `@font-face` 定义字体时，字体文件的 URL 可以用 Base64 编码的 data URI 替代，避免额外的字体文件请求。在字体反爬场景中，这种方式会让爬虫不容易直接下载字体文件。

```css
/* Base64 内联字体 */
@font-face {
    font-family: 'custom';
    src: url(data:font/woff2;base64,d09GMgABAAAAAA...)
         format('woff2');
}
.encrypted-data {
    font-family: 'custom';
}
```

第三，数据传输编码。某些网站把接口返回的 JSON 数据整体做 Base64 编码，增加爬虫解析的门槛。虽然 Base64 不是加密算法（任何人都能解码），但它能让爬虫无法直接阅读返回数据，需要额外一步解码操作。

```python
import base64
import json

# 解码 Base64 编码的接口数据
encoded = response.json()['data']
decoded = base64.b64decode(encoded).decode('utf-8')
data = json.loads(decoded)
```

> 字体反爬的本质是"对调电话簿里的名字和号码"。你看到的名字是错的，但电话簿（字体文件）里有正确的对应关系。破解的关键就是拿到电话簿。

字体反爬还有一个进阶玩法：动态字体。很多高级反爬网站会每隔几个小时甚至每次请求都更换一次字体映射关系，让静态的映射表在短时间内就失效。对付这种动态字体，常规的离线分析映射表就不管用了，必须采用实时方案：每次遇到字体反爬时，动态下载最新的字体文件，实时解析映射关系，或者用浏览器自动化工具截图来验证渲染结果。实时方案的速度比静态映射表慢很多，但可以应对字体文件频繁变化的场景。这又印证了怕浪猫一直强调的观点：爬虫没有银弹，只有在多种方案中选择最适合当前场景的那个。

## 10.7 分布式爬虫测验

当单机爬虫无法满足数据量和时效性需求时，分布式爬虫是必然的选择。但分布式引入了新的复杂度——任务调度、数据去重、容错处理都需要重新设计。

### 10.7.1 Scrapy 框架组件与中间件

**测验题：Scrapy 框架有哪些核心组件？下载器中间件的职责是什么？**

Scrapy 是 Python 爬虫领域最成熟的框架，它的架构设计是典型的组件化 + 数据流管道模式。

Scrapy 的核心组件包括五个部分。

引擎（Engine）是整个框架的核心，负责调度所有组件之间的数据流。它是爬虫的"总指挥"，控制着请求的发送、响应的处理和数据的输出。

爬虫（Spider）是用户编写的业务逻辑，定义了如何解析响应和如何生成新的请求。每个 Spider 对应一个或一组目标网站。

调度器（Scheduler）是请求队列的管理者。引擎把 Spider 生成的请求交给调度器入队，调度器按照一定策略（默认 FIFO）把请求出队交给引擎发送。调度器还负责请求去重。

下载器（Downloader）负责实际发送 HTTP 请求和接收响应。它基于 Twisted 异步框架实现，支持高并发请求。

管道（Item Pipeline）负责处理 Spider 输出的数据项。常见操作包括数据清洗、去重、持久化存储（写入数据库或文件）。

数据流的核心路径是：

```
引擎 ←→ 调度器（请求队列）
引擎 → 下载器（发送请求）
下载器 → 引擎（返回响应）
引擎 → Spider（传递响应）
Spider → 引擎（输出数据项 + 新请求）
引擎 → 管道（传递数据项）
```

下载器中间件（Downloader Middleware）是介于引擎和下载器之间的钩子层，它的职责是在请求发送前和响应返回后进行自定义处理。

下载器中间件的核心职责包括：修改请求头（添加 UA、Referer、Cookie）、设置代理 IP、处理重试逻辑（请求失败后重试）、处理异常（超时、连接错误等）、以及自定义的请求/响应处理逻辑。

```python
# Scrapy 下载器中间件示例：随机 UA + 代理
import random

class RandomUaProxyMiddleware:
    def __init__(self):
        self.ua_list = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) ...',
        ]
        self.proxy_list = [
            'http://1.2.3.4:8080',
            'http://5.6.7.8:8080',
        ]

    def process_request(self, request, spider):
        request.headers['User-Agent'] = random.choice(self.ua_list)
        request.meta['proxy'] = random.choice(self.proxy_list)

    def process_response(self, request, response, spider):
        if response.status != 200:
            # 响应异常时换代理重试
            request.meta['proxy'] = random.choice(self.proxy_list)
            return request
        return response
```

> 理解 Scrapy 的关键是理解数据流。组件是节点，中间件是管道上的阀门。数据从入口到出口，经过层层阀门的处理，最终变成你要的数据。

除了下载器中间件，Scrapy 还有爬虫中间件（Spider Middleware）和引擎中间件（Engine Middleware）。爬虫中间件运行在 Spider 输出的 Request 和 Item 经过的钩子上，可以用来过滤 Request（比如过滤掉已经处理过的 URL）、修改 Item（比如给 Item 添加额外的元数据）、或者处理异常。引擎中间件运行在引擎的核心事件循环中，一般很少直接使用，但在需要深度定制 Scrapy 行为时很有用。理解三层中间件的位置和作用，你就能在 Scrapy 的任意环节插入自定义逻辑，而不需要修改框架的核心代码。

### 10.7.2 分布式爬虫与管理系统

**测验题：分布式爬虫适用于什么场景？Scrapyd 是什么？分布式爬虫管理系统包含哪些功能？**

分布式爬虫适用于以下场景。

单机采集速度无法满足时效性要求。比如需要在一小时内采集十万个商品详情页，单机并发再高也受限于单机带宽和 CPU，多机并行可以成倍提升速度。

IP 需求量大，单机 IP 不够用。每个机器出口 IP 不同，天然实现了 IP 分散。

容错需求。单机爬虫如果宕机，整个采集任务中断。分布式爬虫中某台机器宕机，其他机器可以继续工作，任务可以重新分配。

Scrapy-Redis 是 Scrapy 分布式的核心组件。它把 Scrapy 默认的内存调度器替换为 Redis 调度器，把请求队列和去重集合都放到 Redis 中。这样多台机器上的 Scrapy 进程可以共享同一个请求队列，实现任务的自动分配。

```python
# Scrapy-Redis 分布式爬虫配置
# settings.py
SCHEDULER = "scrapy_redis.scheduler.Scheduler"
SCHEDULER_PERSIST = True
DUPEFILTER_CLASS = "scrapy_redis.dupefilter.RFPDupeFilter"
REDIS_URL = 'redis://192.168.1.100:6379/0'

# Spider 继承 RedisSpider
from scrapy_redis.spiders import RedisSpider

class DistributedSpider(RedisSpider):
    name = 'distributed'
    redis_key = 'distributed:start_urls'

    def parse(self, response):
        # 解析逻辑和普通 Spider 相同
        yield {'title': response.css('h1::text').get()}
```

Scrapyd 是一个用于部署和运行 Scrapy 爬虫的服务。它提供 REST API，支持通过 HTTP 请求来启动、停止、监控爬虫任务。

```
# Scrapyd API 核心接口
POST /schedule.json   # 启动爬虫任务
POST /cancel.json     # 取消爬虫任务
GET  /listjobs.json   # 列出所有任务
GET  /listspiders.json # 列出所有 Spider
```

一个完整的分布式爬虫管理系统需要包含以下功能模块。

任务管理：创建、编辑、删除爬虫任务，设置定时调度（cron 表达式），查看任务执行历史。日志管理：实时查看爬虫运行日志，支持按任务、时间、级别过滤。监控告警：监控爬虫运行状态（运行中、已停止、异常退出），采集速率、成功率等指标，异常时发送告警通知。资源管理：管理爬虫节点（Scrapyd 实例），查看各节点的资源使用情况（CPU、内存、磁盘）。版本管理：管理爬虫代码的版本，支持一键部署指定版本到所有节点。

> 分布式不是银弹。它解决了速度和容错问题，但带来了运维复杂度。在决定上分布式之前，先问自己：单机优化到极限了吗？

分布式爬虫还有一个不可忽视的问题：数据一致性。在单机爬虫中，数据写入是顺序的，不存在并发问题。但在分布式爬虫中，多个爬虫节点同时写入同一个数据库，如果数据库本身不支持事务隔离，就会出现数据重复或数据冲突的问题。解决这个问题的常用方案有三种。第一种是在数据库层面设置唯一约束，让重复数据写入时直接报错，然后捕获异常忽略重复数据。第二种是在应用层做幂等处理，比如给每条数据生成一个唯一的哈希值作为主键，写入前先查询是否存在。第三种是使用专门的分布式队列（如 Kafka）来做数据缓冲，所有爬虫节点先把数据写到 Kafka，再由一个专门的消费者进程统一写入数据库。Kafka 的方案可以做到最大程度的解耦和数据可靠，是大规模生产环境的推荐选择。

## 10.8 大数据测验

当爬虫采集的数据量达到 TB 级别时，传统的 MySQL、MongoDB 已经无法支撑高效的数据存储和查询。大数据技术栈是处理海量爬虫数据的解决方案。

### 10.8.1 Spark 优势与分布式文件系统

**测验题：Spark 相比 Hadoop MapReduce 有什么优势？分布式文件系统（HDFS）和大数据文件系统的区别是什么？**

Spark 相比 Hadoop MapReduce 的核心优势在于内存计算和 DAG 执行引擎。

MapReduce 的执行模型是：每个 Map 任务从磁盘读取数据，处理完后把中间结果写入磁盘，Reduce 任务从磁盘读取中间结果再处理。如果有多轮 MapReduce 串联，每轮之间都要经过磁盘读写，I/O 开销巨大。

Spark 的执行模型是基于 RDD（弹性分布式数据集）的 DAG（有向无环图）执行引擎。Spark 可以把中间结果缓存在内存中，后续操作直接从内存读取，避免了大量磁盘 I/O。对于迭代式算法（如机器学习训练）和多次转换的数据处理场景，Spark 的性能可以比 MapReduce 快 10 到 100 倍。

| 对比维度 | Hadoop MapReduce | Spark |
|---------|-----------------|-------|
| 执行模型 | 磁盘 I/O 为主 | 内存计算为主 |
| 中间结果 | 写入磁盘 | 缓存在内存 |
| 编程模型 | Map + Reduce | RDD 算子链 |
| 容错机制 | 重新执行 Task | RDD 血缘重算 |
| 延迟 | 高（分钟级） | 低（秒级到亚秒级） |
| 适用场景 | 超大规模批处理 | 批处理 + 流处理 + 机器学习 |

Spark 的核心数据抽象是 RDD，但实际使用中更常用的是 DataFrame 和 Spark SQL：

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .appName('CrawlerDataAnalysis') \
    .getOrCreate()

# 读取爬虫采集的数据
df = spark.read.json('hdfs://namenode:9000/crawler/data/')

# 数据清洗和聚合分析
result = df.filter(df['price'] > 0) \
    .groupBy('category') \
    .avg('price') \
    .orderBy('avg(price)', ascending=False)

result.show()
```

分布式文件系统（HDFS）和大数据文件系统的区别在于设计目标不同。

HDFS 是 Hadoop 分布式文件系统，它的设计目标是存储超大文件（GB 到 TB 级别），一次写入多次读取。HDFS 把文件切成固定大小的块（默认 128MB），分散存储在多个数据节点上。HDFS 的优点是高吞吐量、高容错性（默认 3 副本），缺点是不支持随机写、不适合小文件存储、延迟较高。

大数据文件系统（如 HBase、Cassandra）是建立在 HDFS 之上的分布式数据库，支持随机读写、低延迟查询。它们的底层存储仍然是 HDFS，但在上面加了一层索引和缓存机制，使得点查询（根据 key 查 value）的延迟从 HDFS 的秒级降低到毫秒级。

> HDFS 是仓库，大数据文件系统是货架。仓库适合大批量存取，货架适合快速精准拿取。根据访问模式选择存储方案。

补充一个 Spark 的实战经验：Spark 的性能调优是很多人容易踩的坑。Spark 的核心配置参数包括 executor 数量、每个 executor 的内存、每个 executor 的 CPU 核数、以及并行度（parallelism）。如果并行度设置过低，集群资源会浪费在等待任务分配上。如果并行度过高，每个任务处理的数据量太小，任务调度的开销会超过实际计算时间，成为新的瓶颈。一个实用的调优原则是：让每个分区的数据量在 128MB 到 256MB 之间。比如你的数据总量是 10GB，你想用 100 个分区来处理，那么每个分区约 100MB，在这个范围内是一个合理的配置。

### 10.8.2 HBase vs Hive

**测验题：HBase 和 Hive 有什么区别？各自适用于什么场景？**

HBase 和 Hive 都是 Hadoop 生态中的数据存储/分析工具，但它们的定位完全不同。

HBase 是一个分布式列式 NoSQL 数据库，支持随机读写、低延迟点查询。它的数据模型是稀疏的、多版本的、面向列的。HBase 适合存储爬虫采集的结构化数据，支持按 rowkey 快速查询。

Hive 是一个数据仓库工具，支持用类 SQL 语言（HQL）做批量数据分析。Hive 本身不存储数据，数据存储在 HDFS 上，Hive 负责把 SQL 语句翻译成 MapReduce/Spark 任务执行。Hive 适合做大规模数据的离线分析。

| 对比维度 | HBase | Hive |
|---------|-------|------|
| 数据模型 | 列式存储（Key-Value） | 表（底层是文件） |
| 查询方式 | Get/Scan | SQL（HQL） |
| 查询延迟 | 毫秒级 | 分钟级到小时级 |
| 数据更新 | 支持随机写和更新 | 不支持行级更新 |
| 适用场景 | 实时查询、在线服务 | 离线分析、报表统计 |
| 数据规模 | 亿级到百亿级行 | TB 到 PB 级 |

在爬虫数据存储的场景中，HBase 和 Hive 通常配合使用。爬虫实时采集的数据写入 HBase，支持快速查询和更新。HBase 中的数据定期导出到 Hive 做批量分析，生成统计报表。

```python
# HBase 写入爬虫数据
import happybase

connection = happybase.Connection('hbase-master')
table = connection.table('crawler_data')

# 写入一条数据
table.put(
    b'product_10086',
    {
        b'info:title': b'iPhone 15 Pro',
        b'info:price': b'8999',
        b'info:category': b'electronics',
        b'meta:crawl_time': b'2026-06-28 00:00:00'
    }
)

# 查询数据
row = table.row(b'product_10086')
print(row[b'info:title'].decode())  # iPhone 15 Pro
```

```python
# Hive 离线分析爬虫数据
from pyhive import hive

conn = hive.Connection(host='hive-server', port=10000)
cursor = conn.cursor()

# 创建外部表关联 HDFS 数据
cursor.execute("""
    CREATE EXTERNAL TABLE IF NOT EXISTS crawler_products (
        product_id STRING,
        title STRING,
        price DECIMAL(10,2),
        category STRING,
        crawl_time TIMESTAMP
    )
    STORED AS ORC
    LOCATION '/warehouse/crawler/products/'
""")

# 执行分析查询
cursor.execute("""
    SELECT category, COUNT(*) as cnt, AVG(price) as avg_price
    FROM crawler_products
    WHERE crawl_time >= '2026-06-01'
    GROUP BY category
    ORDER BY avg_price DESC
""")
for row in cursor.fetchall():
    print(row)
```

怕浪猫在实际项目中推荐的架构是：爬虫采集层用 Scrapy + Redis 分布式，数据实时写入 HBase（支持快速查询和去重），每天定时把 HBase 数据导出到 Hive 做离线分析，分析结果写入 MySQL 供业务系统查询。这样每一层都用最适合的工具，各司其职。

> 大数据不是炫技，而是业务驱动的选择。数据量不到 TB 级别，MySQL 和 Elasticsearch 就够了。别为了用大数据而用大数据。

在实际的大数据架构中，还有一个组件值得爬虫工程师了解：Kafka。Kafka 是一个分布式流处理平台，在爬虫架构中通常用作数据缓冲层和分发层。它的核心作用是把爬虫和数据存储解耦——爬虫不需要关心数据最终写入哪里，只需要把采集到的数据吐到 Kafka，Kafka 再把数据分发到不同的消费者（写入 HBase、写入 Elasticsearch、写入 ClickHouse 等）。这样做的好处是：爬虫和数据存储可以独立扩缩容，互不干扰；同时 Kafka 的持久化特性可以防止数据丢失，即使某个数据消费者暂时不可用，数据也会在 Kafka 中保留一段时间后再清理。对于日采集量在百万级以上、数据种类较多的爬虫项目，引入 Kafka 作为中间层是值得考虑的选择。

## 测验总结

这八章测验题覆盖了 Python 爬虫从基础到进阶的完整知识体系。回顾一下核心知识点之间的关联。

HTTP 基础是所有爬虫的起点——你得先能发出正确的请求。代理服务和 Cookie 管理解决的是"如何持续稳定地发请求"的问题。JS 逆向和数据加密解决的是"如何获取被保护的数据"的问题。浏览器调度是处理复杂反爬的终极手段。分布式爬虫和大数据解决的是"如何处理海量数据和海量采集"的问题。

这些技术点不是孤立的，而是层层递进的。一个成熟的爬虫工程师在面对一个新目标时，分析路径通常是：先看请求结构（HTTP 基础），再看是否有反爬（UA/Referer 检测），然后看是否需要代理（IP 限制），接着看是否有登录态需求（Cookie 管理），再看数据是否加密（JS 逆向/字体反爬），最后考虑是否需要分布式（数据量评估）。

> 爬虫工程师的核心能力不是记住每个技术点，而是知道在什么场景下用什么技术。知识体系化，才是你应对任何反爬挑战的底气。

下章预告：第11章是爬虫工程师简历指导与后续学习路线，帮你拿到高薪 offer。

系列进度 10/11

怕浪猫说：到这里，整个爬虫课程的知识体系已经完整复盘了一遍。测验的目的不是考你记住了多少，而是帮你找到知识盲区。如果有哪个模块的题目你答得不太确定，回去翻对应章节的详细内容。把这些知识点连成网，你就拥有了应对真实爬虫项目的完整能力。最后一章，怕浪猫会教你如何把这些技术能力写进简历、如何在面试中展示、以及后续的学习路线规划。冲刺高薪 offer，我们最后一站见。