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

# About author

Say hello to our awesome team.

<VPTeamMembers size="small" :members="members" />
