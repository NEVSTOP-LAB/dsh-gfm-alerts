# 变更记录

本文件记录每个发布版本的用户可见变更。发布工作流
（[`.github/workflows/release.yml`](./.github/workflows/release.yml)）会调用
`scripts/release-notes.mjs`，把与 tag 对应的 `## [<版本>]` 小节抄进 GitHub Release
正文——所以**发版前先在这里写一节**，否则 Release 只会退化成提交列表。

## [Unreleased]

## [0.2.0] - 2026-11-07

### 新增

- **系统提示注入**：Host 半边用 `ctx.systemPrompt.section()` 注册一段排版偏好，让模型在
  回复里优先用 GitHub 提示块（`> [!NOTE]`、`> [!WARNING]` 等）强调信息，而不是单纯的
  加粗、斜体或强烈语气。注入段落的 `order` 是 `10150`，落在宿主 persona 结尾（10200）
  之前。
- **可配置**：`cordis.patch.yml` 行的 `config` 支持 `enabled`（关闭注入）、`text`
  （自定义文本，空串等于不注入）、`order`（提示词里的排序值）。
- **插件页描述**：中英双语描述同步提到提示注入。

### 实现

原来空的 Host 半边现在只做注入：不 import 宿主包、不写 Session 事件、不改回复正文，
随插件行卸载自动移除。渲染仍在 Client 半边，两半互不依赖——Client 由 `dsh.client`
独立加载，Host 缺席不影响提示框渲染。落点取舍、顺序取值与边界见
[doc/design.md](./doc/design.md) §9。升级后需要重启 DSH 才生效。

### 验证

- `npm run check`：39 条断言全绿，其中 9 条是新加的 Host 注入断言——用 fake
  `systemPrompt` 服务加载真实 `index.js`，覆盖默认注入、`enabled: false`、空白
  `text`、自定义 `text` / `order`、非法 `order` 回落。
- 反向验证：把 `DEFAULT_TEXT` 改成不含 `[!NOTE]` / `[!WARNING]` 的文本 ⇒
  1 条 `FAIL injected text asks for GitHub callouts`；改回后 39 条全绿。

## [0.1.0] - 2026-11-02

### 新增

- **GitHub 提示块渲染**：回复里的 `> [!NOTE]`、`> [!TIP]`、`> [!IMPORTANT]`、
  `> [!WARNING]`、`> [!CAUTION]` 渲染成 GitHub 的提示框——圆角底、左侧色条、
  图标加标题，类型大小写不敏感。
- **本地化标题**：`gfm-alerts` 命名空间随插件注册 `en` / `zh` 词典，标题跟随界面语言
  （`Note` / `注意`），切换语言时已显示的提示块同步换标题。
- **主题自适应**：颜色全部取自 `--dsw-alias-*` 主题 token；`important` 的紫色是
  brand 与 error 的 `color-mix()` 混色，混色不可用时落到纯 token。
- **流式与重渲染**：流式输出中同样生效；宿主重新渲染把字面标记写回文本节点时，
  `MutationObserver` 在同一帧内再剥离一次。
- **插件元数据**：`icon.svg` 通过 manifest 的 `icon` 声明，`locale/en.json`、
  `locale/zh.json` 提供双语显示名与描述。

### 实现

DSH `0.2.1-rc.5` 的 Markdown 渲染器是内置 mdast 渲染器，没有块级渲染扩展点，也没有
「助手正文」槽位；整节点覆盖 `conversation.chat.node` 的 `assistant-step` 会连带重写
复制按钮、流式渲染等宿主行为。因此采用装饰方案：识别渲染后的 `blockquote > p` 首段
标记，挂 `data-dsh-gfm-alert*` 属性，样式表用伪元素画标题与图标，不插入、不移动
React 节点。DOM 契约与边界见 [doc/design.md](./doc/design.md)。

### 验证

- `npm run check`：30 条断言全绿（manifest、补丁、locale、bundle 形状、DOM 变换、
  流式补处理、语言切换、样式表 token、清理）。
- 反向验证：把 `MARKER` 的 `NOTE` 改成 `NOTEE` ⇒ 5 条 `FAIL`；把样式表里的
  `var(--dsw-alias-brand-primary)` 换成 `#0969da` ⇒ 1 条
  `FAIL the stylesheet only uses theme tokens for colors`。改回后 30 条全绿。
- 宿主：DSH Desktop `0.2.1-rc.5`，Host 插件行激活
  （`Config.listConfigs` 返回 `include:gfm-alerts`）、页面正常启动
  （客户端入口未失败）。
- 未完成：提示框的最终视觉未由维护者截图核对；替换已安装包需要重启 DSH，
  这一步留给使用者在真实界面上确认。
