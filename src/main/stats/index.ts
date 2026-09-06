import type { StatId, StatReading } from '@shared/types'
import { getConfig } from '../config'
import {
  cpuLoad,
  cpuName,
  cpuTemperature,
  disk,
  memory,
  nvidiaGpu,
  uptimeSeconds,
  type GpuReading
} from './sources'

/** Which stats need the GPU read, so it is fetched once or not at all. */
const GPU_STATS: StatId[] = ['gpuTemp', 'gpuLoad', 'gpuVram', 'gpuPower', 'gpuFan']

/**
 * The card is a two-column grid filled row by row, so this order is the layout.
 * Read it in pairs: each line is a row, the left column is heat and capacity,
 * the right is how hard the thing is working.
 *
 *   CPU temp     CPU load
 *   GPU temp     GPU load
 *   Memory       VRAM
 *   GPU power    GPU fan
 *   Disk         Uptime
 *
 * Switching one off closes the gap rather than leaving a hole, so the pairing
 * holds for any run of adjacent choices and degrades tidily for the rest.
 */
const ORDER: StatId[] = [
  'cpuTemp',
  'cpuLoad',
  'gpuTemp',
  'gpuLoad',
  'memory',
  'gpuVram',
  'gpuPower',
  'gpuFan',
  'disk',
  'uptime'
]

/**
 * Temperatures are shown as a bar across the band worth watching. From zero a
 * bar barely twitches between idle and load, which is the whole point of it.
 */
const TEMP_FLOOR = 30
const TEMP_CEILING = 90

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function tempFraction(celsius: number): number {
  return clamp((celsius - TEMP_FLOOR) / (TEMP_CEILING - TEMP_FLOOR))
}

/** Terabytes once a drive is big enough that gigabytes stop meaning anything. */
function size(bytes: number): { value: string; unit: string } {
  const gb = bytes / 1024 ** 3
  return gb >= 1024
    ? { value: (gb / 1024).toFixed(1), unit: 'TB' }
    : { value: gb.toFixed(gb >= 100 ? 0 : 1), unit: 'GB' }
}

function stat(
  id: StatId,
  label: string,
  value: string,
  unit: string | null,
  detail: string | null = null,
  fraction: number | null = null
): StatReading {
  return { id, label, value, unit, detail, fraction }
}

/** A stat the user asked for that this machine cannot answer. */
function unavailable(id: StatId, label: string, note: string): StatReading {
  return { id, label, value: null, unit: null, detail: null, fraction: null, note }
}

function gpuStats(wanted: Set<StatId>, gpu: GpuReading | null): StatReading[] {
  const out: StatReading[] = []
  const missing = 'No NVIDIA card found'

  const add = (id: StatId, label: string, build: (g: GpuReading) => StatReading | null): void => {
    if (!wanted.has(id)) return
    if (!gpu) {
      out.push(unavailable(id, label, missing))
      return
    }
    out.push(build(gpu) ?? unavailable(id, label, 'Not reported by this card'))
  }

  add('gpuTemp', 'GPU temp', (g) =>
    g.temperature === null
      ? null
      : stat('gpuTemp', 'GPU temp', String(Math.round(g.temperature)), '°C', null, tempFraction(g.temperature))
  )
  add('gpuLoad', 'GPU load', (g) =>
    g.load === null ? null : stat('gpuLoad', 'GPU load', String(Math.round(g.load)), '%', null, g.load / 100)
  )
  add('gpuVram', 'VRAM', (g) => {
    if (g.memoryUsedMb === null || g.memoryTotalMb === null) return null
    const used = size(g.memoryUsedMb * 1024 ** 2)
    const total = size(g.memoryTotalMb * 1024 ** 2)
    return stat(
      'gpuVram',
      'VRAM',
      used.value,
      used.unit,
      `of ${total.value} ${total.unit}`,
      g.memoryUsedMb / g.memoryTotalMb
    )
  })
  add('gpuPower', 'GPU power', (g) =>
    g.watts === null ? null : stat('gpuPower', 'GPU power', String(Math.round(g.watts)), 'W')
  )
  add('gpuFan', 'GPU fan', (g) =>
    g.fanPercent === null
      ? null
      : stat('gpuFan', 'GPU fan', String(Math.round(g.fanPercent)), '%', null, g.fanPercent / 100)
  )
  return out
}

/** Days once it has been up that long, since hours stop being readable. */
function uptimeStat(seconds: number): StatReading {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  if (days > 0) return stat('uptime', 'Uptime', String(days), days === 1 ? 'day' : 'days', `${hours}h`)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return stat('uptime', 'Uptime', String(hours), 'h', `${minutes}m`)
  return stat('uptime', 'Uptime', String(minutes), 'm')
}

export async function collectStats(): Promise<StatReading[]> {
  const enabled = getConfig().stats
  const wanted = new Set((Object.keys(enabled) as StatId[]).filter((id) => enabled[id]))
  if (wanted.size === 0) return []

  // One spawn covers every GPU stat, and none happens if none are wanted.
  const needsGpu = GPU_STATS.some((id) => wanted.has(id))
  const gpu = needsGpu ? await nvidiaGpu() : null

  const found = new Map<StatId, StatReading>()
  const out: StatReading[] = []

  if (wanted.has('cpuLoad')) {
    const load = cpuLoad()
    out.push(
      load === null
        ? stat('cpuLoad', 'CPU load', '--', null)
        : stat('cpuLoad', 'CPU load', String(Math.round(load)), '%', null, load / 100)
    )
  }

  if (wanted.has('cpuTemp')) {
    const temp = await cpuTemperature()
    if ('celsius' in temp) {
      out.push(
        stat('cpuTemp', 'CPU temp', String(Math.round(temp.celsius)), '°C', null, tempFraction(temp.celsius))
      )
    } else {
      out.push(
        unavailable(
          'cpuTemp',
          'CPU temp',
          temp.error === 'offline' ? 'Needs LibreHardwareMonitor' : 'No CPU sensor found'
        )
      )
    }
  }

  if (wanted.has('memory')) {
    const { usedBytes, totalBytes } = memory()
    const used = size(usedBytes)
    const total = size(totalBytes)
    out.push(
      stat('memory', 'Memory', used.value, used.unit, `of ${total.value} ${total.unit}`, usedBytes / totalBytes)
    )
  }

  out.push(...gpuStats(wanted, gpu))

  if (wanted.has('disk')) {
    const root = process.env.SystemDrive ? `${process.env.SystemDrive}\\` : '/'
    const usage = await disk(root)
    if (usage === null) {
      out.push(unavailable('disk', 'Disk', `Could not read ${root}`))
    } else {
      const used = size(usage.usedBytes)
      const total = size(usage.totalBytes)
      out.push(
        stat(
          'disk',
          'Disk',
          used.value,
          used.unit,
          `of ${total.value} ${total.unit}`,
          usage.usedBytes / usage.totalBytes
        )
      )
    }
  }

  if (wanted.has('uptime')) out.push(uptimeStat(uptimeSeconds()))

  for (const reading of out) found.set(reading.id, reading)
  return ORDER.filter((id) => found.has(id)).map((id) => found.get(id) as StatReading)
}

export { cpuName }
