export interface StorageDirectoryTreeNode {
  name: string
  path: string
  expanded: boolean
  loading: boolean
  error: string
  children: StorageDirectoryTreeNode[] | null
}
