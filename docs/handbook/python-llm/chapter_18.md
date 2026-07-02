# 第18章 Agent与MCP — 从语言到行动的终极进化

你问大模型"帮我查一下明天北京的天气，然后如果下雨就帮我订一把雨伞"，模型给你回了一段漂亮的文字，告诉你明天北京的概率降水情况，甚至还贴心地分析了风力湿度。然后呢？然后就没有然后了。你得自己打开天气App确认，自己打开购物网站搜雨伞，自己下单，自己跟踪物流。模型只是一个"嘴替"，说得天花乱坠，手却一只都没有。

你问模型"帮我把这个CSV文件里的数据清洗一下，去掉重复行，然后按销售额降序排个序"，它给你写了一段Python代码，你复制粘贴到编辑器里，手动改路径，手动跑，跑完发现有个小bug，又得回去问模型，模型再给你改——来来回回好几次。如果模型能自己执行代码、自己看结果、自己改bug，那该多好？

这就是Agent要解决的问题。前面的章节里，我们给LLM装上了"记忆"（RAG），让它能查资料再回答。但查完资料它还是只能"说"，不能"做"。Agent（Agent，智能体）就是给LLM装上"手"和"脚"，让它从语言走向行动，从"告诉你怎么做"变成"替你做"。

我是怕浪猫，一个在LLM工程化战场上踩了无数坑的老兵。从最早手搓Function Calling的循环逻辑，到后来用LangChain搭Agent，再到现在基于MCP（MCP，Model Context Protocol，模型上下文协议）构建标准化工具生态，我完整经历了Agent技术栈的野蛮生长过程。这章是整个系列的第18章，前面我们搞定了RAG（RAG，Retrieval-Augmented Generation，检索增强生成）和模型微调，现在该让LLM真正"动"起来了。

> LLM是一座金矿，但如果你只让它"说"不让它"做"，那等于守着金矿要饭。Agent就是那把铲子。

## 18.1 Agent工作原理

### 18.1.1 Agent到底是什么

Agent这个词在AI领域被用烂了，每个人嘴里的"Agent"可能指的不是同一个东西。怕浪猫先来做一个精确的定义。

Agent（Agent，智能体）是一个以LLM为大脑、以工具为手脚、以记忆为经验、以规划为意图的自主系统。它和普通LLM对话的核心区别在于"自主性"——普通对话是"你问一句，它答一句"，Agent是"你给一个目标，它自己拆解步骤、调用工具、观察结果、调整策略，直到完成目标"。

用一个不太严谨但很直观的类比：普通LLM是一个"顾问"，你问他问题，他给你建议；Agent是一个"员工"，你给他布置任务，他自己去干，干不完不下班。

Agent的完整公式可以写成：

```
Agent = LLM（大脑） + Tools（工具） + Memory（记忆） + Planning（规划）
```

这四个组件缺一不可。LLM负责理解和推理，Tools负责和外部世界交互，Memory负责记住历史经验，Planning负责把复杂目标拆解成可执行的步骤。少了任何一个，Agent就退化成一个"残缺品"——没有工具的Agent只能空谈，没有记忆的Agent每次都从零开始，没有规划能力的Agent只能处理单步任务。

怕浪猫在实际项目中见过很多人把"带Function Calling的LLM"就叫做Agent，这其实是不准确的。Function Calling只是Agent的一个子能力——工具调用。真正的Agent还需要有自主决策的循环逻辑、记忆管理、任务规划。不过话说回来，业界对Agent的定义确实比较模糊，你叫它Agent也没人能说你错，只是技术实现上有深浅之分。

### 18.1.2 Agent循环：感知-规划-行动-观察

Agent的核心运行机制是一个循环，怕浪猫称之为"Agent Loop"。这个循环包含四个阶段：

```
用户输入目标
    ↓
┌─→ 感知（Perceive）：接收当前状态信息
│   ↓
│   规划（Plan）：LLM思考下一步该做什么
│   ↓
│   行动（Act）：调用工具执行
│   ↓
│   观察（Observe）：获取工具返回结果
│   ↓
│   判断：目标是否完成？
│   ├─ 否 → 回到感知（继续循环）
│   └─ 是 → 输出最终结果
```

这个循环是Agent的灵魂。每一轮循环中，LLM都会拿到当前的全部上下文（包括之前的行动和观察结果），重新思考下一步该做什么。这意味着Agent可以根据工具的返回结果动态调整策略——如果某个工具调用失败了，它可以换一个工具；如果搜索结果不理想，它可以换个关键词重新搜索；如果发现当前方案走不通，它可以回退重新规划。

这和人类解决问题的方式非常相似。你让一个人去"买一本《深度学习》的书"，他的行为过程大概是：先想到去网上买（规划），然后打开京东搜索（行动），发现没货（观察），于是换淘宝搜索（重新规划），找到了但太贵（观察），又去拼多多搜（重新规划），下单（行动），完成。Agent做的事情本质上是一样的，只不过把人类的判断换成了LLM的推理。

理解这个循环的关键在于"自主性"三个字。传统的程序是"你写好流程，程序按流程执行"，程序本身没有决策权。Agent不同——你给它一个目标，它自己决定怎么完成。路径不是预设的，而是在运行时动态产生的。这意味着同一个Agent面对同一个任务，两次执行的路径可能完全不同。好事是灵活性极高，坏事是不可预测——你无法提前知道Agent会走哪条路。这也是为什么Agent的测试和调试比传统程序难得多——你没法穷举所有可能的执行路径。

> Agent的精髓不在于"能用工具"，而在于"能用工具失败后还能换一种方式继续试"。

来看一个最简化的Agent循环代码，帮你理解这个机制：

```python
import json

def agent_loop(llm, tools, user_goal, max_steps=10):
    messages = [{"role": "user", "content": user_goal}]
    for step in range(max_steps):
        # 感知+规划：LLM决定下一步
        response = llm.chat(messages, tools=tools)
        msg = response.choices[0].message
        
        # 判断是否完成（没有工具调用=最终回答）
        if not msg.tool_calls:
            return msg.content
        
        # 行动：执行工具调用
        messages.append(msg)
        for call in msg.tool_calls:
            result = execute_tool(call, tools)
            # 观察：把结果加入上下文
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": json.dumps(result, ensure_ascii=False)
            })
    return "达到最大步数，Agent未能完成任务"
```

这段代码虽然简单，但已经包含了Agent循环的全部核心要素。`llm.chat`同时承担了感知和规划的功能——它接收当前所有消息（感知），然后决定是调用工具还是给出最终回答（规划）。`execute_tool`是行动阶段。把结果塞回`messages`是观察阶段。循环往复，直到LLM认为任务完成（不再调用工具，直接给出文本回答）或者达到最大步数限制。

注意那个`max_steps`参数——这是Agent的"安全阀"。Agent有可能陷入无限循环，比如反复调用同一个工具但参数不同，或者在两个工具之间来回切换却不推进任务。`max_steps`确保即使Agent"疯了"，也不会一直消耗Token。怕浪猫在实际项目中见过一个Agent为了搜索一个不存在的文件，换了十几种关键词连续搜索了47轮，最后被`max_steps`截停。没有这个限制，它能搜到天荒地老。

### 18.1.3 ReAct模式：推理与行动的交织

ReAct（ReAct，Reasoning and Acting，推理与行动）是Agent最经典的推理范式，由Yao等人在2022年提出。它的核心思想是让LLM在每一步中先"想"再"做"——先输出推理过程（Thought），再输出行动（Action），然后观察结果（Observation），如此循环。

一个典型的ReAct流程长这样：

```
Thought: 用户想了解Python 3.12的新特性，我需要搜索相关信息
Action: search("Python 3.12 new features")
Observation: Python 3.12引入了类型参数语法、f-string改进...
Thought: 搜索结果提到了类型参数语法，但细节不够，我需要进一步搜索
Action: search("Python 3.12 type parameter syntax PEP 695")
Observation: PEP 695引入了新的type语句...
Thought: 现在我有足够的信息来回答用户的问题了
Action: finish("Python 3.12的主要新特性包括...")
```

ReAct的精妙之处在于那个Thought步骤。如果没有Thought，LLM直接从用户问题跳到工具调用，它可能选错工具或用错参数。Thought强制LLM在行动前"想一想"——当前信息够不够、该用什么工具、参数应该怎么填。这大大提高了工具调用的准确率。

怕浪猫在早期做Agent的时候，犯过一个经典错误——觉得Thought步骤"浪费Token"，把它去掉了，让LLM直接输出工具调用。结果Agent的的工具调用准确率从85%掉到了60%。因为没有了显式的推理步骤，LLM经常在不理解问题的情况下就急急忙忙调工具，参数填错、工具选错都是家常便饭。后来老老实实把Thought加回来，准确率立刻回升。这个教训让怕浪猫深刻理解了一个道理：在Agent系统中，"想清楚再干"比"快速干"重要得多。

> 省掉推理步骤的Agent就像不思考就动手的程序员——看起来效率高，实际上Bug率更高。

再来看ReAct模式的一个实际应用场景。假设用户问"帮我分析一下Python和Rust在Web开发领域的优劣势对比"。ReAct模式的Agent会这样运作：先Thought推理"我需要分别搜索Python和Rust的Web开发生态信息"，然后Action调用搜索工具查Python Web框架，Observation拿到Django、Flask等框架信息；接着Thought"现在需要Rust方面的信息"，Action搜索Rust Web框架，Observation拿到Actix、Axum等框架信息；再Thought"信息够了，可以综合分析了"，Final Answer输出对比分析。整个过程中，Agent的每一步思考都清晰可见，你可以看到它为什么选择搜索这些关键词、它是如何组织信息的。这种透明度在调试时价值极高——当Agent给出一个奇怪的结果时，你可以回溯它的Thought链路，找到是哪一步推理出了问题。

## 18.2 Agent常见模式

### 18.2.1 ReAct模式：推理+行动

ReAct模式上面已经介绍了核心思想，这里补充一些工程实现中的关键细节。

在实际代码中，ReAct模式通常通过Prompt Engineering来实现。你需要在System Prompt中告诉LLM：先用Thought推理，再用Action行动。然后解析LLM的输出，提取出Action部分去执行工具。这比直接用Function Calling接口多了一层"显式推理"，但在工具选择准确率和多步推理质量上有明显优势。

```python
REACT_PROMPT = """你是一个能使用工具的智能助手。
请严格按以下格式回复：

Thought: 你的推理过程
Action: 工具名称
Action Input: 工具参数(JSON格式)

当你认为已经有了最终答案，使用：
Thought: 我的推理过程
Final Answer: 最终回答

可用工具:
{tools_description}
"""
```

ReAct模式的优势在于可解释性强——你能看到LLM每一步的推理过程，方便调试。缺点是Token消耗更大，因为每一步都要输出一段Thought文本。在Token预算紧张的场景下，可以用Function Calling接口替代ReAct，让LLM直接输出结构化的工具调用，省去Thought的Token开销。但怕浪猫建议在开发调试阶段用ReAct，上线后再考虑切换到Function Calling模式。

### 18.2.2 Plan-and-Execute模式：先规划后执行

ReAct是"走一步看一步"的模式，每一步都基于上一步的观察结果来决策。这在简单任务上很好用，但在复杂任务上容易跑偏——因为Agent缺乏全局视野，每一步都是局部最优，但全局来看可能走了很多弯路。

Plan-and-Execute（Plan-and-Execute，规划与执行）模式把任务分成两个阶段：先让LLM制定一个完整的计划（Plan），然后逐步执行计划中的每个步骤（Execute）。如果在执行过程中发现计划不合理，可以回到规划阶段重新制定。

```
用户目标: "帮我分析竞品A的产品定位和定价策略"
    ↓
规划阶段:
  Step 1: 搜索竞品A的基本信息
  Step 2: 搜索竞品A的产品线
  Step 3: 搜索竞品A的定价信息
  Step 4: 搜索竞品A的用户评价
  Step 5: 综合分析并输出报告
    ↓
执行阶段:
  逐步执行Step 1-5，每步执行后记录结果
  如果某步失败或信息不足，调整后续计划
```

Plan-and-Execute模式的优势在于全局视角——先想清楚整个任务怎么做，再动手。这减少了中途跑偏的概率，也更容易做并行执行（如果步骤之间没有依赖关系）。缺点是规划阶段可能不够准确——LLM在还没开始执行的时候，对任务的理解是最浅的，制定的计划可能不切实际。比如它可能规划了"搜索竞品A的定价信息"，但实际搜索后发现竞品A的定价信息是保密的，根本搜不到，这时候就得重新规划。

怕浪猫在实际项目中用Plan-and-Execute模式踩过一个深坑：LLM在规划阶段生成了一个详细的12步计划，看起来逻辑清晰、步步推进。但执行到第4步时发现前提假设就是错的——第1步搜索的信息被LLM误解了，导致后面所有基于这个信息的步骤都跑偏了。更糟糕的是，Agent没有意识到前提错了，还在机械地执行后续步骤，直到所有步骤执行完，输出了一份基于错误前提的"完整报告"。这个案例让怕浪猫意识到：Plan-and-Execute模式需要一个"计划校验"环节——在执行了关键步骤后，回头检查计划是否还成立，如果不成立就重新规划。这类似于人类的"里程碑回顾"——每走几步看看方向对不对，而不是闷着头走到终点才发现走错了。

怕浪猫的实战经验是：对于步骤在5步以内的简单任务，用ReAct模式就够了；对于步骤超过5步、或者有明确阶段划分的复杂任务，用Plan-and-Execute模式更合适。也可以两者结合——先Plan出一个粗粒度的计划，然后在执行每个计划步骤时用ReAct模式做细粒度的推理和工具调用。

> ReAct像游击战，灵活但缺乏全局视野；Plan-and-Execute像阵地战，有条理但不够灵活。最好的策略是根据战场情况切换战术。

### 18.2.3 Reflection模式：自我反思

Reflection（Reflection，反思）模式让Agent在执行完一个动作后，对自己的行为进行评估和反思——这步做得对不对？结果好不好？下一步该怎么改进？

这个模式的灵感来自人类的"自我反思"能力。一个有经验的程序员写完代码后会review一遍，发现潜在问题再修改。Reflection让Agent具备类似的能力：执行完一步后，不急着进入下一步，而是先"回头看看"，评估自己的表现，如果发现问题就修正。

```python
REFLECTION_PROMPT = """你刚刚执行了以下动作：
动作: {action}
结果: {result}

请评估：
1. 这个动作是否达到了预期目的？
2. 结果是否完整、准确？
3. 是否有更好的替代方案？
4. 下一步应该做什么？

如果发现错误或不足，请指出并给出改进建议。
"""
```

Reflection模式在代码生成、论文写作等需要反复打磨的场景中效果特别好。怕浪猫做过一个实验：让Agent写一段数据处理代码，不加Reflection时一次通过率是55%，加了Reflection后提升到了78%。因为Agent在"反思"阶段经常能发现自己代码里的边界条件遗漏、变量名拼写错误、异常处理缺失等问题，然后主动修正。

不过Reflection也有代价——它增加了每步的Token消耗和延迟。如果任务本身比较简单，或者对响应时间要求很高，Reflection的性价比可能不高。怕浪猫建议在质量优先的场景（如代码生成、文档撰写）开启Reflection，在速度优先的场景（如快速问答、简单查询）关闭Reflection。

Reflection模式还有一个进阶用法——"双Agent反思"。让两个Agent互相审核对方的工作：Agent A生成代码，Agent B审核代码并提出修改建议，Agent A根据建议修改，Agent B再审核，直到双方都满意。这种"对抗式反思"比单Agent自我反思的效果更好，因为"当局者迷，旁观者清"——生成者很难发现自己思维中的盲区，但另一个Agent从不同角度审视就能发现问题。代价是Token消耗翻倍，所以只适用于对质量要求极高的场景。

### 18.2.4 Multi-Agent模式：多智能体协作

当一个Agent的能力不够用时，可以让多个Agent协作完成任务。每个Agent负责自己擅长的领域，通过消息传递来协调工作。这就是Multi-Agent（Multi-Agent，多智能体）模式。

怕浪猫在实际项目中用过的一个典型Multi-Agent架构：

```
用户需求: "开发一个用户注册登录模块"
    ↓
┌─────────────────────────────────────┐
│  Product Agent（产品经理）           │
│  负责需求分析、拆解任务、分配工作      │
└──────────┬──────────────────────────┘
           ↓
    ┌──────┴──────┐
    ↓             ↓
┌─────────┐  ┌─────────┐
│ Dev Agent │  │ Test Agent │
│ 写代码     │  │ 写测试用例  │
└─────┬───┘  └─────┬───┘
      ↓            ↓
      └──────┬─────┘
             ↓
┌──────────────────┐
│ Review Agent（审核）│
│ 代码审查、质量把控  │
└──────────────────┘
```

Product Agent负责把用户需求拆解成具体的开发任务，Dev Agent根据任务写代码，Test Agent根据任务写测试用例，Review Agent审核代码质量。四个Agent各司其职，通过共享的消息板（通常是共享的对话历史或文件）来交换信息。

Multi-Agent模式的优势在于"专业化"——每个Agent只需要在自己擅长的领域内工作，System Prompt可以针对特定角色优化，工具集也可以精简。劣势在于协调成本高——Agent之间的消息传递、任务分配、冲突处理都需要额外的逻辑。而且Multi-Agent系统的调试难度远大于单Agent——当输出结果有问题时，你很难定位是哪个Agent出了错。

Multi-Agent系统中最难解决的是"共识达成"问题。当两个Agent对同一个问题给出不同答案时，系统怎么决定用哪个？比如Dev Agent说这段代码没问题可以提交，Review Agent说这段代码有安全漏洞必须重写——听谁的？常见策略有三种：一是"仲裁者"模式，引入一个第三方Agent做裁决；二是"投票"模式，多个Agent投票少数服从多数；三是"优先级"模式，给每个Agent设优先级，冲突时高优先级的Agent说了算。每种策略都有适用场景，怕浪猫用得最多的是仲裁者模式——因为仲裁者Agent可以做深度分析后再做决定，而不是简单的多数决。

| 模式 | 适用场景 | 优势 | 劣势 | Token消耗 |
|------|---------|------|------|----------|
| ReAct | 简单到中等复杂度任务 | 可解释性强、灵活 | 缺乏全局规划 | 中 |
| Plan-and-Execute | 复杂多步骤任务 | 全局视角、可并行 | 规划可能不切实际 | 中高 |
| Reflection | 质量优先场景 | 自我纠错、质量高 | 增加延迟和Token | 高 |
| Multi-Agent | 多领域协作任务 | 专业化、可扩展 | 协调复杂、调试难 | 很高 |

> 选Agent模式就像选武器——没有最好的，只有最适合当前战场的。怕浪猫的建议是：从ReAct开始，简单任务够用；不够了再加Plan；质量不行再加Reflection；一个Agent搞不定再上Multi-Agent。

## 18.3 Agent调用工具

### 18.3.1 工具定义与描述

工具是Agent的手脚，没有工具的Agent就是一个只会说不会做的空壳。但"有工具"和"会用工具"之间，差了一个关键环节——工具定义。

LLM不会自动知道有哪些工具可用、每个工具是干什么的、参数应该怎么传。你需要通过结构化的方式把工具信息告诉LLM。这个过程叫"工具定义"或"工具描述"。

一个好的工具定义包含三个部分：工具名称（简短且语义明确）、工具描述（这个工具能干什么、什么时候该用）、参数定义（每个参数的类型、含义、是否必填）。

```python
# 工具定义示例
tools = [{
    "type": "function",
    "function": {
        "name": "search_web",
        "description": "在互联网上搜索信息。当需要查找最新新闻、天气、股价等实时信息时使用。",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
                "num_results": {"type": "integer", "description": "返回结果数量，默认5", "default": 5}
            },
            "required": ["query"]
        }
    }
}, {
    "type": "function",
    "function": {
        "name": "calculate",
        "description": "执行数学计算。支持加减乘除、幂运算、三角函数等。当需要精确数值计算时使用。",
        "parameters": {
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "数学表达式，如 '2+3*4'"}
            },
            "required": ["expression"]
        }
    }
}]
```

工具描述的质量直接决定了Agent工具调用的准确率。怕浪猫踩过一个大坑：有个工具叫`get_data`，描述写的是"获取数据"。结果LLM在任何需要"获取数据"的场景下都调用这个工具，但这个工具实际上是用来从数据库获取用户数据的，不是用来搜索网页数据的。后来把描述改成"从用户数据库中获取指定用户的个人信息和订单数据"，误调用率立刻下降了80%。

工具描述的黄金法则：**描述要告诉LLM"什么时候该用"和"什么时候不该用"，而不只是"这个工具能干什么"**。比如搜索引擎工具的描述，除了说"搜索互联网信息"，还应该加上"当需要查找实时信息或模型训练数据中可能没有的新知识时使用；对于常识性问题不需要使用此工具"。这样能有效减少不必要的工具调用。

还有一个容易被忽略的细节——参数描述同样重要。参数描述不仅要说明参数是什么类型，还要说明参数应该怎么填、格式是什么、有没有约束条件。比如一个发邮件工具的"收件人"参数，如果只写"收件人邮箱地址"，LLM可能传"张三 <zhangsan@example.com>"这种带名称的格式，也可能传"zhangsan@example.com, lisi@example.com"这种多人的格式。你需要在参数描述里明确："单个收件人邮箱，格式为纯邮箱地址不含名称，如 zhangsan@example.com。如需发送给多人请使用cc参数"。这种精确的参数描述能大幅减少参数格式错误导致的工具调用失败。

> 工具描述写给LLM看，就像API文档写给程序员看——文档写得不清楚，调用方就会用错。区别是程序员用错了会报错，LLM用错了会"自信地给你一个错误结果"。

### 18.3.2 Function Calling接口

Function Calling（Function Calling，函数调用）是现代LLM API提供的标准化工具调用接口。你把工具定义传给API，LLM在需要时返回结构化的工具调用请求（工具名+参数），你执行工具后把结果传回API，LLM基于结果继续推理。

主流LLM的Function Calling流程大同小异，以OpenAI兼容接口为例：

```python
import openai

def chat_with_tools(user_message, tools, messages=None):
    if messages is None:
        messages = []
    messages.append({"role": "user", "content": user_message})
    # LLM决定是否需要调用工具
    response = openai.chat.completions.create(
        model="gpt-4o", messages=messages,
        tools=tools, tool_choice="auto"
    )
    msg = response.choices[0].message
    messages.append(msg)
    if not msg.tool_calls:  # 没有工具调用=直接回答
        return msg.content
    # 执行工具调用并返回结果
    for tc in msg.tool_calls:
        args = json.loads(tc.function.arguments)
        result = execute_function(tc.function.name, args)
        messages.append({"role": "tool", "tool_call_id": tc.id,
                         "content": json.dumps(result, ensure_ascii=False)})
    # LLM基于工具结果生成最终回答
    final = openai.chat.completions.create(model="gpt-4o", messages=messages, tools=tools)
    return final.choices[0].message.content
```

注意`tool_choice`参数——它控制LLM的工具调用行为。`auto`让LLM自己决定是否需要调用工具，`none`禁止调用工具，`required`强制必须调用工具，还可以指定具体的工具名。在开发调试时，怕浪猫喜欢用`auto`让LLM自由发挥；在生产环境中，有时会用`required`+指定工具来确保LLM一定走工具调用路径，避免它"偷懒"直接回答。

Function Calling的一个隐坑是参数解析。LLM返回的参数是JSON字符串，但这个JSON有时候不规范——比如字符串里的引号没转义、数字用了字符串形式、多了或少了字段。所以解析时一定要做容错处理：

```python
import json

def safe_parse_tool_args(args_str):
    try:
        return json.loads(args_str)
    except json.JSONDecodeError:
        # 尝试修复常见的JSON格式错误
        fixed = args_str.replace("'", '"')
        try:
            return json.loads(fixed)
        except:
            return {"_raw": args_str, "_error": "参数解析失败"}
```

### 18.3.3 多工具编排

当Agent有多个工具可用时，就涉及"工具编排"问题——LLM需要决定先用哪个工具、后用哪个工具、是否需要组合使用多个工具。

多工具编排有两种主要模式：串行编排和并行编排。

串行编排是最常见的模式——LLM按顺序调用工具，每一步的输出作为下一步的输入。比如用户问"北京明天的天气怎么样，适合穿什么衣服"，Agent的编排可能是：先调`search_weather("北京", "明天")`获取天气，再调`search_clothing_advice(temperature, weather)`获取穿衣建议。第二个工具的参数依赖第一个工具的结果，必须串行执行。

并行编排适用于多个工具调用之间没有依赖关系的场景。比如用户问"苹果公司和微软公司最新的股价分别是多少"，Agent可以同时调用`get_stock_price("AAPL")`和`get_stock_price("MSFT")`，两个调用互不依赖，并行执行可以减少总响应时间。

```python
# 并行工具调用处理
async def execute_parallel_tool_calls(tool_calls, tool_registry):
    """并行执行LLM请求的多个工具调用"""
    import asyncio
    tasks = []
    for call in tool_calls:
        func_name = call.function.name
        func_args = json.loads(call.function.arguments)
        if func_name in tool_registry:
            task = asyncio.create_task(
                tool_registry[func_name](**func_args)
            )
            tasks.append((call.id, task))
    
    results = []
    for call_id, task in tasks:
        try:
            result = await task
            results.append({
                "tool_call_id": call_id,
                "content": json.dumps(result, ensure_ascii=False)
            })
        except Exception as e:
            results.append({
                "tool_call_id": call_id,
                "content": json.dumps({"error": str(e)})
            })
    return results
```

现代LLM（如GPT-4o、Claude 3.5）已经原生支持并行工具调用——它们可以在一次响应中返回多个`tool_calls`，你的代码只需要并行执行这些调用即可。但要注意，不是所有LLM都支持并行调用，有些模型一次只能调一个工具，需要多次串行调用。

### 18.3.4 工具调用失败处理

工具调用失败是Agent开发中最常见的坑。网络超时、API限流、参数格式错误、工具内部异常——各种失败场景层出不穷。如果你的Agent没有完善的失败处理机制，一个工具调用失败就可能导致整个Agent卡死或崩溃。

怕浪猫总结的失败处理策略：

```python
def execute_tool_with_retry(tool_call, tool_registry, max_retries=3):
    func_name = tool_call["name"]
    func_args = tool_call["args"]
    
    for attempt in range(max_retries):
        try:
            result = tool_registry[func_name](**func_args)
            return {"status": "success", "data": result}
        except RateLimitError:
            wait_time = 2 ** attempt  # 指数退避
            time.sleep(wait_time)
            continue
        except TimeoutError:
            if attempt < max_retries - 1:
                continue
            return {"status": "error", "msg": "请求超时"}
        except Exception as e:
            # 把错误信息返回给LLM，让它自己决定怎么办
            return {
                "status": "error",
                "msg": f"工具执行失败: {str(e)}",
                "suggestion": "请检查参数或尝试其他方法"
            }
    return {"status": "error", "msg": "达到最大重试次数"}
```

关键设计点：**把错误信息返回给LLM，而不是直接抛异常中断流程**。这是Agent和普通程序的核心区别之一。普通程序遇到异常要崩溃，Agent遇到异常可以把异常信息当作"观察结果"传回给LLM，让LLM自己决定下一步——是重试、换工具、还是告诉用户"这个任务完成不了"。

怕浪猫见过一个很典型的案例：Agent调搜索工具时因为网络波动超时了，错误信息返回给LLM后，LLM自己判断"可能是网络暂时不可用"，然后选择换一个搜索引擎工具重试，第二次成功了。如果当时直接抛异常崩溃，用户就得重新发起整个对话。这种"优雅降级"的能力是Agent相比固定流程程序的巨大优势。

> 好的Agent不是不犯错，而是犯了错能自己兜住。这和职场一样——靠谱的员工不是不犯错，而是犯了错能自己处理善后。

### 18.3.5 工具调用链

有时候一个用户请求需要调用一系列工具，形成一条"工具调用链"。比如用户说"帮我查一下最近的AI论文，翻译摘要，然后发到我邮箱"，Agent需要：调搜索工具查论文 → 调翻译工具翻译摘要 → 调邮件工具发送邮件。三个工具形成一条链，每一步的输出是下一步的输入。

工具调用链的复杂度在于"中间数据的传递"。搜索工具返回的是论文列表，翻译工具需要的是摘要文本，邮件工具需要的是主题+正文。这些数据结构不一样，LLM需要做中间数据的提取和格式转换。如果LLM在这一步出了差错——比如把整个论文列表（包括标题、作者、链接等）都传给了翻译工具，而不是只传摘要文本——就会导致翻译工具调用失败或结果混乱。

```python
# 工具调用链示例：搜索→翻译→发送邮件
def tool_chain_example(user_request):
    messages = [{"role": "user", "content": user_request}]
    
    # Step 1: 搜索论文
    papers = call_tool("search_papers", {"topic": "AI", "limit": 3})
    messages.append({"role": "tool", "content": json.dumps(papers)})
    
    # Step 2: 翻译每篇论文的摘要
    for paper in papers:
        translation = call_tool("translate", {
            "text": paper["abstract"],
            "target_lang": "zh"
        })
        paper["abstract_zh"] = translation["translated_text"]
    
    # Step 3: 发送邮件
    email_body = format_papers_email(papers)
    result = call_tool("send_email", {
        "to": "user@example.com",
        "subject": "最新AI论文推荐",
        "body": email_body
    })
    return result
```

在实际Agent中，这种调用链通常不是硬编码的，而是由LLM动态决定的。LLM在每一步根据当前状态决定下一步该调什么工具、传什么参数。这种"动态调用链"的灵活性是Agent的核心价值，但也是调试的噩梦——因为每次执行路径可能不同，Bug难以复现。怕浪猫的建议是做好日志记录，把每一步的工具名、参数、返回结果都完整记录下来，方便事后排查。

调试Agent的最佳实践是"全链路日志"。每个关键节点都打日志：LLM的完整输入上下文（包括System Prompt、所有消息、工具定义）、LLM的完整输出（包括Thought、工具调用决策、参数）、工具执行的开始和结束时间、工具返回的原始结果。日志格式建议用JSON结构化输出，方便后续用工具分析。怕浪猫还建议在日志中加入"步骤编号"和"会话ID"，这样在多用户并发场景下也能追踪单个会话的完整执行路径。有了全链路日志，当用户说"Agent给我的结果不对"时，你可以回溯整个执行过程，找到是哪一步出了问题。

## 18.4 记忆与上下文工程

### 18.4.1 短期记忆：对话历史

Agent的记忆系统分为短期记忆和长期记忆。短期记忆就是当前对话的历史消息——它是Agent在当前会话中的"工作记忆"。

短期记忆的作用是让Agent理解多轮对话的上下文。比如用户先说"帮我查一下北京天气"，Agent查询后回答了。用户接着说"那上海呢？"——Agent需要从短期记忆中知道"那"指的是"天气"。没有短期记忆，Agent会把"那上海呢"理解为一个全新的问题，不知道用户在问什么。

短期记忆的实现很简单——就是一个消息列表：

```python
class ShortTermMemory:
    def __init__(self, max_messages=50):
        self.messages = []
        self.max_messages = max_messages
    
    def add(self, role, content, **kwargs):
        msg = {"role": role, "content": content, **kwargs}
        self.messages.append(msg)
        # 超出限制时，保留系统消息和最近的对话
        if len(self.messages) > self.max_messages:
            self._truncate()
    
    def _truncate(self):
        # 保留第一条系统消息 + 最近的消息
        system_msgs = [m for m in self.messages if m["role"] == "system"]
        recent_msgs = self.messages[-self.max_messages + len(system_msgs):]
        self.messages = system_msgs + recent_msgs
    
    def get_messages(self):
        return self.messages.copy()
```

短期记忆的核心挑战是"长度管理"。LLM的上下文窗口是有限的——GPT-4o是128K Token，Claude 3.5是200K Token。看起来很大，但在Agent场景下消耗极快——每一步工具调用都会往消息列表里加两条消息（LLM的工具调用消息+工具返回结果消息），一个10步的Agent循环就可能产生20多条消息，如果每条消息内容较长，Token很快就会爆。

### 18.4.2 长期记忆：向量数据库

短期记忆只存在于当前会话，会话结束就消失了。长期记忆让Agent能跨会话记住用户信息、历史决策、学到的经验。这就是为什么需要向量数据库（Vector Database）来存储长期记忆。

长期记忆的典型实现是：把需要记住的信息编码成向量（Embedding），存入向量数据库。当Agent需要回忆时，把当前问题也编码成向量，在数据库中做相似度检索，找出相关的历史记忆。

```python
import chromadb

class LongTermMemory:
    def __init__(self, collection_name="agent_memory"):
        self.client = chromadb.PersistentClient(path="./memory_db")
        self.collection = self.client.get_or_create_collection(name=collection_name)
    
    def remember(self, content, metadata=None):
        """存入一条记忆"""
        mem_id = f"mem_{self.collection.count()}"
        self.collection.add(ids=[mem_id], documents=[content], metadatas=[metadata or {}])
        return mem_id
    
    def recall(self, query, top_k=5):
        """根据当前问题回忆相关记忆"""
        results = self.collection.query(query_texts=[query], n_results=top_k)
        return [{"content": doc, "metadata": meta}
                for doc, meta in zip(results["documents"][0], results["metadatas"][0])]
```

什么时候该往长期记忆里存东西？怕浪猫的经验是这几种场景：用户明确说"记住这个"的时候；Agent做出了重要决策的时候（存决策原因和结果，方便以后参考）；工具调用产生了有价值的信息的时候（比如搜索到的用户公司信息）；用户纠正了Agent错误的时候（存纠错信息，避免下次犯同样的错）。

但长期记忆不是越多越好。怕浪猫做过一个实验：把所有对话历史都存入长期记忆，结果Agent在"回忆"时检索到大量不相关的旧消息，反而干扰了当前决策。后来改成"只存重要信息"的策略，效果好了很多。长期记忆需要定期"清洗"——删除过时的、重复的、低价值的信息，保持记忆库的精炼度。

> 记忆不是垃圾桶，什么都往里扔。好的记忆系统像人类的记忆一样——会遗忘不重要的，会强化重要的，会关联相关的。

### 18.4.3 上下文窗口管理

Agent运行过程中的上下文消耗是动态的——每一步循环都会增加上下文长度。如果不做管理，上下文很快就会超出LLM的窗口限制，导致最早的对话内容被截断或API报错。

上下文窗口管理的核心策略是"摘要压缩"——当对话历史超过一定长度时，把较早的消息压缩成一段摘要，释放上下文空间。

```python
def compress_context(messages, llm, threshold=8000):
    """当上下文过长时，压缩早期对话"""
    total_tokens = count_tokens(messages)
    if total_tokens <= threshold:
        return messages
    
    # 分离系统消息和对话消息
    system_msgs = [m for m in messages if m["role"] == "system"]
    conv_msgs = [m for m in messages if m["role"] != "system"]
    
    # 保留最近的N条消息不压缩
    keep_recent = 6
    to_compress = conv_msgs[:-keep_recent]
    recent_msgs = conv_msgs[-keep_recent:]
    
    # 把早期消息压缩成摘要
    summary_prompt = "请将以下对话历史压缩成简洁的摘要，保留关键信息和决策：\n"
    for msg in to_compress:
        summary_prompt += f"[{msg['role']}]: {msg['content'][:200]}\n"
    
    summary = llm.chat([{
        "role": "user",
        "content": summary_prompt
    }]).choices[0].message.content
    
    return system_msgs + [
        {"role": "system", "content": f"历史对话摘要: {summary}"}
    ] + recent_msgs
```

这段代码的逻辑是：当Token总数超过阈值时，把较早的对话消息交给LLM做摘要压缩，只保留最近的几条原始消息。这样既释放了上下文空间，又保留了关键信息的脉络。

不过上下文压缩有个风险——摘要可能丢失重要细节。比如Agent在前面的对话中已经决定了某个参数值，压缩后这个信息可能被摘要"一笔带过"，后续步骤需要用到这个参数时就可能出错。怕浪猫的实践建议是：工具调用的结果不要压缩（因为包含结构化数据），只压缩对话性质的文本消息；对于关键决策和参数，单独存储在Agent的状态变量中，不依赖上下文摘要来传递。

这里有一个容易被忽视的细节：上下文压缩本身也是有成本的。你调一次LLM来做摘要压缩，既消耗Token又增加延迟。如果对话轮次不多就频繁触发压缩，反而得不偿失。怕浪猫的实践是设置一个"压缩阈值"——只有当上下文Token数超过总窗口的60%时才触发压缩，而且压缩后至少释放出20%的空间，避免频繁触发。另外，压缩动作本身也要记录在记忆中，让Agent知道"之前的对话被压缩过，如果有遗漏的关键信息可以从长期记忆中查找"。这种"元认知"——知道自己的记忆被压缩过——能帮助Agent在信息缺失时主动去检索长期记忆，而不是基于不完整的上下文做错误判断。

### 18.4.4 记忆压缩与摘要策略

上面提到了上下文压缩的基本思路，这里深入讨论一下记忆压缩的具体策略。

不同类型的消息，压缩策略应该不同。对话消息可以摘要压缩，但工具调用消息有结构化的字段，直接摘要可能丢失关键信息。怕浪猫采用的分层压缩策略：

| 消息类型 | 压缩策略 | 保留信息 |
|---------|---------|---------|
| 系统消息 | 不压缩 | 完整保留 |
| 用户消息 | 摘要压缩 | 用户意图和关键需求 |
| 助手消息（纯文本） | 摘要压缩 | 回答的核心结论 |
| 工具调用消息 | 结构化压缩 | 工具名+关键参数+结果摘要 |
| 工具结果消息 | 结果摘要 | 结果的核心数据 |

"结构化压缩"是指不直接摘要文本，而是提取关键字段后用更短的格式存储。比如一个搜索工具的返回结果包含10条搜索结果，每条有标题、链接、摘要，结构化压缩后只保留前3条的核心信息，其余的用"还有7条结果"一句话带过。

```python
def compress_tool_result(tool_name, result, max_chars=500):
    """压缩工具返回结果"""
    result_str = json.dumps(result, ensure_ascii=False)
    if len(result_str) <= max_chars:
        return result_str
    
    if tool_name == "search_web":
        # 搜索结果：只保留前3条的标题和摘要
        items = result.get("results", [])[:3]
        compressed = {
            "top_results": [
                {"title": r["title"], "snippet": r["snippet"][:100]}
                for r in items
            ],
            "total": len(result.get("results", []))
        }
        return json.dumps(compressed, ensure_ascii=False)
    
    # 默认：截断保留前N个字符
    return result_str[:max_chars] + "...[已截断]"
```

这种分层压缩策略在保持信息密度的同时最大化上下文利用率。怕浪猫在实际项目中测过，采用分层压缩后，Agent在20轮循环后仍能保持90%以上的任务完成率，而不做压缩的Agent在15轮左右就因为上下文溢出而崩溃。

除了压缩策略，还有一个技巧是"主动遗忘"。人类会自然地忘记不重要的信息，Agent也需要这种能力。具体做法是：对于每一轮对话，在添加新消息时评估旧消息的价值。如果某条消息既不包含关键决策，也不包含用户偏好，也不包含工具调用结果，那它就是一个"低价值消息"，可以直接删除而不需要摘要压缩。这种"选择性遗忘"比"无差别压缩"更高效，因为它不消耗额外的LLM调用来做摘要。实现上可以给每条消息打一个"重要度"标签，低重要的消息在上下文紧张时优先被清理掉。

## 18.5 完整Agent实现

### 18.5.1 架构设计与工具注册

理论讲了这么多，现在来干一票大的——从零搭建一个完整的Agent。这个Agent具备工具调用、记忆管理、多轮对话、错误处理等完整能力。

先看整体架构：

```
用户输入
    ↓
┌─────────────────────────────────┐
│         Agent Core              │
│  ┌─────────┐  ┌──────────────┐  │
│  │ Memory   │  │ Tool Registry │  │
│  │ Manager  │  │ (工具注册表)   │  │
│  └────┬────┘  └──────┬───────┘  │
│       │              │           │
│  ┌────┴──────────────┴───────┐  │
│  │    LLM Engine (推理引擎)   │  │
│  │    ReAct + Function Call   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
    ↓
输出结果 / 调用工具
```

工具注册表是Agent的工具管理中枢。每个工具在注册时需要提供：工具定义（给LLM看的描述）、执行函数（实际运行的代码）、失败处理策略。

```python
import json
from typing import Callable, Any

class ToolRegistry:
    """工具注册表 - 管理Agent可用的所有工具"""
    def __init__(self):
        self._tools: dict[str, dict] = {}
    
    def register(self, name: str, description: str,
                 parameters: dict, handler: Callable, timeout: int = 30):
        self._tools[name] = {
            "handler": handler, "timeout": timeout,
            "schema": {"type": "function", "function": {
                "name": name, "description": description,
                "parameters": parameters
            }}
        }
    
    def get_schemas(self) -> list:
        return [t["schema"] for t in self._tools.values()]
    
    def execute(self, name: str, args: dict) -> Any:
        if name not in self._tools:
            return {"error": f"工具 {name} 不存在"}
        try:
            return self._tools[name]["handler"](**args)
        except Exception as e:
            return {"error": str(e), "tool": name}
```

`ToolRegistry`做了三件事：注册工具、提供工具定义给LLM、执行工具调用。它通过`register`方法把工具的描述信息和执行函数绑定在一起，通过`get_schemas`输出LLM能理解的工具定义格式，通过`execute`方法实际运行工具。这种设计把"工具描述"和"工具实现"统一管理，新增工具只需要调用`register`，不用改Agent核心逻辑。

### 18.5.2 记忆管理实现

接下来实现记忆管理模块。这个模块同时管理短期记忆和长期记忆，并负责上下文压缩。

```python
class AgentMemory:
    """Agent记忆管理 - 短期+长期+压缩"""
    def __init__(self, llm, max_ctx=6000):
        self.llm, self.max_tokens = llm, max_ctx
        self.messages, self.long_term = [], []
    
    def add_message(self, role, content, **extra):
        self.messages.append({"role": role, "content": content, **extra})
        self._maybe_compress()
    
    def add_tool_message(self, tool_call_id, content):
        self.messages.append({"role": "tool", "tool_call_id": tool_call_id, "content": content})
        self._maybe_compress()
    
    def get_context(self):
        ctx = []
        if self.long_term:
            ctx.append({"role": "system", "content": "历史记忆:\n" + "\n".join(self.long_term[-5:])})
        return ctx + self.messages
    
    def save_to_long_term(self, content): self.long_term.append(content)
    
    def _maybe_compress(self):
        if sum(len(m["content"]) // 3 for m in self.messages) > self.max_tokens:
            old, recent = self.messages[:-6], self.messages[-6:]
            summary = self.llm.summarize(old)
            self.messages = [{"role": "system", "content": f"早期对话摘要: {summary}"}] + recent
```

这个记忆模块的亮点是`_maybe_compress`方法——它会在每次添加新消息后检查上下文长度，超过阈值就自动触发压缩。压缩逻辑保留最近6条原始消息，把更早的消息摘要后替换为一条系统消息。同时`get_context`方法会在上下文前面附上长期记忆的最新条目，让LLM能"回忆"起跨会话的重要信息。

### 18.5.3 对话循环与多轮交互

有了工具注册表和记忆管理，现在来组装Agent的核心——对话循环。这是整个Agent的心脏，把所有组件串联起来。

```python
class Agent:
    def __init__(self, llm, tools: ToolRegistry, memory: AgentMemory, system_prompt: str):
        self.llm, self.tools, self.memory = llm, tools, memory
        self.memory.add_message("system", system_prompt)
    
    def run(self, user_input: str, max_steps: int = 15) -> str:
        self.memory.add_message("user", user_input)
        for step in range(max_steps):
            response = self.llm.chat(
                messages=self.memory.get_context(),
                tools=self.tools.get_schemas(), tool_choice="auto")
            msg = response.choices[0].message
            if not msg.tool_calls:  # 任务完成
                self.memory.add_message("assistant", msg.content)
                return msg.content
            self.memory.add_message("assistant", msg.content or "",
                tool_calls=[tc.model_dump() for tc in msg.tool_calls])
            for tc in msg.tool_calls:  # 执行工具
                args = json.loads(tc.function.arguments)
                result = self.tools.execute(tc.function.name, args)
                self.memory.add_tool_message(tc.id, json.dumps(result, ensure_ascii=False))
        return "Agent未能在限定步数内完成任务"
```

这个`Agent`类只有不到40行代码，但它已经是一个功能完整的Agent了。`run`方法实现了标准的Agent循环——LLM推理、工具调用、结果观察、循环判断。每一轮的工具调用结果都会存入记忆，LLM在下一轮推理时能看到之前所有的行动和结果。`max_steps`限制防止Agent无限循环。

### 18.5.4 工具调用链测试

现在来测试这个Agent。先注册几个实用工具，然后跑一个需要多步工具调用的任务。

```python
# 注册工具
registry = ToolRegistry()

registry.register("search", "搜索互联网信息。需要查找实时信息时使用。",
    {"type": "object", "properties": {"query": {"type": "string", "description": "搜索关键词"}},
     "required": ["query"]},
    handler=lambda query: mock_search(query))

registry.register("calculate", "执行数学计算。需要精确数值计算时使用。",
    {"type": "object", "properties": {"expression": {"type": "string", "description": "数学表达式"}},
     "required": ["expression"]},
    handler=lambda expression: eval(expression))

registry.register("save_note", "将内容保存为笔记文件。",
    {"type": "object", "properties": {
        "title": {"type": "string", "description": "笔记标题"},
        "content": {"type": "string", "description": "笔记内容"}},
     "required": ["title", "content"]},
    handler=lambda title, content: save_to_file(title, content))

# 初始化Agent
SYSTEM_PROMPT = """你是一个能使用工具的智能助手。
请根据用户需求，主动调用工具完成任务。
每次工具调用后，请仔细观察结果再决定下一步。
如果任务完成，直接给出总结性回答。"""

agent = Agent(llm=my_llm, tools=registry,
              memory=AgentMemory(llm=my_llm), system_prompt=SYSTEM_PROMPT)
result = agent.run("帮我搜索2024年诺贝尔文学奖得主，计算年龄，然后保存为笔记")
print(result)
```

这个测试任务需要Agent执行三个步骤：调`search`搜索诺贝尔文学奖得主信息，调`calculate`计算年龄（需要从搜索结果中提取出生年份），调`save_note`保存笔记。三个工具形成一条调用链，每一步的输出都是下一步的输入。

Agent的执行过程大致如下：

```
Step 1: LLM调用 search("2024年诺贝尔文学奖得主")
        → 返回：韩江，1970年生，韩国作家...

Step 2: LLM调用 calculate("2024 - 1970")
        → 返回：54

Step 3: LLM调用 save_note(title="2024诺贝尔文学奖得主信息",
            content="2024年诺贝尔文学奖得主是韩江，韩国作家，1970年出生，今年54岁。")
        → 返回：保存成功

Step 4: LLM不再调用工具，输出最终回答：
        "已为您完成查询和保存。2024年诺贝尔文学奖得主是韩江..."
```

看到没有？Agent自己从搜索结果中提取了出生年份，自己构造了计算表达式，自己组织了笔记内容——这些"中间步骤"都是LLM在运行时动态决定的，不是硬编码的流程。这就是Agent和固定流程脚本的根本区别。

### 18.5.5 多轮交互与状态保持

Agent的另一个核心能力是多轮交互——用户可以在第一轮任务完成后继续追问，Agent需要记住之前的上下文。因为我们的记忆模块会保存所有对话历史，所以多轮交互天然支持。

```python
# 第一轮
agent.run("帮我搜索Python 3.12的新特性")
# Agent调用search工具，返回搜索结果

# 第二轮（Agent记得第一轮的上下文）
agent.run("其中你最感兴趣的特性是哪个？详细说说")
# Agent从记忆中找到第一轮的搜索结果，不需要重新搜索

# 第三轮
agent.run("帮我写一段代码演示这个特性")
# Agent基于前两轮的讨论，生成示例代码
```

第二轮和第三轮中，Agent不需要重新调用搜索工具，因为搜索结果已经在短期记忆里了。LLM在推理时能看到之前的对话历史，知道"其中"指的是Python 3.12的新特性，知道"这个特性"指的是第二轮讨论的那个特性。这种跨轮次的上下文理解能力，正是记忆模块的价值所在。

但多轮交互也会带来一个问题——随着轮次增加，上下文越来越长，Token消耗也越来越大。这就是前面说的上下文压缩要解决的问题。好的Agent需要在"记住足够多的上下文"和"控制Token消耗"之间找到平衡点。怕浪猫的一般做法是：对话性质的轮次用摘要压缩，工具调用结果保留原始数据，关键决策信息额外存入长期记忆。

> Agent开发的核心矛盾：记忆越多越聪明，但记忆越多越费钱。在Token的世界里，遗忘也是一种能力。

### 18.5.6 常见踩坑清单

最后，怕浪猫把Agent开发中最常踩的坑整理成清单，方便你对照检查：

**坑一：工具描述太模糊。** 上面已经讲过了，工具描述不清导致误调用。解决方法：描述要包含"什么时候该用"和"什么时候不该用"。

**坑二：没有设置max_steps。** Agent陷入无限循环，不断调用同一个工具但换不同参数，Token烧得飞快。解决方法：必须设置最大步数限制，建议10-20步。

**坑三：工具异常未处理。** 工具调用抛异常直接崩溃，Agent流程中断。解决方法：工具执行函数内部做try-catch，把错误信息作为结果返回给LLM。

**坑四：上下文不压缩。** 多轮对话后上下文爆炸，API报错或费用飙升。解决方法：实现上下文压缩机制，定期对历史消息做摘要。

**坑五：工具结果格式不一致。** 同一个工具有时返回dict有时返回string，LLM困惑。解决方法：统一工具返回格式，始终返回包含`status`和`data`字段的dict。

**坑六：System Prompt不够清晰。** Agent不知道什么时候该用工具、什么时候直接回答。解决方法：在System Prompt中明确Agent的行为准则，比如"优先使用工具获取信息"、"如果已有足够信息可以直接回答"。一个好的Agent System Prompt至少要包含：Agent的角色定位、可用工具的使用优先级、何时调用工具何时直接回答、输出格式要求、错误处理策略。怕浪猫还建议在System Prompt中加入"行为边界"——明确告诉Agent什么不该做，比如"不要执行任何删除文件的操作"、"不要在未经用户确认的情况下发送邮件"。这种边界约束在Agent拥有强大工具调用能力时尤为重要，因为能力越大，闯祸的范围也越大。

**坑七：并行工具调用未处理。** LLM返回多个工具调用但代码只执行了第一个。解决方法：遍历所有`tool_calls`并逐个（或并行）执行，结果分别返回。

**坑八：记忆未做隔离。** 不同用户的对话记忆混在一起，Agent把A用户的信息告诉了B用户。解决方法：每个用户/会话使用独立的记忆实例，不要共享。

**坑九：没有做工具权限控制。** Agent有了删除文件的工具就真去删了，有了发邮件的工具就真发了。在生产环境中，危险操作必须加"人工确认"环节——Agent提出操作建议，等用户确认后再执行。这叫"Human-in-the-Loop"（Human-in-the-Loop，人在回路中），是生产级Agent系统的标配。实现上可以在工具执行前插入一个确认步骤：如果工具被标记为"需要确认"，先把操作内容展示给用户，用户同意后才真正执行。怕浪猫的做法是给每个工具打一个"风险等级"标签——低风险（如搜索、查询）自动执行，中风险（如修改文件、更新数据）需要确认，高风险（如删除、发送邮件、支付）需要双重确认。

| 踩坑类型 | 典型表现 | 根因 | 解决方案 |
|---------|---------|------|---------|
| 工具描述模糊 | 误调用工具 | 描述不够具体 | 写清使用场景和限制 |
| 无限循环 | 反复调用同一工具 | 缺少步数限制 | 设置max_steps |
| 异常崩溃 | 工具报错Agent挂掉 | 未做异常捕获 | try-catch返回错误信息 |
| 上下文爆炸 | API报错或费用高 | 未做上下文压缩 | 定期摘要压缩 |
| 结果格式混乱 | LLM困惑无法决策 | 返回格式不统一 | 统一返回dict格式 |
| 记忆泄露 | 用户信息串台 | 记忆未做隔离 | 每会话独立实例 |

## 章节小结

这一章我们从Agent的基本原理出发，完整走过了Agent的技术全链路。从Agent循环（感知-规划-行动-观察）到四种常见模式（ReAct、Plan-and-Execute、Reflection、Multi-Agent），从工具定义、Function Calling、多工具编排到失败处理和调用链，从短期记忆、长期记忆到上下文压缩和摘要策略，最后手把手实现了一个完整的Agent——包含工具注册、记忆管理、对话循环、多轮交互和踩坑清单。

怕浪猫最后再强调几点核心认知：

第一，Agent的本质是循环。不是调一次LLM就完事，而是一个"思考-行动-观察-再思考"的持续循环。理解了这个循环，就理解了Agent的灵魂。所有的Agent框架，不管包装得多复杂，核心都是这个循环。

第二，工具定义是Agent质量的天花板。LLM的工具调用准确率，70%取决于工具描述的质量。花时间打磨工具描述，比花时间调Prompt模板有效得多。好的工具描述应该像好的API文档一样——清晰、准确、有使用示例。

第三，记忆管理是Agent的瓶颈。随着Agent运行轮次增加，上下文管理的重要性会越来越突出。不做压缩，上下文很快爆炸；压缩太狠，关键信息丢失。找到合适的压缩策略，是Agent工程化的核心挑战之一。

第四，错误处理决定Agent的鲁棒性。生产环境中的Agent一定会遇到各种异常——工具超时、API限流、参数格式错误、网络波动。把每种异常都当作"观察结果"传回给LLM，让LLM自己决策，这比硬编码的错误处理逻辑灵活得多。

第五，MCP是Agent生态的未来方向。本章的代码示例都是自定义工具定义，但业界正在向MCP（Model Context Protocol，模型上下文协议）标准化方向发展。MCP定义了统一的工具描述和调用协议，类似于USB标准——不同的工具提供方按照MCP协议暴露能力，不同的Agent框架按照MCP协议消费工具，实现工具的即插即用。虽然MCP目前还在发展初期，但标准化是必然趋势，值得持续关注。MCP的核心价值在于解耦——工具提供方不需要关心Agent框架是什么，Agent框架也不需要关心工具的内部实现。只要双方都遵循MCP协议，就能无缝对接。这就像HTTP协议之于Web——在HTTP出现之前，每对客户端和服务器都要自定义通信协议，混乱且低效；HTTP标准化后，任何浏览器都能访问任何网站。MCP要做的事情是一样的——让Agent生态从"自定义协议"时代进入"标准协议"时代。

> 从语言到行动，是LLM进化的终极一跃。RAG让LLM能"知道"，Agent让LLM能"做到"——知道加做到，才是真正的智能。

怕浪猫说：做Agent项目就像培养一个新员工——你给他工具（教他技能），给他记忆（让他积累经验），给他规划能力（让他能独立思考），然后让他自己去干活。一开始他肯定笨手笨脚，工具用错、步骤混乱、上下文丢散，都是正常的。你要做的是不断优化工具描述（改进培训手册）、完善错误处理（建立容错机制）、调整记忆策略（帮他总结经验）。Agent开发不是一次性的工作，而是一个持续打磨的过程。怕浪猫见过的好的Agent，都是经过几十轮迭代优化才达到生产可用的。别指望一次就完美，先跑起来，再逐步迭代。Agent这个东西，和人生一样——重要的不是起点多高，而是能不能从每次失败中学到东西。

下章预告：第19章 课程总结——我们将对整个系列进行回顾，梳理从Python基础到LLM应用开发的全链路知识体系，给出学习路线建议和实战项目清单。整个系列到这里就要收官了，但你的LLM开发之旅才刚刚开始。

系列进度 18/19

怕浪猫说：下章见，各位驯猫人。