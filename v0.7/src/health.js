// health.js — HTTP health + metrics endpoint for v0.7 daemon
//
// 用于 PM2/systemd/k8s liveness probe
// 简单 HTTP server, 不需要外部 deps
// Phase 2.1 加 /metrics endpoint (Prometheus text format)

const http = require('http')
const logger = require('./logger')

function createServer({ getStatus, prometheusHandler, port, host }) {
  let server = null

  return {
    async start() {
      return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
          if (req.url === '/health' || req.url === '/') {
            try {
              const status = getStatus()
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(status))
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: e.message }))
            }
          } else if (req.url === '/ready') {
            res.writeHead(200)
            res.end('ready')
          } else if (req.url === '/metrics' && prometheusHandler) {
            // Phase 2.1: Prometheus metrics endpoint
            prometheusHandler.handler(req, res)
          } else {
            res.writeHead(404)
            res.end('not found')
          }
        })

        server.on('error', reject)
        server.listen(port, host, () => {
          logger.info('health-listening', { host, port })
          resolve()
        })
      })
    },

    async stop() {
      return new Promise((resolve) => {
        if (!server) {
          resolve()
          return
        }
        server.close(() => {
          logger.info('health-stopped')
          resolve()
        })
      })
    },
  }
}

module.exports = { createServer }