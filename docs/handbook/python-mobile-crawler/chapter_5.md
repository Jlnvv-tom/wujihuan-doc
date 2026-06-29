# 第5章 熟悉Appium的常用操作

写了一年代码，我发现一个反直觉的事实：移动端爬虫的难点不在抓数据，而在"精确操控App"。

很多人觉得爬虫就是发请求、解析响应、存数据。但到了移动端，你首先得让App按你的意图运行——点对按钮、输对文本、等对时机。这些操作看似简单，但App界面千变万化，网络延迟、加载动画、动态弹窗，任何一个变量都能让你的脚本崩溃。而这一切的核心，就四个字：定位、等待。

我是怕浪猫，上一章我们把Appium的环境从零搭到了全链路连通，Inspector也能熟练使用了。这一章我们进入真正的编码环节——用Python代码操控App。怕浪猫会带你把元素定位、基础操作、等待策略、属性提取这四块核心技能彻底讲透。这些不是孤立的知识点，而是一套组合拳：定位找到元素，操作与之交互，等待确保时序，属性提取数据。后面所有章节的爬虫脚本，都建立在这四块地基上。

本章的节奏会很快，大量代码直接上手跑。建议你开着模拟器跟着敲，每段代码都亲自验证一遍。看懂和写出来之间，差着一百次调试。

## 5.1 元素定位策略：ID/XPath/Accessibility ID/Class/CSS/Link

### 5.1.1 元素定位为什么是第一课

在Appium里，所有操作的第一步都是"找到元素"。你要点击一个按钮，得先告诉Appium这个按钮在哪；你要输入文本，得先定位到输入框。找不到元素，后面的一切都是空谈。

> 移动端爬虫的脚本是瞎子，元素定位就是它的眼睛。眼睛有多准，脚本就有多稳。

Appium提供了多种定位策略，每种都有适用场景。选对策略，脚本又快又稳；选错策略，脚本又慢又脆。怕浪猫在实际项目中见过太多人无脑用XPath，结果一个脚本跑5分钟，换个设备直接全挂。这一节我们逐个拆解六种定位策略，每种都给出代码示例和适用场景分析。

### 5.1.2 ID定位：最稳的第一选择

ID定位，全称是Resource ID定位，是Android中最精确、最高效的定位方式。每个UI元素在布局文件中可以定义一个`resource-id`属性，这个属性在整个App中通常唯一。

ID定位的底层原理值得深入理解。当你在代码中调用`find_element(AppiumBy.ID, "com.example.app:id/search_input")`时，Appium Client会将这个请求封装成JSON格式的WebDriver协议指令，通过HTTP POST发送给Appium Server。Server解析请求后，将ID选择器传递给UIAutomator2驱动，驱动调用Android系统的AccessibilityNodeInfo树进行查找。整个链路如下：

```
Python代码 → Appium Client(JSON)
    → HTTP POST → Appium Server
    → UIAutomator2驱动
    → AccessibilityNodeInfo树查找
    → 返回元素引用
```

理解这个链路很重要，因为每一层都可能有延迟。网络层有HTTP往返延迟，驱动层有跨进程通信延迟，查找层有UI树遍历延迟。ID定位之所以快，是因为它在查找层使用了哈希表索引，而XPath定位在这一层需要全树遍历。

在Appium中，使用`find_element`方法配合`AppiumBy.ID`来定位：

```python
from appium.webdriver.common.appiumby import AppiumBy

# 通过ID定位元素
search_box = driver.find_element(
    AppiumBy.ID, "com.example.app:id/search_input"
)

# 点击搜索框
search_box.click()

# 输入搜索关键词
search_box.send_keys("Python爬虫")
```

ID定位的速度是最快的，因为底层直接调用UIAutomator2的`findObject(ResourceId)`方法，时间复杂度接近O(1)。

怎么获取元素的ID？打开Appium Inspector，选中目标元素，在右侧属性面板找`resource-id`字段。它的格式通常是`包名:id/名称`，比如`com.example.app:id/search_input`。

这里有个坑要注意：有些App的resource-id不唯一，多个元素共享同一个ID。这种情况下ID定位会返回第一个匹配的元素，可能不是你想要的。解决办法是结合其他策略，或者用`find_elements`（注意有s）返回所有匹配项，再按索引取：

```python
# 获取所有匹配ID的元素
items = driver.find_elements(
    AppiumBy.ID, "com.example.app:id/list_item"
)

# 取第三个元素
if len(items) >= 3:
    items[2].click()
```

> 经验法则：ID能用就用，不能用再考虑其他。这是性价比最高的定位策略，没有之一。

### 5.1.3 XPath定位：最灵活但也最危险

XPath，全称XML Path Language，是一种在XML文档中定位节点的查询语言。Appium的界面层级结构本质上就是一棵XML树，因此XPath天然适用。

XPath在Appium中的底层实现与Web端不同。Web端的XPath由浏览器原生的XPath引擎执行，效率很高。而Appium中的XPath是由UIAutomator2在Java层面解析执行的，需要将整个UI树加载到内存后再做节点匹配。这就是为什么一个复杂的XPath在Appium中可能耗时500毫秒以上。

理解了底层原理，你就能理解为什么怕浪猫反复强调XPath要用相对路径、要善用属性匹配——因为每一层路径解析都是一次全树遍历，属性匹配可以借助索引加速，而位置索引只能逐个比对。

XPath的优势是表达力极强，几乎可以描述任何复杂的层级关系。劣势是速度慢——XPath需要遍历整棵UI树来匹配，在元素层级很深的App中，一次定位可能耗时数百毫秒。

基础语法示例：

```python
from appium.webdriver.common.appiumby import AppiumBy

# 绝对路径定位（不推荐）
btn = driver.find_element(
    AppiumBy.XPATH,
    "//android.widget.FrameLayout[1]"
    "/android.widget.LinearLayout[1]"
    "/android.widget.Button[1]"
)

# 相对路径定位（推荐）
btn = driver.find_element(
    AppiumBy.XPATH,
    "//android.widget.Button[@text='登录']"
)

# 组合条件定位
btn = driver.find_element(
    AppiumBy.XPATH,
    "//android.widget.TextView"
    "[@resource-id='com.example.app:id/title']"
    "[contains(@text, '热门')]"
)
```

实际项目中，怕浪猫建议遵循以下XPath使用原则：

**原则一：用相对路径，不用绝对路径。** 绝对路径从根节点开始，一旦界面结构有任何变化就会失效。相对路径从任意节点开始，稳定性好得多。

**原则二：用属性匹配，不用位置索引。** `[@text='登录']`比`[1]`可读性更强，也更不容易因为界面调整而失效。

**原则三：善用contains函数。** 有些元素的text属性是动态生成的，比如"购物车(3)"，数字会变。用`contains(@text, '购物车')`就能稳定匹配。

**原则四：层级越浅越好。** XPath每多一层`/`，遍历就多一轮。尽量从最近的唯一父元素开始定位：

```python
# 不好：从根开始层级太深
bad = driver.find_element(
    AppiumBy.XPATH,
    "//FrameLayout/LinearLayout/RelativeLayout"
    "/RecyclerView/LinearLayout/TextView"
)

# 好：直接用属性定位
good = driver.find_element(
    AppiumBy.XPATH,
    "//TextView[@resource-id='com.example.app:id/title']"
)
```

> XPath是万能的，但万能不等于好用。每次写XPath前问自己一句：有没有更简单的定位方式？

### 5.1.4 Accessibility ID定位：跨平台的秘密武器

Accessibility ID，在Android中对应`content-desc`属性，在iOS中对应`accessibilityIdentifier`。这是W3C（World Wide Web Consortium）在WebDriver规范中定义的标准定位方式。

它的最大优势是跨平台。同一个Accessibility ID可以同时用于Android和iOS，不需要为两个平台写不同的定位逻辑：

```python
from appium.webdriver.common.appiumby import AppiumBy

# Accessibility ID定位
login_btn = driver.find_element(
    AppiumBy.ACCESSIBILITY_ID, "login_button"
)
login_btn.click()
```

但有个现实问题：不是所有App都设置了`content-desc`属性。很多开发者在写布局时只关注功能实现，忘了加无障碍标签。这导致Accessibility ID在实际项目中可用率并不高。

不过，如果你在自己开发的测试App上做自动化，强烈建议给关键元素都加上`content-desc`。这是一次性投入、长期受益的事情：

```xml
<!-- Android布局文件中添加content-desc -->
<Button
    android:id="@+id/login_button"
    android:contentDescription="login_button"
    android:text="登录" />
```

### 5.1.5 Class Name定位：粗糙但有用

Class Name定位是通过元素的类名来查找。在Android中，类名就是控件的Java类全名，比如`android.widget.TextView`、`android.widget.Button`。

这种定位方式比较粗糙，因为一个界面中通常有大量同类型的控件。所以Class Name定位很少单独使用，一般配合`find_elements`批量获取，再按条件筛选：

```python
from appium.webdriver.common.appiumby import AppiumBy

# 获取所有TextView
text_views = driver.find_elements(
    AppiumBy.CLASS_NAME, "android.widget.TextView"
)

# 提取所有文本内容
texts = [el.text for el in text_views if el.text]
print(texts)

# 获取所有ImageView的坐标
images = driver.find_elements(
    AppiumBy.CLASS_NAME, "android.widget.ImageView"
)
for img in images:
    print(img.location)
```

这个策略在爬虫场景中其实很实用。比如你想抓取一个列表页中所有商品的标题文本，直接用Class Name批量获取所有TextView，然后提取text属性，比逐个定位快得多。

### 5.1.6 CSS选择器定位：Android专供

在Appium 2.x中，CSS选择器定位仅适用于Android平台，底层依赖UIAutomator2的`BySelector`。对于有Web前端开发经验的读者来说，CSS选择器的语法非常亲切：

```python
from appium.webdriver.common.appiumby import AppiumBy

# CSS选择器定位
element = driver.find_element(
    AppiumBy.CSS_SELECTOR,
    "#search_input"
)

# 属性组合
element = driver.find_element(
    AppiumBy.CSS_SELECTOR,
    "[resource-id='com.example.app:id/title']"
    "[text='热门推荐']"
)
```

但要注意，Appium的CSS选择器和Web端的不完全一样。它不能使用`nth-child`、`:hover`等CSS伪类，因为底层映射的是UIAutomator2的选择器，不是真正的浏览器CSS引擎。

实际项目中CSS选择器用得不多，因为ID和XPath已经能覆盖绝大多数场景。但了解它的存在，在特定场景下能多一个选择。

### 5.1.7 Link Text定位：Webview中的残留

Link Text定位来自Selenium WebDriver（一个Web自动化测试框架），用于通过超链接文本定位`<a>`标签。在原生App自动化中几乎用不到，但当App内嵌了Webview（Web视图容器）时，处理里面的H5页面可能会用到：

```python
from appium.webdriver.common.appiumby import AppiumBy

# 在Webview中通过链接文本定位
link = driver.find_element(
    AppiumBy.LINK_TEXT, "查看更多"
)
link.click()

# 部分匹配
link = driver.find_element(
    AppiumBy.PARTIAL_LINK_TEXT, "更多"
)
```

这个定位策略在移动端爬虫中出场率极低，怕浪猫列出来主要是为了完整性。如果你发现App的数据展示在Webview里，更推荐直接切换到Chromium内核的调试模式，用Chrome DevTools Protocol（Chrome开发者工具协议）来操作，比Appium的Link Text灵活得多。

### 5.1.8 六种定位策略对比与选型决策树

在实际项目中，选择定位策略不需要纠结。怕浪猫画了一棵简单的决策树，按这个顺序往下走就行：

```
元素有resource-id且唯一？
  ├─ 是 → 用ID定位
  └─ 否 → 元素有content-desc？
      ├─ 是 → 用Accessibility ID定位
      └─ 否 → 元素有独特文本？
          ├─ 是 → 用XPath属性匹配
          └─ 否 → 用Class Name批量获取后筛选
```

CSS Selector和Link Text不在决策树里，因为前者仅Android且优势不明显，后者仅Webview场景。大多数情况下你用不到这两种。

下面是六种策略的全面对比：

| 策略 | 速度 | 稳定性 | 跨平台 | 适用场景 |
|------|------|--------|--------|---------|
| ID | 最快 | 高 | 否 | 元素有唯一resource-id |
| XPath | 慢 | 中 | 是 | 复杂层级关系，无ID时 |
| Accessibility ID | 快 | 高 | 是 | 元素有content-desc |
| Class Name | 中 | 低 | 是 | 批量获取同类元素 |
| CSS Selector | 快 | 中 | 仅Android | 有前端经验的开发者 |
| Link Text | 快 | 中 | 仅Webview | App内嵌H5页面 |

> 定位策略的选择优先级：ID > Accessibility ID > XPath > Class Name > CSS > Link Text。先从最稳最快的开始尝试，逐级降级。

### 5.1.9 实战：定位某新闻App的搜索入口

把六种策略串起来用一遍。目标是定位某新闻App首页的搜索框，点击进入搜索页：

```python
from appium.webdriver.common.appiumby import AppiumBy
from appium import webdriver

# Capabilities配置（简化版）
caps = {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2",
    "appium:appPackage": "com.example.news",
    "appium:appActivity": ".MainActivity"
}

driver = webdriver.Remote(
    "http://127.0.0.1:4723", caps
)

# 策略1：ID定位（优先尝试）
try:
    search = driver.find_element(
        AppiumBy.ID,
        "com.example.news:id/search_box"
    )
except Exception:
    # 策略2：XPath降级
    search = driver.find_element(
        AppiumBy.XPATH,
        "//android.widget.EditText"
        "[contains(@text, '搜索')]"
    )

search.click()
```

这段代码展示了实际项目中的标准思路：先用最稳的ID定位，失败了再降级到XPath。try-except的降级链路是工业级脚本的标配写法。

## 5.2 基础操作：点击/文本输入/清除文本

### 5.2.1 元素操作的三板斧

定位元素只是第一步，定位之后你要对元素做什么，才是自动化的核心。Appium中最常用的操作就三个：点击、输入、清除。掌握了这三个，80%的交互场景都能覆盖。

> 元素定位是找到门，基础操作是推开门。门都推不开，后面的事别想了。

### 5.2.2 点击操作：click()

click()是最基础的操作，它模拟用户点击屏幕上的某个元素。底层实现上，Appium会获取元素的bounds（边界坐标），计算出中心点，然后在该坐标模拟一次tap（轻触）事件：

```python
from appium.webdriver.common.appiumby import AppiumBy

# 定位并点击按钮
login_btn = driver.find_element(
    AppiumBy.ID, "com.example.app:id/login_button"
)
login_btn.click()
```

click()看起来简单，但有几个隐藏的坑：

**坑一：元素被遮挡。** 有时元素存在于界面上但被弹窗、广告浮层盖住了。click()会报`ElementNotInteractableException`。解决办法是先关闭遮挡物，或者用坐标点击绕过：

```python
from appium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.actions.pointer_input import PointerInput

# 获取元素坐标
rect = login_btn.rect
center_x = rect['x'] + rect['width'] // 2
center_y = rect['y'] + rect['height'] // 2

# 用坐标点击（绕过遮挡判断）
actions = ActionChains(driver)
actions.w3c_actions = ActionBuilder(
    driver, mouse=PointerInput(
        PointerInput.POINTER_TOUCH, "finger"
    )
)
actions.w3c_actions.pointer_action.move_to_location(
    center_x, center_y
)
actions.w3c_actions.pointer_action.click()
actions.perform()
```

**坑二：元素可点击区域小于视觉区域。** 有些Button控件的clickable区域比看起来小，点击边缘会无效。解决办法是获取元素中心点坐标，用`tap()`方法点击：

```python
# 获取元素rect
rect = login_btn.rect
x = rect['x'] + rect['width'] // 2
y = rect['y'] + rect['height'] // 2

# 用tap点击坐标
driver.tap([(x, y)], 500)
```

**坑三：click()太快导致App来不及响应。** 有些App的点击有防抖逻辑，连续快速点击会被忽略。在click()后加一个短暂等待，能让脚本稳定很多：

```python
import time

login_btn.click()
time.sleep(0.5)  # 给App一点喘息时间
```

### 5.2.3 文本输入：send_keys()

send_keys()向可编辑的元素（如EditText）输入文本。底层实现是通过IME（Input Method Editor，输入法编辑器）逐字符输入：

```python
# 定位输入框并输入文本
search_input = driver.find_element(
    AppiumBy.ID, "com.example.app:id/search_input"
)
search_input.clear()  # 先清空
search_input.send_keys("Python移动端爬虫")
```

send_keys()最大的坑是中文输入。默认情况下，Appium使用系统输入法输入文本，但很多模拟器的默认输入法不支持中文。有两种解决方案：

**方案一：使用Appium的内置输入法。** 在Capabilities中设置`appium:unicodeKeyboard`为True，Appium会安装一个专用的输入法来处理Unicode字符：

```python
caps = {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2",
    "appium:unicodeKeyboard": True,
    "appium:resetKeyboard": True
}
```

**方案二：使用ADB命令直接设置文本。** 这种方式绕过输入法，直接通过Android系统的`content`命令设置文本，速度更快但需要知道元素的具体信息：

```python
# 通过ADB直接输入文本（需先聚焦到输入框）
search_input.click()  # 先点击聚焦
driver.execute_script(
    'mobile: type', {
        'text': 'Python爬虫',
        'replace': True
    }
)
```

> 中文输入是Appium爬虫的第一个大坑。如果你发现send_keys()输入中文变成乱码或丢失，第一时间检查unicodeKeyboard配置。

### 5.2.4 清除文本：clear()

clear()清空元素中的文本内容。使用很简单，但有个注意点——它只清除可编辑元素的文本，对非可编辑元素调用会报错：

```python
# 定位输入框
username = driver.find_element(
    AppiumBy.ID, "com.example.app:id/username"
)

# 清空已有内容
username.clear()

# 输入新内容
username.send_keys("new_user")
```

实际项目中，clear()有时不够可靠。某些自定义输入框的文本清除逻辑比较特殊，clear()调用后文本没真的清掉。这时可以用"全选+删除"的组合操作：

```python
# 全选
driver.press_keycode(29, metastate=0x1000)  # Ctrl+A
# 删除
driver.press_keycode(67)  # Backspace
# 重新输入
username.send_keys("new_user")
```

### 5.2.5 其他常用操作速查

除了三板斧之外，还有一些操作在爬虫场景中经常用到。怕浪猫把它们整理成一个速查表：

| 方法 | 作用 | 示例 |
|------|------|------|
| `element.text` | 获取元素文本 | `title = el.text` |
| `element.is_displayed()` | 是否可见 | `if el.is_displayed()` |
| `element.is_enabled()` | 是否可交互 | `if el.is_enabled()` |
| `element.is_selected()` | 是否选中 | `if el.is_selected()` |
| `element.location` | 获取坐标 | `loc = el.location` |
| `element.size` | 获取尺寸 | `sz = el.size` |
| `element.rect` | 获取rect | `r = el.rect` |
| `element.get_attribute()` | 获取属性 | `el.get_attribute('text')` |
| `driver.swipe()` | 滑动屏幕 | `driver.swipe(x1,y1,x2,y2,duration)` |
| `driver.tap()` | 坐标点击 | `driver.tap([(x,y)], ms)` |
| `driver.press_keycode()` | 按键操作 | `driver.press_keycode(4)` |

其中`press_keycode`的常用键值：4=返回键，3=Home键，66=回车键，67=退格键。

### 5.2.6 实战：自动搜索并翻页

把基础操作串起来，写一个自动搜索+翻页加载的完整流程：

```python
import time
from appium.webdriver.common.appiumby import AppiumBy

# 1. 点击搜索入口
search_entry = driver.find_element(
    AppiumBy.ID, "com.example.app:id/search_entry"
)
search_entry.click()
time.sleep(1)

# 2. 输入关键词
search_input = driver.find_element(
    AppiumBy.ID, "com.example.app:id/search_input"
)
search_input.clear()
search_input.send_keys("Python教程")
time.sleep(0.5)

# 3. 触发搜索（回车）
driver.press_keycode(66)
time.sleep(2)

# 4. 上滑加载更多（翻页）
size = driver.get_window_size()
x = size['width'] // 2
y1 = int(size['height'] * 0.7)
y2 = int(size['height'] * 0.3)

for i in range(5):
    driver.swipe(x, y1, x, y2, 500)
    time.sleep(1.5)
    print(f"第{i+1}次滑动完成")
```

这段代码演示了爬虫场景中最典型的操作链路：进入搜索页 -> 输入关键词 -> 触发搜索 -> 滑动加载更多。每一步之间都加了`time.sleep`，这是最简单粗暴的等待方式。但说实话，这种写法在生产环境中是不合格的。原因我们下一节就讲。

## 5.3 显式等待与隐式等待

### 5.3.1 为什么需要等待

移动端App不是静态网页，元素的加载受到网络速度、设备性能、服务端响应等多种因素影响。你的脚本执行到"点击搜索按钮"这行代码时，搜索按钮可能还没渲染出来。直接定位一个不存在的元素，Appium会立即抛出`NoSuchElementException`。

> 不加等待的自动化脚本，就像蒙眼跑步——运气好到终点，运气差直接撞墙。

上面那段实战代码用了`time.sleep()`，这是"硬等待"——不管元素有没有出现，都死等指定秒数。问题很明显：等短了元素没出来，等长了浪费时间。一个脚本里如果有20个`time.sleep(2)`，每次执行就白白浪费40秒。

Appium提供了两种"智能等待"机制：隐式等待和显式等待。理解它们的区别和适用场景，是写出稳定脚本的关键。

### 5.3.2 隐式等待：全局兜底

隐式等待（Implicit Wait）是对Driver设置的全局等待策略。设置后，每次调用`find_element`时，如果元素没找到，Appium不会立即报错，而是在指定时间间隔内反复重试，直到找到元素或超时：

```python
from appium import webdriver

caps = {
    "platformName": "Android",
    "appium:automationName": "UiAutomator2",
    "appium:appPackage": "com.example.app",
    "appium:appActivity": ".MainActivity"
}

driver = webdriver.Remote("http://127.0.0.1:4723", caps)

# 设置隐式等待10秒
driver.implicitly_wait(10)

# 现在所有find_element调用都会自动重试
# 最多等待10秒
btn = driver.find_element(
    AppiumBy.ID, "com.example.app:id/button"
)
```

隐式等待的特点：

**全局生效。** 设置一次，对所有`find_element`和`find_elements`调用都生效，不需要每次都写等待逻辑。

**仅作用于元素查找。** 隐式等待只影响`find_element`系列方法，对`click()`、`send_keys()`等操作无效。如果元素已经找到但不可点击，隐式等待帮不了你。

**覆盖性。** 后设置的隐式等待会覆盖之前的设置。`driver.implicitly_wait(5)`之后再调用`driver.implicitly_wait(10)`，等待时间就变成10秒。

> 隐式等待是安全网，不是主力军。它保证脚本不至于因为元素晚出现一秒就崩掉，但精确的等待逻辑还得靠显式等待。

### 5.3.3 显式等待：精准狙击

显式等待（Explicit Wait）是针对特定条件的等待。你可以指定"等待某个元素可点击"、"等待某个元素包含特定文本"、"等待某个元素可见"等条件，只有条件满足时才继续执行。

显式等待使用`WebDriverWait`配合`expected_conditions`模块：

```python
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from appium.webdriver.common.appiumby import AppiumBy

# 显式等待：最多等15秒，每0.5秒检查一次
wait = WebDriverWait(driver, timeout=15, poll_frequency=0.5)

# 等待元素可点击
login_btn = wait.until(
    EC.element_to_be_clickable(
        (AppiumBy.ID, "com.example.app:id/login_btn")
    )
)
login_btn.click()

# 等待元素可见
title = wait.until(
    EC.visibility_of_element_located(
        (AppiumBy.XPATH, "//TextView[@text='加载完成']")
    )
)
print(title.text)

# 等待元素消失（加载动画消失）
wait.until(
    EC.invisibility_of_element_located(
        (AppiumBy.ID, "com.example.app:id/loading")
    )
)
print("加载完成，继续执行")
```

显式等待的核心是`expected_conditions`（预期条件）。这个模块提供了大量预定义条件，怕浪猫把最常用的几个整理如下：

| 条件方法 | 含义 |
|---------|------|
| `presence_of_element_located` | 元素出现在DOM中（不一定可见） |
| `visibility_of_element_located` | 元素可见 |
| `element_to_be_clickable` | 元素可点击 |
| `invisibility_of_element_located` | 元素不可见（通常用于等加载动画消失） |
| `text_to_be_present_in_element` | 元素包含特定文本 |
| `element_to_be_selected` | 元素被选中 |
| `title_contains` | 页面标题包含特定文本 |

### 5.3.4 自定义等待条件

预定义条件不够用时，可以写自定义等待条件。这在爬虫场景中非常实用，比如"等待列表中出现至少10个商品元素"：

```python
from selenium.webdriver.support.ui import WebDriverWait
from appium.webdriver.common.appiumby import AppiumBy

def at_least_n_elements(driver, locator, n):
    """等待至少出现n个匹配元素"""
    elements = driver.find_elements(*locator)
    if len(elements) >= n:
        return elements
    return False

# 使用自定义条件
items = WebDriverWait(driver, 20).until(
    lambda d: at_least_n_elements(
        d,
        (AppiumBy.ID, "com.example.app:id/item"),
        10
    )
)
print(f"找到{len(items)}个商品")
```

这种写法在实际爬虫项目中极为常用。列表页的数据是异步加载的，你需要确保数据加载完再提取，否则只能拿到前几条。自定义等待条件让你精确控制"什么时候算加载完"。

### 5.3.5 显式等待 vs 隐式等待：如何选择

两种等待策略的对比：

| 维度 | 隐式等待 | 显式等待 |
|------|---------|---------|
| 作用范围 | 全局所有元素查找 | 特定元素/条件 |
| 条件类型 | 仅"元素存在" | 可见/可点击/消失/自定义 |
| 精确度 | 低 | 高 |
| 代码量 | 一行设置 | 每处需单独写 |
| 执行速度 | 简单场景快 | 复杂场景更优 |
| 混用风险 | 与显式等待混用可能导致不可预期行为 | 独立运作，无副作用 |

怕浪猫的实战建议是：**隐式等待设一个较短的全局值（3-5秒）兜底，关键操作用显式等待精确控制。** 两者不要混用在同一个`find_element`调用上，否则等待时间可能叠加，导致不可预期的延迟。

> 等待策略的核心不是"等多久"，而是"等什么"。显式等待让你定义等待的条件，这才是精准控制的精髓。

### 5.3.6 等待策略速查清单

不同场景下的等待策略选择：

**场景一：页面跳转后查找元素。** 用显式等待，条件选`presence_of_element_located`。页面跳转需要时间，硬等不可靠。

**场景二：等加载动画消失。** 用显式等待，条件选`invisibility_of_element_located`。加载动画消失是数据加载完成的最可靠信号。

**场景三：表单提交后等结果。** 用显式等待，条件选`text_to_be_present_in_element`。等结果文本出现，而不是等固定时间。

**场景四：批量元素查找。** 用隐式等待兜底+显式等待的`at_least_n_elements`自定义条件。确保列表数据加载到足够数量。

**场景五：简单脚本快速验证。** 用隐式等待即可，不需要写显式等待的模板代码。

```python
# 综合等待策略示例
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from appium.webdriver.common.appiumby import AppiumBy
import time

# 全局隐式等待兜底
driver.implicitly_wait(5)

# 关键操作用显式等待
wait = WebDriverWait(driver, 15)

# 等加载动画消失
wait.until(EC.invisibility_of_element_located(
    (AppiumBy.ID, "com.example.app:id/loading")
))

# 等列表项出现
items = wait.until(EC.presence_of_all_elements_located(
    (AppiumBy.ID, "com.example.app:id/list_item")
))
print(f"加载到{len(items)}个列表项")
```

## 5.4 元素属性提取技巧

### 5.4.1 属性提取是爬虫的核心

前面三节讲的定位、操作、等待，最终都服务于一个目的：提取数据。在移动端爬虫中，数据不是从HTTP响应里解析的，而是从App界面元素中提取的。你需要拿到元素的文本、图片、坐标、状态等信息，然后把它们组织成结构化数据。

> 定位是找鱼，操作是抓鱼，属性提取是装鱼。没有最后这一步，前面所有努力都是白费。

### 5.4.2 get_attribute()：万能提取器

`get_attribute()`是提取元素属性的核心方法。它可以获取元素的所有属性，包括标准的和平台特有的：

```python
from appium.webdriver.common.appiumby import AppiumBy

element = driver.find_element(
    AppiumBy.ID, "com.example.app:id/title"
)

# 常用属性提取
text = element.get_attribute("text")        # 文本内容
rid = element.get_attribute("resource-id")  # 资源ID
cls = element.get_attribute("class")        # 类名
desc = element.get_attribute("content-desc") # 无障碍描述
chk = element.get_attribute("checked")      # 是否选中
enb = element.get_attribute("enabled")      # 是否可用
```

不同属性在不同场景下的用途：

| 属性 | 用途 | 爬虫场景 |
|------|------|---------|
| text | 元素显示的文本 | 抓取标题、价格、名称等数据 |
| resource-id | 元素唯一标识 | 判断元素身份 |
| content-desc | 无障碍描述 | 辅助识别元素 |
| class | 元素类型 | 区分文本、图片、按钮 |
| checked | 选中状态 | 判断开关、复选框状态 |
| enabled | 可用状态 | 判断按钮是否可点 |
| bounds | 边界坐标 | 截图定位、坐标计算 |
| displayed | 是否可见 | 判断元素是否在屏幕上 |

### 5.4.3 text属性：最常用的数据来源

text属性是爬虫中最频繁提取的属性。列表页的商品名称、价格、评价数，详情页的标题、正文、评论，基本都是从text属性中获取的：

```python
from appium.webdriver.common.appiumby import AppiumBy

# 批量提取列表项文本
items = driver.find_elements(
    AppiumBy.ID, "com.example.app:id/list_item"
)

results = []
for item in items:
    # 提取子元素的文本
    title = item.find_element(
        AppiumBy.ID, "com.example.app:id/item_title"
    ).get_attribute("text")
    
    price = item.find_element(
        AppiumBy.ID, "com.example.app:id/item_price"
    ).get_attribute("text")
    
    results.append({
        "title": title,
        "price": price
    })

print(f"提取到{len(results)}条数据")
```

text属性有个隐藏的坑：有些元素的文本不是存在text属性里，而是在`content-desc`里。如果你发现`get_attribute("text")`返回空字符串，但元素明明有文字显示，试试`get_attribute("content-desc")`。

### 5.4.4 rect属性：坐标与尺寸

rect属性返回元素的边界矩形信息，包含x、y、width、height四个值。这在截图、坐标计算、元素关系判断中非常有用：

```python
element = driver.find_element(
    AppiumBy.ID, "com.example.app:id/card"
)

rect = element.rect
print(f"位置: ({rect['x']}, {rect['y']})")
print(f"尺寸: {rect['width']} x {rect['height']}")
print(f"中心点: ({rect['x']+rect['width']//2}, "
      f"{rect['y']+rect['height']//2})")

# 判断元素是否在可视区域
win_size = driver.get_window_size()
is_visible = (
    rect['y'] >= 0 and
    rect['y'] + rect['height'] <= win_size['height']
)
print(f"元素在可视区域: {is_visible}")
```

在爬虫场景中，rect属性的一个典型应用是"判断列表是否滚动到底部"。当你滑动列表后，最后一个元素的y坐标+高度如果小于屏幕高度，说明还有更多内容；如果接近屏幕底部，说明已经到底了：

```python
import time

def scroll_to_bottom(driver):
    """滑动列表到底部，返回是否还有更多"""
    size = driver.get_window_size()
    x = size['width'] // 2
    
    # 获取当前最后一个可见元素
    items = driver.find_elements(
        AppiumBy.ID, "com.example.app:id/list_item"
    )
    if not items:
        return False
    
    last_rect = items[-1].rect
    bottom_y = last_rect['y'] + last_rect['height']
    
    # 滑动
    y1 = int(size['height'] * 0.7)
    y2 = int(size['height'] * 0.3)
    driver.swipe(x, y1, x, y2, 500)
    time.sleep(1)
    
    # 判断是否到底
    return bottom_y < size['height'] - 100
```

这个函数在实际爬虫中非常实用。它返回True表示列表还有更多内容可以滑动加载，返回False表示已经到底了。配合循环使用，就能实现"自动翻页直到加载完所有数据"的逻辑。

### 5.4.5 批量属性提取：性能优化技巧

当你需要从列表页提取大量元素属性时，逐个调用`get_attribute()`会非常慢。每次调用都是一次Appium Client到Server的HTTP往返，100个元素就要100次请求。

优化方案是使用`execute_script`配合`mobile: findElement`或`mobile: getAttributes`命令，一次性批量获取：

```python
# 批量获取所有列表项的文本（一次HTTP请求）
texts = driver.execute_script(
    'mobile: getAllText', {}
)
# 返回当前页面所有可见文本的列表

# 或者用findElements + map批量提取
result = driver.execute_script(
    """
    var els = arguments[0];
    var attrs = arguments[1];
    return els.map(function(el) {
        var obj = {};
        attrs.forEach(function(a) {
            obj[a] = el.getAttribute(a);
        });
        return obj;
    });
    """,
    items,  # 元素列表
    ['text', 'resource-id', 'bounds']  # 要提取的属性
)
```

这种批量提取的方式可以将100次HTTP请求压缩到1次，性能提升可达10倍以上。在数据量大的爬虫场景中，这个优化是必须做的。

> 性能优化的核心不是写得更快，而是请求更少。100次HTTP往返压缩到1次，比任何代码层面的优化都有效。

### 5.4.6 页面源码提取：dump XML

有时候你不确定界面上有哪些元素，也不知道该用什么属性去定位。这时候可以把整个页面的UI层级结构dump（导出）出来，当作XML分析：

```python
# 获取页面源码
page_source = driver.page_source
print(page_source[:500])  # 打印前500字符

# 保存到文件分析
with open("page_dump.xml", "w", encoding="utf-8") as f:
    f.write(page_source)
```

dump出来的XML就是Appium Inspector里看到的那棵UI树。你可以在本地用文本编辑器搜索、用XPath测试工具验证定位表达式，比在Inspector里一个个点元素高效得多。

实际项目中，怕浪猫的做法是：第一次接触一个新App时，先把每个关键页面的source dump出来存成文件，然后在文件里分析元素结构，写好定位表达式后再写自动化代码。这个习惯能大幅减少调试时间。

```python
# 实用工具函数：dump并分析页面结构
def dump_and_analyze(driver, filename="dump.xml"):
    """Dump页面源码并统计元素类型"""
    source = driver.page_source
    with open(filename, "w", encoding="utf-8") as f:
        f.write(source)
    
    # 统计各类型元素数量
    import xml.etree.ElementTree as ET
    root = ET.fromstring(source)
    tag_count = {}
    for elem in root.iter():
        tag = elem.tag
        tag_count[tag] = tag_count.get(tag, 0) + 1
    
    print(f"页面已保存到 {filename}")
    print("元素类型统计:")
    for tag, count in sorted(
        tag_count.items(), key=lambda x: -x[1]
    ):
        print(f"  {tag}: {count}")
    
    return source
```

### 5.4.7 截图与元素截图

截图在调试和数据采集中都有用。调试时，截图帮你确认脚本执行到某一步时界面状态是否正确。采集中，有些数据以图片形式展示（如商品图、验证码），需要截图保存。

Appium支持全屏截图和元素级截图：

```python
# 全屏截图
driver.save_screenshot("full_screen.png")

# 获取截图base64（用于网络传输）
import base64
img_b64 = driver.get_screenshot_as_base64()
img_data = base64.b64decode(img_b64)
with open("screen.png", "wb") as f:
    f.write(img_data)

# 元素级截图（只截取元素区域）
element = driver.find_element(
    AppiumBy.ID, "com.example.app:id/product_image"
)
element.screenshot("element.png")
```

元素截图在爬虫中的一个典型应用是验证码识别。很多App的登录有图形验证码，你可以定位到验证码图片元素，截图后丢给OCR（Optical Character Recognition，光学字符识别）引擎识别：

```python
# 验证码识别流程
captcha_el = driver.find_element(
    AppiumBy.ID, "com.example.app:id/captcha"
)
captcha_el.screenshot("/tmp/captcha.png")

# 调用OCR识别（需安装ddddocr库）
import ddddocr
ocr = ddddocr.DdddOcr()
with open("/tmp/captcha.png", "rb") as f:
    result = ocr.classification(f.read())

print(f"验证码识别结果: {result}")

# 填入验证码
code_input = driver.find_element(
    AppiumBy.ID, "com.example.app:id/captcha_input"
)
code_input.send_keys(result)
```

### 5.4.8 数据提取实战：抓取商品列表

把前面学的属性提取技巧综合起来，写一个完整的商品列表数据采集函数：

```python
import time
import json
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def scrape_product_list(driver, max_pages=10):
    """采集商品列表数据"""
    results = []
    
    for page in range(max_pages):
        # 等待列表项加载
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located(
                (AppiumBy.ID,
                 "com.example.app:id/product_item")
            )
        )
        
        # 批量获取列表项
        items = driver.find_elements(
            AppiumBy.ID,
            "com.example.app:id/product_item"
        )
        
        for item in items:
            try:
                data = {
                    "title": item.find_element(
                        AppiumBy.ID,
                        "com.example.app:id/title"
                    ).get_attribute("text"),
                    "price": item.find_element(
                        AppiumBy.ID,
                        "com.example.app:id/price"
                    ).get_attribute("text"),
                    "sales": item.find_element(
                        AppiumBy.ID,
                        "com.example.app:id/sales"
                    ).get_attribute("text"),
                }
                results.append(data)
            except Exception as e:
                print(f"提取失败: {e}")
                continue
        
        print(f"第{page+1}页: 采集{len(items)}条")
        
        # 上滑加载下一页
        size = driver.get_window_size()
        driver.swipe(
            size['width']//2,
            int(size['height']*0.7),
            size['width']//2,
            int(size['height']*0.3),
            500
        )
        time.sleep(1.5)
    
    return results

# 调用
data = scrape_product_list(driver, max_pages=5)
print(json.dumps(data[:3], ensure_ascii=False, indent=2))
```

这段代码整合了元素定位（ID定位）、等待策略（显式等待）、属性提取（get_attribute）、滑动操作（swipe），是一个微型但完整的移动端爬虫。在实际项目中，你只需要把`com.example.app:id/xxx`替换成目标App的真实resource-id，就能直接跑起来。

### 5.4.9 属性提取的容错处理

实际爬虫中，元素的结构不可能总是和预期一致。网络异常导致某些字段没加载出来、App版本更新导致resource-id变化、某些商品没有价格信息——这些都需要容错处理。

怕浪猫总结了三条容错原则：

**原则一：每个字段单独try-except。** 不要把所有字段的提取放在一个try块里，一个字段失败会导致后面的字段全被跳过。

**原则二：用默认值填充缺失字段。** 找不到的字段用None或空字符串填充，保证数据结构一致性。

**原则三：记录失败日志。** 哪个元素、哪个字段提取失败了，记下来。跑完之后分析失败率，决定是否需要优化定位策略。

```python
def safe_extract(element, by, value, attr="text"):
    """安全提取元素属性"""
    try:
        el = element.find_element(by, value)
        return el.get_attribute(attr)
    except Exception:
        return None

# 使用示例
data = {
    "title": safe_extract(
        item, AppiumBy.ID, "com.example.app:id/title"
    ),
    "price": safe_extract(
        item, AppiumBy.ID, "com.example.app:id/price"
    ),
    "sales": safe_extract(
        item, AppiumBy.ID, "com.example.app:id/sales"
    ) or "0",  # 默认值
}
```

这个`safe_extract`函数是怕浪猫在每个爬虫项目里都会用的基础工具。它简单但有效，能让你的脚本在面对不稳定的App界面时不会轻易崩溃。

> 爬虫的健壮性不在于写了多少行代码，而在于处理了多少种"异常情况"。每多一个容错分支，脚本就多一层铠甲。

## 5.5 本章总结

这一章我们从四个维度把Appium的常用操作彻底讲透了：

**元素定位。** 六种策略各有适用场景，ID优先、XPath兜底、Accessibility ID跨平台、Class Name批量获取。实际项目中不要死磕一种策略，根据元素特征灵活选择。

**基础操作。** 点击、输入、清除是三板斧，覆盖80%的交互需求。中文输入需配置unicodeKeyboard，坐标点击能绕过元素遮挡问题。

**等待策略。** 隐式等待全局兜底，显式等待精准狙击。核心原则是"等条件而不是等时间"。自定义等待条件在列表页数据采集场景中极为重要。

**属性提取。** get_attribute()是万能提取器，text是最常用的数据来源。批量提取能大幅提升性能，容错处理保证脚本健壮性。

这四块技能的组合，就是移动端爬虫的基本功。后面章节我们会进入更高级的主题——手势操作、混合应用处理、多设备并行——但底层都离不开这些基础。

> 基础不牢，地动山摇。这章的内容看起来简单，但简单不等于可以跳过。每个知识点都值得你打开编辑器敲一遍代码，跑一遍真实App。

## 下章预告

第6章我们将进入"Appium高级手势操作与屏幕滑动策略"。移动端爬虫最核心的操作之一就是滑动——翻页加载、下拉刷新、横向切换、手势验证码。Appium的TouchAction和W3C Actions API能实现极其复杂的手势组合，但也藏着不少坑。怕浪猫会带你从单点触控到多点触控，从简单滑动手势到复杂手势链，把移动端最核心的交互手段彻底讲明白。

---

系列进度 5/17

怕浪猫说：写爬虫脚本就像盖房子，元素定位是打地基，基础操作是砌墙，等待策略是水泥，属性提取是装修。地基打歪了墙会倒，水泥没搅匀墙会裂，装修偷懒了住着不舒坦。这章的内容没有花哨的技巧，但每一步都决定了你后面能爬多高。把基础打扎实了，后面的高级操作学起来才会丝滑。咱们下章见。
