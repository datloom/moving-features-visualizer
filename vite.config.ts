import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { cpSync, readFile } from 'node:fs'
import { extname, join, normalize, relative, sep } from 'node:path'

const cesiumSource = join(process.cwd(), 'node_modules/cesium/Build/Cesium')
const cesiumBaseUrl = '/cesium'
const cesiumAssetDirectories = ['Assets', 'ThirdParty', 'Widgets', 'Workers']

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
}

const cesiumAssets = (): Plugin => ({
  name: 'cesium-assets',
  configureServer: (server) => {
    server.middlewares.use(cesiumBaseUrl, (request, response, next) => {
      const requestPath = decodeURIComponent(request.url?.split('?')[0] ?? '/')
      const filePath = normalize(join(cesiumSource, requestPath))
      const relativePath = relative(cesiumSource, filePath)

      if (relativePath.startsWith(`..${sep}`) || relativePath === '..') {
        response.statusCode = 403
        response.end()
        return
      }

      readFile(filePath, (error, contents) => {
        if (error) {
          next()
          return
        }

        response.setHeader(
          'Content-Type',
          contentTypes[extname(filePath).toLowerCase()] ??
            'application/octet-stream',
        )
        response.end(contents)
      })
    })
  },
  writeBundle: (options) => {
    const outputDirectory = options.dir ?? 'dist'

    for (const directory of cesiumAssetDirectories) {
      cpSync(
        join(cesiumSource, directory),
        join(outputDirectory, cesiumBaseUrl, directory),
        { recursive: true },
      )
    }
  },
})

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(cesiumBaseUrl),
  },
  plugins: [react(), cesiumAssets()],
})
