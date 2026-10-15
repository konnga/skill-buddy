const DANGEROUS_ELEMENTS = 'base,embed,form,iframe,link,meta,object,script,style,textarea'
const EVENT_ATTRIBUTE = /^on/i
const SAFE_URL = /^(?:https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i

/**
 * 清理 Markdown 渲染结果，避免文档中的 HTML 修改宿主应用的 DOM 或样式。
 * Markdown 代码块在渲染后已经被转义，不会被此处理误删。
 *
 * 注意：不要试图靠给解析文档补 `lang` 来规避 issue #17 的 `<details>` 崩溃。
 * `<details>` 是在自己的构造函数里查语言的，那一刻它还没挂进文档树，拿不到任何
 * 祖先 `lang`。真正的根因是 Blink 的默认语言为空，修复见 `src/main/index.ts`。
 */
export function sanitizeMarkdownHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html

  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll(DANGEROUS_ELEMENTS).forEach((element) => element.remove())
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (EVENT_ATTRIBUTE.test(attribute.name) || attribute.name === 'style') {
        element.removeAttribute(attribute.name)
      }
    }

    for (const attributeName of ['href', 'src', 'action', 'formaction']) {
      const value = element.getAttribute(attributeName)
      if (value && !SAFE_URL.test(value.trim())) element.removeAttribute(attributeName)
    }
  })

  return document.body.innerHTML
}
