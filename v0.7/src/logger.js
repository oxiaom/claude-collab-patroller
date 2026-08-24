// logger.js — structured JSON logging for v0.7 daemon
//
// 输出: stdout (for PM2/systemd capture) + 可选 file
// 格式: JSON 一行一 record (便于 log aggregation)

const fs = require('fs')
const path = require('path')

let currentLevel = 'info'
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }

function setLogLevel(level) {
  if (LEVELS[level] !== undefined) {
    currentLevel = level
  }
}

function shouldLog(level) {
  return LEVELS[level] <= LEVELS[currentLevel]
}

function format(level, event, fields) {
  return {
    ts: new Date().toISOString(),
    level,
    event,
    pid: process.pid,
    ...fields,
  }
}

function emit(level, event, fields = {}) {
  if (!shouldLog(level)) return

  const config = require('./config').logging
  const record = format(level, event, fields)

  // stdout (always)
  if (config.destination === 'stdout' || config.destination === 'both') {
    process.stdout.write(JSON.stringify(record) + '\n')
  }

  // file (configurable)
  if (config.destination === 'file' || config.destination === 'both') {
    try {
      const dir = path.dirname(config.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.appendFileSync(config.filePath, JSON.stringify(record) + '\n')
    } catch (e) {
      // Don't let logging errors crash daemon
      process.stderr.write(`log-write-failed: ${e.message}\n`)
    }
  }
}

module.exports = {
  error: (event, fields) => emit('error', event, fields),
  warn: (event, fields) => emit('warn', event, fields),
  info: (event, fields) => emit('info', event, fields),
  debug: (event, fields) => emit('debug', event, fields),
  setLogLevel,
}