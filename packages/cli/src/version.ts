import { Option, Schema } from "effect"

declare const AICRAFT_VERSION: string
declare const AICRAFT_CHANNEL: string
declare const AICRAFT_ARTIFACT: string
declare const AICRAFT_RELEASE_HIGHLIGHTS: string

const version = typeof AICRAFT_VERSION === "string" ? AICRAFT_VERSION : "local"
const channel = typeof AICRAFT_CHANNEL === "string" ? AICRAFT_CHANNEL : "local"
const artifact = typeof AICRAFT_ARTIFACT === "string" ? AICRAFT_ARTIFACT : "cli"
// Stable release builds embed the release notes' Highlights; every other build has none.
const highlights =
  typeof AICRAFT_RELEASE_HIGHLIGHTS === "string"
    ? Option.getOrElse(
        Schema.decodeUnknownOption(
          Schema.fromJsonString(Schema.Array(Schema.Struct({ title: Schema.String, body: Schema.String }))),
        )(AICRAFT_RELEASE_HIGHLIGHTS),
        () => [],
      )
    : []

export {
  version as AICRAFT_VERSION,
  channel as AICRAFT_CHANNEL,
  artifact as AICRAFT_ARTIFACT,
  highlights as AICRAFT_HIGHLIGHTS,
}
export const AICRAFT_LOCAL = channel === "local"
