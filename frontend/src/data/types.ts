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
  /** 动作允许的来源状态：登记了就强制校验，越权流转会被拒绝。 */
  transitions?: Record<string, string[]>
  metrics: string[]
}

/** 模块级钩子：让特定模块在通用调用链上挂自己的兼容、动作与联动逻辑。 */
export type ModuleHooks = {
  /** 读取时兼容旧数据（如旧任务缺字段按其他字段兜底），不落库。 */
  normalizeRow?: (row: EntryRow) => EntryRow
  /** 不改变状态的业务动作（如上传架次异常），按动作名分发。 */
  customActions?: Record<string, (row: EntryRow) => ActionResult>
  /** 状态流转成功后的联动（如别的模块核查结论回填）。 */
  afterAction?: (row: EntryRow, action: string) => void
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

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
