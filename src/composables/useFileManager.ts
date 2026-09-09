import { computed, readonly, shallowRef } from 'vue'

import { api, type DeviceFileEntry, type DeviceFileListing } from '@/api/client'
import { useUploadProgress } from '@/composables/useUploadProgress'

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name
}

export function useFileManager() {
  const currentPath = shallowRef('')
  const listing = shallowRef<DeviceFileListing | null>(null)
  const loading = shallowRef(false)
  const operating = shallowRef(false)
  const error = shallowRef('')
  const fileUpload = useUploadProgress()

  const entries = computed(() => listing.value?.entries || [])
  const rootPath = computed(() => listing.value?.root || '/mnt/storage')
  const uploading = computed(() => fileUpload.uploading.value)

  async function load(path = currentPath.value) {
    loading.value = true
    error.value = ''
    try {
      const result = await api.listDeviceFiles(path)
      listing.value = result
      currentPath.value = result.path
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading.value = false
    }
  }

  async function mutate(operation: () => Promise<void>) {
    operating.value = true
    error.value = ''
    try {
      await operation()
      await load()
      return true
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      return false
    } finally {
      operating.value = false
    }
  }

  function openDirectory(entry: DeviceFileEntry) {
    if (entry.directory) void load(joinPath(currentPath.value, entry.name))
  }

  function navigate(path: string) {
    void load(path)
  }

  function createDirectory(name: string) {
    return mutate(() => api.createDeviceDirectory(joinPath(currentPath.value, name)))
  }

  function renameEntry(entry: DeviceFileEntry, name: string) {
    return mutate(() => api.renameDeviceFile(
      joinPath(currentPath.value, entry.name),
      joinPath(currentPath.value, name),
    ))
  }

  function deleteEntry(entry: DeviceFileEntry) {
    return mutate(() => api.deleteDeviceFile(joinPath(currentPath.value, entry.name)))
  }

  async function upload(file: File, overwrite = false) {
    if (fileUpload.uploading.value) return false
    const controller = fileUpload.begin(file.name, file.size)
    error.value = ''
    try {
      await api.uploadDeviceFile(
        joinPath(currentPath.value, file.name),
        file,
        overwrite,
        fileUpload.progress,
        controller.signal,
      )
      await load()
      return true
    } catch (reason) {
      if (controller.signal.aborted) return false
      error.value = reason instanceof Error ? reason.message : String(reason)
      return false
    } finally {
      fileUpload.finish(controller)
    }
  }

  function cancelUpload() {
    fileUpload.cancel()
  }

  function downloadUrl(entry: DeviceFileEntry) {
    return api.getDeviceFileURL(joinPath(currentPath.value, entry.name))
  }

  return {
    currentPath: readonly(currentPath),
    listing: readonly(listing),
    rootPath,
    entries,
    loading: readonly(loading),
    operating: readonly(operating),
    error: readonly(error),
    uploadName: fileUpload.name,
    uploadLoaded: fileUpload.transferred,
    uploadTotal: fileUpload.total,
    uploadSpeed: fileUpload.speed,
    uploadPercentage: fileUpload.percentage,
    uploadRemainingSeconds: fileUpload.remainingSeconds,
    uploading,
    load,
    navigate,
    openDirectory,
    createDirectory,
    renameEntry,
    deleteEntry,
    upload,
    cancelUpload,
    downloadUrl,
  }
}
