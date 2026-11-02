#!/usr/bin/env node
/**
 * check.mjs — 离线契约检查，只依赖 Node 内置模块（仓库不装依赖，clone 下来直接跑）。
 *
 * 覆盖两类容易静默失败的东西：
 *   1. manifest / 补丁 / locale 的形状——写错只表现为插件页卡片缺失或插件行不激活；
 *   2. Client bundle 的 DOM 变换——`lib/client.js` 只能以 `window.__ModuleLoader__`
 *      形式加载，出错只会出现在浏览器 console 里。这里用最小 fake DOM 加载真实
 *      bundle，断言标记识别、属性写入、标记剥离、本地化标题与清理行为。
 *
 * 证明它会失败：把 lib/client.js 里 MARKER 的 `NOTE` 改成 `NOTEE`，
 * 「NOTE 提示块被识别」应报 FAIL；把 CSS 里的 `--dsw-alias-brand-primary` 换成
 * `#0969da`，「样式只用主题 token」应报 FAIL。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => readFileSync(path.join(root, relative), 'utf8')

let failures = 0
let passes = 0

/**
 * Run one assertion group; a throw or a `false` return is a failure.
 * @param {string} label - what the assertion proves, printed on both outcomes.
 * @param {() => unknown} assertion - the assertion body.
 */
function check(label, assertion) {
  try {
    const outcome = assertion()
    if (outcome === false) throw new Error('assertion returned false')
    passes += 1
    console.log(`PASS ${label}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/* ------------------------------------------------------------------ *
 * 1. manifest
 * ------------------------------------------------------------------ */

const manifest = JSON.parse(read('package.json'))

check('package name is dsh-gfm-alerts', () => manifest.name === 'dsh-gfm-alerts')
check('version is a release version', () => /^\d+\.\d+\.\d+$/.test(manifest.version))
check('Client half is exported as ./client', () => manifest.exports?.['./client'] === './lib/client.js')
check('locale dictionaries are exported', () => manifest.exports?.['./locale/*.json'] === './locale/*.json')
check('manifest declares the bundle patch', () => manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('Client half targets the web platform', () => manifest.dsh?.client?.platform === 'web')
check('manifest declares a host lower bound', () => typeof manifest.engines?.dsh === 'string' && manifest.engines.dsh.startsWith('>='))
check('manifest declares an icon file', () => {
  if (typeof manifest.icon !== 'string') return false
  return read(manifest.icon).trimEnd().endsWith('</svg>') && read(manifest.icon).includes('<svg')
})
check('no versioned @deepseek-ai/dsh-* dependency is declared', () => {
  const declared = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]
  return declared.every((name) => !name.startsWith('@deepseek-ai/dsh-'))
})
check('files covers every runtime artifact', () => {
  const files = manifest.files ?? []
  const required = ['index.js', 'lib/client.js', 'cordis.patch.yml', 'locale/*.json', 'icon.svg', 'LICENSE']
  return required.every((entry) => files.includes(entry))
})

/* ------------------------------------------------------------------ *
 * 2. bundle patch
 * ------------------------------------------------------------------ */

check('patch inserts exactly one row for this package', () => {
  const rows = [...read('cordis.patch.yml').matchAll(/^\s+-\s+id:\s*(\S+)[\s\S]*?name:\s*'([^']+)'/gm)].map((match) => ({
    id: match[1],
    name: match[2],
  }))
  if (rows.length !== 1) throw new Error(`expected 1 row, found ${rows.length}`)
  if (rows[0].id !== manifest.name) throw new Error(`row id ${rows[0].id} != package name`)
  if (rows[0].name !== manifest.name) throw new Error(`row module ${rows[0].name} != package name`)
  return true
})

/* ------------------------------------------------------------------ *
 * 3. locale metadata
 * ------------------------------------------------------------------ */

const locales = ['en', 'zh'].map((id) => ({ id, dict: JSON.parse(read(`locale/${id}.json`)) }))

check('both locales carry a non-empty title and description', () => {
  for (const { id, dict } of locales) {
    if (typeof dict.meta?.title !== 'string' || dict.meta.title.trim() === '') throw new Error(`${id}: meta.title missing`)
    if (typeof dict.meta?.description !== 'string' || dict.meta.description.trim() === '') throw new Error(`${id}: meta.description missing`)
  }
  return true
})

check('locales declare the same metadata keys', () => {
  const [first, ...rest] = locales.map(({ dict }) => Object.keys(dict.meta ?? {}).sort().join(','))
  return rest.every((keys) => keys === first)
})

/* ------------------------------------------------------------------ *
 * 4. Client half: load the real bundle against a minimal fake DOM
 * ------------------------------------------------------------------ */

class FakeText {
  constructor(value) {
    this.nodeType = 3
    this.nodeName = '#text'
    this.nodeValue = value
    this.parentNode = null
  }
  get parentElement() {
    return this.parentNode
  }
  get nextSibling() {
    const parent = this.parentNode
    if (parent === null) return null
    const index = parent.childNodes.indexOf(this)
    return index < 0 ? null : (parent.childNodes[index + 1] ?? null)
  }
}

class FakeElement {
  constructor(tagName) {
    this.nodeType = 1
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    this.attributes = new Map()
    this.childNodes = []
    this.parentNode = null
    this.id = ''
  }
  get parentElement() {
    return this.parentNode
  }
  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1)
  }
  get firstChild() {
    return this.childNodes[0] ?? null
  }
  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null
  }
  get nextSibling() {
    const parent = this.parentNode
    if (parent === null) return null
    const index = parent.childNodes.indexOf(this)
    return index < 0 ? null : (parent.childNodes[index + 1] ?? null)
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(node)
  }
  appendChild(node) {
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }
  remove() {
    const parent = this.parentNode
    if (parent !== null) parent.childNodes.splice(parent.childNodes.indexOf(this), 1)
    this.parentNode = null
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value))
    if (name === 'id') this.id = String(value)
  }
  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null
  }
  hasAttribute(name) {
    return this.attributes.has(name)
  }
  closest(tagName) {
    const wanted = tagName.toUpperCase()
    let node = this
    while (node !== null) {
      if (node.nodeType === 1 && node.tagName === wanted) return node
      node = node.parentNode
    }
    return null
  }
  querySelectorAll(selector) {
    const matches = parseSelector(selector)
    return descendants(this).filter((element) => matches(element))
  }
}

function descendants(element) {
  const found = []
  const walk = (node) => {
    for (const child of node.children) {
      found.push(child)
      walk(child)
    }
  }
  walk(element)
  return found
}

/** The two selector forms the Client half uses: `tag` and `tag[attribute]`. */
function parseSelector(selector) {
  const match = /^([a-z]+)(?:\[([a-z-]+)\])?$/i.exec(selector.trim())
  if (match === null) throw new Error(`fake DOM does not support selector: ${selector}`)
  const [, tagName, attribute] = match
  return (element) =>
    element.tagName === tagName.toUpperCase() && (attribute === undefined || element.hasAttribute(attribute))
}

class FakeDocument {
  constructor() {
    this.head = new FakeElement('head')
    this.body = new FakeElement('body')
  }
  createElement(tagName) {
    return new FakeElement(tagName)
  }
  getElementById(id) {
    return [...descendants(this.head), ...descendants(this.body)].find((element) => element.id === id) ?? null
  }
  querySelectorAll(selector) {
    const matches = parseSelector(selector)
    const attached = [...descendants(this.body)]
    return attached.filter((element) => matches(element))
  }
}

const observers = []
class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback
    this.connected = true
    observers.push(this)
  }
  observe() {}
  disconnect() {
    this.connected = false
  }
}

function makeElement(tagName, ...children) {
  const element = new FakeElement(tagName)
  for (const child of children) element.appendChild(typeof child === 'string' ? new FakeText(child) : child)
  return element
}

/** One rendered alert: blockquote ➜ paragraph ➜ marker text (+ optional break) + body text. */
function makeAlertBlockquote(next) {
  const paragraph = new FakeElement('p')
  paragraph.appendChild(new FakeText(next.marker))
  if (next.break !== false) {
    paragraph.appendChild(makeElement('br'))
    paragraph.appendChild(new FakeText('\n'))
  }
  paragraph.appendChild(new FakeText(next.body))
  const blockquote = new FakeElement('blockquote')
  blockquote.appendChild(new FakeText('\n'))
  blockquote.appendChild(paragraph)
  blockquote.appendChild(new FakeText('\n'))
  return { blockquote, paragraph }
}

const enLabels = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' }
const zhLabels = { note: '注意', tip: '提示', important: '重要', warning: '警告', caution: '危险' }

function makeContext(labels) {
  const listeners = new Map()
  const context = {
    labels,
    registrations: [],
    cleanup: undefined,
    listeners,
    locale: {
      register(namespace, dictionaries) {
        context.registrations.push({ namespace, dictionaries })
        return () => {}
      },
      bind() {
        return (key) => context.labels[key] ?? key
      },
    },
    on(event, listener) {
      listeners.set(event, listener)
      return () => listeners.delete(event)
    },
    effect(callback) {
      context.cleanup = callback()
      return context.cleanup
    },
  }
  return context
}

globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      globalThis.window.__loaded = definition
    },
  },
}
globalThis.document = new FakeDocument()
globalThis.MutationObserver = FakeMutationObserver

await import(pathToFileURL(path.join(root, 'lib/client.js')).href)
const definition = globalThis.window.__loaded

check('bundle id matches the package name', () => definition?.id === manifest.name)
check('bundle exports apply and inject', () => typeof definition?.factory === 'function')
check('Host dependency injection is declared', () => {
  const exports_ = definition.factory(() => ({}))
  return typeof exports_.apply === 'function' && Array.isArray(exports_.inject) && exports_.inject.includes('locale')
})

/* Fixture document. */
const note = makeAlertBlockquote({ marker: '[!NOTE]', body: '另外顺带修好了本会话的工具链。' })
const warning = makeAlertBlockquote({ marker: '[!WARNING] 别在生产环境里试。', break: false })
const tip = makeAlertBlockquote({ marker: '[!tip] ', body: '小技巧。' })
const unknown = makeAlertBlockquote({ marker: '[!BOGUS] ', body: '不是提示块。' })
const plain = makeAlertBlockquote({ marker: '普通引用：', body: '没有标记。' })
const nested = (() => {
  const outer = makeAlertBlockquote({ marker: '[!IMPORTANT]', body: '外层。' })
  const inner = makeAlertBlockquote({ marker: '[!CAUTION] ', body: '内层。' })
  outer.blockquote.appendChild(inner.blockquote)
  return { outer: outer.blockquote, inner: inner.blockquote }
})()

const markdown = new FakeElement('div')
for (const blockquote of [note.blockquote, warning.blockquote, tip.blockquote, unknown.blockquote, plain.blockquote, nested.outer]) {
  markdown.appendChild(new FakeText('\n'))
  markdown.appendChild(blockquote)
}
document.body.appendChild(markdown)

const context = makeContext({ ...enLabels })
const client = definition.factory(() => ({}))
client.apply(context)

check('five alert types are registered in the dictionary', () => {
  const dictionaries = context.registrations[0]?.dictionaries ?? {}
  if (context.registrations[0]?.namespace !== 'gfm-alerts') throw new Error('namespace is not gfm-alerts')
  return ['note', 'tip', 'important', 'warning', 'caution'].every(
    (type) => typeof dictionaries.en?.[type] === 'string' && typeof dictionaries.zh?.[type] === 'string',
  )
})

check('NOTE alert is recognized and labelled', () => {
  if (note.blockquote.getAttribute('data-dsh-gfm-alert') !== 'note') throw new Error('type attribute missing')
  if (note.blockquote.getAttribute('data-dsh-gfm-alert-label') !== 'Note') throw new Error('label is not the localized Note')
  return true
})

check('the literal marker is stripped from the first paragraph', () => {
  if (note.paragraph.firstChild.nodeValue !== '') throw new Error(`marker text left: ${JSON.stringify(note.paragraph.firstChild.nodeValue)}`)
  return note.paragraph.lastChild.nodeValue === '另外顺带修好了本会话的工具链。'
})

check('the leading line break of the marker line is marked for hiding', () => {
  return note.paragraph.hasAttribute('data-dsh-gfm-alert-lead')
})

check('single-line WARNING keeps its body text', () => {
  if (warning.blockquote.getAttribute('data-dsh-gfm-alert') !== 'warning') throw new Error('type attribute missing')
  return warning.paragraph.firstChild.nodeValue === '别在生产环境里试。'
})

check('the marker type is case-insensitive', () => {
  return tip.blockquote.getAttribute('data-dsh-gfm-alert') === 'tip'
})

check('an unknown marker stays a plain blockquote', () => {
  return unknown.blockquote.hasAttribute('data-dsh-gfm-alert') === false && unknown.paragraph.firstChild.nodeValue.startsWith('[!BOGUS]')
})

check('a blockquote without a marker stays untouched', () => {
  return plain.blockquote.hasAttribute('data-dsh-gfm-alert') === false
})

check('a nested alert is decorated independently', () => {
  return (
    nested.outer.getAttribute('data-dsh-gfm-alert') === 'important' &&
    nested.inner.getAttribute('data-dsh-gfm-alert') === 'caution'
  )
})

check('streaming re-render re-strips the marker', () => {
  note.paragraph.firstChild.nodeValue = '[!NOTE]  另外顺带修好了本会话的工具链。'
  const observer = observers.at(-1)
  if (observer === undefined) throw new Error('no MutationObserver was created')
  observer.callback([{ type: 'characterData', target: note.paragraph.firstChild }])
  return note.paragraph.firstChild.nodeValue === '另外顺带修好了本会话的工具链。'
})

check('a locale switch relabels every decorated alert', () => {
  context.labels = { ...zhLabels }
  context.listeners.get('locale/change')?.()
  return (
    note.blockquote.getAttribute('data-dsh-gfm-alert-label') === '注意' &&
    warning.blockquote.getAttribute('data-dsh-gfm-alert-label') === '警告' &&
    nested.inner.getAttribute('data-dsh-gfm-alert-label') === '危险'
  )
})

check('the stylesheet styles all five types', () => {
  const style = document.getElementById('dsh-gfm-alerts-style')
  if (style === null) throw new Error('stylesheet was not injected')
  const css = style.textContent
  const missing = ['note', 'tip', 'important', 'warning', 'caution'].filter(
    (type) => !css.includes(`blockquote[data-dsh-gfm-alert="${type}"]`),
  )
  if (missing.length > 0) throw new Error(`missing type rules: ${missing.join(', ')}`)
  return css.includes('mask-image') && css.includes('data:image/svg+xml')
})

check('the stylesheet only uses theme tokens for colors', () => {
  const css = document.getElementById('dsh-gfm-alerts-style').textContent
  if (/#[0-9a-f]{3,8}\b/i.test(css)) throw new Error('a literal hex color is present')
  const tokens = new Set([...css.matchAll(/--dsw-alias-[a-z0-9-]+/g)].map((match) => match[0]))
  if (tokens.size < 4) throw new Error(`only ${tokens.size} theme tokens are referenced`)
  return true
})

check('disposal removes the stylesheet and disconnects the observer', () => {
  if (typeof context.cleanup !== 'function') throw new Error('apply registered no cleanup')
  context.cleanup()
  if (document.getElementById('dsh-gfm-alerts-style') !== null) throw new Error('stylesheet survived disposal')
  return observers.at(-1).connected === false
})

/* ------------------------------------------------------------------ */

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
