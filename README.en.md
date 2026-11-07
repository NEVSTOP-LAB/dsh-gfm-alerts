# dsh-gfm-alerts

GitHub-flavored Markdown alerts for DSH, in two halves:

- replies that use GitHub's alert syntax are rendered the way GitHub renders them — a rounded box with a left color bar, an icon and a localized title, following the host's light and dark themes;
- a prompt section asks the model to prefer those alerts when emphasising information in a reply.

```markdown
> [!NOTE]
> Something worth pointing out.
```

> [!NOTE]
> The plugin styles the **rendered result** in the browser; it changes neither the Session record nor the Markdown source. Restart DSH and refresh the page after installing or upgrading.

## Features

- All five GitHub alert types: `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`; the type is case-insensitive
- Localized titles: `Note` / `注意` follow the interface language
- Theme-aware: colors come from `--dsw-alias-*` theme tokens, so switching light/dark needs no restart
- Works while a reply is streaming; when the host re-renders and writes the literal marker back, it is stripped again immediately
- Display only: the Session record, the event stream and the copied Markdown keep the original text
- Prompt injection: the Host half registers a prompt section that asks the model to prefer alerts (see [Prompt injection](#prompt-injection))

| Syntax | Rendering |
| --- | --- |
| `> [!NOTE]` | blue "Note" box |
| `> [!TIP]` | green "Tip" box |
| `> [!IMPORTANT]` | purple "Important" box |
| `> [!WARNING]` | amber "Warning" box |
| `> [!CAUTION]` | red "Caution" box |

## Prompt injection

The Host half adds one system-prompt section. Its default text is Chinese:

> 回复中更倾向于使用 GitHub Markdown Callouts（> [!NOTE]、> [!WARNING] 等）来强调信息，而不是单纯的加粗或斜体，或使用强烈的语气词语。

It changes how the model formats a reply, nothing else: no Session event is written, no message is produced.

The row's `config` in `cordis.patch.yml` tunes it; every field is optional:

| Field | Default | Effect |
| --- | --- | --- |
| `enabled` | `true` | `false` turns the injection off |
| `text` | the paragraph above | replaces the injected text; an empty string injects nothing |
| `order` | `10150` | sort order of the section in the system prompt — larger is later (built-in sections occupy 9000–10200) |

> [!NOTE]
> The injection is a preference, not enforcement: the model may still answer without alerts. The plugin never rewrites a reply body or turns bold text into an alert.

## Install

Requires the [dsh CLI](https://github.com/deepseek-ai/deepseek-harness); the host lower bound is `0.2.0-rc.1`.

From the GitHub repository:

```sh
dsh plugin --profile web add github:NEVSTOP-LAB/dsh-gfm-alerts
```

> [!NOTE]
> `--profile web` is the default profile; other profiles use their own name.

Pin a commit to keep the installed content fixed:

```sh
dsh plugin --profile web add github:NEVSTOP-LAB/dsh-gfm-alerts#<commit-sha>
```

A tarball from [Releases](https://github.com/NEVSTOP-LAB/dsh-gfm-alerts/releases) works too:

```sh
dsh plugin --profile web add ./dsh-gfm-alerts-0.2.0.tgz
```

Confirm the plugin entry in the composition layer:

```sh
dsh --profile web --dump-config
```

Restart DSH and refresh the page: alert blockquotes now render as alert boxes instead of plain quotes.

Uninstall:

```sh
dsh plugin --profile web remove dsh-gfm-alerts
```

## Known limitations

- **Blockquote form only**: `> [!NOTE]` is an alert; a bare `[!NOTE]` line stays ordinary text, which is also GitHub's rule.
- **Depends on the rendered DOM**: the host renders Markdown as `blockquote > p`, and the plugin reads the literal marker from that first paragraph. If the host changes that structure, alerts degrade to plain quotes rather than failing.
- **The Markdown source is untouched**: exported Session logs and copied text keep the original markers; only the display changes.
- **Alert boxes render on the Web UI only**: DSH Desktop's conversation view renders the same Web UI, so it is covered; headless / ACP surfaces have no such renderer. The prompt injection is a Host-side contribution and is not limited by this.
- **The prompt injection is a preference**: the model may ignore it, and it needs the host's `systemPrompt` service.

## Implementation

The plugin has two halves:

- **Host (`index.js`)**: registers one prompt section with `ctx.systemPrompt.section()`; it imports no host package and writes no Session event.
- **Client (`lib/client.js`)**: DSH `0.2.1-rc.5` ships a built-in mdast renderer with no registrable block-level extension point and no "assistant body" slot. The plugin therefore decorates the rendered result: it recognizes `[!TYPE]` at the start of a blockquote's first paragraph, sets `data-dsh-gfm-alert*` attributes, draws the title and icon with pseudo-elements from an injected stylesheet, and removes the literal marker from that paragraph. No React node is inserted or moved.

See [doc/design.md](./doc/design.md) for the DOM contract, the injection order and risk boundaries, and [CONTRIBUTING.md](./CONTRIBUTING.md) for development and release steps.

## License

MIT
