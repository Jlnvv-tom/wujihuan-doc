# 【实战】数据爬取与清洗 — 为大模型"备粮草"

做大模型开发越久，越认同一句话：模型的天花板，在训练数据喂进去的那一刻就定了。

我见过太多团队，花大价钱买GPU，调架构，搞分布式训练，最后效果拉垮。一查数据——好家伙，网页爬下来的原始HTML没清洗，正文里混着导航栏文字和JS代码；去重没做，同一段话在数据集里出现几百遍；编码乱七八糟，UTF-8和GBK混着来。这种数据喂给模型，再好的架构也白搭。

我是怕浪猫，一个在数据工程上踩过无数坑的LLM开发工程师。这一章咱们聊聊为大模型准备训练数据的全流程——从网络爬虫到数据清洗，从去重脱敏到格式标准化。这些活儿看着不酷，但真正决定模型质量的，恰恰是这些"脏活累活"。

> 金句：在LLM开发中，数据清洗不是可选项，而是决定成败的生死线。一个干净的小数据集，胜过一个脏乱的大数据集。

先说个真事。去年帮一个创业团队排查模型效果差的问题，他们用了10GB的爬虫数据做预训练，结果模型生成的文本总是带着"点击查看更多""广告赞助商链接"这类噪声。我花了一下午帮他们重新清洗数据，去掉HTML残留和广告文本，重新训练后输出质量直接提升一个档次。那个团队的技术负责人看着清洗前后的数据对比，沉默了好一会儿，然后说了一句："原来我们之前不是在训练模型，是在训练垃圾处理器。"这就是数据清洗的力量，也是怕浪猫写这一章的原因。

## 10.1 导学与数据需求

### 预训练数据类型：大模型吃什么

大模型预训练需要海量文本数据，按照来源和格式，怕浪猫把它们分成几类，每一类的特点和获取方式都不一样。

**网页文本**：互联网是最大的文本宝库。Common Crawl（通用爬虫计划）是一个非营利组织维护的项目，自2007年起持续抓取全网网页，每月发布一批数据，目前累计数据量已经超过PB（Petabyte，拍字节，1PB=1024TB）级别。GPT-3的训练数据中，Common Crawl占了相当大的比重，经过清洗后的高质量子集是大多数主流大模型预训练数据的基础来源。网页文本的特点是量极大、覆盖面极广，但质量参差不齐，清洗工作量也最大。你能在网上找到的内容——新闻、博客、论坛帖子、产品介绍——全都包含在里面。

**书籍**：BookCorpus等数据集包含大量小说和非虚构类书籍文本，涵盖了科幻、言情、历史、传记等多种题材。书籍文本的优势非常明显：语言规范、逻辑连贯、长文本叙事能力强。模型从书籍中能学到长距离的语义依赖关系，这对于生成长文本非常有帮助。缺点是题材可能偏向文学，对技术类知识和最新信息的覆盖不足。另外，版权问题是书籍数据使用中需要特别注意的，很多优质书籍受版权保护，不能直接用于训练。

**论文**：arXiv、PubMed等学术数据源提供了大量经过同行评审的高质量学术文本。论文文本专业性强，包含大量数学公式、专业术语和严密的逻辑论证，对提升模型在学术和技术领域的表现很有帮助。很多针对科研领域微调的模型（如SciBERT、Galactica）都大量使用了论文数据。arXiv的数据是开放获取的，可以通过其API（Application Programming Interface，应用程序编程接口）批量下载论文的LaTeX源码或PDF全文。

**代码**：GitHub、StackOverflow等代码数据源对模型的逻辑推理能力提升显著。代码具有结构严格、逻辑清晰、无歧义的特点，是高质量训练数据的重要补充。这也是为什么StarCoder、CodeLlama等代码模型需要专门的代码数据训练。The Stack数据集包含了来自GitHub的超过3TB的开源代码，经过许可证过滤后可用于模型训练。

来看一下主流开源数据集的对比：

| 数据集 | 规模 | 主要内容 | 常见用途 |
|--------|------|----------|----------|
| Common Crawl | PB级 | 网页原始数据 | 预训练基础语料 |
| Wikipedia | 100GB+ | 百科条目 | 高质量知识语料 |
| The Pile | 825GB | 多源混合数据 | 预训练综合语料 |
| BookCorpus | 5GB+ | 小说书籍 | 长文本学习 |
| arXiv | 1TB+ | 学术论文 | 学术能力提升 |
| GitHub Code | 100GB+ | 开源代码 | 代码能力训练 |

> 金句：选数据集就像选食材，不在于多贵多稀罕，而在于新鲜、干净、适合你的菜谱。

### 数据格式：纯文本、JSON与JSONL

爬到数据后，存什么格式？这事儿怕浪猫踩过坑，而且不止一次。

**纯文本（Plain Text）**：最简单的格式，一行一篇文章或一段文本，文件后缀通常是`.txt`。优点是通用性极强、读取速度最快、占用空间最小，任何文本处理工具都能直接读取。缺点是无法存储元信息——比如这条数据的来源URL是什么、爬取时间是什么时候、属于什么类别——这些信息在数据追踪和质量分析时非常重要。纯文本格式通常作为最终喂给模型训练的格式，而不是中间存储格式。

**JSON（JavaScript Object Notation，JavaScript对象表示法）**：一种轻量级的数据交换格式，使用键值对的结构来组织数据。每条数据是一个JSON对象，可以包含text字段和各种metadata（元数据）字段。JSON的优点是结构化程度高、可读性好、几乎所有编程语言都支持。缺点是当整个文件是一个大的JSON数组时，必须把整个文件加载到内存才能解析，文件一大就会内存溢出。另外，JSON格式有严格的语法要求，一个多余的逗号就会导致解析失败。

**JSONL（JSON Lines）**：每行一个独立的JSON对象，行与行之间用换行符分隔。这是怕浪猫最推荐的格式，也是大模型数据工程中的事实标准。它结合了纯文本的流式读取能力和JSON的结构化优势——你可以逐行读取、逐条处理，不用把整个文件加载到内存。对于GB级别的训练数据，这个优势至关重要。HuggingFace Datasets、PyTorch DataLoader等主流框架都原生支持JSONL格式。

```python
import json

# 写入JSONL格式
with open("train_data.jsonl", "w", encoding="utf-8") as f:
    for item in dataset:
        record = {
            "text": item["content"],
            "source": item["url"],
            "timestamp": item["crawl_time"],
            "lang": item["language"]
        }
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

# 流式读取JSONL（内存友好）
with open("train_data.jsonl", "r", encoding="utf-8") as f:
    for line in f:
        item = json.loads(line)
        process(item)  # 逐条处理
```

注意`ensure_ascii=False`这个参数。不加的话，中文会被转成`\uXXXX`的转义序列，文件体积膨胀30%以上，而且肉眼完全看不懂。这个坑怕浪猫见过太多次了，有同事调试时盯着满屏的`\u4eba\u751f`看了半天，以为数据坏了，其实就是少加了一个参数。

> 金句：JSONL是大模型数据工程的最佳实践——既有结构、又能流式处理，内存再小也不怕。

### Common Crawl、Wikipedia与The Pile

这三个数据集是大模型预训练的"三驾马车"，怕浪猫分别说说它们的特点和获取方式。

**Common Crawl** 是目前最大的公开网页爬取数据集。它的数据以WARC（Web ARChive，网页归档格式）格式存储，包含完整的HTTP响应头和正文。WARC格式是互联网档案馆制定的网页存储标准，一条WARC记录包含了URL、抓取时间、HTTP响应头和HTML正文。你可以通过AWS S3免费下载Common Crawl的数据，也可以使用其CDX（Common Crawl Index）API按URL查询特定页面的抓取记录。Common Crawl每月发布一批新数据，每批约80TB-100TB。大多数主流大模型（GPT系列、LLaMA、BLOOM等）的预训练数据都包含Common Crawl的子集。但原始数据质量很低，研究表明未经清洗的Common Crawl中只有约10%-20%的内容是高质量文本。

**Wikipedia** 是高质量的结构化百科数据，由全球志愿者协作编写和维护。Wikipedia定期发布数据库dump（数据转储文件），包含所有条目的完整wikitext（维基标记语言源码）。也有社区维护的已清洗纯文本版本，比如HuggingFace的wikipedia数据集就提供了多种语言的清洗后版本。Wikipedia的优势是质量高、知识覆盖面广、结构化程度高（有分类、信息框、引用等），但数据量相对较小——中文Wikipedia全部条目加起来大约几个GB。在预训练数据中，Wikipedia通常作为"精品语料"使用，占比不高但质量贡献大。

**The Pile** 是EleutherAI构建的825GB多源数据集，包含22个子集，涵盖书籍、论文、代码、对话、网页、数学、生物医学等多种数据类型。The Pile的设计理念是数据多样性——不同类型的数据能提升模型在不同任务上的表现。比如，FreeLaw子集包含法律文书，能提升模型在法律领域的理解能力；PubMed Central子集包含医学论文，能提升模型在医学领域的能力。The Pile的每个子集都经过了专门的清洗和质量评估，是目前最常用的开源预训练数据集之一。

获取这些数据集的推荐方式是通过HuggingFace Datasets库：

```python
from datasets import load_dataset

# 加载Wikipedia中文数据
wiki_ds = load_dataset("wikipedia", "20220301.zh", split="train")
print(f"条目数: {len(wiki_ds)}")  # 约120万条

# 流式加载（不占内存，适合大数据集）
for item in load_dataset("wikipedia", "20220301.zh",
                         streaming=True, split="train"):
    text = item["text"]
    process(text)
```

`streaming=True`这个参数很关键。不加的话，HuggingFace会把整个数据集下载到本地磁盘然后再加载到内存，几GB的数据还好说，碰到几百GB的就会磁盘爆满。加了streaming之后，数据是一条一条从远端拉取的，内存占用恒定。怕浪猫第一次用The Pile的时候不知道这个参数，直接把服务器磁盘撑爆了，被运维同事追着骂了三条街。

## 10.2 网络爬虫实现

### requests库基础：最简单的爬虫

在大模型数据工程中，很多场景需要自己爬取特定领域的数据。比如你要做一个医疗领域的模型，公开数据集可能不够用，需要从医学网站、论著数据库爬取专业内容。再比如你要做一个法律咨询模型，需要从法律文书网站爬取判决书和法规条文。这时候，Python的requests库就是你的第一件武器。

requests是Python最常用的HTTP（HyperText Transfer Protocol，超文本传输协议）库。它封装了urllib3，提供了简洁优雅的API。HTTP协议是Web通信的基础，客户端发送请求，服务器返回响应，就这么简单。requests把这套流程封装成了`requests.get()`、`requests.post()`等几个方法，用起来非常直观。

一个最基本的爬虫只需要几行代码：

```python
import requests

url = "https://example.com/article/123"
headers = {
    "User-Agent": "Mozilla/5.0 (compatible; DataBot/1.0)"
}
resp = requests.get(url, headers=headers, timeout=10)

if resp.status_code == 200:
    html = resp.text
    print(f"获取成功，HTML长度: {len(html)}")
else:
    print(f"请求失败，状态码: {resp.status_code}")
```

这里有几个关键点需要解释。第一，务必设置User-Agent（用户代理字符串），它告诉服务器"我是谁"。很多网站会检查请求头，没有User-Agent或者User-Agent是默认的"python-requests/2.x"的请求会被直接拒绝，因为服务器一看就知道这是爬虫。第二，设置timeout（超时时间），单位是秒。不设timeout的话，如果目标服务器响应很慢或者不响应，你的爬虫就会一直卡在那里，永远等下去。这在生产环境中是不可接受的。第三，检查status_code（HTTP状态码），200表示成功，404表示页面不存在，403表示被禁止访问，500表示服务器内部错误。根据不同的状态码做不同的处理，是一个合格爬虫的基本素养。

> 金句：爬虫的第一原则——把你自己当成一个正常用户。你不会没有身份地敲门，爬虫也不该裸奔。

### BeautifulSoup解析与文本提取

拿到HTML后，需要从中提取出正文文本。这一步的核心工具是BeautifulSoup，Python生态中最流行的HTML/XML解析库。

HTML文档的结构是一棵DOM（Document Object Model，文档对象模型）树。`<html>`是根节点，下面有`<head>`和`<body>`两个子节点。`<head>`里包含页面标题、CSS样式表链接、JS脚本引用等元信息，`<body>`里才是用户在浏览器中看到的页面内容。`<body>`里又包含`<div>`、`<p>`、`<h1>`、`<a>`等各种标签，标签可以嵌套，形成树状结构。BeautifulSoup的工作就是把这棵树解析出来，然后帮你通过各种方式定位和提取需要的内容。

```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")

# 提取标题
title = soup.find("h1").get_text(strip=True)

# 提取正文段落
paragraphs = soup.find_all("p")
article_text = "\n".join(p.get_text(strip=True) for p in paragraphs)

# 通过CSS选择器定位（更精准）
content = soup.select("div.article-content p")
article = "\n".join(p.get_text(strip=True) for p in content)

# 提取所有链接
links = [a["href"] for a in soup.find_all("a", href=True)]
```

`find`方法返回第一个匹配的标签，`find_all`返回所有匹配的标签，`select`使用CSS选择器语法定位元素。`get_text(strip=True)`提取标签内的纯文本并去除首尾空白。实际项目中，不同网站的HTML结构千差万别。怕浪猫的经验是：先在浏览器里用开发者工具（按F12打开）检查页面结构，找到正文所在的标签和CSS类名，然后针对性地写解析规则。不要试图写一个通用的爬虫解析所有网站——每个网站的结构都不一样，通用方案的准确率很低。

还有一种方式是用`readability-lxml`库，它模仿Mozilla Firefox的Reader View功能，能自动提取网页正文。对于结构未知的网页，这个方案比手写解析规则省事很多。但准确率不如定制方案，对于特殊结构的页面可能提取不全。

> 金句：解析HTML就像拆快递，有人暴力撕开，有人 аккуратно沿缝隙拆。BeautifulSoup给你提供了手术刀，用不用看你自己。

### 多页爬取与翻页策略

真实的数据爬取场景中，内容往往分布在多个页面上。一个新闻网站可能有几千篇文章，每篇都在不同的URL上；一个论坛可能有几万个帖子，分布在几百个列表页里。需要处理翻页逻辑才能把数据爬全。常见的翻页方式有两种：URL规律翻页和异步加载翻页。

URL规律翻页是最简单的。很多网站的分页URL有固定模式，比如`/article?page=1`、`/article?page=2`，或者`/list/1.html`、`/list/2.html`。你只需要构造URL循环请求即可。关键是要正确判断何时停止——通常通过检查页面是否还有内容来决定。

```python
import time
import requests

base_url = "https://example.com/articles"
all_articles = []

for page in range(1, 101):  # 最多爬100页
    url = f"{base_url}?page={page}"
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code != 200:
        print(f"第{page}页获取失败，状态码: {resp.status_code}")
        break

    soup = BeautifulSoup(resp.text, "html.parser")
    items = soup.select("div.article-item")
    if not items:
        print(f"第{page}页无数据，爬取结束")
        break

    for item in items:
        all_articles.append({
            "title": item.select_one("h2").get_text(strip=True),
            "link": item.select_one("a")["href"]
        })

    time.sleep(1)  # 礼貌性延迟
```

注意那个`time.sleep(1)`。这不是可选的——它是对目标网站的尊重。如果你的爬虫以每秒几十个请求的速度冲击一个网站，轻则被封IP，重则给对方服务器造成压力，甚至可能触犯法律。怕浪猫的原则是：爬取延迟不低于1秒，高峰期避开，非公开数据不爬，遵守robots.txt协议。robots.txt是网站根目录下的一个文本文件，声明了哪些页面允许爬取、哪些不允许。在爬取任何网站之前，先访问`https://目标域名/robots.txt`检查一下，这是基本的职业操守。

翻页爬取中还有一个容易忽略的问题：URL列表的获取。很多时候你并不知道总共有多少页，需要动态发现。常见的做法是：先爬列表页，从列表页中提取每篇文章的URL，然后逐个爬取文章详情页。列表页本身的翻页可以通过解析"下一页"按钮的链接来实现，也可以通过观察URL规律来构造。怕浪猫推荐先用"下一页"按钮的方式，因为有些网站的翻页参数不是简单的数字递增，可能包含加密参数或时间戳。

> 金句：爬虫的底线是礼貌。你是在借用别人的资源，不是在攻击别人的服务器。

### 反爬应对策略

爬虫做多了，一定会遇到反爬。网站为了保护自己的数据和服务器，会采取各种手段来识别和阻止爬虫。常见的反爬手段和应对方式怕浪猫整理如下：

**User-Agent检测**：网站检查请求头中的User-Agent字段，拒绝看起来不像浏览器的请求。有些网站甚至维护了一个已知爬虫User-Agent的黑名单。应对方式：设置真实的浏览器User-Agent字符串，或者从UA池中随机选取，让每个请求看起来来自不同的浏览器。

**IP频率限制**：同一IP地址在短时间内发送过多请求会被临时封禁，封禁时间从几分钟到几小时不等。应对方式：控制请求频率是最根本的办法。如果确实需要高频率爬取，可以使用代理IP池轮换请求，让每个请求来自不同的IP。但代理IP的质量参差不齐，免费代理大多不稳定，付费代理也需要筛选。

**Cookie和Session验证**：有些网站需要用户登录后才能访问内容，或者根据Cookie追踪用户行为。应对方式：使用requests.Session对象保持会话状态，Session会自动管理Cookie。如果需要登录，可以先用requests模拟登录请求，获取登录后的Cookie，后续请求就能携带认证信息了。

**动态渲染**：越来越多的网站使用前端框架（React、Vue等）在浏览器中动态渲染页面内容。requests拿到的HTML只是一个空壳，真正的数据是通过JavaScript在浏览器中异步加载的。应对方式：使用Selenium或Playwright等浏览器自动化工具，它们会启动一个真实的浏览器来渲染页面，等JavaScript执行完毕后再获取渲染后的HTML。代价是速度慢、资源消耗大。

```python
import random

# UA池 + 代理池示例
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
]

PROXIES = [
    {"http": "http://proxy1:8080", "https": "http://proxy1:8080"},
    {"http": "http://proxy2:8080", "https": "http://proxy2:8080"},
]

def fetch(url):
    headers = {"User-Agent": random.choice(USER_AGENTS)}
    proxy = random.choice(PROXIES)
    resp = requests.get(url, headers=headers,
                        proxies=proxy, timeout=10)
    return resp
```

怕浪猫必须强调一句：反爬应对的目的是正常获取公开数据，不是对抗网站安全机制。如果网站明确通过robots.txt禁止爬取，或者数据涉及个人隐私和版权保护，那就不要爬。技术能力的边界之外，还有法律和道德的边界。爬虫工程师圈子里有句话："能爬到不代表应该爬。"怕浪猫深以为然。

### 爬虫效率优化：并发与异步

单线程爬虫的速度实在让人着急。爬一万个页面，每个页面延迟1秒加上网络耗时，可能要跑好几个小时。在大模型数据工程的场景下，数据量动辄几十万上百万条页面，单线程根本不可行。提升效率的方式有几种，怕浪猫分别介绍。

**多线程**：使用`concurrent.futures.ThreadPoolExecutor`，开多个线程并发请求。由于网络IO（Input/Output，输入/输出）是阻塞操作——一个线程在等待网络响应时，其他线程可以继续发送请求——所以多线程能有效提升吞吐量。但线程数不宜过多，一般控制在10-20个。线程太多会导致系统调度开销增大，反而降低性能，还可能把目标网站冲垮。

**异步IO**：使用`asyncio`加`aiohttp`，在单线程内并发处理大量网络连接。asyncio是Python的异步编程框架，通过事件循环（Event Loop）管理协程（Coroutine）。当一个协程在等待网络响应时，事件循环会自动切换到其他就绪的协程执行。比多线程更轻量，一个线程就能管理上百个并发连接。

```python
import asyncio
import aiohttp

async def fetch_one(session, url):
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
        if resp.status == 200:
            return await resp.text()
        return None

async def crawl_batch(urls):
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_one(session, url) for url in urls]
        results = await asyncio.gather(*tasks)
        return results

# 批量爬取
urls = [f"https://example.com/article/{i}" for i in range(100)]
pages = asyncio.run(crawl_batch(urls))
```

异步爬虫的性能优势非常明显。怕浪猫实测过，同样爬1000个页面：单线程约16分钟，10线程约2分钟，asyncio约30秒。十倍以上的差距。当然，并发量不能无限提高——要考虑目标网站的承受能力和你的网络带宽。即使你用异步爬虫，也建议设置一个`Semaphore`（信号量）来限制并发数，一般50到100个并发就够了。

选择多线程还是异步IO，取决于具体场景。如果爬虫逻辑比较简单，主要是发请求和存数据，异步IO更合适。如果爬虫逻辑复杂，涉及大量的同步操作（比如调用第三方库、写数据库等），多线程可能更方便，因为异步编程需要整个调用链都是异步的，一旦某个环节是同步的就会阻塞事件循环。怕浪猫的实际经验是：简单爬虫用asyncio，复杂爬虫用多线程，混合场景可以用asyncio跑网络IO部分，用线程池跑同步操作部分。

> 金句：异步爬虫是大模型数据采集的标配。单线程爬虫在大数据时代，就像用勺子挖隧道。

### 数据存储与断点续爬

爬到的数据要及时持久化存储，不要全部放在内存里。程序崩溃了、网络断了、电脑关机了——这些在生产环境中都是常态，迟早会发生。如果数据只存在内存中，一旦程序异常退出，所有数据就全丢了，几个小时甚至几天的爬取工作白费。断点续爬的核心思路是：记录已完成的任务状态，程序重启后从断点继续，而不是从头开始。

```python
import json
import os

class CrawlCheckpoint:
    def __init__(self, save_path, checkpoint_path):
        self.save_path = save_path
        self.checkpoint_path = checkpoint_path
        self.completed = set()
        # 启动时加载已完成的URL
        if os.path.exists(checkpoint_path):
            with open(checkpoint_path, "r") as f:
                self.completed = set(f.read().splitlines())

    def is_done(self, url):
        return url in self.completed

    def save(self, url, data):
        # 数据追加写入JSONL文件
        with open(self.save_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + "\n")
        # 记录已完成的URL
        with open(self.checkpoint_path, "a") as f:
            f.write(url + "\n")
        self.completed.add(url)

    def pending(self, urls):
        """过滤出尚未完成的URL"""
        return [u for u in urls if u not in self.completed]
```

这个设计很朴素但非常实用：一个JSONL文件存数据，一个文本文件存已完成的URL列表。每次保存一条数据时同时记录checkpoint。重启时先加载checkpoint文件，过滤掉已完成的URL。怕浪猫在生产环境用了两年这个方案，稳定可靠。当然，如果数据量更大或者需要分布式爬取，可以用Redis或数据库来做checkpoint，但核心思路是一样的。

## 10.3 数据清洗一：HTML标签去除与编码处理

### HTML标签去除

从网页爬下来的原始数据，浑身都是"泥巴"。最表层的就是HTML标签——`<div>`、`<span>`、`<script>`、`<style>`这些标记，对模型训练完全无用，必须去掉。如果不去掉，模型会学到一堆无意义的标签语法，浪费训练容量，还会干扰正常文本的生成。

最基本的方式是用BeautifulSoup的`get_text()`方法。但很多新手直接用`get_text()`就以为完事了，结果发现数据里还残留着大量JS代码和CSS样式。原因在于：`<script>`和`<style>`标签的内容虽然不是标签本身，但它们包裹的文本也不是有效正文内容，`get_text()`会把它们一并提取出来。你拿到的"纯文本"里可能包含整段JavaScript代码，这对模型训练完全是噪声。

```python
from bs4 import BeautifulSoup

def clean_html(html_text):
    soup = BeautifulSoup(html_text, "html.parser")

    # 先移除script、style和导航类标签
    for tag in soup.find_all(["script", "style", "nav", "footer", "header"]):
        tag.decompose()

    # 再提取纯文本
    text = soup.get_text(separator="\n", strip=True)

    # 合并多余空行
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n".join(lines)
```

这里有个关键细节：先`decompose()`再`get_text()`。`decompose()`会把标签及其所有子内容从DOM树中彻底移除，这样`get_text()`就不会提取到JS和CSS内容了。另外，移除`nav`（导航栏）、`footer`（页脚）、`header`（页头）等非正文标签，能显著减少噪声。这些标签里通常是网站导航链接、版权声明、广告代码等内容，跟正文无关。

还有一种更暴力但有效的方式：用正则表达式直接去除HTML标签。这种方式速度快，不需要解析整个DOM树，适合处理海量数据。但不够精准——它会把`<`和`>`之间的所有内容都当标签删掉，可能误伤正文中的数学表达式（比如`a < b`中的`< b`会被误删）。所以正则清洗只适合作为辅助手段或者初筛。

```python
import re

def strip_html_tags(text):
    # 去除HTML标签
    clean = re.sub(r"<[^>]+>", "", text)
    # 去除HTML实体（如&nbsp; &amp;等）
    clean = re.sub(r"&[a-zA-Z]+;", " ", clean)
    # 压缩连续空格
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean
```

> 金句：数据清洗的第一法则——先去最显眼的脏，再去最隐蔽的脏。HTML标签是显眼的，编码问题是隐蔽的。

### 特殊字符与编码处理

编码问题是中文数据爬取中最常见的坑，也是最难排查的问题之一。互联网上的网页编码五花八门：UTF-8、GBK、GB2312、Big5、ISO-8859-1......如果你不正确处理编码，拿到的文本可能是一堆问号或者乱码。

Python 3的字符串默认使用Unicode编码，这在一定程度上简化了编码问题。但requests库拿到的`resp.text`是根据HTTP响应头中的`charset`字段来解码原始字节的。问题在于：有些网站的响应头里压根没写`charset`字段，或者写了但跟实际编码不一致。遇到这种情况，requests会默认用ISO-8859-1（Latin-1）来解码，这种编码只支持西欧字符，中文必然变成乱码。

```python
import requests
from charset_normalizer import from_bytes

resp = requests.get(url, timeout=10)
raw_bytes = resp.content  # 获取原始字节，不做解码

# 使用charset-normalizer自动检测编码
result = from_bytes(raw_bytes).best()
if result:
    text = str(result)
    encoding = result.encoding
    print(f"检测到编码: {encoding}")
else:
    text = raw_bytes.decode("utf-8", errors="ignore")
```

`charset-normalizer`是Python生态中最准确的编码检测库，比老旧的`chardet`更准确更快。它的检测原理是：对原始字节尝试多种编码进行解码，然后用统计模型评估每种解码结果的"自然度"——具体来说，就是检查解码后的字符频率分布是否符合该语言的特征分布。比如中文文本中常用汉字的出现频率遵循Zipf定律（齐普夫定律），如果某种解码方式产生的字符频率分布符合这个规律，那它大概率是正确的编码。

除了编码问题，还有一类常见问题是特殊字符。网页文本中可能包含各种不可见或特殊的Unicode字符：零宽空格（Zero-Width Space，`\u200b`）、零宽连接符（Zero-Width Joiner，`\u200d`）、不间断空格（Non-Breaking Space，`\u00a0`）、BOM（Byte Order Mark，字节顺序标记，`\ufeff`）等。这些字符在视觉上不可见或者看起来像普通空格，但会干扰模型训练——模型会把它们当成不同的token（标记），浪费词表空间，还可能导致文本匹配失败。

```python
import re
import unicodedata

def normalize_text(text):
    # 去除BOM和零宽字符
    text = text.replace("\ufeff", "").replace("\u200b", "")
    text = text.replace("\u200c", "").replace("\u200d", "")

    # 不间断空格替换为普通空格
    text = text.replace("\u00a0", " ")

    # 去除控制字符（保留换行\n和制表符\t）
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)

    # Unicode标准化（NFKC模式）
    text = unicodedata.normalize("NFKC", text)

    # 压缩连续空白
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()
```

这里有个关键概念需要解释：Unicode Normalization（Unicode标准化）。Unicode标准定义了四种标准化形式：NFC、NFD、NFKC、NFKD。其中NFKC（Normalization Form KC，兼容性分解再组合）是大模型数据处理中最常用的。它会把全角字符转成半角——比如全角字母`Ａ`变成半角`A`，全角数字`１`变成半角`1`，全角百分号`％`变成半角`%`。还会把兼容性等价字符统一——比如带圈数字`①`会变成`(1)`，罗马数字`Ⅱ`会变成`II`。这对于中日韩文本的标准化特别重要，因为中日韩文本中经常混用全角和半角字符。

> 金句：编码问题不解决，后面的所有数据清洗工作都是在沙子上建城堡。

## 10.4 数据清洗二：去重、质量过滤与脱敏

### 精确去重：最基础但最重要

数据去重是大模型数据清洗中最关键的步骤之一。重复数据会导致模型过拟合（Overfitting，过拟合是指模型对训练数据过度学习，导致泛化能力下降）——模型会对重复出现的内容过度学习，浪费训练容量，还会导致生成时出现重复输出的问题。研究表明，训练数据中即使只有10%的重复率，也会显著影响模型的生成质量。

最简单的去重方式是精确去重：计算每条文本的hash（哈希）值，相同hash的就是重复数据。Hash函数将任意长度的输入映射为固定长度的输出，相同输入一定产生相同输出，不同输入极大概率产生不同输出。Python中用`hashlib`库计算hash，用`set`数据结构做去重。

```python
import hashlib

def text_hash(text):
    return hashlib.md5(text.encode("utf-8")).hexdigest()

seen_hashes = set()
deduped = []

for item in dataset:
    h = text_hash(item["text"])
    if h not in seen_hashes:
        seen_hashes.add(h)
        deduped.append(item)

print(f"去重前: {len(dataset)}, 去重后: {len(deduped)}")
```

精确去重的优点是速度快、实现简单、准确率100%。但它的致命问题在于：只要有一个字符不同，hash就不同。网页爬取中经常出现这种情况——同一篇文章在不同页面的HTML结构略有差异，清洗后正文有微小的格式差别（多一个空格、标点符号不同、段落顺序不同），精确去重抓不住这种"近似重复"。研究表明，网页数据中大约有30%的近似重复内容是精确去重无法覆盖的。

### 模糊去重与MinHash

为了解决近似重复的问题，需要用到模糊去重。主流方法有MinHash和SimHash两种。怕浪猫重点讲MinHash，因为它在大规模数据集上的工程实现更成熟，也是大模型数据清洗中最常用的去重算法。

MinHash的核心思想是这样的：对每条文本先做Shingling——将文本切分成k个字符（或k个词）的滑动窗口子串。比如文本"今天天气真好"，用k=2做Shingling，得到{"今天"、"天天"、"天气"、"气真"、"真好"}五个子串。然后对Shingling集合做多次独立的哈希运算，每次哈希取所有子串哈希值中的最小值，把这个最小值作为签名的一个分量。用128个不同的哈希函数重复这个过程，就得到一个128维的签名向量。

两条文本的签名向量中，相同位置上值相等的比例，在数学上近似等于它们Shingling集合的Jaccard相似度。Jaccard相似度的定义是两个集合的交集大小除以并集大小。当这个相似度超过阈值（通常设为0.8到0.9），就认为两条文本近似重复。

```
文本A: "今天天气真好" → Shingling(2): {今天, 天天, 天气, 气真, 真好}
文本B: "今天天气不错" → Shingling(2): {今天, 天天, 天气, 气不, 不错}

Jaccard(A,B) = |交集| / |并集| = 3 / 7 ≈ 0.43

MinHash用128个哈希函数分别对A和B做哈希，
统计签名相同的位置比例 ≈ 0.43
```

当这个相似度超过阈值（通常设0.8-0.9），就认为两条文本近似重复，只保留其中一条。

```python
from datasketch import MinHash, MinHashLSH

def create_minhash(text, num_perm=128):
    m = MinHash(num_perm=num_perm)
    # 3-gram shingling（3字符滑动窗口）
    shingles = [text[i:i+3] for i in range(len(text) - 2)]
    for s in shingles:
        m.update(s.encode("utf-8"))
    return m

# 构建LSH索引
lsh = MinHashLSH(threshold=0.8, num_perm=128)

for idx, item in enumerate(dataset):
    mh = create_minhash(item["text"])
    # 查询是否有近似重复
    result = lsh.query(mh)
    if not result:
        lsh.insert(str(idx), mh)
        deduped.append(item)
    else:
        print(f"文档{idx}与{result}近似重复，已去除")
```

这里用到了LSH（Locality Sensitive Hashing，局部敏感哈希）来做近似最近邻搜索。如果不做LSH优化，每来一条新文本就要和所有已有文本逐一比较签名向量，数据量一大计算量就爆炸了——百万条数据的两两比较是5000亿次运算。LSH的核心原理是：设计一种特殊的哈希函数，让相似的数据点有很大概率被映射到同一个哈希桶中，不相似的数据点大概率被分到不同的桶。查询时只需比较同桶内的候选数据，大幅减少比较次数。在百万级数据集上，LSH能把去重时间从几小时缩短到几分钟。

> 金句：精确去重解决"复制粘贴"，模糊去重解决"洗稿搬运"。在大模型数据清洗中，两者缺一不可。

### 质量过滤：长度、语言与乱码检测

去重之后，还要做质量过滤。不是所有文本都适合喂给模型——太短的、语言不对的、乱码的，都要清掉。质量过滤的目标是：只保留信息量足够、语言正确、内容有意义的文本。

**长度过滤**：太短的文本信息量不足。一篇只有"好的"两个字的文本，对模型训练毫无价值——它学不到任何有用的语言模式。通常设置一个最小长度阈值，比如50个字符。同时也可以设最大长度，防止超长文档占用过多内存或导致训练时显存溢出。一般来说，50到100000字符的范围是比较合理的。

**语言过滤**：如果你做的是中文模型，那英文、日文、阿拉伯文的数据就需要过滤掉。混入大量外语数据会干扰模型的学习，导致生成的文本语言混乱。语言检测可以用`langdetect`库，它基于Google的Language Detection库，支持55种语言。或者用`fasttext`的语言识别模型，它基于Facebook的fasttext库，支持176种语言，准确率更高速度更快。

**乱码检测**：爬虫数据中经常出现乱码——一段看起来像中文但实际是编码错误产生的无意义字符。比如`\xe4\xb8\xad\xe6\x96\x87`用错误编码解码后可能产生看似中文但毫无意义的字符序列。乱码检测的思路是：统计可打印字符的比例，或者用语言模型计算困惑度。Perplexity（PPL，困惑度）是语言模型评估文本自然程度的指标，PPL越低表示文本越自然，PPL过高的文本大概率是乱码或无意义内容。

```python
import re
from langdetect import detect

def quality_filter(text, min_len=50, max_len=100000):
    # 长度过滤
    if len(text) < min_len or len(text) > max_len:
        return False

    # 乱码检测：可打印字符比例
    printable_ratio = sum(1 for c in text if c.isprintable()) / len(text)
    if printable_ratio < 0.85:
        return False

    # 中文字符比例（构建中文模型时用）
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    if chinese_chars / len(text) < 0.3:
        return False

    # 语言检测
    try:
        lang = detect(text)
        if lang != "zh-cn":
            return False
    except:
        return False

    # 检测连续重复字符（如"啊啊啊啊啊啊啊"）
    if re.search(r"(.)\1{10,}", text):
        return False

    return True

# 应用过滤
clean_data = [item for item in deduped
              if quality_filter(item["text"])]
```

这些过滤规则看起来简单，但效果立竿见影。怕浪猫在实际项目中，质量过滤通常会去掉30%-50%的数据。去掉的这些数据如果不过滤，不仅浪费训练资源，还会拉低模型整体质量——模型会从乱码中学到错误的语言模式，从过短文本中学到碎片化的表达，从外语文本中产生语言混淆。

> 金句：质量过滤的原则是宁缺毋滥。少喂一点干净数据，远比多喂一堆脏数据效果好。

### 敏感信息脱敏

训练数据中可能包含敏感信息：手机号、身份证号、邮箱地址、银行卡号、IP地址等。这些信息如果不脱敏就直接用于训练，一方面有隐私泄露的法律风险——在很多国家和地区，未经授权使用个人数据是违法行为；另一方面模型可能在生成时"复述"出这些真实的个人信息，造成严重后果。之前有研究发现，GPT-2在特定提示下能够输出训练数据中的真实姓名、电话号码和地址，这就是敏感信息未脱敏的后果。

```python
import re

def desensitize(text):
    # 手机号脱敏: 138****5678
    text = re.sub(
        r"1[3-9]\d{9}",
        lambda m: m.group()[:3] + "****" + m.group()[-4:],
        text
    )

    # 身份证号脱敏
    text = re.sub(
        r"\d{17}[\dXx]",
        lambda m: m.group()[:6] + "********" + m.group()[-4:],
        text
    )

    # 邮箱地址脱敏
    text = re.sub(
        r"[\w.+-]+@[\w-]+\.[\w.-]+",
        "[EMAIL]",
        text
    )

    # 银行卡号脱敏
    text = re.sub(
        r"\d{16,19}",
        lambda m: m.group()[:4] + "****" + m.group()[-4:],
        text
    )

    # IP地址脱敏
    text = re.sub(
        r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}",
        "[IP]",
        text
    )

    return text
```

脱敏策略有两种：掩码替换和完全替换。掩码替换保留部分信息，如`138****5678`，适合需要保留数据格式特征的场景。完全替换用占位符替代，如`[EMAIL]`，安全性更高。训练数据通常用完全替换更安全——掩码保留的信息仍然可能被模型学到并还原。特别是对于大模型来说，它的记忆能力非常强，即使掩码后的部分信息，也可能通过上下文推理还原出完整信息。

> 金句：脱敏不是可选项，是底线。模型可以不聪明，但不能泄露用户隐私。

### 数据格式标准化

最后一道清洗工序是格式标准化。经过前面的去重、过滤、脱敏后，数据还需要统一格式才能用于训练。标准化包括多个方面：统一换行符（Windows用`\r\n`，Unix用`\n`，老Mac用`\r`，全部统一为`\n`）、统一引号风格（中文引号和英文引号的统一）、统一数字格式（全角数字转半角）、去除首尾空白字符等。

```python
import re
import unicodedata

def standardize(text):
    # Unicode NFKC标准化（全角转半角等）
    text = unicodedata.normalize("NFKC", text)

    # 统一换行符
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # 统一引号
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2018", "'").replace("\u2019", "'")

    # 去除首尾空白
    text = text.strip()

    # 段落间统一为双换行
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text
```

格式标准化的目标是保证数据的一致性。如果训练数据中换行符混用、引号风格不一致、全角半角混排，模型在学习时会产生困惑——它可能把全角"1"和半角"1"当成两个不同的token，把`\r\n`和`\n`当成不同的换行方式。这些不一致会稀释训练信号，降低模型的学习效率。

## 10.5 实战项目：私有训练数据集构建全流程

讲了这么多理论，怕浪猫带大家做一个完整的实战项目——从零开始构建一个私有训练数据集。场景设定：为一个医疗问答模型准备训练数据，数据来源是公开的医学知识网站。这个场景在垂直领域大模型开发中非常常见。

### 整体流程设计

完整的流程分为五步，每一步都有明确的输入和输出：

1. 数据采集：爬取目标网站的医学文章，输出原始HTML
2. 初步清洗：去除HTML标签、处理编码问题，输出纯文本
3. 去重处理：精确去重加MinHash模糊去重，输出无重复文本
4. 质量过滤：长度过滤、语言检测、乱码检测加敏感信息脱敏，输出高质量文本
5. 格式标准化：统一格式，输出最终JSONL文件

这个流程不是一次走完就行的——你需要迭代。比如清洗后发现数据量不够，需要回去多爬一些网站；质量过滤后发现某些规则太严格，误杀了很多有效数据，需要调整阈值；去重后发现某些近似重复其实是不同的文章只是格式相似，需要调整相似度阈值。数据工程是一个不断迭代优化的过程，第一版Pipeline一定不是最终版。

### 完整Pipeline实现

下面是完整的Pipeline代码，把前面讲的所有步骤串联起来。代码采用面向对象的设计，每个清洗步骤封装为一个方法，方便单独测试和调整。

```python
import json
import re
import hashlib
import unicodedata
import requests
from bs4 import BeautifulSoup
from charset_normalizer import from_bytes
from datasketch import MinHash, MinHashLSH

class DataPipeline:
    def __init__(self, output_path):
        self.output_path = output_path
        self.checkpoint_path = output_path + ".ckpt"
        self.completed = set()
        self._load_checkpoint()

    def crawl(self, url):
        """步骤1: 采集数据"""
        if url in self.completed:
            return None
        resp = requests.get(url, timeout=10,
                            headers={"User-Agent": "Mozilla/5.0"})
        result = from_bytes(resp.content).best()
        html = str(result) if result else resp.text
        return html

    def clean_html(self, html):
        """步骤2: HTML清洗"""
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup.find_all(["script", "style", "nav"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        return "\n".join(lines)
```

上面是Pipeline的核心骨架，构造方法接收输出路径并加载断点。crawl方法负责采集数据，clean_html方法负责去除HTML标签。下面继续补充去重方法：

```python
    def dedup_exact(self, items):
        """步骤3a: 精确去重"""
        seen = set()
        result = []
        for item in items:
            h = hashlib.md5(item["text"].encode()).hexdigest()
            if h not in seen:
                seen.add(h)
                result.append(item)
        return result

    def dedup_fuzzy(self, items, threshold=0.85):
        """步骤3b: MinHash模糊去重"""
        lsh = MinHashLSH(threshold=threshold, num_perm=128)
        result = []
        for idx, item in enumerate(items):
            m = MinHash(num_perm=128)
            for i in range(len(item["text"]) - 2):
                m.update(item["text"][i:i+3].encode("utf-8"))
            if not lsh.query(m):
                lsh.insert(str(idx), m)
                result.append(item)
        return result
```

MinHash去重这一步是比较耗时的，时间复杂度大致是O(n * L * k)，其中n是文档数量，L是平均文档长度，k是num_perm（哈希函数数量）。如果数据量超过百万条，建议用分布式计算框架（如Apache Spark）来做。但对于中小规模数据集（几十万条以内），单机版的datasketch完全够用，通常几分钟到十几分钟就能跑完。

接下来是质量过滤和格式标准化方法：

```python
    def filter_quality(self, items, min_len=100):
        """步骤4: 质量过滤 + 脱敏"""
        result = []
        for item in items:
            text = item["text"]
            if len(text) < min_len:
                continue
            # 敏感信息脱敏
            text = re.sub(r"1[3-9]\d{9}", "[PHONE]", text)
            text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+",
                          "[EMAIL]", text)
            # Unicode标准化
            text = unicodedata.normalize("NFKC", text)
            text = re.sub(r"\s+", " ", text).strip()
            item["text"] = text
            result.append(item)
        return result

    def save(self, items):
        """步骤5: 输出JSONL"""
        with open(self.output_path, "w", encoding="utf-8") as f:
            for item in items:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
```

### 运行Pipeline

把所有步骤串起来运行：

```python
# 实例化Pipeline
pipeline = DataPipeline("medical_train.jsonl")

# 步骤1: 采集
raw_pages = []
for url in target_urls:
    html = pipeline.crawl(url)
    if html:
        raw_pages.append({"html": html, "source": url})

# 步骤2: HTML清洗
clean_texts = [{"text": pipeline.clean_html(p["html"]),
                "source": p["source"]} for p in raw_pages]

# 步骤3: 去重
deduped = pipeline.dedup_exact(clean_texts)
deduped = pipeline.dedup_fuzzy(deduped, threshold=0.85)

# 步骤4: 质量过滤
filtered = pipeline.filter_quality(deduped, min_len=100)

# 步骤5: 保存
pipeline.save(filtered)

print(f"原始数据: {len(raw_pages)} → 最终数据: {len(filtered)}")
```

在实际项目中，怕浪猫建议把这个Pipeline做成命令行工具，支持配置文件和参数调整。比如通过YAML配置爬取规则、清洗阈值、输出格式等。这样在不同项目之间复用时，改配置文件就行，不用改代码。另外，每个步骤都应该有日志输出，记录处理了多少条数据、去重了多少条、过滤了多少条，方便排查问题。

> 金句：好的数据Pipeline不是一次性写的，是一轮轮迭代打磨出来的。第一版一定会出问题，关键是能快速定位、快速修正。

### 数据质量评估

清洗完成后，怎么知道数据质量好不好？不能凭感觉，要用数据说话。怕浪猫通常从以下几个维度评估：

**覆盖率**：数据是否覆盖了你需要的知识领域？可以做关键词统计，看数据中是否包含足够多的领域术语。如果是医疗数据，检查是否包含常见疾病名、药品名、症状描述等关键词。覆盖率不够的话，需要补充数据源。

**多样性**：数据是否存在模式单一的问题？统计文本长度分布、词汇丰富度。TTR（Type-Token Ratio，类型-标记比，不同词的数量除以总词数）是衡量词汇多样性的常用指标。TTR太低说明文本用词重复性高，模型能学到的词汇有限。

**纯净度**：残留噪声有多少？随机抽样几百条数据人工检查，看有没有HTML残留、乱码、不相关内容。纯净度低于95%的话，说明清洗规则还需要优化。

```python
import numpy as np

def assess_quality(data_path, sample_size=1000):
    texts = []
    with open(data_path, "r", encoding="utf-8") as f:
        for line in f:
            texts.append(json.loads(line)["text"])

    lengths = [len(t) for t in texts]
    print(f"总条数: {len(texts)}")
    print(f"平均长度: {np.mean(lengths):.0f}")
    print(f"中位数长度: {np.median(lengths):.0f}")
    print(f"长度分布: P10={np.percentile(lengths, 10):.0f}, "
          f"P90={np.percentile(lengths, 90):.0f}")

    # 词汇丰富度
    all_chars = "".join(texts[:sample_size])
    ttr = len(set(all_chars)) / len(all_chars)
    print(f"字符TTR: {ttr:.4f}")

    # 随机抽样检查
    samples = np.random.choice(texts, size=min(5, len(texts)))
    for i, s in enumerate(samples):
        print(f"\n--- 样本{i+1} (长度{len(s)}) ---")
        print(s[:200])
```

在实际项目中，怕浪猫通常在Pipeline运行完后自动执行评估脚本，生成一份数据质量报告。如果发现异常指标——比如平均长度突然变短、TTR异常低、抽样检查发现大量噪声——就说明清洗过程中可能出了问题，需要回头排查。这份报告也是向团队和上级展示数据质量的有力依据。

### 常见踩坑总结

怕浪猫在做数据工程这几年，踩过的坑比写过的代码还多。最后总结几个高频踩坑点，希望能帮大家少走弯路：

**坑一：编码地狱**。爬取多个网站时，编码不一致是最常见的问题。有的网站用UTF-8，有的用GBK，有的甚至同一个网站不同页面用不同编码。一定要在采集阶段就统一转成UTF-8，不要等到后面再处理。`charset-normalizer`是你的好朋友，比老牌的`chardet`准确率高很多。

**坑二：内存爆炸**。处理GB级数据时，不要用`json.load()`一次性读取整个文件到内存。一个5GB的JSON文件加载到内存可能占用15GB以上（JSON解析后的对象比原始文本大得多）。用JSONL格式加逐行读取，内存占用恒定在很小水平。

**坑三：去重不彻底**。只做精确去重不够，一定要做模糊去重。但模糊去重的阈值不能设太低，0.8到0.85是经验值。低于0.7会误杀大量相似但内容不同的文本——比如两篇不同的新闻报道了同一个事件，用词相似但内容不同，阈值太低会把其中一篇误删。

**坑四：脱敏遗漏**。正则表达式写得不全，漏掉了一些格式的敏感信息。比如手机号可能带空格或横线（`138 1234 5678`或`138-1234-5678`），邮箱可能用中文"@"符号。建议用多个正则覆盖不同格式，并进行人工抽样验证脱敏效果。

**坑五：没有断点续爬**。爬到一半程序崩了，前面爬的数据全丢了，只能从头再来。一定要实现checkpoint机制，这不是可选项，是生产环境的基本要求。数据量大的时候，一次完整的爬取可能要跑几天，断点续爬能帮你节省大量重复劳动。

**坑六：忽略robots.txt**。爬虫前一定要检查目标网站的robots.txt文件，遵守爬取规则。这不仅是法律要求，也是基本的职业道德。有些网站虽然技术上可以爬到数据，但robots.txt明确禁止，那就不要爬。合规是数据工程师的基本素养。

> 金句：踩坑不可怕，可怕的是同一个坑踩两次。记录、复盘、改进，这是数据工程师成长的唯一路径。

## 系列进度 10/19

怕浪猫说：数据是大模型的粮草，粮草不济，再好的兵也打不了仗。这一章从爬虫到清洗，从去重到脱敏，把数据准备的完整流程走了一遍。看起来活儿不复杂，但每一个环节都有坑等着你。怕浪猫的建议是：把这套Pipeline跑通一遍，用真实数据踩一遍坑，你就真正理解大模型数据工程是怎么回事了。数据工程不是 glamorous 的工作，但它决定了模型的上限。下一章咱们聊聊文本与分词的艺术——大模型是怎么"读"文本的，分词算法的原理和实现，这可是理解Transformer架构的前置知识。怕浪猫在第11章等你，不见不散。
