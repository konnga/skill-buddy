import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'

/**
 * Shared markdown renderer: GFM-ish defaults + highlight.js code blocks.
 * Render into an element with `prose` (tailwind typography) classes.
 */
export const markdown = new MarkdownIt({
  linkify: true,
  highlight: (code, lang): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const { value } = hljs.highlight(code, { language: lang, ignoreIllegals: true })
        return `<pre class="hljs"><code>${value}</code></pre>`
      } catch {
        // fall through to default escaping
      }
    }
    return ''
  },
})

/** prose classes tuned for skill readmes; pair with v-html="markdown.render(...)" */
export const proseClass =
  'prose prose-sm dark:prose-invert max-w-none ' +
  'prose-headings:scroll-mt-20 prose-pre:rounded-lg ' +
  'prose-code:before:content-none prose-code:after:content-none ' +
  'prose-img:rounded-lg'
