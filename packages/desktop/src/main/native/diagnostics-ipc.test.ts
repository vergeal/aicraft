import { beforeEach, describe, expect, it } from "bun:test"
import type { RpcMessage } from "effect/rpc"
import { ipcDiagnostics } from "./diagnostics-ipc"

// The transport reports these boundaries; the tests speak the same encoded wire messages, so they
// cover the pairing rules without constructing the transport.
// SAFETY: these are the RPC wire format's plain encoded messages, which the tests post as is.
/* oxlint-disable anti-slop-effect/no-manual-tagged-construction -- see SAFETY above */

function request(id: number, tag: string): RpcMessage.RequestEncoded {
  return { _tag: "Request", id, tag, payload: null, headers: [] }
}

function failed(requestId: number): RpcMessage.ResponseExitEncoded {
  return { _tag: "Exit", requestId, exit: { _tag: "Failure", cause: [{ _tag: "Interrupt", fiberId: 0 }] } }
}

function succeeded(requestId: number): RpcMessage.ResponseExitEncoded {
  return { _tag: "Exit", requestId, exit: { _tag: "Success", value: null } }
}

beforeEach(() => {
  ipcDiagnostics.start()
  ipcDiagnostics.clear()
})

describe("ipcDiagnostics", () => {
  it("keeps a failed reply and reports the channel and outcome", () => {
    ipcDiagnostics.request(1, request(7, "AppReadDiagnosticsMain"))
    ipcDiagnostics.response(1, failed(7))

    const snapshot = ipcDiagnostics.snapshot()

    expect(snapshot.samples).toHaveLength(1)
    expect(snapshot.samples[0]).toMatchObject({ channel: "AppReadDiagnosticsMain", failed: true })
    expect(snapshot).toMatchObject({ observed: 1, recorded: 1, dropped: 0, pending: 0 })
  })

  it("counts a fast successful reply without keeping it", () => {
    ipcDiagnostics.request(1, request(0, "AppGetSpellcheckEnabled"))
    ipcDiagnostics.response(1, succeeded(0))

    expect(ipcDiagnostics.snapshot()).toMatchObject({ observed: 1, recorded: 0, pending: 0, samples: [] })
  })

  it("keeps a successful reply that took longer than the threshold", async () => {
    ipcDiagnostics.request(1, request(0, "StorageItems"))
    await Bun.sleep(10)
    ipcDiagnostics.response(1, succeeded(0))

    const snapshot = ipcDiagnostics.snapshot()

    expect(snapshot.samples).toHaveLength(1)
    expect(snapshot.samples[0]).toMatchObject({ channel: "StorageItems", failed: false })
    expect(snapshot.samples[0]?.ms).toBeGreaterThan(5)
  })

  it("pairs by client as well as request id, because renderer ids restart per window", () => {
    ipcDiagnostics.request(1, request(0, "WindowGetFocused"))
    ipcDiagnostics.request(2, request(0, "WindowGetFullscreen"))
    ipcDiagnostics.response(2, failed(0))

    expect(ipcDiagnostics.snapshot().samples[0]).toMatchObject({ channel: "WindowGetFullscreen", failed: true })

    ipcDiagnostics.response(1, succeeded(0))

    expect(ipcDiagnostics.snapshot()).toMatchObject({ observed: 2, recorded: 1, pending: 0 })
  })

  it("drops what was pending for a client whose protocol defect ends it", () => {
    ipcDiagnostics.request(3, request(0, "StorageItems"))
    ipcDiagnostics.response(3, { _tag: "Defect", defect: "renderer vanished" })

    expect(ipcDiagnostics.snapshot().pending).toBe(0)
  })

  it("ignores notifications, which never get a reply", () => {
    ipcDiagnostics.request(1, { ...request(0, "MenuCommandTriggered"), isNotification: true })

    expect(ipcDiagnostics.snapshot()).toMatchObject({ observed: 0, recorded: 0, pending: 0 })
  })
})
/* oxlint-enable anti-slop-effect/no-manual-tagged-construction */
