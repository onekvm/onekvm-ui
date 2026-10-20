<script setup lang="ts">
import { shallowRef, useId, type Component } from 'vue'
import { ChevronDown } from '@/icons'
import { useThemeVars } from 'naive-ui'

const props = defineProps<{
  title: string
  icon: Component
  collapsible?: boolean
}>()

const expanded = shallowRef(false)
const contentId = useId()
const themeVars = useThemeVars()

function toggleExpanded() {
  if (props.collapsible) expanded.value = !expanded.value
}
</script>

<template>
  <section
    class="display-settings-group"
    :aria-label="title"
  >
    <component
      :is="collapsible ? 'button' : 'header'"
      class="display-settings-group-heading"
      :type="collapsible ? 'button' : undefined"
      :aria-expanded="collapsible ? expanded : undefined"
      :aria-controls="collapsible ? contentId : undefined"
      @click="toggleExpanded"
    >
      <component :is="icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
      <component :is="collapsible ? 'span' : 'h3'" class="display-settings-group-title">{{ title }}</component>
      <ChevronDown v-if="collapsible" :size="14" class="display-settings-group-chevron" aria-hidden="true" />
    </component>
    <n-collapse-transition :show="!collapsible || expanded" class="display-settings-group-content" :id="contentId">
      <div class="display-status-values">
        <slot />
      </div>
    </n-collapse-transition>
  </section>
</template>

<style scoped>
.display-settings-group {
  min-width: 0;
  padding-top: 10px;
}
.display-settings-group + .display-settings-group {
  margin-top: 10px;
  border-top: 1px solid var(--border);
}
.display-settings-group-heading {
  display: flex;
  min-height: 24px;
  align-items: center;
  gap: 7px;
  color: var(--muted-foreground);
}
.display-settings-group-heading > svg {
  flex: 0 0 auto;
}
.display-settings-group-title {
  margin: 0;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
button.display-settings-group-heading {
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
button.display-settings-group-heading:hover {
  color: var(--foreground);
}
button.display-settings-group-heading:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}
.display-settings-group-chevron {
  margin-left: auto;
  transition: transform 200ms v-bind('themeVars.cubicBezierEaseInOut');
}
.display-settings-group-heading[aria-expanded="true"] .display-settings-group-chevron {
  transform: rotate(180deg);
}
.display-settings-group-content:is(
  .fade-in-height-expand-transition-enter-active,
  .fade-in-height-expand-transition-leave-active
) {
  transition-duration: 200ms;
}
@media (prefers-reduced-motion: reduce) {
  .display-settings-group-chevron { transition: none; }
  .display-settings-group-content:is(
    .fade-in-height-expand-transition-enter-active,
    .fade-in-height-expand-transition-leave-active
  ) { transition-duration: 1ms; }
}
</style>
