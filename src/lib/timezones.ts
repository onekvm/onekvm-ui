import timezoneTable from '@/assets/zone1970.tab?raw'

export interface TimezoneLocation {
  timezone: string
  latitude: number
  longitude: number
}

function parseCoordinatePart(value: string, degreeDigits: number): number | null {
  const sign = value.startsWith('-') ? -1 : 1
  const digits = value.slice(1)
  if (digits.length !== degreeDigits + 2 && digits.length !== degreeDigits + 4) return null
  const degrees = Number(digits.slice(0, degreeDigits))
  const minutes = Number(digits.slice(degreeDigits, degreeDigits + 2))
  const seconds = digits.length === degreeDigits + 4 ? Number(digits.slice(degreeDigits + 2)) : 0
  if (![degrees, minutes, seconds].every(Number.isFinite)) return null
  return sign * (degrees + minutes / 60 + seconds / 3600)
}

function parseCoordinates(value: string): [number, number] | null {
  const splitAt = Math.max(value.indexOf('+', 1), value.indexOf('-', 1))
  if (splitAt < 0) return null
  const latitude = parseCoordinatePart(value.slice(0, splitAt), 2)
  const longitude = parseCoordinatePart(value.slice(splitAt), 3)
  return latitude === null || longitude === null ? null : [latitude, longitude]
}

function parseTimezoneTable(table: string): TimezoneLocation[] {
  const locations = new Map<string, TimezoneLocation>()
  for (const line of table.split('\n')) {
    if (!line || line.startsWith('#')) continue
    const fields = line.split('\t')
    if (fields.length < 3) continue
    const coordinates = parseCoordinates(fields[1])
    if (!coordinates) continue
    locations.set(fields[2], {
      timezone: fields[2],
      latitude: coordinates[0],
      longitude: coordinates[1],
    })
  }
  return [...locations.values()].sort((left, right) => left.timezone.localeCompare(right.timezone))
}

export const timezoneLocations = parseTimezoneTable(timezoneTable)
export const timezones = timezoneLocations.map(({ timezone }) => timezone)
