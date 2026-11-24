export * as ItsmStore from "./store.js"

import type { StorageDomain } from "@aicraft/plugin/promise/storage"
import { Option, Schema } from "effect"
import {
  Account,
  Answers,
  PrepareRequest,
  Run,
  ServiceCatalog,
  Settings,
  Template,
} from "./contract.js"
import { builtins } from "./templates.js"

/** 这些 helpers 只用到的存储切片；测试里一个普通对象就能满足。 */
export type Storage = Pick<StorageDomain, "get" | "set" | "remove" | "scan">

export const DEFAULT_SETTINGS: Settings = { askSaveDefaults: true, portalUrl: "" }

export const DEFAULT_KEEP_RUNS = 200

const accountKey = (id: string) => `account/${encodeURIComponent(id)}`
const templateKey = (id: string) => `template/${encodeURIComponent(id)}`
const answersKey = (templateId: string) => `answers/${encodeURIComponent(templateId)}`
const runKey = (id: string) => `run/${encodeURIComponent(id)}`
const pendingKey = (id: string) => `pending/${encodeURIComponent(id)}`
const CATALOG_KEY = "catalog"
const SETTINGS_KEY = "settings"

const decodeAccount = Schema.decodeUnknownOption(Account)
const decodeTemplate = Schema.decodeUnknownOption(Template)
const decodeAnswers = Schema.decodeUnknownOption(Answers)
const decodeRun = Schema.decodeUnknownOption(Run)
const decodePending = Schema.decodeUnknownOption(PrepareRequest)
const decodeCatalog = Schema.decodeUnknownOption(ServiceCatalog)
const decodeSettings = Schema.decodeUnknownOption(Settings)

function newID(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export const newAccountID = () => newID("acc")
export const newRunID = () => newID("run")
export const newRequestID = () => newID("req")
export const newTemplateID = () => newID("tpl")

/** 读一个前缀下的全部条目，按 key 升序；解不出来的值跳过，一条坏写入不能藏住其他数据。 */
async function readAll<T>(
  storage: Storage,
  prefix: string,
  decode: (value: unknown) => Option.Option<T>,
  limit = 2_000,
) {
  const items: T[] = []
  let after: string | undefined
  while (items.length < limit) {
    const page = await storage.scan({ prefix, limit: Math.min(200, limit - items.length), ...(after === undefined ? {} : { after }) })
    for (const entry of page.entries) {
      const decoded = decode(entry.value)
      if (Option.isSome(decoded)) items.push(decoded.value)
    }
    if (page.next === undefined || page.next === after) break
    after = page.next
  }
  return items
}

export async function readSettings(storage: Storage): Promise<Settings> {
  const value = await storage.get("settings")
  if (value === undefined) return DEFAULT_SETTINGS
  const decoded = decodeSettings(value)
  return Option.isSome(decoded) ? decoded.value : DEFAULT_SETTINGS
}

export async function saveSettings(storage: Storage, settings: Settings) {
  await storage.set(SETTINGS_KEY, settings)
  return settings
}

export async function readAccounts(storage: Storage) {
  const accounts = await readAll(storage, "account/", decodeAccount)
  return accounts.sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : a.lastUsedAt > b.lastUsedAt ? -1 : 0))
}

export async function saveAccount(storage: Storage, account: Account) {
  await storage.set(accountKey(account.id), account)
  return account
}

export async function removeAccount(storage: Storage, id: string) {
  await storage.remove(accountKey(id))
}

/**
 * 模板列表：先补齐内置模板（只补缺失的，不覆盖用户改过的），再读全部。内置模板带固定 id，升级时新增的
 * 内置模板会自动出现，用户删除过的内置模板也不会被反复塞回来（删除时写入 `builtin/<id>` 墓碑）。
 */
export async function readTemplates(storage: Storage) {
  const templates = await readAll(storage, "template/", decodeTemplate)
  return templates.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

export async function seedTemplates(storage: Storage) {
  for (const template of builtins) {
    const existing = await storage.get(templateKey(template.id))
    if (existing !== undefined) continue
    await storage.set(templateKey(template.id), template)
  }
}

export async function saveTemplate(storage: Storage, template: Template) {
  await storage.set(templateKey(template.id), template)
  return template
}

export async function removeTemplate(storage: Storage, id: string) {
  await storage.remove(templateKey(id))
}

export async function readCatalog(storage: Storage): Promise<ServiceCatalog | null> {
  const value = await storage.get(CATALOG_KEY)
  if (value === undefined) return null
  const decoded = decodeCatalog(value)
  return Option.isSome(decoded) ? decoded.value : null
}

export async function saveCatalog(storage: Storage, catalog: ServiceCatalog) {
  await storage.set(CATALOG_KEY, catalog)
  return catalog
}

export async function readAnswers(storage: Storage) {
  return readAll(storage, "answers/", decodeAnswers)
}

export async function saveAnswers(storage: Storage, answers: Answers) {
  await storage.set(answersKey(answers.templateId), answers)
  return answers
}

/** 历史按开始时间倒序，最多 `keep` 条；写入后把超出的旧记录删掉。 */
export async function readRuns(storage: Storage) {
  const runs = await readAll(storage, "run/", decodeRun)
  return runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
}

export async function recordRun(storage: Storage, run: Run, keep = DEFAULT_KEEP_RUNS) {
  await storage.set(runKey(run.id), run)
  const runs = await readRuns(storage)
  const excess = runs.slice(Math.max(1, keep))
  for (const stale of excess) await storage.remove(runKey(stale.id))
  return run
}

export async function removeRun(storage: Storage, id: string) {
  await storage.remove(runKey(id))
}

export async function clearRuns(storage: Storage) {
  const runs = await readRuns(storage)
  for (const run of runs) await storage.remove(runKey(run.id))
  return runs.length
}

export async function readPending(storage: Storage) {
  const pending = await readAll(storage, "pending/", decodePending)
  return pending.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
}

export async function savePending(storage: Storage, request: PrepareRequest) {
  await storage.set(pendingKey(request.id), request)
  return request
}

export async function claimPending(storage: Storage, id: string) {
  const value = await storage.get(pendingKey(id))
  if (value === undefined) return null
  const decoded = decodePending(value)
  if (Option.isNone(decoded) || decoded.value.status !== "pending") return null
  const next: PrepareRequest = { ...decoded.value, status: "claimed" }
  await storage.set(pendingKey(id), next)
  return next
}

export async function finishPending(storage: Storage, id: string, runId?: string) {
  const value = await storage.get(pendingKey(id))
  if (value === undefined) return false
  const decoded = decodePending(value)
  if (Option.isNone(decoded)) return false
  const next: PrepareRequest = { ...decoded.value, status: "finished", ...(runId ? { runId } : {}) }
  await storage.set(pendingKey(id), next)
  return true
}

/** 读一次给工作台用的全量快照。 */
export async function snapshot(storage: Storage, keep = DEFAULT_KEEP_RUNS) {
  await seedTemplates(storage)
  const [accounts, templates, catalog, answers, runs, pending, settings] = await Promise.all([
    readAccounts(storage),
    readTemplates(storage),
    readCatalog(storage),
    readAnswers(storage),
    readRuns(storage),
    readPending(storage),
    readSettings(storage),
  ])
  return { accounts, templates, catalog, answers, runs: runs.slice(0, keep), pending: pending.filter((item) => item.status !== "finished"), settings }
}
