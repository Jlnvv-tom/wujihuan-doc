# 有趣的SVG

## SVG介绍
- `可缩放矢量图形（Scalable Vector Graphics，SVG）基于 XML 标记语言，用于描述二维的矢量图形。`

- `和传统的点阵图像模式（如 JPEG 和 PNG）不同的是，SVG 格式提供的是矢量图，这意味着它的图像能够被无限放大而不失真或降低质量，并且可以方便地修改内容，无需图形编辑器。通过使用合适的库进行配合，SVG 文件甚至可以随时进行本地化。`

SVG 可以像写HTML标签和css一样绘制出绚烂多彩的矢量图形来。

## SVG使用

```html
<svg width="200" height="200" viewBox="-100 -100 200 200">
  <circle cx="0" cy="20" r="70" fill="#D1495B" />

  <circle
    cx="0"
    cy="-75"
    r="12"
    fill="none"
    stroke="#F79257"
    stroke-width="2"
  />

  <rect x="-17.5" y="-65" width="35" height="20" fill="#F79257" />
</svg>
```