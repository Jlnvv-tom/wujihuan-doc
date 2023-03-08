const myNav = [
  {
    text: '名人名言',
    items: [
      { text: '文学', link: '/guide/' },
      {
        items: [
          { text: '现代文学', link: '/guide/' },
          { text: '西方文学', link: '/guide/' },
          { text: '古典文学', link: '/guide/' },
          { text: '现到文学', link: '/guide/' },
        ]
      },
      { text: '现到文学', link: '/guide/' },
    ]
  },
  {
    text: '前端学习',
    items: [
      { text: 'Javascript', link: '/handbook/javascript/' },
      {
        items: [
          { text: 'HTML5', link: '/handbook/' },
          { text: 'CSS', link: '/handbook/' },
          { text: 'VUE', link: '/handbook/' },
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
]
export default myNav