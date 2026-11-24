import fuzzysort from "fuzzysort"
import type { WslInstalledDistro, WslOnlineDistro, WslAicraftCheck, WslServersState } from "./contract"

export type AddServerText = {
  key: string
  params?: Record<string, string>
}

type DistroStatusTone = "success" | "warning" | "muted"

export type DistroStatus = {
  label: AddServerText
  tone: DistroStatusTone
}

export type AddServerPrimaryButton = {
  variant: "neutral" | "contrast"
  label: AddServerText
  disabled: boolean
  action: "install-aicraft" | "add" | null
  loading: boolean
  width: string | null
}

export type AddServerRuntimeState = "loading" | "pendingRestart" | "checking" | "unavailable" | "ready"

export type AddableProbePlan = {
  key: string
  distros: string[]
}

type AutoProbePlan = { key: "runtime"; action: "probeRuntime" } | { key: "distros"; action: "refreshDistros" }

export type AddServerProbePlan =
  | { kind: "auto"; key: string; plan: AutoProbePlan }
  | { kind: "addable"; key: string; plan: AddableProbePlan }

export type WslAddServerView = "main" | "catalog"

function isHiddenDistro(name: string) {
  return /^docker-desktop(?:-data)?$/i.test(name)
}

// Jobs the add dialog waits for: WSL itself, and distros it lists, which have no server yet. Jobs on added servers
// belong to their rows.
function dialogJobRunning(state: WslServersState) {
  if (state.hostJob === "busy") return true

  return Object.keys(state.distroJobs).some((distro) => !state.servers.some((item) => item.config.distro === distro))
}

function wslDistroReady(state: WslServersState | undefined, name: string) {
  const installed = state?.installed.find((item) => item.name === name)
  const probe = state?.distroProbes[name]

  if (!probe || !installed) return false

  if (installed.version === 1) return false

  return probe.canExecute && probe.hasBash && probe.hasCurl
}

export function addServerViewModel(input: {
  state: WslServersState | undefined
  view: WslAddServerView
  selectedDistro: string | null
  catalogSearch: string
  catalogTarget: string | null
  adding: boolean
  probingAddable: boolean
}) {
  const state = input.state
  const visibleInstalledDistros = (state?.installed ?? []).filter((item) => !isHiddenDistro(item.name))
  const visibleOnlineDistros = (state?.online ?? []).filter((item) => !isHiddenDistro(item.name))
  const existingServerDistros = new Set((state?.servers ?? []).map((item) => item.config.distro))
  const addableInstalledDistros = visibleInstalledDistros.filter((item) => !existingServerDistros.has(item.name))
  const selectedDistro = addServerSelectedDistro(input.selectedDistro, visibleInstalledDistros, addableInstalledDistros)
  const aicraftCheck = selectedDistro ? (state?.aicraftChecks[selectedDistro] ?? null) : null
  const installableDistros = addServerInstallableDistros(visibleInstalledDistros, visibleOnlineDistros)
  const filteredInstallableDistros = addServerFilteredInstallableDistros(installableDistros, input.catalogSearch)
  const catalogTarget = addServerCatalogTarget(input.catalogTarget, filteredInstallableDistros)
  const busy = (!!state && dialogJobRunning(state)) || input.adding || input.probingAddable

  return {
    busy,
    runtimeState: addServerRuntimeState(state),
    visibleInstalledDistros,
    visibleOnlineDistros,
    addableInstalledDistros,
    selectedDistro,
    aicraftCheck,
    wslReady: !!state?.runtime?.available && !state?.pendingRestart,
    distroStatuses: Object.fromEntries(
      addableInstalledDistros.flatMap((item) => {
        const status = addServerDistroStatus({ state, name: item.name, probingAddable: input.probingAddable })

        if (!status) return []

        return [[item.name, status] as const]
      }),
    ),
    primaryButton: addServerPrimaryButton({
      state,
      selectedDistro,
      aicraftCheck,
      adding: input.adding,
      probingAddable: input.probingAddable,
    }),
    installableDistros,
    filteredInstallableDistros,
    catalogTarget,
    installingCatalogDistro: Object.values(state?.distroJobs ?? {}).includes("installing"),
  }
}

function addServerSelectedDistro(
  selected: string | null,
  visibleInstalledDistros: WslInstalledDistro[],
  addableInstalledDistros: WslInstalledDistro[],
) {
  if (selected && addableInstalledDistros.some((item) => item.name === selected && item.version !== 1)) return selected
  const defaultDistro = visibleInstalledDistros.find((item) => item.isDefault)

  if (
    defaultDistro &&
    defaultDistro.version !== 1 &&
    addableInstalledDistros.some((item) => item.name === defaultDistro.name)
  ) {
    return defaultDistro.name
  }

  return addableInstalledDistros.find((item) => item.version !== 1)?.name ?? null
}

function addServerRuntimeState(state: WslServersState | undefined): AddServerRuntimeState {
  if (!state) return "loading"

  if (state.pendingRestart) return "pendingRestart"

  if (!state.runtime) return "checking"

  if (!state.runtime.available) return "unavailable"

  return "ready"
}

function addServerDistroStatus(input: {
  state: WslServersState | undefined
  name: string
  probingAddable: boolean
}): DistroStatus | undefined {
  const installed = input.state?.installed.find((item) => item.name === input.name)

  if (installed?.version === 1) return { label: { key: "onboarding.distroStatus.unsupported" }, tone: "muted" }
  const probing = input.probingAddable || input.state?.distroJobs[input.name] === "probing"
  const probe = input.state?.distroProbes[input.name]

  if (!probe) return probing ? checkingStatus() : undefined

  if (!probe.canExecute) {
    if (!installed) {
      return { label: { key: "onboarding.distroNotInstalled", params: { distro: input.name } }, tone: "warning" }
    }

    return { label: { key: "onboarding.openDistroOnce", params: { distro: input.name } }, tone: "warning" }
  }

  if (!probe.hasBash || !probe.hasCurl) {
    return { label: { key: "onboarding.distroStatus.missingTools" }, tone: "warning" }
  }

  const check = input.state?.aicraftChecks[input.name]

  if (!check) return probing ? checkingStatus() : undefined

  if (check.matchesDesktop === false) return { label: { key: "onboarding.updateAI Craft" }, tone: "warning" }

  if (!check.resolvedPath) return { label: { key: "onboarding.distroStatus.aicraftMissing" }, tone: "warning" }

  if (check.error) return { label: { key: "onboarding.installAI Craft" }, tone: "warning" }

  return { label: { key: "onboarding.distroStatus.ready" }, tone: "success" }
}

function checkingStatus(): DistroStatus {
  return { label: { key: "onboarding.distroStatus.checking" }, tone: "muted" }
}

function addServerPrimaryButton(input: {
  state: WslServersState | undefined
  selectedDistro: string | null
  aicraftCheck: WslAicraftCheck | null
  adding: boolean
  probingAddable: boolean
}): AddServerPrimaryButton {
  const ready = !!input.selectedDistro && wslDistroReady(input.state, input.selectedDistro)
  const probingSelected = input.probingAddable && !addServerSelectedDistroSettled(input.state, input.selectedDistro)
  const job = input.selectedDistro ? input.state?.distroJobs[input.selectedDistro] : undefined
  const busy = (!!input.state && dialogJobRunning(input.state)) || input.adding
  const probingAicraft = probingSelected || (ready && (!input.aicraftCheck || job === "probing"))
  const installingAicraft = job === "updating"

  if (!ready || probingAicraft) {
    return {
      variant: "contrast",
      label: probingSelected ? { key: "onboarding.distroStatus.checking" } : { key: "server.add" },
      disabled: true,
      action: null,
      loading: probingSelected,
      width: null,
    }
  }

  if (!addServerAicraftReady(input.aicraftCheck)) {
    const update = !!input.aicraftCheck?.resolvedPath && input.aicraftCheck.matchesDesktop === false

    return {
      variant: "neutral",
      label: installingAicraft
        ? { key: "onboarding.updatingAI Craft" }
        : update
          ? { key: "onboarding.updateAI Craft" }
          : { key: "onboarding.installAI Craft" },
      disabled: busy,
      action: "install-aicraft",
      loading: installingAicraft,
      width: update ? "138px" : "129px",
    }
  }

  return {
    variant: "contrast",
    label: input.adding ? { key: "onboarding.adding" } : { key: "server.add" },
    disabled: busy,
    action: "add",
    loading: input.adding,
    width: null,
  }
}

function addServerAicraftReady(check: WslAicraftCheck | null) {
  return !!check?.resolvedPath && check.matchesDesktop !== false && !check.error
}

function addServerSelectedDistroSettled(state: WslServersState | undefined, selectedDistro: string | null) {
  if (!selectedDistro) return false
  const installed = state?.installed.find((item) => item.name === selectedDistro)

  if (installed?.version === 1) return false

  if (!state?.distroProbes[selectedDistro]) return false

  if (!wslDistroReady(state, selectedDistro)) return true

  return !!state.aicraftChecks[selectedDistro]
}

function addServerInstallableDistros(installedDistros: WslInstalledDistro[], onlineDistros: WslOnlineDistro[]) {
  const installed = new Set(installedDistros.map((item) => item.name))
  const hasVersionedUbuntu = onlineDistros.some((item) => /^Ubuntu-\d/.test(item.name))

  return onlineDistros
    .filter((item) => !installed.has(item.name))
    .filter((item) => item.name !== "Ubuntu" || !hasVersionedUbuntu)
}

function addServerFilteredInstallableDistros(installableDistros: WslOnlineDistro[], search: string) {
  const query = search.trim()

  if (!query) return installableDistros

  return fuzzysort.go(query, installableDistros, { keys: ["label", "name"] }).map((item) => item.obj)
}

function addServerCatalogTarget(target: string | null, distros: WslOnlineDistro[]) {
  if (target && distros.some((item) => item.name === target)) return target

  return distros[0]?.name ?? null
}

function addableProbePlan(input: {
  state: WslServersState | undefined
  view: WslAddServerView
  adding: boolean
  selectedDistro: string | null
  addableInstalledDistros: WslInstalledDistro[]
}) {
  const state = input.state

  if (!state?.runtime?.available || state.pendingRestart || input.view !== "main" || input.adding) return

  if (dialogJobRunning(state)) return

  const ordered = input.selectedDistro
    ? [
        ...input.addableInstalledDistros.filter((item) => item.name === input.selectedDistro),
        ...input.addableInstalledDistros.filter((item) => item.name !== input.selectedDistro),
      ]
    : input.addableInstalledDistros

  const pending = ordered.flatMap((item) => {
    if (item.version === 1) return []

    if (!state.distroProbes[item.name]) return [`distro:${item.name}`]

    if (wslDistroReady(state, item.name) && !state.aicraftChecks[item.name]) return [`aicraft:${item.name}`]

    return []
  })

  if (!pending.length) return

  return {
    key: pending.join("|"),
    distros: ordered.filter((item) => item.version !== 1).map((item) => item.name),
  } satisfies AddableProbePlan
}

function autoProbePlan(input: { state: WslServersState | undefined; busy: boolean }) {
  if (!input.state || input.busy || input.state.pendingRestart) return

  if (!input.state.runtime) return { key: "runtime", action: "probeRuntime" } satisfies AutoProbePlan

  if (!input.state.runtime.available) return

  if (input.state.installed.length || input.state.online.length) return

  return { key: "distros", action: "refreshDistros" } satisfies AutoProbePlan
}

export function addServerProbePlan(input: {
  state: WslServersState | undefined
  view: WslAddServerView
  adding: boolean
  busy: boolean
  selectedDistro: string | null
  addableInstalledDistros: WslInstalledDistro[]
}) {
  const auto = autoProbePlan({ state: input.state, busy: input.busy })

  if (auto) return { kind: "auto", key: `auto:${auto.key}`, plan: auto } satisfies AddServerProbePlan
  const addable = addableProbePlan(input)

  if (addable) return { kind: "addable", key: `addable:${addable.key}`, plan: addable } satisfies AddServerProbePlan
}

export function createProbeFailureGate() {
  let failed: string | undefined

  return {
    accepts(key: string) {
      return key !== failed
    },
    settle(key: string, succeeded: boolean) {
      if (!succeeded) failed = key
    },
    reset() {
      failed = undefined
    },
  }
}

export async function runAddableProbePlan(input: {
  plan: AddableProbePlan
  probeAddable: (distros: string[]) => Promise<void>
}) {
  await input.probeAddable(input.plan.distros)
}
