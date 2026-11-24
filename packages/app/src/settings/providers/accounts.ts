import type { ConnectionInfo, IntegrationInfo } from "@aicraft/client/promise"

export type ProviderAccount = Extract<ConnectionInfo, { type: "credential" }>

export function providerAccounts(integration: IntegrationInfo | undefined) {
  return integration?.connections.filter((connection): connection is ProviderAccount => connection.type === "credential") ?? []
}

// Connections do not say which account is in use; only the credential list answers that. Until it answers, no account
// is marked active: a checkmark on a guess is worse than none, and a RadioGroup value nobody verified selects nothing.
export function activeProviderAccount(
  integration: IntegrationInfo | undefined,
  isActive?: (credentialID: string) => boolean | undefined,
) {
  return providerAccounts(integration).find((account) => isActive?.(account.id) === true)
}
