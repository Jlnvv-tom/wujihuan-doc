# 第21章 LangSmith：调试、测试与评估

用LangChain开发完Chain、RAG或Agent后，你是否会遇到这些痛点：模型输出莫名其妙出错，却找不到问题在哪？不同提示词、不同模型的效果，凭感觉判断不准？线上服务运行不稳定， latency飙升、成本超标却后知后觉？

LangSmith 正是LangChain官方推出的“LLM应用全生命周期管控平台”，专门解决上述问题——它集调试、测试、评估、监控于一体，让LLM应用的开发从“凭感觉”变成“可量化、可追溯、可优化”。

本章全程贴合掘金读者“拿来就用、实战为王”的需求，从LangSmith核心功能入手，一步步教你用它记录运行轨迹、创建测试数据集、自动化评估、做A/B测试，最后通过实战优化问答链准确率，所有代码均简短可运行，标注引用来源，避免冗余理论，全程落地导向。

## 21\.1 LangSmith 平台功能概览

LangSmith 是一款面向LLM应用的全生命周期开发与运维平台，核心定位是“打破LLM应用的黑箱”，无论你是用LangChain、LlamaIndex还是直接调用OpenAI API，都能无缝接入使用\[superscript:3\]\[superscript:4\]。它不是独立的LLM模型，而是一套结构化工具链，覆盖从开发调试到生产监控的完整流程\[superscript:5\]。

### 21\.1\.1 核心价值（掘金实战视角）

对于LLM应用开发者而言，LangSmith 最实用的价值可以概括为3点，精准解决开发与运维中的核心痛点：

- 调试黑箱：记录LLM应用的完整运行轨迹，每一步输入、输出、参数、耗时都清晰可查，快速定位问题（如Prompt渲染错误、工具调用失败）；

- 量化评估：提供标准化的评估指标和自动化评估流程，替代“凭感觉判断效果”，让优化有数据支撑；

- 运维保障：实时监控线上服务的运行状态，设置告警阈值，提前发现 latency、成本、准确率异常，避免线上事故\[superscript:5\]。

### 21\.1\.2 核心功能模块（图文解析）

LangSmith 的功能围绕“开发\-测试\-评估\-运维”四大场景展开，核心模块对应本章目录，各模块协同工作，形成闭环：

```mermaid

flowchart TD
    A[LangSmith 核心功能] --> B[记录运行轨迹（Tracing）]
    A --> C[创建测试数据集（Datasets）]
    A --> D[自动化评估指标]
    A --> E[A/B测试不同提示/模型]
    A --> F[告警与监控配置]
    A --> G[与CI/CD流程集成]
    B --> H[定位调试问题]
    C --> I[提供标准化测试样本]
    D --> J[量化应用效果]
    E --> K[筛选最优方案]
    F --> L[保障线上稳定]
    G --> M[实现自动化部署优化]
    H --> N[实战优化应用]
    I --> N
    J --> N
    K --> N
    L --> O[线上稳定运行]
    M --> O
    ```

各模块核心作用详解（极简版，重点看实战）：

|功能模块|核心作用|适用场景|
|---|---|---|
|Tracing（运行轨迹）|记录每一次请求的完整执行步骤，形成可视化链路|开发调试、问题定位|
|Datasets（测试数据集）|管理测试样本（输入、参考输出），用于重复测试|自动化评估、模型对比|
|自动化评估|基于数据集，自动计算准确率、耗时、成本等指标|效果量化、优化验证|
|A/B测试|对比不同Prompt、模型、参数的效果差异|Prompt优化、模型选型|
|告警与监控|实时监控线上指标，异常时触发告警|生产运维、风险防控|
|CI/CD集成|将评估、测试融入CI/CD流程，实现自动化部署优化|规模化、工程化部署|

### 21\.1\.3 环境准备（必做，3步搞定）

使用LangSmith前，需完成简单配置，支持本地开发和线上部署，步骤如下（代码来源：LangSmith官方SDK文档\[superscript:8\]）：

1. 注册LangSmith账号：访问 [LangSmith官网](https://smith.langchain.com/)，用GitHub或邮箱注册，免费版可满足个人开发需求；

2. 获取API Key：登录后，进入「Settings」→「API Keys」，创建并复制API Key；

3. 安装依赖并配置环境变量：

```bash
# 安装LangSmith SDK
pip install -U langsmith

# 配置环境变量（推荐用.env文件管理，避免硬编码）
# .env文件内容
LANGCHAIN_TRACING_V2=true  # 开启追踪（V2版本，推荐）
LANGCHAIN_API_KEY=你的LangSmith API Key
LANGCHAIN_PROJECT=langsmith-demo  # 自定义项目名称（可选，默认default）
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com  # 官方端点（无需修改）
```

代码中加载环境变量（适配所有实战示例）：

```python
from dotenv import load_dotenv
import os

# 加载.env文件中的环境变量
load_dotenv()

# 验证配置（可选）
print("LangSmith配置是否生效：", os.getenv("LANGCHAIN_TRACING_V2") == "true")

```

### 21\.1\.4 LangSmith 界面概览（快速上手）

配置完成后，运行任意LangChain Chain，即可在LangSmith官网看到对应项目的界面，核心区域分为3块，快速熟悉：

- Runs：展示所有请求的运行记录，包括每一次Chain调用、LLM调用的详细轨迹；

- Datasets：管理测试数据集，可手动创建、从Runs中导入样本；

- Evaluations：查看自动化评估报告、A/B测试结果，量化应用效果\[superscript:1\]\[superscript:3\]。

## 21\.2 记录运行轨迹（Tracing）

Tracing（运行轨迹）是LangSmith最核心的功能，相当于给LLM应用装上“透视镜”——它会完整记录每一次请求的执行过程，包括输入、输出、中间步骤（如Prompt渲染、LLM调用、工具调用）、参数配置、耗时、Token消耗等，形成可视化的链路，让你快速定位问题\[superscript:4\]\[superscript:5\]。

核心原理：每一次用户请求对应一个“Run”（运行记录），每个Run包含多个“Span”（步骤节点），通过父子节点关联形成“Trace树”，清晰展示步骤间的依赖关系\[superscript:5\]。

### 21\.2\.1 3种追踪方式（实战示例）

LangSmith支持3种追踪方式，覆盖不同场景（LangChain应用、原生OpenAI调用、自定义函数），代码均简短可运行，标注引用来源。

#### 方式1：LangChain应用自动追踪（最常用）

若你的应用基于LangChain开发，只需配置好环境变量，无需额外编写追踪代码，LangSmith会自动记录所有运行轨迹\[superscript:4\]\[superscript:8\]。

```python
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 1. 加载环境变量（已配置LANGCHAIN相关参数）
load_dotenv()

# 2. 构建简单的对话链
prompt = ChatPromptTemplate.from_template("回答用户问题：{input}")
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.7)
chain = prompt | llm

# 3. 调用Chain，自动被LangSmith追踪
response = chain.invoke({"input": "什么是LangSmith？"})
print(response.content)
```

运行后，访问LangSmith官网「Runs」页面，即可看到本次调用的完整轨迹，包括Prompt渲染结果、LLM调用参数、输出内容、耗时等。

#### 方式2：@traceable装饰器（非LangChain代码）

若你直接调用OpenAI API（不使用LangChain），可使用LangSmith的@traceable装饰器，手动标记需要追踪的函数\[superscript:4\]\[superscript:8\]。

```python
from dotenv import load_dotenv
import openai
from langsmith import traceable

# 加载环境变量
load_dotenv()
client = openai.Client()

# 用@traceable装饰器标记需要追踪的函数
@traceable(name="openai_chat_completion", metadata={"team": "dev", "version": "1.0"})
def chat_with_openai(user_input: str) -> str:
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": user_input}]
    )
    return response.choices[0].message.content

# 调用函数，自动追踪
result = chat_with_openai("LangSmith的Tracing功能有什么用？")
print(result)

```

说明：name参数可自定义追踪名称，metadata可添加额外信息（如团队、版本），便于后续筛选和管理\[superscript:4\]。

#### 方式3：wrap\_openai包装器（原生OpenAI客户端）

直接包装OpenAI客户端，无需装饰器，即可自动追踪所有客户端调用\[superscript:8\]。

```python
from dotenv import load_dotenv
import openai
from langsmith.wrappers import wrap_openai

# 加载环境变量
load_dotenv()

# 包装OpenAI客户端，自动追踪所有调用
client = wrap_openai(openai.Client())

# 调用客户端，自动被LangSmith追踪
response = client.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "如何使用LangSmith追踪OpenAI调用？"}]
)
print(response.choices[0].message.content)

```

### 21\.2\.2 轨迹查看与问题定位（实战技巧）

运行上述代码后，进入LangSmith官网「Runs」页面，可看到所有追踪记录，核心操作技巧如下（贴合掘金实战需求）：

1. 查看完整轨迹：点击任意Run，进入详情页，可看到“Trace树”，展开每个节点，查看该步骤的输入、输出、耗时、参数；

2. 筛选异常轨迹：通过顶部筛选器，按“状态（成功/失败）、耗时、模型、Token消耗”等维度筛选，快速定位异常请求（如耗时过长、调用失败）\[superscript:5\]；

3. 对比轨迹差异：选中两个Run，点击“Compare”，可高亮展示两者在Prompt、参数、输出上的差异，快速分析“为什么两个请求结果不同”\[superscript:5\]；

4. 添加标签与备注：给重要的Run添加标签（如“Prompt优化测试”）、备注，便于后续追溯和管理\[superscript:1\]。

### 21\.2\.3 高级技巧：添加自定义元数据与标签

在追踪过程中，可添加自定义元数据和标签，让轨迹更具可读性，便于后续筛选和分析，代码示例（来源：LangSmith高级用法\[superscript:4\]）：

```python
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tracers.context import tracing_v2_enabled

load_dotenv()

llm = ChatOpenAI(model="gpt-3.5-turbo")
prompt = ChatPromptTemplate.from_template("{input}")
chain = prompt | llm

# 使用上下文管理器，添加自定义元数据和标签
with tracing_v2_enabled(
    project_name="langsmith-tracing-demo",
    metadata={"user_id": "user123", "scene": "问答场景"},
    tags=["test", "prompt-optimize"]
):
    chain.invoke({"input": "LangSmith如何添加自定义元数据？"})

```

## 21\.3 创建测试数据集（Datasets）

测试数据集（Datasets）是LangSmith评估、A/B测试的基础——它是一组标准化的测试样本集合，每个样本包含“输入（Input）”、“参考输出（Reference Output）”（可选），用于重复测试LLM应用的效果，避免每次测试都手动输入\[superscript:1\]\[superscript:10\]。

简单说，数据集就是“测试用例集”，比如问答场景中，每个样本是“用户问题\+标准答案”，用于验证问答链的准确率\[superscript:5\]。

### 21\.3\.1 数据集的核心结构

每个数据集由多个“示例（Example）”组成，每个示例包含3个核心字段（来源：LangSmith数据集文档\[superscript:1\]）：

- Input：测试输入（如用户问题、待总结文本）；

- Output：参考输出（可选，即标准答案，用于评估准确率）；

- Metadata：自定义元数据（可选，如样本标签、场景分类）。

### 21\.3\.2 2种创建方式（UI\+代码，实战优先）

LangSmith支持“UI手动创建”和“代码自动创建”两种方式，前者适合少量样本，后者适合批量创建，按需选择。

#### 方式1：UI手动创建（简单直观）

步骤（来源：LangSmith UI操作指南\[superscript:1\]）：

1. 登录LangSmith官网，进入「Datasets」页面，点击「Create Dataset」；

2. 输入数据集名称（如“问答链测试数据集”）、描述，点击「Create」；

3. 点击「Add Example」，手动输入每个样本的Input、Reference Output，点击「Save」；

4. 批量添加：点击「Import」，可上传CSV/JSON文件，批量导入样本（格式见方式2代码）。

#### 方式2：代码自动创建（批量高效）

适合批量创建样本，代码简短，可直接运行（来源：LangSmith SDK文档\[superscript:8\]）：

```python
from dotenv import load_dotenv
from langsmith import Client

# 加载环境变量，初始化LangSmith客户端
load_dotenv()
client = Client()

# 1. 创建数据集
dataset = client.create_dataset(
    dataset_name="问答链测试数据集",
    description="用于测试问答链的准确率，包含10个常见问题及标准答案"
)

# 2. 批量添加样本（示例：5个问答样本）
examples = [
    {
        "input": {"question": "什么是LangChain？"},
        "output": {"answer": "LangChain是一个用于构建LLM应用的框架，提供链、工具、记忆等组件，简化LLM应用开发。"}
    },
    {
        "input": {"question": "LangSmith的核心功能是什么？"},
        "output": {"answer": "LangSmith的核心功能包括运行轨迹追踪、测试数据集管理、自动化评估、A/B测试、告警与监控。"}
    },
    {
        "input": {"question": "如何配置LangSmith环境？"},
        "output": {"answer": "配置LangSmith需注册账号、获取API Key，安装langsmith SDK，设置LANGCHAIN_TRACING_V2等环境变量。"}
    },
    {
        "input": {"question": "Tracing功能的作用是什么？"},
        "output": {"answer": "Tracing功能用于记录LLM应用的完整运行轨迹，帮助开发者定位问题、调试代码。"}
    },
    {
        "input": {"question": "LangSmith支持哪些评估指标？"},
        "output": {"answer": "LangSmith支持准确率（Accuracy）、耗时（Latency）、成本（Cost）等核心评估指标，也可自定义指标。"}
    }
]

# 3. 批量添加样本到数据集
for example in examples:
    client.create_example(
        inputs=example["input"],
        outputs=example["output"],
        dataset_id=dataset.id
    )

print("数据集创建成功，样本数：", len(examples))

```

### 21\.3\.3 数据集的高级操作（实战常用）

- 从Runs中导入样本：在「Runs」页面，筛选出有价值的运行记录（如用户真实提问），点击「Add to Dataset」，可将其转为数据集样本，无需手动输入\[superscript:1\]；

- 样本标注与编辑：进入数据集详情页，可编辑样本的Input、Reference Output，也可通过“Annotation Queue”让专家标注样本，提升样本质量\[superscript:1\]；

- 数据集版本控制：支持创建数据集版本，修改样本后可保留历史版本，便于对比不同版本的测试效果\[superscript:5\]；

- 自动导入样本：通过“Run Rules”设置规则，自动将符合条件的Runs（如用户反馈差的请求）添加到数据集，实现样本自动积累\[superscript:1\]。

## 21\.4 自动化评估指标（Accuracy、Latency、Cost）

有了测试数据集，下一步就是“量化评估”——LangSmith支持自动化评估，无需手动审核，自动计算核心指标，替代“凭感觉判断效果”，让LLM应用的优化有数据支撑\[superscript:5\]\[superscript:10\]。

核心评估指标分为3类，覆盖“效果、性能、成本”，满足开发与运维需求：准确率（Accuracy）、耗时（Latency）、成本（Cost）。

### 21\.4\.1 核心评估指标详解（实战重点）

|指标名称|核心含义|计算逻辑|适用场景|
|---|---|---|---|
|Accuracy（准确率）|模型输出与参考输出的匹配程度|通过内置评估器（如字符串匹配、语义相似度）自动计算，0\-100分\[superscript:5\]|问答、分类、摘要等场景|
|Latency（耗时）|单次请求的总耗时（从请求发起至返回结果）|自动记录每一步耗时，计算总耗时的平均值、中位数、P99值\[superscript:6\]|所有线上服务场景，需控制响应速度|
|Cost（成本）|单次请求的Token消耗及对应费用|自动统计输入/输出Token数，结合模型定价，计算单次请求成本\[superscript:5\]|规模化部署，控制成本|

### 21\.4\.2 自动化评估实战（代码示例）

基于之前创建的“问答链测试数据集”，用代码实现自动化评估，自动计算3个核心指标（来源：LangSmith评估文档\[superscript:10\]）：

```python
from dotenv import load_dotenv
from langsmith import Client
from langsmith.evaluation import RunEvaluator, EvaluationResult
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.prompts import ChatPromptTemplate
from langchain.chains import RetrievalQA
from langchain_community.vectorstores import Chroma

# 1. 加载环境变量，初始化客户端
load_dotenv()
client = Client()

# 2. 构建需要评估的问答链（示例：简单问答链）
prompt = ChatPromptTemplate.from_template("根据问题回答：{question}")
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.3)
chain = prompt | llm

# 3. 定义评估器（计算准确率、耗时、成本）
class CustomEvaluator(RunEvaluator):
    def __init__(self):
        self.embeddings = OpenAIEmbeddings()
    
    def evaluate_run(self, run, example):
        # 1. 计算准确率（语义相似度）
        reference = example.outputs["answer"]
        prediction = run.outputs["output"].content
        # 用嵌入向量计算相似度（简化版，LangSmith有内置评估器）
        ref_emb = self.embeddings.embed_query(reference)
        pred_emb = self.embeddings.embed_query(prediction)
        accuracy = sum([a*b for a,b in zip(ref_emb, pred_emb)]) / (sum([a**2 for a in ref_emb])**0.5 * sum([b**2 for b in pred_emb])**0.5)
        accuracy = round(accuracy * 100, 2)
        
        # 2. 提取耗时（从run中自动获取）
        latency = run.end_time - run.start_time
        latency_ms = round(latency.total_seconds() * 1000, 2)
        
        # 3. 计算成本（从run中提取Token消耗，结合模型定价）
        token_usage = run.extra["llm_outputs"][0]["token_usage"]
        cost = (token_usage["prompt_tokens"] * 0.0015 + token_usage["completion_tokens"] * 0.002) / 1000
        cost = round(cost, 6)
        
        # 返回评估结果
        return EvaluationResult(
            key="custom_evaluation",
            score=accuracy,
            comment=f"准确率：{accuracy}分，耗时：{latency_ms}ms，成本：{cost}美元",
            metrics={"accuracy": accuracy, "latency_ms": latency_ms, "cost_usd": cost}
        )

# 4. 执行自动化评估（关联数据集和问答链）
client.run_on_dataset(
    dataset_name="问答链测试数据集",
    llm_or_chain=chain,
    evaluators=[CustomEvaluator()],  # 自定义评估器
    project_name="qa-chain-evaluation",  # 评估项目名称
    concurrency_level=5  # 并发评估数量
)

print("自动化评估完成，可在LangSmith官网查看评估报告")

```

### 21\.4\.3 评估报告查看与分析

运行上述代码后，进入LangSmith官网「Evaluations」页面，可看到完整的评估报告，核心分析要点：

- 指标汇总：查看准确率平均值、平均耗时、平均成本，快速判断应用整体效果；

- 样本详情：查看每个样本的评估结果，筛选出准确率低、耗时长、成本高的样本，针对性优化；

- 趋势分析：多次评估后，可查看指标变化趋势，验证优化效果（如Prompt优化后，准确率是否提升）\[superscript:5\]；

- 内置评估器：无需自定义评估器，LangSmith提供开箱即用的评估器（如accuracy、relevance、fluency），直接调用即可\[superscript:5\]。

### 21\.4\.4 自定义评估指标（贴合业务需求）

若核心指标无法满足业务需求（如“合规性”“回答简洁度”），可自定义评估逻辑，代码示例（来源：LangSmith高级评估\[superscript:5\]）：

```python
from langsmith.evaluation import RunEvaluator, EvaluationResult

# 自定义评估器：评估回答简洁度（字符数≤100为合格）
class ConcisenessEvaluator(RunEvaluator):
    def evaluate_run(self, run, example):
        prediction = run.outputs["output"].content
        length = len(prediction)
        # 简洁度评分：≤100字符得100分，每多10字符减10分
        score = max(0, 100 - ((length - 100) // 10) * 10) if length > 100 else 100
        return EvaluationResult(
            key="conciseness",
            score=score,
            comment=f"回答长度：{length}字符，简洁度：{score}分"
        )

# 评估时添加自定义评估器
# client.run_on_dataset(..., evaluators=[CustomEvaluator(), ConcisenessEvaluator()])

```

## 21\.5 A/B 测试不同提示或模型

开发LLM应用时，我们经常会纠结：“哪个Prompt效果更好？”“GPT\-3\.5和GPT\-4哪个更适合当前场景？”——LangSmith的A/B测试功能，可通过标准化数据集，对比不同Prompt、模型、参数的效果，用数据替代主观猜测，筛选最优方案\[superscript:9\]。

核心逻辑：将不同版本的Chain（不同Prompt/模型），在同一个数据集上运行，自动计算评估指标，对比差异，选择最优版本\[superscript:2\]\[superscript:9\]。

### 21\.5\.1 A/B测试实战（对比2个Prompt版本）

示例：对比两个不同的Prompt版本，在“问答链测试数据集”上的准确率、耗时、成本，筛选最优Prompt（代码来源：LangSmith A/B测试示例\[superscript:9\]）：

```python
from dotenv import load_dotenv
from langsmith import Client
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 1. 加载环境变量，初始化客户端
load_dotenv()
client = Client()

# 2. 定义两个Prompt版本（A/B组）
# A组：简洁Prompt
prompt_a = ChatPromptTemplate.from_template("直接回答问题，简洁明了：{question}")
# B组：详细Prompt（添加角色和要求）
prompt_b = ChatPromptTemplate.from_template("你是专业的技术顾问，回答用户问题时，需准确、详细，结合知识点：{question}")

# 3. 构建两个版本的Chain（同一模型，不同Prompt）
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.3)
chain_a = prompt_a | llm  # A组：简洁Prompt
chain_b = prompt_b | llm  # B组：详细Prompt

# 4. 执行A/B测试（在同一个数据集上运行两个版本）
# 运行A组
client.run_on_dataset(
    dataset_name="问答链测试数据集",
    llm_or_chain=chain_a,
    project_name="ab-test-prompt",
    run_name="prompt-a"  # 标记A组
)

# 运行B组
client.run_on_dataset(
    dataset_name="问答链测试数据集",
    llm_or_chain=chain_b,
    project_name="ab-test-prompt",
    run_name="prompt-b"  # 标记B组
)

print("A/B测试完成，可在LangSmith官网对比两个版本的评估指标")

```

### 21\.5\.2 A/B测试结果对比与分析

测试完成后，进入LangSmith官网「Evaluations」页面，选择“ab\-test\-prompt”项目，对比两个版本的核心指标，分析要点：

1. 指标对比：查看A/B两组的准确率、平均耗时、平均成本，比如“Prompt B的准确率比A高10%，但耗时多200ms，成本高5%”；

2. 样本差异：查看具体样本的输出，分析为什么B组准确率更高（如Prompt添加了角色要求，回答更精准）；

3. 决策依据：结合业务需求选择最优版本——若追求准确率，选B组；若追求速度和成本，选A组\[superscript:9\]；

4. 多变量测试：可同时对比多个版本（如3个Prompt、2个模型），但建议每次只修改一个变量（如只改Prompt，保持模型一致），确保结果可追溯\[superscript:9\]。

### 21\.5\.3 模型对比A/B测试（扩展）

除了Prompt对比，还可对比不同模型（如GPT\-3\.5 vs GPT\-4），代码示例（简化版）：

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 统一Prompt，对比不同模型
prompt = ChatPromptTemplate.from_template("专业回答用户问题：{question}")

# 模型A：GPT-3.5-turbo
llm_a = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.3)
chain_a = prompt | llm_a

# 模型B：GPT-4
llm_b = ChatOpenAI(model="gpt-4", temperature=0.3)
chain_b = prompt | llm_b

# 执行A/B测试（代码同前，修改run_name为model-a、model-b）
# client.run_on_dataset(..., run_name="model-a")
# client.run_on_dataset(..., run_name="model-b")

```

## 21\.6 告警与监控配置

LLM应用部署到线上后，需要实时监控运行状态，避免出现“准确率骤降、耗时飙升、成本超标”等问题——LangSmith的告警与监控功能，可实时采集运行指标，设置告警阈值，异常时通过邮件、Slack等方式通知开发者，提前防控风险\[superscript:5\]\[superscript:7\]。

### 21\.6\.1 监控核心指标（线上重点）

LangSmith自动监控以下核心指标，无需手动配置，可直接在监控面板查看：

- 性能指标：平均耗时、P95/P99耗时、请求QPS（每秒请求数）\[superscript:6\]；

- 效果指标：准确率、失败率（请求失败的比例）、用户反馈评分；

- 成本指标：每小时Token消耗、每小时成本、日均成本；

- 其他指标：模型调用成功率、工具调用成功率\[superscript:5\]。

### 21\.6\.2 告警配置（UI操作，简单直观）

步骤（来源：LangSmith监控文档\[superscript:7\]）：

1. 登录LangSmith官网，进入「Monitoring」页面，点击「Alerts」→「Create Alert」；

2. 选择告警指标：如“准确率”“平均耗时”“成本”；

3. 设置告警阈值：如“准确率＜80%”“平均耗时＞1000ms”“每小时成本＞10美元”；

4. 选择告警触发条件：如“连续5分钟满足阈值”“单次超过阈值”；

5. 设置通知方式：如邮件、Slack、Webhook（可对接企业微信、钉钉）；

6. 保存告警规则，完成配置，后续指标异常时会自动触发告警。

### 21\.6\.3 监控面板自定义（贴合业务）

LangSmith支持自定义监控面板，可根据业务需求，添加常用指标、筛选时间范围，步骤：

1. 进入「Monitoring」页面，点击「Custom Dashboard」→「Create Dashboard」；

2. 添加指标组件：如“准确率趋势图”“耗时分布直方图”“成本统计卡片”；

3. 设置筛选条件：如筛选特定项目、特定模型、特定时间范围（如近24小时）；

4. 保存面板，后续可直接查看自定义的监控数据，快速掌握线上状态\[superscript:5\]。

### 21\.6\.4 日志导出与分析（扩展）

若需要将监控日志导出，进行进一步分析（如结合Grafana、Prometheus），可通过LangSmith API导出，代码示例（来源：LangSmith API文档\[superscript:8\]）：

```python
from dotenv import load_dotenv
from langsmith import Client
from datetime import datetime, timedelta

load_dotenv()
client = Client()

# 导出近24小时的运行日志
runs = client.list_runs(
    project_name="qa-chain-production",
    start_time=datetime.now() - timedelta(hours=24),
    end_time=datetime.now(),
    filter={"status": "success"}  # 筛选成功的请求
)

# 遍历日志，提取核心指标
for run in runs:
    latency = (run.end_time - run.start_time).total_seconds() * 1000
    token_usage = run.extra["llm_outputs"][0]["token_usage"]
    cost = (token_usage["prompt_tokens"] * 0.0015 + token_usage["completion_tokens"] * 0.002) / 1000
    print(f"请求ID：{run.id}，耗时：{latency:.2f}ms，成本：{cost:.6f}美元")

```

## 21\.7 与 CI/CD 流程集成

当LLM应用规模化、工程化部署时，需要将LangSmith的测试、评估融入CI/CD流程，实现“代码提交→自动测试→自动评估→自动部署”的闭环，避免手动操作，提升开发效率，确保每次部署的版本都符合质量标准\[superscript:7\]。

核心集成逻辑：通过LangSmith API或CLI工具，在CI/CD流程（如GitHub Actions、GitLab CI）中，自动执行测试、评估，若评估指标不达标，终止部署\[superscript:7\]。

### 21\.7\.1 集成前提（必做）

- 已创建测试数据集（用于自动测试）；

- 已定义评估指标和合格阈值（如准确率≥85%、耗时≤1000ms）；

- CI/CD环境中配置LangSmith环境变量（LANGCHAIN\_API\_KEY等）\[superscript:7\]。

### 21\.7\.2 GitHub Actions 集成实战（最常用）

示例：当代码提交到main分支时，自动执行以下流程：安装依赖→运行Chain→用LangSmith自动评估→若指标达标，继续部署；若不达标，终止部署（代码来源：LangSmith CI/CD文档\[superscript:7\]）。

创建\.github/workflows/langsmith\-ci\.yml文件：

```yaml
name: LangSmith CI/CD Integration
on:
  push:
    branches: [main]  # 代码提交到main分支时触发

jobs:
  evaluate-and-deploy:
    runs-on: ubuntu-latest
    steps:
      # 1. 拉取代码
      - name: Checkout code
        uses: actions/checkout@v4

      # 2. 配置Python环境
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.10"

      # 3. 安装依赖
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt

      # 4. 配置LangSmith环境变量
      - name: Set LangSmith environment variables
        env:
          LANGCHAIN_API_KEY: ${{ secrets.LANGCHAIN_API_KEY }}
          LANGCHAIN_TRACING_V2: "true"
          LANGCHAIN_PROJECT: "ci-cd-demo"
        run: |
          echo "LANGCHAIN_API_KEY=$LANGCHAIN_API_KEY" >> $GITHUB_ENV
          echo "LANGCHAIN_TRACING_V2=$LANGCHAIN_TRACING_V2" >> $GITHUB_ENV
          echo "LANGCHAIN_PROJECT=$LANGCHAIN_PROJECT" >> $GITHUB_ENV

      # 5. 运行自动评估（调用LangSmith API）
      - name: Run LangSmith evaluation
        run: python evaluate.py  # 评估脚本，内容见下方

      # 6. 检查评估结果，若不达标，终止部署
      - name: Check evaluation result
        run: |
          if [ $(cat evaluation_result.txt) -lt 85 ]; then
            echo "准确率低于85%，终止部署"
            exit 1
          fi

      # 7. 评估达标，执行部署（此处简化，实际可对接云服务器、K8s等）
      - name: Deploy application
        run: |
          echo "评估达标，开始部署..."

```

评估脚本evaluate\.py（核心代码）：

```python
from dotenv import load_dotenv
from langsmith import Client
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()
client = Client()

# 构建Chain
prompt = ChatPromptTemplate.from_template("专业回答用户问题：{question}")
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.3)
chain = prompt | llm

# 执行自动评估
evaluation = client.run_on_dataset(
    dataset_name="问答链测试数据集",
    llm_or_chain=chain,
    project_name="ci-cd-demo"
)

# 获取评估结果（准确率平均值）
accuracy = evaluation["metrics"]["accuracy"]
print(f"评估准确率：{accuracy:.2f}")

# 将准确率写入文件，供CI/CD流程读取
with open("evaluation_result.txt", "w") as f:
    f.write(str(int(accuracy)))

```

### 21\.7\.3 集成核心优势

- 自动化：无需手动执行测试、评估，代码提交后自动完成，提升开发效率；

- 质量管控：确保每次部署的版本，评估指标都达标，避免线上出现质量问题；

- 可追溯：每一次部署的评估结果都可在LangSmith查看，便于后续追溯和问题定位\[superscript:7\]；

- 灵活扩展：可对接任意CI/CD工具（GitHub Actions、GitLab CI、Jenkins等），适配不同工程化场景。

## 21\.8 【实战】优化一个问答链的准确率

结合本章所学知识点，实战优化一个基础问答链的准确率——从“问题定位（Tracing）→ 测试数据集创建 → 自动化评估 → A/B测试优化 → 监控告警”，完整闭环，代码可复用、步骤清晰，贴合掘金实战需求。

### 21\.8\.1 实战背景与目标

#### 背景

现有一个基础问答链，基于GPT\-3\.5\-turbo，用于回答LangSmith相关问题，但准确率较低（约70%），存在“回答不精准、遗漏关键信息”等问题，需要通过LangSmith优化，提升准确率至85%以上。

#### 核心目标

- 通过Tracing定位问答链的问题所在；

- 创建测试数据集，实现自动化评估；

- 通过A/B测试，优化Prompt和模型参数；

- 配置监控告警，确保优化后准确率稳定在85%以上。

#### 技术栈

- 核心框架：LangChain、LangSmith；

- LLM：ChatOpenAI（GPT\-3\.5\-turbo、GPT\-4o\-mini）；

- 依赖包：langchain、langsmith、langchain\-openai、python\-dotenv。

### 21\.8\.2 步骤1：复现问题，用Tracing定位原因

先运行基础问答链，通过LangSmith Tracing定位准确率低的原因，代码如下：

```python
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# 加载环境变量
load_dotenv()

# 基础问答链（准确率低的版本）
prompt = ChatPromptTemplate.from_template("回答问题：{question}")
llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0.7)
chain = prompt | llm

# 测试几个问题，触发Tracing
test_questions = [
    "LangSmith的Tracing功能如何使用？",
    "如何创建LangSmith测试数据集？",
    "LangSmith支持哪些评估指标？",
    "LangSmith如何与CI/CD集成？",
    "LangSmith的告警功能怎么配置？"
]

for question in test_questions:
    response = chain.invoke({"question": question})
    print(f"问题：{question}")
    print(f"回答：{response.content}\n")

```

定位问题（通过LangSmith Tracing详情页）：

- Prompt过于简单，没有明确角色和回答要求，导致模型输出随意、不精准；

- 部分问题涉及LangSmith细节（如数据集创建步骤），模型输出遗漏关键信息；

- temperature=0\.7过高，导致输出随机性强，准确率不稳定。

### 21\.8\.3 步骤2：创建测试数据集，用于自动化评估

基于测试问题，创建包含15个样本的测试数据集（输入=问题，输出=标准答案），代码如下（复用21\.3\.2的代码，扩展样本）：

```python
from dotenv import load_dotenv
from langsmith import Client

load_dotenv()
client = Client()

# 创建数据集
dataset = client.create_dataset(
    dataset_name="LangSmith问答链优化数据集",
```


