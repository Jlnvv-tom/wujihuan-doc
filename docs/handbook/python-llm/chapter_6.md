# 必知必会的基础知识 — Python语言基础（选看）

如果你是从零开始转行LLM开发，Python语法这一关迟早要过。也许你看过很多"30天速成Python"的教程，但到了真正写深度学习代码的时候，还是会一头雾水——列表推导式看不懂、装饰器不知道干嘛的、广播机制完全不理解。看别人的代码像看天书，自己写起来更是处处报错。

我是怕浪猫，一个在LLM开发一线踩了无数坑的工程师。从最早写第一行Python代码被缩进搞疯，到后来用PyTorch复现Transformer架构，再到实际项目中用HuggingFace做模型微调，这条路上该踩的坑我都踩过了。这一章我把Python语言基础中跟LLM开发最相关的部分全部梳理一遍，不是面面俱到的语法书，而是"写大模型代码必须掌握的那些核心知识点"。已经有Python基础的同学可以选看，直接跳到你薄弱的章节。

> "语言只是工具，但不懂工具的人，连想法都表达不出来。"

## 6.1 导学与基础语法

### 6.1.1 变量定义与动态类型

Python是动态类型语言（Dynamically Typed Language），变量不需要提前声明类型，解释器会在运行时自动推断。这一点跟Java、C++完全不同，也是Python上手快的重要原因之一。Java的静态类型在编译时就能发现类型错误，Python的动态类型则需要等到运行时才会报错，这是灵活性和安全性之间的权衡。

在Java里你得写 `String name = "hello";`，在Python里直接 `name = "hello"` 就行。解释器会根据右边的值推断出name是字符串类型。这种设计的好处是简洁灵活，坏处是当你把一个整数赋给一个本来存字符串的变量时，解释器不会报错，但你的程序逻辑可能已经出问题了。

```python
# 动态类型：同一个变量可以指向不同类型
x = 42           # int
x = "hello"      # str
x = [1, 2, 3]    # list
x = lambda a: a*2 # function

# 类型注解（Python 3.5+，不影响运行，但IDE可检查）
def process(text: str, max_len: int = 512) -> list:
    return text.split()[:max_len]
```

在LLM开发中，类型注解非常重要。看HuggingFace的Transformers源码，几乎每个函数都有完整的类型标注。虽然Python解释器不会强制检查类型，但配合mypy或IDE的类型检查器，能在运行前catch到大量bug。比如你本来应该传一个tensor给模型，结果传了一个list，有类型注解的话IDE会直接标黄提醒你。类型注解还有一个隐性好处：它本身就是一种文档——你看到函数签名 `def forward(self, input_ids: Tensor, attention_mask: Tensor) -> Tensor`，立刻就知道输入输出是什么，不需要去看函数内部实现。怕浪猫在团队里推行了一个规矩：所有函数必须写类型注解，不写的不让merge。一开始大家觉得麻烦，一个月后bug数量明显下降，真香。

动态类型有个经典坑，几乎所有Python初学者都踩过：

```python
a = [1, 2, 3]
b = a
b.append(4)
print(a)  # [1, 2, 3, 4] — a也变了！
```

这是因为a和b指向同一个list对象，不是a的"副本"。想避免就显式拷贝：`b = a.copy()` 或 `b = a[:]`。在LLM数据处理中，这个坑特别危险——你在一个函数里"修改"了一个传入的list，结果调用方的原始数据也变了，debug半天才发现问题。特别是在构建训练数据流水线时，数据经过多步预处理，如果中间某一步无意中修改了原始数据，后面的步骤可能就会出错，而且这种错误很难复现和调试，因为问题可能要好几步之后才会暴露。怕浪猫曾经遇到一个案例：数据增强函数意外修改了原始训练集，导致第二轮训练时数据被重复增强，模型效果突然下降。排查了一整天才发现是引用共享的问题。从那以后，怕浪猫的建议是：在函数内部修改传入的可变对象时，明确在文档中说明是否修改原数据，或者干脆总是返回新对象。

> "动态类型的自由是有代价的——你得自己管好内存里的引用关系。Python不检查类型，但会检查你的耐心。"

### 6.1.2 逻辑判断与优先级

Python的逻辑运算符是 `and`、`or`、`not`，不是 `&&`、`||`、`!`。这点从C/Java转过来的同学特别容易搞混，写代码的时候手会自动打出&&，然后解释器给你一个SyntaxError。

```python
# 短路求值
model_name = None
default = model_name or "gpt-2"
print(default)  # gpt-2

# 链式比较
batch_size = 32
if 16 <= batch_size <= 64:
    print("合理的batch大小")

# 优先级：not > and > or
# True or False and False 等价于 True or (False and False) 等于 True
```

在LLM开发中，短路求值非常实用。比如加载模型时先检查本地缓存，没有再从HuggingFace Hub下载：
```python
model = load_from_cache(path) or download_from_hub(name)
```

这行代码等价于：先尝试从缓存加载，如果返回None或空（falsy值），就执行下载。简洁且可读。在实际项目中，这种写法能少写好几行if-else，代码看起来也更清爽。在HuggingFace的Transformers库内部，模型加载逻辑也采用了类似的缓存优先策略，只是实现更复杂，涉及版本检查和哈希校验。

链式比较也是Python的特色语法，`16 <= batch_size <= 64` 在Java里得写成 `batch_size >= 16 && batch_size <= 64`。Python的写法更接近数学表达式，可读性更好。在LLM开发中，经常需要检查各种参数是否在合理范围内：序列长度、学习率、batch size、梯度裁剪阈值等。链式比较让这些检查代码读起来更自然。

### 6.1.3 循环：for / while / break / continue / enumerate / zip

循环是Python中最常用的控制流。for循环遍历可迭代对象（Iterable），while循环按条件循环。在LLM开发中，for循环的使用频率远高于while，因为大多数场景都是遍历数据集、遍历batch、遍历token序列、遍历模型参数等。for循环的执行效率在Python中其实不算高，这也是为什么我们要用NumPy做向量化运算。但在需要逐个处理token或逐行读取文件的场景下，for循环仍然是首选，因为向量化无法处理有状态的逐个操作。Python的for循环比C/Java的for循环要灵活得多——它遍历的是可迭代对象，不局限于数字序列。你可以遍历list、dict、set、文件行、甚至自定义迭代器。这种设计让Python在处理各种数据结构时都非常自然。

```python
# enumerate：同时获取索引和值
tokens = ["我", "爱", "自然", "语言", "处理"]
for idx, token in enumerate(tokens):
    print(f"{idx}: {token}")

# zip：并行遍历多个序列
questions = ["什么是RAG", "什么是Agent"]
answers = ["检索增强生成", "智能体"]
for q, a in zip(questions, answers):
    print(f"Q: {q} -> A: {a}")

# 列表推导式中的for
lengths = [len(t) for t in tokens if len(t) > 1]
```

在NLP（Natural Language Processing，自然语言处理）数据预处理中，`enumerate` 和 `zip` 的出镜率极高。比如批量处理token序列时，经常需要同时拿到索引和值来构建位置编码，或者把input_ids和attention_mask并行遍历来做padding检查。在Transformer模型中，位置编码（Positional Encoding）需要知道每个token在序列中的位置索引，这时候enumerate就是最自然的选择。没有enumerate之前，你得写 `for i in range(len(tokens)): token = tokens[i]`，又丑又容易出错。

`break` 和 `continue` 控制循环流程。break直接跳出循环，continue跳过当前迭代进入下一次。在数据清洗中经常用到：

```python
# 找到第一个长度超过10的句子就停
for sent in sentences:
    if len(sent) > 10:
        print(f"找到: {sent}")
        break
    if not sent.strip():  # 跳过空句子
        continue
```

while循环在LLM开发中用得相对少，主要场景是生成式推理中的循环生成token，直到遇到EOS（End of Sequence，序列结束符）token或达到最大长度。下面是一个简化的文本生成循环示例：

```python
# 简化的自回归生成过程
def generate(model, input_ids, max_new_tokens=100):
    for _ in range(max_new_tokens):
        outputs = model(input_ids)
        next_token = outputs.logits[:, -1, :].argmax(-1)
        if next_token.item() == eos_token_id:
            break  # 遇到结束符就停止
        input_ids = torch.cat([input_ids, next_token.unsqueeze(0)], dim=-1)
    return input_ids
```

这个循环结构在HuggingFace的 `model.generate()` 方法内部也能看到类似的影子，只不过实际实现更复杂，涉及beam search、sampling策略、KV Cache优化等。但核心循环逻辑就是这里展示的：每次预测一个新token，拼接到输入中，再预测下一个，直到触发停止条件。理解了这个基本循环，后面学习各种解码策略时就有了基础。

> "循环写得好不好，直接决定代码能不能读。嵌套超过三层就该重构了，不重构的代码迟早变成技术债。"

### 6.1.4 字符串操作与格式化

LLM开发中处理最多的数据类型就是字符串。Prompt是字符串，模型输出是字符串，训练数据的大部分内容也是字符串。Python的f-string（Python 3.6+）是格式化字符串的最佳选择，简洁、可读、性能好：

```python
# f-string：最推荐的字符串格式化方式
model = "qwen2"
params = 7
print(f"模型: {model}, 参数量: {params}B")

# 多行字符串做prompt模板
prompt = f"""
你是一个专业的翻译助手。
请将以下英文翻译为中文：
{user_input}
"""
```

f-string里面可以直接写Python表达式，非常方便。比如 `f"平均loss: {sum(losses)/len(losses):.4f}"`，冒号后面是格式说明符，`.4f` 表示保留4位小数。还有 `.2%` 表示百分比格式，`,.0f` 表示千分位分隔符。这些格式说明符在打印训练日志时非常实用，能让输出整齐美观。

字符串的常用方法中，`split`、`join`、`strip`、`replace` 用得最多。在处理文本数据时，这几个方法几乎每天都在用：

```python
# 分词与拼接
text = "Hello, World, LLM"
tokens = text.lower().split(", ")  # ['hello', 'world', 'llm']
reconstructed = " ".join(tokens)    # 'hello world llm'

# 清洗文本：去除首尾空白字符
dirty_text = "  Hello World  "
clean = dirty_text.strip()

# 批量替换
text = text.replace("\t", " ").replace("\n", " ")
```

在LLM数据预处理中，字符串清洗是一个重要环节。真实世界的数据总是脏的——有HTML标签、有特殊字符、有编码问题、有各种不可见的控制字符。怕浪猫在处理一个中文法律文档数据集时就遇到过：同一段文字里混了全角和半角标点、有零宽空格（Zero-Width Space）藏在字符之间、有BOM（Byte Order Mark，字节顺序标记）出现在文件开头。这些问题不处理干净，tokenizer就会出莫名其妙的错误，模型训练效果也会受影响。

熟练掌握字符串操作能让你在数据清洗时事半功倍。建议在项目初期就写好一套统一的文本清洗函数，把strip、replace、正则替换封装好，后面所有数据处理都走这套流程，避免重复踩坑。在LLM开发中，文本清洗的质量直接决定了模型训练的效果上限——再好的模型架构也救不了垃圾数据。所以怕浪猫一直强调：数据处理是LLM工程师最核心的能力之一，别只盯着模型调参。

> "数据清洗占LLM项目工作量的百分之六十以上，但很多人只愿意聊模型调参。这就是为什么很多人的模型效果上不去。"

字符串还有一个在LLM中特别重要的操作：tokenization（分词）的输入就是字符串。不管你用的是BPE（Byte-Pair Encoding，字节对编码）、WordPiece还是SentencePiece，输入都是原始字符串，输出是token id列表。理解字符串操作的细节，能帮你在tokenizer出问题时快速定位原因。

## 6.2 函数与面向对象

### 6.2.1 函数参数类型与返回值

Python函数的参数体系非常灵活，掌握它对阅读LLM框架源码至关重要。Python支持四种参数类型：位置参数、默认参数、可变位置参数（*args）和可变关键字参数（**kwargs）。这四种参数可以组合使用，但顺序必须遵守：位置参数 -> 默认参数 -> *args -> **kwargs。搞错顺序会直接报SyntaxError。

```python
# 位置参数、默认参数、可变参数、关键字参数
def train_model(model_name, learning_rate=1e-4,
                *layers, **optimizer_config):
    print(f"模型: {model_name}")
    print(f"学习率: {learning_rate}")
    print(f"层: {layers}")           # tuple
    print(f"优化器配置: {optimizer_config}")  # dict

train_model("bert", 2e-5, "encoder", "decoder",
            optimizer="adamw", weight_decay=0.01)
```

看到 `**kwargs`（Keyword Arguments，关键字参数）就要条件反射地想到"这是个字典"。HuggingFace的 `from_pretrained` 方法大量使用 `**kwargs` 来传递配置参数，好处是接口灵活，可以接受任意额外的配置项；坏处是不知道到底支持哪些参数，IDE也没法自动补全，只能查文档或看源码。

函数返回值也值得注意。Python函数可以返回多个值，本质是返回一个tuple（元组），接收时可以做解包：

```python
def tokenize(text):
    # 返回input_ids和attention_mask
    return [1, 2, 3], [1, 1, 1]  # 实际返回tuple

input_ids, attention_mask = tokenize("hello")
```

这个模式在Transformers的tokenizer调用中到处都是。`tokenizer(text, return_tensors="pt")` 返回一个BatchEncoding对象，本质上就是一个装了多个tensor的字典-like对象。理解了tuple解包，看这些代码就自然多了。在LLM微调的完整流程中，从数据加载到模型训练再到评估，每一步都涉及函数的参数传递。理解参数类型让你在阅读框架源码时不再迷茫，在写自己的训练脚本时也能设计出合理的函数接口。

### 6.2.2 lambda表达式

lambda（匿名函数）在LLM开发中常用于简单的数据处理转换。它的本质是一个没有名字的小函数，适合写那种"只用一次、逻辑简单"的转换操作。

```python
# lambda用于排序key
sentences = ["短句", "这是一个中等长度的句子", "长"]
sentences.sort(key=lambda s: len(s), reverse=True)

# 配合sorted使用
sorted_data = sorted(data, key=lambda x: x['loss'])

# 更推荐的写法：列表推导式替代map/filter
token_lengths = [len(t) for t in tokens]
long_tokens = [t for t in tokens if len(t) > 2]
```

lambda在数据处理流水线中也有用武之地。比如用Python内置的 `sorted` 对模型输出结果按置信度排序时，传一个 `key=lambda x: x['score']` 就够了。在RAG系统中，检索到的多个文档片段需要按相关性分数排序后取top-k，这个排序操作也可以用lambda简化。但怕浪猫的建议是：如果lambda的逻辑超过一行，或者被多处复用，就老老实实抽成一个正经函数。

> "lambda虽好，但逻辑超过一行就该抽成正经函数。简洁和可读之间，永远选可读。"

### 6.2.3 装饰器

装饰器（Decorator）是Python的高级特性，在LLM框架中无处不在。如果你不理解装饰器，看PyTorch和Transformers的源码会很吃力。

理解装饰器的关键在于：装饰器本质是一个接收函数、返回函数的函数。它在不修改原函数代码的前提下，给函数增加额外功能。这个设计模式叫AOP（Aspect-Oriented Programming，面向切面编程）。

```python
import time
from functools import wraps

def timer(func):
    """计时装饰器：自动记录函数执行时间"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start
        print(f"{func.__name__} 耗时: {elapsed:.2f}s")
        return result
    return wrapper

@timer
def train_epoch(model, dataloader):
    total_loss = 0
    for batch in dataloader:
        total_loss += model(**batch).loss.item()
    return total_loss
```

`@timer` 放在函数定义上面，等价于 `train_epoch = timer(train_epoch)`。之后调用 `train_epoch()` 时，实际执行的是 `wrapper`，它会先记录开始时间，然后调用原函数，最后打印耗时。`@wraps(func)` 的作用是保留原函数的元信息（函数名、文档字符串等），不加的话 `func.__name__` 会变成 `"wrapper"`。

在HuggingFace的Trainer中，装饰器用于回调函数注册、梯度累积控制等场景。PyTorch的 `@torch.no_grad()` 也是一个装饰器，用于禁用梯度计算以节省内存和加速推理：

```python
import torch

@torch.no_grad()
def evaluate(model, dataloader):
    """评估模式，不需要梯度"""
    total_correct = 0
    for batch in dataloader:
        outputs = model(**batch)
        preds = outputs.logits.argmax(-1)
        total_correct += (preds == batch['labels']).sum()
    return total_correct
```

在评估阶段不需要反向传播，禁用梯度可以大幅减少显存占用。这个装饰器在LLM开发中用得非常多，面试时也经常被问到。除了 `@torch.no_grad()`，PyTorch还提供了 `@torch.enable_grad()` 装饰器，用于在全局禁用梯度的上下文中临时启用梯度计算。这种成对设计的思路在框架设计中很常见，理解了其中一个就能举一反三。HuggingFace的Trainer类内部也大量使用装饰器来实现回调机制，比如注册一个在每个epoch结束时自动调用的函数，用于记录日志或保存checkpoint。

### 6.2.4 类定义与 `__init__`

面向对象编程（OOP，Object-Oriented Programming）是组织大型LLM项目代码的核心方式。PyTorch的模型定义就是基于类的——你定义的每一个神经网络模型都是一个继承自 `nn.Module` 的类。

```python
class SimpleClassifier:
    def __init__(self, hidden_size, num_classes):
        """初始化方法，创建实例时自动调用"""
        self.hidden_size = hidden_size
        self.num_classes = num_classes
        self.linear = None  # 延迟初始化

    def build(self, input_size):
        import torch.nn as nn
        self.linear = nn.Linear(input_size, self.num_classes)
        return self

    def forward(self, x):
        return self.linear(x)

model = SimpleClassifier(hidden_size=768, num_classes=2)
model.build(input_size=768)
```

`__init__` 是特殊方法（dunder method，双下划线方法），在创建实例 `SimpleClassifier(...)` 时自动调用。它的作用是初始化实例的属性。`self` 指向当前实例，类似Java的 `this`。

在PyTorch中定义模型时，通常在 `__init__` 里定义网络层（如Linear、Conv、Attention等），在 `forward` 方法里定义前向传播的计算逻辑。这个模式后面写深度学习代码会反复用到，几乎每个模型文件都是这个结构。

Python的特殊方法还有很多：`__str__` 控制print输出格式、`__len__` 让对象支持 `len()` 函数、`__getitem__` 让对象支持索引访问、`__call__` 让对象可以像函数一样被调用。这些方法让你的自定义类表现得像内置类型一样自然，是Python面向对象编程的精髓所在。比如PyTorch的 `nn.Module` 实现了 `__call__`，所以你可以写 `model(inputs)` 而不是 `model.forward(inputs)`。

### 6.2.5 继承与多态

继承让代码复用变得简单。子类继承父类的所有属性和方法，还可以覆盖（Override）或扩展。在LLM开发中，最常见的继承场景是自定义数据集和自定义模型：

```python
import torch
from torch.utils.data import Dataset

class TextDataset(Dataset):
    """自定义文本数据集，继承PyTorch的Dataset"""
    def __init__(self, texts, labels, tokenizer, max_len=128):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.texts[idx], max_length=self.max_len,
            padding="max_length", truncation=True,
            return_tensors="pt"
        )
        return {
            "input_ids": encoding["input_ids"].flatten(),
            "attention_mask": encoding["attention_mask"].flatten(),
            "labels": torch.tensor(self.labels[idx], dtype=torch.long)
        }
```

这段代码是LLM微调中最常用的数据集定义模板，建议直接收藏背熟。继承 `Dataset` 后，必须实现两个方法：`__len__` 返回数据集大小，`__getitem__` 按索引返回一条数据。PyTorch的DataLoader会自动调用这两个方法来实现批量加载、多进程加速和数据打乱。

这个模板在实际项目中的使用方式通常是：先准备好文本列表和标签列表，加载tokenizer，然后创建数据集实例，最后用DataLoader包装起来：

```python
tokenizer = AutoTokenizer.from_pretrained("bert-base-chinese")
dataset = TextDataset(texts, labels, tokenizer, max_len=128)
dataloader = DataLoader(dataset, batch_size=32, shuffle=True)
for batch in dataloader:
    outputs = model(**batch)  # 直接解包传给模型
```

看到没，整个数据加载到模型输入的流程就这么几行代码。但背后的每一步——tokenizer的调用、Dataset的封装、DataLoader的批量处理——都依赖于我们前面讲的知识点。理解了这些基础，才能灵活地自定义数据处理流程。

多态（Polymorphism）在Python中是隐式的——鸭子类型（Duck Typing）。这个概念的核心是："如果一个东西走起来像鸭子、叫起来像鸭子，那它就是鸭子。" Python不关心对象的类型，只关心对象有没有需要的方法：

```python
# 鸭子类型：只要有forward方法就能用
def run_inference(model, inputs):
    return model.forward(inputs)
# 不管是BERT、GPT还是自定义模型，只要有forward就行
```

这种设计的灵活性是Python在AI领域流行的原因之一。PyTorch的 `nn.Module` 定义了 `forward` 接口规范，但具体实现完全自由——你可以定义任意复杂的网络结构，只要实现了 `forward` 方法，PyTorch的训练框架就能自动处理反向传播、参数更新等逻辑。这也是为什么PyTorch比TensorFlow 1.x的静态图模式更受欢迎——动态图让你可以用Python的控制流（if、for、while）直接控制计算过程，调试方便，写起来就像普通Python代码。

> "继承是复用代码，多态是复用接口。PyTorch的nn.Module把这两者用到了极致，值得反复研读。"

## 6.3 复合类型与特性

### 6.3.1 List / Tuple / Dict / Set

Python有四种核心复合数据类型，每种在LLM开发中都有大量应用场景。选择合适的数据类型不仅影响代码可读性，还直接影响程序的性能。

```
┌─────────────────────────────────────────────────────┐
│              Python 四大复合类型对比                  │
├─────────┬──────────┬──────────┬──────────────────────┤
│ 类型    │ 可变性   │ 语法     │ 典型LLM场景          │
├─────────┼──────────┼──────────┼──────────────────────┤
│ List    │ 可变     │ [1,2,3]  │ token序列、batch数据 │
│ Tuple   │ 不可变   │ (1,2,3)  │ 函数多返回值、配置   │
│ Dict    │ 可变     │ {"k":"v"}│ 模型配置、tokenizer  │
│ Set     │ 可变     │ {1,2,3}  │ 去重、词汇表操作     │
└─────────┴──────────┴──────────┴──────────────────────┘
```

```python
# List：最常用的序列类型
tokens = ["我", "爱", "AI"]
tokens.append("！")          # 尾部添加
tokens.extend(["加油", "学习"])  # 批量添加
print(tokens[-1])  # "学习" — 负索引从末尾取

# Tuple：不可变序列
config = (768, 12, 12)  # (hidden_size, num_layers, num_heads)
h, l, n = config  # 解包赋值

# Dict：LLM开发中最常用的数据结构
batch = {"input_ids": [[1,2,3]], "attention_mask": [[1,1,1]]}
for key, value in batch.items():
    print(f"{key}: {value}")

# Set：去重利器
vocab_set = {"你好", "世界", "你好"}  # 自动去重
print(len(vocab_set))  # 2
set_a, set_b = {1,2,3,4}, {3,4,5,6}
print(set_a & set_b)  # 交集 {3, 4}
print(set_a | set_b)  # 并集 {1,2,3,4,5,6}
```

Dict在LLM开发中的地位无可替代。HuggingFace的tokenizer输出是dict，模型输入是dict，训练配置也是dict。熟练操作dict——包括遍历、合并、嵌套访问——是LLM开发的基本功。下面是一个dict合并的实战示例：

```python
# 合并两个配置dict
default_config = {"lr": 1e-4, "batch_size": 32, "warmup": 0.1}
user_config = {"lr": 2e-5, "batch_size": 16}
# Python 3.9+ 可以用 | 运算符合并dict
final_config = default_config | user_config
print(final_config)  # {'lr': 2e-5, 'batch_size': 16, 'warmup': 0.1}
# 旧版本用解包方式
final_config = {**default_config, **user_config}
```

这个配置合并的模式在LLM训练脚本中非常常见——定义一套默认配置，用户通过命令行参数覆盖部分配置项，最终合并成完整配置。理解dict的合并操作能帮你写出更优雅的配置管理代码，也是工程化实践的基本功。

### 6.3.2 可变 vs 不可变类型

这是Python中最容易踩坑的知识点之一，也是面试高频题。理解可变与不可变的区别，能帮你解释很多"诡异"的bug。

```
┌──────────────────────────────────────────────────────┐
│           可变 vs 不可变 核心原理                      │
├──────────────────┬───────────────────────────────────┤
│ 不可变类型        │ 可变类型                           │
├──────────────────┼───────────────────────────────────┤
│ int, float, str  │ list, dict, set                   │
│ tuple, bool      │ 自定义类的实例                     │
│ 修改=创建新对象   │ 原地修改，内存地址不变             │
│ 可作为dict的key  │ 不能作为dict的key                  │
│ 函数传参不改变原值│ 函数传参可能改变原值               │
└──────────────────┴───────────────────────────────────┘
```

```python
# 不可变类型：修改会创建新对象
s = "hello"
print(id(s))  # 140234817345456
s += " world"
print(id(s))  # 140234817346512 — id变了，是新对象

# 可变类型：原地修改，内存地址不变
lst = [1, 2, 3]
print(id(lst))  # 140234817345600
lst.append(4)
print(id(lst))  # 140234817345600 — id不变，还是原来那个
```

经典坑：可变默认参数。Python函数的默认参数只在函数定义时创建一次，之后所有调用共享同一个默认对象：

```python
# 错误写法！默认参数只创建一次
def add_item(item, lst=[]):
    lst.append(item)
    return lst

print(add_item(1))  # [1]
print(add_item(2))  # [1, 2] — 不是[2]！共享了同一个list！

# 正确写法：用None做哨兵值
def add_item(item, lst=None):
    if lst is None:
        lst = []  # 每次调用创建新list
    lst.append(item)
    return lst

print(add_item(1))  # [1]
print(add_item(2))  # [2] — 正确！
```

怕浪猫在第一份工作时就踩过这个坑。一个数据处理的函数用了可变默认参数，结果第一次调用正常，后续调用莫名奇妙地累加了之前的数据，debug了好几个小时。从此以后，默认参数一律用None，这个习惯保持至今。

> "理解可变与不可变的区别，能帮你避开Python里一半的bug。这不是夸张，是血泪教训。"

### 6.3.3 切片

切片（Slicing）是Python序列操作的精华，语法是 `sequence[start:stop:step]`，三个参数都可以省略。切片创建新对象（浅拷贝），不会修改原序列。

```python
text = "Hello, LLM World!"

# 基本切片
print(text[7:10])   # "LLM" — start到stop-1
print(text[:5])     # "Hello" — 从头到索引4
print(text[7:])     # "LLM World!" — 从索引7到末尾
print(text[::-1])   # "!dlroW MLL ,olleH" — 反转

# 在LLM数据预处理中的应用
tokens = list(range(100))
truncated = tokens[:128]  # 截断到最大长度128
tail = tokens[-64:]       # 取后64个token
sampled = tokens[::2]     # 每隔2个取一个（下采样）
```

切片在token序列处理中用得非常多。比如做sliding window切分长文本时，每次取一个窗口大小的片段然后滑动一个step，核心操作就是切片。下面是一个实际应用切片的场景——滑窗切分长文本：

```python
# 将长文本切分为固定长度的重叠窗口
def sliding_window(tokens, window_size=512, stride=256):
    """滑窗切分，用于处理超长文本"""
    chunks = []
    for start in range(0, len(tokens), stride):
        chunk = tokens[start:start + window_size]
        if len(chunk) < window_size:
            break  # 不足一个窗口的丢弃
        chunks.append(chunk)
    return chunks

tokens = list(range(1000))
chunks = sliding_window(tokens, window_size=512, stride=256)
print(f"切分为 {len(chunks)} 个窗口")  # 3个窗口
```

这种滑窗技术在实际LLM应用中很常见，比如处理超长文档时无法一次性输入模型（受限于上下文窗口），就需要用滑窗切成多个片段分别处理，最后再合并结果。在RAG系统中，文档切分是最基础的步骤，切分策略的好坏直接影响检索质量和最终回答的效果。常见的切分策略包括固定长度切分、按段落切分、递归切分等，每种策略都有适用的场景。

### 6.3.4 列表推导式

列表推导式（List Comprehension）是Python中最具特色的语法之一，用一行代码就能生成列表，比传统的for循环加append写法更简洁、执行效率也更高。

```python
# 基本形式：[表达式 for 变量 in 可迭代对象 if 条件]
# 传统写法
result = []
for sent in sentences:
    if len(sent) > 5:
        result.append(sent.upper())

# 列表推导式（一行搞定）
result = [sent.upper() for sent in sentences if len(sent) > 5]

# 字典推导式
token2id = {token: idx for idx, token in enumerate(vocab)}
id2token = {v: k for k, v in token2id.items()}  # 反转字典

# 嵌套推导式（谨慎使用，超过两层就难读了）
matrix = [[i*j for j in range(3)] for i in range(3)]
# [[0, 0, 0], [0, 1, 2], [0, 2, 4]]
```

在LLM数据预处理中，列表推导式能大幅简化代码。比如批量读取文件、批量tokenize、批量过滤异常数据。但怕浪猫的忠告是：如果推导式太长，或者包含复杂条件判断，就折成多行或者干脆用普通for循环。列表推导式的性能优势来自于底层用C实现，避免了Python字节码的循环开销。但这个性能差异在小数据量上几乎可以忽略，只有在处理百万级以上的数据时才明显。所以不要为了性能而牺牲可读性，优先写清晰的代码。在团队协作中，可读性永远比炫技重要。

### 6.3.5 生成器

生成器（Generator）是一种"惰性计算"的迭代器，不会一次性把所有结果算出来放在内存里，而是按需计算、用一次算一次。处理大规模数据集时，生成器是省内存的利器。

为什么需要生成器？考虑这个场景：你有一个10GB的训练数据文件，如果用 `f.readlines()` 一次性读取，内存直接爆了。但用生成器逐行读取，内存占用几乎为零。

```python
# 生成器函数：用yield代替return
def read_large_file(file_path, batch_size=32):
    """逐批读取大文件，避免一次性加载到内存"""
    batch = []
    with open(file_path, 'r') as f:
        for line in f:
            batch.append(line.strip())
            if len(batch) >= batch_size:
                yield batch  # 暂停并返回当前batch
                batch = []
    if batch:
        yield batch  # 返回最后不足一个batch的数据

# 使用：不会一次性加载全部数据
for batch in read_large_file("train_data.jsonl"):
    process(batch)  # 每次只有batch_size行在内存中
```

生成器与普通函数的区别在于 `yield` 关键字。普通函数遇到return就结束，而生成器函数遇到yield会暂停执行、返回值，下次被调用时从暂停的位置继续执行。这个特性在处理GB级别的训练数据时非常重要——LLM训练数据动辄几十上百GB，不可能全部load进内存。

```python
# 生成器表达式：类似列表推导式，但用圆括号
# 列表推导式：立即计算所有值，占内存
lengths_list = [len(line) for line in open("data.txt")]
# 生成器表达式：惰性计算，几乎不占内存
lengths_gen = (len(line) for line in open("data.txt"))
total = sum(lengths_gen)  # 逐行计算，内存占用极低
```

PyTorch的DataLoader内部就使用了生成器机制来迭代数据。理解了生成器，你就能自定义高效的数据加载流水线。比如在多模态LLM训练中，文本数据和图片数据需要从不同来源加载，用生成器可以把两个数据流的读取逻辑封装在一起，对外暴露一个统一的迭代接口，调用方完全不需要关心底层的复杂读取逻辑。

> "列表是把所有东西都装进购物车，生成器是吃自助餐——拿一份吃一份，桌子永远不会满。在LLM开发中，内存就是你的桌子。"

### 6.3.6 上下文管理器 with

上下文管理器（Context Manager）用于资源的获取和释放，保证资源在使用完毕后一定会被正确释放。在LLM开发中，文件读写、GPU显存管理、模型加载都会用到。

```python
# 文件操作：with保证文件一定会关闭
with open("config.json", 'r') as f:
    config = json.load(f)
# 离开with块后，f自动关闭，即使中间出了异常

# 自定义上下文管理器
class Timer:
    def __enter__(self):
        import time
        self.start = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import time
        print(f"耗时: {time.time()-self.start:.2f}s")
        return False  # 不吞掉异常

with Timer():
    outputs = model.generate(**inputs)
```

with语句的本质是调用对象的 `__enter__` 和 `__exit__` 方法。进入with块时调用 `__enter__`，离开时（无论正常结束还是异常）调用 `__exit__`。这个机制保证了资源一定会被释放，不需要写try-finally。在LLM开发中，GPU显存是稀缺资源，如果模型加载后没有正确释放，会导致OOM（Out of Memory，内存不足）错误。使用上下文管理器可以确保资源在离开作用域时自动释放。

在PyTorch中，`torch.autocast`（自动混合精度）就是一个上下文管理器：

```python
with torch.autocast(device_type="cuda", dtype=torch.float16):
    outputs = model(**inputs)
    loss = loss_fn(outputs, labels)
```

进入with块时开启半精度推理，离开时自动恢复。这种写法比手动开关要安全得多——即使中间出了异常，退出时也会自动恢复默认精度。在LLM推理服务中，经常需要在同一张GPU上交替运行不同精度的模型，上下文管理器能帮你精确控制每个模型的运行精度，避免遗漏恢复操作导致的精度混乱问题。

### 6.3.7 迭代器与可迭代对象

理解迭代器（Iterator）和可迭代对象（Iterable）的区别，对阅读PyTorch的DataLoader源码很有帮助。可迭代对象是实现了 `__iter__` 方法的对象，迭代器是同时实现了 `__iter__` 和 `__next__` 方法的对象。

```python
class BatchIterator:
    """自定义batch迭代器"""
    def __init__(self, data, batch_size):
        self.data = data
        self.batch_size = batch_size
        self.index = 0

    def __iter__(self):
        self.index = 0  # 重置索引
        return self

    def __next__(self):
        if self.index >= len(self.data):
            raise StopIteration  # 迭代结束
        batch = self.data[self.index:self.index + self.batch_size]
        self.index += self.batch_size
        return batch

# 使用
data = list(range(10))
for batch in BatchIterator(data, batch_size=3):
    print(batch)  # [0,1,2] [3,4,5] [6,7,8] [9]
```

PyTorch的DataLoader就是基于迭代器协议（Iterator Protocol）实现的。理解了这套机制，你就能自定义各种数据加载策略。比如按数据长度排序的batch采样（把长度相近的样本放在同一个batch里，减少padding浪费）、动态batch size（根据当前样本总长度动态调整batch大小，最大化利用显存）、加权采样（根据样本权重采样，处理类别不均衡问题）等高级功能。这些技巧在实际LLM微调项目中非常有用，能显著提升训练效率和模型效果。

## 6.4 NumPy库使用

NumPy（Numerical Python）是Python科学计算的基石。在LLM开发中，数据处理、向量运算、统计分析都离不开它。虽然深度学习框架用的是PyTorch/TensorFlow，但NumPy仍然是底层数据格式的事实标准——PyTorch的tensor可以无痛转换为NumPy的ndarray，反之亦然。可以说NumPy是Python科学计算生态的"普通话"，所有库都以它为中间格式进行数据交换。

### 6.4.1 ndarray创建与操作

ndarray（N-dimensional array，N维数组）是NumPy的核心数据结构。一个ndarray是一个同质数组——所有元素类型相同，这是它比Python list快得多的根本原因。同质意味着内存连续布局，CPU缓存命中率高，可以用SIMD（Single Instruction Multiple Data，单指令多数据）指令并行计算。

```
┌─────────────────────────────────────────────────────┐
│              ndarray vs Python List                 │
├─────────────────┬───────────────────────────────────┤
│ ndarray         │ Python List                      │
├─────────────────┼───────────────────────────────────┤
│ 同质（同类型）   │ 异质（可混合类型）                │
│ 连续内存布局     │ 指针数组，分散存储               │
│ C/Fortran底层   │ 纯Python实现                     │
│ 向量化运算       │ 需要循环                         │
│ 固定大小         │ 动态扩展                         │
│ 支持广播机制     │ 不支持                           │
└─────────────────┴───────────────────────────────────┘
```

```python
import numpy as np

# 创建ndarray的常见方式
a = np.array([1, 2, 3, 4, 5])       # 从list创建
b = np.zeros((3, 4))                # 3行4列全零矩阵
c = np.ones((2, 3))                 # 2行3列全一矩阵
d = np.arange(0, 10, 2)             # [0, 2, 4, 6, 8]
e = np.linspace(0, 1, 5)            # [0, 0.25, 0.5, 0.75, 1.0]
f = np.random.randn(2, 3)           # 2x3标准正态分布

# 查看属性
print(a.shape)    # (5,) — 形状
print(b.ndim)     # 2 — 维度数
print(c.dtype)    # float64 — 数据类型
print(f.size)     # 6 — 元素总数
```

在LLM开发中，经常需要把Python list转成ndarray再做批量运算，或者反过来。PyTorch tensor和NumPy ndarray之间的转换是无拷贝的，共享同一块内存：

```python
import torch
import numpy as np

# NumPy <-> PyTorch 互转（共享内存，零拷贝）
arr = np.random.randn(3, 768)
tensor = torch.from_numpy(arr)     # ndarray -> tensor
back_to_np = tensor.numpy()        # tensor -> ndarray
arr[0, 0] = 999
print(tensor[0, 0])  # 999.0 — 共享内存，改一个另一个也变
```

这个特性在LLM开发中非常重要。你从磁盘读出来的数据通常是NumPy格式，转成tensor送进模型训练，训练完的结果又可能需要转回NumPy做后处理。理解了它们之间的内存共享关系，能避免很多隐蔽的bug——比如你修改了ndarray的数据，对应的tensor也变了，这在某些场景下是你想要的，在另一些场景下就是bug。怕浪猫曾在一个项目中遇到过一个诡异的训绩不稳定问题，最终发现就是数据在NumPy和tensor之间转换时共享了内存，某个预处理步骤无意中修改了原始数据。

### 6.4.2 数组运算与广播机制

NumPy最强大的特性之一是向量化运算——不需要写for循环，直接对整个数组做数学运算。底层是用C实现的，速度比Python循环快几十到几百倍。

```python
import numpy as np
import time

# 向量化运算：逐元素操作
a = np.array([1, 2, 3, 4])
b = np.array([10, 20, 30, 40])
print(a + b)   # [11, 22, 33, 44]
print(a * b)   # [10, 40, 90, 160]
print(np.exp(a))  # 指数运算

# 性能对比：向量化 vs 循环
big = np.random.rand(1000000)
start = time.time()
result = np.sum(big ** 2)  # 向量化
print(f"NumPy: {time.time()-start:.4f}s")

start = time.time()
result = sum(x**2 for x in big)  # Python循环
print(f"Python: {time.time()-start:.4f}s")
# NumPy通常快50-100倍
```

在LLM数据处理中，向量化运算的意义不仅是速度快，更是思维方式的转变。习惯写for循环的人，看到 `np.sum(embeddings * weights, axis=1)` 这种代码会一头雾水。但如果你理解了向量化，就会发现这种写法既简洁又高效。

广播机制（Broadcasting）允许不同形状的数组进行运算，规则是：从右向左对齐维度，维度大小相等或其中一个为1即可广播。

```
广播规则示例：

形状 (4, 3) + (3,)       → (4, 3) + (1, 3) → (4, 3)
形状 (2, 1, 3) + (4, 3)  → (2, 1, 3) + (1, 4, 3) → (2, 4, 3)
形状 (3,) + (4,)          → 报错！无法广播

原理图：
  [[1,2,3],       [[10,20,30],        [[11,22,33],
   [4,5,6],    +   [10,20,30],    =    [14,25,36],
   [7,8,9]]        [10,20,30]]         [17,28,39]]
  (3,3) +  (3,)  →   广播为(3,3)
```

```python
# 广播机制实战：给每个样本加偏置
embeddings = np.random.randn(32, 768)  # 32个样本，每个768维
bias = np.random.randn(768)            # 768维偏置
result = embeddings + bias  # bias自动广播为(32, 768)

# 注意力mask应用
scores = np.random.randn(4, 4)  # 注意力分数
mask = np.array([[0,0,1,1],[0,0,0,1],[0,0,0,0],[0,0,0,0]])
scores = np.where(mask, -np.inf, scores)  # mask为1的位置设为负无穷
```

在Transformer的注意力计算中，mask矩阵就是利用广播机制应用到attention scores上的。理解广播机制对于阅读和编写注意力机制的代码至关重要。怕浪猫刚开始学Transformer的时候，卡了三天在一个维度对不上的bug上，最后发现就是广播规则没搞明白——一个形状为(batch, 1, seq)的mask和一个形状为(batch, seq, seq)的scores做运算时，广播规则是怎么展开的。搞懂广播规则后，这个bug五分钟就修好了。

> "广播机制是NumPy的灵魂——用最小的内存实现最大范围的运算。理解了广播，你才真正理解了向量化编程。在深度学习中，不会广播等于不会写代码。"

### 6.4.3 矩阵运算

矩阵运算是深度学习的数学基础。神经网络的前向传播本质上就是一系列矩阵乘法。NumPy提供了完整的线性代数运算能力。

```python
import numpy as np

# 矩阵乘法：@运算符（Python 3.5+，最推荐）
A = np.random.randn(4, 3)  # 4x3
B = np.random.randn(3, 2)  # 3x2
C = A @ B   # 结果是4x2

# 逐元素乘法（注意区别！）
D = np.random.randn(4, 3)
E = A * D  # 对应元素相乘，要求形状相同

# 常用线性代数运算
print(np.linalg.norm(A, axis=1))   # 行向量L2范数
print(np.linalg.inv(A.T @ A))      # 矩阵求逆
print(np.linalg.svd(A))            # 奇异值分解
```

在LLM中，Embedding（嵌入）层本质就是一个矩阵查表操作，注意力机制（Attention）的核心就是矩阵乘法加softmax。

```
注意力机制核心运算链：

  Q (query)   K (key)     V (value)
  (seq, d)    (seq, d)    (seq, d)
      \         /             |
       \       /              |
    Q @ K^T  -> softmax -> @ V
    (seq, seq)  (seq, seq)  (seq, d)

最终输出 = softmax(Q @ K^T / sqrt(d)) @ V
```

这个公式在后续章节讲Transformer时会反复出现。Q（Query，查询）、K（Key，键）、V（Value，值）三个矩阵分别代表当前token要查询的信息、被查询的索引和被检索的内容。通过Q和K的转置做矩阵乘法计算注意力分数——也就是当前token对其他所有token的关注程度，再经过softmax归一化后作为权重，对V进行加权求和得到最终输出。理解矩阵运算对于阅读Transformer源码至关重要，因为整个自注意力机制就是由几个矩阵乘法串联起来的。

在实际代码中，Q、K、V通常是对同一个隐藏状态做三次线性变换得到的。注意力的计算过程可以用几行矩阵运算表达，但背后蕴含的直觉是：让序列中的每个token都能"看到"其他所有token，并根据相关性分配注意力。这是Transformer能够处理长距离依赖的核心原因。

### 6.4.4 随机数生成

NumPy的随机数模块在LLM开发中用于数据打乱、权重初始化、数据增强等场景。NumPy 1.17之后推荐使用新的Generator API，比旧的RandomState更快、更灵活。

```python
import numpy as np

# 新版API：Generator（推荐）
rng = np.random.default_rng(seed=42)

# 常用分布
uniform = rng.random((3, 3))         # 均匀分布[0,1)
normal = rng.standard_normal((3, 3)) # 标准正态分布
integers = rng.integers(0, 100, size=5)  # 随机整数

# 数据打乱（训练数据shuffle）
indices = np.arange(10)
rng.shuffle(indices)
print(indices)  # 随机排列

# 随机采样（划分训练集/验证集）
all_idx = np.arange(1000)
train_idx = rng.choice(all_idx, size=800, replace=False)
val_idx = np.setdiff1d(all_idx, train_idx)
print(f"训练集: {len(train_idx)}, 验证集: {len(val_idx)}")
```

设置随机种子（Seed）是为了结果可复现。在LLM训练中，可复现性非常重要——同样的数据、同样的种子，应该得到同样的结果。这样当模型效果变差时，你可以排除随机因素的干扰，专注于分析数据和模型本身的问题。但要注意，深度学习涉及CUDA（Compute Unified Device Architecture，统一计算设备架构）的非确定性操作，光设NumPy种子还不够，还要设PyTorch和CUDA的种子：

```python
import torch
import numpy as np
import random

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
```

这个函数建议放在训练脚本的最开头调用。怕浪猫在每个训练项目的入口文件里都会写这个函数，已成肌肉记忆。不过即使设了种子，CUDA的某些操作（如原子加法）仍然不完全确定性，需要配合 `torch.use_deterministic_algorithms(True)` 才能完全复现，但这会影响性能，通常只在调试时开启。

> "随机种子的意义不是限制随机，而是让随机可控。可控的随机叫实验，不可控的随机叫玄学。"

### 6.4.5 数据类型与内存布局

NumPy数组的数据类型直接影响内存占用和计算精度。在LLM开发中，FP16（Float16，半精度浮点数）和FP32（Float32，单精度浮点数）的选择是一个重要的工程决策。

```python
import numpy as np

# 数据类型对比
arr_f32 = np.ones((1000, 768), dtype=np.float32)
arr_f16 = np.ones((1000, 768), dtype=np.float16)
arr_f64 = np.ones((1000, 768), dtype=np.float64)

print(f"float64: {arr_f64.nbytes / 1024:.0f} KB")  # 6000 KB
print(f"float32: {arr_f32.nbytes / 1024:.0f} KB")  # 3000 KB
print(f"float16: {arr_f16.nbytes / 1024:.0f} KB")  # 1500 KB
```

半精度浮点数只有2字节，内存占用是单精度的一半，float64的四分之一。在GPU显存有限的情况下，用FP16训练能塞进更大的batch size，这也是混合精度训练（Mixed Precision Training）的基础。但FP16的精度范围有限，某些计算可能出现数值溢出，需要配合梯度缩放（Gradient Scaling）来保证训练稳定性。在实际LLM微调项目中，通常采用混合精度策略：前向传播用FP16加速、反向传播时将梯度转回FP32计算、主权重始终保持在FP32。这样既获得了FP16的速度和显存优势，又避免了精度损失带来的训练不稳定问题。

### 6.4.6 数组索引与形状操作

NumPy的索引能力远超Python list。布尔索引和花式索引在数据筛选中非常实用，reshape和transpose在处理多维数据时必不可少。在LLM开发中，布尔索引常用于过滤异常数据——比如把长度为零的样本、注意力全为零的序列筛掉。花式索引则常用于从大数据集中按指定索引取出子集，比如做交叉验证时按fold索引取数据。这些操作如果用Python原生list实现需要写循环，用NumPy的索引一行代码就搞定，既简洁又高效。在数据量大的场景下，这个性能差距非常明显——NumPy的索引操作是C级别的，Python循环是解释器级别的，速度差可能在几十倍以上。所以在LLM数据预处理中，能用NumPy操作就不要用Python循环，这是性能优化的基本原则。

```python
import numpy as np

# 布尔索引：按条件筛选
scores = np.array([0.1, 0.8, 0.3, 0.9, 0.5])
high = scores[scores > 0.5]  # [0.8, 0.9]
scores[scores < 0.5] = 0     # 低于0.5的设为0

# reshape：改变形状
a = np.arange(12).reshape(3, 4)  # 3行4列
b = a.T  # 转置，4行3列

# concatenate：拼接
c = np.concatenate([a, a], axis=0)  # 纵向拼接
d = np.concatenate([a, a], axis=1)  # 横向拼接

# 实际应用：合并多个batch
batch1 = np.random.randn(16, 768)
batch2 = np.random.randn(16, 768)
all_data = np.concatenate([batch1, batch2], axis=0)
print(all_data.shape)  # (32, 768)
```

在Transformer的多头注意力中，reshape和transpose被大量使用来在不同头之间切分和合并特征维度。比如一个768维的隐藏向量，要拆成12个头每个64维，就需要先reshape再transpose。理解形状变换是阅读深度学习代码的基本功，建议多在Jupyter Notebook中打印每一步操作的shape来加深理解。怕浪猫的经验是：遇到维度不匹配的报错，先打印每一步的shape，百分之九十的bug都是shape搞错了。养成调试时先看shape的习惯，能省下大量debug时间。

在LLM开发中，一个常见的调试场景是：模型输入要求(batch_size, seq_len, hidden_size)，但你的数据维度可能多了一维或少了一维。这时候用 `tensor.shape` 打印一下当前维度，再跟模型要求的维度对比，通常一眼就能看出问题。如果能在每个关键步骤都断言维度，比如 `assert x.shape == (batch, seq, 768)`，那更能在开发阶段提前发现问题，避免错误传播到后面的计算中。

> "在深度学习中，百分之九十的bug是shape不匹配。先看shape，再看逻辑。"

## 6.5 Matplotlib库使用

Matplotlib是Python最基础的数据可视化库。在LLM开发中，可视化能帮你直观理解训练过程、数据分布和模型行为。虽然Seaborn和Plotly更花哨，但Matplotlib是基础中的基础，所有其他可视化库都建立在它之上。掌握Matplotlib的API之后，迁移到Seaborn或Plotly几乎零成本。对于LLM工程师来说，可视化能力不是可选项，而是必备技能——你需要画loss曲线判断训练状态、画混淆矩阵评估模型效果、画Embedding分布分析特征质量。

### 6.5.1 折线图

折线图是展示训练过程最常用的图表——loss曲线、accuracy曲线、learning rate变化等。一个合格的LLM工程师必须会画折线图，也必须会读折线图。

```python
import matplotlib.pyplot as plt

# 模拟训练过程数据
epochs = list(range(1, 11))
train_loss = [2.5, 1.8, 1.3, 1.0, 0.8, 0.65, 0.55, 0.48, 0.42, 0.38]
val_loss = [2.6, 2.0, 1.6, 1.3, 1.1, 1.0, 0.95, 0.92, 0.93, 0.96]

plt.figure(figsize=(8, 5))
plt.plot(epochs, train_loss, 'b-o', label='Train Loss')
plt.plot(epochs, val_loss, 'r-s', label='Val Loss')
plt.xlabel('Epoch')
plt.ylabel('Loss')
plt.title('Training & Validation Loss')
plt.legend()
plt.grid(True, alpha=0.3)
plt.savefig('loss_curve.png', dpi=150, bbox_inches='tight')
plt.show()
```

看这段代码输出的图，你能直观看到几个信息：训练loss持续下降说明模型在学习；验证loss在第8个epoch后开始上升，说明模型开始过拟合了。这种"训练降验证升"的V字型曲线就是过拟合的经典信号。在实际项目中，看到这个曲线就该考虑加正则化、减小模型或加early stopping了。还有一种常见的异常曲线是loss完全不下降，这通常意味着学习率设置有问题——太大则loss震荡或发散，太小则loss几乎不动。通过折线图判断训练状态是LLM工程师的基本功。

> "一张好的折线图胜过一万行log。训练AI的第一步，就是学会看loss曲线。"

### 6.5.2 柱状图

柱状图适合展示离散分类数据的分布和对比。在LLM开发中，常用于展示数据集分布、模型各部分参数量、不同模型的性能对比等。

```python
import matplotlib.pyplot as plt
import numpy as np

# 模型性能对比
models = ['GPT-2', 'BERT', 'T5', 'LLaMA', 'Qwen2']
accuracy = [78.3, 82.1, 84.5, 87.2, 89.6]
colors = plt.cm.viridis(np.linspace(0.2, 0.8, len(models)))

plt.figure(figsize=(8, 5))
bars = plt.bar(models, accuracy, color=colors, edgecolor='black')
plt.xlabel('Model')
plt.ylabel('Accuracy (%)')
plt.title('LLM Performance Comparison')
plt.ylim(70, 95)

# 在柱子上标注数值
for bar, acc in zip(bars, accuracy):
    plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
             f'{acc}%', ha='center', va='bottom', fontsize=10)

plt.tight_layout()
plt.savefig('model_comparison.png', dpi=150)
plt.show()
```

在柱子上标注数值是一个实用的小技巧，能让图表自带数据标签，读者不需要对着Y轴猜数字。在汇报模型性能对比时，这种图比纯表格更直观，也更适合放在项目报告或论文中。怕浪猫在做模型选型汇报时，经常用这种柱状图对比不同模型的准确率、推理速度、显存占用等指标，一张图就能让决策者快速做出选型决定。

### 6.5.3 散点图

散点图用于展示两个变量之间的关系。在LLM开发中，常用于可视化Embedding分布、检查数据相关性。

```python
import matplotlib.pyplot as plt
import numpy as np

# 模拟Embedding的2D投影（如t-SNE/PCA降维后）
np.random.seed(42)
class_a = np.random.randn(50, 2) + np.array([2, 2])
class_b = np.random.randn(50, 2) + np.array([-2, -2])
class_c = np.random.randn(50, 2) + np.array([2, -2])

plt.figure(figsize=(7, 6))
plt.scatter(class_a[:, 0], class_a[:, 1], c='blue', label='Class A', alpha=0.6)
plt.scatter(class_b[:, 0], class_b[:, 1], c='red', label='Class B', alpha=0.6)
plt.scatter(class_c[:, 0], class_c[:, 1], c='green', label='Class C', alpha=0.6)
plt.xlabel('Dimension 1')
plt.ylabel('Dimension 2')
plt.title('Embedding Visualization (2D Projection)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('embedding_scatter.png', dpi=150)
plt.show()
```

在实际的LLM项目中，把768维的Embedding用t-SNE（t-Distributed Stochastic Neighbor Embedding，t分布随机邻域嵌入）或PCA（Principal Component Analysis，主成分分析）降维到2D后画散点图，能直观看到不同类别的文本是否在嵌入空间中分开了。如果不同类别的点混在一起，说明Embedding质量不好，可能需要换模型或加训练数据。如果同类别的点紧密聚集、不同类别明显分开，说明Embedding已经学到了有区分性的特征。

这种可视化分析在RAG系统开发中也非常有用。你可以把知识库中所有文档片段的Embedding画成散点图，看看文档分布是否合理、有没有离群点、有没有重复或高度相似的文档。这种直觉性的理解是纯看数字给不了的。

> "Embedding可视化是LLM开发的X光片——一眼就能看出模型学到了什么。"

### 6.5.4 子图与图例

当需要同时展示多张图时，用子图（Subplot）把多个图画到一个画布上。这是分析模型时的常见需求，能一次性看到训练的多个维度。

```python
import matplotlib.pyplot as plt

fig, axes = plt.subplots(2, 2, figsize=(12, 8))
epochs = range(1, 11)
train_loss = [2.5, 1.8, 1.3, 1.0, 0.8, 0.65, 0.55, 0.48, 0.42, 0.38]

axes[0, 0].plot(epochs, train_loss, 'b-o')
axes[0, 0].set_title('Training Loss')
axes[0, 1].plot(epochs, [65,72,78,83,86,88,90,91,92,93], 'g-s')
axes[0, 1].set_title('Validation Accuracy')
lr = [3e-4 * (0.9 ** i) for i in range(10)]
axes[1, 0].plot(epochs, lr, 'r-^')
axes[1, 0].set_title('Learning Rate')
axes[1, 1].plot(epochs, [4.2,5.1,5.8,6.3,6.5,6.5,6.5,6.5,6.5,6.5], 'purple', marker='d')
axes[1, 1].set_title('GPU Memory (GB)')
for ax in axes.flat:
    ax.set_xlabel('Epoch')
plt.tight_layout()
plt.savefig('training_dashboard.png', dpi=150)
plt.show()
```

这段代码会生成一个2x2的训练仪表盘，一次性展示loss、accuracy、learning rate和GPU显存四个维度的信息。在实际项目中，怕浪猫经常用这种子图来监控训练状态，比翻log文件高效得多。`plt.tight_layout()` 会自动调整子图间距，防止标签重叠，这是一个必加的语句，不加的话子图之间经常会挤在一起。

### 6.5.5 数据可视化基础原则

做数据可视化时，有几条原则值得遵循：

**选择合适的图表类型。** 时间序列用折线图，分类对比用柱状图，关系探索用散点图，分布用直方图。选错图表类型会误导读者，比如用饼图展示十几个分类的数据，根本看不清每块的占比，这种情况用柱状图就好得多。在LLM开发中，最常用的是折线图和散点图，建议先把这两种掌握牢固。

**配色要有意义。** 不要用彩虹色来表达顺序数据，不要用红绿来表达非对立关系。Matplotlib的viridis、plasma等colormap是感知均匀的，适合表达数值大小。

**标注要清晰。** 每个图都应该有标题、坐标轴标签和单位。没有标注的图就像没有说明的代码，只有作者自己看得懂。

**Less is more。** 一张图传达一个核心信息就好。不要在一张图上画10条曲线，那不叫可视化，叫意大利面图。

> "可视化的目的是让数据说话，而不是让图表炫技。最好的图表是读者一眼就能看懂的那种。"

### 6.5.6 实战：训练过程可视化模板

最后给一个在实际LLM训练中直接能用的可视化模板，把训练过程中的关键指标都记录下来：

```python
import matplotlib.pyplot as plt
import json

with open('training_log.json', 'r') as f:
    log = json.load(f)

fig, axes = plt.subplots(1, 3, figsize=(15, 4))

axes[0].plot(log['train_loss'], label='Train', color='blue')
axes[0].plot(log['val_loss'], label='Val', color='red')
axes[0].set_title('Loss')
axes[0].legend()

axes[1].plot(log['grad_norm'], color='orange')
axes[1].set_title('Gradient Norm')
axes[1].axhline(y=1.0, color='gray', linestyle='--', alpha=0.5)

axes[2].plot(log['learning_rate'], color='green')
axes[2].set_title('Learning Rate Schedule')

for ax in axes:
    ax.set_xlabel('Step')
    ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig('training_summary.png', dpi=150)
```

这个模板可以放进你的项目工具箱里，每次训练完跑一下，快速诊断训练是否正常。梯度范数突然飙升说明梯度爆炸，loss变成NaN说明数值不稳定，学习率是否符合预期调度策略——这些都能从图上看出来。怕浪猫在实际项目中，每次训练完的第一件事就是跑这个可视化脚本看图表，而不是去看loss日志。图表能让你在一秒钟内判断训练是否正常，而翻日志可能需要好几分钟才能发现问题。

## 收藏清单：Python基础知识点速查表

为了方便大家查阅，怕浪猫把本章的核心知识点整理成一份速查表，建议收藏：

```
┌──────────────────────────────────────────────────────────────┐
│                Python for LLM 知识点速查表                    │
├──────────────┬───────────────────────────────────────────────┤
│ 主题         │ 核心要点                                      │
├──────────────┼───────────────────────────────────────────────┤
│ 动态类型     │ 变量不需声明类型，注意可变对象的引用共享      │
│ 逻辑运算     │ and/or/not，短路求值，优先级not>and>or        │
│ 循环         │ for遍历可迭代对象，enumerate加索引            │
│              │ zip并行遍历，break/continue控制流程           │
│ 函数参数     │ 位置/默认/*args/**kwargs，**kwargs是字典      │
│ lambda       │ 匿名函数，简单转换用，复杂逻辑抽函数          │
│ 装饰器       │ 函数包装函数，@语法糖，用于计时/权限/日志     │
│ 类与继承     │ __init__初始化，self指实例，继承复用代码      │
│ 四大类型     │ List可变序列，Tuple不可变，Dict键值对         │
│              │ Set去重集合，根据场景选择                     │
│ 可变/不可变  │ 不可变改=新对象，可变改=原地，默认参数坑      │
│ 切片         │ [start:stop:step]，负索引，反转[::-1]         │
│ 列表推导式   │ [expr for x in iter if cond]，简洁但别滥用    │
│ 生成器       │ yield惰性计算，处理大数据省内存               │
│ with语句     │ __enter__/__exit__，自动资源管理              │
│ 迭代器       │ __iter__/__next__，StopIteration终止          │
│ NumPy创建    │ array/zeros/ones/arange/linspace/randn        │
│ 广播机制     │ 从右对齐，维度相等或为1，自动扩展             │
│ 矩阵运算     │ @矩阵乘法，*逐元素乘法，.T转置               │
│ 随机数       │ default_rng(seed)，shuffle/choice/normal     │
│ 数据类型     │ float16省显存，float32标准，float64高精度     │
│ Matplotlib   │ plot折线，bar柱状，scatter散点，subplot子图  │
└──────────────┴───────────────────────────────────────────────┘
```

## 总结

这一章我们过了一遍Python语言基础中和LLM开发最相关的知识点。从变量类型到面向对象，从列表推导式到生成器，从NumPy向量化运算到Matplotlib可视化，这些都是写深度学习代码的基础工具。每个知识点我都配了LLM开发场景下的实际代码示例，不是空洞的语法讲解，而是"这个知识点在写大模型代码时具体怎么用"。

怕浪猫的经验是：这些知识点不需要一次全记住，但需要知道"有这个东西"。在实际项目中遇到的时候，能想起来"哦，生成器可以省内存"、"哦，广播机制可以自动扩展维度"、"哦，装饰器可以用在计时和梯度控制上"，然后回来翻一翻就够了。真正的学习发生在实践中，不在背诵里。建议跟着本章的代码示例手敲一遍，加深印象。如果你能不看本文，独立写出TextDataset类和计时装饰器，说明这部分知识你基本掌握了。

如果你已经对这些概念比较熟悉了，下一章我们就要进入真正的深水区——深度学习核心入门。从PyTorch基础到神经网络的前向传播、反向传播，再到Transformer的架构解析，难度会明显上升，但也会越来越有意思。到那个时候，你会发现本章学到的Python基础全部都用得上——类定义用来写模型、装饰器用来控制梯度、生成器用来加载数据、NumPy用来预处理、Matplotlib用来可视化。

> "基础不是用来背的，是用来用的。写够一万行代码，这些概念自然就长在脑子里了。"

怕浪猫说：Python基础这一章是选看的，但也是地基。很多同学跟我反馈说看Transformers源码很吃力，追根溯源都是对Python语法特性不熟——装饰器看不懂、生成器不知道什么时候用、广播机制一脸懵。这一章我特意把LLM开发中最常碰到的语法点拎出来讲了，配了实战代码示例，希望能帮你把地基打牢。基础扎实了，后面学PyTorch、学Transformer、学微调，才能事半功倍。

如果觉得这篇内容对你有帮助，点个收藏，方便以后查阅上面的知识点速查表。有什么不清楚的地方，评论区告诉我，怕浪猫会一一回复。下一章我们进入深度学习核心，从零理解神经网络的工作原理，跟着怕浪猫继续往前走。

系列进度 6/19

下章预告：第7章 — 深度学习核心入门，将从PyTorch基础操作开始，逐步拆解神经网络的前向传播、反向传播和梯度下降，为理解Transformer打下坚实基础。
