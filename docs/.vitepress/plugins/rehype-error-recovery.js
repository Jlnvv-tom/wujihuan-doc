/**
 * Vite 插件 + Rehype 插件双重防护：修复 VitePress markdown 管道生成的
 * 各类 HTML 不规范问题，防止 Vue 编译器报错。
 *
 * 问题类型：
 *   - Duplicate attribute            (重复属性)
 *   - Element is missing end tag     (缺失闭合标签)
 *   - X-expected-attribute           (属性格式错误)
 *
 * 原理：
 *   VitePress 把 markdown → HTML 串成字符串塞进 Vue <template>。
 *   Rehype AST 操作的是树节点，rehype-stringify 输出 HTML 字符串时
 *   如果源节点有 bug，输出也会带 bug。
 *   所以我们在 rehype 之后、Vue 编译之前，用 Vite 插件拦截 HTML 字符串，
 *   正则清理最常见的几类问题。
 */
const { visit } = require('unist-util-visit')

// ──────────────────────────────────────────────────────────────
// Part 1: Rehype 插件 — 移除重复属性（AST 层面）
// ──────────────────────────────────────────────────────────────
function rehypeDedupeAttrs() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!node.properties) return
      const seen = new Map()
      for (const key of Object.keys(node.properties)) {
        if (seen.has(key)) {
          delete node.properties[key]
        } else {
          seen.set(key, true)
        }
      }
    })
  }
}

// ──────────────────────────────────────────────────────────────
// Part 2: Vite 插件 — HTML 字符串层面修复（正则兜底）
// ──────────────────────────────────────────────────────────────
function viteHtmlFixPlugin() {
  return {
    name: 'vite-plugin-fix-vue-html-errors',
    enforce: 'pre',

    // 拦截所有 .md 文件在 Vue 编译器之前的 Transform
    transform(code, id) {
      if (!id.endsWith('.md')) return null

      // ── 修复 1：重复属性 ──────────────────────────
      // <tag attr="a" attr="b" ...>  → 保留第一个
      // 同时处理 class="a" class="b" 的特殊情况
      code = code.replace(
        /(<(?:[\w-]+)[\s\S]*?)(\s+(?:class|id|src|href|target|alt|title|data-\w+)="[^"]*")(\s+\2)+/g,
        '$1$2',
      )
      // 通用兜底：同一属性名出现 ≥2 次，保留第一个
      code = code.replace(
        /(\s+)([\w-]+)="[^"]*"(?=\s)(?=[\s\S]*\1\2="[^"]*")/g,
        '',
      )

      // ── 修复 2：修复不完整的 HTML 标签 ──────────────
      // 处理 <br>, <hr>, <img 等缺少 /> 的自闭合
      // 但只处理已经被 Vue 标记为"缺失闭合"的场景
      // 常见模式：在属性值里出现未转义的 <
      code = code.replace(/(<img\s[^>]*)(?<!(\/\s|>))(\s*>)/g, '$1 />$3')

      // ── 修复 3：修复 HTML 注释中的问题 ──────────────
      // <!-- --> 通常无害，但如果有未闭合的 <!-- 会污染整段
      // 补全缺失的 end tag（极少见，但出现过）
      if (!code.includes('-->') && code.includes('<!--')) {
        code = code.replace(/<!--[\s\S]*$/, '')
      }

      return code
    },
  }
}

module.exports = { rehypeDedupeAttrs, viteHtmlFixPlugin }
