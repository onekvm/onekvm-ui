import { computed, readonly, shallowRef } from 'vue'

import { api } from '@/api/client'
import {
  decodeTextFile,
  encodeTextFile,
  FileTextError,
  type FileLineEnding,
} from '@/utils/fileText'

export const MAX_EDITABLE_FILE_BYTES = 2 * 1024 * 1024

export function useFileEditor() {
  const path = shallowRef('')
  const content = shallowRef('')
  const savedContent = shallowRef('')
  const lineEnding = shallowRef<FileLineEnding>('lf')
  const byteOrderMark = shallowRef(false)
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const loadError = shallowRef<unknown>(null)
  const saveError = shallowRef<unknown>(null)
  const loadController = shallowRef<AbortController | null>(null)

  const dirty = computed(() => content.value !== savedContent.value)
  const lineCount = computed(() => content.value.split('\n').length)

  function reset() {
    loadController.value?.abort()
    loadController.value = null
    path.value = ''
    content.value = ''
    savedContent.value = ''
    lineEnding.value = 'lf'
    byteOrderMark.value = false
    loading.value = false
    saving.value = false
    loadError.value = null
    saveError.value = null
  }

  async function load(targetPath: string, size: number) {
    reset()
    path.value = targetPath
    if (size > MAX_EDITABLE_FILE_BYTES) {
      loadError.value = new FileTextError('too-large')
      return
    }
    const controller = new AbortController()
    loadController.value = controller
    loading.value = true
    try {
      const decoded = decodeTextFile(
        await api.readDeviceFile(targetPath, controller.signal),
        MAX_EDITABLE_FILE_BYTES,
      )
      if (controller.signal.aborted) return
      content.value = decoded.text
      savedContent.value = decoded.text
      lineEnding.value = decoded.lineEnding
      byteOrderMark.value = decoded.byteOrderMark
    } catch (reason) {
      if (!controller.signal.aborted) loadError.value = reason
    } finally {
      if (loadController.value === controller) {
        loadController.value = null
        loading.value = false
      }
    }
  }

  async function save() {
    if (!path.value || loading.value || saving.value || loadError.value) return false
    saving.value = true
    saveError.value = null
    try {
      const bytes = encodeTextFile(content.value, lineEnding.value, byteOrderMark.value)
      await api.uploadDeviceFile(path.value, new Blob([bytes], { type: 'text/plain;charset=utf-8' }), true)
      savedContent.value = content.value
      return true
    } catch (reason) {
      saveError.value = reason
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    content,
    lineEnding: readonly(lineEnding),
    byteOrderMark: readonly(byteOrderMark),
    loading: readonly(loading),
    saving: readonly(saving),
    loadError: readonly(loadError),
    saveError: readonly(saveError),
    dirty,
    lineCount,
    load,
    save,
    reset,
  }
}
