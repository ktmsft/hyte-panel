import type { StatId, StatReading } from '@shared/types'
import { getConfig } from '../config'
import {
  cpuLoad,
  cpuName,
  cpuTemperature,
  disk,
  hasHardwareMonitor,
  memory,
  nvidiaGpu,
  uptimeSeconds,
  type GpuReading
} from './sources'

/** Which stats need the GPU read, so it is fetched once or not at all. */
const GPU_STATS: StatId[] = ['gpuTemp', 'gpuLoad', 'gpuVram', 'gpuPower', 'gpuFan']

/** Checked once: without LibreHardwareMonitor there is no point spawning WMI. */
let monitorPresent: boolean | null = null

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function reading(
  id: StatId,
  label: string,
  value: string | null,
  fraction: number | null = null,
  note?: string
): StatReading {
  return { id, label, value, fraction, note }
}

/** A stat the user asked for that this machine cannot answer. */
function unavailable(id: StatId, label: string, note: string): StatReading {
  return reading(id, label, null, null, note)
}

function gpuStats(wanted: Set<StatId>, gpu: GpuReading | null): StatReading[] {
  const out: StatReading[] = []
  const missing = 'No NVIDIA GPU found. nvidia-smi ships with the driver.'

  const add = (id: StatId, label: string, build: (g: GpuReading) => StatReading | null): void => {
    if (!wanted.has(id)) return
    if (!gpu) {
      out.push(unavailable(id, label, missing))
      return
    }
    out.push(build(gpu) ?? unavailable(id, label, 'This card does not report it.'))
  }

  add('gpuTemp', 'GPU temp', (g) =>
    g.temperature === null ? null : reading('gpuTemp', 'GPU temp', `${Math.round(g.temperature)}°C`,
      // 30 to 90 is the band worth seeing move; a bar from zero barely twitches.
      Math.min(1, Math.max(0, (g.temperature - 30) / 60)))
  )
  add('gpuLoad', 'GPU load', (g) =>
    g.load === null ? null : reading('gpuLoad', 'GPU load', `${Math.round(g.load)}%`, g.load / 100)
  )
  add('gpuVram', 'VRAM', (g) =>
    g.memoryUsedMb === null || g.memoryTotalMb === null
      ? null
      : reading(
          'gpuVram',
          'VRAM',
          `${(g.memoryUsedMb / 1024).toFixed(1)} / ${(g.memoryTotalMb / 1024).toFixed(1)} GB`,
          g.memoryUsedMb / g.memoryTotalMb
        )
  )
  add('gpuPower', 'GPU power', (g) =>
    g.watts === null ? null : reading('gpuPower', 'GPU power', `${Math.round(g.watts)} W`)
  )
  add('gpuFan', 'GPU fan', (g) =>
    g.fanPercent === null ? null : reading('gpuFan', 'GPU fan', `${Math.round(g.fanPercent)}%`, g.fanPercent / 100)
  )
  return out
}

export async function collectStats(): Promise<StatReading[]> {
  const enabled = getConfig().stats
  const wanted = new Set((Object.keys(enabled) as StatId[]).filter((id) => enabled[id]))
  if (wanted.size === 0) return []

  // One spawn covers every GPU stat, and none happens if none are wanted.
  const needsGpu = GPU_STATS.some((id) => wanted.has(id))
  const gpu = needsGpu ? await nvidiaGpu() : null

  const out: StatReading[] = []

  if (wanted.has('cpuLoad')) {
    const load = cpuLoad()
    out.push(
      load === null
        ? reading('cpuLoad', 'CPU load', '--', null)
        : reading('cpuLoad', 'CPU load', `${Math.round(load)}%`, load / 100)
    )
  }

  if (wanted.has('cpuTemp')) {
    if (monitorPresent === null) monitorPresent = await hasHardwareMonitor()
    if (!monitorPresent) {
      out.push(
        unavailable(
          'cpuTemp',
          'CPU temp',
          'Windows has no supported way to read this. Install LibreHardwareMonitor and leave it running as administrator.'
        )
      )
    } else {
      const temp = await cpuTemperature()
      out.push(
        temp === null
          ? unavailable('cpuTemp', 'CPU temp', 'LibreHardwareMonitor is running but reported no CPU sensor.')
          : reading('cpuTemp', 'CPU temp', `${Math.round(temp)}°C`, Math.min(1, Math.max(0, (temp - 30) / 60)))
      )
    }
  }

  if (wanted.has('memory')) {
    const { usedBytes, totalBytes } = memory()
    out.push(
      reading('memory', 'Memory', `${gb(usedBytes)} / ${gb(totalBytes)}`, usedBytes / totalBytes)
    )
  }

  out.push(...gpuStats(wanted, gpu))

  if (wanted.has('disk')) {
    const root = process.env.SystemDrive ? `${process.env.SystemDrive}\\` : '/'
    const usage = await disk(root)
    out.push(
      usage === null
        ? unavailable('disk', 'Disk', `Could not read ${root}.`)
        : reading('disk', 'Disk', `${gb(usage.usedBytes)} / ${gb(usage.totalBytes)}`, usage.usedBytes / usage.totalBytes)
    )
  }

  if (wanted.has('uptime')) {
    out.push(reading('uptime', 'Uptime', duration(uptimeSeconds())))
  }

  return out
}

export { cpuName }
