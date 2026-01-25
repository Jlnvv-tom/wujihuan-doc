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
        text: "AI 应用",
        items: [
          { text: "LangChain框架", link: "/handbook/fastapi/" },
          { text: "FastAPI框架", link: "/handbook/fastapi/" },
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
          { text: "React.js", link: "/handbook/react/" },
          { text: "Vue.js", link: "/handbook/vue/" },
          { text: "Node.js", link: "/handbook/node/index.md" },
          { text: "HTML5", link: "/handbook/html5/" },
          { text: "CSS", link: "/handbook/css3/" },
          { text: "Axios", link: "/handbook/axios/" },
        ],
      },
    ],
  },
  { text: "计算机科学", link: "/computer/", activeMatch: "/computer/" },
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
