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
      { text: 'Javascript', link: '/handbook/' },
      {
        items: [
          { text: 'HTML5', link: '/handbook/' },
          { text: 'CSS', link: '/handbook/' },
          { text: 'VUE', link: '/handbook/' },
          { text: '算法', link: '/handbook/' },
        ]
      },
      { text: '设计模式', link: '/guide/' },
    ]
  },
  { text: '计算机科学', link: '/computer/', activeMatch: '/computer/' },
  { text: '美好生活', link: '/good-life/', activeMatch: '/good-life/' },
  { text: '思想感悟', link: '/inspiration/', activeMatch: '/inspiration/' },
]
export default myNav