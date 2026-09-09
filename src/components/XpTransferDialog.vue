<script setup lang="ts">
import { useTemplateRef, type CSSProperties } from 'vue'

withDefaults(defineProps<{
  show: boolean
  dialogLabel: string
  windowStyle?: CSSProperties
  layerClass?: string
  status?: string
  transferred?: number
  total?: number
  percentage?: number
  speed?: number
  remainingLabel?: string
  showAnimation?: boolean
}>(), {
  windowStyle: undefined,
  layerClass: '',
  status: '',
  transferred: 0,
  total: 0,
  percentage: 0,
  speed: undefined,
  remainingLabel: '',
  showAnimation: true,
})

const emit = defineEmits<{
  titlePointerdown: [event: PointerEvent]
}>()

const windowElement = useTemplateRef<HTMLElement>('windowElement')

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`
}

defineExpose({ windowElement })
</script>

<template>
  <Teleport to="body">
    <Transition name="xp-upload-fade" appear>
      <div v-if="show" class="xp-upload-modal-layer" :class="layerClass">
        <section
          ref="windowElement"
          class="xp-upload-window"
          :style="windowStyle"
          role="dialog"
          aria-modal="false"
          :aria-label="dialogLabel"
        >
          <header class="xp-upload-titlebar" @pointerdown="emit('titlePointerdown', $event)">
            <span><slot name="title" /></span>
            <slot name="title-actions" />
          </header>
          <div class="xp-upload-body">
            <slot>
              <div v-if="showAnimation" class="xp-transfer-animation" aria-hidden="true">
                <span class="xp-transfer-folder xp-transfer-folder-source" />
                <span class="xp-transfer-paper xp-transfer-paper-one" />
                <span class="xp-transfer-paper xp-transfer-paper-two" />
                <span class="xp-transfer-paper xp-transfer-paper-three" />
                <span class="xp-transfer-folder xp-transfer-folder-target" />
              </div>
              <p class="xp-upload-status" :title="status">{{ status }}</p>
              <div class="xp-upload-stats">
                <span>{{ formatBytes(transferred) }} / {{ formatBytes(total) }}</span>
                <span v-if="speed !== undefined">{{ speed > 0 ? `${formatBytes(speed)}/s` : '—' }}</span>
                <strong>{{ percentage }}%</strong>
              </div>
              <slot name="hint" />
              <footer class="xp-upload-control-row">
                <div class="xp-upload-progress-area">
                  <div v-if="remainingLabel" class="xp-upload-eta">{{ remainingLabel }}</div>
                  <div
                    class="xp-progress-track"
                    role="progressbar"
                    :aria-valuenow="percentage"
                    aria-valuemin="0"
                    aria-valuemax="100"
                  >
                    <div class="xp-progress-value" :style="{ width: `${percentage}%` }" />
                  </div>
                </div>
                <div class="xp-upload-actions"><slot name="actions" /></div>
              </footer>
            </slot>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.xp-upload-modal-layer { position: fixed; z-index: 5000; display: grid; inset: 0; padding: 16px; place-items: center; pointer-events: none; }
.xp-upload-window { width: min(440px, calc(100vw - 24px)); max-width: calc(100vw - 32px); overflow: hidden; border-radius: 8px 8px 0 0; background: #ece9d8; box-shadow: 4px 4px 10px rgba(0, 0, 0, .5); color: #000; font-family: "Noto Sans SC", Tahoma, "MS UI Gothic", Arial, sans-serif; font-size: 11px; pointer-events: auto; user-select: none; }
.xp-upload-titlebar { display: flex; height: 28px; align-items: center; justify-content: space-between; gap: 4px; padding: 3px 5px; background: linear-gradient(180deg, #0997ff 0%, #0053ee 8%, #0050ee 40%, #0066ff 88%, #0066ff 93%, #005bff 95%, #003dd7 96%, #003dd7 100%); color: #fff; cursor: move; font-family: "Trebuchet MS", "Noto Sans SC", Arial, sans-serif; text-shadow: 1px 1px #0f1089; touch-action: none; }
.xp-upload-titlebar > span { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; }
.xp-upload-titlebar button { display: block; width: 21px; min-width: 21px; height: 21px; min-height: 21px; padding: 0; border: 0; outline: 0; background-color: #0050ee; background-position: center; background-repeat: no-repeat; background-size: 21px 21px; box-shadow: none; cursor: pointer; }
.xp-upload-titlebar .xp-title-minimize { background-image: url('/xp-icons/minimize.svg'); }
.xp-upload-titlebar .xp-title-minimize:hover { background-image: url('/xp-icons/minimize-hover.svg'); }
.xp-upload-titlebar .xp-title-minimize:active { background-image: url('/xp-icons/minimize-active.svg'); }
.xp-upload-body { display: grid; gap: 10px; padding: 12px 15px 14px; border-right: 3px solid #0050ee; border-bottom: 3px solid #0050ee; border-left: 3px solid #0050ee; background: #ece9d8; }
.xp-transfer-animation { position: relative; height: 64px; overflow: hidden; border: 1px solid #aaa; background: linear-gradient(180deg, #fff, #f2f3ed); box-shadow: inset 1px 1px #d2d2d2, inset -1px -1px #fff; }
.xp-transfer-folder { position: absolute; bottom: 11px; width: 50px; height: 32px; border: 1px solid #a56c05; border-radius: 2px; background: linear-gradient(180deg, #ffe67a 0 12%, #efb72f 14% 100%); box-shadow: inset 1px 1px #fff3a8, 1px 1px 1px rgba(0, 0, 0, .22); }
.xp-transfer-folder::before { position: absolute; top: -8px; left: 4px; width: 22px; height: 9px; border: 1px solid #a56c05; border-bottom: 0; border-radius: 2px 3px 0 0; background: #f6ca4b; content: ""; }
.xp-transfer-folder-source { left: 38px; }
.xp-transfer-folder-target { right: 38px; }
.xp-transfer-paper { position: absolute; z-index: 2; top: 25px; left: 78px; width: 17px; height: 22px; border: 1px solid #748aa5; background: repeating-linear-gradient(180deg, #fff 0 4px, #b8cceb 4px 5px); box-shadow: 1px 1px 2px rgba(0, 0, 0, .25); opacity: 0; animation: xp-transfer-paper 1.8s linear infinite; }
.xp-transfer-paper-two { animation-delay: .6s; }
.xp-transfer-paper-three { animation-delay: 1.2s; }
@keyframes xp-transfer-paper {
  0% { opacity: 0; transform: translate(0, 6px) rotate(-8deg) scale(.92); }
  10% { opacity: 1; }
  48% { opacity: 1; transform: translate(114px, -16px) rotate(4deg) scale(1); }
  88% { opacity: 1; transform: translate(224px, 5px) rotate(9deg) scale(.94); }
  100% { opacity: 0; transform: translate(238px, 11px) rotate(11deg) scale(.86); }
}
.xp-upload-file { display: flex; min-width: 0; align-items: center; gap: 10px; }
.xp-upload-file > span { display: grid; min-width: 0; gap: 2px; }
.xp-upload-file strong { min-width: 0; color: #0b2d64; font-size: 13px; overflow-wrap: anywhere; word-break: break-word; }
.xp-upload-file small { color: #555; font-size: 11px; line-height: 1.45; }
.xp-upload-body > p { margin: 2px 0 0; font-size: 12px; }
.xp-progress-track { box-sizing: border-box; height: 14px; padding: 1px 2px 1px 0; overflow: hidden; border: 1px solid #686868; border-radius: 4px; background: #fff; box-shadow: inset 0 0 1px #686868; }
.xp-progress-value { height: 100%; min-width: 0; border-radius: 2px; background: repeating-linear-gradient(90deg, #fff 0, #fff 2px, transparent 2px, transparent 10px), linear-gradient(180deg, #acedad 0%, #7be47d 14%, #4cda50 28%, #2ed330 42%, #42d845 57%, #76e275 71%, #8fe791 85%, #fff 100%); transition: width 120ms linear; }
.xp-upload-stats { display: flex; justify-content: space-between; color: #333; font-size: 11px; }
.xp-upload-control-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 12px; padding-top: 3px; }
.xp-upload-progress-area { display: grid; min-width: 0; gap: 4px; }
.xp-upload-eta { color: #333; font-size: 11px; }
.xp-upload-status { min-width: 0; overflow: hidden; margin: 0; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.xp-resume-hint { padding: 7px 8px; border: 1px solid #d6c67b; background: #fffbd7; color: #554b19; font-size: 11px; }
.xp-upload-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 3px; }
.xp-upload-control-row .xp-upload-actions { padding-top: 0; }
.xp-upload-actions button, .xp-upload-file-button > span { display: inline-flex; min-width: 82px; min-height: 23px; align-items: center; justify-content: center; padding: 0 12px; border: 1px solid #003c74; border-radius: 3px; outline: none; background: linear-gradient(#fff, #ecebe5 86%, #d8d0c4); color: #222; font: 11px Tahoma, "Noto Sans SC", Arial, sans-serif; cursor: pointer; }
.xp-upload-actions button:not(:disabled):hover, .xp-upload-file-button:hover > span { box-shadow: #fff0cf -1px 1px inset, #fdd889 1px 2px inset, #fbc761 -2px 2px inset, #e5a01a 2px -2px inset; }
.xp-upload-actions button:not(:disabled):active, .xp-upload-file-button:active > span { background: linear-gradient(#cdcac3, #e3e3db 8%, #e5e5de 94%, #f2f2f1); box-shadow: none; }
.xp-upload-actions button:focus-visible, .xp-upload-file-button:focus-within > span { box-shadow: #cee7ff -1px 1px inset, #98b8ea 1px 2px inset, #bcd4f6 -2px 2px inset, #89ade4 1px -1px inset, #89ade4 2px -2px inset; }
.xp-upload-actions button:disabled { cursor: not-allowed; opacity: .55; }
.xp-upload-file-button input { display: none; }
.xp-upload-fade-enter-active { transition: opacity .1s ease; }
.xp-upload-fade-leave-active { transition: opacity .15s ease; }
.xp-upload-fade-enter-from, .xp-upload-fade-leave-to { opacity: 0; }
.xp-upload-fade-enter-active .xp-upload-window { animation: xp-upload-window-in .16s ease-out; }
@keyframes xp-upload-window-in { from { transform: translateY(12px) scale(.96); } to { transform: translateY(0) scale(1); } }
.xp-transfer-error { color: #a40000; }
.xp-file-transfer-layer { z-index: 5100; }
@media (prefers-reduced-motion: reduce) { .xp-transfer-paper, .xp-upload-fade-enter-active .xp-upload-window { animation: none; } }
</style>
