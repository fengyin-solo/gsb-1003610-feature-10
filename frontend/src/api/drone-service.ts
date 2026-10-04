import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

import { registerModuleHooks } from './local-service'

// 无人机巡查的核查队列：飞行中发现的异常按飞行路线入队，存在同一份本地存储里。
export const REVIEW_KEY = 'dronereview'

// 核查状态：待核查 → 已核查；机器发现与人工判断冲突时置「有冲突」。
const REVIEW_STATUS = { pending: '待核查', done: '已核查', conflict: '有冲突' } as const

export type ReviewQuery = {
  /** 航线关键字：按飞行路线定位队列条目。 */
  route?: string
  /** 是否按航线排序。 */
  sortByRoute?: boolean
}

export type SortieNotes = {
  分辨率备注?: string
  坐标备注?: string
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function codeOf(prefix: string, id: number): string {
  return `${prefix}-${String(id).padStart(4, '0')}`
}

/** 旧任务缺飞行区域时按所属队伍兜底，两边都空就保持原样。 */
export function resolveFlightArea(task: EntryRow): string {
  const area = String(task['飞行区域'] ?? '').trim()
  if (area) return area
  return String(task['所属队伍'] ?? '').trim()
}

function normalizeDroneRow(row: EntryRow): EntryRow {
  const area = String(row['飞行区域'] ?? '').trim()
  if (area) return row
  const fallback = resolveFlightArea(row)
  return fallback ? { ...row, 飞行区域: fallback } : row
}

/**
 * 上传异常架次：飞行中发现的异常按飞行路线送入核查队列，并在火情报告模块
 * 生成待核实清单。按架次编号幂等——重复上传同一架次只生效一次。
 */
function uploadSortie(task: EntryRow): ActionResult {
  if (String(task.status) !== '飞行中') {
    return { ok: false, message: '只有「飞行中」的无人机巡查任务才能上传异常架次' }
  }
  const sortieNo = String(task['任务编号'] ?? '').trim()
  const count = Number(task['发现异常数']) || 0
  if (count <= 0) {
    return { ok: false, message: `架次 ${sortieNo} 未发现异常，无需送入核查队列` }
  }
  const queue = listRows(REVIEW_KEY)
  if (queue.some((item) => String(item['架次编号']) === sortieNo)) {
    return { ok: false, message: `架次 ${sortieNo} 的异常已送入核查队列，重复上传只生效一次` }
  }

  // 同步生成别的模块（火情报告）的核查清单，后续人工核实结论会回填本队列。
  const reports = listRows('firereport')
  const reportId = nextId(reports)
  const reportNo = codeOf('FIRE', reportId)
  const report: EntryRow = {
    id: reportId,
    status: '待核实',
    pending: true,
    abnormal: false,
    报告编号: reportNo,
    起火地点: resolveFlightArea(task) || '未登记区域',
    起火时间: String(task['起飞时间'] ?? ''),
    火势等级: '待评估',
    过火面积: '待核查',
    扑救情况: '未出动',
    报告人: String(task['飞手姓名'] ?? ''),
    报告状态: '待核实',
    来源架次: sortieNo,
  }
  saveRows('firereport', [...reports, report])

  const itemId = nextId(queue)
  const item: EntryRow = {
    id: itemId,
    status: REVIEW_STATUS.pending,
    pending: true,
    abnormal: false,
    队列编号: codeOf('REV', itemId),
    架次编号: sortieNo,
    飞行路线: String(task['飞行路线'] ?? ''),
    飞行区域: resolveFlightArea(task),
    所属队伍: String(task['所属队伍'] ?? ''),
    发现异常数: String(task['发现异常数'] ?? '0'),
    分辨率备注: '',
    坐标备注: '',
    关联报告编号: reportNo,
    人工结论: '',
    核查状态: REVIEW_STATUS.pending,
  }
  saveRows(REVIEW_KEY, [...queue, item])
  return {
    ok: true,
    message: `架次 ${sortieNo} 的 ${count} 项异常已按「${item['飞行路线']}」送入核查队列，火情报告 ${reportNo} 同步待核实`,
  }
}

/** 飞手补充分辨率/坐标备注：只放行这两个字段，原始发现数不允许改。 */
export function updateSortieNotes(id: number, notes: SortieNotes): ActionResult {
  const payload = notes as Record<string, unknown>
  if ('发现异常数' in payload) {
    return { ok: false, message: '原始发现数以飞行记录为准，不允许修改，只能补充分辨率或坐标备注' }
  }
  const queue = listRows(REVIEW_KEY)
  const index = queue.findIndex((item) => Number(item.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的核查队列条目` }
  }
  const updated: EntryRow = { ...queue[index] }
  if (notes.分辨率备注 !== undefined) updated['分辨率备注'] = notes.分辨率备注
  if (notes.坐标备注 !== undefined) updated['坐标备注'] = notes.坐标备注
  const next = [...queue]
  next[index] = updated
  saveRows(REVIEW_KEY, next)
  return { ok: true, message: `架次 ${updated['架次编号']} 的备注已补充` }
}

/** 核查队列：默认按航线排序，支持按航线关键字定位。 */
export function listReviewQueue(query: ReviewQuery = {}): EntryRow[] {
  const keyword = (query.route ?? '').trim()
  let items = listRows(REVIEW_KEY)
  if (keyword) {
    items = items.filter((item) => String(item['飞行路线'] ?? '').includes(keyword))
  }
  const sorted = [...items]
  if (query.sortByRoute !== false) {
    sorted.sort((a, b) => {
      const byRoute = String(a['飞行路线'] ?? '').localeCompare(String(b['飞行路线'] ?? ''), 'zh-Hans-CN')
      return byRoute !== 0 ? byRoute : String(a['架次编号'] ?? '').localeCompare(String(b['架次编号'] ?? ''))
    })
  }
  return sorted
}

/**
 * 火情报告核查结论回填：人工核实结果同步回核查队列。
 * 冲突决策：机器发现与人工判断冲突时两份都保留——原始发现数不动，
 * 人工结论并记，条目标「有冲突」等待复核，不覆盖任何一方。
 */
function backfillFromReport(report: EntryRow, action: string): void {
  const conclusion = action === '核实火情' ? '已确认' : action === '确认误报' ? '误报' : ''
  if (!conclusion) return
  const reportNo = String(report['报告编号'] ?? '')
  const queue = listRows(REVIEW_KEY)
  let touched = false
  const next = queue.map((item) => {
    if (String(item['关联报告编号'] ?? '') !== reportNo) return item
    touched = true
    const conflict = conclusion === '误报' && (Number(item['发现异常数']) || 0) > 0
    const status = conflict ? REVIEW_STATUS.conflict : REVIEW_STATUS.done
    return {
      ...item,
      status,
      pending: conflict,
      abnormal: conflict,
      人工结论: conclusion,
      核查状态: status,
    }
  })
  if (touched) {
    saveRows(REVIEW_KEY, next)
  }
}

registerModuleHooks('drone', {
  normalizeRow: normalizeDroneRow,
  customActions: { 上传异常架次: uploadSortie },
})
registerModuleHooks('firereport', { afterAction: backfillFromReport })
