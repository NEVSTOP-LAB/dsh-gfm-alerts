/**
 * Host 半边：向系统提示注入一条「回复优先使用 GitHub 提示块」的排版偏好。
 *
 * 渲染与样式仍在 Client 半边（`lib/client.js`）。Host 侧只做一件事：
 * 用 `ctx.systemPrompt.section()` 注册一个 prompt section。提示块是回复的排版约定，
 * 属于提示词而不是会话消息——这里不写任何 Session 事件，也不改回复正文。
 *
 * 顺序：prompt section 按 `order` 从小到大拼接，宿主占用了
 * 9000（交付文件引用）、9900（结构化输出）、10000（宿主源码说明）、
 * 10100（Web 表面）、10200（部署 persona 结尾）。这里用 10150，
 * 落在 persona 结尾之前，回复风格类指令在最后更容易被遵循。
 *
 * 配置（`cordis.patch.yml` 的行 config，全部可选）：
 *   enabled  关闭注入用 `false`
 *   text     自定义注入文本；空字符串等于不注入
 *   order    section 的排序值
 */
const PLUGIN_NAME = 'dsh-gfm-alerts'
const SECTION_NAME = 'gfm-alerts:callouts'
const DEFAULT_ORDER = 10150

export const DEFAULT_TEXT =
  '回复中更倾向于使用 GitHub Markdown Callouts（> [!NOTE]、> [!WARNING] 等）来强调信息，' +
  '而不是单纯的加粗或斜体，或使用强烈的语气词语。'

export default {
  name: PLUGIN_NAME,
  inject: ['systemPrompt'],

  /**
   * @param ctx - 该插件行所在的 Host 上下文。
   * @param config - 行 config；缺省字段回落到本文件的默认值。
   */
  apply(ctx, config) {
    const settings = normalizeSettings(config)
    if (!settings.enabled) return
    if (settings.text === '') return
    ctx.systemPrompt.section({ name: SECTION_NAME, order: settings.order, text: settings.text })
  },
}

/**
 * 行 config 归一化：任何缺失或类型不对的字段都回落到默认值。
 *
 * @param config - 行 config，可能为 `undefined`。
 * @returns `{ enabled, text, order }`；`text` 已 trim，空串表示不注入。
 */
export function normalizeSettings(config) {
  return {
    enabled: config?.enabled !== false,
    text: typeof config?.text === 'string' ? config.text.trim() : DEFAULT_TEXT,
    order: Number.isFinite(config?.order) ? config.order : DEFAULT_ORDER,
  }
}
