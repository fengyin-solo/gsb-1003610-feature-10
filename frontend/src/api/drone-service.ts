import { listDroneQueue, listRows, saveDroneQueue, saveRows } from '@/data/local-store'
import { compatibleArea } from './local-service'
import type { ActionResult, DroneQueueItem, EntryRow } from '@/data/types'

const DRONE_KEY = 'drone'
const FIRE_REPORT_KEY = 'firereport'

function nowText(): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function todayText(): string {
  return nowText().slice(0, 10)
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// 队列定位：默认按航线、再按航迹序号排序，飞手照着飞行路线一路核过去。
export function fetchDroneQueue(filters: Record<string, string> = {}, sortByRoute = true): DroneQueueItem[] {
  const pairs = Object.entries(filters)
    .map(([key, value]) => [key, value.trim()] as const)
    .filter(([, value]) => value !== '')
  let items = listDroneQueue().filter((item) =>
    pairs.every(([key, value]) => String(item[key as keyof DroneQueueItem] ?? '').includes(value)),
  )
  if (sortByRoute) {
    items = [...items].sort((a, b) => {
      const route = a.飞行路线.localeCompare(b.飞行路线, 'zh-Hans-CN')
      return route !== 0 ? route : a.航迹序号 - b.航迹序号
    })
  }
  return items
}

export type DroneStats = {
  today: number
  completed: number
  abnormalTotal: number
  pendingQueue: number
}

export function droneStats(): DroneStats {
  const rows = listRows(DRONE_KEY)
  const today = todayText()
  return {
    today: rows.filter((row) => String(row['起飞时间'] ?? '').startsWith(today)).length,
    completed: rows.filter((row) => String(row.status) === '已完成').length,
    abnormalTotal: rows.reduce((sum, row) => sum + toNumber(row['发现异常数']), 0),
    pendingQueue: listDroneQueue().filter((item) => item.队列状态 === '待核查').length,
  }
}

export type SortiePayload = {
  任务编号: string
  架次: string
  航迹序号: number
  飞行路线?: string
  分辨率备注?: string
  坐标备注?: string
  原始发现数: number
}

// 重复上传同一架次只生效一次：以 任务编号#架次 去重，原始发现数由首次上传落账。
export function uploadSortie(payload: SortiePayload): ActionResult {
  const taskNo = String(payload.任务编号 ?? '').trim()
  const sortie = String(payload.架次 ?? '').trim()
  if (!taskNo || !sortie) {
    return { ok: false, message: '请选择飞行任务并填写架次' }
  }
  const tasks = listRows(DRONE_KEY)
  const index = tasks.findIndex((row) => String(row['任务编号'] ?? '').trim() === taskNo)
  if (index < 0) {
    return { ok: false, message: `没有找到任务编号为 ${taskNo} 的无人机巡查任务` }
  }
  if (String(tasks[index].status) !== '飞行中') {
    return { ok: false, message: '只有「飞行中」的任务才能上传航迹发现' }
  }
  const route = String(payload.飞行路线 ?? '').trim() || String(tasks[index]['飞行路线'] ?? '')
  const items = listDroneQueue()
  const duplicate = items.some(
    (item) =>
      item.source === 'drone'
      && String(item.任务编号) === taskNo
      && String(item.架次) === sortie,
  )
  if (duplicate) {
    return { ok: false, message: `架次 ${taskNo}#${sortie} 已上传过，重复上传只生效一次` }
  }
  const nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1
  const item: DroneQueueItem = {
    id: nextId,
    source: 'drone',
    任务编号: taskNo,
    架次: sortie,
    飞行区域: compatibleArea(tasks[index]),
    飞行路线: route,
    航迹序号: Number(payload.航迹序号) || nextId,
    原始发现数: toNumber(payload.原始发现数),
    分辨率备注: String(payload.分辨率备注 ?? '').trim(),
    坐标备注: String(payload.坐标备注 ?? '').trim(),
    队列状态: '待核查',
    人工判断: '',
    来源模块: DRONE_KEY,
    来源编号: Number(tasks[index].id),
    是否已回填: false,
    创建时间: nowText(),
  }
  saveDroneQueue([...items, item])
  // 原始发现数只在这里按首次上传落账，之后任何编辑都不动它。
  const nextTasks = [...tasks]
  nextTasks[index] = { ...tasks[index], 发现异常数: toNumber(tasks[index]['发现异常数']) + item.原始发现数 }
  saveRows(DRONE_KEY, nextTasks)
  return { ok: true, message: `已按航迹${item.航迹序号}送入核查队列，本架次原始发现数 ${item.原始发现数}` }
}

// 飞手只能补充分辨率/坐标备注，原始发现数不在可改字段里。
export function savePilotNotes(
  id: number,
  notes: { 分辨率备注?: string; 坐标备注?: string },
): ActionResult {
  const items = listDroneQueue()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的队列项` }
  }
  if (items[index].source !== 'drone') {
    return { ok: false, message: '外模块核查清单不允许补飞手备注' }
  }
  if (items[index].队列状态 !== '待核查') {
    return { ok: false, message: '该异常已出复核结论，备注不再修改' }
  }
  const next = [...items]
  next[index] = {
    ...items[index],
    分辨率备注: String(notes.分辨率备注 ?? '').trim(),
    坐标备注: String(notes.坐标备注 ?? '').trim(),
  }
  saveDroneQueue(next)
  return { ok: true, message: '飞手备注已补充（原始发现数未改动）' }
}

function nextFireReportId(): number {
  return listRows(FIRE_REPORT_KEY).reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

// 冲突取舍由复核拍板：保留机器原始发现数作台账，人工判断作为最终结论并据此回填。
export function verifyQueueItem(id: number, verdict: 'confirmed' | 'false'): ActionResult {
  const items = listDroneQueue()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的队列项` }
  }
  if (items[index].队列状态 !== '待核查') {
    return { ok: false, message: '该异常已有复核结论，不能重复提交' }
  }
  const next = [...items]
  const target: DroneQueueItem['队列状态'] = verdict === 'confirmed' ? '已确认' : '误报排除'
  next[index] = {
    ...items[index],
    队列状态: target,
    人工判断: verdict === 'confirmed' ? '人工确认异常' : '人工判为误报，覆盖飞行原始发现',
  }

  // 回填到外模块核查清单：同步进来的条目更新原记录，飞行发现确认后在火情报告落一条。
  if (next[index].source === 'external') {
    const moduleKey = next[index].来源模块
    const sourceRows = listRows(moduleKey)
    const sourceIndex = sourceRows.findIndex((row) => Number(row.id) === next[index].来源编号)
    if (sourceIndex >= 0 && moduleKey === FIRE_REPORT_KEY) {
      const status = verdict === 'confirmed' ? '已确认' : '误报'
      const updated: EntryRow = {
        ...sourceRows[sourceIndex],
        status,
        pending: false,
      }
      const nextRows = [...sourceRows]
      nextRows[sourceIndex] = updated
      saveRows(moduleKey, nextRows)
    }
  } else if (verdict === 'confirmed') {
    const reports = listRows(FIRE_REPORT_KEY)
    const exists = reports.some(
      (row) =>
        String(row['报告编号'] ?? '')
        === `DRON-${next[index].任务编号}-${next[index].架次}-${next[index].id}`,
    )
    if (!exists) {
      const report: EntryRow = {
        id: nextFireReportId(),
        status: '已确认',
        pending: false,
        abnormal: false,
        报告编号: `DRON-${next[index].任务编号}-${next[index].架次}-${next[index].id}`,
        起火地点: `${next[index].飞行区域} ${next[index].飞行路线} 航迹${next[index].航迹序号}`,
        起火时间: next[index].创建时间,
        火势等级: '待核定',
        过火面积: '待核定',
        扑救情况: '无人机巡查发现，已人工确认',
        报告人: `飞手发现（${next[index].任务编号}#${next[index].架次}）`,
        报告状态: '已确认',
      }
      saveRows(FIRE_REPORT_KEY, [...reports, report])
    }
  }
  next[index] = { ...next[index], 是否已回填: true }
  saveDroneQueue(next)
  return { ok: true, message: verdict === 'confirmed' ? '已确认异常并回填核查清单' : '已按误报排除并回填核查清单' }
}

// 别的模块的核查清单同步回填：目前对接火情报告的待核实记录，重复同步只生效一次。
export function syncChecklists(): ActionResult {
  const items = listDroneQueue()
  let added = 0
  const next = [...items]
  const reports = listRows(FIRE_REPORT_KEY)
  for (const report of reports) {
    if (String(report.status) !== '待核实') {
      continue
    }
    const duplicated = next.some(
      (item) => item.source === 'external'
        && item.来源模块 === FIRE_REPORT_KEY
        && item.来源编号 === Number(report.id),
    )
    if (duplicated) {
      continue
    }
    next.push({
      id: next.reduce((max, item) => Math.max(max, item.id), 0) + 1,
      source: 'external',
      任务编号: `EXT-${String(report.id).padStart(4, '0')}`,
      架次: '',
      飞行区域: '',
      飞行路线: `核查清单·${String(report['起火地点'] ?? '')}`,
      航迹序号: 0,
      原始发现数: 1,
      分辨率备注: '',
      坐标备注: '',
      队列状态: '待核查',
      人工判断: '',
      来源模块: FIRE_REPORT_KEY,
      来源编号: Number(report.id),
      是否已回填: false,
      创建时间: nowText(),
    })
    added += 1
  }
  if (added === 0) {
    return { ok: false, message: '核查清单没有新的待核实记录，无需重复同步' }
  }
  saveDroneQueue(next)
  return { ok: true, message: `核查清单已同步 ${added} 条待核实记录入队` }
}
