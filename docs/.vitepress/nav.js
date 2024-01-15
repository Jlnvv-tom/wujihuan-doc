const myNav = [
  { text: '名人名言', link: '/guide/', activeMatch: '/guide/' },
  {
    text: '前端学习',
    items: [
      { text: 'Javascript', link: '/handbook/javascript/' },
      {
        items: [
          { text: 'HTML5', link: '/handbook/html5/' },
          { text: 'CSS', link: '/handbook/css3/' },
          { text: 'Axios', link: '/handbook/axios/' },
          { text: 'VUE', link: '/handbook/vue/' },
          { text: 'Node.js', link: '/handbook/node/index.md' },
        ]
      },
      { text: '设计模式', link: '/guide/' },
    ]
  },
  { text: '计算机科学', link: '/computer/', activeMatch: '/computer/' },
  {
    text: '美好生活',
    items: [
      { text: '读书时光', link: '/good-life/read/' },
      { text: '好吃的', link: '/good-life/eat/' },
    ]
  },
  { text: '如是说也', link: '/inspiration/', activeMatch: '/inspiration/' },
  { text: '英语学习', link: '/english/', activeMatch: '/english/' },

]
export default myNav