export interface MarketTreeEntry {
  path: string
  size: number
  isDir: boolean
}

export interface MarketTreeNode extends MarketTreeEntry {
  name: string
  children: MarketTreeNode[]
}

export interface MarketTreeRow {
  node: MarketTreeNode
  depth: number
}

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'icns',
  'bmp',
  'zip',
  'gz',
  'tar',
  'bz2',
  '7z',
  'pdf',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'mp3',
  'mp4',
  'mov',
  'avi',
  'wasm',
  'node',
  'dylib',
  'so',
  'dll',
])

/** 将 IPC 返回的平铺路径构造成与输入顺序无关的目录树。 */
export function buildMarketFileTree(entries: MarketTreeEntry[]): MarketTreeNode[] {
  const roots: MarketTreeNode[] = []
  const nodes = new Map<string, MarketTreeNode>()

  for (const entry of entries) {
    nodes.set(entry.path, {
      ...entry,
      name: entry.path.split('/').pop() || entry.path,
      children: [],
    })
  }

  for (const node of nodes.values()) {
    const slash = node.path.lastIndexOf('/')
    const parent = slash > 0 ? nodes.get(node.path.slice(0, slash)) : undefined
    if (parent?.isDir) parent.children.push(node)
    else roots.push(node)
  }

  const sortNodes = (items: MarketTreeNode[]): void => {
    items.sort((left, right) =>
      left.isDir === right.isDir
        ? left.name.localeCompare(right.name)
        : left.isDir
          ? -1
          : 1,
    )
    for (const item of items) sortNodes(item.children)
  }
  sortNodes(roots)
  return roots
}

export function flattenMarketFileTree(
  tree: MarketTreeNode[],
  expanded: ReadonlySet<string>,
): MarketTreeRow[] {
  const rows: MarketTreeRow[] = []
  const walk = (nodes: MarketTreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth })
      if (node.isDir && expanded.has(node.path)) walk(node.children, depth + 1)
    }
  }
  walk(tree, 0)
  return rows
}

export function isMarketBinaryFile(path: string): boolean {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension ? BINARY_EXTENSIONS.has(extension) : false
}

export function formatMarketFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
