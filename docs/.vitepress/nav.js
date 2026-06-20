const myNav = [
  { text: "名人名言", link: "/guide/", activeMatch: "/guide/" },
  {
    text: "软件与编程",
    items: [
      {
        text: "编程语言",
        items: [
          { text: "JavaScript", link: "/handbook/javascript/" },
          { text: "Python", link: "/handbook/python/" },
          { text: "Golang", link: "/handbook/golang/" },
        ],
      },
      {
        text: "数据库",
        items: [
          { text: "MySQL", link: "/handbook/mysql/" },
          { text: "Redis", link: "/handbook/redis/" },
          { text: "MongoDB", link: "/handbook/mongodb/" },
        ],
      },
      {
        text: "前端知识",
        items: [
          { text: "Electron", link: "/handbook/electron/" },
          { text: "React.js", link: "/handbook/react/" },
          { text: "Vue.js", link: "/handbook/vue/" },
          { text: "Node.js", link: "/handbook/node/index.md" },
          { text: "CDP 浏览器协议", link: "/handbook/cdp/" },
          { text: "HTTP网络知识", link: "/computer/http/" },
          // { text: "HTML5", link: "/handbook/html5/" },
          // { text: "CSS", link: "/handbook/css3/" },
          // { text: "Axios", link: "/handbook/axios/" },
        ],
      },
    ],
  },
  {
    text: "AI 产品与应用",
    items: [
      {
        text: "开发框架",
        items: [
          { text: "LangChain框架", link: "/handbook/langchain/" },
          { text: "FastAPI框架", link: "/handbook/fastapi/" },
          { text: "AI Agent框架", link: "/handbook/ai-agent/" },
        ],
      },
      {
        text: "全栈开发",
        items: [
          { text: "AI Agent原生开发", link: "/handbook/ai-agent-raw/" },
          { text: "AI SDD 全栈开发实战 ", link: "/handbook/ai-sdd/" },
          { text: "AI Agent 企业应用实战", link: "/handbook/ai-agent-dev/" },
          {
            text: "AI Agent 全栈开发",
            link: "/handbook/ai-agent-fullstack/",
          },
        ],
      },
      {
        text: "AI 产品",
        items: [
          { text: "AI产品经理实训", link: "/handbook/ai-agent-product/" },
        ],
      },
    ],
  },
  {
    text: "美好生活",
    items: [
      { text: "读书时光", link: "/good-life/read/" },
      { text: "吃喝玩乐", link: "/good-life/eat/" },
    ],
  },
  { text: "如是说也", link: "/inspiration/", activeMatch: "/inspiration/" },
  { text: "英语学习", link: "/english/", activeMatch: "/english/" },
];

export default myNav;
