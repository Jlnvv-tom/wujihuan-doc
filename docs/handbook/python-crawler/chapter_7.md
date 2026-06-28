# 第7章 逆向破解被加密的数据

你辛辛苦苦绕过了 IP 封禁、搞定了 Cookie 登录态、破解了 JS 加密参数，结果爬回来的数据全是乱码——"59834" 变成了 ""，价格数字变成了一堆方框。你盯着屏幕看了半天，怀疑自己是不是哪里编码搞错了。别怀疑了，你遇到的是字体加密反爬，爬虫界最隐蔽的数据保护手段之一。

我是怕浪猫，一个在爬虫坑里摸爬滚打多年的开发者。前面几章我们搞定了请求头反爬、代理池搭建、验证码识别、Cookie 管理和 JS 逆向，这一章我们要对付的是数据层面的加密——字体加密和 Base64 编码。这类反爬手段的特点是：请求成功了，状态码 200，数据也拿到了，但数据本身就是不对。这种"软反爬"比直接封你 IP 更让人崩溃，因为你的代码不会报错，你甚至可能跑了几千页都没发现数据是错的。

这一章我会从浏览器渲染流水线讲起，带你理解字体加密的底层原理，然后用实战代码演示如何解析字体文件、构建映射字典、还原真实数据。最后我们还会搞定 Base64 编码数据的解码，搭建一条完整的"分页抓取 + 字体解密"流水线。内容比较多，建议先收藏，遇到字体加密场景时直接照着做。

> 数据拿到了却用不了，这才是最高级的反爬——让你以为成功了，实际上拿到的全是垃圾数据。

## 7.1 字体渲染原理

### 浏览器渲染流水线

要理解字体加密，首先得搞清楚浏览器是怎么把 HTML 变成你看到的页面的。这个过程叫渲染流水线，分为几个关键阶段，每个阶段都有明确的输入和输出：

```
HTML 文档
    ↓
DOM 树（解析 HTML 标签结构）
    ↓
CSSOM 树（解析 CSS 样式规则）
    ↓
Render 树（DOM + CSSOM 合并，排除 display:none 等不可见元素）
    ↓
Layout 布局（计算每个节点的位置和大小）
    ↓
Paint 绘制（将渲染树转为像素画到屏幕上）
    ↓
Composite 合成（将各图层合成最终画面）
```

我们来逐个阶段拆解。DOM 树的构建是解析 HTML 标签，生成节点树。比如 `<div class="price">785</div>` 会被解析成一个 div 节点，class 为 price，文本内容为 "785"。CSSOM 树的构建是解析 CSS 规则，生成样式树。比如 `.price { font-family: 'custom-font'; }` 会被记录为"price 类的元素使用 custom-font 字体"。

Render 树是 DOM 树和 CSSOM 树的合并产物，它会排除掉 `display: none` 的节点——这些节点不会出现在最终的渲染结果中。Layout 阶段计算每个渲染节点在屏幕上的精确位置和大小。Paint 阶段是核心，浏览器在这里根据字体信息把文字画到屏幕上。

字体加密的关键就在 Paint 阶段。浏览器在绘制文字时，会根据 CSS 指定的字体族（font-family）找到对应的字体文件，然后把 Unicode 码点映射为字体文件中的字形（Glyph），最终绘制出来。

正常情况下，Unicode 码点和字形是一一对应的。比如 Unicode 码点 U+0031 对应数字 "1" 的字形，U+0034 对应数字 "4" 的字形。但字体加密做的事情就是——打乱这个映射关系。

举个具体的例子。某网站页面上显示价格是 "￥199"，你在 HTML 源码里看到的却是 "￥785"。这不是 Base64 编码，也不是 AES 加密，就是字体文件里把 U+0037（"7"）的字形换成了 "1" 的样子，把 U+0038（"8"）的字形换成了 "9" 的样子，把 U+0035（"5"）的字形换成了 "9" 的样子。

浏览器渲染时，按照 CSS 指定的自定义字体去查找字形，画出来的是 "199"。但你的爬虫拿到的是 HTML 源码里的 "785"，如果直接用源码字符，拿到的就是错误数据。而且这种错误非常隐蔽——你的程序不会报任何异常，数据看起来格式也正常，就是数值不对。如果你没有人工核对，可能跑了几万条数据都发现不了问题。

> 字体加密的精妙之处在于：它不拦截你的请求，不加密你的数据传输，它只是换了一张"密码表"，让你看到的源码和用户看到的页面不是一回事。

我第一次遇到字体加密是在爬某电商网站的价格数据时。当时爬虫跑得好好的，状态码 200，数据也解析出来了，结果运营同事反馈说价格全错了。我排查了一整天，最后用浏览器 F12 一看，发现页面显示的 "￥299" 在源码里是 "￥586"。那一瞬间我明白了——这不是常规的反爬，这是字体级别的加密。从那天起，怕浪猫就把字体加密列为爬虫工程师必须掌握的技能之一。

### @font-face 自定义字体加载

CSS 的 `@font-face` 规则是字体加密的核心载体。网站通过它声明一个自定义字体，然后在 font-family 中引用：

```css
@font-face {
    font-family: 'custom-font';
    src: url('https://example.com/fonts/custom.woff2') format('woff2');
}

.price {
    font-family: 'custom-font', sans-serif;
}
```

浏览器遇到这段 CSS 后，会下载 `custom.woff2` 字体文件，然后在渲染 `.price` 类的元素时使用这个字体。关键在于，这个字体文件内部的 Unicode 到字形映射是可以随意定义的。网站开发者只需要用字体编辑工具打开字体文件，把几个数字对应的字形互换一下位置，就实现了字体加密。

有些网站更狠，直接把字体文件 Base64 编码后内联在 CSS 里，避免爬虫通过抓包发现字体文件 URL：

```css
@font-face {
    font-family: 'custom-font';
    src: url(data:font/woff2;base64,d09GMgABAAAAAA...)
             format('woff2');
}
```

这样一来，你在网络请求列表里根本看不到字体文件的下载请求，因为它已经藏在 CSS 文件里了。不少爬虫工程师卡在这里——抓包看了半天找不到字体文件在哪，其实它就在 CSS 响应体的某个角落里。

我在实际项目中遇到过一种更极端的情况：网站每次请求返回的 CSS 里，内联的 Base64 字体都不一样，映射关系是动态变化的。这意味着你不能静态地拿到一个映射表就用，必须每次请求都重新解析。这个我们后面会详细讲怎么处理。

还有一种更隐蔽的做法：字体文件不是在 CSS 中声明的，而是通过 JavaScript 动态注入。页面加载后，JS 代码先请求字体文件，然后用 CSS Object Model API 动态创建 `@font-face` 规则。这种方式下，你在静态 HTML 中根本找不到字体引用，必须执行 JS 代码才能看到。

> @font-face 本身是 Web 字体的标准能力，用来做反爬属于"降维打击"——它不需要任何黑科技，只是把标准能力用在了让你难受的地方。

### 字符编码到字形映射机制

要理解字体加密的技术细节，需要先搞清楚字体文件内部是怎么组织的。一个字体文件的核心是几张表，每张表负责不同的功能：

```
字体文件内部结构
├── cmap 表：Unicode 码点 → Glyph ID 映射
├── glyf 表：每个 Glyph ID 对应的字形轮廓数据
├── head 表：字体元信息（版本、创建时间等）
├── hmtx 表：每个字形的水平度量（宽度、左侧间距）
├── loca 表：Glyph ID → glyf 表中的偏移量
├── maxp 表：字体最大属性（字形数量等）
├── name 表：字体名称等元数据
└── post 表：PostScript 名称映射
```

其中最关键的是 `cmap` 表，它记录了 Unicode 码点到 Glyph ID 的映射。这个表就是字体加密的"密码本"。我们来看一下正常字体和加密字体的 cmap 映射对比：

```
正常字体 cmap 映射：
Unicode U+0031 ("1") → Glyph ID 10 → 字形：1
Unicode U+0032 ("2") → Glyph ID 11 → 字形：2
Unicode U+0033 ("3") → Glyph ID 12 → 字形：3

加密字体 cmap 映射：
Unicode U+0031 ("1") → Glyph ID 12 → 字形：3
Unicode U+0032 ("2") → Glyph ID 10 → 字形：1
Unicode U+0033 ("3") → Glyph ID 11 → 字形：2
```

看到了吗？加密字体做的事情就是打乱 cmap 表里的映射关系。Glyph ID 和它对应的字形轮廓数据（在 glyf 表中）是不变的，变的是哪个 Unicode 码点指向哪个 Glyph ID。

这意味着，即使你在源码里看到的是 "1"（U+0031），浏览器用加密字体渲染出来的可能是 "3" 的字形，因为加密字体的 cmap 把 U+0031 指向了原来 "3" 对应的 Glyph ID。

理解了这个机制，破解思路也就清晰了：只要我们解析字体文件的 cmap 表，搞清楚每个 Unicode 码点实际对应的字形是什么，就能还原真实数据。具体来说有两种方法。

第一种是"字形比对法"。每个字形在 glyf 表中存储的是一系列坐标点，这些坐标点定义了字形的轮廓形状。我们把这些坐标点提取出来，和一个已知正确的标准字体（比如系统自带的 Arial）做比对。如果加密字体中 Glyph ID 12 的坐标点和标准字体中 "3" 的坐标点一致，那我们就知道 Glyph ID 12 代表的是 "3"。再通过 cmap 表知道 U+0031 指向 Glyph ID 12，就能得出结论：在这个加密字体中，源码里的 "1" 实际上代表 "3"。

第二种是"坐标哈希法"，是对第一种方法的优化。把每个字形的坐标点做成一个哈希值，和标准字体的哈希值比对，哈希相同就是同一个字符。这种方法更高效，适合自动化批量处理。后面我们会详细实现。

> 字体加密的底层其实就是一张"换字表"——它换了 Unicode 和字形之间的对应关系。破解的本质就是把这张表找出来，再换回去。

## 7.2 字体文件检查与查看

### 字体文件格式

字体文件有好几种格式，爬虫中最常遇到的是这几种：

```
┌──────────┬──────────────────────────┬─────────────────────────┐
│  格式    │  说明                    │  爬虫出现频率           │
├──────────┼──────────────────────────┼─────────────────────────┤
│  WOFF2   │  Web Open Font Format 2  │  最高（现代网站首选）   │
│  WOFF    │  Web Open Font Format 1  │  高（兼容性考虑）       │
│  TTF     │  TrueType Font           │  中（老网站或内联）     │
│  OTF     │  OpenType Font           │  低（较少见）           │
│  EOT     │  Embedded OpenType       │  极低（IE 时代产物）    │
└──────────┴──────────────────────────┴─────────────────────────┘
```

WOFF 和 WOFF2 本质上是 TTF/OTF 的压缩版本，加了一些元数据头。WOFF2 使用 Brotli 压缩算法，压缩率比 WOFF 高得多，是现在主流网站的首选。不过对于爬虫来说，无论哪种格式，最终都需要转成 TTF 来解析，因为 Python 的字体解析库（如 fontTools）对 TTF 支持最好。

在实际项目中，我建议你统一把 WOFF2 和 WOFF 转成 TTF 再处理。fontTools 库本身支持直接读取 WOFF 和 WOFF2，但转换成 TTF 后操作更方便，也不容易踩坑。特别是当你需要用 FontForge 等可视化工具查看字体时，TTF 格式的兼容性最好。

还有一点需要注意：有些网站会在响应头中设置 `Content-Type: application/octet-stream` 而不是正确的字体 MIME 类型。这会导致你用抓包工具查看时不容易发现字体文件。我的做法是：在抓包时按文件大小过滤——字体文件通常在 10KB 到 200KB 之间，按这个范围筛选可以快速定位。

> 格式不重要，映射关系才重要。不管是 WOFF2 还是 TTF，里面的 cmap 表结构是一样的，只是外层压缩方式不同。

### 字体编辑工具

分析字体文件，有两类工具可以用。一类是可视化编辑工具，适合手动查看和分析；另一类是编程库，适合自动化处理。

可视化工具首推 FontForge，它是开源的、跨平台的，功能强大且免费。你可以用它打开字体文件，直观地看到每个 Unicode 码点对应的字形长什么样。打开 FontForge 后，你会看到一个网格界面，每个格子代表一个字形。点击某个格子可以看到字形的轮廓，通过"编码"菜单可以查看这个字形对应的 Unicode 码点。如果发现 U+0031 对应的字形不是 "1" 而是 "3"，那就说明这个字体做了加密处理。

FontCreator 是另一个选择，Windows 平台的商用软件，界面更友好但要付费。如果你只是偶尔需要查看字体，FontForge 完全够用。

不过实际爬虫工作中，我们很少用可视化工具，因为字体映射可能是动态变化的，每次请求都不一样，手动看根本来不及。我们需要的是编程方式自动化解析。Python 生态中最好用的字体解析库是 fontTools，安装也很简单：

```bash
pip install fonttools
```

fontTools 可以读取、修改、转换字体文件，支持 TTF、OTF、WOFF、WOFF2 等所有主流格式。它是纯 Python 实现的，跨平台运行，而且文档非常完善，官方文档地址在 https://fonttools.readthedocs.io/。后面我们的代码示例都会基于这个库来写。

除了 fontTools，还有一个辅助工具叫 `fonttools` 的命令行子模块 `ttx`。它可以把字体文件导出为 XML 格式的文本文件，方便你用文本编辑器查看字体内部结构。安装 fontTools 后 ttx 就可用了。

> 工具是辅助，理解原理才是核心。FontForge 帮你看清楚字体内部长什么样，fontTools 帮你用代码批量处理。两个配合使用，调试时用 FontForge 看结构，跑量时用 fontTools 写脚本。

### XML 格式查看字体内部映射

fontTools 提供了一个非常实用的功能：把字体文件导出为 XML 格式。这样你可以直接用文本编辑器查看字体内部的所有表结构，对调试特别有帮助。这是分析字体加密的第一步——先看清楚字体内部长什么样。

```python
from fontTools.ttLib import TTFont

# 加载字体文件（支持 TTF/WOFF/WOFF2）
font = TTFont('custom.woff2')

# 导出为 XML 格式
font.saveXML('custom_font.xml')

# 查看字体中有哪些表
print(font.keys())
# ['head', 'hhea', 'maxp', 'OS/2', 'hmtx',
#  'cmap', 'post', 'name', 'glyf', 'loca']
```

导出的 XML 文件里，cmap 表长这样（简化版）：

```xml
<cmap>
  <tableVersion version="0"/>
  <cmap_format_4 platformID="3" platEncID="1" language="0">
    <map code="0x30" name="glyph00010"/>
    <map code="0x31" name="glyph00012"/>
    <map code="0x32" name="glyph00011"/>
    <map code="0x33" name="glyph00000"/>
    <map code="0x34" name="glyph00005"/>
    <map code="0x35" name="glyph00008"/>
    <map code="0x36" name="glyph00003"/>
    <map code="0x37" name="glyph00001"/>
    <map code="0x38" name="glyph00007"/>
    <map code="0x39" name="glyph00009"/>
  </cmap_format_4>
</cmap>
```

`code` 是 Unicode 码点，`name` 是对应的 Glyph 名称。通过 Glyph 名称，你可以在 glyf 表中找到这个字形的轮廓数据。glyf 表的 XML 长这样：

```xml
<glyf>
  <TTGlyph name="glyph00012" xMin="0" yMin="0" xMax="300" yMax="700">
    <contour>
      <pt x="100" y="0" on="1"/>
      <pt x="200" y="350" on="1"/>
      <pt x="150" y="700" on="1"/>
    </contour>
  </TTGlyph>
</glyf>
```

每个 TTGlyph 元素包含一个或多个 contour（轮廓），每个 contour 由一系列 pt（点）组成。这些点的坐标定义了字形的形状。两个字形如果坐标点完全一致，它们画出来的形状就完全一样。

从上面的 cmap XML 可以清楚看到，code="0x31"（字符 "1"）对应的不是 glyph00011（正常应该对应的），而是 glyph00012。这就是字体加密留下的痕迹。

> XML 查看法是调试字体加密的第一步。拿到一个加密字体，先导出 XML 看看 cmap 表长什么样，心里就有数了——映射关系一目了然，剩下的就是写代码自动化处理。

### cmap 表分析

cmap 表是字体加密的核心战场。fontTools 提供了方便的 API 来直接读取 cmap 映射，不需要导出 XML。在代码中分析 cmap 表的流程是：加载字体、获取 cmap、遍历映射关系。

```python
from fontTools.ttLib import TTFont

font = TTFont('custom.woff2')
cmap = font.getBestCmap()

# cmap 是一个字典：{Unicode 码点: Glyph 名称}
for code, glyph_name in sorted(cmap.items()):
    char = chr(code)
    print(f"U+{code:04X} '{char}' -> {glyph_name}")
```

输出示例：

```
U+0030 '0' -> glyph00010
U+0031 '1' -> glyph00012  # 1 指向了 glyph12
U+0032 '2' -> glyph00011  # 2 指向了 glyph11
U+0033 '3' -> glyph00000  # 3 指向了 glyph0
...
```

拿到 cmap 映射后，下一步就是搞清楚每个 Glyph 实际对应的是什么字符。前面提到的两种方法，我们来具体实现"坐标哈希法"。核心思路是：每个 Glyph 的轮廓由一系列坐标点定义，把这些坐标点做成一个哈希值，和标准字体的哈希值比对，哈希相同就是同一个字符。

```python
from fontTools.ttLib import TTFont
import hashlib

def get_glyph_hash(font, glyph_name):
    """获取字形轮廓的哈希值"""
    glyf = font['glyf']
    if glyph_name not in glyf:
        return None
    glyph = glyf[glyph_name]
    if glyph.numberOfContours == 0:
        return None
    # 取出所有坐标点
    coords = glyph.coordinates
    points = list(coords)
    # 坐标转字符串后哈希
    point_str = str(points)
    return hashlib.md5(point_str.encode()).hexdigest()
```

这个函数把一个字形的轮廓坐标取出，计算 MD5 哈希。同一个字形无论在哪个字体文件里，只要轮廓一样，哈希就一样。这样我们就能通过比对哈希值，找出加密字体中每个 Glyph 实际对应的标准字符。

不过有一个坑需要注意：有些字形的 `numberOfContours` 是 -1，这表示它是一个复合字形（由其他字形组合而成）。复合字形没有自己的坐标点，而是引用其他字形的坐标。处理复合字形时需要递归查找它引用的基础字形，然后用基础字形的坐标来计算哈希。好在数字字符（0-9）通常不会用复合字形，所以如果你只破解数字加密，基本不会遇到这个问题。

另一个坑是坐标精度问题。不同字体工具生成的字体文件，坐标精度可能不同。有的用整数坐标，有的用浮点数坐标。如果精度不同，即使形状一样的字形，哈希值也可能不同。解决办法是在计算哈希前统一坐标精度，比如都取整。

> cmap 分析的核心就一句话：先拿到 Unicode 到 Glyph 的映射，再通过 Glyph 的形状特征找出它真正代表的字符。两步走通，加密就破了。

## 7.3 字体文件转换与内容还原

### 字体文件格式转换

前面说过，WOFF2 和 WOFF 需要转成 TTF 来处理。虽然 fontTools 能直接读 WOFF2，但在某些场景下转成 TTF 更方便——比如用 FontForge 打开查看，或者用其他不支持 WOFF2 的工具处理。

fontTools 自带格式转换功能，几行代码就能搞定。转换的原理是：读取字体文件（不管什么格式），清除 WOFF/WOFF2 的压缩标记（flavor），然后以 TTF 格式保存。转换前后 cmap 表和 glyf 表的内容完全不变，变的只是文件的外层封装格式。

```python
from fontTools.ttLib import TTFont

def woff2_to_ttf(woff2_path, ttf_path):
    """WOFF2 转 TTF"""
    font = TTFont(woff2_path)
    font.flavor = None  # 清除 WOFF2 flavor
    font.save(ttf_path)

def woff_to_ttf(woff_path, ttf_path):
    """WOFF 转 TTF"""
    font = TTFont(woff_path)
    font.flavor = None
    font.save(ttf_path)

# 使用
woff2_to_ttf('custom.woff2', 'custom.ttf')
```

有时候你从 CSS 里提取到的是 Base64 编码的字体数据，需要先解码再保存为文件。这种情况下可以用 `io.BytesIO` 直接在内存中加载，不需要落盘，效率更高：

```python
import base64
import re
from fontTools.ttLib import TTFont
import io

def extract_font_from_css(css_text):
    """从 CSS 文本中提取 Base64 字体并加载"""
    # 匹配 Base64 编码的字体数据
    pattern = r'base64,([A-Za-z0-9+/=]+)'
    match = re.search(pattern, css_text)
    if not match:
        return None
    # 解码 Base64
    font_data = base64.b64decode(match.group(1))
    # 用 BytesIO 直接加载，无需保存到磁盘
    font = TTFont(io.BytesIO(font_data))
    return font
```

这个函数直接从 CSS 文本中提取 Base64 字体数据，解码后用 BytesIO 加载，不需要落盘。在实际项目中，这种方式效率更高，特别是处理大量页面时不用生成一堆临时文件。我在处理某招聘网站的数据时，每页都内联一个 Base64 字体，100 页就是 100 个字体文件。如果每个都落盘再读取，IO 开销非常大。用 BytesIO 在内存中处理，速度快了好几倍。

> 格式转换是体力活，别在它上面花太多时间。写一个通用函数，WOFF2、WOFF、Base64 全覆盖，以后拿来就用。怕浪猫的爬虫工具箱里就有这么一个 `load_font` 函数，不管什么格式丢进去都能返回 fontTools 对象。

### 解析字体 cmap 表获取真实映射关系

现在进入核心环节——解析 cmap 表，找出加密字符和真实字符之间的映射关系。完整的流程是这样的：

```
步骤 1：加载加密字体，获取 cmap 映射（Unicode → Glyph ID）
    ↓
步骤 2：加载标准字体（如系统 Arial），获取标准 cmap 映射
    ↓
步骤 3：对加密字体中每个 Glyph 计算特征哈希
    ↓
步骤 4：对标准字体中每个 Glyph 计算特征哈希
    ↓
步骤 5：哈希比对，找出 Glyph ID 对应关系
    ↓
步骤 6：构建最终映射：加密 Unicode → 真实字符
```

为什么需要标准字体？因为我们光知道"U+0031 对应 Glyph ID 12"是不够的，我们还需要知道 Glyph ID 12 的字形长什么样，才能判断它代表哪个真实字符。标准字体提供了"正确答案"——在标准字体中，U+0031 对应的字形就是 "1" 的形状。我们拿加密字体中 Glyph ID 12 的形状和标准字体中所有数字字形的形状比对，找到匹配的那个，就知道了 Glyph ID 12 实际代表的是哪个数字。

下面是完整的映射字典构建代码：

```python
from fontTools.ttLib import TTFont
import hashlib
import io

def get_glyph_coordinates(font, glyph_name):
    """获取字形坐标点列表"""
    glyf = font['glyf']
    if glyph_name not in glyf:
        return None
    glyph = glyf[glyph_name]
    if glyph.numberOfContours == 0 or glyph.numberOfContours == -1:
        return None
    return list(glyph.coordinates)

def build_font_mapping(encrypted_font_path, standard_font_path):
    """构建加密字符到真实字符的映射字典"""
    enc_font = TTFont(encrypted_font_path)
    std_font = TTFont(standard_font_path)

    # 构建标准字体的 Glyph 哈希索引
    std_glyph_hash = {}
    std_cmap = std_font.getBestCmap()
    for code, glyph_name in std_cmap.items():
        coords = get_glyph_coordinates(std_font, glyph_name)
        if coords and 0x30 <= code <= 0x39:  # 只处理数字 0-9
            h = hashlib.md5(str(coords).encode()).hexdigest()
            std_glyph_hash[h] = chr(code)

    # 构建加密字体的映射字典
    mapping = {}
    enc_cmap = enc_font.getBestCmap()
    for code, glyph_name in enc_cmap.items():
        coords = get_glyph_coordinates(enc_font, glyph_name)
        if coords is None:
            continue
        h = hashlib.md5(str(coords).encode()).hexdigest()
        if h in std_glyph_hash:
            mapping[chr(code)] = std_glyph_hash[h]

    return mapping

# 使用
mapping = build_font_mapping('custom.woff2', 'arial.ttf')
print(mapping)
# {'7': '1', '8': '9', '5': '9', '0': '3', ...}
```

这段代码的核心逻辑是：用标准字体的 Glyph 哈希建立索引，然后遍历加密字体的每个 Glyph，如果哈希匹配上了，就说明它们是同一个字形，从而找到加密字符对应的真实字符。

`get_glyph_coordinates` 函数负责从字体中提取指定字形的坐标点。`numberOfContours == 0` 表示空字形，`== -1` 表示复合字形，这两种情况都返回 None 跳过处理。`build_font_mapping` 函数先构建标准字体的哈希索引（只处理 0-9 十个数字），再遍历加密字体做哈希比对。

> 字体破解的核心技术就是"形状比对"——不管映射怎么变，字形的形状不会变。同一个 "1" 不管被塞到哪个 Unicode 码点上，它的轮廓坐标是一样的。抓住这一点，加密就破了。

### 构建映射字典

上面拿到映射字典后，就可以直接用来替换加密字符了。但实际项目中还有一些细节要处理。

首先是映射字典的覆盖范围。有些网站不只加密数字，还加密汉字。数字只有 10 个（0-9），比对简单。但汉字有几万个，不可能用标准字体覆盖所有汉字。这种情况下，通常的做法是缩小范围——只比对目标数据中出现的字符。比如你只爬价格数据，那只需要搞定 0-9 和小数点就够了。如果还要爬销量、评分等数据，可能需要扩展到汉字范围，这时候可以用更高效的特征匹配算法，比如基于轮廓的外接矩形面积比、形状上下文等。

其次是映射字典的缓存问题。如果网站用的是静态字体（每次请求字体文件不变），你可以把映射字典缓存起来，不用每次都解析字体文件。但如果是动态字体（每次请求映射关系都变），就必须每次都重新解析。判断方法是：连续请求两次同一页面，对比两次拿到的字体文件是否相同。如果文件内容一致就是静态字体，否则是动态字体。

```python
import json
import os

class FontMapper:
    """字体映射管理器"""

    def __init__(self, standard_font_path):
        self.standard_font = TTFont(standard_font_path)
        self._std_hash_cache = None
        self._mapping_cache = {}  # 字体URL -> 映射字典

    def _get_std_hash_index(self):
        """构建标准字体哈希索引（带缓存）"""
        if self._std_hash_cache is not None:
            return self._std_hash_cache
        self._std_hash_cache = {}
        cmap = self.standard_font.getBestCmap()
        for code, glyph_name in cmap.items():
            coords = get_glyph_coordinates(
                self.standard_font, glyph_name)
            if coords:
                h = hashlib.md5(str(coords).encode()).hexdigest()
                self._std_hash_cache[h] = chr(code)
        return self._std_hash_cache

    def get_mapping(self, font_data, font_key=None):
        """获取映射字典，带缓存"""
        if font_key and font_key in self._mapping_cache:
            return self._mapping_cache[font_key]
        font = TTFont(io.BytesIO(font_data))
        std_hash = self._get_std_hash_index()
        mapping = {}
        for code, glyph_name in font.getBestCmap().items():
            coords = get_glyph_coordinates(font, glyph_name)
            if coords is None:
                continue
            h = hashlib.md5(str(coords).encode()).hexdigest()
            if h in std_hash:
                mapping[chr(code)] = std_hash[h]
        if font_key:
            self._mapping_cache[font_key] = mapping
        return mapping
```

这个 FontMapper 类做了两个优化：一是标准字体的哈希索引只构建一次，后续复用；二是支持按字体 URL 缓存映射字典，避免对同一字体重复解析。`font_key` 可以是字体文件的 URL 或者内容哈希，用来唯一标识一个字体文件。

还有一个容易被忽略的问题：映射不完整。有些加密字体中，不是所有数字字符都被加密了，可能只有 0-5 被打乱，6-9 保持原样。这种情况下，映射字典里只会有 6 个映射关系，其余字符保持原样即可。`mapping.get(ch, ch)` 这个写法就是处理这种情况——如果字符不在映射字典里，就返回它自身。

> 工程化的思维就是：能缓存的绝不重复计算。字体解析是 CPU 密集型操作，每解析一次就要遍历所有 Glyph 的坐标数据，几百个字形的计算量不小。把结果缓存起来，后续直接查字典，性能提升一个数量级。

### 处理动态字体文件

动态字体是字体加密反爬中最难搞的部分。网站每次请求返回的字体文件映射关系都不同，你无法预先知道映射表，必须在每次请求时实时解析。

动态字体的工作流程通常是这样的：

```
客户端请求页面
    ↓
服务器生成随机映射关系
    ↓
根据映射关系动态生成字体文件（WOFF2）
    ↓
页面 HTML + CSS（含字体 URL 或 Base64）返回
    ↓
客户端每次拿到不同的字体文件
```

服务器端生成动态字体的实现方式通常是用字体处理库（如 Python 的 fontTools 或 Node.js 的 opentype.js）在每次请求时动态打乱 cmap 映射，然后生成新的字体文件返回。这种做法对服务器有一定的性能开销，所以通常只对关键数据字段（如价格、库存）使用动态字体，其他内容用正常字体。

应对动态字体的策略也很直接——每次请求都重新解析。但这带来一个性能问题：每个页面都要下载字体文件、解析 cmap、计算哈希、比对字形。如果一页一个字体，抓一百页就要解析一百次字体文件。

优化思路有两个方向。第一，如果字体文件虽然映射关系不同，但字形轮廓是固定的（只是映射关系在变），你可以预先建立 Glyph ID 到真实字符的映射，然后每次只需解析 cmap 表获取映射关系即可，不用再做哈希比对。这种情况在实际中很常见，因为网站通常只有一个字体模板，每次只是打乱映射关系，字形本身不变。判断方法是：下载两次字体文件，比对 glyf 表是否一致。如果 glyf 表一致但 cmap 表不同，说明是"固定字形 + 动态映射"。

第二，如果字形轮廓也在变（不太常见，但确实存在），那就只能每次全量解析，但可以并行化处理，用多线程或异步来加速。

```python
def decrypt_text(text, mapping):
    """根据映射字典还原加密文本"""
    if not mapping:
        return text
    return ''.join(mapping.get(ch, ch) for ch in text)

# 实际使用示例
encrypted_price = "￥785"
mapping = {'7': '1', '8': '9', '5': '9'}
real_price = decrypt_text(encrypted_price, mapping)
print(real_price)  # ￥199
```

这段 `decrypt_text` 函数就是最终的还原步骤。拿到加密文本和映射字典后，逐字符替换即可。映射字典里没有的字符保持原样，这样即使有些字符没有被加密，也不会影响还原结果。比如 "￥" 不在映射字典里，就原样保留，只有数字被替换。

还有一种高级动态字体策略需要特别注意：有些网站会在字体文件中插入"假字形"。这些假字形的轮廓和任何真实字符都不一样，专门用来干扰哈希比对。遇到这种情况，你需要用更智能的匹配策略，比如计算字形轮廓的相似度而不是精确匹配。常见的相似度算法有 Hu 矩匹配、形状上下文等。不过这种高级反爬在实际中比较少见，大部分网站用简单的哈希比对就能搞定。

> 动态字体的应对策略就一句话：以不变应万变。不管映射怎么变，字形的形状特征是不变的（或者至少在一次会话中是不变的）。每次请求都解析，但用缓存和并行来对冲性能开销。

## 7.4 Base64 数据解码

### Base64 编码原理

Base64 不是加密算法，它是编码算法。但在反爬场景中，Base64 被大量用来混淆数据，让爬虫拿到数据后不能直接使用。

Base64 的原理很简单：把每 3 个字节（24 bit）的数据分成 4 组，每组 6 bit，然后用 64 个可打印字符来表示。因为 6 bit 正好能表示 0-63，对应 A-Z、a-z、0-9、+、/ 这 64 个字符。

```
原始数据（3字节，24 bit）：
┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐
│B7│B6│B5│B4│B3│B2│B1│B0│B7│B6│B5│B4│B3│B2│B1│B0│B7│B6│B5│B4│B3│B2│B1│B0│
└──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘
│     字节1         │     字节2         │     字节3         │
└────────┬─────────┴────────┬─────────┴────────┬─────────┘
         ↓                  ↓                  ↓
重新分组（4组，每组6 bit）：
┌──────┬──────┬──────┬──────┐
│ 6bit │ 6bit │ 6bit │ 6bit │
└──────┴──────┴──────┴──────┘
    ↓      ↓      ↓      ↓
  字符1  字符2  字符3  字符4
```

如果原始数据长度不是 3 的倍数，就在末尾补零，并用 `=` 填充输出。所以你看到 Base64 字符串末尾有 `=` 或 `==`，就是因为原始数据长度不是 3 的倍数。一个 `=` 表示原始数据长度除以 3 余 1，两个 `=` 表示余 2。

Base64 编码后的数据长度是原始数据的 4/3 倍。也就是说，1KB 的原始数据编码后约 1.33KB。这个体积膨胀是 Base64 的主要缺点，但在 Web 场景中这个代价是可以接受的，换来的是数据可以在文本协议中安全传输。

> Base64 不是加密，是编码。加密有密钥，编码没有密钥。任何人拿到 Base64 字符串都能解码，网站用 Base64 混淆数据，防的是"懒得解码的人"，不是真正的技术壁垒。

### 图片 Base64 内联

很多网站把小图片（图标、验证码背景等）以 Base64 编码内联在 HTML 或 CSS 中，这就是 Data URI Scheme。格式是 `data:[mimetype];base64,[data]`。

```html
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..." />
```

```css
background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...);
```

在反爬场景中，有些网站把验证码图片用 Base64 编码放在 API 响应的 JSON 里，而不是直接返回图片 URL。这样爬虫拿到 JSON 后不能直接用 URL 下载图片，需要先解码 Base64 再保存。这种做法的好处是对网站来说实现简单，而且可以避免爬虫通过图片 URL 直接下载图片绕过验证码渲染逻辑。

```python
import base64
import re

def extract_and_save_image(base64_str, output_path):
    """从 Base64 字符串提取图片并保存"""
    # 去除 Data URI 前缀
    if base64_str.startswith('data:'):
        base64_str = re.sub(r'^data:image/\w+;base64,', '', base64_str)
    # 解码
    image_data = base64.b64decode(base64_str)
    # 保存为文件
    with open(output_path, 'wb') as f:
        f.write(image_data)
    return output_path

# 使用
img_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
extract_and_save_image(img_b64, 'captcha.png')
```

这个函数处理了 Data URI 前缀的去除和 Base64 解码两步。注意解码后得到的是二进制数据，要以二进制模式写入文件。在处理验证码场景中，拿到图片后通常还要喂给 OCR 引擎或者打码平台来识别。

### API 响应中 Base64 编码的 JSON 数据

这是一种更隐蔽的反爬手段。网站 API 返回的 JSON 数据中，某些字段值是 Base64 编码的字符串。你不解码的话看到的是一串乱码，解码后才是真实数据。

```python
import base64
import json
import requests

def fetch_and_decode_data(url, headers):
    """抓取 API 并解码 Base64 编码的字段"""
    resp = requests.get(url, headers=headers)
    data = resp.json()

    # 假设 data 字段是 Base64 编码的 JSON
    if 'data' in data and isinstance(data['data'], str):
        decoded = base64.b64decode(data['data']).decode('utf-8')
        data['data'] = json.loads(decoded)

    return data

# 使用示例
headers = {'User-Agent': 'Mozilla/5.0 ...'}
result = fetch_and_decode_data(
    'https://example.com/api/list?page=1', headers)
print(result)
# {'data': [{'name': '商品A', 'price': '99'}, ...]}
```

有些网站更复杂，Base64 编码前还会先做一层处理——比如先 JSON 序列化，再反转字符串，再 Base64 编码。遇到这种情况，你需要先解码 Base64，再反转字符串，再 JSON 解析。多层嵌套的解码逻辑在实战中很常见。

怎么判断一个字符串是不是 Base64 编码？有几个经验规律：长度是 4 的倍数；只包含 A-Z、a-z、0-9、+、/、= 这些字符；末尾有 0-2 个 `=` 填充。满足这些条件的字符串大概率是 Base64 编码。当然这不是绝对的，但作为初步判断够用了。

> 多层编码就像套娃，拆开一层还有一层。关键是找到最内层的那一层——原始数据是什么格式，然后从外到内逐层剥开。调试时可以先在浏览器控制台里手动解码，搞清楚编码逻辑后再写 Python 代码。

### Python base64 标准库使用

Python 的 `base64` 标准库提供了完整的 Base64 编解码功能。除了标准的 Base64，还有 URL 安全的 Base64（用 `-` 和 `_` 替换 `+` 和 `/`）。在 API 响应中，URL 安全的 Base64 很常见，因为 `+` 和 `/` 在 URL 中有特殊含义。

```python
import base64

# 标准 Base64 编码
text = "Hello, 怕浪猫!"
encoded = base64.b64encode(text.encode('utf-8'))
print(encoded)  # b'SGVsbG8sIOW8oOaageaGhyE='

# 标准 Base64 解码
decoded = base64.b64decode(encoded).decode('utf-8')
print(decoded)  # Hello, 怕浪猫!

# URL 安全 Base64（替换 +/ 为 -_）
url_safe = base64.urlsafe_b64encode(text.encode('utf-8'))
print(url_safe)  # b'SGVsbG8sIOW8oOaageaGhyE='

# 处理缺少 padding 的情况
def safe_b64decode(s):
    """安全解码，自动补齐 padding"""
    if isinstance(s, str):
        s = s.encode()
    missing = len(s) % 4
    if missing:
        s += b'=' * (4 - missing)
    return base64.b64decode(s)
```

实际项目中经常遇到 Base64 字符串缺少末尾 `=` 填充的情况，`safe_b64decode` 函数可以自动补齐。另外要注意，Base64 编码后的字符串可能包含换行符（标准规定每 76 字符换行），解码前最好先去除换行符。有些网站的 Base64 字符串会在中间插入随机空白字符来干扰解码，用 `s.replace(b'\n', b'').replace(b' ', b'')` 清理一下即可。

还有一个常见的坑：URL 安全 Base64 和标准 Base64 的混用。有些网站在 API 中返回 URL 安全 Base64（用 `-` 和 `_`），但你用 `base64.b64decode` 解码会报错。这时需要先做替换：`s = s.replace('-', '+').replace('_', '/')`，然后用标准解码。或者直接用 `base64.urlsafe_b64decode`。

> base64 标准库虽好，但别忘了它只能处理 Base64 编码。如果遇到的是 Base32、Base85、Hex 编码，要用 `base64.b32decode`、`base64.b85decode`、`bytes.fromhex` 等对应方法。先搞清楚是什么编码，再选对工具。

## 7.5 批量数据还原实战

### 分页抓取与字体解密流水线

前面几节我们分别讲了字体加密和 Base64 编码的破解方法，这一节把它们组合起来，搭建一条完整的批量数据还原流水线。

假设目标网站的场景是这样的：价格数据用字体加密，评论数据用 Base64 编码，每页 20 条数据，总共 100 页。我们需要抓取所有页面的数据并还原真实值。

整体架构设计：

```
┌─────────────────────────────────────────────────┐
│              批量数据还原流水线                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. 分页遍历（page 1 → 100）                     │
│     ↓                                           │
│  2. 请求页面，解析 HTML                          │
│     ↓                                           │
│  3. 提取字体文件 URL / Base64 数据               │
│     ↓                                           │
│  4. 解析字体，构建映射字典                       │
│     ↓                                           │
│  5. 提取加密数据字段                             │
│     ↓                                           │
│  6. 字体解密（价格等字段）                       │
│     ↓                                           │
│  7. Base64 解码（评论等字段）                    │
│     ↓                                           │
│  8. 数据完整性验证                               │
│     ↓                                           │
│  9. 写入存储                                     │
│                                                 │
└─────────────────────────────────────────────────┘
```

下面是流水线的核心代码实现。我把它设计成一个类，每个方法负责流水线中的一个环节，这样出了问题容易定位，也方便单独测试某个环节：

```python
import requests
import base64
import json
import re
import io
import hashlib
from fontTools.ttLib import TTFont
from concurrent.futures import ThreadPoolExecutor

class DataRestorePipeline:
    """批量数据还原流水线"""

    def __init__(self, standard_font_path):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; '
                           'Win64; x64) AppleWebKit/537.36'
        })
        self.std_font = TTFont(standard_font_path)
        self._std_hash = self._build_std_hash()

    def _build_std_hash(self):
        """构建标准字体哈希索引"""
        h = {}
        for code, name in self.std_font.getBestCmap().items():
            coords = self._get_coords(self.std_font, name)
            if coords and 0x30 <= code <= 0x39:
                md5 = hashlib.md5(str(coords).encode()).hexdigest()
                h[md5] = chr(code)
        return h

    def _get_coords(self, font, glyph_name):
        """获取字形坐标"""
        glyf = font['glyf']
        if glyph_name not in glyf:
            return None
        g = glyf[glyph_name]
        if g.numberOfContours <= 0:
            return None
        return list(g.coordinates)

    def _build_mapping(self, font_data):
        """从字体数据构建映射字典"""
        font = TTFont(io.BytesIO(font_data))
        mapping = {}
        for code, name in font.getBestCmap().items():
            coords = self._get_coords(font, name)
            if not coords:
                continue
            md5 = hashlib.md5(str(coords).encode()).hexdigest()
            if md5 in self._std_hash:
                mapping[chr(code)] = self._std_hash[md5]
        return mapping

    def _decrypt_font(self, text, mapping):
        """字体解密"""
        return ''.join(mapping.get(c, c) for c in text)

    def _decode_base64(self, text):
        """Base64 解码"""
        try:
            return base64.b64decode(text).decode('utf-8')
        except Exception:
            return text
```

这段代码定义了流水线的基础设施。`_build_std_hash` 在初始化时构建标准字体的哈希索引，后续每次请求只需构建加密字体的哈希并比对即可。`_build_mapping` 每次从字体二进制数据构建映射字典，`_decrypt_font` 和 `_decode_base64` 分别处理字体加密和 Base64 编码的数据。

注意 `_decode_base64` 函数做了异常处理——解码失败时返回原始文本。这是防御性编程的体现，因为不是所有评论字段都是 Base64 编码的，有些可能是明文。直接调用 `base64.b64decode` 遇到非 Base64 字符串会抛异常，加了 try-except 就不会因为一条数据的问题导致整个页面处理失败。

> 流水线设计的核心思想是"单一职责"——每个方法只做一件事，组合起来完成完整流程。这样出了问题容易定位，改起来也方便。怕浪猫在实际项目中用这套架构处理过日百万级的数据量，稳定运行。

### 动态字体映射的自动化处理

有了基础流水线后，下一步是处理动态字体。每页的字体文件不同，映射关系不同，必须自动化处理。关键在于：每次请求页面后，先提取字体文件，再解析映射，最后用映射还原数据。

```python
    def process_page(self, page_num):
        """处理单页数据"""
        url = f'https://example.com/list?page={page_num}'
        resp = self.session.get(url)

        # 提取字体 URL（或 Base64 内联字体）
        font_data = self._extract_font(resp.text)
        if not font_data:
            return []

        # 构建当前页的映射字典
        mapping = self._build_mapping(font_data)

        # 提取数据项
        items = self._parse_items(resp.text)

        # 逐条还原数据
        results = []
        for item in items:
            # 字体加密字段还原
            if 'price' in item:
                item['price'] = self._decrypt_font(
                    item['price'], mapping)
            # Base64 编码字段还原
            if 'comment' in item:
                item['comment'] = self._decode_base64(
                    item['comment'])
            results.append(item)

        return results

    def _extract_font(self, html):
        """从 HTML 中提取字体数据"""
        # 尝试匹配 Base64 内联字体
        m = re.search(r'base64,([A-Za-z0-9+/=]+)', html)
        if m:
            return base64.b64decode(m.group(1))
        # 尝试匹配字体 URL
        m = re.search(r"src:url\('([^']+.woff2?)'\)", html)
        if m:
            font_url = m.group(1)
            if not font_url.startswith('http'):
                font_url = 'https://example.com' + font_url
            return self.session.get(font_url).content
        return None

    def _parse_items(self, html):
        """解析 HTML 提取数据项（简化版）"""
        import parsel
        sel = parsel.Selector(html)
        items = []
        for node in sel.css('.item'):
            items.append({
                'name': node.css('.name::text').get(),
                'price': node.css('.price::text').get(''),
                'comment': node.css(
                    '.comment::attr(data-c)').get(''),
            })
        return items
```

`process_page` 是单页处理的完整流程：请求页面、提取字体、构建映射、解析数据、逐字段还原。`_extract_font` 兼容了 Base64 内联和 URL 引用两种字体加载方式，先尝试匹配 Base64 内联字体，如果没有再尝试匹配字体 URL。`_parse_items` 用 parsel 库解析 HTML 提取数据，这里简化了，实际项目中根据目标网站结构调整选择器。

这里有一个细节值得注意：`_extract_font` 函数中正则匹配 Base64 字体数据时，可能匹配到多个结果（一个页面可能引用多个字体）。这时需要判断哪个是加密字体。判断依据通常是字体文件的 CSS 声明中使用的 font-family 名称，或者字体文件的大小（加密字体通常只包含数字字形，文件比较小）。

> 动态字体的自动化处理，难点不在于解析逻辑有多复杂，而在于你要覆盖所有可能出现的情况。字体在 CSS 里、在 HTML 里、在 JS 里动态加载、在 API 响应里返回 URL——每种情况都要处理。怕浪猫的经验是：先把所有遇到的情况记下来，统一在一个函数里处理，不要分散在各处。

### 数据完整性验证

数据还原后，必须做完整性验证。字体解密有可能因为映射不完整而遗漏字符，Base64 解码可能因为编码格式不对而失败。如果不验证，你可能存了一堆错误数据还浑然不知。

怕浪猫就踩过这个坑。有一次爬某电商网站的商品数据，爬了两万多条，字体解密看起来都正常。结果运营同事拿去用的时候发现，有大概 5% 的价格数据是错的——不是完全错，而是个别数字没还原对。比如 "￥299" 变成了 "￥2㄀9"，中间那个字符映射没找到，就原样保留了。从那以后我学乖了，数据验证是流水线的标配，不是可选的。

验证策略分几层：

```python
    def validate_item(self, item):
        """验证单条数据完整性"""
        errors = []

        # 价格应该是数字字符串
        price = item.get('price', '')
        if price and not re.match(
                r'^\d+(\.\d+)?$', price.replace('￥', '')):
            errors.append(f'价格格式异常: {price}')

        # Base64 解码后的评论应该是可读文本
        comment = item.get('comment', '')
        if comment and '\\u' in comment:
            errors.append(f'评论未完全解码: {comment[:50]}')

        # 必填字段检查
        if not item.get('name'):
            errors.append('名称为空')

        return errors

    def process_page_with_validation(self, page_num):
        """带验证的页面处理"""
        items = self.process_page(page_num)
        valid_items = []
        error_count = 0

        for item in items:
            errors = self.validate_item(item)
            if errors:
                error_count += 1
                for e in errors:
                    print(f'[页{page_num}] {e}')
            else:
                valid_items.append(item)

        print(f'页 {page_num}: 共 {len(items)} 条，'
              f'有效 {len(valid_items)} 条，'
              f'异常 {error_count} 条')
        return valid_items
```

第一层是格式验证——价格应该是纯数字（可能带小数点和货币符号），如果不是，说明字体解密有问题。第二层是内容验证——Base64 解码后的文本不应该包含 Unicode 转义序列，如果包含说明解码不完整。第三层是必填字段验证——关键字段不能为空。

除了这些自动化验证，还建议做人工抽检——随机抽取几条数据，人工到目标网站核对，确认还原结果正确。人工抽检的频率可以低一些，比如每 1000 条抽 10 条。自动化验证可以过滤掉大部分错误，但有些微妙的错误（比如数字偏移了一位）自动化验证发现不了，只能靠人工核对。

> 数据验证是流水线的"质检环节"。没有质检的流水线，产出再多也是废品。怕浪猫见过太多爬虫项目上线几天后才发现数据是错的，原因就是没有做验证。宁可少几条数据，也不要存错的。

### 完美还原上百页的数据内容

最后，把分页抓取、字体解密、Base64 解码、数据验证串起来，跑一个完整的批量任务。为了提高效率，用线程池并行处理多个页面：

```python
    def run(self, total_pages, max_workers=5):
        """运行批量抓取"""
        all_data = []

        with ThreadPoolExecutor(
                max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self.process_page_with_validation, p
                ): p for p in range(1, total_pages + 1)
            }
            for future in futures:
                page = futures[future]
                try:
                    items = future.result(timeout=30)
                    all_data.extend(items)
                except Exception as e:
                    print(f'页 {page} 处理失败: {e}')

        # 去重（按名称）
        seen = set()
        unique_data = []
        for item in all_data:
            key = item.get('name', '')
            if key not in seen:
                seen.add(key)
                unique_data.append(item)

        print(f'总计: {len(all_data)} 条，'
              f'去重后 {len(unique_data)} 条')
        return unique_data

# 使用示例
pipeline = DataRestorePipeline('arial.ttf')
data = pipeline.run(total_pages=100, max_workers=5)

# 保存结果
import csv
with open('result.csv', 'w', encoding='utf-8') as f:
    writer = csv.DictWriter(
        f, fieldnames=['name', 'price', 'comment'])
    writer.writeheader()
    writer.writerows(data)
```

这段代码用 ThreadPoolExecutor 并行处理 100 页数据，每页独立解析字体和 Base64，互不干扰。最后做了去重处理，按名称字段去重，避免重复数据。结果保存为 CSV 文件。

需要注意的是，线程池的 `max_workers` 不要设太大。虽然字体解析是 CPU 密集型，但 IO 等待（网络请求）占大头，5-10 个线程通常就够了。太多线程会导致请求频率过高，触发网站的反爬策略。另外，多线程环境下 `requests.Session` 不是绝对线程安全的。如果对安全性要求高，可以每个线程用独立的 Session，或者加锁。不过在实际项目中，5 个线程共享一个 Session 通常不会出问题，因为每个请求的生命周期很短，冲突概率极低。

还有一个实用的技巧：给每个请求加随机延迟。`time.sleep(random.uniform(0.5, 2.0))` 可以让请求间隔随机化，避免因请求频率过于规律被反爬系统识别。在线程池中，每个线程在请求前独立 sleep 即可，不需要协调。

> 并发抓取的平衡点是：既要快，又不能太快。快到触发反爬就是搬起石头砸自己的脚。怕浪猫的实践经验是：5 个并发 + 1-2 秒随机延迟，绝大多数网站都能接受。如果目标网站反爬强，降到 2-3 个并发 + 3-5 秒延迟。

### 整体流程回顾

把这一章学到的所有东西串起来，完整的字体加密 + Base64 编码破解流程是这样的：

```
目标网站分析
├── 识别字体加密（页面显示和源码不一致）
├── 识别 Base64 编码（字段值是 Base64 字符串）
├── 定位字体文件来源（CSS URL / Base64 内联 / JS 动态加载）
└── 确认是否动态字体（每次请求映射不同）
         ↓
字体破解
├── 下载 / 解码字体文件
├── 转换为 TTF 格式（如需要）
├── 解析 cmap 表（Unicode → Glyph ID）
├── 计算字形哈希（轮廓坐标 MD5）
├── 与标准字体比对（哈希匹配）
└── 构建映射字典（加密字符 → 真实字符）
         ↓
Base64 解码
├── 识别 Base64 编码字段
├── 去除 Data URI 前缀（如需要）
├── 补齐 padding（如需要）
└── 解码得到原始数据
         ↓
数据还原
├── 逐字符替换（字体解密）
├── Base64 解码
├── 数据完整性验证
└── 存储结果
```

这套流程覆盖了绝大多数字体加密 + Base64 编码的反爬场景。遇到新网站时，按照这个流程走一遍，基本都能搞定。关键是在"目标网站分析"阶段花足时间——先搞清楚网站用了什么加密手段，字体文件在哪，是否动态变化，然后再动手写代码。磨刀不误砍柴工。

> 爬虫工程师的核心能力不是记住每个网站怎么爬，而是掌握一套通用的分析方法论。网站千变万化，但数据加密的手段无非就那几种。理解原理，举一反三，才能以不变应万变。

## 本章总结

这一章我们从浏览器渲染流水线出发，完整走过了字体加密破解和 Base64 数据还原的全链路。

字体加密部分，核心是理解 cmap 表的映射机制。浏览器渲染时按照字体文件里的 Unicode 到字形映射来画字符，网站通过打乱这个映射关系来实现数据加密。破解方法是：解析 cmap 表拿到映射，通过字形轮廓哈希比对找出真实对应关系，构建映射字典还原数据。动态字体需要每次请求都重新解析，但可以通过缓存标准字体哈希索引来优化性能。对于更复杂的场景（假字形干扰、复合字形等），需要更智能的匹配算法，但大部分网站用简单的哈希比对就能搞定。

Base64 编码部分，原理简单——3 字节变 4 字符。但实战中要注意多种变体：Data URI 内联图片、JSON 字段 Base64 编码、多层嵌套编码、URL 安全 Base64 等。Python 的 base64 标准库提供了完整的编解码能力，注意处理 padding 缺失和换行符等问题。解码失败时要做好异常处理，不要因为一条数据的问题影响整个流水线。

批量实战部分，关键是搭建一条完整的流水线：分页抓取、字体提取、映射构建、数据还原、完整性验证、存储。用线程池并行加速，用数据验证保证质量。整个流程要做到"单一职责、自动处理、异常可追"。FontMapper 类的设计体现了缓存优化思想——标准字体哈希只构建一次，动态字体映射每次解析但结果可缓存。

> 爬虫的尽头不是破反爬，而是数据质量。你能破解所有反爬，但如果存进去的数据是错的，前面所有努力都白费。验证、去重、监控——这些"无聊"的工程化工作，才是真正拉开工程师差距的地方。

**系列进度 7/11**

**下章预告：** 第8章将进行反爬实战练习，综合运用 Scrapy 框架接入 Cookie 池，搭建分布式爬虫。我们会把前面学到的请求头伪装、代理池轮换、验证码识别、Cookie 管理等技能整合到 Scrapy 框架中，打造一套生产级的分布式爬虫系统。

**怕浪猫说：** 字体加密这一关，难的不是代码，是原理。你搞明白了浏览器渲染流水线和 cmap 映射机制，写代码就是水到渠成的事。怕浪猫第一次遇到字体加密时也懵了两天，后来用 FontForge 打开字体文件看了一眼，瞬间就悟了——这不就是换了个密码表吗。所以遇到问题别急着写代码，先把原理搞懂，磨刀不误砍柴工。下一章我们开始搭建分布式爬虫，把前面的技能都串起来实战，敬请期待。