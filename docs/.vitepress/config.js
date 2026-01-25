import myNav from "./nav.js";
import mySidebar from "./sidebar/index.js";
export default {
  title: "WThinking",
  description: "Just playing around.",
  author: "wujihuan",
  base: "/wujihuan-doc/",
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
  },
  ignoreDeadLinks: true, //忽略所有死链接
  lang: "en-US",
  head: [
    [
      "link",
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
    ],
    // would render: <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  ],
  themeConfig: {
    nav: myNav, //导航栏配置
    sidebar: mySidebar, //侧边栏配置
    author: "wujihuan",
    lastUpdatedText: "上次更新时间", //最后更新时间文本
    // logo: "/img/avatar.jpg", //导航栏左侧头像
    socialLinks: [{ icon: "github", link: "https://github.com/Jlnvv-tom" }],
    docFooter: {
      //上下篇文本
      prev: "上一篇",
      next: "下一篇",
    },
    editLink: {
      pattern: "https://github.com/Jlnvv-tom/wujihuan-doc/edit/dev/docs/:path",
    },
    footer: {
      message: "热爱生活，喜好美食，追求未来！",
      copyright: "Copyright © 2026-present 焕然一新组合出版",
    },
    aside: "right",

    search: {
      provider: "local", // 本地搜索
    },
  },
};
