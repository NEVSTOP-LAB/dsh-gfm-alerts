# 设计文档：GitHub 提示块的渲染方案

面向维护者。用户可见的行为见 [README.md](../README.md)，开发与发版流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 1. 目标与约束

- 目标：DSH 回复里的 GitHub 提示块（`> [!NOTE]` 等五种）显示成 GitHub 的提示框，且随主题与界面语言变化。
- 约束一：**只改显示**。会话记录、事件流、导出的 Markdown 必须保持原文，因此不能在产生消息的环节改文本。
- 约束二：**不能覆盖宿主的对话渲染**。整节点覆盖会连带重写复制按钮、图片、流式渲染与折叠逻辑，等于把宿主行为复制一份。
- 约束三：插件不能因为一个提示块而弄坏界面。Client 插件入口失败会让整个 Web boot 失败（宿主的 `web boot: N entries did not activate`），所以 `apply` 必须不抛异常。

## 2. 宿主现状（DSH 0.2.1-rc.5）

- Markdown 渲染器是宿主内置的 mdast 渲染器：节点类型在固定的 `switch` 里渲染，`blockquote` → `<blockquote>{children}</blockquote>`，`paragraph` → `<p>{children}</p>`。
- 没有可注册的块级渲染扩展点，也没有「助手正文」槽位。`conversation.chat.node` 的 `assistant-step` 是**整节点**渲染器槽位（`replaceRisk: shadows-shipped-ui`），替换它要自己重写助手消息行。
- Markdown 容器的子节点之间由渲染器插入 `\n` 文本节点（用于保持行内空白），因此「第一个元素子节点」是 `:first-of-type` 而不是 `:first-child`。
- `break` 节点渲染成 `<br>` 加一个 `\n` 文本节点。

所以：**唯一不需要复制宿主行为的落点是渲染后的 DOM**。

## 3. 方案取舍

| 方案 | 结果 |
| --- | --- |
| 注册 Markdown 块级渲染器 | 宿主没有这个扩展点 |
| 替换 `assistant-step` 渲染器 | 要复制助手消息的全部宿主行为，宿主升级即碎 |
| 装饰渲染后的 `blockquote` | 只碰属性、文本与一份样式表；最坏退化为普通引用块 |

选择第三条，并把侵入面压到最小：**不插入、不移动 React 节点**。

## 4. DOM 契约

装饰依赖以下结构，全部来自 §2 的实测输出：

```html
<blockquote>
  "\n"
  <p>
    "[!NOTE]"          <!-- 首段的第一个子节点是文本节点，以字面标记开头 -->
    <br>                <!-- 标记单独成行时，紧跟一个换行 -->
    "\n"
    "另外顺带修好了……"
  </p>
  "\n"
</blockquote>
```

| 依赖点 | 用法 |
| --- | --- |
| `blockquote` 的首个 `<p>` | 只处理这种形状；没有段落就不动 |
| 该段落 `firstChild` 是以 `[!TYPE]` 开头的文本节点 | 识别的唯一依据；大小写不敏感，允许前后空格与制表符 |
| 标记后紧跟 `<br>` | 该换行是空行，标记到 `data-dsh-gfm-alert-lead` 后由 CSS 隐藏 |
| 段落其余文本 | 原样保留，不再改写 |

任何一条不成立，插件就不动这个块——宁可退化成普通引用块，也不猜。

## 5. 装饰算法

1. 扫描：`apply` 时对 `document.body` 做一次全量扫描；此后由 `MutationObserver`（`childList`、`subtree`、`characterData`）增量处理新增子树与文本变化。
2. 识别：取 `blockquote` 首个 `<p>` 的 `firstChild`，用 `^[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*` 匹配。
3. 写入：
   - `data-dsh-gfm-alert="<type>"`：样式表的类型钩子；
   - `data-dsh-gfm-alert-label="<本地化标题>"`：由 `content: attr()` 画成标题；
   - 若标记后紧跟 `<br>` 且文本已空，给段落加 `data-dsh-gfm-alert-lead`。
4. 剥离：把标记从文本节点值里切掉，其余文本不动。
5. 幂等：第二次跑时匹配不到标记，只做标题同步（语言切换走 `locale/change` → 重新写 `label` 属性）。
6. 流式：宿主重新渲染可能把标记写回文本节点；`characterData` 记录会立刻再走一遍 3–4 步，不产生可见闪烁。

`MutationObserver` 也会收到插件自己剥离文本触发的回调，因此步骤 3–5 必须无副作用地重复执行。

## 6. 样式方案

- 提示框：容器规则给 `blockquote[data-dsh-gfm-alert]` 设圆角、内边距、底色与左侧 3px 色条。宿主对 `blockquote` 的默认规则是 `.<markdown-class> blockquote`（0,1,1），本插件的属性选择器优先级更高，不依赖样式表注入顺序。
- 标题：`blockquote[data-dsh-gfm-alert]::before`，`content: attr(data-dsh-gfm-alert-label)`，加粗、主题色。
- 图标：`blockquote[data-dsh-gfm-alert] > p:first-of-type::before`，绝对定位到标题行左侧，`mask-image` 使用按类型内联的 SVG data URI（`encodeURIComponent` 生成），`background-color` 取强调色，因此图标颜色跟随主题。
- 颜色：全部来自 `--dsw-alias-*`（brand / state-success / state-warn / state-error / bg-layer-1 / border-l1 / label-primary）。

| 类型 | 强调色 |
| --- | --- |
| note | `--dsw-alias-brand-primary` |
| tip | `--dsw-alias-state-success-primary` |
| important | `color-mix(in oklab, brand 45%, state-error)`，不支持混色时回退到纯 `state-error` |
| warning | `--dsw-alias-state-warn-primary` |
| caution | `--dsw-alias-state-error-primary` |

底色是强调色与 `--dsw-alias-bg-layer-1` 的 7% 混色，浅色/深色主题下都由宿主 token 决定。

## 7. 生命周期

- `apply(ctx)` 在 `ctx.effect` 内完成：注册 `gfm-alerts` 本地化词典（`en` / `zh`）、注入 `<style id="dsh-gfm-alerts-style">`、创建 observer、订阅 `locale/change`、做首次全量扫描。
- 返回的清理函数断连 observer、取消语言订阅、移除样式表、注销词典。
- `apply` 不抛异常：DOM 缺失（`document.body` 为 `null`）时直接返回空清理函数。Client 入口失败会连带整个 Web boot 失败，这条比任何功能都重要。
- 不注册任何 Slot：插件没有界面元素，只有对既有渲染结果的装饰。

## 8. 风险与边界

- **React 对账**：只写属性与文本节点值。插入或移动元素会破坏宿主对账（React 会试图移除它不认识的节点），因此不这么做。
- **渲染结构变化**：宿主改 Markdown 渲染器或 DOM 形状时，识别不成立，提示块退化为普通引用块——不报错、不影响其他功能。`scripts/check.mjs` 的 fake DOM 固化的是本方案的契约，宿主要变时先改 §4 再改测试。
- **性能**：observer 覆盖整个文档，但每条记录只做一次 `closest('blockquote')` 与一次正则；正文以外的变更（输入框、侧栏）在第一步就返回。
- **非 Web 面**：headless / ACP 没有这条渲染路径；插件只声明 `dsh.client.platform: web`。
- **主题**：不监听 `theme/change`，颜色由 CSS 变量解析，主题切换自然跟随。
- **多实例**：同一页面装两份装饰插件时，属性与样式 id 相同，第二份遇到已剥离的标记只做标题同步，不会双重套样式。

## 9. Host 半边：提示注入

目标：让模型在回复里倾向用提示块强调信息，而不是加粗、斜体或强烈语气。

### 9.1 落点选择

| 方案 | 结果 |
| --- | --- |
| Client 端改写渲染出的文本 | 会改会话记录与导出的 Markdown，违反 §1 约束一 |
| `agent/pre-step` 注入一条 user 消息 | 进会话记录、占一个消息位、每步都要判重，排版偏好不该是会话内容 |
| `ctx.systemPrompt.section()` | 只影响提示词，不写 Session 事件，随插件行卸载自动移除 |

选第三条。Host 半边因此从空实现变成「注册一个 prompt section」；渲染仍在 Client 半边，两半互不依赖（Client 由 `dsh.client` 独立加载）。

### 9.2 顺序

prompt section 按 `order` 从小到大拼接，实测宿主 `SECTION_ORDERS` 的尾部是：

| 宿主段落 | order |
| --- | --- |
| 交付文件引用 | 9000 |
| 结构化输出 | 9900 |
| 宿主源码说明 | 10000 |
| Web 表面 | 10100 |
| 部署 persona 结尾 | 10200 |

注入取 `10150`：在工具与交付说明之后、persona 结尾之前。回复风格类指令越靠后越容易被遵循，而 `order` 可由配置覆盖，宿主调整段落时不必改代码。

### 9.3 配置与边界

- 行 config：`enabled`（默认 `true`）、`text`（默认 `DEFAULT_TEXT`，trim 后空串等于不注入）、`order`（默认 `10150`）。
- 插件行声明 `inject: ['systemPrompt']`：宿主没有该服务时插件行不激活，注入静默缺席；`apply` 因此不会因为缺服务抛异常。
- 注入是偏好不是强制：模型仍可能不用提示块。插件不改写回复正文，也不把普通加粗改造成提示块。
- preset 若用 `complete` 段落整体覆盖系统提示，注入会和其他段落一起被替换；这是宿主的完整覆盖语义，不是本插件的分支。
- 注入不写 Session 事件，因此不涉及会话格式版本与回放；`text` 只出现在每次组装出的提示词里。

## 10. 验证记录

- 2026-11-02：`npm run check` 30 条全绿；两条反向验证（标记正则写错、样式表写字面色值）分别报 5 条与 1 条 `FAIL`。
- 2026-11-02：DSH Desktop 0.2.1-rc.5 上 Host 插件行激活、页面正常启动。
- 2026-11-07：`npm run check` 39 条全绿（新增 9 条 Host 注入断言，用 fake `systemPrompt` 服务加载真实 `index.js`）；反向验证把 `DEFAULT_TEXT` 里的提示块写法删掉 ⇒ 1 条 `FAIL injected text asks for GitHub callouts`。宿主 `SECTION_ORDERS` 尾部的取值读自安装包（§9.2）。
- 未完成：真实界面的提示框视觉未截图核对；注入在真实会话里的效果未核对（替换已安装包需要重启宿主）。
