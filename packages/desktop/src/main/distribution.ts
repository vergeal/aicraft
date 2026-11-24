import { cp, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { app } from "electron"

// The plugins and skills packed beside the bundled CLI (resources/distribution). A production
// install copies them into the user's discover root on launch; files that already exist win, so a
// user's own copy or a newer installed version is never replaced.
let installing: Promise<void> | undefined

export function installBundledDistribution() {
  installing ??= install()
  return installing
}

async function install() {
  if (!app.isPackaged) return

  const source = path.join(process.resourcesPath, "distribution")

  if (!(await isDirectory(source))) return

  // The server reads its discover root from Global.home.
  const target = path.join(process.env.OPENCODE_TEST_HOME ?? homedir(), ".distribution")
  const marker = path.join(target, `.bundled-${app.getVersion()}`)

  if (await Bun.file(marker).exists()) return

  await cp(source, target, { recursive: true, force: false, errorOnExist: false })
  await Bun.write(marker, "")
}

async function isDirectory(target: string) {
  return stat(target).then(
    (info) => info.isDirectory(),
    () => false,
  )
}
