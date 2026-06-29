# 第14章 Streamlit实战：AI交互与系统报告生成平台

> 90%的爬虫教程止步于"数据拿到了"，但真正值钱的环节是从数据到洞察的最后一公里。当你把爬虫采集的数据喂给大模型，再生成一份带图表的系统报告导出PDF，整个链路的价值至少翻3倍。

我是怕浪猫，这一章来做一个能把前面所有章节串联起来的实战项目：用Streamlit搭建一个AI交互与系统报告生成平台。这个平台能调用DeepSeek大模型进行智能问答，支持流式输出，能获取系统信息，能生成数据可视化图表，最后还能把整个报告导出为PDF。

如果你跟着前面的章节一路做过来，手里应该已经有一套能跑的爬虫系统了。但数据采回来之后呢？老板要看报告，客户要看洞察，你自己也要做分析。手动写报告太慢，复制粘贴到ChatGPT再截图太low。这一章就是解决"数据到最后呈现"这个闭环的。

## 14.1 DeepSeek模型交互：Token管理与API调用

### 14.1.1 DeepSeek API基础认知

DeepSeek是一个国产大语言模型（Large Language Model，LLM）平台，提供兼容OpenAI接口规范的API（Application Programming Interface，应用程序编程接口）服务。选它有两个原因：第一，价格便宜，输入每百万Token（Token是语言模型中处理文本的基本计量单位，大约1个中文字符约等于1.5个Token）只要1块钱；第二，接口完全兼容OpenAI SDK，迁移成本几乎为零。

调用DeepSeek API的核心流程如下：

```
用户输入文本
      |
      v
+------------------+
| Token计算与预算   |
| (tiktoken库估算)  |
+------------------+
      |
      v
+------------------+
| 构建请求消息       |
| (system + history)|
+------------------+
      |
      v
+------------------+
| HTTP请求到API     |
| (POST /v1/chat)   |
+------------------+
      |
      v
+------------------+
| 解析响应 / 流式    |
| (SSE或完整JSON)   |
+------------------+
      |
      v
+------------------+
| Token用量统计     |
| (prompt+completion)|
+------------------+
```

整个过程的关键在于Token管理。大模型API按Token计费，不管理Token就等于不管理成本。

### 14.1.2 API客户端封装

先封装一个DeepSeek客户端，处理API密钥管理、请求构建、错误重试这些基础工作。安装依赖：

```bash
pip install openai tiktoken httpx
```

为什么用openai库而不是直接用requests？因为openai SDK（Software Development Kit，软件开发工具包）已经处理了连接池、超时、自动重试、流式解析等细节，自己造轮子不划算。

```python
from openai import OpenAI
import tiktoken

class DeepSeekClient:
    def __init__(self, api_key: str, base_url: str = None):
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url or "https://api.deepseek.com"
        )
        self.model = "deepseek-chat"
        self.encoding = tiktoken.get_encoding("cl100k_base")
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0

    def count_tokens(self, text: str) -> int:
        """估算文本的Token数量"""
        return len(self.encoding.encode(text))

    def chat(self, messages: list, temperature: float = 0.7) -> str:
        """同步对话接口"""
        prompt_tokens = sum(
            self.count_tokens(m["content"]) for m in messages
        )
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
        )
        self.total_prompt_tokens += response.usage.prompt_tokens
        self.total_completion_tokens += response.usage.completion_tokens
        return response.choices[0].message.content
```

这里有个踩坑点：tiktoken官方支持的编码列表里没有专门针对DeepSeek的，但DeepSeek使用的是和GPT-4相同的BPE（Byte Pair Encoding，字节对编码）分词器，所以用`cl100k_base`估算的误差在5%以内，够用了。

### 14.1.3 Token预算管理

在生产环境中，不控制Token用量是很容易翻车的。一个用户连续问10个长问题，可能就把你的API额度烧完了。核心策略是设置Token预算上限：

```python
class TokenBudget:
    def __init__(self, daily_limit: int = 500000):
        self.daily_limit = daily_limit
        self.used = 0

    def can_spend(self, estimated_tokens: int) -> bool:
        return self.used + estimated_tokens <= self.daily_limit

    def spend(self, actual_tokens: int):
        if self.used + actual_tokens > self.daily_limit:
            raise ValueError(
                f"Token预算超限: 已用{self.used}/"
                f"上限{self.daily_limit}"
            )
        self.used += actual_tokens

    def remaining(self) -> int:
        return self.daily_limit - self.used
```

> 怕浪猫踩坑提示：DeepSeek API的`usage`字段返回的是实际消耗Token数，比本地估算准确得多。在开发阶段用tiktoken估算做预算拦截，在生产环境以API返回的实际Token做扣减。

### 14.1.4 错误处理与重试机制

API调用最常见的三类错误：网络超时、速率限制（HTTP 429）、服务端错误（HTTP 5xx）。用指数退避策略处理：

```python
import time
from openai import RateLimitError, APIConnectionError

def call_with_retry(client, messages, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
            )
        except RateLimitError:
            wait = 2 ** attempt
            time.sleep(wait)
        except APIConnectionError as e:
            if attempt == max_retries - 1:
                raise
            time.sleep(1)
    raise RuntimeError("API调用重试次数耗尽")
```

指数退避的核心思想是：每次重试等待时间翻倍（1秒、2秒、4秒），避免所有客户端在同一时刻重试导致服务端被打爆。这个策略在分布式爬虫场景下同样适用。

DeepSeek API官方文档参考：https://platform.deepseek.com/api-docs

## 14.2 流式问答与对话交互界面实现

### 14.2.1 为什么需要流式输出

同步等待大模型生成完整回复再返回，用户体验极差。一个300字的回答可能要等8-10秒，用户盯着空白屏幕不知道系统是在工作还是挂了。流式输出（Server-Sent Events，SSE，服务器发送事件）能让用户看到文字逐字出现，感知延迟降低到首字时间（Time To First Token，TTFT）的500ms以内。

Streamlit从1.24版本开始原生支持流式输出，通过`st.write_stream()`函数可以直接渲染生成器产出的文本流。原理对比：

```
同步模式：
  用户提问 -> [等待8秒] -> 一次性返回300字 -> 用户看到

流式模式：
  用户提问 -> [0.5秒首字] -> 逐字返回(持续7.5秒) -> 用户实时看到
```

### 14.2.2 流式响应生成器

实现一个流式聊天函数，用Python生成器逐块产出文本：

```python
def stream_chat(client, messages: list, temperature: float = 0.7):
    """流式对话生成器，逐块yield文本"""
    response = client.chat.completions.create(
        model=client.model,
        messages=messages,
        temperature=temperature,
        stream=True,
    )
    for chunk in response:
        if chunk.choices[0].delta.content is not None:
            yield chunk.choices[0].delta.content
```

关键点在于`stream=True`参数。设置后API不会等所有内容生成完毕再返回，而是通过SSE协议持续推送增量内容。每个chunk包含一小段文本（通常1-3个Token），前端拼接后就是完整回复。

### 14.2.3 Streamlit对话界面搭建

Streamlit的`st.chat_message`和`st.chat_input`组件专门为对话场景设计。核心界面结构：

```python
import streamlit as st

st.title("AI系统分析助手")
st.caption("基于DeepSeek的智能问答与报告生成平台")

# 初始化对话历史
if "messages" not in st.session_state:
    st.session_state.messages = []

# 渲染历史消息
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# 接收用户输入
if prompt := st.chat_input("请输入你的问题"):
    # 显示用户消息
    with st.chat_message("user"):
        st.markdown(prompt)
    st.session_state.messages.append(
        {"role": "user", "content": prompt}
    )

    # 流式显示AI回复
    with st.chat_message("assistant"):
        response = st.write_stream(
            stream_chat(client, st.session_state.messages)
        )
    st.session_state.messages.append(
        {"role": "assistant", "content": response}
    )
```

这段代码有几个值得注意的设计：

第一，`st.session_state`是Streamlit的会话状态管理机制。Streamlit每次用户交互都会重新运行整个脚本，没有session_state的话对话历史会丢失。

第二，`st.chat_message`会渲染一个带头像的聊天气泡，`role`参数决定是用户还是AI，Streamlit会自动应用不同的样式。

第三，`st.write_stream`接收一个生成器，自动处理流式渲染。它内部会频繁调用`st.markdown`追加内容，但做了性能优化，不会因为频繁刷新导致界面闪烁。

> 金句：流式输出的本质不是让AI变快，而是让用户的等待感变弱。500ms的首字延迟，比8秒的完整返回，体感快了不止16倍。

### 14.2.4 对话上下文窗口管理

大模型有上下文窗口限制（DeepSeek-chat支持64K Token），对话轮数多了之后历史消息会超出窗口。需要实现一个滑动窗口截断策略：

```python
def trim_messages(messages: list, max_tokens: int = 60000):
    """截断对话历史，保留system和最近的消息"""
    if not messages:
        return messages
    system_msgs = [m for m in messages if m["role"] == "system"]
    chat_msgs = [m for m in messages if m["role"] != "system"]
    while chat_msgs and sum(
        count_tokens(m["content"]) for m in system_msgs + chat_msgs
    ) > max_tokens:
        chat_msgs.pop(0)  # 移除最早的非system消息
    return system_msgs + chat_msgs
```

这个策略保证system prompt始终保留（因为它定义了AI的角色和行为规范），只截断早期的对话记录。设定60K Token上限给64K窗口留了4K的安全余量，避免边界条件下超出限制。

## 14.3 侧边栏预设问题配置与对话管理

### 14.3.1 侧边栏配置面板设计

一个好的AI应用不是把输入框丢给用户就完事，而是要提供智能的预设选项，降低使用门槛。Streamlit的`st.sidebar`可以在页面左侧创建一个持久的配置面板：

```python
with st.sidebar:
    st.header("配置面板")

    # API配置
    api_key = st.text_input(
        "DeepSeek API Key", type="password",
        value=st.session_state.get("api_key", ""),
    )
    if api_key:
        st.session_state.api_key = api_key

    # 模型参数
    temperature = st.slider(
        "Temperature (创造性)", 0.0, 2.0, 0.7, 0.1
    )
    max_history = st.number_input(
        "保留对话轮数", 5, 50, 20
    )

    # 预设问题
    st.subheader("预设问题")
    preset_questions = {
        "系统状态分析": "请分析当前系统运行状态，指出潜在风险",
        "性能优化建议": "基于当前系统信息，给出3条优化建议",
        "安全检查清单": "列出当前系统需要关注的安全检查项",
    }
    for label, question in preset_questions.items():
        if st.button(label, key=f"preset_{label}"):
            st.session_state.pending_input = question
```

侧边栏的配置在整个会话期间持久存在，用户可以在对话过程中随时调整参数。预设问题按钮的设计很重要——很多用户不知道该问什么，给出几个高质量预设能大幅提升使用率。

### 14.3.2 对话管理与会话隔离

在多用户场景下（即使Streamlit默认是单用户模式，但在团队内共享时），需要做好会话隔离。Streamlit的session_state天然按浏览器会话隔离，但需要注意几个坑：

```python
def init_session_state():
    """初始化会话状态，避免KeyError"""
    defaults = {
        "messages": [],
        "api_key": "",
        "total_tokens": 0,
        "conversation_id": str(uuid.uuid4()),
        "pending_input": None,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value
```

> 怕浪猫踩坑提示：Streamlit的session_state在页面刷新时会保留，但在某些部署环境下（比如streamlit run重启），状态会丢失。如果需要持久化对话历史，建议额外写入本地文件或数据库。

### 14.3.3 多对话管理

进阶一点，支持多个独立对话，用户可以在不同话题间切换：

```python
if "conversations" not in st.session_state:
    st.session_state.conversations = {
        "default": {"messages": [], "title": "新对话"}
    }
    st.session_state.current_convo = "default"

with st.sidebar:
    st.subheader("对话管理")
    # 新建对话
    if st.button("新建对话"):
        convo_id = str(uuid.uuid4())[:8]
        st.session_state.conversations[convo_id] = {
            "messages": [], "title": f"对话_{convo_id}"
        }
        st.session_state.current_convo = convo_id
    # 对话列表
    for cid, convo in st.session_state.conversations.items():
        label = convo["title"]
        if st.button(label, key=f"convo_{cid}"):
            st.session_state.current_convo = cid
            st.rerun()
    # 清空当前对话
    if st.button("清空当前对话"):
        cid = st.session_state.current_convo
        st.session_state.conversations[cid]["messages"] = []
        st.rerun()
```

这里用`st.rerun()`强制页面重新执行，确保切换对话后界面立即更新。每个对话维护独立的messages列表，互不干扰。对话ID用UUID（Universally Unique Identifier，通用唯一识别码）的前8位，简单够用。

### 14.3.4 System Prompt模板配置

System Prompt（系统提示词）决定了AI的角色定位和行为风格。把它做成可配置的：

```python
SYSTEM_PROMPTS = {
    "系统分析师": (
        "你是一位专业的系统分析师。"
        "请基于用户提供的系统信息进行分析，"
        "用简洁专业的语言给出诊断结果和建议。"
        "回答要分点陈述，重点突出。"
    ),
    "安全顾问": (
        "你是一位网络安全顾问。"
        "请从安全角度审视系统信息，"
        "重点关注端口暴露、权限配置、日志异常等风险点。"
    ),
    "性能专家": (
        "你是一位性能优化专家。"
        "请分析系统瓶颈，"
        "给出可操作的性能优化建议，"
        "包括但不限于CPU、内存、磁盘IO优化。"
    ),
}

with st.sidebar:
    role = st.selectbox(
        "AI角色", list(SYSTEM_PROMPTS.keys())
    )
    system_prompt = SYSTEM_PROMPTS[role]
```

下拉框切换角色后，下次对话就会使用新的System Prompt。注意System Prompt要放在messages列表的第一条，role为`"system"`。

## 14.4 系统信息获取与前端展示

### 14.4.1 为什么要在Streamlit里展示系统信息

前面章节的爬虫系统跑在各种服务器和模拟器上，出问题时需要快速了解系统状态。与其SSH登录逐个查看，不如在Web面板上一目了然。psutil（Python System and Process Utilities，Python系统与进程工具库）是获取系统信息的最佳选择。

安装依赖：

```bash
pip install psutil
```

psutil能获取的信息维度：

| 信息类别 | 具体指标 | psutil方法 |
|---------|---------|-----------|
| CPU | 使用率、核心数、频率 | psutil.cpu_percent(), cpu_count() |
| 内存 | 总量、已用、可用、swap | psutil.virtual_memory() |
| 磁盘 | 分区、使用率、IO速度 | psutil.disk_usage(), disk_io_counters() |
| 网络 | 连接数、IO流量、网卡信息 | psutil.net_connections(), net_io_counters() |
| 进程 | 进程列表、资源占用 | psutil.process_iter() |

### 14.4.2 系统信息采集模块

封装一个SystemInfo类，统一采集系统指标：

```python
import psutil
import platform
from datetime import datetime

class SystemInfo:
    @staticmethod
    def get_cpu_info() -> dict:
        return {
            "物理核心数": psutil.cpu_count(logical=False),
            "逻辑核心数": psutil.cpu_count(logical=True),
            "CPU使用率": f"{psutil.cpu_percent(interval=1)}%",
            "CPU频率": f"{psutil.cpu_freq().current:.0f}MHz",
        }

    @staticmethod
    def get_memory_info() -> dict:
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return {
            "总内存": f"{mem.total / 1024**3:.1f}GB",
            "已用内存": f"{mem.used / 1024**3:.1f}GB",
            "内存使用率": f"{mem.percent}%",
            "Swap使用率": f"{swap.percent}%",
        }

    @staticmethod
    def get_disk_info() -> list:
        disks = []
        for part in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(part.mountpoint)
                disks.append({
                    "挂载点": part.mountpoint,
                    "总容量": f"{usage.total / 1024**3:.1f}GB",
                    "使用率": f"{usage.percent}%",
                })
            except PermissionError:
                continue
        return disks

    @staticmethod
    def get_system_summary() -> dict:
        return {
            "操作系统": platform.platform(),
            "主机名": platform.node(),
            "Python版本": platform.python_version(),
            "系统启动时间": datetime.fromtimestamp(
                psutil.boot_time()
            ).strftime("%Y-%m-%d %H:%M:%S"),
        }
```

> 怕浪猫踩坑提示：`psutil.cpu_percent(interval=1)`会阻塞1秒来采样CPU使用率。在Streamlit中如果在主线程调用会导致页面卡顿。解决方案是用`interval=None`（非阻塞，返回上次调用以来的平均值），首次调用返回0.0是正常的。

### 14.4.3 前端展示与实时刷新

把系统信息渲染到Streamlit页面上，并支持自动刷新：

```python
import streamlit as st

st.header("系统信息面板")

# 系统概览
summary = SystemInfo.get_system_summary()
col1, col2, col3 = st.columns(3)
with col1:
    st.metric("操作系统", summary["操作系统"][:20])
with col2:
    st.metric("主机名", summary["主机名"])
with col3:
    st.metric("Python版本", summary["Python版本"])

# CPU和内存
col1, col2 = st.columns(2)
with col1:
    st.subheader("CPU状态")
    cpu_info = SystemInfo.get_cpu_info()
    for k, v in cpu_info.items():
        st.text(f"{k}: {v}")
with col2:
    st.subheader("内存状态")
    mem_info = SystemInfo.get_memory_info()
    for k, v in mem_info.items():
        st.text(f"{k}: {v}")

# 磁盘信息表格
st.subheader("磁盘分区")
disk_info = SystemInfo.get_disk_info()
st.dataframe(disk_info, use_container_width=True)
```

`st.metric`是Streamlit专门为指标展示设计的组件，支持显示数值和变化趋势。`st.dataframe`能自动把列表数据渲染成表格，支持排序和搜索。

如果需要实时刷新，Streamlit有`st_autorefresh`组件（来自streamlit-autorefresh库）：

```python
from streamlit_autorefresh import st_autorefresh

# 每30秒自动刷新
st_autorefresh(interval=30000, key="system_refresh")
```

> 金句：系统监控的核心不是数据多，而是数据准、数据新。一个30秒刷新一次的实时面板，比一份10页的静态报告有用100倍。

### 14.4.4 将系统信息注入AI对话

最有价值的操作是把系统信息喂给AI，让它做智能分析：

```python
def build_system_context() -> str:
    """构建系统信息上下文文本"""
    summary = SystemInfo.get_system_summary()
    cpu = SystemInfo.get_cpu_info()
    mem = SystemInfo.get_memory_info()
    disks = SystemInfo.get_disk_info()
    
    lines = ["当前系统信息如下：", ""]
    lines.append("【系统概览】")
    for k, v in summary.items():
        lines.append(f"- {k}: {v}")
    lines.append("\n【CPU状态】")
    for k, v in cpu.items():
        lines.append(f"- {k}: {v}")
    lines.append("\n【内存状态】")
    for k, v in mem.items():
        lines.append(f"- {k}: {v}")
    lines.append("\n【磁盘分区】")
    for d in disks:
        lines.append(f"- {d['挂载点']}: {d['使用率']}")
    return "\n".join(lines)

# 用户点击"分析系统"按钮时
if st.button("AI分析系统状态"):
    context = build_system_context()
    analysis_prompt = (
        f"{context}\n\n"
        "请分析以上系统信息，指出潜在风险并给出优化建议。"
    )
    st.session_state.messages.append(
        {"role": "user", "content": analysis_prompt}
    )
    with st.chat_message("assistant"):
        response = st.write_stream(
            stream_chat(client, st.session_state.messages)
        )
    st.session_state.messages.append(
        {"role": "assistant", "content": response}
    )
```

这样AI拿到的不是用户的模糊描述，而是精确的系统指标数据，分析结果的质量会大幅提升。psutil官方文档参考：https://psutil.readthedocs.io/

## 14.5 数据可视化与图表生成

### 14.5.1 Streamlit图表体系总览

Streamlit支持多种图表库，各有适用场景：

| 图表库 | 适用场景 | 交互性 | 学习成本 |
|--------|---------|--------|---------|
| st.line_chart/bar_chart | 快速简单图表 | 低 | 极低 |
| Plotly | 交互式复杂图表 | 高 | 中 |
| Altair | 声明式统计图表 | 中 | 中 |
| Matplotlib | 静态高质量图表 | 无 | 中 |

对于系统报告场景，怕浪猫推荐用Plotly做交互式图表（在线浏览时用），同时用Matplotlib生成静态图片（导出PDF时用）。

### 14.5.2 CPU与内存历史趋势图

先用psutil采集一段历史数据，用Plotly渲染交互式趋势图：

```python
import plotly.graph_objects as go
from plotly.subplots import make_subplots

def render_resource_trend(history: list):
    """渲染CPU和内存历史趋势图"""
    fig = make_subplots(
        rows=2, cols=1,
        subplot_titles=("CPU使用率", "内存使用率"),
        vertical_spacing=0.15,
    )
    times = [h["time"] for h in history]
    cpu_vals = [h["cpu"] for h in history]
    mem_vals = [h["memory"] for h in history]
    
    fig.add_trace(
        go.Scatter(x=times, y=cpu_vals, name="CPU%",
                   line=dict(color="#2196F3", width=2)),
        row=1, col=1,
    )
    fig.add_trace(
        go.Scatter(x=times, y=mem_vals, name="内存%",
                   line=dict(color="#FF5722", width=2)),
        row=1, col=1,
    )
    fig.update_layout(
        height=400, showlegend=True,
        margin=dict(l=20, r=20, t=40, b=20),
    )
    st.plotly_chart(fig, use_container_width=True)
```

`st.plotly_chart`会渲染一个完全交互式的Plotly图表，支持鼠标悬停查看数值、缩放、平移、导出PNG。`make_subplots`把多个子图组合在一起，适合对比展示关联指标。

### 14.5.3 网络流量可视化

网络IO数据用面积图展示效果更好，能直观体现流量波峰：

```python
def render_network_chart(net_history: list):
    """网络流量面积图"""
    fig = go.Figure()
    times = [h["time"] for h in net_history]
    sent = [h["bytes_sent"] / 1024 for h in net_history]
    recv = [h["bytes_recv"] / 1024 for h in net_history]
    
    fig.add_trace(go.Scatter(
        x=times, y=recv, fill="tozeroy",
        name="接收(KB/s)", line=dict(color="#4CAF50"),
    ))
    fig.add_trace(go.Scatter(
        x=times, y=sent, fill="tonexty",
        name="发送(KB/s)", line=dict(color="#FF9800"),
    ))
    fig.update_layout(
        title="网络流量趋势",
        xaxis_title="时间", yaxis_title="KB/s",
    )
    st.plotly_chart(fig, use_container_width=True)
```

`fill="tozeroy"`表示从曲线到零轴填充，`fill="tonexty"`表示从当前曲线到上一条曲线填充，这样两个面积图叠加在一起效果很清晰。

### 14.5.4 进程资源占用Top10

用水平柱状图展示资源占用最高的进程：

```python
def render_top_processes():
    """渲染资源占用Top10进程"""
    procs = []
    for p in psutil.process_iter(
        ["pid", "name", "cpu_percent", "memory_percent"]
    ):
        try:
            info = p.info
            info["cpu_percent"] = info["cpu_percent"] or 0
            procs.append(info)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    top_cpu = sorted(procs, key=lambda x: x["cpu_percent"],
                     reverse=True)[:10]
    
    fig = go.Figure(go.Bar(
        x=[p["cpu_percent"] for p in top_cpu],
        y=[p["name"][:15] for p in top_cpu],
        orientation="h",
        marker=dict(color="#E91E63"),
    ))
    fig.update_layout(
        title="CPU占用Top10进程",
        xaxis_title="CPU%", yaxis_title="进程",
        height=350,
    )
    st.plotly_chart(fig, use_container_width=True)
```

> 金句：可视化不是装饰，而是把数据翻译成人类大脑能直接理解的图形语言。一行图表的信息量，抵得上一篇千字分析报告。

### 14.5.5 Matplotlib静态图表生成（用于PDF导出）

Plotly图表是前端渲染的JavaScript对象，无法直接嵌入PDF。需要用Matplotlib生成静态图片：

```python
import matplotlib
matplotlib.use("Agg")  # 非交互式后端
import matplotlib.pyplot as plt
import io

def generate_cpu_chart_png(history: list) -> bytes:
    """生成CPU趋势图的PNG图片"""
    fig, ax = plt.subplots(figsize=(8, 3), dpi=150)
    times = range(len(history))
    cpu_vals = [h["cpu"] for h in history]
    
    ax.fill_between(times, cpu_vals, alpha=0.3, color="#2196F3")
    ax.plot(times, cpu_vals, color="#2196F3", linewidth=1.5)
    ax.set_title("CPU使用率趋势", fontsize=12)
    ax.set_ylabel("使用率(%)", fontsize=10)
    ax.set_ylim(0, 100)
    ax.grid(True, alpha=0.3)
    
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()
```

`matplotlib.use("Agg")`设置为非交互式后端，避免在无显示环境（服务器、Docker容器）下报错。图片保存到BytesIO缓冲区而不是文件，避免磁盘IO。Plotly官方文档参考：https://plotly.com/python/

## 14.6 系统报告导出为PDF

### 14.6.1 PDF生成方案对比

Python生态里生成PDF有几个主流方案：

| 方案 | 原理 | 优点 | 缺点 |
|------|------|------|------|
| ReportLab | 编程式绘制PDF | 精确控制布局 | 学习曲线陡峭 |
| WeasyPrint | HTML/CSS转PDF | 前端友好，样式丰富 | 依赖系统库 |
| fpdf2 | 轻量级PDF生成 | 简单快速 | 中文支持需额外处理 |
| pdfkit + wkhtmltopdf | HTML转PDF | 支持复杂HTML | 依赖外部二进制 |

综合考虑，怕浪猫推荐用ReportLab。虽然API稍微复杂，但它不依赖任何系统级库，pip install就能用，而且对中文字体的支持非常可控。

安装依赖：

```bash
pip install reportlab
```

### 14.6.2 中文字体处理

ReportLab默认不支持中文，必须注册中文字体。macOS系统自带PingFang字体，Linux需要安装文泉驿或思源黑体：

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import platform

def register_chinese_font():
    """注册中文字体，返回字体名"""
    font_paths = {
        "Darwin": [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
        ],
        "Linux": [
            "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        ],
    }
    system = platform.system()
    for path in font_paths.get(system, []):
        try:
            pdfmetrics.registerFont(TTFont("ChineseFont", path))
            return "ChineseFont"
        except Exception:
            continue
    return "Helvetica"  # fallback
```

> 怕浪猫踩坑提示：TTC（TrueType Collection）文件包含多个字体，TTFont注册时可能需要指定`subfontIndex`参数。如果注册报错，尝试`TTFont("ChineseFont", path, subfontIndex=0)`。

### 14.6.3 PDF报告模板构建

用ReportLab的Platypus（Page Layout and Typography Using Scripts）系统构建报告。核心组件关系：

```
SimpleDocTemplate (文档容器)
  |
  +-- Paragraph (段落: 标题/正文/引用)
  +-- Table (表格: 系统信息/进程列表)
  +-- Image (图片: 图表截图)
  +-- Spacer (间距控制)
  +-- PageBreak (分页符)
```

报告生成器封装：

```python
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer,
    Table, Image, PageBreak,
)
from reportlab.lib.units import inch
import io

class ReportGenerator:
    def __init__(self, font_name: str):
        self.font = font_name
        self.styles = self._build_styles()
        self.elements = []

    def _build_styles(self):
        styles = getSampleStyleSheet()
        styles["Title"].fontName = self.font
        styles["Normal"].fontName = self.font
        styles["Heading1"].fontName = self.font
        styles["Heading2"].fontName = self.font
        return styles

    def add_title(self, title: str):
        self.elements.append(Paragraph(title, self.styles["Title"]))
        self.elements.append(Spacer(1, 0.2 * inch))

    def add_heading(self, text: str, level=2):
        style = self.styles[f"Heading{level}"]
        self.elements.append(Paragraph(text, style))

    def add_paragraph(self, text: str):
        self.elements.append(Paragraph(text, self.styles["Normal"]))

    def add_table(self, data: list, col_widths=None):
        table = Table(data, colWidths=col_widths)
        table.setStyle([
            ("FONTNAME", (0, 0), (-1, -1), self.font),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2196F3")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ])
        self.elements.append(table)
        self.elements.append(Spacer(1, 0.15 * inch))

    def add_image(self, png_data: bytes, width=6 * inch):
        img = Image(io.BytesIO(png_data), width=width)
        img._restrictSize(width, 4 * inch)
        self.elements.append(img)
        self.elements.append(Spacer(1, 0.1 * inch))
```

### 14.6.4 完整报告生成流程

把系统信息、AI分析结果、图表整合成一份完整的PDF报告：

```python
def generate_system_report(
    ai_analysis: str, cpu_png: bytes, net_png: bytes,
    font_name: str,
) -> bytes:
    """生成完整的系统报告PDF"""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
    )
    gen = ReportGenerator(font_name)
    
    # 报告头部
    gen.add_title("系统运行状态报告")
    gen.add_paragraph(
        f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )
    gen.add_paragraph(
        f"主机: {platform.node()}"
    )
    gen.add_spacer = Spacer(1, 0.3 * inch)
    gen.elements.append(gen.add_spacer)
    
    # 第一部分: 系统信息
    gen.add_heading("一、系统基本信息", level=1)
    summary = SystemInfo.get_system_summary()
    table_data = [["指标", "值"]]
    for k, v in summary.items():
        table_data.append([k, str(v)])
    gen.add_table(table_data, col_widths=[2 * inch, 4 * inch])
    
    # 第二部分: 资源使用情况
    gen.add_heading("二、资源使用情况", level=1)
    cpu_info = SystemInfo.get_cpu_info()
    mem_info = SystemInfo.get_memory_info()
    table_data = [["指标", "值"]]
    for k, v in {**cpu_info, **mem_info}.items():
        table_data.append([k, str(v)])
    gen.add_table(table_data, col_widths=[2 * inch, 4 * inch])
    
    # 第三部分: 趋势图表
    gen.add_heading("三、趋势图表", level=1)
    gen.add_heading("CPU使用率趋势", level=2)
    gen.add_image(cpu_png)
    gen.add_heading("网络流量趋势", level=2)
    gen.add_image(net_png)
    
    # 第四部分: AI分析
    gen.add_page_break()
    gen.add_heading("四、AI智能分析", level=1)
    gen.add_paragraph(ai_analysis)
    
    doc.build(gen.elements)
    return buf.getvalue()
```

### 14.6.5 Streamlit下载按钮

Streamlit提供`st.download_button`组件，让用户一键下载生成的PDF：

```python
# 生成报告按钮
if st.button("生成系统报告PDF", type="primary"):
    with st.spinner("正在生成报告..."):
        # 采集数据
        ai_context = build_system_context()
        ai_analysis = client.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": ai_context},
        ])
        cpu_png = generate_cpu_chart_png(history)
        net_png = generate_network_chart_png(history)
        
        # 生成PDF
        font = register_chinese_font()
        pdf_data = generate_system_report(
            ai_analysis, cpu_png, net_png, font
        )
        
        # 下载按钮
        st.download_button(
            label="下载PDF报告",
            data=pdf_data,
            file_name=f"system_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
            mime="application/pdf",
        )
        st.success("报告生成成功!")
```

`st.spinner`在生成过程中显示加载动画，避免用户以为页面卡住了。`st.download_button`的`data`参数接收bytes类型，`mime`设为`application/pdf`让浏览器识别为PDF文件。

> 怕浪猫踩坑提示：ReportLab生成PDF是在内存中完成的，但如果报告内容很长（超过50页），内存占用会陡增。在资源受限的服务器上建议分段生成或用流式写入。

### 14.6.6 完整应用入口

把所有模块整合到一起，完整的main.py入口：

```python
import streamlit as st

st.set_page_config(
    page_title="AI系统分析助手",
    page_icon=None,
    layout="wide",
    initial_sidebar_state="expanded",
)

init_session_state()

with st.sidebar:
    st.header("配置面板")
    api_key = st.text_input("API Key", type="password")
    role = st.selectbox("AI角色", list(SYSTEM_PROMPTS.keys()))
    temperature = st.slider("Temperature", 0.0, 2.0, 0.7, 0.1)
    st.divider()
    st.subheader("预设问题")
    for label, q in preset_questions.items():
        if st.button(label):
            st.session_state.pending_input = q
    st.divider()
    if st.button("生成PDF报告"):
        st.session_state.show_report = True

# 主区域
tab1, tab2, tab3 = st.tabs([
    "AI对话", "系统信息", "报告导出"
])

with tab1:
    # AI对话界面
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])
    if prompt := st.chat_input("请输入问题"):
        handle_user_input(prompt, api_key, temperature)

with tab2:
    render_system_info()

with tab3:
    if st.session_state.get("show_report"):
        render_report_tab(api_key)
    else:
        st.info("点击侧边栏的「生成PDF报告」按钮开始")
```

`st.tabs`创建多标签页，比让用户在一个长页面上滚动体验好得多。`st.set_page_config`必须放在脚本最顶部，否则会被忽略。ReportLab官方文档参考：https://www.reportlab.com/docs/

## 架构回顾与最佳实践

整个平台的架构总结如下：

```
Streamlit前端层
  |
  +-- 对话界面 (st.chat_message + st.write_stream)
  +-- 系统面板 (st.metric + st.dataframe)
  +-- 图表展示 (st.plotly_chart)
  +-- 报告导出 (st.download_button)
  |
  v
业务逻辑层
  |
  +-- DeepSeekClient (API调用 + Token管理)
  +-- SystemInfo (psutil系统信息采集)
  +-- ReportGenerator (ReportLab PDF生成)
  +-- TokenBudget (预算控制)
  |
  v
外部服务
  +-- DeepSeek API (大模型推理)
  +-- 本地系统 (psutil数据源)
```

关键设计决策总结：

| 决策点 | 选择 | 理由 |
|--------|------|------|
| API SDK | openai库 | 兼容DeepSeek接口，省去手写HTTP |
| 流式方案 | SSE + 生成器 | 原生支持，无需额外依赖 |
| 系统信息 | psutil | 跨平台，API稳定 |
| 图表库 | Plotly + Matplotlib | 交互用Plotly，PDF用Matplotlib |
| PDF方案 | ReportLab | 无系统依赖，中文字体可控 |
| 状态管理 | session_state | 天然会话隔离，零配置 |

## 收藏触发清单：Streamlit AI应用开发检查表

- [ ] API密钥使用password类型输入框，不明文显示
- [ ] 实现了Token预算管理，防止额度被烧光
- [ ] 流式输出使用生成器 + st.write_stream
- [ ] 对话历史实现了滑动窗口截断
- [ ] System Prompt按角色可配置
- [ ] 系统信息采集处理了PermissionError异常
- [ ] CPU采样使用非阻塞模式（interval=None）
- [ ] 图表同时准备了Plotly交互版和Matplotlib静态版
- [ ] PDF生成注册了中文字体，处理了TTC格式
- [ ] PDF内容在BytesIO中生成，不写磁盘
- [ ] 下载按钮设置了正确的mime type
- [ ] 使用st.tabs做多页面切换，而非单页滚动
- [ ] st.set_page_config放在脚本最顶部
- [ ] 长时间操作有st.spinner加载提示

## 下章预告

第15章「Streamlit实战：群控架构日志文件可视化项目」将把视角从单机转向群控。当你有10台、50台模拟器同时跑任务，每台都在产生日志，怎么在一个面板上看全量日志？怎么按日期、级别、设备筛选？怎么自动分析日志中的异常模式？下一章会基于本章的Streamlit基础，构建一个面向群控场景的日志可视化系统。

## 系列进度 14/17

如果你觉得这一章对你有帮助，欢迎收藏。有任何问题可以在评论区留言，怕浪猫会一一回复。

**追更引导**：第15章「Streamlit实战：群控架构日志文件可视化项目」正在写作中，关注我不错过更新。

## 怕浪猫说

写这一章的时候，怕浪猫在想一个事：很多做爬虫的同学觉得"数据采到了就完事了"，但真正在项目里，数据采集只是第一步。怎么把数据变成洞察，怎么把洞察变成报告，怎么把报告自动推送到决策者手里——这条链路才是技术价值的完整体现。

这一章的Streamlit + DeepSeek + ReportLab组合，本质上是在搭一条从"原始数据"到"可执行洞察"的管道。记得我第一次给客户做项目，爬了三万条电商数据，直接甩个Excel过去，客户说"看不懂"。后来花半天用Streamlit搭了个可视化面板，把关键指标和AI分析结论放在一起，客户看完直接说"这个值多少钱"。

同一份数据，呈现方式不同，价值差10倍。这不是夸张，是怕浪猫亲身经历。

技术人容易陷入的误区是：觉得技术难度等于价值难度。但很多时候，一个简单的可视化面板，一个一键导出的PDF报告，在非技术决策者眼里，比你的爬虫架构有多精妙重要得多。学会用工具把技术成果"包装"好，不是投机取巧，而是让技术的价值被正确评估。

下一章见。
