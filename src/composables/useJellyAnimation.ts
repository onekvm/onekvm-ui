import { watch, type Ref } from 'vue'

// CSS keeps the motion on the compositor; only align newly started animations.
// animationstart also covers windows restored from display:none and motion
// re-enabled after a reduced-motion preference change.
export function useJellyAnimation(enabled: Ref<boolean>) {
  watch(enabled, (active, _previous, onCleanup) => {
    const root = document.documentElement
    root.toggleAttribute('data-onekvm-jelly', active)
    if (!active) return

    const startTime = document.timeline.currentTime ?? 0
    function synchronize(event: AnimationEvent) {
      if (!(event.target instanceof Element)) return
      if (event.animationName !== 'brand-logo-jelly') return
      for (const animation of event.target.getAnimations()) {
        if (animation instanceof CSSAnimation && animation.animationName === event.animationName) {
          animation.startTime = startTime
        }
      }
    }
    root.addEventListener('animationstart', synchronize)
    onCleanup(() => {
      root.removeEventListener('animationstart', synchronize)
      root.removeAttribute('data-onekvm-jelly')
    })
  }, { immediate: true })
}
