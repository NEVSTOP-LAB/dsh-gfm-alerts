# 贡献指南（CONTRIBUTING）

面向维护者与二次开发。用户可见的功能、安装与限制见 [README.md](./README.md)，架构与渲染契约见 [doc/design.md](./doc/design.md)。

本文档是**开发流程、版本要求与验证方法**的出处：README 只陈述用户需要知道的事实，原因、判定依据与操作步骤都在这里。

## 目录

- [1. 目录结构](#1-目录结构)
- [2. 本地开发与检查](#2-本地开发与检查)
- [3. 版本要求与兼容性](#3-版本要求与兼容性)
- [4. 端到端验证](#4-端到端验证)
- [5. 打包与发版](#5-打包与发版)
- [6. 开发坑](#6-开发坑)

## 1. 目录结构

```
dsh-gfm-alerts/
├── README.md             # 用户可见：功能、安装、限制
├── README.en.md          # 同上（英文）
├── CONTRIBUTING.md       # 本文档：开发流程、版本要求、验证方法
├── CHANGELOG.md          # 每个版本的变更；发布正文的来源
├── doc/design.md         # 设计文档：DOM 契约、装饰算法、风险边界
├── package.json          # bundle manifest（dsh.bundle + dsh.client + engines.dsh + icon）
├── cordis.patch.yml      # 组合层：插入插件行
├── icon.svg              # 插件页/插件市场卡片图标（manifest 的 icon）
├── locale/en.json        # 插件显示名与描述（en）
├── locale/zh.json        # 插件显示名与描述（zh）
├── index.js              # Host 半边（系统提示注入）
├── lib/client.js         # Client 半边（window.__ModuleLoader__ bundle：识别标记 + 样式表）
└── scripts/
    ├── check.mjs         # 离线契约检查（manifest + fake DOM 上的真实 bundle + fake systemPrompt 上的真实 Host 半边）
    ├── release-notes.mjs # 由 CHANGELOG 组装 Release 正文（零依赖）
    └── pack.mjs          # 跨平台打包（npm pack → dist/）
```

Host 与 Client 分两半，互不依赖：Host（`index.js`）用 `ctx.systemPrompt.section()` 注入排版偏好，不写会话事件；渲染行为全部在 Client（`lib/client.js`），因为要改的是浏览器里的渲染结果。Client 由 `dsh.client` 独立加载，所以 Host 半边缺席时渲染照常。

## 2. 本地开发与检查

仓库**没有 `node_modules`，也不安装依赖**：检查脚本只用 Node 内置模块，clone 下来直接跑（Node ≥ 20，CI 用 24）。

```sh
npm run check
```

等价于：

```sh
node --check index.js
node --check lib/client.js
node --check scripts/check.mjs
node --check scripts/release-notes.mjs
node scripts/check.mjs
```

### 2.1 `scripts/check.mjs` 为什么存在

`lib/client.js` 是 `window.__ModuleLoader__` bundle：它不能被 `import`，没有类型检查，出错只出现在浏览器 console 里——而这类错误在界面上表现为**提示块静默地保持原样**，没有任何报错。`check.mjs` 用 stub 的 `window` / `document` / `MutationObserver` 配一个最小 fake DOM 加载**真实的 bundle**，断言：

1. manifest 形状：包名、`./client` 导出、`dsh.bundle.patch`、`dsh.client.platform`、`engines.dsh` 下界、icon 是合法 SVG、`files` 覆盖全部运行期文件；
2. **不声明任何带版本号的 `@deepseek-ai/dsh-*` 依赖**（见 §3）；
3. 补丁恰好插入一行，行 id 与模块名都等于包名；
4. 两个 locale 的 `meta.title` / `meta.description` 都非空且键集合一致；
5. bundle id 等于包名、`factory()` 导出 `apply` 与 `inject: ['locale']`；
6. DOM 变换：五种类型识别、大小写不敏感、标记从首段剥离、标记后紧跟的换行被标记为隐藏、单行写法的正文保留、未知标记与普通引用不动、嵌套提示块各自装饰；
7. 流式重渲染：把标记写回文本节点后，`characterData` 记录触发重新剥离；
8. 语言切换：`locale/change` 后所有已装饰提示块的标题换成新语言；
9. 样式表：五种类型的规则都在、用到 `mask-image` 与 data URI、**只出现 `--dsw-alias-*` 主题 token、没有字面色值**；
10. 清理：disposer 移除样式表并断连 observer；
11. Host 半边：插件对象与 `inject: ['systemPrompt']`；默认配置恰好注册一个 prompt section、注入文本含提示块写法；`enabled: false` 与空白 `text` 不注册；自定义 `text` / `order` 被采用，非法 `order` 回落到默认值。

### 2.2 证明它能失败

一个永远绿的检查等于没有检查。三条反向验证（已实测）：

- 把 `lib/client.js` 里 `MARKER` 的 `NOTE` 改成 `NOTEE` ⇒ 5 条 `FAIL`，其中
  `FAIL NOTE alert is recognized and labelled: type attribute missing`；
- 把样式表里 note 的 `var(--dsw-alias-brand-primary)` 改成 `#0969da` ⇒
  `FAIL the stylesheet only uses theme tokens for colors: a literal hex color is present`；
- 把 `index.js` 的 `DEFAULT_TEXT` 改成不含 `[!NOTE]` / `[!WARNING]` 的文本 ⇒
  `FAIL injected text asks for GitHub callouts: 缺少：…`（2026-11-02、2026-11-07）。

改完立刻改回，再跑一次 `npm run check` 确认全绿。

## 3. 版本要求与兼容性

- **`engines.dsh` 是唯一的宿主版本声明**（当前 `>=0.2.0-rc.1`，实测 DSH Desktop 的 `0.2.1-rc.5`）。上界不写，宿主的兼容判定只看下界。
- **不 import 任何带版本号的 `@deepseek-ai/dsh-*` 宿主包**：Client 半边的 `require` 只从浏览器模块表取（本插件一个都不需要），Host 半边不 import 库。重新引入这类依赖会在宿主的组合期被判为不兼容，插件行直接不激活。
- 若将来必须依赖宿主共享包，**一律声明在 `peerDependencies` 并逐项标 `peerDependenciesMeta.optional: true`**，不要放进 `dependencies`：不标 `optional` 时 profile 的 `pnpm peers check` 会把这些包全报成 `missing peer`；放进 `dependencies` 会在插件自己的 `node_modules` 里装一份独立拷贝、遮蔽宿主版本。
- 本插件依赖的宿主契约（改动前先在真实宿主里确认）：
  - `window.__ModuleLoader__.load({ id, factory })` 与 `factory()` 返回 `{ apply, inject }`；
  - Client 服务 `locale`：`register(namespace, { en, zh })` 与 `bind(namespace)`；
  - 事件 `locale/change`；
  - Host 服务 `systemPrompt.section({ name, order, text })`：注册一个 prompt section，返回 disposer；`order` 必须是有限数，宿主内置段落占用 9000–10200；
  - Markdown 渲染器输出的 `blockquote > p` 结构与字面标记的位置（见 `doc/design.md` §2）；
  - 主题 token 名：`--dsw-alias-brand-primary`、`--dsw-alias-state-{success,warn,error}-primary`、`--dsw-alias-bg-layer-1`、`--dsw-alias-border-l1`、`--dsw-alias-label-primary`。

## 4. 端到端验证

UI 的最终确认只能靠真实宿主，且**替换已安装的插件包需要重启 DSH**（新的包解析要重新组合）：

```sh
npm run pack
dsh plugin --profile <test-profile> add ./dist/dsh-gfm-alerts-<version>.tgz
# 或：dsh plugin --profile <test-profile> add github:NEVSTOP-LAB/dsh-gfm-alerts#<sha>
```

重启 DSH、刷新页面后，在对话里发一条含提示块的回复（或在已有回复里找一条），确认：

- 五种类型各自是圆角框，左侧色条与标题颜色对应；标题跟随界面语言；
- 切浅色/深色主题，提示框颜色跟着变；
- 框内正文正常，没有残留的 `[!NOTE]` 字面；
- 提示块里的代码块、列表、链接仍然可用；
- 新开一个会话，让它回答一个需要强调的问题：回复倾向用提示块强调；把行 config 的 `enabled` 改成 `false` 再重启，该偏好消失。

卸载：`dsh plugin --profile <test-profile> remove dsh-gfm-alerts`（同样要重启）。

## 5. 打包与发版

1. 改 `package.json` 的 `version`；
2. 在 `CHANGELOG.md` 里写 `## [<version>] - <日期>` 小节（发布正文从这一节抄）；
3. 提交，然后打标签并推送：

```sh
git tag v<version>
git push origin v<version>
```

`.github/workflows/release.yml` 会校验 `package.json` 版本与标签一致、跑 `npm run check`、`npm run pack`、由 `scripts/release-notes.mjs` 组装正文，最后创建 GitHub Release 并附上 `dist/dsh-gfm-alerts-<version>.tgz`。

发布后核对：`gh release view v<version>` 的正文含本版变更与安装块，附件里有 tarball。

## 6. 开发坑

- **只动属性与文本，不动节点**：React 管理 `blockquote` 的子树；插入/移动元素会让对账出现「node to be removed is not a child」这类错误。挂 `data-*` 属性、改文本节点的值、注入一个 `<style>` 是安全的；React 重新渲染把字面标记写回来时由 observer 补处理。
- **observer 观察 `characterData`**：自己的剥离也会触发一次回调，因此识别必须幂等——第二次跑找不到标记就只做标题同步。
- **样式表按属性选择器取优先级**：宿主对 `blockquote` 的规则是 `.<markdown class> blockquote`（0,1,1），本插件的 `blockquote[data-dsh-gfm-alert]` 是 0,1,1 再加属性选择器；不要把选择器降级成 `blockquote` 单标签，否则会被宿主覆盖。
- **`color-mix()` 要有回退**：`important` 的紫色由 brand 与 error 混色得来，先写一个纯 token 的 `--dsh-gfm-alert-accent`，再用 `color-mix()` 覆盖；不支持混色的浏览器落到纯 token。
- **标题用 `content: attr(...)` 画**：文案由 JS 按当前语言写进属性，切换语言时改属性，不重建样式表。
- **只想改显示**：不要改宿主渲染器的输入文本、不要写会话事件——提示块的 Markdown 源必须保持原样。
- **注入走 `systemPrompt.section()`**：不要为了「让模型看到偏好」往 `agent/pre-step` 塞 user 消息——那样会进会话记录、占一个消息位，还要自己判重；prompt section 只影响提示词。
- **注入顺序用配置项**：默认 `order: 10150` 取自宿主的 `SECTION_ORDERS` 尾部（9000–10200），宿主调整段落时改配置而不是改代码里的魔法数。
- **`apply` 可能不被调用**：插件行声明了 `inject: ['systemPrompt']`，宿主没有该服务时插件行等待；不要在 `apply` 之外假设注入已经生效。
