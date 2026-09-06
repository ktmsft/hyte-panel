/**
 * Reads every stat source once against the real machine, so the parsing is
 * checked against actual hardware rather than a guess at the output format.
 *
 *   node scripts/stats-check.ts
 */
import {
  cpuLoad,
  cpuName,
  cpuTemperature,
  disk,
  hasHardwareMonitor,
  memory,
  nvidiaGpu,
  uptimeSeconds
} from '../src/main/stats/sources.ts'

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

const results: [string, string][] = []
let warnings = 0

function note(label: string, value: string | null, hint = ''): void {
  if (value === null) {
    warnings++
    results.push([label, `unavailable${hint ? ` -- ${hint}` : ''}`])
  } else {
    results.push([label, value])
  }
}

console.log(`\n${cpuName()}\n`)

// The first call has no window to measure, so prime it and read again.
cpuLoad()
await new Promise((resolve) => setTimeout(resolve, 500))
const load = cpuLoad()
note('CPU load', load === null ? null : `${load.toFixed(1)}%`)

const mem = memory()
note('Memory', `${gb(mem.usedBytes)} / ${gb(mem.totalBytes)}`)
note('Uptime', `${Math.round(uptimeSeconds() / 3600)}h`)

const root = process.env.SystemDrive ? `${process.env.SystemDrive}\\` : '/'
const usage = await disk(root)
note(`Disk ${root}`, usage === null ? null : `${gb(usage.usedBytes)} / ${gb(usage.totalBytes)}`)

const gpu = await nvidiaGpu()
if (!gpu) {
  note('GPU', null, 'nvidia-smi absent or returned nothing')
} else {
  results.push(['GPU', gpu.name])
  note('  temperature', gpu.temperature === null ? null : `${gpu.temperature}°C`)
  note('  load', gpu.load === null ? null : `${gpu.load}%`)
  note(
    '  VRAM',
    gpu.memoryUsedMb === null || gpu.memoryTotalMb === null
      ? null
      : `${(gpu.memoryUsedMb / 1024).toFixed(1)} / ${(gpu.memoryTotalMb / 1024).toFixed(1)} GB`
  )
  note('  power', gpu.watts === null ? null : `${gpu.watts} W`)
  note('  fan', gpu.fanPercent === null ? null : `${gpu.fanPercent}%`)
}

const monitor = await hasHardwareMonitor()
results.push(['LibreHardwareMonitor', monitor ? 'present' : 'not installed'])
if (monitor) {
  const temp = await cpuTemperature()
  note('CPU temperature', temp === null ? null : `${temp}°C`, 'no matching CPU sensor')
} else {
  note('CPU temperature', null, 'expected: needs LibreHardwareMonitor')
}

const width = Math.max(...results.map(([label]) => label.length))
for (const [label, value] of results) console.log(`  ${label.padEnd(width)}  ${value}`)
console.log(`\n${warnings} unavailable\n`)
