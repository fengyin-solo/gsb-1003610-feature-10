/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

// 异常核查队列项：飞行发现按航迹入队，飞手可补充分辨率/坐标备注，人工复核后回填。
export type DroneQueueItem = {
  id: number
  source: 'drone' | 'external'
  任务编号: string
  架次: string
  飞行区域: string
  飞行路线: string
  航迹序号: number
  原始发现数: number
  分辨率备注: string
  坐标备注: string
  队列状态: '待核查' | '已确认' | '误报排除'
  人工判断: string
  来源模块: string
  来源编号: number
  是否已回填: boolean
  创建时间: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
