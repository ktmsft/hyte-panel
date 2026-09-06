import { execFile } from 'node:child_process'
import { statfs } from 'node:fs/promises'
import { cpus, freemem, totalmem, uptime } from 'node:os'

/**
 * Where each number comes from, and what it costs.
 *
 * CPU load, memory and uptime are free: Node already has them. Disk uses
 * fs.statfs, which is also free. The CPU temperature is one HTTP call to
 * LibreHardwareMonitor. Only the GPU spawns anything, so it is the only source
 * that costs a process.
 */

export interface GpuReading {
  name: string
  /** Celsius. */
  temperature: number | null
  /** 0-100. */
  load: number | null
  memoryUsedMb: number | null
  memoryTotalMb: number | null
  watts: number | null
  fanPercent: number | null
}

const SPAWN_TIMEOUT_MS = 8000

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { windowsHide: true, timeout: SPAWN_TIMEOUT_MS, maxBuffer: 1 << 20 },
      (err, stdout) => (err ? reject(err) : resolve(stdout))
    )
  })
}

// ---------------------------------------------------------------- cpu

let previous: { idle: number; total: number } | null = null

function snapshot(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const cpu of cpus()) {
    for (const [kind, ms] of Object.entries(cpu.times)) {
      total += ms
      if (kind === 'idle') idle += ms
    }
  }
  return { idle, total }
}

/**
 * Load across the window since the last call, which is what a dashboard wants.
 * The first call has nothing to compare against and returns null.
 */
export function cpuLoad(): number | null {
  const now = snapshot()
  const last = previous
  previous = now
  if (!last) return null

  const total = now.total - last.total
  const idle = now.idle - last.idle
  if (total <= 0) return null
  return Math.min(100, Math.max(0, ((total - idle) / total) * 100))
}

export function cpuName(): string {
  return cpus()[0]?.model?.replace(/\s+/g, ' ').trim() ?? 'CPU'
}

export function memory(): { usedBytes: number; totalBytes: number } {
  const total = totalmem()
  return { usedBytes: total - freemem(), totalBytes: total }
}

export function uptimeSeconds(): number {
  return uptime()
}

// ---------------------------------------------------------------- disk

export async function disk(path: string): Promise<{ usedBytes: number; totalBytes: number } | null> {
  try {
    const stats = await statfs(path)
    const total = stats.blocks * stats.bsize
    // bavail is what this user may actually use, which is the honest "free".
    const free = stats.bavail * stats.bsize
    return total > 0 ? { usedBytes: total - free, totalBytes: total } : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- gpu

const GPU_FIELDS = [
  'name',
  'temperature.gpu',
  'utilization.gpu',
  'memory.used',
  'memory.total',
  'power.draw',
  'fan.speed'
] as const

/** `[N/A]` is what nvidia-smi prints for a field a card does not report. */
function num(value: string | undefined): number | null {
  const parsed = Number.parseFloat((value ?? '').replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * nvidia-smi ships with the driver and needs no admin, which is why the GPU is
 * the one piece of real hardware telemetry available without a helper.
 * Returns null when there is no NVIDIA card, rather than throwing.
 */
export async function nvidiaGpu(): Promise<GpuReading | null> {
  let output: string
  try {
    output = await run('nvidia-smi', [
      `--query-gpu=${GPU_FIELDS.join(',')}`,
      '--format=csv,noheader,nounits'
    ])
  } catch {
    return null
  }

  const line = output.split(/\r?\n/).find((row) => row.trim() !== '')
  if (!line) return null

  const cells = line.split(',').map((cell) => cell.trim())
  return {
    name: cells[0] || 'GPU',
    temperature: num(cells[1]),
    load: num(cells[2]),
    memoryUsedMb: num(cells[3]),
    memoryTotalMb: num(cells[4]),
    watts: num(cells[5]),
    fanPercent: num(cells[6])
  }
}

// ---------------------------------------------------------------- cpu temperature

/**
 * There is no supported way to read a Ryzen's temperature on Windows: it lives
 * in SMU registers that need a kernel driver. LibreHardwareMonitor ships one.
 *
 * Its local web server is used rather than its WMI provider: a plain HTTP GET
 * beats spawning PowerShell every few seconds, and recent builds do not publish
 * WMI at all. Enable it under Options, Remote Web Server, Run.
 *
 * ACPI's MSAcpi_ThermalZoneTemperature is deliberately not used: on this class
 * of machine it reports "Not supported", and where it does answer it is a
 * chipset zone rather than the CPU.
 */
const LHM_URL = 'http://127.0.0.1:8085/data.json'
const LHM_TIMEOUT_MS = 2000

interface LhmNode {
  Text?: string
  Value?: string
  Type?: string
  SensorId?: string
  Children?: LhmNode[]
}

/**
 * Sensor names vary by vendor and by chip. On this Ryzen the package reads
 * `Core (Tctl/Tdie)`, with no "CPU" in it at all, so matching is by preference
 * with a fallback to the hottest CPU sensor rather than by one fixed name.
 */
const CPU_SENSOR_PRIORITY = [
  /^Core \(Tctl/i,
  /^CPU Package$/i,
  /Tdie/i,
  /^Core Average$/i,
  /^CPU$/i
]

export type CpuTemperature =
  | { celsius: number }
  /** LibreHardwareMonitor is not reachable. */
  | { error: 'offline' }
  /** It answered, but exposed no CPU temperature. */
  | { error: 'nosensor' }

/** `78.0 °C` and `78,0 °C` both appear, depending on locale. */
function parseValue(value: string | undefined): number | null {
  const parsed = Number.parseFloat((value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function collectTemperatures(node: LhmNode, into: { id: string; name: string; celsius: number }[]): void {
  if (node.Type === 'Temperature' && node.SensorId) {
    const celsius = parseValue(node.Value)
    if (celsius !== null) into.push({ id: node.SensorId, name: node.Text ?? '', celsius })
  }
  for (const child of node.Children ?? []) collectTemperatures(child, into)
}

/**
 * Deliberately not cached: starting or closing LibreHardwareMonitor should show
 * up on the panel within a refresh, without restarting the app.
 */
export async function cpuTemperature(): Promise<CpuTemperature> {
  let root: LhmNode
  try {
    const response = await fetch(LHM_URL, { signal: AbortSignal.timeout(LHM_TIMEOUT_MS) })
    if (!response.ok) return { error: 'offline' }
    root = (await response.json()) as LhmNode
  } catch {
    return { error: 'offline' }
  }

  const all: { id: string; name: string; celsius: number }[] = []
  collectTemperatures(root, all)
  const cpu = all.filter((sensor) => /^\/(amd|intel)cpu\//i.test(sensor.id))
  if (cpu.length === 0) return { error: 'nosensor' }

  for (const pattern of CPU_SENSOR_PRIORITY) {
    const hit = cpu.find((sensor) => pattern.test(sensor.name))
    if (hit) return { celsius: hit.celsius }
  }
  // Unknown naming: the hottest CPU sensor is the safest stand-in.
  return { celsius: Math.max(...cpu.map((sensor) => sensor.celsius)) }
}
