# tsconfig.json 配置介绍

tsconfig.json 是用来配置 TS 编译选项的，通常位于项目的根目录位置。

我们可以用 ts 提供的 tsc 命令行工具，执行 tsc --init。
```
$ tsc --init

Created a new tsconfig.json with:                                                                   
                                                                                                 TS 
  target: es2016
  module: commonjs
  strict: true
  esModuleInterop: true
  skipLibCheck: true
  forceConsistentCasingInFileNames: true
```

You can learn more at https://aka.ms/tsconfig
然后我们就能得到一个默认的 tsconfig.json 文件，且这是一种可以添加注释的 json 文件。

里面有很多带有注释的选项，目的是让开发者能够反注释快速启用一些配置。

但注释的选项太多了，所以我将它们移除了，得到下面的默认配置：
```
{
  "compilerOptions": {
    /* Visit https://aka.ms/tsconfig to read more about this file */

    "target": "es2016",       /* Set the JavaScript language version for emitted JavaScript and include compatible library declarations. */
    "module": "commonjs",     /* Specify what module code is generated. */
    "esModuleInterop": true,  /* Emit additional JavaScript to ease support for importing CommonJS modules. This enables 'allowSyntheticDefaultImports' for type compatibility. */
    "forceConsistentCasingInFileNames": true, /* Ensure that casing is correct in imports. */
    "strict": true,           /* Enable all strict type-checking options. */
    "skipLibCheck": true      /* Skip type checking all .d.ts files. */
  }
}
```
顶层配置
首先我们看配置最上层级的配置字段。

## compilerOptions：
编译器相关的选项。比如配置编译成 ES5，模块化使用 commonjs 等。这里的编译配置很多，后面我们会讲解一些常用的配置；

## files：
指定需要被编译的文件列表。这里不能指定目录，只能是文件，可以省略 .ts 后缀。适合需要编译的文件比较少的情况。默认值为 false；
## include：
指定需要编译的文件列表或匹配模式。include 可以通过通配符指定目录，如 "src/**/*" 表示 src 下的所有文件。如果没有指定 files 配置，默认值为 ** ，即项目下所有文件；如果配置了 files，默认值为 [] 空数组；
## exclude：
在 include 圈定的范围内，排除掉一些文件。我们经常用它来排除编译输出目录、测试文件目录、一些生成文件的脚本等文件。默认值为 "node_modules,bower_componen"；
## extends：
继承另一个 ts 配置文件。这在 monorepo 的代码组织中非常有用，不同的 package 可以通过 extends 继承通用的 ts 配置。用法示例："extends": "./common-tsconfig.json"。
## reference：
引用。项目中如果有多个相互独立的模块，可以使用这个属性来做分离。这样一个模块改变后，就只重新编译这个模块，其他模块不重新编译。编译时要改用 tsc --build。这在非常大的项目中应该能有不小收益。
需要注意的是，files、include、exclude 只是指定编译的入口文件范围，如果其中的文件 import 了范围外的 ts 文件，范围外的文件依旧会被编译。

在 VSCode 下，范围外的 ts 文件不会应用项目下的 tsconfig.json 配置。
常用的编译器配置（compilerOptions）
接下来我们就来看看 compilerOptions 下的常用配置属性。

因为配置项实在很多，我就挑一些比较基本的进行讲解。

## target:
指定编译的目标版本。

tsc 也可以像 babel 一样，可以将高版本的 TS / JS 编译为低版本。你看这个 tsc 脚本多大。
target 用于指定 TS 最后编译出来的 ES 版本，默认值是 ES3。

对于一些高版本引入的新 API 并，tsc 不会注入 polyfill，你需要自己全量引入 core-js，这点还是 babel 提供的按需引入 core-js 要更好一些。

当然其他的不能 polyfill 的实现，tsc 还是会做处理的。比如箭头函数转换为普通函数，async / await 转换为一大坨的等价代码。

说实在的，ES3 实在有够古老的，很多 API 都不支持，个人觉得默认为 ES5 比较好。
我想大概是历史原因，因为 TS 发布那会，ES6 还没出来，只有 ES5 编译成 ES3 这一种情况。现在虽然 ES5 已经广泛支持了，但为了兼容还是保持默认的 ES3。
target 支持的值有：es3、es5、es6（也叫 es2015）、es2016 一直到 es2022、然后还有 esnext。没有 es7 这种东西，你得用 es2016。另外，esnext 指的是当前版本的 TS 编译器支持的最高版本。

这些值是大小写不敏感的，可以是 es5、ES5，或大小写混杂。

通常来说前端项目会使用 es5。后端项目就看 nodejs 的版本支持 ES 的程度，像 Nestjs 脚手架生成的项目，taget 指定为 es2017。

## lib:
TypeScript 默认自带通用的 JS 内置 API 的类型声明，比如 Math、RegExp 等。

但 JS 运行的环境各种各样，会有一些特有的全局对象，比如浏览器下的 document，新的 ES 版本引入的新的 API。

为此，我们可以用 lib 这个属性来设置需要引入的全局类型声明。

lib 有高层级的：ES5、ES2015、DOM 、ESNEXT、WebWorker、ScriptHost 等。或是低层级模块的 DOM.Iterable、ES2015.Core、ES2017.TypedArrays、 ES2018.Intl 等。高层级通常是多个全局类型声明的组合。

lib 的默认值通过 target 来指定，比如你的 target 指定为 ES7，它就会引入 ES7 的全局类型（大概是 lib.es2016.full.d.ts）。

但如果你想用最新版本的 ES 语法，但希望它能编译成兼容性良好的 ES5，你就要手动设置 lib，像下面这样：
```
"target": "ES5",
"lib": [
  "DOM",
  "DOM.Iterable",
  "ESNext"
]
```
lib 可以引入的全局类型声明文件都在这个目录下：

https://github.com/microsoft/TypeScript/blob/main/lib

## strict:
启用严格模式，能够更能保证类型检测的正确。

将 strict 设置为 true，会开启一系列的严格的类型检验配置。

比如 strictNullChecks 配置的默认值会变成 true。这样一些对象类型就不能赋值为 undefined 或 null，就能一定程度阻止 obj.prop 可能导致的 Cannot read properties of undefined 的运行时错误。

还比如 strictBindCallApply 默认值变成 true。此时，对函数使用 bind、call、apply，参数类型必须和原函数类型相同。如果是 false，则可以是任何类型。

此外还有很多其他的和严格模式相关的配置也会开启。

建议开启 strict，能减少 bug，缺点是要多写一些类型推断和分支判断的代码。

## baseUrl:
baseUrl 用于设置基础 url，可以帮我们省掉一些多余的路径前缀。

比如我们原来要写长长的：

import { Login } from "./src/features/user/login";
但如果我们设置 baseUrl 为 ./src，我们使用绝对路径时就能去掉重复的前缀，将路径写短一些：

import { Login } from "features/user/login";
相对路径不需要 baseUrl，因为它是相对于当前文件路径计算的。

./src 的 . 为 tsconfig.json 配置文件所在的目录路径。其实写成 src 也可以，它和 ./src 是等价的。

如果你不设置 baseUrl，模块文件 import 需要使用相对路径，或绝对路径（不是针对项目根目录的绝对路径，而是完整的路径）。

如果你想使用相对项目根目录的路径，你需要将 baseUrl 设置为 . 。

## paths:
路径重映射。

要使用 paths，首先要设置好 baseUrl，paths 的源路径和新路径会使用 baseUrl 作为相对路径计算。
```
"baseUrl": "./src",
"paths": {
  "@lib/*": ["./other/_lib/*", "./other/_lib2/*"]
},
```
上面的配置，是将 other/_lib 和 other/_lib2 路径重映射为 @lib。

这里的 @ 并不是必须的，这样写只是表明这个路径是一个重映射，或者叫别名，实际上文件系统上不存在对应的真实目录。
```
这样，原来比较冗长的路径：

import LibA from "other/_lib/lib_a";
就可以改为：

import LibA from "@lib/lib_a";
```
## declaration:
是否给每个编译出来的 JS 生成对应的 d.ts 类型声明文件。

TS 编译后变成的 JS 是不携带类型信息的。如果你想要保留信息，就需要一个 d.ts 文件来描述对应的 JS 文件。

我们用 NPM 安装的第三方包，这些包下的 package.json 文件的 types 属性，就指定了这个包的类型文件。如果没有显式提供 types 属性，则使用默认的 index.d.ts。

## declarationDir:
指定编译生成的类型声明文件输出的目录。不提供的话，默认和生成的 js 文件放在一起。

"declarationDir": "./types"
## outDir:
编译文件的输出目录，默认为 .，即项目根目录。如果不设置它，编译后的文件就会和源文件混杂在一起。通常我们会将 outDir 设置为 "./dist"。

## outFile:
将所有 ts 文件合并编译生成一个 js 文件和它的类型声明 d.ts 文件。

这个配置项很少用，因为它只能用在不支持模块化导入的系统，即所有的 ts 文件都是全局的。

换句话说，module 配置项需要为 None、System 或 AMD。

"outFile": "./app.js"
## module：
编译后的 JS 使用哪种模块系统。

模块系统常用的有两种：ESModule 和 CommonJS。前者是 ES 的标准（使用了 import 关键字），后者则是 Nodejs 的使用的模块系统（使用了 require）。此外还有 AMD、UMD 等。

支持的值有：none、commonjs、amd、umd、system、es6/es2015、es2020、es2022、esnext、node16、nodenext。

它们的具体不同可以看官方文档的代码示例：
https://www.typescriptlang.org/tsconfig#module
如果 target 是 ES3 或 ES5，默认值是 CommonJS（毕竟 ES6 后才有的 ESModule）；否则为 ES6/ES2015。

## allowJs：
将 js 文件也作为编译对象，可以被 ts 文件引入。布尔值，默认为 false。

## types:
类型声明的一种引入方式是 @types 包，比如 React 框架使用了 flow 作为类型系统，为了支持 TypeScript，React 团队又写一套 d.ts 类型文件，发布到 @types/react 包上。

然后我们下载这个类型包后，并使用类似 import React from 'react'，TS 会从从 node_modules/@types 中找到 react 文件夹，如果找不到，就会向上一层目录继续找，知道找到位置。如果存在，这个 React 对象就会被赋予声明的类型。

@types 可以是模块类型声明（像 React 类型），也可以是全局类型声明（如 nodejs 的 process 对象类型）。

types 配置 可指定只使用哪些全局类型声明，而不是 node_modules/@types 下所有的类型声明。如：

"lib": [
  "node", // 即 node_modules/@types/node
  "jest"
]
## typeRoots:
前面说到 ts 会递归查找 node_modules/@types 去寻找类型声明文件。

但你也可以用 typeRoots 来 指定只寻找特定目录下的类型声明文件，如：

"typeRoots": ["./typings", "./vendor/types"]
## 结尾
tsconfig 的配置非常多，但我想基本上掌握上面这几个配置的使用就差不多了。