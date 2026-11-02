> [!IMPORTANT]
> 推荐在 AGENTS.md 或 copilot-instructions.md (或其他AI参考规范文档) 中添加以下提示。
> 
> - **Markdown 中倾向于使用 GitHub Markdown Callouts（`> [!NOTE]`、`> [!WARNING]` 等）来强调信息，而不是单纯的加粗或斜体，或使用强烈的语气词语。**
> 
> DSH 的回复中，将会倾向于使用 GitHub Markdown Callouts，配合本插件，显示效果更加清楚。

---------------

**DSH 的 GitHub 提示块插件：把回复里的 GitHub Markdown 提示块渲染成 GitHub 的提示框——圆角底、左侧色条、图标加本地化标题，浅色/深色主题跟随宿主。**

<img width="1163" height="637" alt="{F4FE8B35-5624-4DDD-BDB9-9220F4426186}" src="https://github.com/user-attachments/assets/ce100123-3801-42f3-ab58-dac464cf9ced" />

```markdown
> [!NOTE]
> 说明性信息
```

> [!NOTE]
> 插件在浏览器里给**渲染结果**套样式，不改会话记录、不改 Markdown 源文本。安装或升级后需要**重启 DSH 并刷新页面**。

## 功能

- 支持 GitHub 的五种提示块：`[!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`，类型大小写不敏感
- 标题本地化：跟随界面语言显示 `Note` / `注意`，中英词典随插件注册
- 主题自适应：颜色只用 `--dsw-alias-*` 主题 token，切换浅色/深色不需要重启
- 流式输出中同样生效；宿主重新渲染把字面标记写回来时，立刻再处理一次
- 只改显示：会话记录、事件流、复制出来的 Markdown 原文都不变

| 写法 | 显示 |
| --- | --- |
| `> [!NOTE]` | 蓝色「注意」框 |
| `> [!TIP]` | 绿色「提示」框 |
| `> [!IMPORTANT]` | 紫色「重要」框 |
| `> [!WARNING]` | 琥珀色「警告」框 |
| `> [!CAUTION]` | 红色「危险」框 |

## 安装

需要 [dsh CLI](https://github.com/deepseek-ai/deepseek-harness)，宿主版本下界 `0.2.0-rc.1`。

从 GitHub 仓库安装：

```sh
dsh plugin --profile web add github:NEVSTOP-LAB/dsh-gfm-alerts
```

> [!NOTE]
> `--profile web` 是默认 profile。DSH Desktop 用 `--profile desktop`；其他 profile 换成对应名字。

建议锁定提交，避免后续更新改变实际内容：

```sh
dsh plugin --profile web add github:NEVSTOP-LAB/dsh-gfm-alerts#<commit-sha>
```

也可以从 [Releases](https://github.com/NEVSTOP-LAB/dsh-gfm-alerts/releases) 下载 tarball 安装：

```sh
dsh plugin --profile web add ./dsh-gfm-alerts-0.1.0.tgz
```

安装后确认组合层里出现该插件：

```sh
dsh --profile web --dump-config
```

**重启 DSH 并刷新页面**后生效：带提示块的回复会显示为圆角提示框，而不是带竖线的引用块。

卸载：

```sh
dsh plugin --profile web remove dsh-gfm-alerts
```

## 已知限制

- **只认 blockquote 形式**：`> [!NOTE]` 才是提示块；单独一行 `[!NOTE]` 按普通文本渲染（GitHub 的规则相同）。
- **装饰依赖渲染后的 DOM 结构**：宿主把 Markdown 渲染成 `blockquote > p`，插件据此识别首段的字面标记。宿主改渲染结构时最坏的结果是提示块退化成普通引用块，不会报错。
- **不改 Markdown 源**：导出的会话记录、复制的全文仍是原文；样式只存在于界面。
- **只在 Web 界面渲染路径生效**：DSH Desktop 的对话界面同样由 Web 渲染，因此一并生效；纯终端（headless / ACP）没有这条渲染路径。

## 实现

DSH `0.2.1-rc.5` 的 Markdown 渲染器是宿主内置的 mdast 渲染器，没有可注册的块级渲染扩展点，也没有「助手正文」槽位。插件因此对渲染结果做增量装饰：识别 `blockquote` 首段开头的 `[!TYPE]`，挂 `data-dsh-gfm-alert*` 属性，由注入的样式表用伪元素画标题与图标，并去掉首段的字面标记；不插入、不移动 React 节点。

细节、DOM 契约与风险边界见 [doc/design.md](./doc/design.md)；开发与发版流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

MIT
