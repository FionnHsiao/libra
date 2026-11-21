import type { TreeEntry } from '../../shared/protocol'

export type SortKey = 'name' | 'time'
export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: SortKey
  dir: SortDirection
}

export const DEFAULT_SORT: SortState = { key: 'name', dir: 'asc' }

/**
 * 目录永远排在文件前面，组内再按名称或修改时间排序。
 * 名称用 zh-CN + 数字感知，第 2 章会排在 第 10 章 前面。
 */
export function sortEntries(list: readonly TreeEntry[], sort: SortState): TreeEntry[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...list].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'dir' ? -1 : 1

    if (sort.key === 'time') {
      const a = left.mtimeMs ?? 0
      const b = right.mtimeMs ?? 0
      if (a !== b) return (a - b) * sign
    }

    const byName = left.name.localeCompare(right.name, 'zh-CN', { numeric: true })
    return byName * sign
  })
}
