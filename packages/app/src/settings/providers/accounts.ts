import type { ConnectionInfo, IntegrationInfo } from "@opencode/client/promise"

export type ProviderAccount = Extract<ConnectionInfo, { type: "credential" }>

export function providerAccounts(integration: IntegrationInfo | undefined) {
  return integration?.connections.filter((connection): connection is ProviderAccount => connection.type === "credential") ?? []
}

// Connections do not say which account is in use; the credential list does. Without that answer, the first account
// stays the best guess and the menu still has something to select.
export function activeProviderAccount(
  integration: IntegrationInfo | undefined,
  isActive?: (credentialID: string) => boolean,
) {
  const accounts = providerAccounts(integration)

  return accounts.find((account) => isActive?.(account.id)) ?? accounts[0]
}
