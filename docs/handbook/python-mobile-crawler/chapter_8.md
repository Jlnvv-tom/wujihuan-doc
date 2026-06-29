# 第8章 熟悉App爬虫神器MitmProxy核心功能

你有没有想过，为什么有些爬虫工程师能轻松拿到App的加密接口数据，而你在逆向路上挣扎数周却毫无进展？你以为是逆向技术不够强，其实很可能只是工具没选对、原理没吃透。在移动端爬虫的完整技术栈里，抓包是一切的起点。没有抓包，就没有数据；没有数据，后面所有的分析、逆向、模拟都是空中楼阁。

我是怕浪猫，一个在爬虫坑里摸爬滚打多年的老猫。今天这一章，我带你深入剖析移动端爬虫最核心的抓包工具——MitmProxy。不是简单教你装个证书、跑个命令，而是从底层原理到实战踩坑，从流量捕获到请求篡改，彻底搞懂这个神器。学完这一章，你不仅能用MitmProxy抓包，还能用Python脚本完全控制流量处理流程，实现自动化数据采集。

> 一款优秀的抓包工具，是爬虫工程师手中最锋利的刀。刀不锋利，再好的刀法也是白搭。而理解工具背后的原理，就是磨刀的过程。

## 8.1 MitmProxy原理与架构：MITM攻击与流量解密

### 8.1.1 什么是MITM

要理解MitmProxy的工作原理，我们必须先搞清楚MITM（Man-In-The-Middle，中间人攻击）这个概念。

在日常的HTTPS通信中，客户端和服务器之间建立的是端到端的加密通道。数据在传输过程中是加密的，第三方无法看到真实内容。这种安全性依赖于PKI（Public Key Infrastructure，公钥基础设施）体系和TLS（Transport Layer Security，传输层安全）协议。

但是，如果有人在客户端和服务器之间插入一个代理节点，这个代理节点分别与客户端和服务器建立独立的TLS连接，那么它就能解密所有流量。这就是MITM的核心思想。

正常情况下的通信流程：

```
客户端 ──────────── 加密通道 ──────────── 服务器
        (TLS握手 → 密钥协商 → 加密传输)
```

MitmProxy介入后的通信流程：

```
客户端 ──── TLS连接A ──── MitmProxy ──── TLS连接B ──── 服务器
                    (解密 → 查看/修改 → 重新加密)
```

关键在于，MitmProxy会向客户端出示一个自己签发的证书，伪装成目标服务器。如果客户端信任了这个证书，加密通道就建立了。同时，MitmProxy以客户端的身份与真实服务器建立另一个加密连接。这样，MitmProxy就成为了"中间人"，可以看到明文数据。

> 代理的本质是信任：谁掌握了证书，谁就掌握了流量。这句话值得每个爬虫工程师铭记在心。所有的HTTPS抓包，归根结底都是在解决信任问题。

### 8.1.2 证书欺骗的工作机制

MitmProxy的证书欺骗机制可以分为几个步骤来理解：

第一步，MitmProxy在首次运行时生成一套自签名的CA（Certificate Authority，证书颁发机构）根证书。这个根证书保存在用户目录的 ~/.mitmproxy/ 文件夹下。

第二步，当客户端发起HTTPS请求时，MitmProxy会拦截这个请求，并根据目标域名动态生成一个使用自签CA签发的域名证书。

第三步，MitmProxy将这个动态生成的证书发送给客户端。如果客户端的信任库中已经安装了MitmProxy的CA根证书，那么客户端就会信任这个动态生成的域名证书。

第四步，MitmProxy同时与真实的目标服务器建立HTTPS连接，获取真实的服务器证书。

第五步，MitmProxy在两个加密连接之间转发数据，同时可以查看和修改明文内容。

整个过程对客户端来说是透明的，只要客户端信任了MitmProxy的CA证书，整个解密过程就能顺利完成。这也是为什么证书安装是整个抓包流程中最关键的步骤——没有正确安装证书，一切都无法进行。

理解这个原理对于爬虫工程师来说非常重要。因为在实际工作中，你不仅需要抓包，还需要理解为什么某些情况下抓包会失败。比如App使用了SSL Pinning（证书固定），也就是App在代码中内置了服务器证书的指纹信息，不信任系统证书库中的任何CA证书。这种情况下，即使你正确安装了MitmProxy的CA证书，App仍然会拒绝连接。理解了MITM的原理，你就能理解SSL Pinning的本质是在客户端层面阻止中间人攻击，从而理解为什么需要用Frida等工具来Hook掉证书校验逻辑。

### 8.1.3 三大核心组件

MitmProxy项目实际上包含三个可执行组件，每个组件适用于不同的使用场景：

mitmproxy是一个基于命令行的交互式界面，支持键盘操作，可以实时查看和修改流量。适合在终端环境下进行快速调试和流量分析。它的界面分为多个面板，包括流量列表、请求详情、响应详情等，通过快捷键可以快速切换。

mitmdump是一个纯命令行工具，没有交互界面，输出以文本形式打印到终端。它最重要的特性是支持加载Python脚本，可以通过编写Addon来自动化处理流量。对于爬虫工程师来说，这是最常用的组件，因为可以完全用代码控制流量处理逻辑。

mitmweb提供了一个基于浏览器的可视化界面，功能类似于Fiddler和Charles的GUI界面。适合不熟悉命令行操作的用户，或者在团队协作、教学演示场景下使用。

其中最常用的是mitmdump，因为它可以通过Python脚本实现完全自动化。下面是一个最简单的mitmdump脚本示例，它会在控制台打印所有经过代理的HTTP请求URL：

```python
from mitmproxy import http

def request(flow: http.HTTPFlow) -> None:
    # 每个请求经过时触发
    print(f"请求: {flow.request.method} {flow.request.url}")

def response(flow: http.HTTPFlow) -> None:
    # 每个响应返回时触发
    print(f"响应: {flow.response.status_code} {flow.request.url}")
```

将这段代码保存为proxy.py，然后执行`mitmdump -s proxy.py`即可运行。

### 8.1.4 事件驱动架构

MitmProxy的架构采用了事件驱动模型，核心是Addon系统和Hook机制。每个Addon是一个Python类，可以注册多个Hook函数来响应不同的事件。

主要的事件Hook包括：request（请求发出时触发）、response（响应到达时触发）、error（发生错误时触发）、connect（TCP连接建立时触发）、websocketmessage（WebSocket消息触发）等。

事件按照HTTP请求的生命周期依次触发：客户端发起连接 → connect事件 → TLS握手 → request事件 → 服务器处理 → response事件 → 连接关闭。在每个阶段，你都可以插入自定义逻辑来处理流量。这种设计使得MitmProxy非常灵活，你可以在请求发出前修改参数，在响应到达后分析数据，在连接建立时决定是否允许通过，在错误发生时进行重试。

与Fiddler的FiddlerScript或Charles的Rewrite功能相比，MitmProxy的Addon系统最大的优势在于可以使用Python完整的生态系统。你可以在Addon中调用任何Python库，比如用json解析响应、用re正则匹配内容、用pymongo存储到数据库、用redis做缓存。这种灵活性是其他工具无法比拟的。

> 理解事件驱动模型是掌握MitmProxy的关键。它不是一个简单的代理转发工具，而是一个可编程的流量处理引擎。把MitmProxy当作你的Python程序的延伸，而不是一个独立的工具，你的爬虫效率会提升一个数量级。

## 8.2 工具对比与安装：MitmProxy vs Fiddler vs Charles vs Wireshark

### 8.2.1 四大工具横向对比

在移动端爬虫领域，主流的抓包工具有四款。每款工具都有自己的优势和适用场景，选择合适的工具能事半功倍。

Fiddler是一款由Telerik公司开发的HTTP调试代理，主要运行在Windows平台。它的优点是界面友好、上手简单，支持通过FiddlerScript进行扩展。缺点是跨平台支持不佳（Fiddler Everywhere是新跨平台版本但收费），且脚本扩展能力有限。Fiddler在国内爬虫圈中使用率很高，主要是因为Windows用户基数大，加上早期免费策略。但它的FiddlerScript语法比较晦涩，写复杂逻辑很痛苦，而且无法在Linux服务器上运行。

Charles是一款商业收费的HTTP代理工具，支持Windows和Mac。它的Map Local和Map Remote功能非常实用，可以方便地进行本地映射和远程映射。Charles的界面清晰，操作直观，但不开源且需要付费。很多iOS开发者使用Charles进行接口调试，因为它的Mac体验很好。但对于爬虫工程师来说，Charles的脚本扩展能力几乎为零，无法实现自动化处理。

Wireshark是一款开源的网络协议分析工具，工作在网络层而非应用层。它可以捕获所有经过网卡的数据包，支持几乎所有协议的解析。但对于HTTPS流量，需要额外配置SSL解密，操作复杂。Wireshark更适合网络层面的分析，比如排查TCP连接问题、分析DNS解析、诊断网络延迟等。在应用层HTTP流量分析方面，它不如其他三款工具方便。

MitmProxy则是一款开源的、基于Python的HTTP/HTTPS代理工具。它的核心优势在于原生支持Python脚本扩展，可以编写复杂的流量处理逻辑。对于爬虫工程师来说，这意味着可以将抓包逻辑与爬虫代码无缝衔接。

| 特性 | MitmProxy | Fiddler | Charles | Wireshark |
|------|-----------|---------|---------|-----------|
| 开源免费 | 是 | 基础版免费 | 否 | 是 |
| 跨平台 | 是 | 弱 | 弱 | 是 |
| HTTPS解密 | 支持 | 支持 | 支持 | 需配置 |
| Python扩展 | 原生支持 | 不支持 | 不支持 | 不支持 |
| 命令行支持 | 原生支持 | 弱 | 不支持 | tshark |
| 移动端抓包 | 简单 | 中等 | 简单 | 复杂 |

> 选择工具的关键不是哪个更强大，而是哪个更适合你的场景。对于爬虫工程师，Python扩展能力是决定性因素。

### 8.2.2 为什么爬虫工程师应该选择MitmProxy

除了上面提到的Python扩展能力外，MitmProxy还有几个独特优势值得展开说明。

第一是命令行友好。爬虫项目通常部署在Linux服务器上，没有图形界面。MitmProxy可以轻松运行在服务器环境，24小时持续抓包，配合脚本实现自动化数据采集。你甚至可以把它部署在云服务器上，通过SSH远程管理。这是Fiddler和Charles无法做到的。

第二是流量文件格式友好。MitmProxy保存的流量文件可以被Python代码直接读取和解析，方便进行离线分析。同时支持导出为HAR（HTTP Archive，HTTP存档）格式，与其他工具兼容。你可以在服务器上用mitmdump录制流量，下载到本地用mitmweb打开分析，工作流非常顺畅。

第三是活跃的社区和完善的文档。MitmProxy的官方文档非常详细，包含大量示例代码。GitHub上有许多开源的MitmProxy插件和脚本，可以直接复用。遇到问题时，在GitHub Issues或Stack Overflow上通常能找到解决方案。

下面是一个展示MitmProxy与Python爬虫无缝衔接的示例，通过Addon自动捕获API响应并提取数据：

```python
from mitmproxy import http
import json

class DataExtractor:
    def __init__(self):
        self.results = []

    def response(self, flow: http.HTTPFlow) -> None:
        # 只处理目标API
        if "api.example.com/data" not in flow.request.url:
            return
        
        content_type = flow.response.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            return
        
        try:
            data = json.loads(flow.response.text)
            # 提取需要的数据
            if "items" in data:
                self.results.extend(data["items"])
                print(f"已提取 {len(data['items'])} 条数据，总计 {len(self.results)} 条")
        except json.JSONDecodeError:
            print(f"JSON解析失败: {flow.request.url}")

addons = [DataExtractor()]
```

### 8.2.3 安装步骤详解

MitmProxy的安装非常简单，推荐使用pip进行安装。在安装之前，建议先创建虚拟环境，避免污染系统Python环境。

```bash
# 创建虚拟环境
python -m venv mitmproxy-env
source mitmproxy-env/bin/activate  # Linux/Mac
# mitmproxy-env\Scripts\activate   # Windows

# 安装MitmProxy
pip install mitmproxy

# 验证安装
mitmdump --version
```

安装完成后，系统会获得三个命令：mitmproxy、mitmdump和mitmweb。可以分别执行这三个命令来验证安装是否成功。

如果在安装过程中遇到编译错误，通常是因为缺少系统依赖。不同操作系统的处理方式如下：Ubuntu/Debian系统需要安装python3-dev和libssl-dev；CentOS/RHEL系统需要安装python3-devel和openssl-devel；Mac系统建议使用Homebrew安装openssl。

Windows用户如果pip安装失败，可以从MitmProxy的官方GitHub Releases页面下载预编译的可执行文件，直接运行无需安装Python环境。这种方式适合不想配置Python环境的用户，但缺点是无法使用Python脚本扩展功能。对于爬虫工程师来说，还是建议通过pip安装，以便充分发挥MitmProxy的脚本扩展能力。

安装成功后，首次运行MitmProxy会在用户目录下自动生成CA证书文件。这些证书文件是后续HTTPS解密的基础，下一节我们将详细讲解证书的配置过程。关于版本选择，建议始终使用最新稳定版。MitmProxy的更新频率较高，新版本通常会修复兼容性问题并增加对新协议的支持。可以通过 pip install --upgrade mitmproxy 来更新到最新版本。

## 8.3 HTTPS解密与CA证书配置

要解密HTTPS流量，必须在客户端安装MitmProxy生成的CA证书。这是整个抓包流程中最关键也是最容易出现问题的一步。

### 8.3.1 证书生成机制

首次运行MitmProxy时（执行mitmproxy、mitmdump或mitmweb任意一个），它会自动在 ~/.mitmproxy/ 目录下生成一套CA证书和相关文件。

这套证书包括：mitmproxy-ca.pem是CA私钥和证书的合并文件，用于签发动态域名证书；mitmproxy-ca-cert.pem是CA证书的PEM格式文件，用于Linux和Mac系统安装；mitmproxy-ca-cert.p12是CA证书的PKCS12格式文件，用于Windows系统安装；mitmproxy-dhparam.pem是DH（Diffie-Hellman）参数文件，用于TLS握手过程中的密钥交换。

当客户端发起HTTPS请求时，MitmProxy会使用这些CA证书动态生成对应域名的服务器证书。例如，当客户端请求 https://api.example.com 时，MitmProxy会实时生成一个 api.example.com 的域名证书，并使用自签的CA根证书进行签名。如果客户端信任了这个CA根证书，那么它就会信任所有由这个CA签发的域名证书。

> 证书是HTTPS的信任根基。理解了证书机制，你就理解了HTTPS抓包的核心原理。

### 8.3.2 桌面端证书安装

不同操作系统的证书安装方式不同，下面分别说明。

Windows系统安装CA证书的步骤：首先双击打开mitmproxy-ca-cert.p12文件，在弹出的证书导入向导中选择"当前用户"，然后选择"将所有的证书都放入下列存储"，点击浏览选择"受信任的根证书颁发机构"，最后完成安装。安装完成后，建议重启浏览器使证书生效。

Mac系统可以通过命令行快速安装，使用security命令将证书添加到系统钥匙串并设置为信任。命令如下：执行 `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ~/.mitmproxy/mitmproxy-ca-cert.pem`，输入管理员密码后即可完成安装。也可以手动操作：双击pem文件打开钥匙串访问，找到mitmproxy证书，双击后在信任设置中选择"始终信任"。

Linux系统的证书安装因发行版而异。Debian/Ubuntu系统需要将证书复制到 /usr/local/share/ca-certificates/ 目录下并执行update-ca-certificates命令。CentOS/RHEL系统需要将证书复制到 /etc/pki/ca-trust/source/anchors/ 目录下并执行update-ca-trust命令。

### 8.3.3 移动端证书安装

移动端证书安装是App爬虫的关键一步，也是最容易踩坑的环节。

Android系统的证书安装流程：首先确保手机和电脑连接同一个WiFi网络。假设电脑的局域网IP是192.168.1.100，在电脑上启动mitmdump监听8080端口。然后在Android手机的WiFi设置中，长按已连接的WiFi网络，选择"修改网络"，在高级选项中设置代理为手动模式，服务器主机名填192.168.1.100，端口填8080。保存后打开手机浏览器访问 mitm.it，如果代理配置正确，会看到一个证书下载页面。点击Android图标下载证书，然后进入系统设置的安全选项，选择"从存储设备安装证书"，选择下载的证书文件进行安装。

iOS系统的证书安装流程：同样设置WiFi代理后，使用Safari浏览器访问 mitm.it 下载iOS证书。下载后进入设置，点击"已下载描述文件"进行安装。安装完成后还需要一个额外步骤：进入设置 → 通用 → 关于本机 → 证书信任设置，开启对mitmproxy证书的完全信任。这个步骤很多人会遗漏，导致证书安装了但抓包仍然失败。

> iOS的"证书信任设置"是最容易被忽略的一步。很多人卡在这里，明明证书装了却抓不到包。

### 8.3.4 Android 7+的证书信任问题

从Android 7（Nougat）开始，Android系统不再信任用户安装的CA证书用于App的HTTPS通信，只信任系统证书库中的CA证书。这意味着即使你安装了MitmProxy的CA证书，浏览器可以正常抓包，但大多数App的HTTPS请求仍然无法被解密。

解决这个问题的方案有三种：

方案一是Root设备后将证书安装到系统证书目录。这种方式最彻底，但需要Root权限。具体操作是将MitmProxy的CA证书转换为Android系统证书格式，计算证书的hash值作为文件名，然后通过adb推送到 /system/etc/security/cacerts/ 目录下。

```bash
# 转换证书格式并计算hash
openssl x509 -inform PEM -outform DER \
    -in ~/.mitmproxy/mitmproxy-ca-cert.pem \
    -out mitmproxy-ca-cert.der

# 计算证书hash（用作文件名）
hash=$(openssl x509 -inform PEM -subject_hash_old \
    -in ~/.mitmproxy/mitmproxy-ca-cert.pem | head -1)
cp mitmproxy-ca-cert.der "${hash}.0"

# 推送到设备（需要Root）
adb push "${hash}.0" /sdcard/
adb shell "su -c 'mount -o remount,rw /system && \
    cp /sdcard/${hash}.0 /system/etc/security/cacerts/ && \
    chmod 644 /system/etc/security/cacerts/${hash}.0 && reboot'"
```

方案二是修改目标App的network_security_config.xml文件，允许App信任用户安装的CA证书。这需要反编译App，修改配置后重新打包。适用于目标App可以重新打包的场景。

方案三是使用Frida或VirtualXposed等Hook框架，在运行时绕过证书校验（SSL Pinning）。这种方式不需要修改App本身，但需要额外的工具支持和一定的逆向能力。Frida的工作原理是在App运行时注入JavaScript代码，Hook掉负责证书校验的函数，使其直接返回通过。这种方式适用于无法Root设备或App使用了强校验的场景。我们在后续章节会详细讲解Frida的使用方法。

在实际项目中，我建议先尝试方案一，因为最简单直接。如果设备无法Root，再考虑方案三。方案二需要反编译和重新打包App，过程比较复杂，而且修改后的App可能无法正常签名，导致无法安装。

### 8.3.5 Python代码中信任证书

在Python爬虫代码中使用MitmProxy代理时，需要指定CA证书路径才能正常访问HTTPS网站。使用requests库的示例：

```python
import requests
import os

cert_path = os.path.expanduser("~/.mitmproxy/mitmproxy-ca-cert.pem")
proxies = {"http": "http://127.0.0.1:8080", "https": "http://127.0.0.1:8080"}

response = requests.get(
    "https://api.example.com/data",
    proxies=proxies,
    verify=cert_path
)
print(response.json())
```

这里verify参数指定了MitmProxy的CA证书路径，让requests信任由MitmProxy签发的证书。如果不设置这个参数，requests会报SSL证书验证错误。

对于使用httpx、aiohttp等异步HTTP库的场景，配置方式类似，都是在SSL上下文中加载MitmProxy的CA证书。如果使用urllib3或ssl模块直接操作，则需要创建SSLContext对象并加载CA证书文件。核心思路都是一样的：让HTTP客户端信任MitmProxy的CA证书。

有时候你可能会遇到一种特殊情况：目标服务器使用了自签名证书或者证书链不完整。这种情况下，你可以在requests中设置 verify=False 来跳过证书验证。但这会带来安全风险，仅在调试环境中使用。在生产环境中，应该正确配置证书验证。

还有一个常见的问题是代理链。有时候你可能需要同时使用MitmProxy和上游代理（比如企业VPN代理）。MitmProxy支持通过 --mode upstream 参数设置上游代理，这样可以实现代理链。请求会先经过MitmProxy处理，然后转发到上游代理，最后到达目标服务器。

在实际爬虫项目中，我通常会写一个统一的请求工具类，内置代理和证书配置，这样在开发和调试时可以随时切换是否走代理。这种做法在实际工作中非常方便，推荐大家采用。

## 8.4 服务启动与流量捕获

证书配置完成后，我们来启动MitmProxy并捕获流量。

### 8.4.1 三种启动方式

MitmProxy提供三种启动方式，各有特点：

mitmproxy是交互式命令行界面，启动后进入一个全屏的终端界面，可以实时查看所有经过代理的请求。支持键盘快捷键操作，比如按f进入过滤模式，按Enter查看请求详情，按r重放请求。适合开发调试阶段使用。

mitmdump是纯命令行模式，没有交互界面，所有输出通过print或logging打印到终端。最重要的特性是支持通过 -s 参数加载Python脚本，实现自动化流量处理。这是爬虫工程师最常用的启动方式。

mitmweb是Web可视化界面，启动后会自动打开浏览器，提供一个类似Fiddler的图形界面。适合不熟悉命令行操作的场景，或者在团队演示时使用。

```bash
# 交互模式
mitmproxy -p 8080

# 脚本模式（爬虫最常用）
mitmdump -p 8080 -s script.py

# Web模式
mitmweb -p 8080 --web-port 8081
```

### 8.4.2 常用启动参数

MitmProxy支持丰富的命令行参数，掌握常用的参数能大幅提升效率。

```bash
# 指定监听地址和端口
mitmdump -b 0.0.0.0 -p 8080

# 忽略特定域名（不解密，直接透传）
mitmdump --ignore-hosts "google.com|facebook.com"

# 只处理特定域名
mitmdump --allow-hosts "api.example.com"

# 保存流量到文件
mitmdump -w traffic.mitm

# 从文件读取流量
mitmdump -nr traffic.mitm

# 设置上游代理（代理链）
mitmdump --mode upstream:http://upstream:8081

# 禁用HTTP/2
mitmdump --set http2=false
```

其中 --ignore-hosts 和 --allow-hosts 是非常实用的参数。在抓包时，如果不加过滤，所有流量都会经过MitmProxy，包括各种广告、统计、推送等无关请求。使用 --allow-hosts 可以只解密目标域名的流量，大大减少干扰。

> 学会用参数过滤流量，是提升抓包效率的第一步。不要在流量海洋里捞针，要先把海洋缩小成池塘。

### 8.4.3 流量捕获实战

下面是一个实用的流量记录脚本，它会自动记录所有API请求的关键信息，并保存到JSONL格式的文件中：

```python
# traffic_logger.py
from mitmproxy import http
import json
from datetime import datetime

class TrafficLogger:
    def __init__(self):
        self.count = 0
        self.file = open("traffic.jsonl", "a", encoding="utf-8")

    def response(self, flow: http.HTTPFlow) -> None:
        # 跳过静态资源
        url = flow.request.url
        if any(url.endswith(ext) for ext in [".js", ".css", ".png", ".ico"]):
            return
        
        self.count += 1
        record = {
            "time": datetime.now().isoformat(),
            "method": flow.request.method,
            "url": flow.request.url,
            "status": flow.response.status_code,
            "size": len(flow.response.content),
            "content_type": flow.response.headers.get("Content-Type", "")
        }
        self.file.write(json.dumps(record, ensure_ascii=False) + "\n")
        self.file.flush()

        if self.count % 50 == 0:
            print(f"[{self.count}] {flow.request.method} {url[:80]}")

addons = [TrafficLogger()]
```

运行方式：`mitmdump -p 8080 -s traffic_logger.py`。脚本会过滤掉静态资源，只记录API请求，并实时输出捕获进度。

### 8.4.4 Web界面的使用

mitmweb提供了一个友好的Web界面。启动后浏览器会自动打开 http://127.0.0.1:8081 ，界面左侧是流量列表，右侧是请求详情。

Web界面支持实时查看流量、过滤搜索、查看请求和响应的详细信息、重放请求、导出HAR文件等功能。对于初学者来说，使用mitmweb可以更直观地理解抓包过程。

需要注意的是，mitmweb默认监听127.0.0.1:8081，如果需要从其他设备访问，需要使用 --web-host 0.0.0.0 参数。但这样会让Web界面暴露在局域网中，存在安全风险，建议仅在可信网络中使用。

在实际使用中，我推荐的开发流程是这样的：先用mitmweb可视化界面快速浏览流量，找到目标API的大致特征。然后用mitmdump配合Python脚本进行精确过滤和自动化处理。可视化界面适合探索阶段，脚本模式适合稳定运行阶段。两者配合使用，效率最高。

> 不要执着于某一种启动方式。不同阶段用不同工具，探索用Web界面，自动化用脚本，这是最合理的工作流。

## 8.5 请求深度解析：Header/Body/Cookie结构拆解

捕获到流量后，深入解析请求结构是找到爬虫入口的关键。

### 8.5.1 HTTP请求结构总览

一个完整的HTTP请求由请求行、请求头和请求体三部分组成。请求行包含方法、URL和协议版本；请求头包含各种元数据信息；请求体是可选的，包含实际发送的数据。

在App爬虫场景中，最需要关注的请求头字段包括：User-Agent标识客户端类型，很多App会校验这个字段；Authorization携带认证令牌；Cookie包含会话信息；X-Token、X-Sign等自定义头部通常携带签名或加密参数。

> Header是爬虫的伪装面具，Cookie是身份的通行证。搞懂这两样东西，你就搞懂了App认证的半壁江山。

### 8.5.2 关键Headers分析

下面的脚本展示了如何自动分析请求中的关键Headers：

```python
from mitmproxy import http

def request(flow: http.HTTPFlow) -> None:
    headers = flow.request.headers
    
    # 重点关注的安全相关Headers
    security_headers = {
        "Authorization": "认证令牌",
        "X-Token": "自定义Token",
        "X-Sign": "请求签名",
        "X-Signature": "签名值",
        "X-Timestamp": "时间戳",
        "X-Nonce": "随机数",
        "X-Device-Id": "设备标识",
        "X-App-Version": "应用版本"
    }
    
    for name, desc in security_headers.items():
        value = headers.get(name)
        if value:
            print(f"[{desc}] {name}: {value[:60]}")
```

在实际项目中，我建议先让MitmProxy跑一段时间，收集所有请求的Headers，然后分析哪些参数是变化的、哪些是固定的、哪些是签名的。这能帮助你理解App的认证机制。

特别要注意那些值看起来像乱码的头部字段，比如X-Sign、X-Signature、X-Verify等。这些通常是App对请求参数进行签名后的结果。签名算法可能涉及HMAC、AES、RSA等加密方式。你需要在后续的逆向分析中找到签名算法的实现逻辑，然后在你的爬虫代码中复现这个签名过程。

还有一种常见的情况是，App会在请求头中携带设备信息，比如设备型号、系统版本、应用版本、屏幕分辨率等。这些信息通常用于服务端的反爬策略，比如检测异常设备。在构建爬虫请求时，需要尽量模拟真实的设备信息，避免被识别为爬虫。

### 8.5.3 Cookie结构解析

Cookie通常包含会话信息和身份认证。下面的代码展示了如何解析Cookie并分析其结构：

```python
from mitmproxy import http

def request(flow: http.HTTPFlow) -> None:
    cookie_str = flow.request.headers.get("Cookie", "")
    if not cookie_str:
        return
    
    cookies = {}
    for item in cookie_str.split(";"):
        item = item.strip()
        if "=" in item:
            key, value = item.split("=", 1)
            cookies[key.strip()] = value.strip()
    
    print(f"\nURL: {flow.request.url}")
    print(f"Cookie数量: {len(cookies)}")
    for key, value in cookies.items():
        print(f"  {key} = {value[:40]}{'...' if len(value) > 40 else ''}")
```

常见的Cookie参数包括：session_id或JSESSIONID是服务端会话标识；token或access_token是认证令牌；uid或user_id是用户标识；device_id是设备唯一标识；timestamp是时间戳用于防重放攻击；sign或signature是签名值用于防篡改。

在分析Cookie时，我通常会关注以下几个问题。首先是Cookie的有效期，有些Cookie是一次性的，用过就失效；有些可以长期使用。其次是Cookie的作用范围，有些Cookie只在特定域名下有效。最后是Cookie的生成来源，有些Cookie是服务器设置的，有些是客户端生成的。搞清楚这些问题，你才能知道如何在爬虫中维护Cookie状态。

有一种常见的错误做法是把Cookie写死在爬虫代码里。这样做的问题是Cookie会过期，一旦过期爬虫就会失效。正确的做法是实现Cookie池或定期刷新机制。你可以通过MitmProxy监控Cookie的变化，一旦发现Cookie即将过期或已经过期，就自动触发刷新流程。

> Cookie是爬虫的生命线，维护不好Cookie，爬虫就是一次性的。学会分析和管理Cookie，是爬虫工程师的必备技能。

### 8.5.4 请求体格式分析

请求体常见三种格式，需要根据Content-Type来选择解析方式。

JSON格式是最常见的API请求体格式。解析时需要读取Content-Type头部确认是application/json，然后用json.loads解析。解析后可以查看请求参数的结构，找出哪些参数是固定的、哪些是动态生成的。

表单格式（application/x-www-form-urlencoded）是传统的HTML表单提交格式，参数以key=value的形式用&连接。在App中也比较常见，特别是登录、注册等接口。

Multipart格式用于文件上传，包含boundary分隔符。解析比较复杂，需要根据boundary分割请求体。在App爬虫中，遇到文件上传接口的概率不高，但如果遇到，可以通过MitmProxy捕获完整的上传请求，包括文件名、文件类型、文件内容等信息。

在实际分析请求体时，我有一个建议：先不要急着解析，先观察。观察请求体的大小、格式、变化规律。比如同一个接口多次调用时，哪些参数变了、哪些没变。变了的参数是时间戳还是随机数、是用户输入还是算法生成。这些观察会为你后续的逆向分析提供重要线索。

> 请求体的分析是一个从观察到验证的过程。先看懂，再复现，最后才能构造。跳过观察直接构造，就是在浪费时间。

Multipart格式用于文件上传，包含boundary分隔符。解析比较复杂，需要根据boundary分割请求体。

```python
from mitmproxy import http
import json
from urllib.parse import parse_qs

def request(flow: http.HTTPFlow) -> None:
    if not flow.request.content:
        return
    
    content_type = flow.request.headers.get("Content-Type", "")
    
    if "application/json" in content_type:
        try:
            body = json.loads(flow.request.text)
            print("JSON请求体:", json.dumps(body, indent=2, ensure_ascii=False)[:200])
        except json.JSONDecodeError:
            print("JSON解析失败")
    
    elif "urlencoded" in content_type:
        params = parse_qs(flow.request.text)
        print("表单参数:")
        for key, values in params.items():
            print(f"  {key}: {values[0][:50]}")
    
    elif "multipart" in content_type:
        print("Multipart请求，大小:", len(flow.request.content), "字节")
```

## 8.6 请求篡改与响应模拟

MitmProxy最强大的功能之一是可以动态修改请求和响应，这在爬虫调试中非常有用。

### 8.6.1 修改请求参数

通过在request Hook中修改flow.request对象，可以篡改任何请求参数。常见的使用场景包括修改User-Agent伪装身份、修改请求参数测试不同输入、添加或删除Header字段、修改POST请求体等。

```python
from mitmproxy import http
import json

def request(flow: http.HTTPFlow) -> None:
    req = flow.request
    
    # 修改User-Agent
    req.headers["User-Agent"] = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36"
    
    # 修改URL查询参数
    if "page=1" in req.url:
        req.url = req.url.replace("page=1", "page=5")
    
    # 修改JSON请求体
    if "application/json" in req.headers.get("Content-Type", ""):
        try:
            body = json.loads(req.text)
            body["source"] = "modified"
            req.content = json.dumps(body).encode()
        except:
            pass
```

> 修改请求是爬虫调试的利器。你可以不改代码，只在代理层修改参数，快速验证哪些参数是关键参数。

### 8.6.2 修改响应内容

在response Hook中修改flow.response对象，可以篡改服务器返回的数据。这在测试爬虫逻辑时非常有用，比如模拟不同的响应数据、移除响应中的广告、修改分页信息等。

```python
def response(flow: http.HTTPFlow) -> None:
    resp = flow.response
    content_type = resp.headers.get("Content-Type", "")
    
    if "application/json" not in content_type:
        return
    
    try:
        data = json.loads(resp.text)
        
        # 移除广告数据
        data.pop("ads", None)
        data.pop("promotion", None)
        
        # 修改分页信息（获取更多数据）
        if "total" in data:
            data["total"] = 9999
        
        resp.content = json.dumps(data, ensure_ascii=False).encode()
    except:
        pass
```

### 8.6.3 模拟响应（Mock）

MitmProxy可以直接拦截请求并返回自定义响应，不需要转发到真实服务器。这在开发阶段测试爬虫逻辑时非常方便。

```python
from mitmproxy import http

def request(flow: http.HTTPFlow) -> None:
    if flow.request.path == "/api/test":
        import json
        mock_data = {"code": 200, "data": {"id": 1, "name": "Mock"}}
        flow.response = http.Response.make(
            status_code=200,
            content=json.dumps(mock_data).encode(),
            headers={"Content-Type": "application/json"}
        )
```

这种方式不需要连接真实服务器，响应完全由你控制。适合测试爬虫对各种响应格式的处理能力。

在实际开发中，Mock响应功能的用途非常广泛。比如你正在开发爬虫但目标App的接口还没有上线，你可以用Mock功能模拟接口响应来开发爬虫逻辑。又比如你想测试爬虫对异常情况的处理能力，可以Mock返回各种错误码和异常格式的响应。

Mock功能在团队协作中也很有用。你可以把一组API的响应Mock数据保存在文件中，团队成员都可以用这些Mock数据进行开发和测试，不需要每个人都配置抓包环境。这大大降低了团队协作的沟通成本。

### 8.6.4 请求重定向

将请求重定向到其他服务器，比如将生产环境的请求重定向到测试环境：

```python
def request(flow: http.HTTPFlow) -> None:
    if "api.prod.com" in flow.request.pretty_host:
        flow.request.host = "api.test.com"
        flow.request.port = 8080
        flow.request.scheme = "http"
```

这个功能在开发阶段非常有用。你可以在测试环境调试爬虫逻辑，同时访问生产环境的真实数据接口。

请求篡改功能在实际爬虫开发中有着广泛的应用场景。比如你在分析一个分页接口时，想要知道一共有多少页。你可以通过修改请求中的page参数，快速测试不同的分页值。又比如你在研究排序逻辑时，可以通过修改sort参数来观察不同的排序结果。这些操作都不需要修改App代码，只需要在MitmProxy脚本中修改即可。

> 修改请求是爬虫调试的利器。你可以不改代码，只在代理层修改参数，快速验证哪些参数是关键参数。这种非侵入式的调试方式，能大幅提升你的工作效率。

## 8.7 流量筛选与检索

当流量量大时，快速找到目标请求非常重要。MitmProxy提供了多种筛选方式。

### 8.7.1 交互式过滤器语法

在mitmproxy或mitmweb界面中，可以使用过滤表达式来筛选流量。过滤表达式使用特定的语法规则，支持多种匹配条件。

过滤表达式是MitmProxy最实用的功能之一。当你面对成百上千条请求时，肉眼搜索几乎是不可能的。学会用过滤器，就像在一座图书馆里拥有了索引系统。

过滤表达式的语法非常灵活。你可以用 ~d 来匹配域名，比如 ~d api.example.com 会只显示域名包含api.example.com的请求。你可以用 ~m 来匹配HTTP方法，比如 ~m POST 只显示POST请求。你可以用 ~c 来匹配状态码，比如 ~c 200 只显示状态码为200的请求。

这些过滤条件可以用逻辑运算符组合。& 表示与，| 表示或。比如 ~d api.example.com & ~m POST & ~c 200 表示筛选域名包含api.example.com、方法为POST、状态码为200的请求。

常用的过滤表达式包括：~d 匹配域名，~m 匹配HTTP方法，~c 匹配状态码，~u 匹配URL，~h 匹配请求头，~b 匹配请求体。这些条件可以用 & 和 | 进行组合。

| 表达式 | 含义 | 示例 |
|--------|------|------|
| ~d | 域名匹配 | ~d api.example.com |
| ~m | 方法匹配 | ~m POST |
| ~c | 状态码匹配 | ~c 200 |
| ~u | URL包含 | ~u login |
| ~h | 头部匹配 | ~h "Content-Type: json" |
| ~b | 体包含 | ~b token |

组合使用示例：~d api.example.com & ~m POST & ~c 200，表示筛选域名包含api.example.com、方法为POST、状态码为200的请求。

> 过滤器是流量海洋中的指南针。不要试图在数千条请求中肉眼搜索，学会用过滤器快速定位。

### 8.7.2 脚本中的流量过滤

在mitmdump脚本中，可以通过编写逻辑来过滤流量。相比命令行过滤器，脚本过滤更加灵活，可以实现复杂的过滤条件。

```python
from mitmproxy import http
import re

class SmartFilter:
    def __init__(self):
        # 目标域名模式
        self.host_pattern = re.compile(r"api\.example\.com")
        # 需要跳过的路径模式
        self.skip_patterns = [
            re.compile(r"/static/"),
            re.compile(r"\.(js|css|png|jpg|gif|ico)$"),
            re.compile(r"/track|/beacon|/log"),
        ]
    
    def should_capture(self, flow: http.HTTPFlow) -> bool:
        url = flow.request.url.lower()
        
        # 检查域名
        if not self.host_pattern.search(url):
            return False
        
        # 检查是否需要跳过
        for pattern in self.skip_patterns:
            if pattern.search(url):
                return False
        
        return True
    
    def response(self, flow: http.HTTPFlow) -> None:
        if self.should_capture(flow):
            print(f"捕获: {flow.request.method} {flow.request.url}")

addons = [SmartFilter()]
```

### 8.7.3 离线流量搜索

MitmProxy支持将流量保存到文件后进行离线搜索分析。这在需要反复分析历史流量时非常有用。

```bash
# 保存流量到文件
mitmdump -p 8080 -w traffic.mitm

# 从文件读取并使用脚本分析
mitmdump -nr traffic.mitm -s analyze.py
```

-nr参数表示读取流量文件但不启动代理服务器，-s指定分析脚本。在分析脚本中，所有Hook函数正常工作，可以对历史流量进行任何处理。

### 8.7.4 批量导出结构化数据

将筛选后的流量导出为结构化数据，方便后续分析：

```python
from mitmproxy import http
import json

class TrafficExporter:
    def __init__(self):
        self.records = []
    
    def response(self, flow: http.HTTPFlow) -> None:
        content_type = flow.response.headers.get("Content-Type", "")
        if "application/json" not in content_type:
            return
        
        self.records.append({
            "url": flow.request.url,
            "method": flow.request.method,
            "status": flow.response.status_code,
            "size": len(flow.response.content),
            "body": flow.response.text[:1000]
        })
    
    def done(self):
        with open("export.json", "w", encoding="utf-8") as f:
            json.dump(self.records, f, ensure_ascii=False, indent=2)
        print(f"导出完成: {len(self.records)} 条记录")

addons = [TrafficExporter()]
```

done()方法在MitmProxy关闭时被调用，用于执行清理和收尾工作。在这个方法中，我们将收集到的所有记录写入文件。这种模式非常适合长时间运行的抓包任务：在运行过程中不断收集数据到内存，在退出时统一写入文件。

在实际项目中，我通常会将MitmProxy的流量导出与后续的数据分析流程打通。比如把导出的JSON文件作为ETL（Extract-Transform-Load，提取-转换-加载）流程的输入，进一步清洗和结构化数据，最终存入数据库供爬虫使用。这种从抓包到入库的完整自动化流程，是MitmProxy相比其他抓包工具最大的优势。

> 不要把MitmProxy只当作抓包工具来用。它是你的数据处理管道的第一个环节，把抓包、分析、存储串起来，才是MitmProxy的正确打开方式。

## 8.8 流量阻断与请求重放

### 8.8.1 流量阻断

在某些场景下，我们需要阻止特定请求到达服务器。比如阻止广告请求和统计追踪请求，让API流量更加清晰。或者阻止App的版本检查请求，防止App自动更新。

```python
from mitmproxy import http

def request(flow: http.HTTPFlow) -> None:
    req = flow.request
    
    # 阻断广告和追踪请求
    block_domains = [
        "ad.doubleclick.net",
        "analytics.google.com",
        "log.example.com",
        "track.example.com"
    ]
    
    for domain in block_domains:
        if domain in req.pretty_host:
            flow.response = http.Response.make(204)
            print(f"已阻断: {req.url}")
            return
    
    # 阻断特定路径
    if any(path in req.path for path in ["/track", "/beacon", "/report"]):
        flow.response = http.Response.make(204)
```

通过设置flow.response，请求不会转发到真实服务器，客户端会直接收到我们构造的响应。204状态码表示No Content，客户端通常会静默处理。

流量阻断功能看似简单，实际上非常实用。比如某些App在启动时会发送大量的统计和推送请求，这些请求会干扰你对目标API的分析。使用阻断功能过滤掉这些无关请求，可以让API流量更加清晰。

另一个应用场景是模拟错误响应。比如你想测试爬虫在遇到网络错误、超时、500错误等情况下的处理能力。你可以通过阻断功能直接返回错误响应，而不需要真正让服务器返回错误。这种方式更可控，也更容易复现各种边界情况。

> 阻断不是目的，阻断是为了让有用的流量更清晰。善用阻断功能，你的抓包体验会提升很多。

### 8.8.2 请求重放

请求重放是将之前捕获的请求重新发送一次。这在调试接口时非常有用，可以反复测试同一个请求而不需要操作App。

在mitmproxy界面中，选中一个请求后按r键即可重放。在mitmweb中，点击请求详情中的Replay按钮。在mitmdump中，可以通过脚本实现自动重放。

```python
from mitmproxy import http, ctx
import asyncio

class AutoReplay:
    def __init__(self):
        self.replay_count = 0
    
    def response(self, flow: http.HTTPFlow) -> None:
        # 捕获特定请求后自动重放
        if "api.example.com/list" in flow.request.url:
            self.replay_count += 1
            if self.replay_count <= 3:
                ctx.log.info(f"自动重放第 {self.replay_count} 次")
                # 复制请求并修改参数
                replay_flow = flow.copy()
                replay_flow.request.url = flow.request.url.replace(
                    "page=1", f"page={self.replay_count + 1}"
                )
                # 启动重放
                ctx.master.commands.call(
                    "replay.client", [replay_flow]
                )

addons = [AutoReplay()]
```

### 8.8.3 流量录制与回放

MitmProxy支持将流量保存到文件后反复回放，这在接口分析和测试时非常有用。录制和回放的组合是调试接口的两板斧：先录制真实流量，再反复回放分析。这比每次都手动操作App高效得多。

流量文件的格式是MitmProxy自定义的.mitm格式，实际上是一个二进制序列化的Flow对象列表。你可以用MitmProxy提供的Python API来读取和解析这些文件，实现自定义的离线分析逻辑。比如你可以编写一个脚本，从流量文件中提取所有API请求，按照接口路径分组，生成一份接口文档。这在逆向分析App时非常有用。

```bash
# 录制流量
mitmdump -p 8080 -w recorded.mitm

# 回放流量（不连接真实服务器）
mitmdump -nr recorded.mitm -s analyze.py

# 从流量文件中提取所有请求的URL
mitmdump -nr recorded.mitm -s extract.py
```

提取脚本示例：

```python
from mitmproxy import http

def request(flow: http.HTTPFlow) -> None:
    print(f"{flow.request.method} {flow.request.url}")
    # 打印关键头部
    for key in ["Authorization", "X-Token", "X-Sign"]:
        value = flow.request.headers.get(key)
        if value:
            print(f"  {key}: {value[:50]}")
```

### 8.8.4 错误重试机制

在抓包过程中，网络不稳定可能导致请求失败。可以编写自动重试机制来处理这种情况：

```python
from mitmproxy import http, ctx

class RetryHandler:
    def __init__(self):
        self.max_retries = 3
        self.retry_counts = {}
    
    def error(self, flow: http.HTTPFlow) -> None:
        url = flow.request.url
        count = self.retry_counts.get(url, 0)
        
        if count < self.max_retries:
            self.retry_counts[url] = count + 1
            ctx.log.info(f"请求失败，重试 {count + 1}/{self.max_retries}: {url}")
        else:
            ctx.log.error(f"重试次数用完: {url}")
            self.retry_counts.pop(url, None)

addons = [RetryHandler()]
```

> 录制和回放是调试的两板斧：先录制真实流量，再反复回放分析。这比每次都手动操作App高效得多。

## 实战踩坑总结

在使用MitmProxy的过程中，有几个常见的坑需要特别注意。

第一个坑是证书不生效。症状是浏览器显示证书错误，App请求失败。根本原因是CA证书没有正确安装到系统信任库中。解决方案是仔细检查证书安装步骤，确保操作系统或浏览器已经信任了MitmProxy的CA证书。Mac系统需要手动在钥匙串中设置"始终信任"，iOS需要在证书信任设置中额外开启。

第二个坑是Android 7+无法抓包。症状是浏览器可以抓包但App不行。这是Android系统的安全策略变更导致的。解决方案是将证书安装到系统证书目录（需要Root），或使用Frida等工具绕过SSL Pinning。

第三个坑是HTTP/2流量无法正常抓包。某些App使用HTTP/2协议，MitmProxy虽然支持HTTP/2但可能存在兼容性问题。可以通过 --set http2=false 参数禁用HTTP/2，强制使用HTTP/1.1。

第四个坑是WebSocket流量丢失。MitmProxy从2.0版本开始支持WebSocket，但需要确保使用的是最新版本。在脚本中通过websocketmessage Hook来处理WebSocket消息。

第五个坑是长连接导致流量不显示。某些API使用长连接（如SSE、长轮询），连接保持时间很长，流量不会立即出现在列表中。可以在mitmproxy界面中按e键查看正在进行的连接。

第六个坑是请求太慢导致超时。MitmProxy默认会等待服务器响应，如果服务器响应时间过长，可能会导致连接超时。你可以通过 --timeout 参数来调整超时时间，或者在脚本中使用异步处理来避免阻塞。

第七个坑是响应体太大被截断。某些API返回的数据量很大，比如返回了几十MB的JSON数据。MitmProxy默认会处理所有响应，但你可能需要在脚本中添加大小限制，避免内存溢出。可以检查 flow.response.content_length 来判断响应大小。

踩坑不可怕，可怕的是同一个坑踩两次。把每次踩坑的经验记录下来，你的抓包技能就会越来越强。建议大家养成写技术笔记的习惯，把遇到的坑和解决方案都记录下来，下次遇到类似问题就能快速解决。

> 踩坑不可怕，可怕的是同一个坑踩两次。把每次踩坑的经验记录下来，你的抓包技能就会越来越强。

## MitmProxy核心命令速查表

为了方便查阅，这里整理了MitmProxy最常用的命令和参数：

```bash
# 基础启动
mitmdump -p 8080                    # 启动代理，监听8080端口
mitmdump -p 8080 -s script.py       # 加载脚本启动
mitmweb -p 8080 --web-port 8081     # Web界面启动

# 流量控制
mitmdump -w traffic.mitm            # 保存流量到文件
mitmdump -nr traffic.mitm           # 读取流量文件
mitmdump --allow-hosts "api.com"    # 只处理特定域名
mitmdump --ignore-hosts "ad.com"    # 忽略特定域名
mitmdump --set http2=false          # 禁用HTTP/2

# 调试
mitmdump -v                         # 详细日志模式
mitmdump --flow-detail 3            # 显示详细流量信息
```

如果这篇文章对你有帮助，请收藏备用，遇到MitmProxy相关问题时可以随时查阅。我特意把常用的命令和参数整理成了速查表放在文章末尾，方便大家快速查阅。有任何问题欢迎在评论区讨论，我会尽量回复。也欢迎指出文章中的错误或不足，怕浪猫不是完人，但愿意不断改进。

下期预告：第9章我们将深入讲解移动端App的协议逆向，包括SSL Pinning绕过、加密参数分析、签名算法逆向等内容。从抓包到逆向，完成爬虫工程师的核心能力进阶。如果你觉得这一章的内容已经让你对MitmProxy有了清晰的认识，那么下一章将会带你进入更深层的世界——当App不只是简单地用HTTPS，而是加上了证书固定、参数加密、请求签名等多重保护时，我们该如何应对？敬请期待。

**系列进度 8/17**

怕浪猫说：抓包只是开始，逆向才是真正的战场。掌握了流量，就掌握了数据的命脉。这一章我们学会了用MitmProxy捕获和操控HTTP流量，下一章我们将进入更刺激的领域——App协议逆向，揭开加密参数背后的秘密。如果你觉得这个系列对你有帮助，点个关注不迷路，我们下章见！