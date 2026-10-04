<template>
  <section class="page" data-module="drone">
    <header class="page-head">
      <div>
        <h2>无人机巡查管理</h2>
        <p class="page-desc">维护无人机巡查任务，围绕任务编号、飞行区域、飞行路线、飞手姓名做登记、筛选与状态流转，飞行中发现的异常按飞行路线送入核查队列。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记无人机巡查任务</button>
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
          <td :colspan="columns.length + 2" class="empty-state">暂无无人机巡查数据，可先登记无人机巡查任务</td>
        </tr>
      </tbody>
    </table>

    <section class="queue-section">
      <header class="page-head">
        <div>
          <h3>异常核查队列</h3>
          <p class="page-desc">
            飞行中发现的异常按飞行路线入队，同一架次重复上传只生效一次；飞手可补充分辨率或坐标备注，原始发现数以飞行记录为准。人工核查结论由火情报告模块同步回填，与异常冲突时两份都保留并标记「有冲突」。
          </p>
        </div>
      </header>

      <form class="filter-bar" @submit.prevent="reloadQueue">
        <label class="filter-item">
          <span>航线定位</span>
          <input v-model="routeKeyword" placeholder="按飞行路线定位" />
        </label>
        <button class="btn" type="submit">定位</button>
        <button class="btn ghost" type="button" @click="toggleRouteSort">
          按航线排序：{{ sortByRoute ? '开' : '关' }}
        </button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in queueColumns" :key="column">{{ column }}</th>
            <th>备注操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in queueRows" :key="String(entry.item.id)">
            <td>{{ entry.item['队列编号'] }}</td>
            <td>{{ entry.item['架次编号'] }}</td>
            <td>{{ entry.item['飞行路线'] }}</td>
            <td>{{ entry.item['飞行区域'] || '—' }}</td>
            <td>{{ entry.item['发现异常数'] }}</td>
            <td>
              <input v-model="entry.resolution" class="note-input" placeholder="补充分辨率备注" />
            </td>
            <td>
              <input v-model="entry.coord" class="note-input" placeholder="补充坐标备注" />
            </td>
            <td>{{ entry.item['关联报告编号'] }}</td>
            <td>{{ entry.item['人工结论'] || '—' }}</td>
            <td :class="{ 'conflict-text': entry.item.status === '有冲突' }">{{ entry.item.status }}</td>
            <td>
              <button class="link" type="button" @click="saveNotes(entry)">保存备注</button>
            </td>
          </tr>
          <tr v-if="!queueRows.length">
            <td :colspan="queueColumns.length + 1" class="empty-state">核查队列为空，飞行中的任务可上传异常架次</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条无人机巡查记录 · 核查队列 {{ queueRows.length }} 条</span>
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listReviewQueue, updateSortieNotes } from '@/api/drone-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('drone')
const columns = ["任务编号", "飞行区域", "飞行路线", "飞手姓名", "所属队伍", "起飞时间", "降落时间", "发现异常数", "任务状态"]
const actions = ["开始飞行", "上传异常架次", "确认完成", "中止任务"]
const statuses = ["待执行", "飞行中", "已完成", "因故中止"]
const stats = [{"label": "今日飞行任务", "value": 0}, {"label": "已完成任务", "value": 0}, {"label": "发现异常数", "value": 0}]
const queueColumns = ["队列编号", "架次编号", "飞行路线", "飞行区域", "发现异常数", "分辨率备注", "坐标备注", "关联报告", "人工结论", "核查状态"]

type QueueRow = {
  item: EntryRow
  resolution: string
  coord: string
}

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const queueRows = ref<QueueRow[]>([])
const routeKeyword = ref('')
const sortByRoute = ref(true)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '无人机巡查任务登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reload()
}

function saveNotes(entry: QueueRow) {
  errorMessage.value = ''
  noticeMessage.value = ''
  const result = updateSortieNotes(Number(entry.item.id), {
    分辨率备注: entry.resolution,
    坐标备注: entry.coord,
  })
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
  reloadQueue()
}

function toggleRouteSort() {
  sortByRoute.value = !sortByRoute.value
  reloadQueue()
}

function reloadQueue() {
  queueRows.value = listReviewQueue({ route: routeKeyword.value, sortByRoute: sortByRoute.value }).map(
    (item) => ({
      item,
      resolution: String(item['分辨率备注'] ?? ''),
      coord: String(item['坐标备注'] ?? ''),
    }),
  )
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
    reloadQueue()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无人机巡查列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.queue-section {
  margin-top: 24px;
}
.note-input {
  width: 140px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
}
.conflict-text {
  color: #b42318;
  font-weight: 600;
}
.notice-text {
  color: #067647;
}
</style>
