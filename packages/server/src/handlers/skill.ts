import { Skill } from "@opencode/core/skill"
import { SkillLocal } from "@opencode/core/skill/local"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { response } from "../location"

export const SkillHandler = HttpApiBuilder.group(Api, "server.skill", (handlers) =>
  handlers
    .handle("skill.list", () => response(Skill.Service.use((skill) => skill.list())))
    .handle("skill.local", () =>
      Effect.gen(function* () {
        const global = yield* Global.Service
        const skills = yield* Effect.promise(() => SkillLocal.list({ home: global.home }))
        return yield* response(Effect.succeed(skills))
      }),
    ),
)
