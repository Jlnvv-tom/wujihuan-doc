# 第2章 开发环境搭建与基础配置

上一章我们初识了LangChain的核心价值，明确了它是大模型应用开发的“脚手架”。工欲善其事，必先利其器——本章将聚焦「开发环境搭建」这一基础环节，从Python环境准备、LangChain核心包安装，到LLM API密钥配置、向量数据库部署，再到调试工具使用，全程实战落地，帮你快速搭建一套稳定、可复用的LangChain开发环境。

本章所有操作均适配Windows、Mac、Linux三大系统，代码示例简洁可复制，关键步骤标注注意事项，新手也能零踩坑完成配置；同时提供常见问题排查方案，解决环境搭建中最易遇到的“版本冲突、密钥失效、依赖报错”等问题。

## 2.1 Python 环境准备（3.9+ 推荐）

LangChain（1.0+版本）对Python环境有明确要求：**Python 3.8+**，推荐使用 **Python 3.9~3.11** 版本（兼容性最佳，避开3.8以下版本的语法兼容问题，也避免3.12+版本的部分依赖包适配问题）。

### 2.1.1 安装Python（分系统操作）

#### 1. Windows系统

1. 下载安装包：访问Python官方网站（[https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/)），选择“Python 3.10.x”（稳定版），点击“Windows Installer (64-bit)”下载；

2. 安装步骤：双击安装包，**务必勾选“Add Python 3.10 to PATH”**（关键！避免后续无法在命令行调用Python），然后点击“Install Now”，默认安装即可；

3. 验证安装：打开CMD命令行，输入 `python --version`，若输出“Python 3.10.x”，则安装成功。

#### 2. Mac系统

1. 方式1（推荐）：使用Homebrew安装（需先安装Homebrew，官网：[https://brew.sh/](https://brew.sh/)），打开终端，输入命令：`brew install python@3.10`；

2. 方式2：官网下载安装包（[https://www.python.org/downloads/macos/](https://www.python.org/downloads/macos/)），双击安装，默认勾选“Add Python to PATH”；

3. 验证安装：终端输入 `python3 --version`（Mac默认自带Python 2.7，需用python3区分），输出“Python 3.10.x”即为成功。

#### 3. Linux系统（Ubuntu/Debian）

1. 更新软件源：终端输入 `sudo apt update`；

2. 安装Python 3.10：输入 `sudo apt install python3.10 python3.10-pip`；

3. 验证安装：输入 `python3.10 --version`，输出对应版本号即为成功。

### 2.1.2 常见问题排查

- 问题1：Windows命令行输入`python`提示“不是内部或外部命令”——未勾选“Add Python to PATH”，重新安装并勾选，或手动配置环境变量（百度“Python环境变量配置Windows”）；

- 问题2：Mac/Linux输入`python3`提示“command not found”——Homebrew安装失败，重新执行`brew install python@3.10`，或检查Homebrew是否正常；

- 问题3：版本冲突（如同时安装多个Python版本）——使用虚拟环境隔离（详见2.5节），避免全局环境混乱。

## 2.2 安装 LangChain 及其核心包

LangChain 1.0+版本对包结构进行了拆分，核心包分为3个（按需安装，避免冗余），推荐先安装基础核心包，后续根据开发需求补充其他扩展包。

### 2.2.1 核心包说明（必装/可选）

| 包名                | 核心作用                                                                                    | 是否必装                               |
| ------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| langchain-core      | LangChain核心骨架，包含Prompt、Chain、Memory等基础组件，所有LangChain应用的依赖基础         | 必装                                   |
| langchain-community | 社区贡献的组件库，包含文档加载器、工具集成、开源LLM适配等（如本地Ollama模型、Chroma向量库） | 必装（绝大多数场景需要）               |
| langchain           | 高层API集合，包含LangSmith、LangServe等官方工具，以及预定义的复杂Chain、Agent               | 可选（基础开发可暂不装，后续用到再补） |

### 2.2.2 安装命令（简洁可复制）

打开命令行/终端，执行以下命令，安装最新稳定版核心包（推荐指定版本，避免版本更新导致的兼容性问题）：

```bash
# 安装核心必装包（推荐版本，适配性最佳）
pip install langchain-core==0.1.33 langchain-community==0.1.13

# 可选：安装完整LangChain（包含官方工具）
# pip install langchain==0.1.10
```

安装来源说明：命令直接使用PyPI官方源，若下载速度慢，可切换国内源（如阿里云、清华源），示例（临时切换清华源）：

```bash
pip install langchain-core==0.1.33 langchain-community==0.1.13 -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 2.2.3 验证安装

安装完成后，执行以下Python代码（简短验证，无需复杂配置），无报错即安装成功：

```python
# 验证langchain-core安装
from langchain_core.prompts import PromptTemplate

# 创建简单Prompt模板
prompt = PromptTemplate.from_template("你好，{name}！欢迎学习LangChain")
print(prompt.format(name="开发者"))  # 输出：你好，开发者！欢迎学习LangChain
```

代码来源：LangChain官方核心包示例（[https://python.langchain.com/docs/langchain-core/prompts/prompt_templates](https://python.langchain.com/docs/langchain-core/prompts/prompt_templates)）。

## 2.3 配置主流 LLM 的 API 密钥（OpenAI、DeepSeek、Qwen、Ollama）

LangChain本身不提供大模型，需对接外部LLM（云端API或本地模型），核心是配置对应模型的API密钥（云端模型）或部署本地模型（如Ollama）。本节覆盖4种主流LLM的配置方法，按需选择（新手推荐先从DeepSeek、Qwen等国内模型入手，无需科学上网）。

### 2.3.1 云端模型配置（OpenAI、DeepSeek、Qwen）

云端模型无需本地部署，只需获取API密钥，即可通过LangChain调用，适合快速开发验证。

#### 1. OpenAI（GPT-3.5/4，需科学上网）

1. 获取API密钥：访问OpenAI平台（[https://platform.openai.com/](https://platform.openai.com/)），注册/登录后，进入「Personal → View API keys」，点击「Create new secret key」生成密钥；

2. LangChain调用示例（简短代码）：

```python
from langchain_openai import ChatOpenAI

# 配置API密钥（后续会用.env管理，此处先直观展示）
llm = ChatOpenAI(
    model_name="gpt-3.5-turbo",
    api_key="你的OpenAI API密钥",
    temperature=0.7
)

# 调用模型生成文本
print(llm.invoke("简单介绍LangChain"))
```

依赖安装：需额外安装OpenAI适配包，命令：`pip install langchain-openai==0.1.6`；代码来源：LangChain OpenAI集成文档（[https://python.langchain.com/docs/integrations/chat/openai](https://python.langchain.com/docs/integrations/chat/openai)）。

#### 2. DeepSeek（国内模型，无需科学上网，免费额度充足）

1. 获取API密钥：访问DeepSeek平台（[https://platform.deepseek.com/](https://platform.deepseek.com/)），注册/登录后，进入「API密钥」页面，创建并复制密钥；

2. LangChain调用示例：

```python
from langchain_community.chat_models import ChatDeepSeek

llm = ChatDeepSeek(
    model_name="deepseek-chat",
    api_key="你的DeepSeek API密钥"
)

print(llm.invoke("用一句话说明LangChain的作用"))
```

依赖说明：无需额外安装包（langchain-community已集成）；代码来源：LangChain DeepSeek集成文档（[https://python.langchain.com/docs/integrations/chat/deepseek](https://python.langchain.com/docs/integrations/chat/deepseek)）。

#### 3. Qwen（阿里通义千问，国内模型，免费可用）

1. 获取API密钥：访问通义千问开放平台（[https://dashscope.aliyun.com/](https://dashscope.aliyun.com/)），注册/登录后，进入「API密钥」页面，创建密钥；

2. LangChain调用示例：

```python
from langchain_community.chat_models import ChatQwen

llm = ChatQwen(
    model_name="qwen-turbo",
    api_key="你的Qwen API密钥"
)

print(llm.invoke("LangChain适合开发什么类型的应用？"))
```

依赖安装：需额外安装适配包，命令：`pip install dashscope==1.14.0`；代码来源：LangChain Qwen集成文档（[https://python.langchain.com/docs/integrations/chat/qwen](https://python.langchain.com/docs/integrations/chat/qwen)）。

### 2.3.2 本地模型配置（Ollama，无需API密钥）

Ollama是一款轻量级本地大模型部署工具，支持llama 3、Qwen、Llama 2等开源模型，无需API密钥，适合无网络或隐私敏感场景，配置步骤如下：

1. 安装Ollama：访问官网（[https://ollama.com/](https://ollama.com/)），下载对应系统版本（Windows/Mac/Linux），默认安装即可；

2. 拉取本地模型：打开终端，输入命令（拉取轻量版llama 3，约4.7GB，适合入门）：`ollama pull llama3:8b`；

3. LangChain调用示例：

```python
from langchain_community.chat_models import ChatOllama

# 调用本地llama 3模型
llm = ChatOllama(model="llama3:8b")

print(llm.invoke("介绍一下你自己"))
```

依赖说明：无需额外安装包（langchain-community已集成）；代码来源：LangChain Ollama集成文档（[https://python.langchain.com/docs/integrations/chat/ollama](https://python.langchain.com/docs/integrations/chat/ollama)）；注意：本地模型运行需占用一定内存（8b模型建议16GB以上内存）。

### 2.3.3 常见问题

- 问题1：API密钥无效/报错“invalid api key”——检查密钥是否复制完整，是否有空格，或重新生成密钥；

- 问题2：OpenAI调用报错“Connection error”——未科学上网，或网络不稳定，切换网络后重试；

- 问题3：Ollama调用报错“model not found”——未拉取对应模型，执行`ollama pull 模型名`重试。

## 2.4 使用 .env 文件管理敏感信息

上一节中，我们将API密钥直接写在代码里，这种方式存在严重安全隐患（代码提交到GitHub、分享给他人时，密钥会泄露）。最佳实践是使用`.env`文件管理敏感信息，通过环境变量加载，避免硬编码。

### 2.4.1 安装依赖包

使用`python-dotenv`包加载`.env`文件，安装命令：

```bash
pip install python-dotenv==1.0.1
```

### 2.4.2 创建 .env 文件（关键步骤）

1. 在你的LangChain项目根目录下，新建一个文件，命名为`.env`（注意：文件名前有一个小数点，无后缀）；

2. 在`.env`文件中，按“KEY=VALUE”格式填写所有敏感信息（如API密钥），示例：

```env
# .env 文件内容（敏感信息统一管理）
OPENAI_API_KEY=你的OpenAI API密钥
DEEPSEEK_API_KEY=你的DeepSeek API密钥
QWEN_API_KEY=你的Qwen API密钥
# 无需填写Ollama相关信息（本地模型无密钥）
```

### 2.4.3 在代码中加载 .env 文件

使用`python-dotenv`加载环境变量，代码示例（以调用DeepSeek为例）：

```python
from langchain_community.chat_models import ChatDeepSeek
from dotenv import load_dotenv
import os

# 加载.env文件中的环境变量
load_dotenv()

# 从环境变量中获取API密钥（无需硬编码）
llm = ChatDeepSeek(
    model_name="deepseek-chat",
    api_key=os.getenv("DEEPSEEK_API_KEY")  # 读取.env中的密钥
)

print(llm.invoke("LangChain如何管理敏感信息？"))
```

代码来源：LangChain官方最佳实践（[https://python.langchain.com/docs/get_started/quickstart#set-environment-variables](https://python.langchain.com/docs/get_started/quickstart#set-environment-variables)）。

### 2.4.4 关键注意事项

- 提交代码时，务必将`.env`文件加入`.gitignore`（新建`.gitignore`文件，添加一行`.env`），避免泄露敏感信息；

- `.env`文件需与运行的Python脚本在同一目录下，否则需指定文件路径（`load_dotenv("xxx/.env")`）；

- 若加载失败，检查环境变量名称是否与`.env`文件中一致（区分大小写）。

## 2.5 虚拟环境与依赖隔离（venv / conda）

在开发过程中，不同项目可能需要不同版本的依赖包（如A项目用LangChain 0.1.10，B项目用LangChain 0.2.0），直接安装在全局环境会导致版本冲突。虚拟环境可以实现“项目级依赖隔离”，每个项目拥有独立的依赖环境，互不干扰。

本节介绍两种常用虚拟环境工具：`venv`（Python自带，轻量）和`conda`（适合数据科学场景，功能强大），按需选择。

### 2.5.1 使用 venv 创建虚拟环境（推荐新手）

venv是Python 3.3+自带的虚拟环境工具，无需额外安装，操作简单。

1. 创建虚拟环境：打开终端，进入你的LangChain项目目录，执行命令（env为虚拟环境名称，可自定义）：`# Windows/Mac/Linux通用
python -m venv env  # Windows用python，Mac/Linux用python3`

2. 激活虚拟环境：
   激活成功后，终端提示符前会出现`(env)`，表示当前处于虚拟环境中。
   - Windows（CMD）：`env\Scripts\activate`

   - Windows（PowerShell）：`.\env\Scripts\Activate.ps1`

   - Mac/Linux：`source env/bin/activate`

3. 安装依赖：在虚拟环境中，执行之前的LangChain安装命令，依赖会安装在虚拟环境中，不影响全局；

4. 退出虚拟环境：终端输入`deactivate`即可。

### 2.5.2 使用 conda 创建虚拟环境（适合数据科学场景）

conda是Anaconda/Miniconda自带的虚拟环境工具，适合需要安装Python、Conda包（如向量数据库、数据处理库）的场景，步骤如下：

1. 安装Miniconda：访问官网（[https://docs.conda.io/en/latest/miniconda.html](https://docs.conda.io/en/latest/miniconda.html)），下载对应系统版本，默认安装；

2. 创建虚拟环境：终端输入（langchain-env为虚拟环境名称，python=3.10指定Python版本）：
   `conda create -n langchain-env python=3.10`

3. 激活虚拟环境：
   `# Windows/Mac/Linux通用
conda activate langchain-env`

4. 安装依赖：与venv一致，执行`pip install`命令即可；

5. 退出虚拟环境：`conda deactivate`；

6. 删除虚拟环境（可选）：`conda remove -n langchain-env --all`。

### 2.5.3 依赖导出与导入（实用技巧）

为了方便他人复现你的环境，或在其他设备上快速搭建，可将虚拟环境的依赖导出为`requirements.txt`文件：

```bash
# 导出依赖（虚拟环境中执行）
pip freeze > requirements.txt
```

他人导入依赖时，执行：

```bash
pip install -r requirements.txt
```

## 2.6 安装常用向量数据库（Chroma、FAISS、Pinecone）

在LangChain开发中，向量数据库是RAG（检索增强生成）场景的核心组件，用于存储文本嵌入（Embedding），实现快速检索。本节介绍3种常用向量数据库的安装与基础配置，覆盖“本地轻量”“本地高性能”“云端托管”三种场景。

### 2.6.1 Chroma（本地轻量，新手首选）

Chroma是一款轻量级本地向量数据库，无需复杂部署，开箱即用，适合开发测试、小规模RAG场景，安装步骤：

1. 安装命令：
   `pip install chromadb==0.5.0`

2. LangChain调用示例（简单验证）：
   `from langchain_community.vectorstores import Chroma
   from langchain_community.embeddings import OpenAIEmbeddings # 需安装openai包

# 初始化Chroma（本地存储，路径为./chroma_db）

vector_db = Chroma(
persist_directory="./chroma_db",
embedding_function=OpenAIEmbeddings(api_key=os.getenv("OPENAI_API_KEY"))
)

# 插入一条测试数据

vector_db.add_texts(texts=["LangChain是大模型应用开发脚手架"])
print("Chroma安装并初始化成功")`

代码来源：LangChain Chroma集成文档（[https://python.langchain.com/docs/integrations/vectorstores/chroma](https://python.langchain.com/docs/integrations/vectorstores/chroma)）；注意：Chroma默认存储在本地，无需启动服务，直接调用即可。

### 2.6.2 FAISS（本地高性能，适合大规模数据）

FAISS（Facebook AI Similarity Search）是Meta开源的高性能向量检索库，适合本地大规模文本嵌入存储与检索，安装步骤：

1. 安装命令（区分系统）：
   `# Windows/Mac/Linux通用（基础版）
   pip install faiss-cpu==1.7.4

# 若有GPU，可安装GPU版（需适配CUDA）

# pip install faiss-gpu==1.7.4`

2. LangChain调用示例：
   `from langchain_community.vectorstores import FAISS
   from langchain_community.embeddings import DeepSeekEmbeddings

# 初始化FAISS（内存中存储，可持久化到本地）

vector_db = FAISS.from_texts(
texts=["LangChain支持多种向量数据库"],
embedding=DeepSeekEmbeddings(api_key=os.getenv("DEEPSEEK_API_KEY"))
)

# 持久化到本地（可选）

vector_db.save_local("faiss_db")
print("FAISS安装并初始化成功")`

代码来源：LangChain FAISS集成文档（[https://python.langchain.com/docs/integrations/vectorstores/faiss](https://python.langchain.com/docs/integrations/vectorstores/faiss)）；注意：FAISS默认在内存中运行，需手动调用`save_local`持久化到本地。

### 2.6.3 Pinecone（云端托管，适合生产环境）

Pinecone是一款云端托管向量数据库，无需本地部署，支持大规模数据、高并发检索，适合生产环境，步骤如下：

1. 获取API密钥：访问Pinecone官网（[https://www.pinecone.io/](https://www.pinecone.io/)），注册/登录后，创建索引，获取API密钥和环境（如us-west1-gcp）；

2. 安装命令：
   `pip install pinecone-client==3.2.2 langchain-pinecone==0.1.0`

3. LangChain调用示例（需先在.env中配置Pinecone密钥）：`from langchain_pinecone import PineconeVectorStore
   from langchain_community.embeddings import QwenEmbeddings
   import pinecone

# 初始化Pinecone

pinecone.init(
api_key=os.getenv("PINECONE_API_KEY"),
environment=os.getenv("PINECONE_ENV") # 如us-west1-gcp
)

# 连接已创建的索引

vector_db = PineconeVectorStore(
index_name="langchain-test", # 你的Pinecone索引名
embedding=QwenEmbeddings(api_key=os.getenv("QWEN_API_KEY"))
)
print("Pinecone连接成功")`

代码来源：LangChain Pinecone集成文档（[https://python.langchain.com/docs/integrations/vectorstores/pinecone](https://python.langchain.com/docs/integrations/vectorstores/pinecone)）；注意：Pinecone有免费额度，超出额度需付费。

## 2.7 Jupyter Notebook 与 VS Code 调试技巧

LangChain开发中，调试是核心环节——链式调用、工具调用的流程复杂，需要实时查看每一步的输出。本节介绍两种常用开发工具（Jupyter Notebook、VS Code）的调试技巧，提升开发效率。

### 2.7.1 Jupyter Notebook（交互式调试，适合快速验证）

Jupyter Notebook支持逐行运行代码、实时查看输出，适合调试LangChain的组件调用、链式流程，步骤如下：

1. 安装Jupyter Notebook：
   `pip install jupyter==1.0.0`

2. 启动Jupyter：终端输入`jupyter notebook`，自动打开浏览器，进入项目目录；

3. 创建Notebook：点击「New → Python 3」，新建.ipynb文件；

4. 调试技巧（核心）：
   - 逐块运行代码：每写一段代码（如初始化LLM、创建Prompt），点击「Run」运行，查看输出，避免一次性运行全部代码导致报错难以定位；

   - 查看组件输出：在链式调用中，可单独打印每一步的输出（如打印Prompt模板、打印LLM的原始响应），示例：
     `from langchain_core.prompts import PromptTemplate
     from langchain_community.chat_models import ChatDeepSeek

   # 逐块运行，查看每一步输出

   prompt = PromptTemplate.from_template("{question}")
   print("Prompt模板：", prompt.format(question="LangChain调试技巧"))

   llm = ChatDeepSeek(api_key=os.getenv("DEEPSEEK_API_KEY"))
   response = llm.invoke(prompt.format(question="LangChain调试技巧"))
   print("LLM响应：", response.content)`
   - 清除输出：报错后，点击「Kernel → Restart & Clear Output」，重新运行代码。

### 2.7.2 VS Code（专业调试，适合项目开发）

VS Code是LangChain项目开发的首选工具，支持代码补全、断点调试、虚拟环境切换，调试技巧如下：

1. 配置Python环境：打开VS Code，安装「Python」插件（微软官方），点击左下角的Python版本，切换到之前创建的虚拟环境（如env、langchain-env）；

2. 断点调试（核心）：
   - 在需要调试的代码行左侧点击，出现红色断点（如LLM调用、链式调用行）；

   - 点击顶部「运行和调试」按钮（或按F5），启动调试模式；

   - 调试快捷键：F10（单步跳过）、F11（单步进入）、Shift+F11（单步退出），可查看每一步的变量值、函数调用流程；

   - 查看LangChain链的运行日志：在代码中添加`verbose=True`（如ConversationChain、LLMChain），调试时可在控制台查看详细日志，示例：
     `from langchain.chains import LLMChain

   chain = LLMChain(llm=llm, prompt=prompt, verbose=True) # 开启详细日志
   chain.invoke({"question": "LangChain调试技巧"})`

3. 代码补全与提示：安装「LangChain」插件（VS Code商店搜索），可获得LangChain API的代码补全、文档提示，提升开发效率。

### 2.7.3 通用调试技巧（必看）

- 开启LangChain详细日志：在代码开头添加以下代码，查看组件调用的完整流程，快速定位报错位置：
  `import logging
logging.basicConfig(level=logging.INFO)  # 开启INFO级别日志`

- 报错定位：优先查看报错信息的最后一行，找到“Error”关键词，再向上追溯，重点关注“组件初始化”“API调用”“参数传递”三个环节；

- 简化调试：遇到复杂链式调用报错时，先拆解为单个组件（如先验证LLM是否能正常调用，再验证Prompt模板，最后拼接成链）。

## 2.8 【实战】验证环境：调用本地/云端大模型

本节通过一个完整实战案例，验证整个开发环境是否配置成功——分别调用「云端模型（DeepSeek）」和「本地模型（Ollama）」，实现简单的文本生成功能，整合前面所学的.env管理、虚拟环境、组件调用等知识点。

### 2.8.1 实战准备

- 确保已激活虚拟环境；

- 确保.env文件已配置DeepSeek API密钥（Ollama无需配置）；

- 确保已安装所需依赖（langchain-core、langchain-community、python-dotenv、ollama（本地模型））。

### 2.8.2 实战代码（完整可运行）

```python
"""
实战：验证LangChain开发环境，调用云端/本地大模型
代码来源：LangChain官方实战示例改编（https://python.langchain.com/docs/get_started/quickstart）
"""
from dotenv import load_dotenv
import os
from langchain_community.chat_models import ChatDeepSeek, ChatOllama
from langchain_core.prompts import PromptTemplate
from langchain.chains import LLMChain

# 1. 加载环境变量（敏感信息管理）
load_dotenv()

# 2. 定义Prompt模板
prompt = PromptTemplate.from_template(
    "请用简洁的语言回答以下问题：{question}\n回答要求：不超过50字，通俗易懂。"
)

# 3. 调用云端模型（DeepSeek）
print("=== 调用云端模型（DeepSeek） ===")
try:
    cloud_llm = ChatDeepSeek(
        model_name="deepseek-chat",
        api_key=os.getenv("DEEPSEEK_API_KEY")
    )
    cloud_chain = LLMChain(llm=cloud_llm, prompt=prompt, verbose=False)
    cloud_response = cloud_chain.invoke({"question": "LangChain环境搭建的核心步骤是什么？"})
    print("云端模型回答：", cloud_response["text"])
except Exception as e:
    print("云端模型调用失败：", str(e))

# 4. 调用本地模型（Ollama - llama3:8b）
print("\n=== 调用本地模型（Ollama - llama3） ===")
try:
    local_llm = ChatOllama(model="llama3:8b")
    local_chain = LLMChain(llm=local_llm, prompt=prompt, verbose=False)
    local_response = local_chain.invoke({"question": "LangChain环境搭建的核心步骤是什么？"})
    print("本地模型回答：", local_response["text"])
except Exception as e:
    print("本地模型调用失败：", str(e))

print("\n=== 环境验证完成 ===")
if "cloud_response" in locals() or "local_response" in locals():
    print("✅ 至少一种模型调用成功，环境配置正常！")
else:
    print("❌ 模型调用失败，请检查环境配置！")
```

### 2.8.3 运行结果与解读

#### 1. 正常运行结果

```text
=== 调用云端模型（DeepSeek） ===
云端模型回答： 安装Python、LangChain核心包，配置LLM API密钥，用.env管理敏感信息。
=== 调用本地模型（Ollama - llama3） ===
本地模型回答： 准备Python环境，安装依赖，配置模型，验证调用即可完成LangChain环境搭建。
=== 环境验证完成 ===
✅ 至少一种模型调用成功，环境配置正常！
```

#### 2. 结果解读

- 代码整合了「.env敏感信息管理」「Prompt模板」「LLMChain链式调用」「云端/本地模型适配」，覆盖本章核心知识点；

- 若云端模型调用失败，优先检查API密钥、网络（如OpenAI需科学上网）；

- 若本地模型调用失败，检查Ollama是否安装、模型是否拉取成功（执行`ollama list`查看已拉取模型）。

### 2.8.4 常见问题排查

- 问题1：报错“ModuleNotFoundError: No module named 'langchain_community'”——未安装langchain-community包，执行`pip install langchain-community`；

- 问题2：本地模型调用报错“Connection refused”——Ollama服务未启动，重启Ollama（Windows在服务中重启，Mac/Linux执行`ollama serve`）；

- 问题3：链式调用报错“KeyError: 'text'”——检查LLM调用是否成功，可单独打印`cloud_llm.invoke("测试")`，查看是否有响应。

## 本章小结

本章我们完成了LangChain开发环境的全流程搭建，从Python环境准备、核心包安装，到LLM API密钥配置、敏感信息管理，再到虚拟环境隔离、向量数据库安装和调试工具使用，最后通过实战验证了环境的可用性。

核心要点回顾：

- Python 3.9~3.11是LangChain的最佳适配版本，避免版本过高或过低导致的兼容性问题；

- langchain-core和langchain-community是必装核心包，按需安装扩展包；

- 敏感信息（API密钥）必须用.env文件管理，避免硬编码，提交代码时忽略.env文件；

- 虚拟环境是依赖隔离的关键，推荐用venv（新手）或conda（数据科学场景）；

- Chroma适合新手开发测试，FAISS适合本地大规模数据，Pinecone适合生产环境；

- Jupyter适合快速验证，VS Code适合项目开发，断点调试和日志打印是定位问题的核心技巧。

环境搭建完成后，下一章我们将深入学习LangChain的核心组件——Prompt模板，掌握Prompt工程的技巧，让大模型生成更精准、更符合需求的回答。
