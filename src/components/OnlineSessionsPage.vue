<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Globe2, MonitorPlay, PlugZap, RadioTower, UserRound } from '@lucide/vue'

import { api, type OnlineSession } from '@/api/client'
import { t } from '@/i18n/runtime'

const sessions = ref<OnlineSession[]>([])
const loading = ref(true)
const error = ref('')
const now = ref(Date.now())
let refreshTimer: number | null = null
let clockTimer: number | null = null
let refreshing = false

const browserCount = computed(() => sessions.value.filter(({ source }) => source === 'browser').length)
const extensionCount = computed(() => sessions.value.filter(({ source }) => source === 'extension').length)

function protocolLabel(session: OnlineSession) {
	const labels: Record<string, string> = {
		webrtc: 'WebRTC', websocket: 'WebSocket', mjpeg: 'MJPEG / HTTP',
		rtsp: 'RTSP', rustdesk: 'RustDesk', vnc: 'VNC',
	}
	return labels[session.protocol.toLowerCase()] || session.protocol || '-'
}

function sourceLabel(source: OnlineSession['source']) {
	return source === 'browser'
		? t('settings.advancedSettings.sessionsPage.browser', 'Web console')
		: t('settings.advancedSettings.sessionsPage.extension', 'Protocol plugin')
}

function formatDuration(connectedAt: string) {
	const elapsed = Math.max(0, Math.floor((now.value - Date.parse(connectedAt)) / 1000))
	if (!Number.isFinite(elapsed)) return '-'
	const days = Math.floor(elapsed / 86400)
	const hours = Math.floor((elapsed % 86400) / 3600)
	const minutes = Math.floor((elapsed % 3600) / 60)
	const seconds = elapsed % 60
	if (days > 0) return `${days}d ${hours}h ${minutes}m`
	if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
	if (minutes > 0) return `${minutes}m ${seconds}s`
	return `${seconds}s`
}

async function refresh() {
	if (refreshing) return
	refreshing = true
	try {
		sessions.value = await api.getSessions()
		error.value = ''
	} catch (reason) {
		error.value = reason instanceof Error ? reason.message : String(reason)
	} finally {
		loading.value = false
		refreshing = false
	}
}

onMounted(() => {
	void refresh()
	refreshTimer = window.setInterval(refresh, 2000)
	clockTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
})

onBeforeUnmount(() => {
	if (refreshTimer !== null) window.clearInterval(refreshTimer)
	if (clockTimer !== null) window.clearInterval(clockTimer)
})
</script>

<template>
  <section class="online-sessions-page">
    <n-alert v-if="error" type="error" :bordered="false">{{ error }}</n-alert>

    <div class="session-summary">
      <div>
        <span class="session-summary-icon"><RadioTower :size="20" /></span>
        <span><strong>{{ sessions.length }}</strong>{{ t('settings.advancedSettings.sessionsPage.active', 'Active streams') }}</span>
      </div>
      <div>
        <span class="session-summary-icon"><MonitorPlay :size="20" /></span>
        <span><strong>{{ browserCount }}</strong>{{ t('settings.advancedSettings.sessionsPage.browser', 'Web console') }}</span>
      </div>
      <div>
        <span class="session-summary-icon"><PlugZap :size="20" /></span>
        <span><strong>{{ extensionCount }}</strong>{{ t('settings.advancedSettings.sessionsPage.extension', 'Protocol plugin') }}</span>
      </div>
    </div>

    <n-spin :show="loading">
      <n-empty
        v-if="!loading && sessions.length === 0"
        class="sessions-empty"
        :description="t('settings.advancedSettings.sessionsPage.empty', 'No active video streams')"
      />
      <template v-else>
        <div class="sessions-table-scroll">
          <table class="sessions-table">
            <thead>
              <tr>
                <th>{{ t('settings.advancedSettings.sessionsPage.protocol', 'Protocol') }}</th>
                <th>{{ t('settings.advancedSettings.sessionsPage.method', 'Connection method') }}</th>
                <th>{{ t('settings.advancedSettings.sessionsPage.client', 'Client IP') }}</th>
                <th>{{ t('settings.advancedSettings.sessionsPage.user', 'User') }}</th>
                <th>{{ t('settings.advancedSettings.sessionsPage.codec', 'Codec') }}</th>
                <th>{{ t('settings.advancedSettings.sessionsPage.duration', 'Connected for') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="session in sessions" :key="session.id">
                <td>
                  <span class="session-protocol"><i />{{ protocolLabel(session) }}</span>
                </td>
                <td>
                  <span class="session-detail">
                    <MonitorPlay v-if="session.source === 'browser'" :size="16" />
                    <PlugZap v-else :size="16" />
                    <span>{{ sourceLabel(session.source) }}<small v-if="session.transport">{{ session.transport }}</small></span>
                  </span>
                </td>
                <td>
                  <span class="session-detail"><Globe2 :size="16" /><span>{{ session.client_ip || '-' }}</span></span>
                </td>
                <td>
                  <span class="session-detail"><UserRound :size="16" /><span>{{ session.username || '-' }}</span></span>
                </td>
                <td><span class="session-codec">{{ session.codec?.toUpperCase() || '-' }}</span></td>
                <td class="session-duration">{{ formatDuration(session.connected_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul class="sessions-cards">
          <li v-for="session in sessions" :key="`card-${session.id}`">
            <header>
              <span class="session-protocol"><i />{{ protocolLabel(session) }}</span>
              <span class="session-codec">{{ session.codec?.toUpperCase() || '-' }}</span>
            </header>
            <dl>
              <div>
                <dt>{{ t('settings.advancedSettings.sessionsPage.method', 'Connection method') }}</dt>
                <dd>{{ sourceLabel(session.source) }}<small v-if="session.transport">{{ session.transport }}</small></dd>
              </div>
              <div>
                <dt>{{ t('settings.advancedSettings.sessionsPage.client', 'Client IP') }}</dt>
                <dd>{{ session.client_ip || '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('settings.advancedSettings.sessionsPage.user', 'User') }}</dt>
                <dd>{{ session.username || '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('settings.advancedSettings.sessionsPage.duration', 'Connected for') }}</dt>
                <dd>{{ formatDuration(session.connected_at) }}</dd>
              </div>
            </dl>
          </li>
        </ul>
      </template>
    </n-spin>
  </section>
</template>

<style scoped>
.online-sessions-page { display: grid; gap: 18px; }
.session-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.session-summary > div {
  display: flex; align-items: center; gap: 12px; min-width: 0; padding: 16px;
  border: 1px solid var(--border-color); border-radius: 10px; background: var(--card-color);
}
.session-summary-icon {
  display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 auto;
  color: var(--primary-color); border-radius: 9px; background: color-mix(in srgb, var(--primary-color) 12%, transparent);
}
.session-summary span:last-child { display: grid; color: var(--text-color-3); font-size: 12px; }
.session-summary strong { color: var(--text-color-1); font-size: 20px; line-height: 1.2; }
.sessions-empty { padding: 72px 0; }
.sessions-table-scroll { overflow-x: auto; border: 1px solid var(--border-color); border-radius: 10px; }
.sessions-table { width: 100%; min-width: 840px; border-collapse: collapse; background: var(--card-color); }
.sessions-table th {
  padding: 11px 14px; color: var(--text-color-3); background: var(--table-header-color, rgba(127, 127, 127, .06));
  font-size: 12px; font-weight: 600; text-align: left; white-space: nowrap;
}
.sessions-table td { padding: 13px 14px; border-top: 1px solid var(--border-color); color: var(--text-color-2); }
.session-protocol { display: inline-flex; align-items: center; gap: 7px; color: var(--text-color-1); font-weight: 600; white-space: nowrap; }
.session-protocol i { width: 7px; height: 7px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px rgba(53, 201, 139, .14); }
.session-detail { display: inline-flex; align-items: center; gap: 7px; min-width: 0; white-space: nowrap; }
.session-detail > svg { flex: 0 0 auto; color: var(--text-color-3); }
.session-detail > span { display: grid; }
.session-detail small { color: var(--text-color-3); font-size: 10px; text-transform: uppercase; }
.session-codec {
  display: inline-flex; align-items: center; min-height: 24px; padding: 2px 8px;
  border-radius: 6px; background: rgba(127, 127, 127, .1); color: var(--text-color-1);
  font-family: inherit; font-size: 12px; font-weight: 600; line-height: 20px; letter-spacing: .025em;
}
.session-duration { color: var(--text-color-1) !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sessions-cards { display: none; margin: 0; padding: 0; list-style: none; }
.sessions-cards > li {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-color);
}
.sessions-cards > li > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sessions-cards dl { display: grid; gap: 10px; margin: 0; }
.sessions-cards dl > div { display: grid; gap: 3px; }
.sessions-cards dt { color: var(--text-color-3); font-size: 11px; }
.sessions-cards dd { margin: 0; color: var(--text-color-1); font-size: 13px; overflow-wrap: anywhere; }
.sessions-cards dd small { margin-left: 6px; color: var(--text-color-3); font-size: 10px; text-transform: uppercase; }

@media (max-width: 760px) {
  .session-summary { grid-template-columns: 1fr; }
  .session-summary > div { padding: 14px; }
  .sessions-table-scroll { display: none; }
  .sessions-cards { display: grid; gap: 12px; }
}
</style>
