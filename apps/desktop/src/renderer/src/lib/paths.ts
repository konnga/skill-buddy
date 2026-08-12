/** 返回路径最后一级名称，兼容 POSIX 与 Windows 路径分隔符。 */
export function pathBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
