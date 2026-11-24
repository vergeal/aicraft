export * as AicraftWorkerd from "./workerd"

import { Layer } from "effect"
import type { Config, Scope } from "effect"
import { WorkerdProfile } from "../internal/workerd"
import { Aicraft } from "./aicraft"

export type Configuration = WorkerdProfile.Configuration

export interface CreateOptions<R = never> extends WorkerdProfile.Options {
  readonly log?: Aicraft.CreateOptions["log"]
  readonly plugins?: Aicraft.CreateOptions["plugins"]
  readonly workspaceProviders?: Aicraft.CreateOptions["workspaceProviders"]
  readonly instances?: Aicraft.CreateOptions<R>["instances"]
}

export const create = <R = never>({ log, plugins, workspaceProviders, instances, ...options }: CreateOptions<R>) => {
  const profile = WorkerdProfile.make(options)
  return Aicraft.create(
    { ...profile.options, log, plugins, workspaceProviders, instances },
    { overrides: profile.replacements },
  )
}

export const layer = <R = never>(
  options: CreateOptions<R>,
): Layer.Layer<Aicraft.Service, Config.ConfigError | Error, Exclude<R, Scope.Scope>> =>
  Layer.effect(Aicraft.Service, create(options))

export type Interface = Aicraft.Interface
export type Requirements = Scope.Scope
