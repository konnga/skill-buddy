export type SkillResourceEntry = readonly [relativePath: string, source: string]

export interface SkillResourceTreeNode {
  path: string
  name: string
  kind: 'directory' | 'file'
  source: string | null
  children: SkillResourceTreeNode[]
}

export interface SkillResourceTreeRow {
  node: SkillResourceTreeNode
  depth: number
}

function normalizeRelativePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.')
    .join('/')
}

function sortNodes(nodes: SkillResourceTreeNode[]): void {
  nodes.sort((left, right) =>
    left.kind === right.kind
      ? left.name.localeCompare(right.name)
      : left.kind === 'directory'
        ? -1
        : 1,
  )
  for (const node of nodes) sortNodes(node.children)
}

/** 将附属文件的平铺相对路径组装成包含隐式目录的文件树。 */
export function buildSkillResourceTree(
  resources: readonly SkillResourceEntry[],
): SkillResourceTreeNode[] {
  const roots: SkillResourceTreeNode[] = []
  const directories = new Map<string, SkillResourceTreeNode>()
  const files = new Set<string>()

  for (const [relativePath, source] of resources) {
    const normalizedPath = normalizeRelativePath(relativePath)
    const segments = normalizedPath.split('/')
    const fileName = segments[segments.length - 1]
    if (!normalizedPath || !fileName || files.has(normalizedPath)) continue

    let children = roots
    for (let index = 0; index < segments.length - 1; index += 1) {
      const name = segments[index]
      if (!name) continue
      const path = segments.slice(0, index + 1).join('/')
      let directory = directories.get(path)
      if (!directory) {
        directory = { path, name, kind: 'directory', source: null, children: [] }
        directories.set(path, directory)
        children.push(directory)
      }
      children = directory.children
    }

    children.push({
      path: normalizedPath,
      name: fileName,
      kind: 'file',
      source,
      children: [],
    })
    files.add(normalizedPath)
  }

  sortNodes(roots)
  return roots
}

/** 仅将已展开目录的子节点投影为可渲染行。 */
export function flattenSkillResourceTree(
  tree: readonly SkillResourceTreeNode[],
  expanded: ReadonlySet<string>,
): SkillResourceTreeRow[] {
  const rows: SkillResourceTreeRow[] = []
  const walk = (nodes: readonly SkillResourceTreeNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth })
      if (node.kind === 'directory' && expanded.has(node.path)) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(tree, 0)
  return rows
}
