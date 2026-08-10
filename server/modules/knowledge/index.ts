import { Router } from 'express'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function registerModuleRoutes(mainRouter: Router) {
  const modulesDir = resolve(__dirname, '..')
  if (!existsSync(modulesDir)) return

  const fs = require('fs')
  const entries = fs.readdirSync(modulesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const routePath = resolve(modulesDir, entry.name, 'routes', 'index.ts')
    const routeJsPath = resolve(modulesDir, entry.name, 'routes', 'index.js')
    if (existsSync(routePath) || existsSync(routeJsPath)) {
      import(`../modules/${entry.name}/routes/index.js`).then(mod => {
        mainRouter.use(`/knowledge`, mod.default)
      }).catch(() => {
        // silent
      })
    }
  }
}