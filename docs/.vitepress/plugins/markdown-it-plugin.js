import sanitizer from "markdown-it-sanitizer";
import attrs from "markdown-it-attrs";
import { container } from "@mdit/plugin-container";


export const MarkdownItSanitizer = (md, pluginOptions) => {
  md.use(sanitizer, {
    // 允许的标签白名单
    allowedTags: ["a", "img", "code", "pre", "p", "br", "strong", "em"],
    // 允许的属性
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt"],
    },
    // 允许的协议
    allowedProtocols: ["http", "https", "mailto"],
  });
};

export const MarkdownItAttrs = (md, pluginOptions) => {
  md.use(attrs, {
    // 允许的属性
    allowedAttributes: ["id", "class", "style", "target", "rel"],
    // 解析错误时忽略而非报错
    leftDelimiter: "{",
    rightDelimiter: "}",
  });
};

export const MarkdownItContainer = (md, pluginOptions) => {
  md.use(container, {
    name: "tip",
    marker: "::",
    validate: (params) => params.trim().match(/^tip\s*(.*)$/),
    render: (tokens, idx, options, env, self) => {
      const m = tokens[idx].info.trim().match(/^tip\s*(.*)$/);
      if (tokens[idx].nesting === 1) {
        return `<div class="tip-box"><p class="tip-title">${m[1] || "提示"}</p>\n`;
      } else {
        return "</div>\n";
      }
    },
  });
};

/**
 * 给所有 pre 和 code 标签强制添加 v-pre 属性
 * 并在代码块内转义 {{}} 防止被 Vue 误解析为插值
 * 解决 VitePress 2.0 alpha 版本未自动给代码块添加 v-pre 的问题
 */
export const MarkdownItVPre = (md, pluginOptions) => {
  // 在所有 token 渲染前，给 code_inline / code_block / fence 添加 v-pre 属性
  md.core.ruler.push("v-pre", (state) => {
    for (const token of state.tokens) {
      if (token.type === "fence" || token.type === "code_block" || token.type === "code_inline") {
        if (!token.attrs) token.attrs = [];
        const hasVPre = token.attrs.some(([k]) => k === "v-pre");
        if (!hasVPre) {
          token.attrs.push(["v-pre", ""]);
        }
        // 同时转义代码块内的 {{ }} 为 &#123;&#123; &#125;&#125;
        // 这样即使 v-pre 不生效，Vue 也不会把它当作插值
        if (token.content) {
          token.content = token.content
            .replace(/\{\{/g, "&#123;&#123;")
            .replace(/\}\}/g, "&#125;&#125;");
        }
      }
    }
    return true;
  });

  // 对普通文本中的 {{ }} 也进行转义（非代码块）
  // 因为 VitePress 2.0 alpha 不会自动给文本节点加 v-pre
  const defaultTextRender = md.renderer.rules.text || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.text = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.content && token.content.includes("{{")) {
      token.content = token.content
        .replace(/\{\{/g, "&#123;&#123;")
        .replace(/\}\}/g, "&#125;&#125;");
    }
    return defaultTextRender(tokens, idx, options, env, self);
  };
};
