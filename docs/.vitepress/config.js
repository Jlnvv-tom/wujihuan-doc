import myNav from './nav.js'
import mySidebar from './sidebar.js'
export default {
  title: 'WThinking',
  description: 'Just playing around.',
  author: 'wujihuan',
  base: '/wujihuan-doc/',
  markdown: {
    lineNumbers: true,
  },
  lang: 'en-US',
  head: [
    [
      'link',
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }
    ]
    // would render: <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  ],
  themeConfig: {
    nav: myNav, //导航栏配置
    sidebar: mySidebar, //侧边栏配置
    author: 'wujihuan',
    lastUpdatedText: '上次更新时间', //最后更新时间文本
    logo: "/avatar.jpeg", //导航栏左侧头像
    docFooter: { //上下篇文本
      prev: '上一篇',
      next: '下一篇'
    },
  }
}