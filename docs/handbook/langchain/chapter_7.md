# 第7章 文档加载与文本分割

在LangChain开发中，我们常常需要处理**外部文档**——比如PDF格式的公司制度、Word格式的报告、HTML网页内容、Markdown文档等，再结合大模型实现问答、总结、检索等功能。但大模型存在“上下文窗口限制”（如GPT-3.5-turbo上下文窗口约4k tokens），无法直接处理长篇文档；同时，不同格式的文档解析方式不同，手动解析效率极低。

本章核心解决两个问题：**如何高效加载不同格式的外部文档**、**如何将长篇文档分割为符合上下文窗口的小块**，同时保留文档元数据（来源、页码、章节等），为后续的检索增强生成（RAG）、文档问答等场景打下基础。

全文遵循“理论+实战”模式，代码示例简洁可复制、标注来源，避免复杂冗余，贴合掘金博主常用的“场景引入→工具讲解→代码实战→技巧总结”结构，让你快速掌握文档加载与分割的核心用法。

## 7.1 支持的文档格式（PDF、Word、HTML、Markdown 等）

LangChain本身集成了大量**开箱即用的文档加载器（Document Loader）**，覆盖主流文档格式，无需手动编写解析逻辑，只需调用对应加载器，即可将文档内容转换为LangChain统一的`Document`对象（包含文本内容和元数据），便于后续统一处理。

### 7.1.1 主流支持格式与对应加载器

以下是开发中最常用的文档格式及对应的LangChain加载器，无需额外开发，安装依赖后即可直接使用：

| 文档格式              | 对应加载器                                 | 核心特点                                              | 依赖安装                                               |
| --------------------- | ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------ |
| PDF                   | PyPDFLoader、UnstructuredPDFLoader         | PyPDF轻量快速，Unstructured支持复杂排版（图片、表格） | pip install pypdf / pip install unstructured           |
| Word（.docx）         | Docx2txtLoader、UnstructuredWordLoader     | Docx2txt轻量，Unstructured支持复杂样式                | pip install docx2txt / pip install unstructured        |
| HTML（网页/本地文件） | URLLoader（网页）、HTMLLoader（本地）      | 自动提取网页文本，去除标签冗余                        | pip install beautifulsoup4（HTMLLoader依赖）           |
| Markdown              | UnstructuredMarkdownLoader、MarkdownLoader | 保留Markdown结构，可提取标题、段落                    | pip install unstructured / pip install python-markdown |
| 纯文本（.txt）        | TextLoader                                 | 最简单，直接读取文本内容                              | 无需额外依赖（LangChain自带）                          |
| Excel（.xlsx）        | PandasExcelLoader                          | 支持读取表格数据，转换为文本或DataFrame               | pip install pandas openpyxl                            |

### 7.1.2 Document 对象详解

所有加载器加载文档后，都会返回一个`List[Document]`（Document对象列表），每个Document对象包含两个核心属性，是后续处理的基础：

- `page_content`：文档的核心文本内容（字符串）；

- `metadata`：文档的元数据（字典），默认包含来源（source）、页码（page）等信息，可自定义扩展（如章节、作者）。

示例（查看Document对象结构）：

```python
from langchain.document_loaders import TextLoader

# 加载本地txt文件
loader = TextLoader("test.txt")
documents = loader.load()  # 返回List[Document]

# 查看Document对象结构
print("文档数量：", len(documents))
print("文本内容：", documents[0].page_content[:100])  # 截取前100字符
print("元数据：", documents[0].metadata)
```

运行结果：

```text
文档数量： 1
文本内容： LangChain是一个用于构建大语言模型应用的框架，支持文档加载、文本分割、提示工程、链式调用等功能。
元数据： {'source': 'test.txt'}
```

说明：不同加载器的metadata默认字段不同（如PDF加载器会包含page页码），后续可通过元数据注入，补充更多自定义信息。

## 7.2 使用 Unstructured、PyPDF、Docx2txt 加载器

在众多加载器中，`PyPDF`（PDF专用）、`Docx2txt`（Word专用）、`Unstructured`（通用多格式）是开发中最常用的三个，分别对应“轻量快速”和“复杂排版兼容”两种场景。本节重点讲解这三个加载器的实战用法，代码简洁可直接复制。

### 7.2.1 PyPDFLoader：轻量快速加载PDF（推荐）

`PyPDFLoader`是LangChain中最常用的PDF加载器，轻量、快速，支持读取PDF的每一页，自动生成页码元数据，适合大多数简单排版的PDF（纯文本、无复杂图片/表格）。

```python
from langchain.document_loaders import PyPDFLoader

# 1. 初始化加载器（本地PDF文件路径）
loader = PyPDFLoader("company_policy.pdf")  # 替换为你的PDF路径

# 2. 加载文档（按页分割，每一页对应一个Document对象）
documents = loader.load()

# 3. 查看结果
print(f"PDF总页数：{len(documents)}")
print(f"第1页内容：{documents[0].page_content[:200]}...")
print(f"第1页元数据：{documents[0].metadata}")  # 包含页码（page）和来源（source）
```

代码来源：LangChain PyPDFLoader官方示例（[https://python.langchain.com/docs/modules/data_connection/document_loaders/pdf#pypdf](https://python.langchain.com/docs/modules/data_connection/document_loaders/pdf#pypdf)）；

依赖安装：`pip install pypdf`；

注意事项：若PDF有密码，需先解密（可使用PyPDF的decrypt方法）；复杂排版（如图片、表格）会丢失内容，此时需用UnstructuredPDFLoader。

### 7.2.2 Docx2txtLoader：轻量加载Word文档

`Docx2txtLoader`专门用于加载Word（.docx）文档，轻量无冗余，能快速提取文档文本内容，适合大多数简单样式的Word文档，不支持复杂表格和图片提取。

```python
from langchain.document_loaders import Docx2txtLoader

# 1. 初始化加载器（本地Word文件路径）
loader = Docx2txtLoader("report.docx")  # 替换为你的Word路径

# 2. 加载文档（整个文档为一个Document对象）
documents = loader.load()

# 3. 查看结果
print(f"文档数量：{len(documents)}")
print(f"文档内容：{documents[0].page_content[:300]}...")
print(f"元数据：{documents[0].metadata}")
```

代码来源：LangChain Docx2txtLoader官方示例（[https://python.langchain.com/docs/modules/data_connection/document_loaders/word#docx2txt](https://python.langchain.com/docs/modules/data_connection/document_loaders word#docx2txt)）；

依赖安装：`pip install docx2txt`；

替代方案：若需要提取Word中的表格、图片，可使用`UnstructuredWordLoader`（依赖`pip install unstructured`）。

### 7.2.3 UnstructuredLoader：通用多格式加载（复杂排版兼容）

`Unstructured`是一个通用的文档解析库，LangChain集成了对应的加载器（`UnstructuredPDFLoader`、`UnstructuredWordLoader`、`UnstructuredMarkdownLoader`等），支持复杂排版的文档（如PDF中的图片、表格，Word中的复杂样式），能最大程度保留文档结构。

实战示例（加载复杂PDF）：

```python
from langchain.document_loaders import UnstructuredPDFLoader

# 1. 初始化加载器（支持本地文件、远程URL）
loader = UnstructuredPDFLoader("complex_policy.pdf", mode="elements")  # mode="elements"保留文档元素结构

# 2. 加载文档
documents = loader.load()

# 3. 查看结果（每个文档元素对应一个Document对象，如段落、表格）
print(f"文档元素数量：{len(documents)}")
print(f"第一个元素内容：{documents[0].page_content[:200]}...")
print(f"第一个元素元数据：{documents[0].metadata}")  # 包含元素类型（如"Paragraph"）
```

代码来源：LangChain UnstructuredLoader官方示例（[https://python.langchain.com/docs/modules/data_connection/document_loaders/pdf#unstructuredpdfloader](https://python.langchain.com/docs/modules/data_connection/document_loaders/pdf#unstructuredpdfloader)）；

依赖安装：`pip install unstructured`（若需要处理图片，需额外安装`pip install pillow`）；

核心优势：兼容复杂排版，支持提取图片、表格、段落等元素，适合对文档结构要求高的场景；劣势：速度比PyPDF、Docx2txt慢，资源消耗略高。

### 7.2.4 加载网页HTML（URLLoader）

除了本地文档，开发中常需要加载网页内容（如爬取网页文档进行分析），LangChain的`URLLoader`可直接通过URL加载网页，自动提取文本内容，去除HTML标签冗余。

```python
from langchain.document_loaders import URLLoader

# 1. 初始化加载器（支持多个URL，传入列表）
urls = ["https://python.langchain.com/docs/modules/data_connection/document_loaders",]
loader = URLLoader(urls=urls)

# 2. 加载网页内容
documents = loader.load()

# 3. 查看结果
print(f"网页数量：{len(documents)}")
print(f"网页文本：{documents[0].page_content[:300]}...")
print(f"元数据：{documents[0].metadata}")  # 包含网页URL
```

依赖安装：`pip install beautifulsoup4`；

注意事项：部分网页有反爬机制，可能无法加载，可搭配代理或请求头优化（需自定义加载器，后续7.3节讲解）。

## 7.3 自定义 Document Loader 开发

LangChain的内置加载器覆盖了主流格式，但在实际开发中，可能遇到**特殊格式文档**（如自定义格式的配置文件、小众格式的报告）或**特殊加载需求**（如带反爬的网页、需要权限的文档），此时需要开发自定义Document Loader。

自定义Document Loader的核心很简单：继承LangChain的`BaseLoader`类，重写两个方法即可实现自定义加载逻辑。

### 7.3.1 自定义Loader的核心步骤

所有自定义加载器都需继承`langchain.document_loaders.base.BaseLoader`，并重写以下两个方法：

1. `load(self) -> List[Document]`：核心方法，实现文档加载逻辑，返回Document对象列表；

2. `load_and_split(self, text_splitter: Optional[TextSplitter] = None) -> List[Document]`：可选方法，加载文档后直接进行文本分割，返回分割后的Document列表（可复用父类方法，无需重写）。

### 7.3.2 实战示例1：自定义加载器加载特殊格式文档（.custom）

场景：加载自定义格式的`.custom`文件（文本内容用“###”分隔段落），提取每个段落作为一个Document对象，补充自定义元数据。

```python
from langchain.document_loaders.base import BaseLoader
from langchain.schema import Document
from typing import List

# 自定义加载器，继承BaseLoader
class CustomFileLoader(BaseLoader):
    def __init__(self, file_path: str):
        """初始化，传入文件路径"""
        self.file_path = file_path

    def load(self) -> List[Document]:
        """核心加载逻辑"""
        documents = []
        # 读取文件内容
        with open(self.file_path, "r", encoding="utf-8") as f:
            content = f.read()
            # 按"###"分割段落
            paragraphs = content.split("###")
            # 遍历段落，生成Document对象
            for idx, para in enumerate(paragraphs):
                if para.strip():  # 跳过空段落
                    # 元数据：自定义页码、来源、段落序号
                    metadata = {
                        "source": self.file_path,
                        "page": idx + 1,
                        "paragraph": idx + 1
                    }
                    # 生成Document对象
                    doc = Document(page_content=para.strip(), metadata=metadata)
                    documents.append(doc)
        return documents

# 测试自定义加载器
loader = CustomFileLoader("test.custom")
documents = loader.load()

print(f"加载的段落数量：{len(documents)}")
for doc in documents[:2]:
    print(f"段落{doc.metadata['paragraph']}：{doc.page_content[:100]}...")
    print(f"元数据：{doc.metadata}\n")
```

代码说明：自定义加载器可灵活控制加载逻辑，比如分割规则、元数据补充，适配特殊格式需求；

注意事项：需确保文件编码正确（如utf-8），避免中文乱码；可根据需求添加异常处理（如文件不存在、读取失败）。

### 7.3.3 实战示例2：自定义网页加载器（带请求头，突破反爬）

场景：内置URLLoader无法加载带反爬的网页，自定义加载器添加请求头（User-Agent、Cookie），模拟浏览器请求，实现网页加载。

```python
from langchain.document_loaders.base import BaseLoader
from langchain.schema import Document
from typing import List
import requests
from bs4 import BeautifulSoup

class CustomURLLoader(BaseLoader):
    def __init__(self, urls: List[str], headers: dict = None):
        """初始化，传入URL列表和请求头"""
        self.urls = urls
        # 默认请求头（模拟Chrome浏览器）
        self.headers = headers or {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def load(self) -> List[Document]:
        documents = []
        for url in self.urls:
            try:
                # 发送请求，添加请求头
                response = requests.get(url, headers=self.headers, timeout=10)
                response.raise_for_status()  # 抛出HTTP错误
                # 解析HTML，提取文本
                soup = BeautifulSoup(response.text, "html.parser")
                text = soup.get_text(strip=True)  # 去除多余空格和换行
                # 生成Document对象
                doc = Document(
                    page_content=text,
                    metadata={"source": url, "status_code": response.status_code}
                )
                documents.append(doc)
            except Exception as e:
                print(f"加载URL {url} 失败：{str(e)}")
        return documents

# 测试自定义网页加载器
urls = ["https://www.example.com"]  # 替换为需要加载的网页
loader = CustomURLLoader(urls=urls)
documents = loader.load()

if documents:
    print(f"加载成功，网页文本：{documents[0].page_content[:300]}...")
```

代码来源：基于LangChain BaseLoader自定义开发（参考官方自定义加载器文档：[https://python.langchain.com/docs/modules/data_connection/document_loaders/custom](https://python.langchain.com/docs/modules/data_connection/document_loaders/custom)）；

核心技巧：可根据网页反爬机制，添加Cookie、代理IP等配置，提升加载成功率；添加异常处理，避免单个URL加载失败导致整个流程崩溃。

### 7.3.4 自定义Loader复用技巧

- 封装通用逻辑：将重复的加载逻辑（如文件读取、请求发送）封装为私有方法，提升代码可维护性；

- 参数化配置：将文件路径、URL、请求头、分割规则等设为参数，让加载器更灵活，适配不同场景；

- 集成到LangChain生态：自定义加载器可与后续的文本分割、向量存储等组件无缝衔接，无需额外适配。

## 7.4 文本分割策略：CharacterTextSplitter vs RecursiveCharacterTextSplitter

加载文档后，我们常常面临一个问题：文档内容过长（如几百页的PDF），超过大模型的上下文窗口，无法直接输入模型。此时需要对文档进行**文本分割**（也叫“文档切块”），将长篇文本分割为多个短小的文本块，每个文本块的长度符合模型上下文窗口要求。

LangChain提供了多种文本分割器，其中最常用的是`CharacterTextSplitter`和`RecursiveCharacterTextSplitter`，两者适用场景不同，本节重点对比两者的区别和用法。

### 7.4.1 核心概念：分割器的关键参数

所有文本分割器都有以下3个核心参数，需根据模型上下文窗口和文档特点配置：

- `chunk_size`：每个文本块的最大长度（单位：token或字符，默认字符）；

- `chunk_overlap`：相邻文本块的重叠长度（单位：同chunk_size），用于保留上下文关联性（避免分割后语义断裂）；

- `length_function`：长度计算函数（默认计算字符数，可替换为token计算函数，如tiktoken）。

提示：实际配置时，chunk_size建议设为模型上下文窗口的70%-80%（如GPT-3.5-turbo设为3000字符），chunk_overlap设为chunk_size的10%-20%（如300字符），确保文本块关联性。

### 7.4.2 CharacterTextSplitter：按固定字符分割（简单直接）

`CharacterTextSplitter`是最基础的文本分割器，核心逻辑：**按指定的分隔符（默认是"\n\n"，即空行）分割文本，若分割后的文本块长度超过chunk_size，则强制按字符分割**。

适用场景：文本结构简单（如纯文本、无明显语义边界），或需要严格控制文本块长度的场景。

```python
from langchain.text_splitter import CharacterTextSplitter

# 1. 模拟加载的长文本
long_text = """LangChain是一个用于构建大语言模型应用的框架。它提供了丰富的组件，包括文档加载器、文本分割器、提示模板、输出解析器、链式调用等。
文档加载器用于加载不同格式的外部文档，如PDF、Word、HTML等。文本分割器用于将长篇文档分割为符合模型上下文窗口的文本块，避免超过模型限制。
提示模板用于标准化模型输入，提升输出质量。输出解析器用于将模型的自由文本输出转换为结构化数据，便于后续处理。"""

# 2. 初始化CharacterTextSplitter
text_splitter = CharacterTextSplitter(
    chunk_size=100,  # 每个文本块最大100字符
    chunk_overlap=20,  # 相邻文本块重叠20字符
    separator="\n\n"  # 按空行分割
)

# 3. 分割文本
chunks = text_splitter.split_text(long_text)

# 4. 查看结果
print(f"分割后的文本块数量：{len(chunks)}")
for i, chunk in enumerate(chunks):
    print(f"\n文本块{i+1}（长度：{len(chunk)}）：{chunk}")
```

代码来源：LangChain CharacterTextSplitter官方示例（[https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/character_level](https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/character_level)）；

运行结果说明：文本先按空行分割为3个块，若某个块超过100字符，会强制按字符分割；相邻块有20字符重叠，保留上下文关联。

缺点：可能会破坏语义边界（如将一个完整句子分割为两个文本块），导致语义断裂。

### 7.4.3 RecursiveCharacterTextSplitter：按语义边界递归分割（推荐）

`RecursiveCharacterTextSplitter`是LangChain官方推荐的文本分割器，核心逻辑：**按优先级从高到低的分隔符递归分割文本**，优先按语义边界（如段落、句子）分割，若分割后的文本块仍超过chunk_size，再按更低优先级的分隔符分割，直到符合要求。

默认分隔符优先级（从高到低）：`"\n\n"（空行，段落）→ "\n"（换行，句子）→ " "（空格，单词）→ ""（字符）`，确保尽可能保留语义完整性。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 1. 复用上面的长文本
long_text = """LangChain是一个用于构建大语言模型应用的框架。它提供了丰富的组件，包括文档加载器、文本分割器、提示模板、输出解析器、链式调用等。
文档加载器用于加载不同格式的外部文档，如PDF、Word、HTML等。文本分割器用于将长篇文档分割为符合模型上下文窗口的文本块，避免超过模型限制。
提示模板用于标准化模型输入，提升输出质量。输出解析器用于将模型的自由文本输出转换为结构化数据，便于后续处理。"""

# 2. 初始化RecursiveCharacterTextSplitter（推荐配置）
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=100,
    chunk_overlap=20,
    length_function=len  # 按字符长度计算（可替换为token计算）
)

# 3. 分割文本
chunks = text_splitter.split_text(long_text)

# 4. 查看结果
print(f"分割后的文本块数量：{len(chunks)}")
for i, chunk in enumerate(chunks):
    print(f"\n文本块{i+1}（长度：{len(chunk)}）：{chunk}")
```

代码来源：LangChain RecursiveCharacterTextSplitter官方示例（[https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/recursive_character](https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/recursive_character)）；

运行结果说明：优先按空行（段落）分割，若段落长度超过100字符，再按换行（句子）分割，尽可能保留完整的句子和段落，避免语义断裂。

### 7.4.4 两者对比与选型建议

| 分割器                         | 分割逻辑                                 | 优势                             | 劣势                            | 适用场景                                               |
| ------------------------------ | ---------------------------------------- | -------------------------------- | ------------------------------- | ------------------------------------------------------ |
| CharacterTextSplitter          | 按固定分隔符分割，超限则强制按字符分割   | 简单直接，速度快，可自定义分隔符 | 易破坏语义边界，导致语义断裂    | 文本结构简单、无明显语义边界的场景                     |
| RecursiveCharacterTextSplitter | 按优先级分隔符递归分割，优先保留语义边界 | 保留语义完整性，适配大多数文档   | 速度略慢于CharacterTextSplitter | 绝大多数场景（推荐首选），尤其是有段落、句子结构的文档 |

实战建议：无论什么文档，优先使用RecursiveCharacterTextSplitter；只有当文本无任何语义结构（如纯字符流）时，再使用CharacterTextSplitter。

## 7.5 按语义边界分割（基于句子、段落）

上一节的RecursiveCharacterTextSplitter已经能优先按语义边界（段落、句子）分割，但在某些场景下，我们需要更精准的语义分割（如仅按句子分割、仅按段落分割，或自定义语义边界），LangChain提供了对应的分割器和配置方法。

### 7.5.1 按段落分割（自定义分隔符）

段落是最自然的语义边界之一，可通过自定义分隔符（如"\n\n"、"##"等），实现纯段落分割，确保每个文本块都是一个完整的段落。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 模拟带段落的长文本
text = """## 7.1 支持的文档格式
LangChain支持多种主流文档格式，包括PDF、Word、HTML、Markdown等，每种格式都有对应的加载器。

## 7.2 使用Unstructured、PyPDF、Docx2txt加载器
PyPDF适合轻量PDF加载，Docx2txt适合Word加载，Unstructured适合复杂排版文档加载。

## 7.3 自定义Document Loader开发
自定义加载器需继承BaseLoader类，重写load方法，实现自定义加载逻辑。"""

# 按段落分割（分隔符为"\n\n"，即空行）
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=200,
    chunk_overlap=0,  # 段落分割可无需重叠
    separators=["\n\n"]  # 仅按空行分割（段落）
)

chunks = text_splitter.split_text(text)
print(f"段落分割结果（{len(chunks)}个段落）：")
for chunk in chunks:
    print(f"\n{chunk}")
```

说明：通过设置separators=["\n\n"]，强制仅按空行分割，每个文本块对应一个完整段落，适合需要保留段落结构的场景（如文档问答）。

### 7.5.2 按句子分割（基于NLTK/Spacy）

对于需要更精细语义分割的场景（如单句级别的检索），可使用基于NLTK或Spacy的句子分割器，按句子分割文本，确保每个文本块都是一个完整的句子。

示例（基于NLTK句子分割）：

```python
from langchain.text_splitter import NLTKTextSplitter

# 1. 安装依赖
# pip install nltk
# 首次使用需下载nltk数据：import nltk; nltk.download('punkt')

# 2. 初始化句子分割器
text_splitter = NLTKTextSplitter(chunk_size=100, chunk_overlap=10)

# 3. 分割文本
text = "LangChain是一个强大的框架。它支持文档加载、文本分割等功能。开发者可以用它快速构建LLM应用。"
chunks = text_splitter.split_text(text)

print(f"句子分割结果（{len(chunks)}个句子）：")
for chunk in chunks:
    print(f"- {chunk}")
```

代码来源：LangChain NLTKTextSplitter官方示例（[https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/sentence_level](https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/sentence_level)）；

替代方案：若需要更精准的中文句子分割，可使用`SpacyTextSplitter`（依赖`pip install spacy`，并下载中文模型`python -m spacy download zh_core_web_sm`）。

### 7.5.3 自定义语义边界分割

若文档有自定义的语义边界（如按“### 章节”分割、按“---”分割），可通过设置RecursiveCharacterTextSplitter的separators参数，自定义分割优先级，实现精准分割。

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 模拟带自定义章节的文本
text = """### 章节1：文档加载
文档加载是LangChain的核心功能之一，用于加载外部文档。
常用加载器有PyPDF、Docx2txt、Unstructured等。

### 章节2：文本分割
文本分割用于将长篇文档切块，适配模型上下文窗口。
推荐使用RecursiveCharacterTextSplitter。

### 章节3：元数据注入
元数据注入用于补充文档来源、页码等信息，提升检索准确性。"""

# 自定义分割优先级：先按"### "分割（章节），再按空行（段落），最后按句子
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=150,
    chunk_overlap=20,
    separators=["### ", "\n\n", "\n"]
)

chunks = text_splitter.split_text(text)
print(f"自定义语义分割结果（{len(chunks)}个块）：")
for i, chunk in enumerate(chunks):
    print(f"\n块{i+1}：{chunk}")
```

说明：separators参数接收一个列表，列表中元素的顺序即为分割优先级，先按“### ”分割章节，若章节过长，再按空行分割段落，确保语义完整性。

## 7.6 处理代码文件与表格数据

前面讲解的分割策略主要适用于纯文本、文档类内容，而开发中常需要处理**代码文件**（如Python、Java文件）和**表格数据**（如Excel、CSV），这类内容的分割和加载有其特殊性，需要使用专门的加载器和分割策略。

### 7.6.1 加载与分割代码文件

代码文件（如.py、.java）的核心是“代码块、函数、类”，分割时需保留代码结构（如函数完整、语法正确），LangChain提供`LanguageParser`（语言解析器），可按代码语法分割。

```python
from langchain.document_loaders import TextLoader
from langchain.text_splitter import LanguageParser

# 1. 加载Python代码文件
loader = TextLoader("test.py")
documents = loader.load()

# 2. 初始化代码分割器（指定语言，支持python、java、javascript等）
code_splitter = LanguageParser(
    language="python",
    chunk_size=200,
    chunk_overlap=20
)

# 3. 分割代码（需传入Document对象列表）
chunks = code_splitter.split_documents(documents)

# 4. 查看结果
print(f"代码分割结果（{len(chunks)}个块）：")
for chunk in chunks:
    print(f"\n{chunk.page_content}")
    print(f"元数据：{chunk.metadata}")
```

代码来源：LangChain LanguageParser官方示例（[https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/code_splitter](https://python.langchain.com/docs/modules/data_connection/document_transformers/text_splitters/code_splitter)）；

依赖安装：`pip install tree-sitter`（代码语法解析依赖）；

核心优势：按代码语法分割，保留函数、类的完整性，避免将一个函数分割为多个块，适合代码问答、代码总结场景。

### 7.6.2 加载与处理表格数据

表格数据（如Excel、CSV）的核心是“行、列”，加载时需保留表格结构，分割时需避免破坏行数据的完整性，常用`PandasExcelLoader`加载，再按行或按表格分割。

```python
from langchain.document_loaders import PandasExcelLoader
from langchain.text_splitter import CharacterTextSplitter

# 1. 加载Excel表格（支持.xlsx、.xls格式）
loader = PandasExcelLoader("data.xlsx", sheet_name="Sheet1")  # 指定工作表
documents = loader.load()  # 加载后，表格数据转换为文本格式

# 2. 分割表格文本（按行分割，保留每行数据完整性）
text_splitter = CharacterTextSplitter(
    chunk_size=100,
    chunk_overlap=0,
    separator="\n"  # 按行分割
)

chunks = text_splitter.split_documents(documents)

# 3. 查看结果
print(f"表格分割结果（{len(chunks)}个行块）：")
for chunk in chunks:
    print(f"- {chunk.page_content}")
```

代码来源：LangChain PandasExcelLoader官方示例（[https://python.langchain.com/docs/modules/data_connection/document_loaders/excel#pandasexecloader](https://python.langchain.com/docs/modules/data_connection/document_loaders/excel#pandasexecloader)）；

依赖安装：`pip install pandas openpyxl`；

技巧：若表格过大，可按“多个行组成一个块”分割，调整chunk_size和separator，确保每个块包含完整的多行数据，便于后续分析。

## 7.7 元数据注入：保留来源、页码、章节信息

在文档加载和分割过程中，**元数据（Metadata）**是非常重要的信息——它能保留文档的来源、页码、章节、作者等信息，后续进行检索、问答时，可通过元数据快速定位原文，提升结果的准确性和可追溯性。

LangChain默认会为Document对象添加基础元数据（如source、page），但在实际开发中，我们常常需要注入自定义元数据（如章节、文档类型、上传时间），本节讲解元数据的注入方法。

### 7.7.1 加载时注入元数据

在加载文档时，可直接为Document对象添加自定义元数据，适合批量加载多个文档时，区分不同文档的属性（如文档类型、所属部门）。

```python
from langchain.document_loaders import PyPDFLoader
from langchain.schema import Document

# 1. 加载PDF文档
loader = PyPDFLoader("company_policy.pdf")
documents = loader.load()

# 2. 注入自定义元数据（批量注入）
custom_metadata = {
    "document_type": "公司制度",
    "department": "人力资源部",
    "upload_time": "2024-05-01"
}

# 为每个Document对象添加自定义元数据（保留默认元数据，补充新字段）
for doc in documents:
    doc.metadata.update(custom_metadata)
    # 可选：修改默认元数据（如页码格式）
    doc.metadata["page"] = f"第{doc.metadata['page']}页"

# 查看注入后的元数据
print("注入元数据后的Document：")
print(f"文本内容：{documents[0].page_content[:100]}...")
print(f"元数据：{documents[0].metadata}")
```

说明：通过doc.metadata.update()方法，可在保留默认元数据（source、page）的基础上，补充自定义元数据，适合批量处理多个文档。

### 7.7.2 分割后注入元数据

文本分割后，每个文本块（chunk）会继承原始Document的元数据，但有时需要为分割后的文本块添加额外元数据（如文本块序号、分割时间）。

```python
from langchain.document_loaders import TextLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

# 1. 加载文档
loader = TextLoader("report.txt")
documents = loader.load()

# 2. 文本分割
text_splitter = RecursiveCharacterTextSplitter(chunk_size=100, chunk_overlap=20)
chunks = text_splitter.split_documents(documents)

# 3. 为分割后的文本块注入元数据
for idx, chunk in enumerate(chunks):
    chunk.metadata.update({
        "chunk_id": idx + 1,  # 文本块序号
        "split_time": "2024-05-01 10:00:00",
        "total_chunks": len(chunks)  # 总文本块数量
    })

# 查看结果
for chunk in chunks[:2]:
    print(f"文本块{chunk.metadata['chunk_id']}：{chunk.page_content[:50]}...")
    print(f"元数据：{chunk.metadata}\n")
```

核心技巧：分割后的元数据注入，可用于后续的文本块管理（如定位某个文本块、统计分割数量），提升检索和分析的便捷性。

### 7.7.3 元数据的实战价值

- **检索追溯**：问答或检索时，可通过元数据（如来源、页码）快速定位原文，提升结果可信度；

- **分类管理**：通过元数据（如文档类型、部门）对文档进行分类，便于后续筛选和管理；

- **上下文补充**：元数据可作为上下文的一部分，输入模型，让模型了解文本的背景信息（如“这是人力资源部的公司制度文档”）。

## 7.8 【实战】批量加载公司制度文档并切块

结合本章所学内容，我们进行一次实战：批量加载多个不同格式的公司制度文档（PDF、Word、Markdown），注入自定义元数据，使用推荐的分割策略进行文本切块，最终输出可直接用于后续检索、问答的文本块，模拟真实开发场景。

### 7.8.1 实战需求与准备

#### 1. 实战需求

- 批量加载3个不同格式的公司制度文档：policy.pdf（PDF）、policy.docx（Word）、policy.md（Markdown）；

- 为每个文档注入自定义元数据（文档名称、格式、部门、上传时间）；

- 使用RecursiveCharacterTextSplitter进行文本分割，配置合理的chunk_size和chunk_overlap；

- 输出分割后的文本块，查看元数据和文本内容，确保语义完整、元数据齐全。

#### 2. 环境准备

```bash
# 安装所需依赖
pip install langchain pypdf docx2txt unstructured python-markdown
```

#### 3. 文档准备

在当前目录下，准备3个文档：

- policy.pdf：公司考勤制度（PDF格式）；

- policy.docx：公司薪酬制度（Word格式）；

- policy.md：公司请假制度（Markdown格式）。

### 7.8.2 实战代码实现

```python
from langchain.document_loaders import (
    PyPDFLoader, Docx2txtLoader, UnstructuredMarkdownLoader
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from typing import List

def load_multiple_documents(doc_info_list: List[dict]) -> List[Document]:
    """
    批量加载多个不同格式的文档，并注入自定义元数据
    :param doc_info_list: 文档信息列表，每个元素包含path、format、name、department
    :return: 加载后的Document对象列表
    """
    documents = []
    for doc_info in doc_info_list:
        # 提取文档信息
        path = doc_info["path"]
        doc_format = doc_info["format"]
        name = doc_info["name"]
        department = doc_info["department"]

        # 根据格式选择对应的加载器
        try:
            if doc_format == "pdf":
                loader = PyPDFLoader(path)
            elif doc_format == "docx":
                loader = Docx2txtLoader(path)
            elif doc_format == "md":
                loader = UnstructuredMarkdownLoader(path)
            else:
                print(f"不支持的文档格式：{doc_format}，跳过文档{path}")
                continue

            # 加载文档
            doc_list = loader.load()

            # 注入自定义元数据
            for doc in doc_list:
                doc.metadata.update({
                    "doc_name": name,
                    "doc_format": doc_format,
                    "department": department,
                    "upload_time": "2024-05-01"
                })
                # 统一元数据格式
                if "page" in doc.metadata:
                    doc.metadata["page"] = f"第{doc.metadata['page']}页"
                documents.extend(doc_list)
            print(f"成功加载文档：{name}（{path}），共{len(doc_list)}页")
        except Exception as e:
            print(f"加载文档{path}失败：{str(e)}")
    return documents

def split_documents(documents: List[Document]) -> List[Document]:
    """
    文本分割：使用RecursiveCharacterTextSplitter，保留语义完整性
    """
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=300,  # 适配GPT-3.5-turbo，预留足够上下文
        chunk_overlap=30,  # 10%重叠，保留上下文关联
        length_function=len,
        separators=["\n\n", "\n", " ", ""]  # 默认优先级，保留语义
    )
    chunks = text_splitter.split_documents(documents)
    print(f"\n文本分割完成，共分割为{len(chunks)}个文本块")

    # 为文本块注入序号元数据
    for idx, chunk in enumerate(chunks):
        chunk.metadata["chunk_id"] = idx + 1
        chunk.metadata["total_chunks"] = len(chunks)
    return chunks

def main():
    # 1. 定义批量加载的文档信息
    doc_info_list = [
```

### 7.8.3 实战结果与注意事项

#### 1. 预期运行结果

运行上述代码后，会依次输出文档加载状态、分割结果，以及前3个文本块的内容和元数据。正常情况下，会成功加载3个不同格式的文档，分割为多个符合要求的文本块，每个文本块都包含完整的自定义元数据（文档名称、格式、部门、页码、文本块序号等），可直接用于后续的RAG检索、文档问答等场景。

#### 2. 常见问题排查

- 文档加载失败：检查文件路径是否正确（建议使用绝对路径），依赖包是否安装完整（如PDF加载需确保pypdf已安装）；

- 文本分割语义断裂：调整chunk_size和chunk_overlap参数，确保chunk_size不小于单句长度，chunk_overlap保留足够上下文；

- 元数据缺失：检查元数据注入逻辑，确保update方法正确调用，且元数字段名称无拼写错误。

#### 3. 实战延伸

本实战可进一步扩展：添加文档批量上传逻辑、将分割后的文本块存入向量数据库（如Chroma、FAISS）、结合大模型实现文档问答，完整串联RAG应用的核心流程，后续章节会详细讲解相关实现。
