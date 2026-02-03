const DEFAULT_OPTIONS = {
  //We set loose as default here because is needed to load images
  securityLevel: "loose",
  startOnLoad: false,
};

export function MermaidPlugin(inlineOptions) {
  // eslint-disable-next-line no-unused-vars
  const options = {
    ...DEFAULT_OPTIONS,
    ...inlineOptions,
  };

  const virtualModuleId = "virtual:mermaid-config";
  const resolvedVirtualModuleId = "\0" + virtualModuleId;

  return {
    name: "vite-plugin-mermaid",
    enforce: "post",

    transform(src, id) {
      //Register Mermaid component in vue instance creation
      if (id.includes("vitepress/dist/client/app/index.js")) {
        console.log("11111111111==========>", options, src, id);

        src =
          "\nimport Mermaid from 'vitepress-plugin-mermaid/Mermaid.vue';\n" +
          src;

        const lines = src.split("\n");

        const targetLineIndex = lines.findIndex((line) =>
          line.includes("app.component"),
        );

        lines.splice(
          targetLineIndex,
          0,
          '  app.component("Mermaid", Mermaid);',
        );

        src = lines.join("\n");

        return {
          code: src,
          map: null, // provide source map if available
        };
      }
    },

    async resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
    },
    async load(a, id) {
      console.log("a==========>", a, 1, id);
      if (id === resolvedVirtualModuleId) {
        return `export default ${JSON.stringify(options)};`;
      }
    },
  };
}
