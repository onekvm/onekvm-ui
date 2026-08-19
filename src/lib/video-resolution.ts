export type VideoResolutionMode = {
  width: number
  height: number
  value: number
}

/* Keep 1080/720/480 as the historical height aliases so existing configs
   still select the matching HDMI input mode. Other modes are packed as
   width * 10000 + height. 854x480 is not a Cube HDMI input. */
export const supportedInputResolutions: readonly VideoResolutionMode[] = [
  { width: 1920, height: 1080, value: 1080 },
  { width: 1600, height: 900, value: 16000900 },
  { width: 1440, height: 1080, value: 14401080 },
  { width: 1440, height: 900, value: 14400900 },
  { width: 1280, height: 1024, value: 12801024 },
  { width: 1280, height: 960, value: 12800960 },
  { width: 1280, height: 800, value: 12800800 },
  { width: 1280, height: 720, value: 720 },
  { width: 1152, height: 864, value: 11520864 },
  { width: 1024, height: 768, value: 10240768 },
  { width: 800, height: 600, value: 8000600 },
  { width: 640, height: 480, value: 480 },
]

export function isVideoResolutionValue(value: number): boolean {
  if (value === 0) return true
  return supportedInputResolutions.some((mode) => mode.value === value)
}

export function videoResolutionOptions(autoLabel: string) {
  return [
    { label: autoLabel, value: 0 },
    ...supportedInputResolutions.map((mode) => ({
      label: `${mode.width} x ${mode.height}`,
      value: mode.value,
    })),
  ]
}
