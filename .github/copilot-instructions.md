# dsh-gfm-alerts 仓库约定

## DSH 插件依赖声明

- 本插件不 import 任何带版本号的 `@deepseek-ai/dsh-*` 宿主包，宿主版本下界只写在 `engines.dsh`。
- 将来若必须依赖宿主共享包，一律声明在 `peerDependencies` 并逐项标 `peerDependenciesMeta.optional: true`，禁止放进 `dependencies`：不标 `optional` 时 profile 的 `pnpm peers check` 会把这些包全报成 `missing peer`；放进 `dependencies` 会在插件自己的 `node_modules` 里装一份独立拷贝、遮蔽宿主版本。

## 渲染与 DOM

- 只挂 `data-*` 属性、只改文本节点的值、只注入一个 `<style>`；不插入、不移动 React 节点，不覆盖宿主槽位。
- 样式只用 `--dsw-alias-*` 主题 token；字面色值只允许出现在图标 SVG 与文档插图里。
- 标记识别规则与 DOM 契约同步维护在 `doc/design.md` §4；改 `lib/client.js` 的标记正则、选择器或属性名时，同步改 `scripts/check.mjs`。

## 检查与提交

- 提交前跑 `npm run check`。
- 新增行为要在 `scripts/check.mjs` 里加断言，并至少做一次反向验证（让该断言变红）后再提交。
