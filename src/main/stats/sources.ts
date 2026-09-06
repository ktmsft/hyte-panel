import { execFile } from 'node:child_process'
import { statfs } from 'node:fs/promises'
import { cpus, freemem, totalmem, uptime } from 'node:os'

/**
 * Where each number comes from, and what it costs.
 *
 * CPU load, memory and uptime are free: Node already has them. Disk uses
 * fs.statfs, which is also free. Only the GPU and the CPU temperature need a
 * process spawned, so those are the only ones that can be slow or missing.
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
 * in SMU registers that need a kernel driver. LibreHardwareMonitor ships one and
 * publishes readings to WMI, so that is the source when it is running.
 *
 * ACPI's MSAcpi_ThermalZoneTemperature is deliberately not used: on this class
 * of machine it reports "Not supported", and where it does answer it is a
 * chipset zone rather than the CPU.
 */
const LHM_QUERY = [
  '-NoProfile',
  '-NonInteractive',
  '-Command',
  "$ErrorActionPreference='Stop';" +
    "try{" +
    "$s=Get-CimInstance -Namespace root/LibreHardwareMonitor -ClassName Sensor -ErrorAction Stop|" +
    "Where-Object{$_.SensorType -eq 'Temperature' -and $_.Name -match 'CPU (Package|Tctl|Tdie|Total)'}|" +
    "Select-Object -First 1;" +
    "if($s){[math]::Round($s.Value,0)}else{''}" +
    "}catch{''}"
]

export async function cpuTemperature(): Promise<number | null> {
  try {
    return num(await run('powershell.exe', LHM_QUERY))
  } catch {
    return null
  }
}

/** Cheap check so the WMI query is only spawned on machines that can answer it. */
export async function hasHardwareMonitor(): Promise<boolean> {
  try {
    const output = await run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "if(Get-CimInstance -Namespace root -ClassName __Namespace -ErrorAction SilentlyContinue|" +
        "Where-Object{$_.Name -eq 'LibreHardwareMonitor'}){'yes'}else{'no'}"
    ])
    return output.trim() === 'yes'
  } catch {
    return false
  }
}
