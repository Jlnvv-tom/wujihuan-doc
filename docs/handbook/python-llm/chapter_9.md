# 【实战】手写字识别 — 第一个AI模型诞生记（选看）

> 你有没有想过，自己训练的第一个AI模型应该是什么样的？不是调API，不是用别人封装好的库，而是从零开始，用PyTorch搭建一个神经网络，喂给它数据，看着loss一点点下降，最后它真的能认出手写数字。那种感觉，怕浪猫第一次体验到的时候，愣是在工位上坐了五分钟没说话。

我是怕浪猫，一个在深度学习坑里摸爬滚打多年的工程师。前面八章我们打了足够多的地基——Python基础、数学原理、梯度下降、反向传播、优化器、正则化。今天，所有这些知识要汇聚成一个实实在在的成果：你的第一个AI模型。

这一章是实战章，代码量比较大。但别怕，怕浪猫会一步步带你走，每个关键操作都会解释为什么这么做。到本章结束时，你会有一个能识别手写数字的模型，而且每一个参数都是你自己训练出来的。我们会从框架选择开始，经过数据加载、模型构建、训练循环、评估测试、保存部署，一直到参数调优，走完一个深度学习项目的完整生命周期。

## 9.1 PyTorch基础 — 为什么选它，怎么用

### PyTorch vs TensorFlow：框架之争的真相

深度学习框架的讨论在技术社区里从来没停过。怕浪猫不打算站队，但给你一张实际项目中的对比表，你自己感受：

| 对比维度 | PyTorch | TensorFlow |
|---------|---------|-----------|
| 开发者 | Meta (Facebook) | Google |
| 计算图 | 动态图（Eager Execution） | 静态图（TF2.x也支持动态） |
| 调试体验 | 像写普通Python，断点直接打 | 需要tf.function装饰器，调试较绕 |
| 学术界占比 | 约70%论文使用 | 约20%论文使用 |
| 工业部署 | TorchServe，日趋成熟 | TF Serving，生态成熟 |
| Hugging Face适配 | 原生支持，首选框架 | 支持但非首选 |
| 学习曲线 | 平缓，Pythonic | 稍陡，概念较多 |

> 金句：框架是工具，不是信仰。但当你发现Hugging Face、Meta、Stability AI的开源模型几乎清一色用PyTorch时，选择就已经做出了。

怕浪猫在项目中遇到过这样的情况：团队早期用TensorFlow 1.x搭了一套模型，后来要接入Hugging Face的预训练模型，发现人家只提供PyTorch版本。迁移成本巨大，最后只能用ONNX（Open Neural Network Exchange，开放神经网络交换）格式做桥接。如果一开始就选PyTorch，这坑根本不存在。

所以这个系列从头到尾都选PyTorch，不是因为它"更好"，而是因为在大模型时代，PyTorch的生态优势已经形成了正循环。越多人用，生态越完善，新模型越优先支持PyTorch，进而吸引更多用户。到2025年，这个循环已经非常明显了。

### 动态图 vs 静态图：理解PyTorch的核心设计

要真正理解PyTorch，必须搞懂动态图和静态图的区别。这是两个框架最根本的设计分歧。这个概念不搞清楚，后面写代码时遇到各种"诡异"行为你都会一头雾水。

**静态图（Static Computational Graph）**的做法是：先定义整个计算图，再传入数据执行。好比画建筑图纸，画完才能施工。TensorFlow 1.x是典型代表。好处是图可以预先优化，部署效率高，编译器能看到全局信息做融合优化。坏处是调试困难——你写的代码和实际执行的图之间隔了一层，打断点时看到的变量和你预期的不一样。条件分支需要用tf.cond这种特殊API，循环需要用tf.while_loop，写起来非常别扭。

**动态图（Dynamic Computational Graph）**的做法是：每运行一行代码，计算图就实时构建。好比边施工边画图，所见即所得。PyTorch从设计之初就选择了这条路。你用Python原生的if/else、for循环就行，不需要学任何特殊API。

```
静态图流程：                          动态图流程：
┌──────────┐  ┌──────────┐           ┌──────────┐
│ 定义计算图 │→│ 传入数据  │           │ 数据+代码 │
└──────────┘  └──────────┘           │ 同时执行  │
       ↓            ↓                 └──────────┘
┌──────────┐  ┌──────────┐                  ↓
│ 编译优化  │→│ 执行输出  │           ┌──────────┐
└──────────┘  └──────────┘           │ 实时输出  │
                                     └──────────┘
  先建图，后执行                        边建图，边执行
```

用一个简单的代码对比来感受差异。先看PyTorch的动态图写法：

```python
# PyTorch动态图 — 可以随时print，随时条件分支
import torch
x = torch.tensor([1.0, 2.0, 3.0])
y = x * 2
print(y)  # 立即输出 tensor([2., 4., 6.])
if y.mean() > 3:
    z = y ** 2  # 这个分支是运行时动态决定的
else:
    z = y + 1
print(z)  # 立即输出结果
```

再看等价的TensorFlow 1.x静态图写法（仅作对比，不需要掌握）：

```python
# TensorFlow 1.x静态图 — 先定义图，再执行
import tensorflow as tf
x = tf.placeholder(tf.float32, shape=[3])
y = x * 2
# 不能直接print(y)看结果，需要创建session执行
with tf.Session() as sess:
    result = sess.run(y, feed_dict={x: [1.0, 2.0, 3.0]})
    print(result)
```

在PyTorch里，每一步的操作都是立即执行的，你可以随时打印中间结果，可以用Python原生的if/else做条件分支。这种"所见即所得"的体验，对调试和开发来说太重要了。尤其是当模型结构比较复杂、包含条件分支或循环时，动态图的优势更加明显。

> 金句：动态图让你像写Python一样写深度学习，而不是像写配置文件一样定义计算图。

当然，静态图也有它的优势——全局优化。TensorFlow 2.x通过`tf.function`装饰器引入了"两全其美"的方案：先用动态图开发调试，再用`tf.function`编译成静态图提升性能。但实际使用中，这个转换经常出现各种意想不到的问题，比如Python副作用不支持、某些操作无法追踪等。PyTorch后来也通过`torch.compile`（PyTorch 2.0引入）提供了类似的编译优化能力，但保持了动态图优先的设计哲学。

### PyTorch生态：不只是一个框架

PyTorch不只是一个深度学习框架，它是一个完整的生态。怕浪猫在实际工作中频繁用到以下几个核心组件，每一个都值得了解：

**torchvision**：提供计算机视觉相关的数据集、模型架构和图像变换工具。本章加载MNIST数据集就靠它。除了MNIST，还内置了CIFAR-10、ImageNet等常用数据集，以及ResNet、VGG、EfficientNet等经典模型。做CV（Computer Vision，计算机视觉）项目，torchvision是第一站。

**torchtext**：自然语言处理的数据工具包，提供常用的文本数据集和词表构建工具。不过在大模型时代，torchtext的使用频率在下降，因为分词和Embedding更多用Hugging Face的tokenizers和transformers库来处理。

**torch.cuda**：GPU加速的核心模块。一行`model.cuda()`就能把模型搬到GPU上，数据也用`data.cuda()`搬过去，无需手动管理显存。GPU训练通常比CPU快10-50倍，对深度学习来说是刚需。

**torch.distributed**：分布式训练模块，支持多机多卡训练。大模型训练离不开它。后续章节讲到模型微调时，如果模型太大单卡放不下，就需要用到分布式训练策略，比如DDP（Distributed Data Parallel，分布式数据并行）和FSDP（Fully Sharded Data Parallel，全分片数据并行）。

**Autograd（Automatic Differentiation，自动微分）**：PyTorch的灵魂。你只需要定义前向传播，反向传播的梯度计算全自动完成。这就是为什么你写`loss.backward()`就能自动算梯度——Autograd在背后默默追踪每一个操作，构建计算图，然后用链式法则自动求导。

```python
# Autograd自动微分的核心演示
import torch
x = torch.tensor(2.0, requires_grad=True)  # 开启梯度追踪
y = x ** 2 + 3 * x + 1                      # y = x^2 + 3x + 1
y.backward()                                 # 自动求导
print(x.grad)  # dy/dx = 2x + 3 = 7.0
```

这段代码的原理是这样的：PyTorch在你做前向运算时，悄悄记录了所有操作（幂运算、乘法、加法），构建了一个有向无环图（DAG，Directed Acyclic Graph）。每个节点代表一个运算，边代表数据流向。调用`backward()`时，它从输出端反向遍历这个图，用链式法则逐步计算每个节点的梯度。梯度计算完成后，结果存入对应Tensor的`.grad`属性中。这个机制贯穿了整个PyTorch，是所有训练的基础。

`requires_grad=True`是开启梯度追踪的开关。模型参数默认开启，输入数据默认关闭。你在不需要梯度的场景（比如推理）下可以用`torch.no_grad()`临时关闭追踪，节省内存和计算开销。

> 金句：Autograd是PyTorch最优雅的设计。你只管定义前向传播，反向传播交给引擎。这让工程师能专注于模型设计而不是梯度推导。

### 环境准备：安装与验证

在开始写代码之前，确保你的环境已经就绪。如果你跟着前面的章节走过来，PyTorch应该已经装好了。没有的话，一行命令搞定：

```bash
# CPU版本（没有GPU的先用这个）
pip install torch torchvision

# GPU版本（有NVIDIA显卡的装这个）
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

安装完验证一下环境是否正常：

```python
import torch
print(f"PyTorch版本: {torch.__version__}")
print(f"CUDA可用: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"GPU型号: {torch.cuda.get_device_name(0)}")
    print(f"显存总量: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
```

怕浪猫提醒一个踩坑点：Mac M1/M2芯片用的是MPS（Metal Performance Shaders，金属性能着色器）加速，不是CUDA。验证方式是`torch.backends.mps.is_available()`，使用时用`.to('mps')`而不是`.cuda()`。如果你用Mac开发，这个区别一定要记住，否则代码跑到别人机器上会报错。另外，MPS的支持目前还不是所有操作都覆盖，偶尔会遇到某些算子不支持MPS的情况，需要fallback到CPU执行。

## 9.2 数据加载 — 喂给模型的第一口粮

### MNIST数据集：深度学习的"Hello World"

MNIST（Modified National Institute of Standards and Technology，改进版美国国家标准与技术研究院数据集）是深度学习最经典的数据集，没有之一。它包含60000张训练图片和10000张测试图片，每张是28x28像素的灰度手写数字图片，标签是0-9。自1998年发布以来，几乎所有深度学习教程都从MNIST开始。

为什么选MNIST作为第一个实战项目？因为它的难度恰到好处——简单到不会让你卡在数据上，复杂到能体现神经网络的价值。用全连接网络就能达到97%以上的准确率，用CNN（Convolutional Neural Network，卷积神经网络）能到99%以上。而且数据量适中，CPU几分钟就能训完，不需要GPU。

```
MNIST数据集结构：

┌─────────────────────────────┐
│      28 x 28 像素矩阵        │
│  ┌──┬──┬──┬──┬──┬──┬──┬──┐ │
│  │ 0│ 0│ 0│ 0│ 0│ 0│ 0│ 0│ │   每个像素值范围：0-255
│  ├──┼──┼──┼──┼──┼──┼──┼──┤ │   0 = 纯黑（背景）
│  │ 0│ 0│128│255│255│ 0│ 0│ │   255 = 纯白（笔画）
│  ├──┼──┼──┼──┼──┼──┼──┼──┤ │
│  │..│..│..│..│..│..│..│..│ │   标签：7
│  └──┴──┴──┴──┴──┴──┴──┴──┘ │
└─────────────────────────────┘

训练集：60000张（用于训练模型参数）
测试集：10000张（用于评估模型性能）
```

MNIST的数据来源也很有意思。它是由美国人口普查局员工手写的数字和美国高中生手写的数字混合而成，经过标准化处理。这个数据集小到可以放在内存里跑，大到足以展示真实深度学习项目的完整流程。

### torchvision.datasets：三行代码加载数据

PyTorch通过torchvision提供了极其方便的数据集加载接口。你不需要手动下载图片、解析标签文件、处理格式转换，torchvision帮你全部搞定：

```python
from torchvision import datasets, transforms

# 定义数据预处理流水线
transform = transforms.Compose([
    transforms.ToTensor(),              # PIL图片转Tensor，自动归一化到[0,1]
    transforms.Normalize((0.1307,), (0.3081,))  # MNIST的均值和标准差
])

# 加载训练集和测试集
train_dataset = datasets.MNIST(
    root='./data', train=True, download=True, transform=transform
)
test_dataset = datasets.MNIST(
    root='./data', train=False, download=True, transform=transform
)
```

这里有几个关键点需要详细解释。

**transforms.ToTensor()**做了两件事：把PIL图片或NumPy数组转换成PyTorch Tensor，同时将像素值从0-255缩放到0.0-1.0的范围。这一步就是最简单的归一化（Normalization），让数据分布落在更适合神经网络处理的区间。神经网络更喜欢小数值输入，如果输入值太大，容易导致梯度爆炸或激活函数饱和。

**transforms.Normalize((0.1307,), (0.3081,))**进一步做了标准化：用MNIST数据集的全局均值0.1307和标准差0.3081对数据做`(x - mean) / std`操作。标准化后的数据均值为0、标准差为1，这能显著提升训练收敛速度。为什么？因为当输入特征均值为0、方差为1时，梯度方向更加一致，优化器走得更顺畅。

0.1307和0.3081这两个数字是别人提前在整个MNIST数据集上算好的，不用自己算。但对于你自己的数据集，需要先跑一遍统计均值和标准差。怕浪猫见过有人用MNIST的均值标准差去标准化CIFAR-10的数据，结果模型效果很差——数据分布完全不同，张冠李戴了。

> 金句：数据预处理不是可选项，而是必选项。同样的模型，好的预处理能让准确率提升3-5个百分点。

**transform的组合**用`transforms.Compose`实现，它把多个变换串行执行，就像流水线一样。顺序很重要——先ToTensor再Normalize，因为Normalize操作的输入必须是Tensor。如果你把顺序反了，会报类型错误。

transforms.Compose还支持很多其他变换，比如`transforms.RandomRotation`（随机旋转）、`transforms.RandomCrop`（随机裁剪）等。这些在数据增强时会用到，后面章节会详细讲。

### DataLoader：批量喂食的艺术

直接从Dataset取数据是单条的，效率太低。DataLoader的作用是把数据分成批次（batch），并行加载，让GPU不闲着。这是PyTorch数据加载的核心组件，设计得非常精巧。

```python
from torch.utils.data import DataLoader

train_loader = DataLoader(
    train_dataset, batch_size=64, shuffle=True, num_workers=2
)
test_loader = DataLoader(
    test_dataset, batch_size=1000, shuffle=False, num_workers=2
)
```

每个参数都有讲究，让我逐个解释：

**batch_size=64**：每次取64张图片一起训练。这个数字不是随便定的，后面调优章节会详细讨论batch_size的影响。训练时用64，测试时用1000——因为测试不需要反向传播，显存占用小，可以批量推理加快速度。

**shuffle=True**：训练时打乱数据顺序。这很重要！如果模型每次都按固定顺序看到数据，它可能会"记住"顺序而不是学习特征。打乱顺序确保每个batch的数据分布是随机的，模型学到的是真正的特征而不是顺序信息。测试时不需要打乱，因为评估只做一次，顺序不影响结果。

**num_workers=2**：用2个子进程并行加载数据。GPU算得快，如果数据加载跟不上，GPU就会空等。num_workers让数据加载和数据计算重叠起来——当GPU在算当前batch时，CPU已经在准备下一个batch了。但注意：在Windows上num_workers>0可能有问题，需要放在`if __name__ == '__main__':`里，否则会触发多进程递归启动。

DataLoader还支持其他有用的参数：`pin_memory=True`可以加速CPU到GPU的数据传输（使用锁页内存），`drop_last=True`在数据量不能被batch_size整除时丢弃最后不完整的batch（保证每个batch大小一致，某些模型需要）。

> 金句：DataLoader是数据加载的"传送带"——它保证GPU永远有活干，不会因为等数据而空转。

### 数据可视化：看一眼你到底在训练什么

在开始训练之前，先看看数据长什么样。这是怕浪猫的经验法则：永远先看数据，再看模型。不看数据就动手写模型，就像不看菜谱就开始炒菜——你不知道食材是什么，怎么能做出好菜？

```python
import matplotlib.pyplot as plt

# 取一个batch看看
images, labels = next(iter(train_loader))
fig, axes = plt.subplots(2, 5, figsize=(12, 5))
for i, ax in enumerate(axes.flat):
    ax.imshow(images[i].squeeze(), cmap='gray')
    ax.set_title(f'Label: {labels[i].item()}')
    ax.axis('off')
plt.tight_layout()
plt.savefig('mnist_samples.png')
```

这段代码会画出前10张训练图片。你应该能看到各种笔迹的数字0-9，有的歪歪扭扭，有的很工整，有的粗有的细。看数据的目的是建立直觉——模型要解决的问题就是把28x28的像素矩阵映射到0-9这10个类别中的一个。

更进一步，你还可以看看数据的统计分布：

```python
# 统计每个数字类别的样本数量
import collections
labels_all = [label.item() for _, label in train_dataset]
counter = collections.Counter(labels_all)
for digit in range(10):
    print(f"数字 {digit}: {counter[digit]} 张 ({counter[digit]/60000:.1%})")
```

MNIST的类别分布基本均匀，每个数字大约有5400-6700张图片。如果某个类别特别少，模型就会偏向多数类别。实际项目中遇到类别不平衡，需要用过采样、欠采样或加权损失函数来处理。

> 金句：不看数据就训模型，就像不看路就踩油门。你跑得很快，但不知道跑向哪里。

一个踩坑提醒：如果你在服务器上没有图形界面，用`plt.savefig()`保存图片而不是`plt.show()`。怕浪猫早年就因为SSH到服务器跑`plt.show()`卡了半天，以为代码挂了。另外，matplotlib在无头服务器上需要设置`import matplotlib; matplotlib.use('Agg')`才能正常保存图片，否则会报找不到display的错误。

### 训练集/测试集划分：为什么不能混

MNIST本身已经帮你划好了60000张训练集和10000张测试集。但理解为什么这么划分很重要，因为实际项目中你需要自己划分。

训练集是模型用来学习参数的数据。模型通过反复看这些数据，调整自己的权重来最小化loss。测试集是模型从未见过的数据，用来评估模型的泛化能力（Generalization Ability）。如果把测试集混进训练集，就好比考试前把答案给学生背了——成绩很好看，但换个考场就露馅。

> 金句：模型的真正能力不是在训练集上表现多好，而是在没见过的数据上表现多好。这就是泛化。

实际项目中还需要一个验证集（Validation Set）。它从训练集中划出来，用来在训练过程中监控模型状态、调整超参数。三者的典型比例是6:2:2或8:1:1。训练集用来训练，验证集用来调参，测试集只在最终评估时用一次。MNIST因为数据量大，通常直接用训练集训练、测试集评估就够了。但你自己的项目中，一定要严格划分这三个集合。

怕浪猫还遇到过另一种坑：数据泄露（Data Leakage）。比如在图像分类项目中，同一物体的多张照片同时出现在训练集和测试集中。模型学到的不是识别物体，而是记住"这个角度的这辆车是这个类别"。结果测试准确率很高，实际部署后效果很差。划分数据集时要确保同一来源的数据不能跨集合分布。

## 9.3 模型构建与训练 — 从零搭建神经网络

### nn.Module：所有模型的基类

PyTorch中所有神经网络都继承自`torch.nn.Module`。这个基类帮你处理了参数管理、设备迁移、模型保存等繁杂工作。你只需要做两件事：在`__init__`里定义网络层，在`forward`里定义前向传播。这个设计模式贯穿了整个PyTorch生态，从简单的全连接网络到复杂的Transformer，都遵循同一套范式。

```python
import torch.nn as nn

class MnistNet(nn.Module):
    def __init__(self):
        super(MnistNet, self).__init__()
        self.fc1 = nn.Linear(28 * 28, 256)   # 输入层→隐藏层1
        self.fc2 = nn.Linear(256, 128)        # 隐藏层1→隐藏层2
        self.fc3 = nn.Linear(128, 10)         # 隐藏层2→输出层
        self.relu = nn.ReLU()                 # 激活函数
        self.dropout = nn.Dropout(0.2)        # 正则化

    def forward(self, x):
        x = x.view(-1, 28 * 28)  # 展平图片: (batch,1,28,28)→(batch,784)
        x = self.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.relu(self.fc2(x))
        x = self.dropout(x)
        x = self.fc3(x)  # 输出层不加激活，CrossEntropyLoss内部带Softmax
        return x
```

逐行解释这个模型的结构，每个细节都有讲究。

**网络架构设计**：输入层784个神经元（28x28=784），对应图片的每个像素。两个隐藏层分别256和128个神经元，逐层递减，这是常见的"漏斗"结构——从高维输入逐步压缩到低维特征。输出层10个神经元，对应0-9十个数字类别。这是一个典型的多层感知机（MLP，Multi-Layer Perceptron）结构，也是深度学习最基础的网络形态。

**x.view(-1, 28*28)**：把4维Tensor`(batch_size, 1, 28, 28)`展平成2维`(batch_size, 784)`。`-1`表示自动推断batch维度。全连接层需要2维输入，这一步就是图像到向量的转换。注意这里用的是`view`而不是`reshape`——`view`要求内存连续，`reshape`不要求。如果Tensor经过某些操作后内存不连续，`view`会报错，这时需要先调用`contiguous()`。

**ReLU（Rectified Linear Unit，修正线性单元）**：最常用的激活函数，公式为`f(x) = max(0, x)`。它让网络有非线性表达能力。没有激活函数，再多层的线性变换叠加起来还是线性的，等价于一层——这是数学上可以证明的。ReLU之所以受欢迎，是因为它计算简单（只需比较大小），且在正数区域梯度恒为1，不会出现梯度消失问题。

**Dropout**：训练时随机丢弃20%的神经元，强迫网络不依赖任何单个神经元。这是第8章讲过的正则化技术，能有效防止过拟合（Overfitting）。评估时Dropout自动关闭，所有神经元都参与计算。这个切换由`model.train()`和`model.eval()`控制。

**输出层不加激活函数**：因为后面要用`nn.CrossEntropyLoss`，它内部会先做Softmax再算交叉熵。如果你在输出层加了Softmax，再用CrossEntropyLoss，就等于做了两次Softmax，结果会出错。这是新手常踩的坑，怕浪猫第一次写PyTorch代码时就栽在这上面，debug了两个小时。

```
数据流图：

输入图片 (1, 28, 28)
       │
       ▼ view展平
   (784,)
       │
       ▼ fc1 + ReLU
   (256,)     ← 第一层特征提取
       │
       ▼ Dropout(0.2)
   (256,)     ← 随机丢弃20%神经元
       │
       ▼ fc2 + ReLU
   (128,)     ← 第二层特征提取
       │
       ▼ Dropout(0.2)
   (128,)
       │
       ▼ fc3 (无激活)
   (10,)      ← logits输出，交给CrossEntropyLoss处理
```

### 损失函数与优化器：模型学习的方向盘

模型定义好了，还需要告诉它"怎么学"。损失函数定义"学好"的标准，优化器定义"怎么学"的策略。

```python
import torch.optim as optim

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)
```

**CrossEntropyLoss（交叉熵损失）**：分类任务的标准损失函数。它结合了Softmax和负对数似然损失，专门用于多分类问题。Softmax将模型输出转换为概率分布（所有类别概率之和为1），交叉熵则衡量预测概率分布和真实分布的差异。相比于MSE（Mean Squared Error，均方误差），交叉熵在分类任务上收敛更快、效果更好。

**Adam（Adaptive Moment Estimation，自适应矩估计）**：最常用的优化器之一。它结合了Momentum（动量）和RMSProp（均方根传播）的优点，自动为每个参数维护一阶矩估计和二阶矩估计，动态调整学习率。对于大多数任务，Adam是默认首选优化器，不需要调太多参数就能work。

> 金句：选优化器就像选鞋子——Adam是运动鞋，通用舒适；SGD是跑鞋，调好了能跑更快但需要技巧。入门阶段穿运动鞋就好。

### 训练循环：五步训练法

PyTorch的训练循环有一个固定的模式，怕浪猫称之为"五步训练法"。这五步会贯穿你整个深度学习生涯，不管模型多复杂，核心都是这五步：

```python
import torch.optim as optim

model = MnistNet()
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model.to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

epochs = 5
for epoch in range(epochs):
    model.train()  # 训练模式
    total_loss = 0
    for batch_idx, (data, target) in enumerate(train_loader):
        data, target = data.to(device), target.to(device)
        # 五步训练法
        optimizer.zero_grad()        # 1. 清空梯度
        output = model(data)         # 2. 前向传播
        loss = criterion(output, target)  # 3. 计算损失
        loss.backward()              # 4. 反向传播
        optimizer.step()             # 5. 更新参数
        total_loss += loss.item()
    print(f'Epoch {epoch+1}/{epochs}, Loss: {total_loss/len(train_loader):.4f}')
```

这五步是PyTorch训练的核心，每一步都不可省略。让我逐一拆解其原理。

**第一步：optimizer.zero_grad()** — 清空上一步的梯度。PyTorch的梯度是累加的，这是设计选择不是bug——某些场景（比如梯度累积，用小显存训大batch）需要梯度累加。但常规训练时必须清零，否则这一步的梯度会和上一步的梯度叠加，导致训练方向错误。怕浪猫见过太多新手忘了这行代码，模型loss越训越高，百思不得其解。

**第二步：model(data)** — 前向传播。数据经过网络层层计算，输出一个(batch_size, 10)的Tensor，每个样本对应10个类别的原始得分（logits）。前向传播就是数据从输入层经过隐藏层到输出层的流动过程，每一层做矩阵乘法加偏置再过激活函数。

**第三步：criterion(output, target)** — 计算损失。CrossEntropyLoss衡量模型输出和真实标签之间的差距。loss越大说明模型预测越离谱，loss越小说明预测越准。这个loss值就是优化器要最小化的目标。

**第四步：loss.backward()** — 反向传播。这是Autograd的核心操作。PyTorch从loss开始反向遍历计算图，用链式法则计算每个参数的梯度。梯度表示"参数往哪个方向调整能让loss减小"。

**第五步：optimizer.step()** — 更新参数。优化器根据梯度信息，按照特定的更新规则调整每个参数的值。Adam的更新规则比较复杂，涉及动量、自适应学习率等，但核心思想是沿着梯度的反方向走一步。

> 金句：训练循环的五步法就像炒菜：备料(zero_grad)、下锅(forward)、尝味(loss)、调味(backward)、出锅(step)。少一步都不行。

### loss.backward()的原理：链式法则的工程实现

怕浪猫在第八章讲过反向传播的数学原理，这里从工程角度再解释一下Autograd是怎么实现的。

当你调用`loss.backward()`时，PyTorch做的事情可以分为四步：

1. 从loss节点开始，反向遍历计算图（拓扑排序）
2. 对每个操作节点，计算局部梯度（local gradient）
3. 用链式法则将上游梯度与局部梯度相乘，得到当前节点的梯度
4. 将梯度累积到对应参数的`.grad`属性中

```
前向传播（构建计算图）：         反向传播（计算梯度）：

x → [fc1] → [ReLU] → [fc2]    loss ← [d_loss/d_fc2] ← [d_ReLU] ← [d_fc1]
    → [Dropout] → [fc3]                ← [d_Dropout] ← [d_fc3]
    → [CrossEntropy] → loss

每个[]内的操作都有局部梯度
链式法则：d_loss/d_x = d_loss/d_y * d_y/d_x
```

Autograd的实现依赖于Tensor的`grad_fn`属性。每个经过运算产生的Tensor都会记录它是由什么操作产生的。当你调用backward()时，PyTorch顺着这些`grad_fn`组成的链条，逐个计算梯度。这就是"动态图"的含义——每次前向传播都构建一个新的计算图，反向传播完成后立即销毁。下一次前向传播又构建新的图。这让条件分支、循环等控制流变得自然，因为每个batch的计算图可以根据数据动态变化。

一个容易忽略的细节：`loss.item()`会取出标量值并断开计算图。如果你在训练循环中保存loss用于绘图，应该用`loss.item()`而不是直接保存loss这个Tensor，否则计算图不会被释放，内存会越积越多最终OOM（Out of Memory，内存溢出）。

> 金句：理解Autograd不需要懂复杂的数学，但需要理解一个核心概念——PyTorch在背后悄悄记录你的每一步操作，然后在反向传播时逐一"算账"。

### 训练过程监控：让训练不再黑盒

上面的训练循环只打印了每个epoch的平均loss。在实际项目中，你需要更细致的监控。怕浪猫习惯在训练过程中记录更多维度的信息：

```python
# 增强版训练循环（关键片段）
for epoch in range(epochs):
    model.train()
    correct = 0
    total = 0
    for batch_idx, (data, target) in enumerate(train_loader):
        data, target = data.to(device), target.to(device)
        optimizer.zero_grad()
        output = model(data)
        loss = criterion(output, target)
        loss.backward()
        optimizer.step()

        # 实时监控训练准确率
        pred = output.argmax(dim=1)
        correct += pred.eq(target).sum().item()
        total += len(target)

        if batch_idx % 200 == 0:
            print(f'Epoch {epoch+1} Batch {batch_idx} '
                  f'Loss: {loss.item():.4f} '
                  f'Acc: {100.*correct/total:.2f}%')
```

这段代码在训练过程中同时计算训练准确率。`output.argmax(dim=1)`取每个样本预测概率最大的类别，`pred.eq(target)`比较预测和真实标签。每200个batch打印一次，让你能看到loss下降和准确率上升的过程。

> 金句：监控训练过程就像看仪表盘——你不需要每秒都盯着，但隔一会儿扫一眼能避免灾难性故障。

怕浪猫踩过一个大坑：训练了10个epoch，loss一直在降，以为模型学得很好。结果一测发现准确率只有30%。后来排查发现是数据预处理写错了，输入数据全是0。loss下降是因为模型学会了输出恒定值——当所有输入都一样时，模型找到一个恒定输出能让loss最小化，但这完全没有泛化能力。如果当时加了准确率监控，第一个epoch就能发现问题。从此以后，怕浪猫的训练代码里准确率监控是标配，绝不省略。

## 9.4 模型评估与部署 — 从训练到实际使用

### model.eval()与torch.no_grad()：评估的标配组合

训练完的模型要评估效果，有两个关键设置必须正确。这两个设置缺一不可，很多新手只写一个，导致评估结果不准确。

```python
def evaluate(model, test_loader, device):
    model.eval()  # 切换到评估模式
    test_loss = 0
    correct = 0
    with torch.no_grad():  # 不计算梯度
        for data, target in test_loader:
            data, target = data.to(device), target.to(device)
            output = model(data)
            test_loss += criterion(output, target).item()
            pred = output.argmax(dim=1)
            correct += pred.eq(target).sum().item()

    test_loss /= len(test_loader)
    accuracy = 100. * correct / len(test_loader.dataset)
    print(f'测试集: 平均Loss: {test_loss:.4f}, '
          f'准确率: {accuracy:.2f}%')
    return accuracy
```

**model.eval()**的作用是切换模型到评估模式。这会影响Dropout和BatchNorm等层的行为：Dropout在评估时关闭（不丢弃任何神经元），BatchNorm使用训练时累积的统计量而不是当前batch的统计量。忘写这行代码会导致评估结果严重偏低——Dropout还在随机丢弃神经元，每次预测结果都不一样。

**torch.no_grad()**是一个上下文管理器，告诉PyTorch"这段代码不需要计算梯度"。这样做有两个好处：节省内存（不存储中间结果用于反向传播），加速计算（跳过Autograd的计算图构建）。在推理和评估时，这个是必须的。

> 金句：训练时梯度是朋友，评估时梯度是累赘。该算的时候算，不该算的时候别浪费资源。

两个都不可省略。`model.eval()`影响的是层的行为（Dropout、BatchNorm），`torch.no_grad()`影响的是Autograd的行为（是否追踪计算），它们作用于不同层面。怕浪猫在代码review时经常看到有人只写了一个，甚至两个都没写，评估结果莫名其妙地不稳定。

### 精度计算：准确率之外还有什么

准确率（Accuracy）是最直观的指标，但它不是全部。怕浪猫在项目中遇到过这样的情况：模型整体准确率97%，但某个特定数字的识别率只有85%。这时需要更细致的评估，了解模型在每个类别上的表现。

```python
from sklearn.metrics import classification_report

# 评估并生成详细报告
model.eval()
all_preds = []
all_targets = []
with torch.no_grad():
    for data, target in test_loader:
        output = model(data.to(device))
        all_preds.extend(output.argmax(dim=1).cpu().numpy())
        all_targets.extend(target.numpy())

print(classification_report(all_targets, all_preds, digits=4))
```

这会输出每个数字类别的精确率（Precision）、召回率（Recall）和F1值。精确率衡量"模型说是对的里面有多少真对"，召回率衡量"真正对的里面模型找到了多少"，F1值是两者的调和平均。

```
              precision  recall  f1-score   support
           0     0.9856  0.9927    0.9891      980
           1     0.9882  0.9947    0.9914     1135
           2     0.9756  0.9785    0.9770     1032
           3     0.9712  0.9703    0.9708     1010
           4     0.9750  0.9790    0.9770      982
           5     0.9633  0.9614    0.9623      892
           6     0.9821  0.9856    0.9838      958
           7     0.9768  0.9756    0.9762     1028
           8     0.9691  0.9630    0.9660      974
           9     0.9645  0.9604    0.9624     1009
    accuracy                         0.9773    10000
   macro avg     0.9752  0.9761    0.9756    10000
```

从这份报告可以看出，数字1最容易识别（F1=0.9914），笔画简单特征明显。数字8和5相对难识别（F1分别0.966和0.962），因为笔画结构复杂，不同人写法差异大。分析这些细节能帮你理解模型到底学到了什么，以及哪些类别可能需要更多训练数据或特殊处理。

> 金句：一个数字97%的准确率可能掩盖了某个类别85%的短板。分类报告是模型的体检报告，每一项都要看。

### torch.save()与torch.load()：模型的存档与读档

训练好的模型要保存下来，否则关掉程序就白训了。PyTorch提供了灵活的保存机制，两种方式各有适用场景：

```python
# 方式一：只保存模型参数（推荐）
torch.save(model.state_dict(), 'mnist_model.pth')

# 方式二：保存完整模型（包括结构，不推荐）
torch.save(model, 'mnist_full.pth')

# 加载方式一对应的模型
model = MnistNet()  # 先实例化空模型
model.load_state_dict(torch.load('mnist_model.pth'))
model.eval()
```

**state_dict**是PyTorch推荐的保存方式。它是一个Python字典，键是层的名字，值是对应的参数Tensor。这种方式的好处是：文件小、灵活、不绑定模型类的定义位置。你修改了模型类的代码（比如加了一个方法），旧参数照样能加载。

怕浪猫强烈建议用方式一。方式二虽然看起来方便——不需要先实例化模型就能加载——但它用`pickle`序列化了整个对象，加载时要求模型类的定义在相同的模块路径。你把代码发给别人，别人运行就可能报`AttributeError`。而且在生产环境中，完整模型的pickle文件有安全风险——恶意构造的pickle文件可以执行任意代码。

> 金句：保存模型参数而不是整个模型，就像存菜谱而不是存整道菜。菜谱可以随时复现菜品，整道菜放久了就坏了。

实际项目中，怕浪猫习惯保存更多信息，包括训练状态：

```python
# 保存checkpoint（训练断点）
checkpoint = {
    'epoch': epoch,
    'model_state_dict': model.state_dict(),
    'optimizer_state_dict': optimizer.state_dict(),
    'loss': loss.item(),
    'best_accuracy': best_accuracy,
}
torch.save(checkpoint, f'checkpoint_epoch{epoch}.pth')

# 从checkpoint恢复
checkpoint = torch.load('checkpoint_epoch3.pth')
model.load_state_dict(checkpoint['model_state_dict'])
optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
start_epoch = checkpoint['epoch'] + 1
```

这样如果训练中断了，可以从checkpoint恢复，不用从头来过。在训练大模型时这几乎是必须的——你不想训了三天的模型因为断电而全部白费。optimizer的状态也要保存，因为Adam优化器内部维护着动量和自适应学习率等状态，如果不恢复，优化器会从零开始，训练曲线会出现跳变。

### 模型部署推理：让模型真正工作

保存好的模型怎么用？来看一个最简单的推理函数，实现从图片到预测结果的完整流程：

```python
def predict(image_tensor, model, device):
    """单张图片推理"""
    model.eval()
    with torch.no_grad():
        image_tensor = image_tensor.to(device)
        # 添加batch维度: (1, 28, 28) → (1, 1, 28, 28)
        image_tensor = image_tensor.unsqueeze(0).unsqueeze(0)
        output = model(image_tensor)
        probabilities = torch.nn.functional.softmax(output, dim=1)
        pred = output.argmax(dim=1).item()
        confidence = probabilities[0][pred].item()
    return pred, confidence

# 使用示例
test_image = test_dataset[0][0]  # 取测试集第一张图
prediction, conf = predict(test_image, model, device)
print(f'预测: {prediction}, 置信度: {conf:.2%}')
```

注意几个关键细节。`unsqueeze(0)`两次是为了把单张图片的维度从(28, 28)变成(1, 1, 28, 28)，即(batch_size=1, channels=1, height=28, width=28)。模型的输入必须是4维的，这是PyTorch卷积层和全连接层的约定。维度不匹配是最常见的推理错误。

`softmax`将logits转换为概率分布，所有类别的概率之和为1。置信度就是预测类别的概率值。如果置信度很低（比如低于50%），说明模型对这张图片不太确定，实际系统中可以设置阈值让低置信度的预测走人工审核。

实际部署时，还要考虑更多工程问题：输入图片格式不一致（RGB vs灰度）、尺寸不一致（需要resize到28x28）、像素值范围不一致（需要归一化）。这些预处理步骤必须和训练时完全一致，否则模型效果会大打折扣。怕浪猫见过一个案例：训练时做了Normalize但推理时忘了，准确率从97%暴跌到30%。排查了半天才发现是预处理不一致。

> 金句：训练用的预处理和推理用的预处理必须一模一样。差一个Normalize，模型就从学霸变学渣。

### 推理服务化：用FastAPI封装模型

怕浪猫在实际项目中，模型推理通常会封装成API服务。用FastAPI（Fast API，一个高性能Python Web框架）是最常见的选择，它支持异步、自动生成文档、类型校验，非常适合做模型推理服务：

```python
from fastapi import FastAPI, UploadFile
import io
from PIL import Image

app = FastAPI()

@app.post("/predict")
async def predict_api(file: UploadFile):
    image = Image.open(io.BytesIO(await file.read()))
    image = image.convert('L').resize((28, 28))
    tensor = transforms.ToTensor()(image)
    tensor = transforms.Normalize((0.1307,), (0.3081,))(tensor)
    pred, conf = predict(tensor, model, device)
    return {"prediction": pred, "confidence": f"{conf:.2%}"}
```

这个API接收上传的图片文件，做预处理后调用模型推理，返回JSON格式的预测结果。注意预处理逻辑和训练时完全一致：转灰度图、resize到28x28、ToTensor、Normalize。部署时用`uvicorn`启动，配合Docker就能上生产环境。

当然实际生产还要考虑并发处理、请求超时、日志记录、监控告警、模型版本管理等问题，但这些是后端工程的事了。核心原则是：把模型当作一个纯函数，输入图片，输出预测，用工程手段保证它的可靠性和可用性。

## 9.5 训练参数调优 — 让模型从能用到好用

### 学习率：最重要的超参数

如果说训练模型是开车，学习率就是油门。太小了跑不动，太大了翻车。学习率是所有超参数中最重要的一个，怕浪猫每次开新项目第一个调的就是它。Adam优化器的默认学习率是0.001，这个值对MNIST来说够用，但对其他任务不一定。

```python
# 不同学习率的对比实验
learning_rates = [0.0001, 0.001, 0.01, 0.1]
results = {}

for lr in learning_rates:
    model = MnistNet().to(device)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss()
    for epoch in range(5):
        model.train()
        for data, target in train_loader:
            data, target = data.to(device), target.to(device)
            optimizer.zero_grad()
            loss = criterion(model(data), target)
            loss.backward()
            optimizer.step()
    acc = evaluate(model, test_loader, device)
    results[lr] = acc
    print(f'lr={lr}: 准确率={acc:.2f}%')
```

怕浪猫实测的结果大致是这样的：

| 学习率 | 5轮后测试准确率 | 训练特征 |
|-------|--------------|---------|
| 0.0001 | 95.2% | 收敛慢，loss下降平缓，还没到最优 |
| 0.001 | 97.8% | 收敛适中，效果最佳，Adam默认值 |
| 0.01 | 97.1% | 前期收敛快，后期出现震荡 |
| 0.1 | 10.3% | 爆炸了，loss变NaN，模型完全废掉 |

学习率0.1时直接炸了——loss变成NaN（Not a Number），因为参数更新步长太大，跳过了最优解，loss越来越大最后数值溢出。这就是"梯度爆炸"（Gradient Explosion）的一种表现。一旦出现NaN，模型参数已经被破坏，无法恢复，只能重新初始化训练。

> 金句：学习率不是越大越好。你开车上高速，油门踩到底不是勇敢，是危险。

实际项目中的做法是用学习率调度器（Learning Rate Scheduler），让学习率随着训练逐渐减小。前期学习率大，快速接近最优区域；后期学习率小，精细调整参数：

```python
from torch.optim.lr_scheduler import StepLR

optimizer = optim.Adam(model.parameters(), lr=0.001)
scheduler = StepLR(optimizer, step_size=2, gamma=0.5)

for epoch in range(epochs):
    model.train()
    for data, target in train_loader:
        data, target = data.to(device), target.to(device)
        optimizer.zero_grad()
        loss = criterion(model(data), target)
        loss.backward()
        optimizer.step()
    scheduler.step()  # 每个epoch结束后调整学习率
    print(f'Epoch {epoch+1} 学习率: {scheduler.get_last_lr()[0]:.6f}')
```

`StepLR`每2个epoch把学习率乘以0.5。这就像开车——起步时油门大一点快速接近目标，快到了就收油门精确对位。除了StepLR，PyTorch还提供`CosineAnnealingLR`（余弦退火，学习率按余弦曲线衰减）、`ReduceLROnPlateau`（当指标不再改善时降低学习率）等调度器，适用于不同场景。

余弦退火是近年来最流行的学习率调度策略之一，它的学习率变化曲线像余弦波一样先大后小再微升，能在训练后期做更精细的调整。很多大模型预训练用的就是余弦退火加warmup（前几个epoch学习率从0线性增长到初始值）的组合策略。

### epoch数选择：训几轮才够

Epoch（训练轮数）是指模型把整个训练集看完几次。太少模型没学够（欠拟合），太多模型会过拟合。怎么选？看训练曲线。

```python
# 记录每个epoch的训练loss和测试准确率
train_losses = []
test_accuracies = []

for epoch in range(20):  # 训20轮观察趋势
    model.train()
    epoch_loss = 0
    for data, target in train_loader:
        data, target = data.to(device), target.to(device)
        optimizer.zero_grad()
        loss = criterion(model(data), target)
        loss.backward()
        optimizer.step()
        epoch_loss += loss.item()
    train_losses.append(epoch_loss / len(train_loader))

    acc = evaluate(model, test_loader, device)
    test_accuracies.append(acc)
```

典型结果是这样的：

```
Epoch  Loss    Test Acc   状态判断
  1    0.32    95.2%      快速学习阶段
  3    0.12    97.1%      持续提升
  5    0.07    97.8%      接近最优
  8    0.04    98.1%      缓慢提升
 12    0.02    98.2%      基本停滞
 15    0.01    98.1%      开始过拟合（训练loss降但测试不升）
 20    0.005   97.9%      明显过拟合（测试准确率下降）
```

epoch 12之后，训练loss还在降，但测试准确率反而开始下降。这就是过拟合的信号——模型开始"背题"而不是"学知识"。它把训练集中的噪声和细节都记住了，但对没见过的数据反而判断变差。

> 金句：训练loss下降但测试准确率不升反降，就像学生把练习册背得滚瓜烂熟，一到考试反而不会做。这就是过拟合。

解决过拟合的方法有几个层次，从简单到复杂：

**早停法（Early Stopping）**：监控验证集准确率，连续N轮不提升就停止训练。简单有效，实际项目中最常用。不需要额外代码，就是训的时候盯着测试指标。

**增加正则化**：增大Dropout比例（从0.2调到0.3-0.5）、加L2正则化（在优化器中设置`weight_decay=1e-4`参数）。L2正则化在每次参数更新时额外加一个惩罚项，让参数值趋向于小，防止模型过于复杂。

**数据增强（Data Augmentation）**：对训练数据做随机变换（旋转、平移、缩放），人为增加数据多样性。比如MNIST中的数字"6"旋转一点就可能变成"9"，这种增强能让模型学到旋转不变的特征。

**减小模型容量**：如果模型太大，适当减少隐藏层神经元数量。从256-128减到128-64，模型表达能力降低，过拟合风险也降低。

对于MNIST这个简单任务，5-8个epoch就够了。更复杂的任务可能需要几十甚至上百个epoch，但原理是一样的——看训练曲线，在过拟合之前停下来。

### batch_size的影响：不只是大小的问题

batch_size决定了一次前向传播处理多少样本。它影响三个方面：训练速度、梯度估计质量、泛化性能。很多新手只关注训练速度，忽略了它对模型效果的影响。

```python
# 不同batch_size对比实验
batch_sizes = [16, 64, 256, 1024]
for bs in batch_sizes:
    train_loader = DataLoader(
        train_dataset, batch_size=bs, shuffle=True
    )
    model = MnistNet().to(device)
    optimizer = optim.Adam(model.parameters(), lr=0.001)
    for epoch in range(5):
        model.train()
        for data, target in train_loader:
            data, target = data.to(device), target.to(device)
            optimizer.zero_grad()
            loss = criterion(model(data), target)
            loss.backward()
            optimizer.step()
    acc = evaluate(model, test_loader, device)
    print(f'batch_size={bs}: 准确率={acc:.2f}%')
```

| batch_size | 训练速度 | 测试准确率 | 显存占用 | 特征分析 |
|-----------|---------|----------|---------|---------|
| 16 | 慢 | 97.5% | 低 | 梯度噪声大，有隐式正则化效果 |
| 64 | 适中 | 97.8% | 适中 | 速度和效果的平衡点 |
| 256 | 快 | 97.6% | 高 | 梯度估计更准，但泛化稍差 |
| 1024 | 很快 | 97.2% | 很高 | 需要调大学习率，泛化差 |

小batch_size的梯度估计更"嘈杂"——因为每次只用少量样本计算梯度，梯度方向不一定指向全局最优。但这种噪声反而能帮助模型跳出局部最优，起到隐式正则化的作用，提升泛化性能。大batch_size的梯度更准确，但容易陷入sharp minima（尖锐极小值），这种极小值在训练集上loss很低，但稍微偏离就loss暴增，泛化性能差。

> 金句：batch_size不只是效率参数，更是正则化参数。梯度中的噪声有时是朋友而不是敌人。

实际项目中的经验法则：先从64或32开始，如果显存不够就减半，如果训练太慢就加倍并同步调整学习率（batch_size翻倍，学习率也可以适当翻倍，这叫线性缩放规则，Linear Scaling Rule）。但学习率不能无限增大，一般有上限。

### 超参数调优清单

怕浪猫把本节涉及的调优要点整理成一张清单，方便你实际操作时参考。这张表不是教条，而是起点。每个数据集、每个任务的最优超参数都不一样，需要实验来确定。但有一个原则不变：一次只调一个参数，这样才能判断哪个改动有效。

| 超参数 | 推荐范围 | MNIST建议值 | 调优策略 |
|-------|---------|-----------|---------|
| 学习率 | 1e-5 ~ 1e-1 | 1e-3 | 对数空间搜索，配合调度器 |
| batch_size | 16 ~ 512 | 64 | 根据显存调整，配合学习率 |
| epoch数 | 5 ~ 100 | 5-10 | 看训练曲线，用早停法 |
| 隐藏层大小 | 64 ~ 1024 | 128-256 | 先大后小，逐步精简 |
| Dropout率 | 0.1 ~ 0.5 | 0.2 | 过拟合时增大，欠拟合时减小 |
| weight_decay | 1e-5 ~ 1e-2 | 0 | 过拟合时开启 |

> 金句：调参不是玄学，是实验科学。改一个变量，看一个结果，下一个结论。

怕浪猫最后再强调一个容易忽略的点：随机种子。深度学习实验有很多随机性（数据打乱、权重初始化、Dropout丢弃），设置随机种子可以让结果可复现：

```python
import torch
import random
import numpy as np

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

set_seed(42)  # 每次实验前调用
```

虽然完全可复现在不同硬件、不同PyTorch版本上很难做到，但设置种子至少能让同一台机器上的多次实验结果一致，方便你对比不同参数的效果。

## 全章总结

这一章我们从零开始完成了一个完整的AI模型训练流程。从PyTorch的基础概念到数据加载，从模型构建到训练循环，从评估测试到保存部署，再到超参数调优。怕浪猫陪你走完了深度学习项目全链路的每一步。

回顾一下核心知识点：

**PyTorch基础**：动态图设计，Autograd自动微分，nn.Module模型定义范式。动态图让你像写Python一样写深度学习，Autograd自动处理反向传播，nn.Module提供了统一的模型定义框架。这些是后续所有章节的技术基石。

**数据加载**：torchvision加载数据集，DataLoader批量加载，transforms做数据预处理。数据是模型的输入，数据质量决定模型上限。记住核心原则：先看数据，再建模型。

**模型训练**：五步训练法——zero_grad、forward、loss、backward、step。这个模式会贯穿整个系列的每一章实战。不管模型多复杂，从MNIST的MLP到GPT的Transformer，核心训练循环都是这五步。

**模型评估与部署**：eval模式切换、no_grad关闭梯度、state_dict保存加载、FastAPI服务化。从训练到部署的最后一公里，预处理一致性是关键。

**参数调优**：学习率调度、epoch选择、batch_size影响、正则化策略。调优是把模型从"能用"推向"好用"的关键环节。一次只调一个参数，用数据说话。

```
全流程回顾：

数据加载 → 模型构建 → 训练循环 → 评估测试 → 保存部署 → 参数调优
  │           │          │          │          │          │
  ▼           ▼          ▼          ▼          ▼          ▼
MNIST      nn.Module   五步法     eval()    save()     学习率
DataLoader  forward    backward  no_grad   load()     batch_size
transforms  ReLU       loss      Accuracy  FastAPI    epoch
```

如果你完整跑通了本章的代码，恭喜你，你已经拥有了人生中第一个自己训练的AI模型。虽然它只是一个手写数字识别器，但流程和大模型训练是完全一致的。从GPT到BERT到Stable Diffusion，底层都是"数据加载-模型构建-训练循环-评估保存"这个框架，只是模型结构和数据规模天差地别而已。你掌握了这个框架，后面学习Transformer、微调大模型时就不会在工程流程上卡壳，可以把精力集中在模型原理和业务逻辑上。

> 金句：第一个模型的loss开始下降的那一刻，是你从"理解AI"到"创造AI"的转折点。记住这个感觉。

**如果这篇文章对你有帮助，点个收藏，以后写代码时翻出来对照着看。有疑问评论区直接问，怕浪猫会逐条回复。**

**这是"LLM大模型工程师入门实战"系列的第9章，系列共19章，持续更新中。关注我，跟着怕浪猫一步步走完大模型工程师的入行之路。**

**下章预告：第10章「数据爬取与清洗 — 模型的粮草先行」— 大模型时代数据就是弹药。从Scrapy爬虫框架到数据清洗管线，教你构建高质量的训练数据集。我们进入数据工程实战。**

系列进度 9/19

怕浪猫说：第一个模型诞生了，但这只是起点。真正的大模型世界，从下一章的数据工程才刚刚开始展开。我们第十章见。