import { Agent } from "@aicraft/core/agent"
import { Artifact } from "@aicraft/core/artifact"
import { AISDK } from "@aicraft/core/aisdk"
import { Command } from "@aicraft/core/command"
import { Config } from "@aicraft/core/config"
import { Credential } from "@aicraft/core/credential"
import { Database } from "@aicraft/core/database/database"
import { Environment } from "@aicraft/core/environment/index"
import { FileAccess } from "@aicraft/core/file-access"
import { LayerNodePlatform } from "@aicraft/util/effect/app-node-platform"
import { AppProcess } from "@aicraft/util/process"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Bus } from "@aicraft/core/bus"
import { FileSystem } from "@aicraft/core/filesystem"
import { FSUtil } from "@aicraft/util/fs-util"
import { Global } from "@aicraft/util/global"
import { Form } from "@aicraft/core/form"
import { Generate } from "@aicraft/core/generate"
import { Git } from "@aicraft/core/git"
import { InstructionDiscovery } from "@aicraft/core/instruction-discovery"
import { Integration } from "@aicraft/core/integration"
import { Job } from "@aicraft/core/job"
import { KV } from "@aicraft/core/kv"
import { Location } from "@aicraft/core/location"
import { Mcp } from "@aicraft/core/mcp/index"
import { Model } from "@aicraft/core/model"
import { Npm } from "@aicraft/util/npm"
import { Plugin } from "@aicraft/core/plugin"
import { PluginHooks } from "@aicraft/core/plugin/hooks"
import { Provider } from "@aicraft/core/provider"
import { Session } from "@aicraft/core/session"
import { SharedCache } from "@aicraft/core/shared-cache"
import { InstructionEntry } from "@aicraft/core/session/instruction-entry"
import { PersistentPty } from "@aicraft/core/persistent-pty"
import { LocationServiceMap } from "@aicraft/core/location-service-map"
import { AppNodeBuilder } from "@aicraft/core/effect/app-node-builder"
import { Permission } from "@aicraft/core/permission"
import { Reference } from "@aicraft/core/reference"
import { Rpc } from "@aicraft/core/rpc"
import { Skill } from "@aicraft/core/skill"
import { SkillDiscovery } from "@aicraft/core/skill/discovery"
import { Watcher } from "@aicraft/core/filesystem/watcher"
import { Tool } from "@aicraft/core/tool"
import { Vcs } from "@aicraft/core/vcs"
import { WebSearch } from "@aicraft/core/websearch"
import { Worktree } from "@aicraft/core/worktree"
import { WorktreeStrategies } from "@aicraft/core/worktree/strategies"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"
import { emptyMcpLayer } from "../fixture/mcp"
import { offlineModels } from "../fixture/models"

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: (name) => Effect.succeed({ directory: "", name }),
    resolve: (name) => Effect.succeed({ directory: "", name }),
    check: () => Effect.succeed(false),
    update: (name) => Effect.succeed({ directory: "", name }),
    which: () => Effect.undefined,
  }),
)

const generateLayer = Layer.succeed(
  Generate.Service,
  Generate.Service.of({
    text: () => Effect.succeed(""),
    image: () => Effect.die("unused"),
    decisions: () => Effect.die("unused"),
  }),
)

const configLayer = Config.testLayer()

const permissionLayer = Layer.succeed(
  Permission.Service,
  Permission.Service.of({
    close: Effect.void,
    ask: (input) => Effect.succeed({ id: input.id ?? Permission.ID.create(), effect: "ask" }),
    assert: () => Effect.void,
    assertNotDenied: () => Effect.void,
    allows: () => Effect.succeed(false),
    reply: () => Effect.void,
    get: () => Effect.succeed(undefined),
    forSession: () => Effect.succeed([]),
    list: () => Effect.succeed([]),
  }),
)

export const makePluginTestLayer = (permission = permissionLayer, generate = generateLayer, mcp = emptyMcpLayer) =>
  AppNodeBuilder.build(
    LayerNode.group([
      AppProcess.node,
      FileSystem.node,
      FSUtil.node,
      Location.node,
      Npm.node,
      Credential.node,
      Config.node,
      Database.node,
      Environment.node,
      FileAccess.node,
      Global.node,
      Bus.node,
      Form.node,
      Generate.node,
      Git.node,
      LayerNodePlatform.httpClient,
      Plugin.node,
      Agent.node,
      Artifact.node,
      AISDK.node,
      Provider.node,
      Model.node,
      Command.node,
      InstructionDiscovery.node,
      Integration.node,
      Job.node,
      KV.node,
      Mcp.node,
      Session.node,
      SharedCache.node,
      InstructionEntry.node,
      PersistentPty.node,
      LocationServiceMap.node,
      Permission.node,
      PluginHooks.node,
      Reference.node,
      Rpc.node,
      Skill.node,
      SkillDiscovery.node,
      Tool.node,
      Vcs.node,
      Watcher.node,
      WebSearch.node,
      Worktree.node,
      WorktreeStrategies.node,
    ]),
    [
      Location.node.replace(tempLocationLayer),
      Npm.node.replace(npmLayer),
      Config.node.replace(configLayer),
      Mcp.node.replace(mcp),
      Generate.node.replace(generate),
      Permission.node.replace(permission),
      offlineModels,
    ],
  ).pipe(Layer.provideMerge(configLayer))

export const PluginTestLayer = makePluginTestLayer()
