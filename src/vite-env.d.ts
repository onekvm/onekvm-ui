/// <reference types="vite/client" />

interface HIDDeviceFilter {
  vendorId?: number
  productId?: number
  usagePage?: number
  usage?: number
}

interface HIDDeviceRequestOptions {
  filters: HIDDeviceFilter[]
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice
  readonly reportId: number
  readonly data: DataView
}

interface HIDCollectionInfo {
  usagePage: number
  usage: number
  type: number
  children: HIDCollectionInfo[]
  inputReports: HIDReportInfo[]
  outputReports: HIDReportInfo[]
  featureReports: HIDReportInfo[]
}

interface HIDReportInfo {
  reportId: number
  items: HIDReportItem[]
}

interface HIDReportItem {
  isAbsolute?: boolean
  isArray?: boolean
  isBufferedBytes?: boolean
  isConstant?: boolean
  isLinear?: boolean
  isRange?: boolean
  isVolatile?: boolean
  hasNull?: boolean
  hasPreferredState?: boolean
  wrap?: boolean
  reportSize?: number
  reportCount?: number
  unitExponent?: number
  unitFactorLengthExponent?: number
  unitFactorMassExponent?: number
  unitFactorTimeExponent?: number
  unitFactorTemperatureExponent?: number
  unitFactorCurrentExponent?: number
  unitFactorLuminousIntensityExponent?: number
  logicalMinimum?: number
  logicalMaximum?: number
  physicalMinimum?: number
  physicalMaximum?: number
  usageMinimum?: number
  usageMaximum?: number
  usages?: number[]
  strings?: string[]
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean
  readonly vendorId: number
  readonly productId: number
  readonly productName: string
  readonly collections: HIDCollectionInfo[]
  open(): Promise<void>
  close(): Promise<void>
  forget(): Promise<void>
  sendReport(reportId: number, data: BufferSource): Promise<void>
  oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => unknown) | null
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>
  requestDevice(options?: HIDDeviceRequestOptions): Promise<HIDDevice[]>
}

interface Navigator {
  readonly hid?: HID
}
