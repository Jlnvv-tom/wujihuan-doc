const myNav = [
  { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
  { text: 'Config', link: '/handbook/', activeMatch: '/handbook/' },
  { text: 'Plugins', link: '/plugins/', activeMatch: '/plugins/' },
  {
    text: 'Resources',
    items: [
      { text: 'Team', link: '/team' },
      {
        items: [
          {
            text: 'Twitter',
            link: 'https://twitter.com/vite_js',
          },
          {
            text: 'Discord Chat',
            link: 'https://chat.vitejs.dev',
          },
          {
            text: 'Awesome Vite',
            link: 'https://github.com/vitejs/awesome-vite',
          },
          {
            text: 'DEV Community',
            link: 'https://dev.to/t/vite',
          },
          {
            text: 'Rollup Plugins Compat',
            link: 'https://vite-rollup-plugins.patak.dev/',
          },
          {
            text: 'Changelog',
            link: 'https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md',
          },
        ],
      },
    ],
  },
]
export default myNav