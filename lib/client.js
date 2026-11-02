/**
 * Client 半边：把 Harness 的 Markdown 渲染结果里的 GitHub 提示块
 * （`> [!NOTE]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!WARNING]` / `> [!CAUTION]`）
 * 改写成 GitHub 风格的提示框。
 *
 * 渲染器是宿主内置的 mdast 渲染器，没有块级渲染扩展点，也没有助手正文槽位；
 * 这里对渲染结果做增量装饰：给 blockquote 挂 data 属性、用样式表的伪元素画标题与图标、
 * 去掉首段的字面标记。不插入、不移动 React 节点。DOM 契约见 doc/design.md §2。
 */
window.__ModuleLoader__.load({
  id: 'dsh-gfm-alerts',
  factory() {
    const NAMESPACE = 'gfm-alerts'
    const STYLE_ID = 'dsh-gfm-alerts-style'
    const ALERT_ATTRIBUTE = 'data-dsh-gfm-alert'
    const LABEL_ATTRIBUTE = 'data-dsh-gfm-alert-label'
    const LEAD_ATTRIBUTE = 'data-dsh-gfm-alert-lead'
    const MARKER = /^[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*/i

    const DICTIONARIES = {
      en: { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' },
      zh: { note: '注意', tip: '提示', important: '重要', warning: '警告', caution: '危险' },
    }

    const icon = (body) =>
      `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>${body}</svg>`,
      )}")`

    const ICONS = {
      note: icon(
        "<circle cx='8' cy='8' r='6.9' fill='none' stroke='black' stroke-width='1.6'/>" +
          "<circle cx='8' cy='5' r='1.1' fill='black'/>" +
          "<rect x='7.15' y='7.1' width='1.7' height='4.9' rx='0.85' fill='black'/>",
      ),
      tip: icon(
        "<path d='M8 1.4a4.5 4.5 0 0 0-4.5 4.5c0 1.7 1 2.6 1.8 3.4.4.4.6.8.7 1.3l.1.5h3.8l.1-.5c.1-.5.3-.9.7-1.3.8-.8 1.8-1.7 1.8-3.4A4.5 4.5 0 0 0 8 1.4Z' fill='black'/>" +
          "<rect x='5.9' y='12.1' width='4.2' height='1.5' rx='0.75' fill='black'/>",
      ),
      important: icon(
        "<path d='M8 1.2 14.8 8 8 14.8 1.2 8Z' fill='none' stroke='black' stroke-width='1.6' stroke-linejoin='round'/>" +
          "<rect x='7.2' y='4.7' width='1.6' height='4.3' rx='0.8' fill='black'/>" +
          "<circle cx='8' cy='10.9' r='1' fill='black'/>",
      ),
      warning: icon(
        "<path d='M8 1.7 15 13.5H1Z' fill='none' stroke='black' stroke-width='1.6' stroke-linejoin='round'/>" +
          "<rect x='7.2' y='5.6' width='1.6' height='4.2' rx='0.8' fill='black'/>" +
          "<circle cx='8' cy='11.4' r='1' fill='black'/>",
      ),
      caution: icon(
        "<circle cx='8' cy='8' r='6.9' fill='none' stroke='black' stroke-width='1.6'/>" +
          "<path d='M5.7 5.7 10.3 10.3M10.3 5.7 5.7 10.3' stroke='black' stroke-width='1.7' stroke-linecap='round'/>",
      ),
    }

    const stylesheet = () => `
blockquote[${ALERT_ATTRIBUTE}] {
  --dsh-gfm-alert-accent: var(--dsw-alias-brand-primary);
  --dsh-gfm-alert-icon: ${ICONS.note};
  position: relative;
  margin: 16px 0;
  padding: 10px 16px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-left: 3px solid var(--dsh-gfm-alert-accent);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  background: color-mix(in oklab, var(--dsh-gfm-alert-accent) 7%, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
}
blockquote[${ALERT_ATTRIBUTE}="note"] {
  --dsh-gfm-alert-accent: var(--dsw-alias-brand-primary);
  --dsh-gfm-alert-icon: ${ICONS.note};
}
blockquote[${ALERT_ATTRIBUTE}="tip"] {
  --dsh-gfm-alert-accent: var(--dsw-alias-state-success-primary);
  --dsh-gfm-alert-icon: ${ICONS.tip};
}
blockquote[${ALERT_ATTRIBUTE}="important"] {
  --dsh-gfm-alert-accent: var(--dsw-alias-state-error-primary);
  --dsh-gfm-alert-accent: color-mix(in oklab, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-state-error-primary));
  --dsh-gfm-alert-icon: ${ICONS.important};
}
blockquote[${ALERT_ATTRIBUTE}="warning"] {
  --dsh-gfm-alert-accent: var(--dsw-alias-state-warn-primary);
  --dsh-gfm-alert-icon: ${ICONS.warning};
}
blockquote[${ALERT_ATTRIBUTE}="caution"] {
  --dsh-gfm-alert-accent: var(--dsw-alias-state-error-primary);
  --dsh-gfm-alert-icon: ${ICONS.caution};
}
blockquote[${ALERT_ATTRIBUTE}]::before {
  content: attr(${LABEL_ATTRIBUTE});
  display: block;
  margin: 0 0 6px;
  padding-left: 24px;
  font-weight: 600;
  line-height: 20px;
  color: var(--dsh-gfm-alert-accent);
}
blockquote[${ALERT_ATTRIBUTE}] > p:first-of-type {
  margin: 0;
}
blockquote[${ALERT_ATTRIBUTE}] > p:first-of-type::before {
  content: "";
  position: absolute;
  left: 16px;
  top: 12px;
  width: 16px;
  height: 16px;
  background-color: var(--dsh-gfm-alert-accent);
  -webkit-mask-image: var(--dsh-gfm-alert-icon);
  mask-image: var(--dsh-gfm-alert-icon);
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: 16px 16px;
  mask-size: 16px 16px;
}
blockquote[${ALERT_ATTRIBUTE}] > p[${LEAD_ATTRIBUTE}] > br:first-of-type {
  display: none;
}
`

    const firstParagraph = (blockquote) => {
      for (const child of blockquote.children) if (child.tagName === 'P') return child
      return null
    }

    const decorate = (blockquote, label) => {
      if (blockquote === null || blockquote.tagName !== 'BLOCKQUOTE') return
      const paragraph = firstParagraph(blockquote)
      if (paragraph === null) return
      const text = paragraph.firstChild
      const marker = text !== null && text.nodeType === 3 ? MARKER.exec(text.nodeValue) : null
      if (marker === null) {
        if (blockquote.hasAttribute(ALERT_ATTRIBUTE)) syncLabel(blockquote, label)
        return
      }
      const type = marker[1].toLowerCase()
      blockquote.setAttribute(ALERT_ATTRIBUTE, type)
      blockquote.setAttribute(LABEL_ATTRIBUTE, label(type))
      text.nodeValue = text.nodeValue.slice(marker[0].length)
      if (text.nodeValue.length === 0 && text.nextSibling !== null && text.nextSibling.nodeName === 'BR') {
        paragraph.setAttribute(LEAD_ATTRIBUTE, '')
      }
    }

    const syncLabel = (blockquote, label) => {
      const type = blockquote.getAttribute(ALERT_ATTRIBUTE)
      const wanted = label(type)
      if (blockquote.getAttribute(LABEL_ATTRIBUTE) !== wanted) blockquote.setAttribute(LABEL_ATTRIBUTE, wanted)
    }

    const decorateTree = (root, label) => {
      if (root === null || root === undefined) return
      if (root.nodeType === 3) {
        const enclosing = root.parentElement === null ? null : root.parentElement.closest('blockquote')
        if (enclosing !== null) decorate(enclosing, label)
        return
      }
      if (root.nodeType !== 1) return
      const enclosing = root.closest('blockquote')
      if (enclosing !== null) decorate(enclosing, label)
      for (const nested of root.querySelectorAll('blockquote')) decorate(nested, label)
    }

    return {
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(() => {
          if (document.body === null) return () => {}

          const dictionaries = ctx.locale.register(NAMESPACE, DICTIONARIES)
          const translate = ctx.locale.bind(NAMESPACE)
          const label = (type) => {
            const text = translate(type)
            return typeof text === 'string' && text !== '' ? text : type
          }

          const stale = document.getElementById(STYLE_ID)
          if (stale !== null) stale.remove()
          const style = document.createElement('style')
          style.id = STYLE_ID
          style.textContent = stylesheet()
          document.head.append(style)

          const observer = new MutationObserver((records) => {
            for (const record of records) {
              if (record.type === 'characterData') {
                decorateTree(record.target, label)
                continue
              }
              for (const node of record.addedNodes) decorateTree(node, label)
            }
          })
          observer.observe(document.body, { childList: true, subtree: true, characterData: true })

          const refreshLabels = () => {
            for (const blockquote of document.querySelectorAll(`blockquote[${ALERT_ATTRIBUTE}]`)) {
              syncLabel(blockquote, label)
            }
          }
          const offLocale = ctx.on('locale/change', refreshLabels)

          decorateTree(document.body, label)

          return () => {
            observer.disconnect()
            offLocale()
            style.remove()
            dictionaries()
          }
        }, 'gfm-alerts: 提示块渲染')
      },
    }
  },
})
