// ============================================
// Express 入口：API + 生产环境托管前端静态文件
// 启动：npm run server（开发热重载）或 node --import tsx server/index.ts
// ============================================
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initSchema } from './db'
import { apiRouter } from './routes'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 建表（幂等）
initSchema()

const app = express()
app.use(express.json({ limit: '20mb' }))

// CORS：允许手机 App（Capacitor WebView 源）跨域访问本服务
// 单用户个人应用，回显任意 Origin 可接受（数据仍需 token）
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
  }
  next()
})

// API
app.use('/api', apiRouter)

// 生产环境：托管前端构建产物 + SPA 回退
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(distDir, 'index.html'))
  } else {
    next()
  }
})

const PORT = Number(process.env.PORT) || 3001
app.listen(PORT, () => {
  console.log(`[server] 财务规划助手后端已启动: http://localhost:${PORT}`)
  console.log('[server] 数据库文件: server/data/finance.db')
})
