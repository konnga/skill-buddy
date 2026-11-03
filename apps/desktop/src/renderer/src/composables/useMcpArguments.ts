import { computed, shallowRef } from 'vue'

/** 管理 MCP 参数输入；无法用单行无损表达的参数使用 JSON 数组编辑。 */
export function useMcpArguments() {
  const argsText = shallowRef('')
  const asJson = shallowRef(false)

  const args = computed<string[] | null>(() => {
    if (!asJson.value) {
      return argsText.value
        .split('\n')
        .map((argument) => argument.trim())
        .filter(Boolean)
    }
    try {
      const value: unknown = JSON.parse(argsText.value)
      return Array.isArray(value) && value.every((argument): argument is string => typeof argument === 'string')
        ? value
        : null
    } catch {
      return null
    }
  })

  /** 保留空参数、首尾空白和换行，避免回填后改变参数数量或内容。 */
  function setArguments(value: readonly string[]): void {
    asJson.value = value.some(
      (argument) => !argument || argument !== argument.trim() || /[\r\n]/.test(argument),
    )
    argsText.value = asJson.value ? JSON.stringify(value, null, 2) : value.join('\n')
  }

  /** 新建或切换到远程配置时恢复默认参数输入。 */
  function resetArguments(): void {
    asJson.value = false
    argsText.value = ''
  }

  return { argsText, args, asJson: computed(() => asJson.value), setArguments, resetArguments }
}
