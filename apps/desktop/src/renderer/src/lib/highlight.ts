import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const languages = {
  bash,
  c: cpp,
  cpp,
  css,
  go,
  h: cpp,
  hpp: cpp,
  html: xml,
  java,
  javascript,
  json,
  jsx: javascript,
  markdown,
  mjs: javascript,
  py: python,
  python,
  rb: ruby,
  rs: rust,
  sh: bash,
  ts: typescript,
  tsx: typescript,
  typescript,
  xml,
  yaml,
  yml: yaml,
  zsh: bash,
} as const

for (const [name, language] of Object.entries(languages)) {
  hljs.registerLanguage(name, language)
}

export default hljs
