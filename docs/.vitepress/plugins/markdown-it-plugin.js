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
