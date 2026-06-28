# 破解加密登录的过程

> 爬虫工程师的成长路上，总会遇到一堵墙：登录接口的参数全是密文，明文参数一个都看不到。你盯着 Network 面板里那一串串乱码，怀疑人生。今天，怕浪猫就带你把这堵墙拆了。

我是怕浪猫，一个在反爬泥潭里摸爬滚打多年的工程师。之前我们聊了请求库、解析库、验证码识别，那些都是"明牌"打法。从这一章开始，我们进入"暗牌"领域——加密登录的逆向破解。

这篇文章会带你从加密基础出发，一步步掌握抓包逆向、突破反调试、JS 断点调试、JS 篡改伪装，最终用 Python 重构或直接调度 JS 来搞定加密登录。全程实战踩坑，代码管够。

## 4.1 加密基础

### 4.1.1 明文传输与密文传输

早期的网站登录，密码明文传输是常态。你在抓包工具里一眼就能看到 `password=123456` 这种裸奔参数。后来大家学乖了，前端用 HTTPS 加上传输层加密，但 HTTPS 保护的是传输链路，到了服务端还是会解密。于是前端加密成了一道额外防线——即使你抓到了包，看到的也是密文，没法直接重放或篡改。

明文传输和密文传输的核心区别，用一张图说清楚。明文传输时，浏览器直接把 `password=123456` 发给服务器，中间任何抓包工具都能看到原始密码。密文传输时，浏览器先通过 JS 加密函数把密码转成 `e10adc3949ba59abbe56e` 这样的密文，再发送给服务器。服务端收到后用对应的解密算法还原明文，再与数据库比对。

这中间的关键在于：加密逻辑在前端 JS 中完成，JS 代码是公开的——任何人都能在浏览器里看到。所以加密不是不可破的，它只是提高了逆向门槛。理解这一点，你就能以正确的心态面对加密登录。

> 加密不是目的，让你放弃逆向才是目的。但只要代码跑在浏览器里，就没有破解不了的加密。

### 4.1.2 常见加密算法速览

爬虫逆向中最常遇到的加密算法，怕浪猫给你整理成一张对比表。MD5 是哈希算法，不可逆，输出固定 128 位，常用于密码加密和签名校验。SHA 和 MD5 类似但更安全，SHA-256 输出 256 位，常见于 token 生成。AES 是对称加密，加解密用同一个密钥，速度快，适合加密大量数据，是爬虫逆向中最常遇到的对称加密算法。DES 也是对称加密，但密钥只有 56 位，安全性不如 AES，现在多见于老系统。RSA 是非对称加密，公钥加密私钥解密，公钥通常硬编码在前端 JS 中，常用于密码加密传输。

实际逆向时，MD5 和 AES 是最常见的组合拳：密码用 MD5 哈希一遍，然后把所有请求参数用 AES 加密打包。RSA 则常出现在一些大型网站的登录流程中——前端用公钥加密密码，服务端用私钥解密。有时候一个登录请求会同时用到三种算法，比如 RSA 加密密码、AES 加密整体参数、MD5 做签名校验，这种组合拳在实际逆向中非常常见。怕浪猫曾经遇到过一个极端案例：某金融网站的登录请求里，密码经过了 RSA 加密，然后和用户名、时间戳、设备指纹拼接后整体 AES 加密，最后再加一层 MD5 签名。逆向这种多层加密，关键是一层一层剥，从最外层签名开始，逐步往内层追踪。

MD5 在 Python 中实现非常简单：

```python
import hashlib

def md5_encrypt(text: str) -> str:
    """MD5哈希加密，支持加盐和多次迭代"""
    return hashlib.md5(text.encode('utf-8')).hexdigest()

# 实际场景：多次MD5 + 加盐
salt = "1a2b3c"
password = "123456"
encrypted = md5_encrypt(md5_encrypt(password) + salt)
```

AES 加解密用 `pycryptodome` 库，这里展示最常用的 ECB 模式：

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
import base64

def aes_encrypt(data: str, key: str) -> str:
    """AES-ECB模式加密，输出Base64"""
    cipher = AES.new(key.encode('utf-8'), AES.MODE_ECB)
    encrypted = cipher.encrypt(pad(data.encode('utf-8'), AES.block_size))
    return base64.b64encode(encrypted).decode('utf-8')
```

> 记住一个关键点：MD5 和 SHA 是不可逆的，你没法从密文还原明文。AES 和 DES 是可逆的，只要拿到密钥就能解密。RSA 的公钥通常硬编码在前端 JS 里，私钥在服务端。逆向时先搞清楚算法类型，再决定是"还原"还是"重放"。

### 4.1.3 Base64 编码不是加密

这是新手最容易踩的坑。Base64 长得像加密，但它只是编码——任何人都能解码，没有密钥概念。很多网站会用 Base64 做一层"伪装"，让你以为参数被加密了，其实只是换了个编码格式。

判断方法很简单：如果密文由大小写字母、数字、加号、斜线和等号组成，且长度是 4 的倍数，大概率是 Base64。如果结尾有一个或两个等号做填充，几乎可以确定就是 Base64。在 Python 中编码和解码各一行代码就能完成：

```python
import base64
# 编码
encoded = base64.b64encode("hello world".encode('utf-8'))
# 解码
decoded = base64.b64decode(encoded).decode('utf-8')
```

> 怕浪猫踩过的坑：有一次逆向一个网站，折腾了两小时找加密逻辑，最后发现所谓的"加密参数"就是 Base64 编码。先排除 Base64，再深入逆向，能省你很多时间。

## 4.2 抓包逆向分析 JS 代码

### 4.2.1 从抓包到逆向的完整链路

加密登录逆向的核心流程，怕浪猫总结为五步法。第一步抓包，打开 Chrome DevTools 的 Network 面板，触发登录请求，找到那个带着密文参数的请求。第二步搜索，在 JS 源码中搜索加密参数的字段名，定位加密函数。第三步断点，通过断点调试追踪加密逻辑的执行过程。第四步分析，理清加密算法、密钥来源和参数构造方式。第五步复现，用 Python 重构加密函数或直接调度 JS 代码。

实际操作中，第二步往往是最难的。加密函数可能被 Webpack 打包混淆过，函数名变成单字母变量，直接搜索字段名搜不到。这时候需要结合断点调试来反向追踪——先在 XHR 断点处暂停，再看 Call Stack 往回追溯，直到找到加密函数的入口。

### 4.2.2 Chrome 开发者工具一览

Chrome DevTools 是逆向工程师的主力武器。Network 面板用于抓包分析请求，定位加密参数所在的请求。Sources 面板是最核心的，你可以在这里看到所有加载的 JS 文件，全局搜索（Mac 下 `Cmd+Option+F`）可以搜索所有已加载的 JS 源码，是定位加密函数的第一步。Console 面板可以执行 JS 代码，用于验证加密函数和打印变量。Application 面板查看 Storage，分析 Cookie 和 LocalStorage 中的信息。

搜索技巧很关键。不要搜密文本身——每次请求密文都不同，搜了也搜不到。而要搜加密参数的"字段名"。比如参数叫 `enc_password`，就搜 `enc_password` 或 `encPassword`。如果字段名也被混淆了，就搜常见加密库的特征关键词，比如 `CryptoJS`、`JSEncrypt`、`md5`、`AES`。这些库名在混淆代码中通常会保留，因为它们是外部依赖。另一个搜索技巧是搜加密结果的特征字符串。比如你发现密文是 Base64 格式且以特定前缀开头，可以搜这个前缀。如果密文长度固定为 32 位十六进制字符串，那很可能是 MD5，可以直接搜 `md5` 或 `hex`。怕浪猫的经验是：先搜字段名，再搜库名，最后搜特征字符串，三级搜索递进，基本都能定位到加密函数。

### 4.2.3 抓包工具横评

Chrome DevTools 能搞定大部分场景，但有些时候你需要更强大的工具。怕浪猫给你对比一下四大主流抓包工具。

Chrome DevTools 的优势是零安装、JS 调试一体化，但只能抓浏览器流量，移动端抓包不方便。Fiddler 功能全面、插件丰富，Windows 下体验最佳，但跨平台支持一般。Charles 对 macOS 用户友好，Map Local 功能做 JS 替换很方便，但是付费软件。mitmproxy 支持 Python 脚本可编程，适合自动化抓包和批量处理，但需要命令行基础。

> 工具没有最好的，只有最适合的。怕浪猫的工作流是：Chrome DevTools 做逆向调试，mitmproxy 做自动化批量抓包，Charles 做 JS 文件本地映射替换。三个工具配合，覆盖 99% 的场景。

补充一个 mitmproxy 的进阶用法：它的 addons 机制支持在请求或响应阶段修改内容。比如你可以在 response 阶段把 JS 文件中的某个字符串替换掉，这样浏览器加载的就是修改后的版本，无需配置 Map Local。这个方案比 Map Local 更灵活，因为你可以在 Python 代码中根据请求 URL 动态决定要替换什么内容，特别适合同时逆向多个网站的场景。

mitmproxy 的一个实用技巧——用 Python 脚本自动拦截和修改请求：

```python
from mitmproxy import http

def request(flow: http.HTTPFlow):
    # 拦截登录请求，打印加密参数
    if "login" in flow.request.url:
        for key, value in flow.request.urlencoded_form.items():
            print(f"  {key}: {value}")

def response(flow: http.HTTPFlow):
    if "login" in flow.request.url:
        print(f"Status: {flow.response.status_code}")
```

启动命令是 `mitmdump -s script.py`，然后浏览器配置代理到本地 8080 端口即可。这个方案的好处是你可以写复杂的拦截逻辑——比如自动提取加密参数、自动重放请求、自动对比不同输入的加密结果。

## 4.3 突破无限 Debugger

### 4.3.1 无限 Debugger 是什么

当你打开 Chrome DevTools 准备调试时，页面突然不停地弹出 debugger 断点，关都关不掉，页面卡死。这就是"无限 Debugger"反调试技术。

原理很简单——网站在 JS 代码中插入大量 `debugger` 语句，配合定时器或循环，让调试器陷入无限中断。最简单的实现是用 `setInterval` 每隔 100 毫秒触发一次 `debugger`。进阶版用 `Function` 构造函数动态生成 `debugger` 语句，避免在源码中被直接搜索到。更高级的实现会检测 DevTools 是否打开——通过测量 `debugger` 语句的执行时间来判断，如果执行时间超过阈值，说明 DevTools 处于打开状态，就跳转到空白页面。

> 反调试的本质是心理战。它不怕你破解，它怕你耐心够长。但怕浪猫告诉你，突破无限 Debugger 只需要三个技巧。

### 4.3.2 突破方法一：条件断点禁用

在 Sources 面板中，找到产生 debugger 的那行代码，右键行号，选择 "Never pause here"。这样 Chrome 会自动跳过这个断点，不影响其他代码的执行。

如果 debugger 是通过 Function 构造函数动态生成的，你需要在 Sources 面板中仔细排查。更彻底的做法是直接在行号上右键添加条件断点，条件设为 `false`。这样断点虽然存在但永远不会触发，等于变相禁用了 debugger 语句。操作路径是：Sources 面板，找到 debugger 语句所在行，右键行号，选择 Add conditional breakpoint，输入 false，回车。

### 4.3.3 突破方法二：函数重写覆盖

在 Console 中直接重写生成 debugger 的载体函数。由于 debugger 是关键字不能直接重写，但可以通过覆盖 Function 构造函数来拦截所有通过它动态生成的 debugger 语句：

```javascript
// 覆盖Function构造函数，过滤debugger
var _Function = Function;
Function = function() {
    var args = Array.from(arguments);
    var lastArg = args[args.length - 1];
    if (typeof lastArg === 'string' && lastArg.includes('debugger')) {
        return function() {};
    }
    return _Function.apply(this, args);
};
Function.prototype = _Function.prototype;
```

在页面加载前执行这段代码，就能拦截所有通过 Function 构造函数生成的 debugger 语句。配合 Tampermonkey 的 `@run-at document-start` 指令，可以在页面 JS 执行前注入。这个方法对大多数无限 Debugger 场景都有效，但有些网站会检测 Function 是否被篡改，需要更深入的处理。

### 4.3.4 突破方法三：中间人替换

用 Charles 或 Fiddler 的 Map Local 功能，把含有无限 Debugger 的 JS 文件替换成本地去掉 debugger 语句的版本。这种方法最彻底——你完全控制了执行的 JS 代码，想删什么删什么。但需要抓包工具配合，并且要处理 HTTPS 证书问题。

具体操作是：先通过抓包找到包含 debugger 语句的 JS 文件，下载到本地，删掉或注释掉 debugger 相关代码，然后在 Charles 中配置 Map Local 规则，把这个 JS 文件的请求映射到本地修改后的版本。

> 三种方法的取舍：偶尔遇到一两个 debugger 用方法一最快；频繁触发用方法二一劳永逸；JS 混淆严重、找不到 debugger 来源时，方法三最稳。怕浪猫建议先试方法一，不行再升级。

## 4.4 JS 断点调试与堆栈分析

### 4.4.1 添加断点的正确姿势

突破了无限 Debugger，接下来就是正式的断点调试。在 Chrome DevTools 的 Sources 面板中，点击行号就能添加一个行断点（Breakpoint）。但实际逆向中，光会加行断点不够，你得知道什么时候用哪种断点。不同的断点类型适用于不同的调试场景，选对了断点能让逆向效率翻倍。

### 4.4.2 四种断点类型详解

行断点是最基础的，代码执行到该行时暂停。适用于你已经知道加密函数在哪个文件哪一行的情况，直接下断点等它触发。条件断点在表达式为 true 时才暂停，适合在循环中只关心特定条件的场景——比如循环处理字符数组，你只想看第 100 个字符的处理过程，就设条件为 `i === 100`。

DOM 断点在 DOM 节点变化时暂停，适合加密结果被写入页面元素的场景。比如某些网站会把加密后的 token 写入隐藏的 input，你可以在这个 input 上加 DOM 断点，追踪写入操作的调用链。DOM 断点有三种子类型：subtree modifications（子树变化）、attribute modifications（属性变化）、node removal（节点移除）。逆向加密时最常用的是 attribute modifications，因为加密结果通常通过设置 input 的 value 属性来写入。XHR 断点是逆向利器——在 Sources 面板右侧的 XHR/fetch Breakpoints 中添加 URL 关键词（比如 `login`），当请求 URL 包含该关键词时，代码会自动暂停在发送请求的位置。此时看 Call Stack 往回追溯，就能找到调用发送请求的加密函数。XHR 断点的优势在于你不需要知道加密函数在哪个文件里，只需要知道请求的 URL 特征，就能从请求发出的那一刻反向追踪整个加密链路。

> 断点不是越多越好。怕浪猫见过新手在十几个地方同时下断点，结果代码跑一步停一次，调试效率极低。精准下一两个断点，配合 Call Stack 分析，才是高效逆向的正确姿势。

还有一个调试技巧值得分享：善用 Watch 面板。你可以在 Watch 中添加任意表达式，比如 `data`、`key`、`encrypted`，然后每到一个断点，这些表达式的值就会自动更新。这个功能比在 Console 中反复打印变量更方便——特别是当你需要在多个断点间跳转、观察某个变量在不同阶段的变化时，Watch 面板一目了然。另外，Scope 面板中的变量可以直接双击修改值，这是个隐藏技巧——你可以实时修改加密参数看效果，而不用反复改 JS 代码重试。

### 4.4.3 Call Stack 调用栈分析

断点触发后，右侧面板的 Call Stack 会显示完整的函数调用链。从上到下是调用顺序，最上面是当前函数，往下是调用它的父函数，一路追溯到入口。

Call Stack 中还有一个实用功能：右键点击任意栈帧，选择 Restart frame 可以回到那个函数调用的入口重新执行该函数。这样你就可以在某个中间步骤修改参数后，从那一步重新跑一遍，不用从头开始重新触发断点。另外，如果 Call Stack 中某个函数名显示为 anonymous function，说明这是一个匿名函数，你需要在该函数内部下断点来查看具体是哪个地方调用的它。在 Webpack 打包的代码中，匿名函数非常常见，这时候可以结合 Scope 面板中的变量值来推断函数的实际用途。

举个例子，假设你在加密函数处下断点，触发后 Call Stack 可能显示：最顶层是 `encryptPassword`（当前停在这里），往下是 `formatParams`（调用加密函数的函数），再往下是 `handleLogin`（登录处理函数），最底层是 `onclick`（点击事件触发）。

通过 Call Stack，你能看到加密函数是被谁调用的、参数从哪里传过来的。点击 Call Stack 中的每一帧，Sources 面板会跳到对应代码位置，Scope 面板会显示该作用域内的所有变量。这对于理解参数的流动路径至关重要——你需要知道加密前的明文是从哪里构造的，加密后的密文又传给了谁。

### 4.4.4 Scope 作用域与变量查看

Scope 面板是分析加密逻辑的关键。断点触发时，Scope 会展示三个层级的变量。Local 是当前函数的局部变量，包括函数参数和函数内部声明的变量。Closure 是闭包中捕获的变量——很多加密模块用闭包来隐藏私有变量，密钥和盐值经常藏在闭包里。Global 是全局变量，包括 window 对象上挂载的所有属性。

举个例子，你在断点处看到 Local 里有 `key: "a1b2c3d4e5f6g7h8"` 和 `mode: "AES-ECB"`，Closure 里有 `salt: "xyz"` 和 `iterCount: 3`，那加密的密钥、盐值和迭代次数就都拿到了。再结合 Global 中的 `CryptoJS` 对象，你就能确认加密库的版本和具体调用方式。

> 看 Scope 面板就像在翻别人的抽屉。密钥、盐值、迭代次数，加密需要的所有材料都在这里摆着。怕浪猫的经验是：先看 Local 拿当前参数，再看 Closure 拿闭包变量，最后看 Global 拿全局配置。三级递进，加密逻辑就清楚了。

## 4.5 JS 篡改与伪装

### 4.5.1 为什么需要篡改 JS

有时候光靠断点分析还不够。加密函数可能依赖大量上下文变量，或者混淆严重到难以阅读。这时候直接篡改 JS 文件，在本地修改加密逻辑或注入调试代码，是更高效的方式。

JS 篡改的核心思路是：把服务器返回的 JS 文件替换成本地修改过的版本，让浏览器执行你修改后的代码。正常流程下，浏览器请求 JS 文件，服务器返回原始版本，浏览器执行原始代码。篡改后，浏览器请求 JS 文件，抓包工具拦截这个请求，返回你本地修改过的版本，浏览器执行修改后的代码。整个过程中浏览器完全无感知。

JS 篡改在逆向中的典型应用场景有三种。第一种是注入 console.log 打印加密前后的参数值，这是最常用的调试手段。第二种是删除或禁用反调试代码，比如把无限 Debugger 的 setInterval 调用注释掉。第三种是修改加密逻辑本身，比如把 AES 密钥改成已知的值，这样你在 Python 端就能用同样的密钥解密。第三种方式在验证加密逻辑时特别有用——如果你怀疑密钥来源有问题，可以在 JS 中硬编码一个测试密钥，看看加密结果是否符合预期。

### 4.5.2 ReRes 篡改方案

ReRes 是一个 Chrome 扩展，可以把 URL 映射到本地文件。安装后，在扩展设置中添加映射规则，指定匹配的 URL 模式和本地文件路径，浏览器请求匹配的 JS 文件时就会加载本地版本。适合简单的单文件替换场景，比如替换某个加密库文件或修改几行加密逻辑。

ReRes 的优点是轻量、零配置、开箱即用。缺点是只能做 URL 到文件的静态映射，不能动态修改响应内容。如果你需要根据请求参数动态修改 JS 内容，ReRes 就力不从心了。

### 4.5.3 Tampermonkey 油猴脚本

Tampermonkey 是更灵活的方案。通过油猴脚本，你可以在页面 JS 执行前后注入自定义代码，覆盖函数、修改变量、拦截方法。它的灵活性远超 ReRes，因为你可以写完整的 JS 逻辑来处理各种复杂场景。

一个典型的油猴脚本——覆盖加密函数，打印明文参数：

```javascript
// ==UserScript==
// @name         加密函数拦截
// @match        https://example.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    const checkInterval = setInterval(() => {
        if (window.encryptData) {
            clearInterval(checkInterval);
            const original = window.encryptData;
            window.encryptData = function(data) {
                console.log('加密前:', data);
                const result = original.call(this, data);
                console.log('加密后:', result);
                return result;
            };
        }
    }, 50);
})();
```

`@run-at document-start` 确保脚本在页面 JS 之前执行，这样能在加密函数加载的第一时间拦截。脚本通过轮询检查目标函数是否存在，一旦检测到就重写它——先调用原始函数拿到加密结果，同时打印明文和密文，方便你验证加密逻辑。

> ReRes 适合"静态替换"，Tampermonkey 适合"动态拦截"。怕浪猫的实际工作流是：先用 Tampermonkey 打印加密前后的参数，确认加密逻辑后，再决定是 Python 重构还是 JS 调用。

### 4.5.4 Charles / Fiddler Map Local

Charles 的 Map Local 功能和 ReRes 类似，但在抓包工具层面做替换，不依赖浏览器扩展。配置路径是 Tools 菜单下的 Map Local，添加一条规则，指定要匹配的 URL（包括协议、域名、路径），以及本地替换文件的路径。

Fiddler 的配置类似，在 AutoResponder 中添加规则，匹配 URL 后替换为本地文件。Map Local 的优势是可以替换任何资源类型——JS、CSS、图片都不在话下，不受浏览器扩展限制。配合 Charles 的 SSL 证书功能，HTTPS 站点也能轻松替换。缺点是配置比 ReRes 麻烦一些，需要手动设置 URL 匹配规则。

## 4.6 Python 逆向重构加密函数

### 4.6.1 JS 到 Python 的翻译技巧

当你通过断点调试搞清楚了加密逻辑，下一步就是用 Python 重构。这个过程需要把 JS 代码翻译成 Python 代码，有几个关键技巧。

第一个技巧是识别加密库。JS 中 90% 的加密都用 CryptoJS，它是前端最流行的加密库。CryptoJS 的 AES 加密对应 Python 的 pycryptodome 库，MD5 对应 hashlib，HMAC 对应 hmac 加 hashlib。识别出加密库后，直接找 Python 对应实现就行。

第二个技巧是注意编码差异。JS 默认使用 UTF-16 编码，Python 默认使用 UTF-8。JS 的 `charCodeAt()` 返回 UTF-16 码元值，Python 的 `ord()` 返回 Unicode 码位。处理纯 ASCII 字符时两者一致，但遇到中文就会出问题。比如 JS 中 `"中".charCodeAt(0)` 返回 20013，而 Python 中 `ord("中")` 也返回 20013，但如果你用 `encode('utf-8')` 处理，会得到三个字节。这个差异在处理中文字符串加密时特别容易踩坑。

第三个技巧是处理位运算。JS 的位运算会强制操作数转为 32 位有符号整数，Python 的整数是任意精度的。遇到 `value | 0` 这种写法，Python 要用 `value & 0xFFFFFFFF` 来模拟 32 位截断。遇到 `value >>> 0`（无符号右移），Python 要先做位掩码再做右移。这种差异在实现自定义加密算法时特别常见——很多网站不用标准加密库，而是自己写一套基于位运算的混淆算法，翻译时稍不注意就会出错。怕浪猫的建议是：写一个简单的测试用例，用相同的输入在 JS 和 Python 中各跑一遍，对比中间变量的值。如果前几个步骤的值一致但后面突然不一致了，说明是在某个位运算步骤出了问题，重点检查那个步骤的 32 位截断处理。

> 翻译最容易踩的坑就是编码和位运算。怕浪猫的建议是：先拿纯 ASCII 字符串测试，确保结果一致后再换中文。如果中英文混合测试不通过，99% 是编码问题。

### 4.6.2 常见 JS 加密库的 Python 对应实现

怕浪猫整理了一张对应关系表。CryptoJS 的 AES 加解密对应 Python 的 pycryptodome，注意 CryptoJS 默认 CBC 模式且支持密钥派生。CryptoJS 的 MD5、SHA 系列直接对应 Python 的 hashlib，用法基本一致。CryptoJS 的 HMAC 系列对应 Python 的 hmac 加 hashlib，注意密钥编码要一致。JSEncrypt 的 RSA 加密对应 pycryptodome 的 RSA 模块，需要把前端提取的公钥转换成 PEM 格式。

这里有一个关键坑点：CryptoJS 的 AES 加密支持两种密钥传参方式。如果传的是字节数组，直接作为密钥使用；如果传的是字符串，CryptoJS 会自动做密钥派生，这个过程涉及 OpenSSL 的 `EVP_BytesToKey` 算法。很多新手用 Python 重构时没注意到这个区别，导致加解密结果不一致。

```python
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import base64, hashlib

def cryptojs_aes_decrypt(ciphertext: str, passphrase: str) -> str:
    """对应CryptoJS.AES.decrypt(data, passphrase)"""
    raw = base64.b64decode(ciphertext)
    salt = raw[8:16]        # CryptoJS默认前8字节为"Salted__"
    encrypted = raw[16:]     # 后面是实际密文
    key_iv = _evp_bytes_to_key(passphrase, salt, 48)
    key, iv = key_iv[:32], key_iv[32:48]
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return unpad(cipher.decrypt(encrypted), AES.block_size).decode()

def _evp_bytes_to_key(password: str, salt: bytes, key_len: int) -> bytes:
    """OpenSSL EVP_BytesToKey密钥派生算法"""
    d, last = b'', b''
    while len(d) < key_len:
        last = hashlib.md5(last + password.encode('utf-8') + salt).digest()
        d += last
    return d[:key_len]
```

### 4.6.3 边界 case 处理与结果验证

重构完加密函数，必须验证结果是否一致。怕浪猫的验证清单包括五个维度。空字符串测试：输入空字符串，对比 JS 和 Python 的加密结果，验证初始化逻辑。中文测试：输入中文字符串，检查编码处理是否一致。特殊字符测试：包含 `&`、`=`、`+`、`/` 等在加密和编码中可能产生歧义的字符。长字符串测试：输入超过一个块大小（16 字节）的字符串，验证分组加密逻辑。随机对比测试：生成大量随机字符串，JS 和 Python 各跑一遍，逐个对比结果。

```python
import random, string

def verify_encrypt(js_func, py_func, count=100):
    """批量验证Python加密与JS加密结果是否一致"""
    for i in range(count):
        test_str = ''.join(random.choices(
            string.ascii_letters + string.digits, k=random.randint(0, 50)
        ))
        js_result = js_func(test_str)
        py_result = py_func(test_str)
        if js_result != py_result:
            print(f"不一致! 输入: {test_str}, JS: {js_result}, PY: {py_result}")
            return False
    print(f"全部{count}组测试通过")
    return True
```

> 边界 case 是重构成功的关键。怕浪猫见过太多人只测了一个用例就说"搞定了"，结果上线后遇到特殊字符就挂。至少跑 100 组随机测试，才能说重构靠谱。

## 4.7 Python 调度 JS 文件

### 4.7.1 为什么要直接调度 JS

有时候加密逻辑太复杂——混淆严重、依赖链长、动态密钥——Python 重构的成本太高。比如某些网站的加密函数依赖上百个辅助函数，还用到了 Webpack 的模块系统，翻译成 Python 工作量巨大。这时候直接在 Python 中调用 JS 引擎执行原始加密代码，是性价比最高的方案。

> 能重构当然好，但工程师的字典里还有两个字叫"效率"。花三天重构一个加密函数，不如花三小时把 JS 跑起来。怕浪猫的原则是：简单加密重构，复杂加密直接调。

### 4.7.2 execjs 库：直接执行 JS 代码

Python 的 PyExecJS 库可以让你在 Python 中直接执行 JS 代码并获取返回值。安装命令是 `pip install PyExecJS`，它需要系统中有 JS 引擎（Node.js、V8 等）作为底层运行环境。

基本用法分两步：先编译 JS 代码，再调用指定函数：

```python
import execjs

with open('encrypt.js', 'r', encoding='utf-8') as f:
    js_code = f.read()

ctx = execjs.compile(js_code)
encrypted = ctx.call('encryptFunction', 'username=admin&password=123456')
print(f"加密结果: {encrypted}")
```

`execjs.compile()` 把 JS 代码编译成上下文对象，`ctx.call()` 调用指定函数并传参。Python 和 JS 的桥梁就这样搭起来了，你不需要翻译任何加密逻辑，直接把网站的 JS 代码拿过来用就行。

### 4.7.3 三种 JS 执行方案对比

怕浪猫给你对比三种主流的 JS 执行方案。PyExecJS 是最简单的方案，它自动检测系统中的 JS 引擎，开箱即用。但它的进程管理不够稳定，长时间运行可能出现内存泄漏，适合快速验证和简单调用。

execjs 配合 Node.js 是进阶方案，指定 Node.js 作为底层引擎，性能和稳定性都比 PyExecJS 自带的引擎好。适合生产环境和对稳定性要求高的场景。

直接用 subprocess 调 Node.js 是最可控的方案：

```python
import subprocess, json

def call_js_encrypt(js_file: str, func_name: str, *args) -> str:
    """通过Node.js子进程执行JS加密函数"""
    args_json = json.dumps(list(args))
    script = f"""
    const encrypt = require('{js_file}');
    const args = {args_json};
    const result = encrypt.{func_name}(...args);
    console.log(JSON.stringify(result));
    """
    result = subprocess.run(
        ['node', '-e', script],
        capture_output=True, text=True, timeout=10
    )
    if result.returncode != 0:
        raise RuntimeError(f"JS执行失败: {result.stderr}")
    return json.loads(result.stdout.strip())
```

每次调用起独立进程，用完即销，不会出现内存泄漏问题。性能比前两种差一点（进程启动有开销），但稳定性最好。如果性能要求高，可以用 Node.js 常驻服务加 HTTP 接口的方式，Python 通过 requests 调用，兼顾性能和稳定性。

> 怕浪猫在生产环境踩过 PyExecJS 的坑：高并发下进程池爆了，内存涨到 8G。后来换成 subprocess 加 Node.js，稳定得很。性能差一点但不会炸。

### 4.7.4 JS 环境补全

网站的加密 JS 往往依赖浏览器环境——window、document、navigator 等对象。在 Node.js 中直接运行会报 `window is not defined` 的错误。这时候需要手动补全这些环境变量。

```python
js_env = """
var window = global;
var document = {
    cookie: '',
    createElement: function() { return { getContext: function() { return {}; } }; },
    getElementById: function() { return null; },
    addEventListener: function() {}
};
var navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    platform: 'Win32', language: 'zh-CN', appName: 'Netscape'
};
var location = { href: 'https://example.com/login', protocol: 'https:' };
"""
```

环境补全的核心原则是"缺什么补什么"。先跑一遍看报什么错，然后逐个补全。不要一次性写一大堆——大部分加密函数只用到 `navigator.userAgent` 和 `document.cookie`，不需要完整的 DOM 模拟。过度补全反而可能引入新的错误。常见的报错和对应解决方案是：`window is not defined` 就补 window 对象并指向 global，`document is not defined` 就补 document 对象，`navigator is not defined` 就补 navigator 对象。如果报 `canvas.getContext is not a function`，说明加密函数检测了 canvas 指纹，需要补全 createElement 返回的 canvas 对象。如果报 `crypto is not defined`，说明用到了 Web Crypto API，需要补全 crypto 对象或替换成 Node.js 的 crypto 模块。

怕浪猫补环境的顺序是：先补 window 和 navigator，这两个最常用，绝大多数加密函数都会读取 userAgent。再补 document，主要是 cookie 和 createElement，某些加密函数会检测 canvas 指纹。最后补 location 和 screen，偶尔需要。每次补一个变量，跑一遍，看报错逐步推进。别想着一步到位，那是给自己挖坑。

### 4.7.5 实战案例：完整的加密登录流程

把前面学的所有知识点串起来，走一个完整的加密登录流程。假设目标网站的登录流程是：获取 RSA 公钥（前端硬编码），密码用 RSA 公钥加密，用户名加加密密码加时间戳用 AES 加密生成 token，最后做 MD5 签名校验，提交登录请求。

```python
import time, base64, hashlib, requests
from Crypto.Cipher import AES, PKCS1_v1_5
from Crypto.PublicKey import RSA; from Crypto.Util.Padding import pad

class EncryptedLogin:
    def __init__(self):
        self.session = requests.Session()
        self.aes_key = "a1b2c3d4e5f6g7h8"
        self.rsa_pubkey = "MIIBIjANBgkqhkiG..."

    def rsa_encrypt_password(self, password: str) -> str:
        key = RSA.import_key(
            f"-----BEGIN PUBLIC KEY-----\n{self.rsa_pubkey}\n-----END PUBLIC KEY-----"
        )
        cipher = PKCS1_v1_5.new(key)
        return base64.b64encode(cipher.encrypt(password.encode())).decode()

    def login(self, username: str, password: str):
        enc_pwd = self.rsa_encrypt_password(password)
        timestamp = str(int(time.time() * 1000))
        token_data = f"{username}|{enc_pwd}|{timestamp}"
        cipher = AES.new(self.aes_key.encode(), AES.MODE_ECB)
        token = base64.b64encode(cipher.encrypt(
            pad(token_data.encode(), AES.block_size))).decode()
        sign = hashlib.md5((token + self.aes_key).encode()).hexdigest()
        resp = self.session.post("https://example.com/api/login", data={
            "username": username, "token": token,
            "sign": sign, "timestamp": timestamp
        })
        return resp.json()
```

这个案例覆盖了 RSA 加密、AES 加密、MD5 签名——三种加密算法在一个登录流程中配合使用，这在实际逆向中非常常见。RSA 负责加密密码这种敏感信息，AES 负责加密整体参数防止篡改，MD5 负责签名校验保证数据完整性。理解了这三种算法的配合方式，你就能应对大多数加密登录场景。

> 加密登录逆向的核心不是某个算法怎么破，而是把整个加密链路理清楚。怕浪猫的经验是：先画流程图，再写代码。把"输入什么、经过哪些函数、输出什么"画在纸上，代码自然就出来了。

## 总结

这一章我们从加密基础出发，完整走过了加密登录逆向的全链路。加密基础部分，要搞清楚每种算法的特性和适用场景，别把 Base64 当加密。抓包逆向部分，Chrome DevTools 是主力工具，mitmproxy 是自动化利器。突破反调试部分，条件断点、函数重写、中间人替换三招搞定无限 Debugger。断点调试部分，四种断点配合 Call Stack 和 Scope 分析，理清加密逻辑。JS 篡改部分，ReRes、Tampermonkey、Map Local 按需选择。Python 重构部分，翻译技巧加边界验证，确保结果一致。JS 调度部分，execjs 或 subprocess 加 Node.js，复杂加密直接调用。

加密逆向是爬虫工程师从初级到高级的分水岭。掌握这套方法论，90% 的加密登录都能搞定。剩下 10% 需要更深层的 AST 反混淆和 WASM 逆向，那是另一个故事了。

**系列进度 4/11**

下章预告：第5章将搭建Cookie池管理系统，从持久化复用到高并发维护上万Cookie的有效性。

怕浪猫说：逆向这条路没有捷径，每个网站都在不断升级加密策略，今天的万能方案明天可能就失效了。但底层的方法论不会变——抓包定位、断点分析、逻辑重构、结果验证，这四步走通了你就能应对任何加密。别怕踩坑，坑踩多了自然就成路了。我们下一章见。
