import type { FileSystem } from "@aicraft/core/filesystem"
import { Bus } from "@aicraft/core/bus"
import { Image } from "@aicraft/core/image"
import { LocationServiceMap } from "@aicraft/core/location-service-map"
import type { LocationServices } from "@aicraft/core/location-services"
import { Plugin } from "@aicraft/core/plugin"
import { PluginHooks } from "@aicraft/core/plugin/hooks"
import { Skill } from "@aicraft/core/skill"
import type { Location } from "@aicraft/schema/location"
import { makeGlobalNode } from "@aicraft/util/effect/app-node"
import { LayerNode } from "@aicraft/util/effect/layer-node"
import { Effect, Layer, LayerMap } from "effect"

// Plain-prompt unit fixtures use virtual directories.
export const promptLocationNode = makeGlobalNode({
  service: LocationServiceMap.Service,
  layer: Layer.effect(
    LocationServiceMap.Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      return yield* LayerMap.make(
        (_ref: Location.Ref) =>
          LayerNode.compile(LayerNode.group([PluginHooks.node, Image.node, Skill.node, Plugin.node]), {
            replacements: [
              Bus.node.replace(Layer.succeed(Bus.Service, bus)),
              Plugin.node.replace(Layer.mock(Plugin.Service, { awaitActivation: Effect.void })),
            ],
          }) as unknown as Layer.Layer<LocationServices, FileSystem.DirectoryNotFoundError>,
      )
    }),
  ),
  deps: [Bus.node],
})
