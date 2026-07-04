import{_ as e,I as l,c as i,o as r,aj as n,j as t,a,J as c}from"./chunks/framework.CynFBi0q.js";const v=JSON.parse('{"title":"React 从入门到出门第一章 JSX 增强特性与函数组件入门","description":"","frontmatter":{},"headers":[],"relativePath":"handbook/react/chapter_1.md","filePath":"handbook/react/chapter_1.md","lastUpdated":1768748967000}'),b={name:"handbook/react/chapter_1.md"};function u(o,s,m,d,h,g){const p=l("Fragment");return r(),i("div",null,[s[2]||(s[2]=n(`<h1 id="react-从入门到出门第一章-jsx-增强特性与函数组件入门" tabindex="-1">React 从入门到出门第一章 JSX 增强特性与函数组件入门 <a class="header-anchor" href="#react-从入门到出门第一章-jsx-增强特性与函数组件入门" aria-label="Permalink to “React 从入门到出门第一章 JSX 增强特性与函数组件入门”">​</a></h1><p>今天咱们从 React 19 的基础语法入手，聊聊 JSX 增强特性和函数组件的核心用法。对于刚接触 React 19 的同学来说，这两块是搭建应用的基石——函数组件是 React 19 的核心载体，而 JSX 则让我们能以更直观的方式描述 UI 结构。</p><p>更重要的是，React 19 对 JSX 做了不少实用增强，比如支持多根节点默认不包裹、改进碎片语法等，这些特性能直接提升我们的开发效率。下面咱们结合具体案例，从“是什么→怎么用→为什么”三个维度，把这些知识点讲透～</p><h2 id="一、先搞懂核心概念-函数组件与-jsx-是什么" tabindex="-1">一、先搞懂核心概念：函数组件与 JSX 是什么？ <a class="header-anchor" href="#一、先搞懂核心概念-函数组件与-jsx-是什么" aria-label="Permalink to “一、先搞懂核心概念：函数组件与 JSX 是什么？”">​</a></h2><h3 id="_1-函数组件-react-19-的-ui-构建单元" tabindex="-1">1. 函数组件：React 19 的“UI 构建单元” <a class="header-anchor" href="#_1-函数组件-react-19-的-ui-构建单元" aria-label="Permalink to “1. 函数组件：React 19 的“UI 构建单元””">​</a></h3><p>函数组件，顾名思义就是用<code>JavaScript 函数</code> 定义的 React 组件。它的核心作用是：接收 <code>props</code> 数据，返回一段描述 UI 结构的 JSX 代码，最终被 React 渲染到页面上。</p><p>在 React 19 中，函数组件是绝对的主流——相比旧版本的 class 组件，它更简洁、更易维护，而且所有新特性（比如新 Hooks、Actions API 等）都优先适配函数组件。</p><h3 id="_2-jsx-javascript-与-ui-的-桥梁" tabindex="-1">2. JSX：JavaScript 与 UI 的“桥梁” <a class="header-anchor" href="#_2-jsx-javascript-与-ui-的-桥梁" aria-label="Permalink to “2. JSX：JavaScript 与 UI 的“桥梁””">​</a></h3><p>JSX 全称是 <code>JavaScript XML</code>，是 React 推出的一种语法扩展。它允许我们在 JavaScript 代码中直接写 HTML 风格的标签，既保留了 JavaScript 的逻辑表达能力，又具备 HTML 的直观性。</p><p>注意：JSX 并不是原生 JavaScript 语法，浏览器无法直接识别，需要通过 Babel 等工具转译为普通 JavaScript 代码后才能运行。不过在 React 19 项目中（比如用 Vite 或 Create React App 初始化的项目），这些转译工作会被工具链自动处理，我们直接写 JSX 即可。</p><h2 id="二、函数组件入门-从-最简单的组件-开始写" tabindex="-1">二、函数组件入门：从“最简单的组件”开始写 <a class="header-anchor" href="#二、函数组件入门-从-最简单的组件-开始写" aria-label="Permalink to “二、函数组件入门：从“最简单的组件”开始写”">​</a></h2><p>咱们先从最基础的函数组件写起，掌握“定义→使用→传参”的完整流程。</p><h3 id="_1-定义一个最简单的函数组件" tabindex="-1">1. 定义一个最简单的函数组件 <a class="header-anchor" href="#_1-定义一个最简单的函数组件" aria-label="Permalink to “1. 定义一个最简单的函数组件”">​</a></h3><p>一个函数组件的核心结构非常简单：就是一个返回 JSX 的函数。比如下面这个“Hello React 19”组件：</p><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    // 定义函数组件：接收 props 参数（可选），返回 JSX</span></span>
<span class="line"><span>    function HelloReact19() {</span></span>
<span class="line"><span>      // 组件内部可以写 JavaScript 逻辑</span></span>
<span class="line"><span>      const message = &quot;Hello React 19! 我是函数组件&quot;;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>      // 返回 JSX：描述 UI 结构</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div&gt;</span></span>
<span class="line"><span>          &lt;h1&gt;{message}&lt;/h1&gt;</span></span>
<span class="line"><span>          &lt;p&gt;这是我写的第一个 React 19 函数组件～&lt;/p&gt;</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    // 使用组件：像用 HTML 标签一样使用</span></span>
<span class="line"><span>    function App() {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div className=&quot;App&quot;&gt;</span></span>
<span class="line"><span>          &lt;HelloReact19 /&gt; {/* 组件使用时必须闭合标签 */}</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    export default App;</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br><span class="line-number">10</span><br><span class="line-number">11</span><br><span class="line-number">12</span><br><span class="line-number">13</span><br><span class="line-number">14</span><br><span class="line-number">15</span><br><span class="line-number">16</span><br><span class="line-number">17</span><br><span class="line-number">18</span><br><span class="line-number">19</span><br><span class="line-number">20</span><br><span class="line-number">21</span><br><span class="line-number">22</span><br><span class="line-number">23</span><br><span class="line-number">24</span><br></div></div><h3 id="_2-组件传参-通过-props-传递数据" tabindex="-1">2. 组件传参：通过 props 传递数据 <a class="header-anchor" href="#_2-组件传参-通过-props-传递数据" aria-label="Permalink to “2. 组件传参：通过 props 传递数据”">​</a></h3><p>如果我们想让组件更灵活（比如不同场景显示不同内容），就需要通过 <code>props</code> 给组件传递数据。props 是一个对象，包含了父组件传递过来的所有参数。</p><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    // 接收 props 参数，使用解构赋值简化写法</span></span>
<span class="line"><span>    function Greeting({ name, age }) {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div&gt;</span></span>
<span class="line"><span>          &lt;h2&gt;你好，我是 {name}&lt;/h2&gt;</span></span>
<span class="line"><span>          &lt;p&gt;今年 {age} 岁，正在学习 React 19&lt;/p&gt;</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    // 父组件传递 props</span></span>
<span class="line"><span>    function App() {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div className=&quot;App&quot;&gt;</span></span>
<span class="line"><span>          {/* 传递 name 和 age 两个参数 */}</span></span>
<span class="line"><span>          &lt;Greeting name=&quot;小明&quot; age={22} /&gt;</span></span>
<span class="line"><span>          &lt;Greeting name=&quot;小红&quot; age={21} /&gt;</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br><span class="line-number">10</span><br><span class="line-number">11</span><br><span class="line-number">12</span><br><span class="line-number">13</span><br><span class="line-number">14</span><br><span class="line-number">15</span><br><span class="line-number">16</span><br><span class="line-number">17</span><br><span class="line-number">18</span><br><span class="line-number">19</span><br><span class="line-number">20</span><br></div></div><h3 id="_3-组件嵌套-组合出复杂-ui" tabindex="-1">3. 组件嵌套：组合出复杂 UI <a class="header-anchor" href="#_3-组件嵌套-组合出复杂-ui" aria-label="Permalink to “3. 组件嵌套：组合出复杂 UI”">​</a></h3><p>函数组件支持嵌套使用，我们可以把复杂的 UI 拆分成多个小组件，再组合起来，这也是 React “组件化”思想的核心。</p><p>比如我们要实现一个“用户卡片列表”，可以拆成 <code>UserCard</code>（单个用户卡片）和 <code>UserList</code>（卡片列表容器）两个组件：</p><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    // 单个用户卡片组件</span></span>
<span class="line"><span>    function UserCard({ user }) {</span></span>
<span class="line"><span>      const { name, avatar, desc } = user;</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div style={{ border: &quot;1px solid #eee&quot;, padding: &quot;16px&quot;, borderRadius: &quot;8px&quot;, margin: &quot;8px&quot; }}&gt;</span></span>
<span class="line"><span>          &lt;img src={avatar} alt={name} style={{ width: &quot;80px&quot;, height: &quot;80px&quot;, borderRadius: &quot;50%&quot; }} /&gt;</span></span>
<span class="line"><span>          &lt;h3&gt;{name}&lt;/h3&gt;</span></span>
<span class="line"><span>          &lt;p&gt;{desc}&lt;/p&gt;</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    // 用户列表组件（嵌套 UserCard）</span></span>
<span class="line"><span>    function UserList() {</span></span>
<span class="line"><span>      // 模拟用户数据</span></span>
<span class="line"><span>      const users = [</span></span>
<span class="line"><span>        {</span></span>
<span class="line"><span>          name: &quot;小明&quot;,</span></span>
<span class="line"><span>          avatar: &quot;https://via.placeholder.com/80&quot;,</span></span>
<span class="line"><span>          desc: &quot;React 19 学习者&quot;</span></span>
<span class="line"><span>        },</span></span>
<span class="line"><span>        {</span></span>
<span class="line"><span>          name: &quot;小红&quot;,</span></span>
<span class="line"><span>          avatar: &quot;https://via.placeholder.com/80&quot;,</span></span>
<span class="line"><span>          desc: &quot;前端开发工程师&quot;</span></span>
<span class="line"><span>        }</span></span>
<span class="line"><span>      ];</span></span>
<span class="line"><span></span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div&gt;</span></span>
<span class="line"><span>          &lt;h2&gt;用户列表&lt;/h2&gt;</span></span>
<span class="line"><span>          {/* 循环渲染 UserCard 组件 */}</span></span>
<span class="line"><span>          {users.map((user, index) =&gt; (</span></span>
<span class="line"><span>            &lt;UserCard key={index} user={user} /&gt;</span></span>
<span class="line"><span>          ))}</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    // 根组件</span></span>
<span class="line"><span>    function App() {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div className=&quot;App&quot;&gt;</span></span>
<span class="line"><span>          &lt;UserList /&gt;</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br><span class="line-number">10</span><br><span class="line-number">11</span><br><span class="line-number">12</span><br><span class="line-number">13</span><br><span class="line-number">14</span><br><span class="line-number">15</span><br><span class="line-number">16</span><br><span class="line-number">17</span><br><span class="line-number">18</span><br><span class="line-number">19</span><br><span class="line-number">20</span><br><span class="line-number">21</span><br><span class="line-number">22</span><br><span class="line-number">23</span><br><span class="line-number">24</span><br><span class="line-number">25</span><br><span class="line-number">26</span><br><span class="line-number">27</span><br><span class="line-number">28</span><br><span class="line-number">29</span><br><span class="line-number">30</span><br><span class="line-number">31</span><br><span class="line-number">32</span><br><span class="line-number">33</span><br><span class="line-number">34</span><br><span class="line-number">35</span><br><span class="line-number">36</span><br><span class="line-number">37</span><br><span class="line-number">38</span><br><span class="line-number">39</span><br><span class="line-number">40</span><br><span class="line-number">41</span><br><span class="line-number">42</span><br><span class="line-number">43</span><br><span class="line-number">44</span><br><span class="line-number">45</span><br><span class="line-number">46</span><br><span class="line-number">47</span><br></div></div><h2 id="三、react-19-核心-jsx-增强特性详解" tabindex="-1">三、React 19 核心：JSX 增强特性详解 <a class="header-anchor" href="#三、react-19-核心-jsx-增强特性详解" aria-label="Permalink to “三、React 19 核心：JSX 增强特性详解”">​</a></h2><p>React 19 对 JSX 语法做了不少实用增强，解决了之前版本的一些痛点。下面咱们重点讲几个最常用的增强特性，结合案例说明用法和优势。</p><h3 id="_1-特性-1-多根节点默认不包裹-无需手动写-fragment" tabindex="-1">1. 特性 1：多根节点默认不包裹（无需手动写 Fragment） <a class="header-anchor" href="#_1-特性-1-多根节点默认不包裹-无需手动写-fragment" aria-label="Permalink to “1. 特性 1：多根节点默认不包裹（无需手动写 Fragment）”">​</a></h3><p>在 React 18 及之前的版本中，JSX 要求必须有一个“唯一根节点”，如果想返回多个同级节点，需要用 <code>&lt;&gt;&lt;/&gt;</code>（Fragment 碎片）包裹。</p><p>而 React 19 支持“多根节点默认不包裹”，直接返回多个同级节点即可，编译器会自动帮我们处理为 Fragment，代码更简洁。</p><h4 id="❌-react-18-及之前的写法-必须包裹" tabindex="-1">❌ React 18 及之前的写法（必须包裹） <a class="header-anchor" href="#❌-react-18-及之前的写法-必须包裹" aria-label="Permalink to “❌ React 18 及之前的写法（必须包裹）”">​</a></h4><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    // React 18 及之前：多根节点必须用 Fragment 包裹</span></span>
<span class="line"><span>    function Navbar() {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;&gt; {/* 必须写 Fragment */}</span></span>
<span class="line"><span>          &lt;div className=&quot;logo&quot;&gt;React 19 -logo&lt;/div&gt;</span></span>
<span class="line"><span>          &lt;ul className=&quot;menu&quot;&gt;</span></span>
<span class="line"><span>            &lt;li&gt;首页&lt;/li&gt;</span></span>
<span class="line"><span>            &lt;li&gt;文档&lt;/li&gt;</span></span>
<span class="line"><span>          &lt;/ul&gt;</span></span>
<span class="line"><span>        &lt;/&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br><span class="line-number">10</span><br><span class="line-number">11</span><br><span class="line-number">12</span><br></div></div><h4 id="✅-react-19-增强写法-无需包裹" tabindex="-1">✅ React 19 增强写法（无需包裹） <a class="header-anchor" href="#✅-react-19-增强写法-无需包裹" aria-label="Permalink to “✅ React 19 增强写法（无需包裹）”">​</a></h4><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    // React 19：直接返回多根节点，无需手动写 Fragment</span></span>
<span class="line"><span>    function Navbar() {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div className=&quot;logo&quot;&gt;React 19 -logo&lt;/div&gt;</span></span>
<span class="line"><span>        &lt;ul className=&quot;menu&quot;&gt;</span></span>
<span class="line"><span>          &lt;li&gt;首页&lt;/li&gt;</span></span>
<span class="line"><span>          &lt;li&gt;文档&lt;/li&gt;</span></span>
<span class="line"><span>        &lt;/ul&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br><span class="line-number">10</span><br></div></div>`,31)),t("p",null,[s[0]||(s[0]=a("注意：如果需要给多根节点添加 key（比如循环渲染时），还是需要显式写 ",-1)),c(p,{key:"{index}"}),s[1]||(s[1]=a("，因为简写的 <></> 不支持添加属性。",-1))]),s[3]||(s[3]=n(`<h3 id="_2-特性-2-改进的-fragment-语法与属性支持" tabindex="-1">2. 特性 2：改进的 Fragment 语法与属性支持 <a class="header-anchor" href="#_2-特性-2-改进的-fragment-语法与属性支持" aria-label="Permalink to “2. 特性 2：改进的 Fragment 语法与属性支持”">​</a></h3><p>React 19 对 Fragment 语法做了优化，除了支持默认不包裹，还允许给显式 Fragment 添加更多属性（之前版本仅支持 key）。比如我们可以给 Fragment 添加 className，用于样式控制：</p><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    // React 19：Fragment 支持添加 className 等属性</span></span>
<span class="line"><span>    function UserInfo({ user }) {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;Fragment className=&quot;user-info-container&quot;&gt;</span></span>
<span class="line"><span>          &lt;p&gt;姓名：{user.name}&lt;/p&gt;</span></span>
<span class="line"><span>          &lt;p&gt;邮箱：{user.email}&lt;/p&gt;</span></span>
<span class="line"><span>        &lt;/Fragment&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br></div></div><p>这种写法在需要给一组同级节点统一添加样式或其他属性时非常实用，避免了额外嵌套 div 标签。</p><h3 id="_3-特性-3-jsx-中直接使用-promise-配合-use-hook" tabindex="-1">3. 特性 3：JSX 中直接使用 Promise（配合 use() Hook） <a class="header-anchor" href="#_3-特性-3-jsx-中直接使用-promise-配合-use-hook" aria-label="Permalink to “3. 特性 3：JSX 中直接使用 Promise（配合 use() Hook）”">​</a></h3><p>React 19 新增的 <code>use()</code> Hook 允许我们在 JSX 中直接处理 Promise 数据，无需额外写 useEffect 来监听 Promise 状态。这是 JSX 与数据处理结合的重要增强，简化了异步数据渲染逻辑。</p><p>示例：从接口获取用户数据并渲染</p><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    import { use } from &#39;react&#39;;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    // 模拟接口请求：返回 Promise</span></span>
<span class="line"><span>    function fetchUser() {</span></span>
<span class="line"><span>      return new Promise((resolve) =&gt; {</span></span>
<span class="line"><span>        setTimeout(() =&gt; {</span></span>
<span class="line"><span>          resolve({ name: &quot;小明&quot;, age: 22 });</span></span>
<span class="line"><span>        }, 1000);</span></span>
<span class="line"><span>      });</span></span>
<span class="line"><span>    }</span></span>
<span class="line"><span></span></span>
<span class="line"><span>    // 组件中直接用 use() 处理 Promise</span></span>
<span class="line"><span>    function UserProfile() {</span></span>
<span class="line"><span>      // use() 接收 Promise，返回 resolved 后的数据</span></span>
<span class="line"><span>      const user = use(fetchUser());</span></span>
<span class="line"><span></span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div&gt;</span></span>
<span class="line"><span>          &lt;h2&gt;用户信息&lt;/h2&gt;</span></span>
<span class="line"><span>          &lt;p&gt;姓名：{user.name}&lt;/p&gt;</span></span>
<span class="line"><span>          &lt;p&gt;年龄：{user.age}&lt;/p&gt;</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br><span class="line-number">10</span><br><span class="line-number">11</span><br><span class="line-number">12</span><br><span class="line-number">13</span><br><span class="line-number">14</span><br><span class="line-number">15</span><br><span class="line-number">16</span><br><span class="line-number">17</span><br><span class="line-number">18</span><br><span class="line-number">19</span><br><span class="line-number">20</span><br><span class="line-number">21</span><br><span class="line-number">22</span><br><span class="line-number">23</span><br><span class="line-number">24</span><br></div></div><p>这里需要注意：use() 只能在函数组件的顶层或自定义 Hook 中使用，不能在条件语句、循环或嵌套函数中使用（遵循 Hooks 的调用规则）。</p><h3 id="_4-特性-4-jsx-注释语法优化" tabindex="-1">4. 特性 4：JSX 注释语法优化 <a class="header-anchor" href="#_4-特性-4-jsx-注释语法优化" aria-label="Permalink to “4. 特性 4：JSX 注释语法优化”">​</a></h3><p>React 19 对 JSX 中的注释语法做了兼容优化，支持更直观的注释写法。之前的注释需要用 <code>{/* 注释内容 */}</code> 包裹，现在在某些场景下也支持 HTML 风格的<code>&lt;!-- 注释内容 --&gt;</code>（不过更推荐还是用 {/* */}，兼容性更好）。</p><div class="language- line-numbers-mode"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark" style="--shiki-light:#24292e;--shiki-dark:#e1e4e8;--shiki-light-bg:#fff;--shiki-dark-bg:#24292e;" tabindex="0" dir="ltr"><code><span class="line"><span>    function CommentDemo() {</span></span>
<span class="line"><span>      return (</span></span>
<span class="line"><span>        &lt;div&gt;</span></span>
<span class="line"><span>          {/* React 推荐的注释写法（全版本兼容） */}</span></span>
<span class="line"><span>          &lt;h2&gt;JSX 注释示例&lt;/h2&gt;</span></span>
<span class="line"><span>          &lt;!-- HTML 风格注释（React 19 支持，不推荐在复杂场景使用） --&gt;</span></span>
<span class="line"><span>          &lt;p&gt;注释不会被渲染到页面上&lt;/p&gt;</span></span>
<span class="line"><span>        &lt;/div&gt;</span></span>
<span class="line"><span>      );</span></span>
<span class="line"><span>    }</span></span></code></pre><div class="line-numbers-wrapper" aria-hidden="true"><span class="line-number">1</span><br><span class="line-number">2</span><br><span class="line-number">3</span><br><span class="line-number">4</span><br><span class="line-number">5</span><br><span class="line-number">6</span><br><span class="line-number">7</span><br><span class="line-number">8</span><br><span class="line-number">9</span><br><span class="line-number">10</span><br></div></div><h2 id="四、jsx-与函数组件的核心注意事项" tabindex="-1">四、JSX 与函数组件的核心注意事项 <a class="header-anchor" href="#四、jsx-与函数组件的核心注意事项" aria-label="Permalink to “四、JSX 与函数组件的核心注意事项”">​</a></h2><p>掌握了基本用法后，咱们再梳理几个容易踩坑的点，帮大家避开误区：</p><ol><li><strong>JSX 中的属性名采用驼峰命名法</strong>：HTML 中的 <code>class</code> 要写成 <code>className</code>，<code>for</code> 要写成 <code>htmlFor</code>，避免与 JavaScript 关键字冲突。</li><li><strong>JSX 中嵌入 JavaScript 表达式用 {}</strong> ：比如变量、函数调用、三元表达式等，但不能嵌入语句（if、for 等）。示例：<code>{isShow ? &lt;div&gt;显示&lt;/div&gt; : null}</code>。</li><li><strong>函数组件的返回值必须是单个根节点或多根节点（React 19）</strong> ：不能返回 undefined（比如忘记写 return 语句），否则会报错。</li><li><strong>组件名必须以大写字母开头</strong>：React 通过首字母大小写区分组件和普通 HTML 标签。如果组件名小写，React 会把它当作 HTML 标签处理，导致渲染失败。</li></ol><h2 id="五、总结与下一步学习方向" tabindex="-1">五、总结与下一步学习方向 <a class="header-anchor" href="#五、总结与下一步学习方向" aria-label="Permalink to “五、总结与下一步学习方向”">​</a></h2><p>今天咱们重点讲了 React 19 中 JSX 的增强特性和函数组件的基础用法：</p><ul><li>函数组件是 React 19 的核心载体，核心是“接收 props、返回 JSX”，支持嵌套和组合；</li><li>React 19 对 JSX 的增强（多根节点默认不包裹、Fragment 支持更多属性、配合 use() 处理 Promise 等）大幅提升了开发效率；</li><li>掌握驼峰命名、表达式嵌入等注意事项，能帮我们避开大部分基础坑。</li></ul><p>下一步，大家可以继续学习 React 19 的内置 Hooks（比如 useState、useEffect），这是实现组件状态管理和副作用处理的核心。后续我也会继续更新相关文章，敬请期待～</p><p>如果这篇文章对你有帮助，欢迎点赞、收藏、转发～ 有任何问题也可以在评论区留言交流～</p>`,20))])}const f=e(b,[["render",u]]);export{v as __pageData,f as default};
