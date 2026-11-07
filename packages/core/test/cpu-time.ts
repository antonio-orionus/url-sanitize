/**
 * A clock for timing budgets in tests: CPU time spent by this thread, in
 * milliseconds. A busy machine deschedules the test process, which adds
 * wall-clock time but no CPU time, so budgets in wall-clock time failed
 * whenever another job loaded the machine. A pathological regex still burns
 * CPU however busy the machine is, so a budget in CPU time still catches it.
 *
 * `process.threadCpuUsage()` (Node 23.9+) counts only this thread; on older
 * Node, `process.cpuUsage()` counts the whole test process, which vitest runs
 * one file per fork.
 */
export function cpuNow(): number {
  const usage =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (usage.user + usage.system) / 1000;
}
