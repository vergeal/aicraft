// A shared dump fixture. Every feature that adds a section or derives a summary validates against the
// same document, so shapes stay comparable across modules instead of each one inventing its own sample.

import type { DiagnosticsDocument, DiagnosticsEvent } from "../src/types"

const timeOrigin = 1_700_000_000_000

function event(t: number, type: string, data: unknown): DiagnosticsEvent {
  return { t, wall: Math.round(timeOrigin + t), type, data }
}

export function makeDumpFixture(overrides: Partial<DiagnosticsDocument> = {}): DiagnosticsDocument {
  return {
    schema: "opencode.diagnostics.v2",
    generatedAt: "2023-11-14T22:13:21.000Z",
    timeOrigin,
    capture: {
      windowSeconds: 60,
      events: 8,
      dropped: 2,
      startedAt: "2023-11-14T22:12:21.000Z",
      sources: [
        { name: "navigation", observed: 2, recorded: 1, dropped: 0 },
        { name: "dom", observed: 12, recorded: 1, dropped: 0 },
        { name: "input", observed: 5, recorded: 2, dropped: 0 },
        { name: "errors", observed: 1, recorded: 1, dropped: 0 },
        { name: "network", observed: 3, recorded: 2, dropped: 0 },
        { name: "performance", observed: 240, recorded: 1, dropped: 1 },
        { name: "layout", observed: 80, recorded: 1, dropped: 1 },
      ],
    },
    environment: {
      url: "opencode://session/ses_fixture",
      route: "/session/ses_fixture",
      sessionID: "ses_fixture",
      theme: "dark",
      dpr: 2,
      clock: { timeOrigin, offsetMs: 12.5 },
    },
    metrics: {
      fps: 48,
      frame: 20.8,
      p95: 31.2,
      slow: 6,
      stutters: 2,
      longTasks: 3,
      longTaskMax: 214,
      input: 48,
      cls: 0.032,
      lag: 18,
      heapUsed: 81_000_000,
      heapLimit: 4_294_967_296,
      nodes: 12_840,
      viewport: "1440x900",
      trend: [60, 58, 55, 48],
    },
    events: [
      event(0, "session.start", { route: "/session/ses_fixture" }),
      event(1_200, "input.click", { target: "button[data-slot=action]", x: 640, y: 480 }),
      event(1_260, "dom", {
        mutations: [{ kind: "childList", target: "div[data-slot=timeline]", added: ["div.timeline"], removed: [] }],
      }),
      event(1_281, "scroll", { target: "div[data-slot=timeline]", top: 0, left: 0, height: 4820 }),
      event(1_400, "network", { method: "GET", url: "/api/session/ses_fixture/message", status: 200, ms: 86 }),
      event(2_000, "perf", { fps: 48, frame: 20.8, p95: 31.2, slow: 6, stutters: 2, longTasks: 3, cls: 0.032 }),
      event(2_140, "layout.shift", { value: 0.032, sources: ["div[data-slot=composer]"] }),
      event(2_200, "network.error", { method: "POST", url: "/api/session/ses_fixture/prompt", status: 500, ms: 1_240, ok: false }),
      event(2_240, "error", { message: "TypeError: cannot read properties of undefined", stack: ["at Composer.render"] }),
    ],
    dom: { html: "<html><body><div data-slot=\"timeline\"></div></body></html>", truncated: false, nodes: 12_840 },
    sections: {
      main: { ipc: [{ channel: "AppWriteDiagnostics", ms: 3 }], logs: [{ level: "error", message: "sidecar exited" }] },
      server: { spans: [{ name: "Session.prompt", ms: 1_180, status: "error" }], slowQueries: [{ sql: "SELECT ...", ms: 240 }] },
      state: { session: { id: "ses_fixture", messageCount: 12 }, composer: { text: "", attachments: 0 } },
    },
    notes: ["fixture"],
    ...overrides,
  }
}
