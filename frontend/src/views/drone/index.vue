<template>
  <section class="page" data-module="drone">
    <header class="page-head">
      <div>
        <h2>无人机巡查管理</h2>
        <p class="page-desc">维护无人机巡查任务，围绕任务编号、飞行区域、所属队伍、飞行路线、飞手姓名、飞行架次做登记、筛选与状态流转；飞行发现按航迹进入异常核查队列。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openUpload">上传航迹发现</button>
        <button class="btn" type="button" @click="exportRows">导出无人机巡查清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form v-if="showUpload" class="upload-panel" @submit.prevent="submitUpload">
      <h3 class="panel-title">按航迹上传异常（同一架次重复上传只生效一次）</h3>
      <div class="filter-bar">
        <label class="filter-item">
          <span>飞行任务</span>
          <select v-model="uploadForm.任务编号">
            <option value="">请选择飞行中的任务</option>
            <option v-for="task in flyingTasks" :key="String(task.id)" :value="String(task['任务编号'])">
              {{ task['任务编号'] }} · {{ task['飞行路线'] }}
            </option>
          </select>
        </label>
        <label class="filter-item">
          <span>架次</span>
          <input v-model="uploadForm.架次" placeholder="如 1" />
        </label>
        <label class="filter-item">
          <span>航迹序号</span>
          <input v-model.number="uploadForm.航迹序号" type="number" min="1" placeholder="沿飞行路线的顺序号" />
        </label>
        <label class="filter-item">
          <span>原始发现数（机器）</span>
          <input v-model.number="uploadForm.原始发现数" type="number" min="0" placeholder="由飞行发现自动带入" />
        </label>
        <label class="filter-item">
          <span>分辨率备注</span>
          <input v-model="uploadForm.分辨率备注" placeholder="飞手可补充，可不填" />
        </label>
        <label class="filter-item">
          <span>坐标备注</span>
          <input v-model="uploadForm.坐标备注" placeholder="如 N30.2° E118.7°" />
        </label>
      </div>
      <div class="panel-actions">
        <button class="btn primary" type="submit">送入核查队列</button>
        <button class="btn ghost" type="button" @click="showUpload = false">取消</button>
      </div>
    </form>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无无人机巡查数据</td>
        </tr>
      </tbody>
    </table>

    <section class="queue-block">
      <header class="page-head">
        <div>
          <h3 class="panel-title">异常核查队列</h3>
          <p class="page-desc">飞行发现按航迹入队，飞手只能补充分辨率/坐标备注；与人工判断冲突时以人工复核结论回填。</p>
        </div>
        <div class="page-actions">
          <button class="btn" type="button" @click="runSync">同步核查清单</button>
        </div>
      </header>

      <form class="filter-bar" @submit.prevent>
        <label class="filter-item">
          <span>飞行路线</span>
          <input v-model="queueFilters.飞行路线" placeholder="按航线定位" />
        </label>
        <label class="filter-item">
          <span>任务编号</span>
          <input v-model="queueFilters.任务编号" placeholder="按任务编号检索" />
        </label>
        <label class="filter-item">
          <span>队列状态</span>
          <select v-model="queueFilters.队列状态">
            <option value="">全部</option>
            <option value="待核查">待核查</option>
            <option value="已确认">已确认</option>
            <option value="误报排除">误报排除</option>
          </select>
        </label>
        <button class="btn" type="button" @click="sortByRoute = !sortByRoute">
          {{ sortByRoute ? '按航线排序：开' : '按航线排序：关' }}
        </button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>来源</th>
            <th>任务编号</th>
            <th>架次</th>
            <th>飞行区域</th>
            <th>飞行路线</th>
            <th>航迹序号</th>
            <th>原始发现数</th>
            <th>分辨率备注</th>
            <th>坐标备注</th>
            <th>队列状态</th>
            <th>人工判断</th>
            <th>回填</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in queueRows" :key="item.id">
            <td>{{ item.source === 'drone' ? '飞行发现' : '核查清单' }}</td>
            <td>{{ item.任务编号 }}</td>
            <td>{{ item.架次 || '—' }}</td>
            <td>{{ item.飞行区域 || '—' }}</td>
            <td>{{ item.飞行路线 }}</td>
            <td>{{ item.航迹序号 || '—' }}</td>
            <td>{{ item.原始发现数 }}</td>
            <td>
              <input
                v-if="item.source === 'drone' && item.队列状态 === '待核查'"
                :value="item.分辨率备注"
                class="note-input"
                placeholder="补分辨率"
                @change="saveNotes(item, '分辨率备注', ($event.target as HTMLInputElement).value)"
              />
              <span v-else>{{ item.分辨率备注 || '—' }}</span>
            </td>
            <td>
              <input
                v-if="item.source === 'drone' && item.队列状态 === '待核查'"
                :value="item.坐标备注"
                class="note-input"
                placeholder="补坐标"
                @change="saveNotes(item, '坐标备注', ($event.target as HTMLInputElement).value)"
              />
              <span v-else>{{ item.坐标备注 || '—' }}</span>
            </td>
            <td>{{ item.队列状态 }}</td>
            <td>{{ item.人工判断 || '—' }}</td>
            <td>{{ item.是否已回填 ? '已回填' : '待回填' }}</td>
            <td class="row-actions">
              <template v-if="item.队列状态 === '待核查'">
                <button class="link" type="button" @click="verify(item, 'confirmed')">人工确认</button>
                <button class="link" type="button" @click="verify(item, 'false')">误报排除</button>
              </template>
              <span v-else class="muted-text">已结案</span>
            </td>
          </tr>
          <tr v-if="!queueRows.length">
            <td :colspan="13" class="empty-state">核查队列暂无记录，可上传航迹发现或同步核查清单</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条无人机巡查记录 · 队列 {{ queueRows.length }} 条</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      <span v-else-if="successMessage" class="success-text">{{ successMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  droneStats,
  fetchDroneQueue,
  savePilotNotes,
  syncChecklists,
  uploadSortie,
  verifyQueueItem,
} from '@/api/drone-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('drone')
const columns = ["任务编号", "飞行区域", "所属队伍", "飞行路线", "飞手姓名", "起飞时间", "降落时间", "发现异常数"]
const actions = ["开始飞行", "确认完成", "中止任务"]
const statuses = ["待执行", "飞行中", "已完成", "因故中止"]
const filterFields = ["任务编号", "飞行区域", "飞行路线"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const successMessage = ref('')
const filters = ref<Record<string, string>>({})

const queueVersion = ref(0)
const sortByRoute = ref(true)
const queueFilters = reactive<Record<string, string>>({ 飞行路线: '', 任务编号: '', 队列状态: '' })

const showUpload = ref(false)
const uploadForm = reactive({
  任务编号: '',
  架次: '1',
  航迹序号: 1,
  原始发现数: 0,
  分辨率备注: '',
  坐标备注: '',
})

const stats = computed(() => {
  const payload = droneStats()
  return [
    { label: '今日飞行任务', value: payload.today },
    { label: '已完成任务', value: payload.completed },
    { label: '发现异常数（原始）', value: payload.abnormalTotal },
    { label: '待核查队列', value: payload.pendingQueue },
  ]
})

const flyingTasks = computed(() => rows.value.filter((row) => String(row.status) === '飞行中'))

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const queueRows = computed(() => {
  // 依赖 queueVersion，复核/同步后强制重算。
  void queueVersion.value
  return fetchDroneQueue(queueFilters, sortByRoute.value)
})

function flash(message: string, ok: boolean) {
  if (ok) {
    successMessage.value = message
    errorMessage.value = ''
  } else {
    errorMessage.value = message
    successMessage.value = ''
  }
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openUpload() {
  successMessage.value = ''
  errorMessage.value = ''
  showUpload.value = true
}

function submitUpload() {
  const result = uploadSortie({ ...uploadForm })
  flash(result.message, result.ok)
  if (!result.ok) {
    return
  }
  showUpload.value = false
  uploadForm.架次 = '1'
  uploadForm.航迹序号 = 1
  uploadForm.原始发现数 = 0
  uploadForm.分辨率备注 = ''
  uploadForm.坐标备注 = ''
  queueVersion.value += 1
  reload()
}

function runAction(action: string, row: EntryRow) {
  const result = applyAction(meta.key, Number(row.id), action)
  flash(result.message, result.ok)
  if (result.ok) {
    reload()
  }
}

function saveNotes(
  item: { id: number },
  field: '分辨率备注' | '坐标备注',
  value: string,
) {
  const result = savePilotNotes(item.id, { [field]: value })
  flash(result.message, result.ok)
  queueVersion.value += 1
}

function verify(item: { id: number }, verdict: 'confirmed' | 'false') {
  const result = verifyQueueItem(item.id, verdict)
  flash(result.message, result.ok)
  queueVersion.value += 1
  reload()
}

function runSync() {
  const result = syncChecklists()
  flash(result.message, result.ok)
  queueVersion.value += 1
}

function reload() {
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    queueVersion.value += 1
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无人机巡查列表读取失败'
    successMessage.value = ''
  }
}

onMounted(reload)
</script>

<style scoped>
.queue-block { margin-top: 20px; }
.panel-title { margin: 0 0 8px; font-size: 15px; }
.upload-panel { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
.panel-actions { display: flex; gap: 8px; }
.note-input { width: 110px; padding: 2px 6px; font-size: 12px; }
.muted-text { color: var(--muted); font-size: 12px; }
.success-text { color: #067647; }
</style>
