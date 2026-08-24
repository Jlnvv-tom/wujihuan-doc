<script setup>
import { VPTeamMembers } from 'vitepress/theme'

const members = [
  {
    avatar: 'https://www.github.com/Jlnvv-tom.png',
    name: 'Wujihuan',
    title: 'Creator',
    links: [
      { icon: 'github', link: 'https://github.com/Jlnvv-tom' },
      { icon: 'twitter', link: 'https://x.com/wjh87851743' }
    ]
  },
  
]
</script>

# 关于作者

Say hello to our awesome team.

<VPTeamMembers size="small" :members="members" />

## 关注公众号

欢迎扫描下方二维码，关注作者的微信公众号，获取更多技术分享与生活感悟。

<div style="display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; margin: 24px 0;">
  <div style="text-align: center;">
    <img src="/images/wxgzh.jpeg" alt="微信公众号" width="200" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
    <p style="margin-top: 8px; font-weight: 600;">微信公众号</p>
  </div>
  <div style="text-align: center;">
    <img src="/images/wxsph.jpg" alt="微信视频号" width="200" style="border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />
    <p style="margin-top: 8px; font-weight: 600;">微信视频号</p>
  </div>
</div>
