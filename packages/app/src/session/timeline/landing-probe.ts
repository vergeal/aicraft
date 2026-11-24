// Temporary DEV-only probe: records where the timeline lands on activation and every offset change after it.
// Remove once the landing behaviour is settled.

if (import.meta.env.DEV) console.log("[plugin] landing-probe armed")

export function probeLanding(
  label: string,
  viewport: HTMLElement | undefined,
  extra?: Record<string, unknown>,
) {
  if (!import.meta.env.DEV || !viewport) return

  const start = performance.now()
  const samples: string[] = []
  let last = ""

  const tick = () => {
    const elapsed = Math.round(performance.now() - start)
    const top = Math.round(viewport.scrollTop)
    const height = Math.round(viewport.scrollHeight)
    const value = `${top}/${height}`

    if (value !== last) {
      last = value
      samples.push(`${elapsed}:${value}`)
    }

    if (elapsed > 2000) {
      console.log("[plugin] landing " + JSON.stringify({ label, extra, samples }))
      return
    }

    requestAnimationFrame(tick)
  }

  samples.push(`0:${Math.round(viewport.scrollTop)}/${Math.round(viewport.scrollHeight)}`)
  requestAnimationFrame(tick)
}
