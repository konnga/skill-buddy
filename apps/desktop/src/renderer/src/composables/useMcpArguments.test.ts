import { describe, expect, it } from 'vitest'
import { useMcpArguments } from './useMcpArguments'

describe('useMcpArguments', () => {
  it('常见参数按行回填，编辑后仍按原有方式提交', () => {
    const input = useMcpArguments()
    input.setArguments(['-y', 'fetch-mcp'])

    expect(input.asJson.value).toBe(false)
    expect(input.args.value).toEqual(['-y', 'fetch-mcp'])

    input.argsText.value += '\n/tmp'
    expect(input.args.value).toEqual(['-y', 'fetch-mcp', '/tmp'])
  })

  it('保留多行脚本、空参数、空白及转义字符，编辑其他参数也不丢失内容', () => {
    const original = ['-c', 'print("hello")\nprint("world")', '', '  value  ', 'C:\\tools']
    const input = useMcpArguments()
    input.setArguments(original)

    expect(input.asJson.value).toBe(true)
    expect(input.args.value).toEqual(original)

    input.argsText.value = JSON.stringify([...original, '--verbose'])
    expect(input.args.value).toEqual([...original, '--verbose'])
  })

  it.each(['[', '{}', '["ok", 42]', '["ok", null]', ''])(
    'JSON 参数无效时不生成可提交的参数：%s',
    (text) => {
      const input = useMcpArguments()
      input.setArguments([''])
      input.argsText.value = text

      expect(input.args.value).toBeNull()

      input.argsText.value = '[]'
      expect(input.args.value).toEqual([])
    },
  )

  it('重新导入普通参数或重置表单后退出 JSON 编辑', () => {
    const input = useMcpArguments()
    input.setArguments([''])
    input.setArguments(['-y', 'fetch-mcp'])

    expect(input.asJson.value).toBe(false)
    expect(input.args.value).toEqual(['-y', 'fetch-mcp'])

    input.setArguments(['\r\n'])
    input.resetArguments()
    expect(input.asJson.value).toBe(false)
    expect(input.argsText.value).toBe('')
    expect(input.args.value).toEqual([])
  })
})
