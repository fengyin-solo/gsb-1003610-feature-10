import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 无人机任务只许顺航迹推进：待执行→飞行中→已完成/因故中止，越级关闭直接拒绝。
const DRONE_ACTION_FROM: Record<string, string[]> = {
  开始飞行: ['待执行'],
  确认完成: ['飞行中'],
  中止任务: ['飞行中'],
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

// 旧任务兼容：历史无人机任务没有飞行区域字段，按所属队伍对应的林区补全（仅展示，不改原始记录）。
export function compatibleArea(row: EntryRow): string {
  const raw = row['飞行区域']
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return String(raw)
  }
  const team = String(row['所属队伍'] ?? '').trim()
  if (!team) {
    return '未维护林区（按所属队伍兼容）'
  }
  const mapped = listRows('fireteam').find(
    (item) => String(item['队伍名称'] ?? '').trim() === team,
  )
  const forest = mapped ? String(mapped['所属林场'] ?? '').trim() : ''
  return forest ? `${forest}（按所属队伍兼容）` : '未维护林区（按所属队伍兼容）'
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  let rows = listRows(key)
  if (key === 'drone') {
    // 旧任务缺飞行区域时按所属队伍补全后再参与筛选，原始发现数等字段一律不动。
    rows = rows.map((row) =>
      row['飞行区域'] === undefined || String(row['飞行区域']).trim() === ''
        ? { ...row, 飞行区域: compatibleArea(row) }
        : row,
    )
  }
  const matched = filterRows(rows, filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  if (key === 'drone') {
    const allowedFrom = DRONE_ACTION_FROM[action]
    if (allowedFrom && !allowedFrom.includes(current)) {
      // 越权关闭：没在飞行中的任务不能直接确认完成或中止。
      const expect = allowedFrom.join('、')
      return { ok: false, message: `当前状态为「${current}」，只有「${expect}」的任务才能${action}` }
    }
  }
  const terminal = key === 'drone'
    ? target === '已完成' || target === '因故中止'
    : target === meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: !terminal,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listEntries(key).items) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
