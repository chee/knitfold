// pnpm dev: knitfold built once (the site mounts its dist), then rebuilt as
// it changes, beside the site's dev server
import {spawn, spawnSync} from "node:child_process"

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
const first = spawnSync(pnpm, ["--filter", "knitfold", "build"], {stdio: "inherit"})
if (first.status) process.exit(first.status)

const children = [
	spawn(pnpm, ["--filter", "knitfold", "exec", "vite", "build", "--watch"], {stdio: "inherit"}),
	spawn(pnpm, ["exec", "vite", ...process.argv.slice(2)], {stdio: "inherit"}),
]
const stop = () => children.forEach(child => child.kill())
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
children.forEach(child => child.on("exit", code => (stop(), process.exit(code ?? 0))))
