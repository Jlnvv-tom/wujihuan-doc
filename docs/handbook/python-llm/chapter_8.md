# 掌握"炼丹术" — 优化深度学习训练参数

训练神经网络这件事，圈内人戏称"炼丹"。丹方（模型架构）一样，炉火（训练参数）不同，炼出来的丹药效果天差地别。同样的ResNet，有人训出来准确率99%，有人卡在80%上不去，差距往往不在模型，而在训练参数的调优上。

我是怕浪猫，一个在模型训练上踩过无数坑的工程师。这一章咱们聊聊深度学习训练中那些关键的"火候控制"。从向量化加速到正则化策略，从权重初始化到优化器选择，每一个知识点怕浪猫都会配上代码和原理解析。

先说个真实故事。去年带一个实习生做图像分类项目，他搭了个ResNet-18，训练了50个epoch，准确率死活上不去。我看了眼他的代码：学习率设成了0.1（太大了），权重用默认随机初始化（没匹配ReLU），batch_size设成了2（BN统计量全是噪声）。改了三个参数，5个epoch就超过了他之前50轮的成绩。这就是训练参数的力量。

这章是选看内容，但如果你想真正理解模型训练的底层逻辑，怕浪猫建议你耐心读完。后续章节涉及大模型微调时，这些概念会反复出现。

> 金句：调参不是玄学，是工程。每一个看似神秘的参数背后，都有清晰的数学逻辑。

## 8.1 向量化与矩阵化加速

### 从循环到向量化：为什么慢？

刚入门深度学习的时候，很多人写代码的方式是这样的——用for循环逐个处理数据。逻辑上没毛病，但性能上惨不忍睹。来看一段对比代码：

```python
import numpy as np
import time

# 生成两个100万的向量
a = np.random.rand(1_000_000)
b = np.random.rand(1_000_000)

# 循环版本
c = np.zeros_like(a)
start = time.time()
for i in range(len(a)):
    c[i] = a[i] + b[i]
print(f"循环耗时: {time.time() - start:.4f}s")

# 向量化版本
start = time.time()
c = a + b
print(f"向量化耗时: {time.time() - start:.6f}s")
```

在我机器上跑出来的结果是：循环版本约0.3秒，向量化版本约0.001秒。300倍的差距。而且这个差距会随着数据量增大而进一步拉大。

原因很简单：NumPy底层用C实现，并且调用了BLAS（Basic Linear Algebra Subprograms，基本线性代数子程序）库做SIMD（Single Instruction Multiple Data，单指令多数据流）并行计算。for循环在Python解释器里逐条执行，每次迭代都有类型检查、引用计数和解释开销。向量化把一百万次Python层面的操作，压缩成了一次C层面的内存批量操作。

在深度学习训练中，这个差距会被放大。一个epoch可能有几万个batch，每个batch都有大量向量运算。如果你的代码里有Python层面的循环，训练时间可能从小时级膨胀到天级。

> 金句：在深度学习里，for循环是性能杀手。能用向量运算的地方，绝不用循环。

### 矩阵化：更进一步

向量化是把一维循环消掉，矩阵化则是把多维循环一起消掉。在神经网络的前向传播中，矩阵化尤为关键。来看一个全连接层的例子：

```python
import numpy as np

# 假设: batch_size=64, 输入维度=128, 输出维度=256
batch_size, in_dim, out_dim = 64, 128, 256
X = np.random.randn(batch_size, in_dim)
W = np.random.randn(in_dim, out_dim)
b = np.random.randn(out_dim)

# 循环版本(慢): 逐样本计算
Z_loop = np.zeros((batch_size, out_dim))
for i in range(batch_size):
    for j in range(out_dim):
        Z_loop[i, j] = np.dot(X[i], W[:, j]) + b[j]

# 矩阵化版本(快): 一次矩阵乘法
Z_mat = X @ W + b  # 广播机制自动加偏置

print(np.allclose(Z_loop, Z_mat))  # True, 结果一致
```

矩阵乘法 `X @ W` 一次性完成了所有样本与所有权重的计算。PyTorch中的 `torch.mm` 和 `torch.matmul` 也是同样的逻辑，底层调用cuBLAS（CUDA Basic Linear Algebra Subprograms）在GPU上做并行矩阵运算。

### NumPy广播机制加速

Broadcasting（广播）是NumPy中一个非常巧妙的设计，它允许不同形状的数组进行算术运算，而无需显式复制数据。在上面的例子中，`b` 的形状是 `(out_dim,)`，而 `X @ W` 的形状是 `(batch_size, out_dim)`。广播机制自动把 `b` 扩展为 `(batch_size, out_dim)`，对每一行都加上相同的偏置。

广播的核心规则：从右向左对齐维度，每个维度要么相同，要么其中一个为1，要么其中一个不存在。看几个例子：

```
形状 (4, 3) + (3,)       → (4, 3) + (1, 3) → (4, 3)
形状 (64, 128, 256) + (256,) → (64, 128, 256) + (1, 1, 256) → (64, 128, 256)
形状 (4, 3) + (4, 1)     → (4, 3) + (4, 1) → (4, 3)
形状 (4, 3) + (4,)       → 报错，无法广播
```

最后一个例子容易踩坑。`(4, 3)` 和 `(4,)` 无法直接广播，因为从右向左对齐时，最右边的维度3和4不匹配。需要手动reshape为 `(4, 1)` 才能正确广播。

### GPU并行计算

向量化消除了Python层面的循环，矩阵化消除了数学层面的循环，而GPU并行计算则是在硬件层面把矩阵运算拆到成百上千个核心上同时执行。

```
CPU: 4-16核心，每核强，适合串行逻辑
GPU: 数千核心，每核弱，适合并行计算

矩阵乘法 C = A @ B (A: m×k, B: k×n)
CPU: 串行计算每个元素 C[i][j]，共 m×n 次运算
GPU: 把 m×n 个元素的运算分配到数千核心并行执行
```

在PyTorch中，把数据搬到GPU只需要一行代码：

```python
import torch

# 创建 tensor 并移到 GPU
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
X = torch.randn(64, 128).to(device)
W = torch.randn(128, 256).to(device)

# 矩阵乘法在 GPU 上并行执行
Z = X @ W  # 自动在 GPU 上计算
```

实测对比：一个4096×4096的矩阵乘法，CPU约2秒，GPU（RTX 3090）约0.003秒，快了600多倍。这就是为什么深度学习离不开GPU——不是GPU更快，而是GPU能同时做更多事情。

实际训练中，GPU的利用率是怕浪猫非常关注的指标。用 `nvidia-smi` 可以看GPU使用率，如果发现利用率长期低于50%，通常说明数据加载跟不上GPU的计算速度，存在I/O瓶颈。解决方案是用 `num_workers` 多线程加载数据，或者把数据放到内存/SSD上减少读取延迟：

```python
# DataLoader 多线程加载
train_loader = DataLoader(
    dataset, batch_size=64, shuffle=True,
    num_workers=4,      # 4个进程并行加载
    pin_memory=True     # 锁页内存, 加速 CPU→GPU 传输
)
```

`pin_memory=True` 是一个经常被忽略的小技巧。普通内存的数据传到GPU需要先拷贝到锁页内存，开启pin_memory后数据直接在锁页内存中分配，省去了一次拷贝，在小batch场景下能提升10%~20%的数据加载速度。

> 金句：CPU像一个博士，能解复杂问题但一次只能做一个；GPU像一千个本科生，每人只会简单的乘加，但一千人同时算，速度碾压。

## 8.2 正则化

模型训练最常见的问题是什么？过拟合。训练集准确率99%，测试集准确率70%，模型把训练数据"背"下来了，但没有学到真正的规律。正则化就是给模型加约束，防止它过度记忆训练数据。

### L2正则化与权重衰减

L2正则化是最经典的正则化手段。思路很直接：在损失函数后面加一项惩罚项，让权重值不要太大。

```
原始损失: L = (1/N) * Σ (y_pred - y_true)²
L2正则化: L = (1/N) * Σ (y_pred - y_true)² + λ * Σ w²
```

其中 λ（lambda）是正则化系数，控制惩罚力度。λ越大，权重被压得越小；λ=0时等于没有正则化。

为什么惩罚大权重能防止过拟合？怕浪猫从两个角度解释。

从数学角度：大权重意味着模型函数的曲率更大，输入端的微小变化会被放大成输出端的剧烈波动。这种高曲率的函数能完美拟合训练数据中的每一个点（包括噪声），但在没见过的新数据上表现很差。

从贝叶斯角度：L2正则化等价于给权重施加了一个均值为0、方差为1/λ的高斯先验。λ越大，先验越强，权重越被拉向0。这相当于告诉模型"在没有充分证据的情况下，权重应该接近0"，这是一种Occam's Razor（奥卡姆剃刀）思想的体现——优先选择更简单的模型。

实际使用中，λ的取值通常在0.001到0.1之间。太大会导致欠拟合（权重被压得太小，模型学不到特征），太小等于没加正则化。怕浪猫的一般做法是先设0.01，看训练集和验证集的loss差距，差距大就增大，差距小就减小。

权重衰减（Weight Decay）是L2正则化在梯度下降中的等价实现。L2正则化在损失函数加惩罚项，数学上等价于在每次更新权重时乘以一个小于1的系数：

```
普通更新: w = w - lr * grad
权重衰减: w = w - lr * grad - lr * wd * w
         = w * (1 - lr * wd) - lr * grad
```

在PyTorch中，SGD优化器的 `weight_decay` 参数就是权重衰减：

```python
import torch.optim as optim

# weight_decay=0.01 等价于 L2 正则化系数
optimizer = optim.SGD(model.parameters(), lr=0.01, weight_decay=0.01)
```

但要注意，Adam优化器中的weight_decay实现和历史有所不同。原版Adam把weight_decay混在梯度里一起算，AdamW则把权重衰减与梯度更新解耦，效果更好。PyTorch中 `optim.AdamW` 是解耦实现，推荐使用。

### L1 vs L2对比

L1正则化加的惩罚项是权重的绝对值之和：`λ * Σ |w|`。两者效果有明显差异：

```
L1正则化: 损失 += λ * Σ |w|
  - 倾向产生稀疏权重（很多权重变成精确的0）
  - 可用于特征选择
  - 梯度为 ±λ，与权重大小无关

L2正则化: 损失 += λ * Σ w²
  - 倾向产生小而均匀的权重
  - 不会产生精确的0
  - 梯度为 2λw，权重越大惩罚越大
```

用一个直观的比喻：L1正则化像是一个严厉的老板，直接把没用的员工（权重）开除（变0）；L2正则化像是一个温和的老板，把所有人的工资都降一降，但不裁员。如果你需要模型有稀疏性（比如做特征选择），用L1；如果只是想防止过拟合，L2更常用。

为什么L1能产生稀疏解？从几何角度看，L1正则化的约束区域是一个菱形（diamond），L2的约束区域是一个圆。优化函数的等高线与菱形相切时，切点更可能落在坐标轴上（即某些权重精确为0），而与圆相切时切点落在任意位置的概率均等。

在深度学习中，L2远比L1常用。原因是L2正则化的梯度处处可导，优化过程更平滑；L1在0点处不可导，需要用次梯度处理，数值上不太方便。另外，L1的梯度大小恒为λ（与权重大小无关），这意味着即使权重已经很小了，L1的惩罚力度不减，容易把有用的小权重也压没了。

在深度学习中，L2远比L1常用。原因是L2正则化的梯度处处可导，优化过程更平滑；L1在0点处不可导，需要用次梯度处理，数值上不太方便。

### Dropout随机失活

Dropout是深度学习中最独特的正则化手段之一。训练时随机把一部分神经元的输出置为0，推理时全部启用。乍一看很反直觉——训练时故意"搞坏"模型，怎么能提升效果？

核心思想是 ensemble（集成学习）。假设一个网络有N个神经元，Dropout率为0.5，那么每次训练的子网络是2^N种可能组合中的一个。最终推理时，全部神经元启用，相当于对所有可能的子网络做了平均。一个有256个神经元的全连接层，Dropout后理论上等价于对2^256个子网络做集成，这个数量比宇宙中的原子还多。

另外，Dropout迫使每个神经元不能过度依赖某些特定输入，因为那些输入随时可能被丢弃。这迫使每个神经元必须学到更鲁棒、更独立的特征，而不是依赖其他神经元来"补位"。这种特性在深度网络中尤其重要，因为深层网络更容易出现神经元之间的co-adaptation（协同适应）问题。

Dropout的p值选择有讲究。全连接层通常用0.3到0.5，输入层一般用0.2（不能丢太多输入信息），卷积层通常不用Dropout（因为卷积层参数本来就少，丢掉太多会影响特征提取）。在Transformer中，Dropout一般用在attention权重和FFN（Feed-Forward Network，前馈网络）输出上，p值通常设为0.1。

> 金句：Dropout像是一场军训，每个神经元都随时可能被叫出来单独执行任务，所以平时训练时每个神经元都必须独立作战，不能依赖队友。

```python
import torch.nn as nn

class MyModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(128, 256)
        self.dropout = nn.Dropout(p=0.5)
        self.fc2 = nn.Linear(256, 10)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = self.dropout(x)  # 训练时50%概率置零
        x = self.fc2(x)
        return x
```

### 训练vs推理模式

Dropout引出一个关键概念：模型在训练和推理时的行为不同。这也是新手最容易踩的坑之一。

```python
model.train()  # 启用 Dropout, BatchNorm 使用 batch 统计量
model.eval()   # 关闭 Dropout, BatchNorm 使用运行时统计量
```

如果推理时忘了调用 `model.eval()`，Dropout还在随机置零，每次推理结果都不一样，你可能会怀疑模型有bug。实际上是你忘了切换模式。怕浪猫在code review中见过无数次这个问题，症状是"同一个输入跑两次结果不同"，排查半天发现就是少了个eval()。

更隐蔽的坑：如果你在训练循环中做了验证，验证前忘了eval()，验证完忘了train()，会导致验证准确率偏低（因为Dropout还在工作），然后训练模式可能也被意外改变了。正确的做法是：

```python
for epoch in range(epochs):
    model.train()
    for batch in train_loader:
        train_step(model, batch)
    
    model.eval()  # 切换到推理模式
    with torch.no_grad():
        for batch in val_loader:
            val_step(model, batch)
    # 下一个epoch开头会重新 model.train()
```

这个模式要形成肌肉记忆。每次写验证代码，第一行就是model.eval()，外面套torch.no_grad()，不会出错。

同样，`torch.no_grad()` 和 `model.eval()` 是两件事，不要混淆：

- `model.eval()`：改变模型行为（关闭Dropout、BatchNorm切换到推理模式）
- `torch.no_grad()`：关闭梯度计算，节省内存和加速

推理时通常两个都要加：

```python
model.eval()
with torch.no_grad():
    output = model(input_tensor)
```

> 金句：训练用train()，推理用eval()。六个字符的差别，能省你三天debug时间。

### 正则化策略选择清单

| 策略 | 适用场景 | 关键参数 | 注意事项 |
|------|----------|----------|----------|
| L2/Weight Decay | 通用防过拟合 | weight_decay=0.01~0.1 | Adam用AdamW |
| L1正则化 | 需要稀疏/特征选择 | lambda=0.001~0.01 | 0点不可导 |
| Dropout | 全连接层防过拟合 | p=0.3~0.5 | 推理必须eval() |
| DropPath | 深层网络/Transformer | drop_prob=0.1~0.2 | 按路径丢弃 |
| Label Smoothing | 分类任务 | smoothing=0.1 | 防止过度自信 |

## 8.3 数据归一化与权重初始化

### 标准化与归一化

数据预处理中，归一化是必不可少的一步。不归一化的数据，特征之间量纲差异巨大（比如年龄0-100，收入0-1000000），会导致梯度方向被大量纲特征主导，模型难以收敛。

两种最常见的归一化方式：

```
标准化 (Standardization / Z-score Normalization):
  x' = (x - μ) / σ
  均值变为0，标准差变为1
  适合: 数据近似正态分布，有异常值时更鲁棒

归一化 (Normalization / Min-Max Scaling):
  x' = (x - x_min) / (x_max - x_min)
  缩放到 [0, 1] 区间
  适合: 数据分布不均匀，需要固定范围
```

在图像处理中，通常用标准化。比如ImageNet的统计量是均值 `[0.485, 0.456, 0.406]`，标准差 `[0.229, 0.224, 0.225]`（RGB三通道），所有预训练模型都期望输入做这个标准化。如果你不做这一步，直接把0-255的像素值喂给预训练模型，准确率可能掉10个点以上。这不是模型的问题，是你给的数据分布和模型期望的不匹配。

为什么是这三个奇怪的数字？它们是ImageNet数据集（包含128万张图片，1000个类别）上所有像素值在RGB三个通道上的均值和标准差。预训练模型在训练时用的就是做了这个标准化的数据，所以推理时也必须做同样的处理。

在图像任务中，除了像素级标准化，还有一种常用的技巧叫Batch Normalization，它在网络内部做归一化，这个后面会详细讲。

在NLP任务中，文本数据不能直接用标准化。文本经过Embedding层后变成向量，这些向量的分布和图像像素完全不同。通常用Layer Normalization（层归一化）来处理，它不依赖batch统计量，更适合变长序列。

```python
from torchvision import transforms

transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])
```

在NLP中，文本embedding的归一化通常用Layer Normalization（层归一化），这个后面会讲。

### 零初始化的问题

权重初始化是训练开始前最关键的一步。最直觉的想法是全部初始化为0，但这会导致一个致命问题：所有神经元的输出和梯度完全相同，网络相当于只有一个神经元，永远学不到有意义的特征。

这个问题的根源在于对称性。如果所有权重相同，在前向传播中所有神经元输出相同，在反向传播中所有梯度相同，更新后所有权重仍然相同。这叫"对称性问题"（Symmetry Problem）。

打个比方：一个篮球队5个人，如果所有球员的体能、技术、位置完全一样，教练就没有理由区别对待。同样地，如果所有神经元完全一样，梯度下降就没有理由让它们朝不同方向发展，它们会永远保持一致，整个隐藏层等价于一个神经元。

对称性问题的本质是信息论层面的：相同的权重意味着神经元之间没有差异化的信息。随机初始化通过给每个神经元不同的起始值，打破了这种对称性，让不同神经元有机会学到不同的特征。

但随机初始化也不是随便给个随机数就行。随机分布的选择直接影响训练的成败，这就是Xavier和He初始化要解决的问题。

```python
# 错误示范: 全零初始化
model = nn.Linear(128, 256)
nn.init.zeros_(model.weight)  # 所有神经元等价, 无法学习
nn.init.zeros_(model.bias)

# 好一点但仍然不好: 常数初始化
nn.init.constant_(model.weight, 0.1)  # 仍有对称性问题
```

### 随机初始化/Xavier/He初始化

打破对称性的方法是随机初始化。但随机初始化也有讲究：太小会导致信号逐层衰减到消失，太大会导致信号逐层放大到爆炸。好的初始化应该让每一层的输出方差与输入方差大致相等。

**Xavier初始化（Glorot初始化）**

适用于激活函数为tanh或sigmoid的网络。核心思想是让每一层的方差保持一致：

```
Xavier均匀分布: W ~ U(-√(6/(fan_in+fan_out)), √(6/(fan_in+fan_out)))
Xavier正态分布: W ~ N(0, √(2/(fan_in+fan_out)))
```

其中 `fan_in` 是输入维度，`fan_out` 是输出维度。这个推导基于一个假设：激活函数在0附近近似线性。tanh和sigmoid在0附近确实近似线性，所以Xavier配合它们效果很好。

**He初始化（Kaiming初始化）**

适用于ReLU（Rectified Linear Unit，修正线性单元）激活函数的网络。ReLU会把负值截断为0，相当于丢掉一半的信号，所以方差需要放大一倍来补偿：

```
He正态分布: W ~ N(0, √(2/fan_in))
He均匀分布: W ~ U(-√(6/fan_in), √(6/fan_in))
```

```python
import torch.nn as nn

# He 初始化 (适合 ReLU)
layer = nn.Linear(128, 256)
nn.init.kaiming_normal_(layer.weight, mode='fan_in', nonlinearity='relu')
nn.init.zeros_(layer.bias)

# Xavier 初始化 (适合 tanh/sigmoid)
layer2 = nn.Linear(128, 256)
nn.init.xavier_normal_(layer.weight)
nn.init.zeros_(layer.bias)
```

为什么初始化这么重要？用一个实际案例说明：我在一个CNN（Convolutional Neural Network，卷积神经网络）项目中，用默认初始化训练20个epoch准确率才到85%，换成He初始化后，5个epoch就到88%，最终收敛到93%。初始化直接影响梯度传播的质量，进而影响收敛速度和最终效果。

> 金句：好的初始化让模型站在起跑线上，坏的初始化让模型蹲在起跑线后面。

### 初始化方法对比

| 初始化方法 | 适用激活函数 | 公式(正态分布) | 特点 |
|-----------|-------------|---------------|------|
| 零初始化 | 不适用 | W=0 | 对称性问题，不可用 |
| 随机(默认) | 通用 | W~N(0,1) | 可能梯度消失/爆炸 |
| Xavier | tanh/sigmoid | N(0, √(2/(fan_in+fan_out))) | 保持方差一致 |
| He | ReLU/LeakyReLU | N(0, √(2/fan_in)) | 补偿ReLU截断 |

## 8.4 梯度下降变体

梯度下降是深度学习优化的基石。但"怎么喂数据"这个问题，催生了三种不同的变体。理解它们的差异，才能选对batch_size。

### 全批量梯度下降

全批量梯度下降（Batch Gradient Descent，BGD）每次迭代使用全部训练数据计算梯度：

```python
# 伪代码: 全批量梯度下降
for epoch in range(epochs):
    grad = compute_gradient(loss_fn, X_all, y_all)
    optimizer.step(grad)
```

优点：梯度方向准确，收敛稳定，loss曲线平滑。缺点也很明显：每次迭代要跑完全部数据，一个epoch只有一次更新。数据量大的时候，一个epoch可能要几十分钟，更新太慢。而且全量数据可能放不进GPU显存。

举个具体例子：ImageNet有128万张图片，如果batch_size=128万（全批量），一张A100（80GB显存）根本放不下。即使能放下，一个epoch只更新一次参数，可能需要几万epoch才能收敛。相比之下，用batch_size=256，一个epoch能更新5000次，收敛速度快得多。

但全批量也不是没有用武之地。在传统机器学习（如逻辑回归、SVM）中，全批量配合精确的线搜索（Line Search）是最优策略。只是在深度学习中，数据量和模型规模让全批量变得不切实际。

### SGD随机梯度下降

随机梯度下降（Stochastic Gradient Descent，SGD）每次只取一个样本计算梯度：

```python
# 伪代码: SGD
for epoch in range(epochs):
    for i in range(len(X_all)):
        grad = compute_gradient(loss_fn, X_all[i], y_all[i])
        optimizer.step(grad)
```

优点：更新频率高，每个样本都触发一次更新。缺点：梯度噪声极大，单个样本的梯度可能完全不代表整体方向，导致loss剧烈震荡。虽然最终能收敛到不错的地方，但收敛路径非常曲折。

而且现代GPU擅长并行计算，每次只处理一个样本是对算力的极大浪费。GPU吞吐量的峰值通常在batch_size=32~256之间。

不过SGD的"噪声"并非全是坏事。研究表明，SGD的梯度噪声实际上起到了正则化的作用，帮助模型跳出局部最优解，找到泛化更好的极小值。这也是为什么SGD训练的模型有时比Adam训练的泛化更好——噪声成了免费的正则化。

实际工程中，纯SGD（batch_size=1）几乎没人用。但理解SGD的行为很重要，因为Mini-batch中batch_size越小，行为越接近SGD，梯度噪声越大，泛化可能越好但收敛越慢。

### Mini-batch小批量梯度下降

Mini-batch Gradient Descent是前两者的折中方案，也是实际中最常用的方式。每次取一小批样本（batch_size通常32~256）计算梯度：

```python
# 伪代码: Mini-batch
for epoch in range(epochs):
    for X_batch, y_batch in dataloader:  # batch_size=64
        grad = compute_gradient(loss_fn, X_batch, y_batch)
        optimizer.step(grad)
```

```python
# PyTorch 实现
from torch.utils.data import DataLoader

dataloader = DataLoader(
    dataset,
    batch_size=64,
    shuffle=True,    # 打乱数据
    drop_last=False  # 不丢弃最后不完整的 batch
)
```

Mini-batch结合了BGD和SGD的优点：梯度比SGD稳定得多，又比BGD更新频率高得多。而且batch_size可控，能充分利用GPU并行能力。

### batch_size选择策略

batch_size怎么选？这是深度学习中最经典的"超参数"之一。怕浪猫给你一份实战经验：

```
batch_size 选择参考:

GPU显存 <= 8GB:   batch_size = 16~32
GPU显存 12-24GB:  batch_size = 32~128
GPU显存 >= 40GB:  batch_size = 128~512

通用建议:
- 分类任务: 32~256
- NLP微调: 8~32 (序列长, 显存消耗大)
- 大模型预训练: 1M+ tokens (用梯度累积)
- 学习率与batch_size正相关: batch翻倍, lr可翻倍
```

batch_size和学习率的关系很重要。线性缩放规则（Linear Scaling Rule）指出：当batch_size扩大k倍时，学习率也可以扩大k倍。但这不是绝对的，batch_size很大时需要warmup（学习率预热）来避免训练不稳定。

梯度累积（Gradient Accumulation）是在显存不够时模拟大batch_size的技巧：

```python
# 梯度累积: 等价于 batch_size=64, 实际只用 batch_size=8
accumulation_steps = 8
optimizer.zero_grad()

for i, (X_batch, y_batch) in enumerate(dataloader):
    loss = loss_fn(model(X_batch), y_batch)
    loss = loss / accumulation_steps  # 缩放loss
    loss.backward()                   # 累积梯度

    if (i + 1) % accumulation_steps == 0:
        optimizer.step()              # 真正更新
        optimizer.zero_grad()         # 清空梯度
```

这个技巧在微调大模型时非常实用。显存只够跑batch_size=2，但用梯度累积8步，等效batch_size=16，效果接近。

> 金句：batch_size不是越大越好。大批次训练快但泛化差，小批次训练慢但泛化好，工程就是在这两端之间找平衡。

## 8.5 调优与归一化

### 学习率衰减

学习率是训练中最重要的超参数，没有之一。固定的学习率很难同时满足训练前期（需要大步子快速收敛）和后期（需要小步子精细调整）的需求。学习率衰减策略就是解决这个问题的。

**Step Decay（阶跃衰减）**

每隔固定epoch把学习率乘以一个衰减因子：

```python
from torch.optim.lr_scheduler import StepLR

# 每10个epoch, 学习率乘以0.5
scheduler = StepLR(optimizer, step_size=10, gamma=0.5)

for epoch in range(30):
    train(model, dataloader, optimizer)
    scheduler.step()  # 每个epoch结束后调用
    print(f"Epoch {epoch}, lr={scheduler.get_last_lr()[0]:.6f}")
```

**Exponential Decay（指数衰减）**

每个epoch都衰减，衰减更平滑：

```python
from torch.optim.lr_scheduler import ExponentialLR

# 每个epoch学习率乘以0.95
scheduler = ExponentialLR(optimizer, gamma=0.95)
```

**Cosine Annealing（余弦退火）**

学习率按余弦曲线从最大值衰减到最小值，前期衰减慢、中期快、后期又慢。这是目前大模型训练中最常用的策略：

```
学习率变化曲线 (Cosine Annealing):

lr_max ─┐\
        │  \
        │   \
        │    \
        │     \
lr_min  └─────└────────
        0    epoch/2   epoch
```

```python
from torch.optim.lr_scheduler import CosineAnnealingLR

# T_max=总epoch数, eta_min=最小学习率
scheduler = CosineAnnealingLR(optimizer, T_max=30, eta_min=1e-6)
```

实际训练中，Cosine策略通常配合warmup使用：前几个epoch线性增长到max_lr，然后按余弦衰减。这就是大名鼎鼎的Warmup + Cosine Decay策略：

```python
from torch.optim.lr_scheduler import LambdaLR
import math

def warmup_cosine_schedule(step, warmup_steps, total_steps):
    if step < warmup_steps:
        return step / warmup_steps  # 线性warmup
    progress = (step - warmup_steps) / (total_steps - warmup_steps)
    return 0.5 * (1 + math.cos(math.pi * progress))  # 余弦衰减

scheduler = LambdaLR(optimizer, lr_lambda=lambda step: 
    warmup_cosine_schedule(step, warmup_steps=100, total_steps=1000))
```

这个调度器几乎是所有大模型预训练的标准配置。BERT、GPT系列、LLaMA都用类似的策略。

### 动量Momentum

梯度下降的路径如果是个"峡谷"地形——一个方向陡峭、一个方向平缓，普通SGD会在陡峭方向上来回震荡，在平缓方向上进展缓慢。动量（Momentum）的引入就像给梯度加上了"惯性"，让震荡方向因为反复抵消而减弱，让一致方向因为累积而加速。

```
普通SGD:   w = w - lr * grad
Momentum:  v = β * v + grad
           w = w - lr * v
```

其中 v 是速度（历史梯度的指数加权平均），β 是动量系数（通常0.9）。动量项让梯度更新有了"记忆"，不会因为某一次的异常梯度就大幅改变方向。

用物理直觉来理解：普通SGD像一个在山坡上滚下来的小球，每一步只看当前坡度。Momentum像一个小球带上了惯性，即使当前坡度变了，之前的速度还会推着它继续走一段。在"峡谷"地形中，横跨峡谷方向的梯度来回正负交替，动量的累积效果是正负抵消，震荡被抑制；而沿峡谷方向梯度始终同号，动量不断累积，前进加速。

β值的含义是"记忆窗口"的大小。β=0.9相当于对最近10步梯度的加权平均（有效窗口约为1/(1-β)=10步），β=0.99则是对最近100步。β越大，惯性越强，平滑效果越好，但响应新梯度的速度也越慢。

```python
import torch.optim as optim

# SGD + Momentum
optimizer = optim.SGD(model.parameters(), lr=0.01, momentum=0.9)

# 等价的手动实现 (帮助理解)
v = 0
beta = 0.9
for grad in gradients:
    v = beta * v + grad
    w = w - lr * v
```

### Adam优化器

Adam（Adaptive Moment Estimation，自适应矩估计）是目前最常用的优化器，结合了Momentum和RMSProp（Root Mean Square Propagation，均方根传播）的思想。它为每个参数维护一阶矩（梯度的指数移动平均，类似动量）和二阶矩（梯度平方的指数移动平均，用来自适应调节每个参数的学习率）。

```
一阶矩: m = β1 * m + (1-β1) * grad      (梯度的动量)
二阶矩: v = β2 * v + (1-β2) * grad²     (梯度平方的动量)
偏差校正: m_hat = m / (1 - β1^t)
         v_hat = v / (1 - β2^t)
更新:    w = w - lr * m_hat / (√v_hat + ε)
```

分母中的 `√v_hat` 是关键：梯度大的参数学习率自动减小，梯度小的参数学习率自动增大。这就像每个参数有了自己的"专属学习率"。

举个具体场景：Embedding层中，某些高频词的梯度很大（几乎每个batch都更新），而某些低频词的梯度很小（几十个batch才更新一次）。用统一学习率的话，高频词学得太快、低频词学得太慢。Adam自动给高频词小学习率、低频词大学习率，两者进度更均衡。

偏差校正（bias correction）是Adam中容易被忽略的细节。训练初期，m和v都从0开始，前几步的估计值严重偏小。除以(1-β^t)后，把这个偏差补偿回来。随着t增大，β^t趋近于0，校正因子趋近于1，影响消失。没有偏差校正，Adam在训练前几个step的表现会很差。

```python
import torch.optim as optim

# Adam 标准配置
optimizer = optim.Adam(model.parameters(), lr=1e-3, betas=(0.9, 0.999), eps=1e-8)

# AdamW (解耦权重衰减, 推荐用于 Transformer)
optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=0.01)
```

优化器选择的经验：

| 优化器 | 适用场景 | 优点 | 缺点 |
|--------|----------|------|------|
| SGD+Momentum | CV任务(图像分类/检测) | 泛化好 | 收敛慢, 调参难 |
| Adam | NLP/RAG/通用 | 收敛快, 调参容易 | 泛化可能略差 |
| AdamW | Transformer/大模型 | Adam+权重衰减 | 比Adam多一个参数 |

怕浪猫的实际经验：CV任务优先试SGD+Momentum，NLP任务直接上AdamW，不确定就用Adam。不要在优化器选择上花太多时间，把精力放在数据和模型上更值得。

> 金句：优化器是方向盘，数据是发动机。方向盘调得再好，发动机不行也跑不快。

### BatchNormalization原理

Batch Normalization（批归一化，BN）是深度学习训练中最重要的技巧之一。核心思想非常简单：在每个层的输出上做归一化，让数据分布稳定在均值0、方差1附近，然后再用可学习的参数做缩放和平移。

```
BN 计算流程:
1. 计算 batch 内均值: μ = (1/m) * Σ x_i
2. 计算 batch 内方差: σ² = (1/m) * Σ (x_i - μ)²
3. 标准化: x_hat = (x_i - μ) / √(σ² + ε)
4. 缩放平移: y = γ * x_hat + β   (γ, β 可学习)
```

为什么BN有效？学术界至今还有争论。原始论文给出的解释是：核心原因是它稳定了每一层输入的分布。深度网络中，每一层的参数更新都会改变后面所有层的输入分布，这叫"Internal Covariate Shift"（内部协变量偏移）。BN通过强制归一化每一层的输出，使得后续层不需要不断适应变化的输入分布，训练更稳定，可以使用更大的学习率。

但后来的研究（Santurkar et al., 2018）指出，BN有效的真正原因可能不是减少Internal Covariate Shift，而是平滑了loss landscape（损失函数地形）。BN使得loss对参数的梯度更加平滑（Lipschitz常数更小），梯度更可靠，可以使用更大的学习率，从而加速训练。

不管理论争论如何，BN在实践中的效果是确凿的。加上BN后，网络可以用更大的学习率、更少的epoch收敛，而且对初始化更鲁棒。在ResNet等深层网络中，BN几乎是必需品——没有BN的ResNet很难训练超过20层。

> 金句：BN就像高速公路上的护栏，它不改变路的方向，但让你敢于开得更快。

```python
import torch.nn as nn

class ConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.conv = nn.Conv2d(in_ch, out_ch, 3, padding=1)
        self.bn = nn.BatchNorm2d(out_ch)
        self.relu = nn.ReLU()

    def forward(self, x):
        return self.relu(self.bn(self.conv(x)))
```

### BN的训练与推理行为差异

BN有一个容易踩坑的地方：训练和推理的行为完全不同。

训练时：使用当前batch的均值和方差做归一化，同时用指数移动平均更新一组"运行时统计量"（running mean和running var）。

推理时：不计算batch统计量，而是用训练时积累的运行时统计量做归一化。

```python
# BN内部维护的状态
batch_norm = nn.BatchNorm2d(64)
print(batch_norm.running_mean.shape)  # torch.Size([64])
print(batch_norm.running_var.shape)   # torch.Size([64])
print(batch_norm.weight.shape)        # torch.Size([64]) - gamma
print(batch_norm.bias.shape)          # torch.Size([64]) - beta
```

如果推理时batch_size=1，而你没有调用 `model.eval()`，BN会用单个样本的均值和方差做归一化——均值就是自己，方差约等于0，归一化后的值会变成全是0或极端值，模型输出完全不可用。这是新手最常见的"推理结果全是乱的"的原因之一。

另一个坑：如果训练时batch_size太小（比如2），BN的batch统计量噪声很大，训练可能不稳定。batch_size小于8时，BN效果往往不理想，这时考虑用GroupNorm或LayerNorm替代。

### BN与LayerNorm对比

Layer Normalization（层归一化，LN）是BN的"兄弟"。区别在于归一化的维度不同：

```
输入形状: (batch_size, feature_dim)

BatchNorm: 沿 batch 维度归一化
  → 每个 feature 跨所有样本计算均值/方差
  → 依赖 batch_size, batch 太小不稳定

LayerNorm: 沿 feature 维度归一化
  → 每个样本跨所有 feature 计算均值/方差
  → 不依赖 batch_size, batch=1 也能用
```

用一个图来理解：

```
数据矩阵 (batch=4, feature=6):

       f0  f1  f2  f3  f4  f5
b0  [  a   b   c   d   e   f  ]
b1  [  g   h   i   j   k   l  ]   BatchNorm: 沿列方向计算 (每列6个值的统计量)
b2  [  m   n   o   p   q   r  ]   LayerNorm: 沿行方向计算 (每行4个值的统计量)
b3  [  s   t   u   v   w   x  ]
```

选择原则：

- CV任务（图像）：用BatchNorm。图像数据batch间统计量稳定，BN效果好。图像的通道维度有明确的物理含义（RGB），沿batch维度归一化是合理的。
- NLP任务（文本）：用LayerNorm。序列长度可变，batch统计量不稳定，LN对batch_size不敏感。文本的feature维度是embedding维度，沿这个维度归一化能保持语义信息。
- Transformer：用LayerNorm。这是Transformer架构的标准配置。原始论文中每个子层后面都跟一个LayerNorm。后来的Pre-LN（先做LN再进子层）变体比Post-LN训练更稳定，成了现代大模型的默认选择。
- batch_size很小的场景：用LayerNorm或GroupNorm。GroupNorm是BN和LN的折中，把通道分成几组，每组内部做归一化。在目标检测、语义分割等batch_size=1或2的任务中，GroupNorm是首选。

还有一个容易混淆的点：LayerNorm在NLP中的具体位置。在Transformer中，LN的输入形状是(batch_size, seq_len, hidden_dim)，LN沿hidden_dim维度归一化。也就是说，每个token位置的hidden向量独立做归一化。这保证了不同长度的序列、不同位置的token都能得到一致的归一化处理。

```python
# Transformer 中的 LayerNorm
import torch.nn as nn

ln = nn.LayerNorm(768)  # hidden_dim=768
x = torch.randn(32, 128, 768)  # (batch, seq_len, hidden)
output = ln(x)  # 沿最后一维归一化
print(output.shape)  # (32, 128, 768), 形状不变
print(output.mean(dim=-1)[0, 0])  # ≈ 0
print(output.std(dim=-1)[0, 0])   # ≈ 1
```

```python
import torch.nn as nn

# CV 典型结构: Conv -> BN -> ReLU
conv_block = nn.Sequential(
    nn.Conv2d(3, 64, 3, padding=1),
    nn.BatchNorm2d(64),
    nn.ReLU()
)

# NLP 典型结构: Linear -> LN
class FeedForward(nn.Module):
    def __init__(self, dim, hidden):
        super().__init__()
        self.fc1 = nn.Linear(dim, hidden)
        self.ln = nn.LayerNorm(hidden)
        self.fc2 = nn.Linear(hidden, dim)

    def forward(self, x):
        return self.fc2(torch.relu(self.ln(self.fc1(x))))
```

> 金句：CV用BN，NLP用LN。这不是教条，而是数据特性决定的自然选择。

### 归一化方法对比

| 方法 | 归一化维度 | 依赖batch | 典型场景 | 推理行为 |
|------|-----------|-----------|----------|----------|
| BatchNorm | Batch维度 | 是 | CV/图像 | 用running统计量 |
| LayerNorm | Feature维度 | 否 | NLP/Transformer | 与训练一致 |
| InstanceNorm | 单样本空间维度 | 否 | 风格迁移 | 与训练一致 |
| GroupNorm | 通道分组 | 否 | 小batch CV | 与训练一致 |

### 训练参数调优清单

怕浪猫把自己在实际项目中常用的调优checklist分享出来，训练效果不理想时逐条排查：

| 检查项 | 常用值 | 异常表现 | 排查方向 |
|--------|--------|----------|----------|
| 学习率 | 1e-4~1e-3 | loss不降/爆炸 | 减小10倍试 |
| batch_size | 32~128 | BN不稳定 | 增大或换LN |
| weight_decay | 0.01~0.1 | 过拟合/欠拟合 | 过拟合增大, 欠拟合减小 |
| dropout | 0.1~0.5 | 过拟合/欠拟合 | 同上 |
| 初始化 | He/Xavier | 收敛慢/梯度消失 | 检查激活函数匹配 |
| 学习率调度 | Cosine | 后期不收敛 | 检查warmup和衰减 |
| 梯度裁剪 | 1.0~5.0 | 梯度爆炸 | clip_grad_norm |
| 数据归一化 | 标准化 | loss震荡 | 检查mean/std |

```python
# 训练循环模板: 包含关键调优要素
def train_epoch(model, dataloader, optimizer, scheduler, device):
    model.train()
    total_loss = 0

    for X, y in dataloader:
        X, y = X.to(device), y.to(device)

        optimizer.zero_grad()
        output = model(X)
        loss = loss_fn(output, y)

        loss.backward()

        # 梯度裁剪: 防止梯度爆炸
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)

        optimizer.step()
        total_loss += loss.item()

    scheduler.step()  # 学习率调度
    return total_loss / len(dataloader)
```

这段模板涵盖了训练中最关键的几个要素：梯度清零、前向传播、损失计算、反向传播、梯度裁剪、参数更新、学习率调度。每一步都有其存在的理由，缺一不可。

梯度裁剪特别值得一提。在RNN（Recurrent Neural Network，循环神经网络）和Transformer训练中，梯度爆炸是常见问题。clip_grad_norm_的做法是：计算所有参数梯度的全局范数，如果超过max_norm就按比例缩放。这不会改变梯度方向，只缩放大小，是安全有效的防爆炸手段。

完整的训练流程还应该包含验证和checkpoint保存：

```python
import torch

def train_full(model, train_loader, val_loader, epochs, device):
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)
    best_val_loss = float('inf')

    for epoch in range(epochs):
        # 训练
        model.train()
        for batch in train_loader:
            loss = train_step(model, batch, optimizer)
        
        # 验证
        model.eval()
        val_loss = evaluate(model, val_loader, device)
        scheduler.step()

        # 保存最优模型
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), 'best_model.pt')
            print(f'Epoch {epoch}: 保存最优模型, val_loss={val_loss:.4f}')
```

这个模板包含了训练-验证-保存的完整闭环。在实际项目中，你可能还需要加TensorBoard日志、early stopping、多GPU同步等逻辑，但核心框架就是这个。

> 金句：炼丹没有秘方，只有checklist。遇到问题不要猜，逐条排查比什么都管用。

## 写在最后

这一章怕浪猫带你走完了深度学习训练参数优化的核心知识：向量化与矩阵化加速让训练从分钟级降到秒级，正则化策略（L2/Dropout）防止模型过拟合，权重初始化（He/Xavier）决定模型起跑线的位置，梯度下降变体和batch_size选择影响收敛速度和泛化能力，学习率调度和优化器选择是最后的精调手段，归一化（BN/LN）则是贯穿训练全过程的稳定剂。

这些知识点不是孤立的，它们互相影响、共同作用。学习率大了需要更多正则化，batch_size小了BN不稳定要换LN，初始化不好可能需要warmup来辅助。真正的调参高手不是记住每个参数的"最优值"，而是理解它们之间的关系，在具体场景中做trade-off。

**收藏引导**：这篇内容信息密度很高，建议先收藏。训练遇到问题时，对照"训练参数调优清单"逐条排查，比盲猜高效十倍。

**互动引导**：你在训练模型时踩过最大的坑是什么？学习率爆炸还是梯度消失？评论区聊聊你的炼丹血泪史。

**追更引导**：理论够多了，下一章怕浪猫带你进入实战——用PyTorch从零实现手写字识别，把前面学的所有知识用起来。代码量不大，但每一步都会讲透。点个关注，别掉队。

**系列进度 8/19**

怕浪猫说：参数调优的尽头不是穷举，而是理解。当你真正理解了每个参数背后的数学逻辑，调参就不再是玄学，而是工程。下一章，咱们代码见。
