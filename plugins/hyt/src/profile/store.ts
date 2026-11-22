import { Option, Schema } from "effect"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { HytProfile } from "./schema.js"
import { HytProfile as HytProfileSchema, defaultProfile } from "./schema.js"

/**
 * 档案存储：<plugin data>/hyt/profile.json，原子替换写入。
 * 读取只解码、不回写：文件缺失或损坏时返回调用方给的 fallback，原文件保持原样，方便人工修复。
 */

const decodeProfile = Schema.decodeUnknownOption(HytProfileSchema)

export function profilePath(dataDir: string) {
  return join(dataDir, "hyt", "profile.json")
}

export async function loadProfile(dataDir: string, fallback: HytProfile = defaultProfile("")): Promise<HytProfile> {
  const file = Bun.file(profilePath(dataDir))
  if (!(await file.exists())) return fallback
  const parsed = await file.json().catch(() => undefined)
  const decoded = decodeProfile(parsed)
  return Option.isSome(decoded) ? decoded.value : fallback
}

/** 写入前按契约解码一次；更新 updatedAt 为本机时间。返回实际落盘的内容。 */
export async function saveProfile(dataDir: string, profile: HytProfile, now = Date.now()): Promise<HytProfile> {
  const decoded = decodeProfile(profile)
  if (Option.isNone(decoded)) throw new Error("profile 不符合 HytProfile 契约，未写入。")
  const value: HytProfile = { ...decoded.value, updatedAt: now }
  const path = profilePath(dataDir)
  await mkdir(join(dataDir, "hyt"), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8")
  await rename(temporary, path)
  return value
}

/** 引导是否完成；没有档案（首次安装）视为未完成。 */
export function isOnboarded(profile: HytProfile | undefined) {
  return profile?.onboarding.completed === true
}
