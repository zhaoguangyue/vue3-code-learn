/*
Run Rollup in watch mode for development.

To specific the package to watch, simply pass its name and the desired build
formats to watch (defaults to "global"):

```
# name supports fuzzy match. will watch all packages with name containing "dom"
yarn dev dom

# specify the format to output
yarn dev core --formats cjs

# Can also drop all __DEV__ blocks with:
__DEV__=false yarn dev
```
*/

const execa = require('execa')
// 引入模糊匹配
const { fuzzyMatchTarget } = require('./utils')
// 命令行参数
/**
 * process.args 是跟node相关的，返回参数为string[]
 * 第一个值为，node的安装路径
 * 第二个值为，node运行的文件的路径
 * 第三、四。。。个为用空格分隔的参数
 * [
    'C:\\Program Files\\nodejs\\node.exe',
    'D:\\vueAndreact\\test\\index.js',
    'name=张三',
    'age=18'
  ]
 */
const args = require('minimist')(process.argv.slice(2))
// 默认使用vue包
const target = args._.length ? fuzzyMatchTarget(args._)[0] : 'vue'
const formats = args.formats || args.f
console.log(args.formats)
console.log(args.f)
const sourceMap = args.sourcemap || args.s
console.log(111)
// const commit = execa.sync('git', ['rev-parse', 'HEAD']).stdout.slice(0, 7)
const commit = []

console.log(commit)
console.log(111)
execa(
  'rollup',
  [
    '-wc',
    '--environment',
    [
      `COMMIT:${commit}`,
      `TARGET:${target}`,
      `FORMATS:${formats || 'global'}`,
      sourceMap ? `SOURCE_MAP:true` : ``
    ]
      .filter(Boolean)
      .join(',')
  ],
  {
    stdio: 'inherit'
  }
)
