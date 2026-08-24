// instance-lock.js — single-instance lock (auto-patrol v5 Lesson #428 移植)
//
// 防止 watcher 多实例 race condition (auto-patrol v4 11 重复实例事故).
// 锁文件存 JSON {pid, acquired_at}, 启动时检测:
//   - 锁存在 + PID 活着 → 拒绝启动 (return false)
//   - 锁存在 + PID 死了 → stale, 清掉重新获取
//   - 锁不存在 → 获取
// process.on('exit') 自动清理 (auto-patrol v5 Lesson #431).

const fs = require('fs')
const path = require('path')

class InstanceLock {
  /**
   * @param {string} lockPath 锁文件路径 (含 .json 后缀)
   */
  constructor(lockPath) {
    this.lockPath = lockPath
    this.acquired = false
  }

  acquire() {
    try {
      // 确保目录存在
      const dir = path.dirname(this.lockPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      if (fs.existsSync(this.lockPath)) {
        let existing
        try {
          existing = JSON.parse(fs.readFileSync(this.lockPath, 'utf-8'))
        } catch (e) {
          // 锁文件损坏, 当 stale 处理
          console.warn(`[instance-lock] lock file corrupt: ${e.message}, treating as stale`)
          fs.unlinkSync(this.lockPath)
          existing = null
        }

        if (existing && existing.pid) {
          // Windows: process.kill(pid, 0) 对 zombie PID 不一定抛错, 加双重验证 (PID + acquired_at 时长)
          let alive = false
          try {
            process.kill(existing.pid, 0)
            alive = true
          } catch (e) {
            alive = false
          }
          // 如果 lock 文件超过 5 分钟, 当 stale 处理 (watcher 正常应该每 60s 有心跳 / wake 事件)
          const lockAge = existing.acquired_at ? Date.now() - new Date(existing.acquired_at).getTime() : 0
          const lockStale = lockAge > 5 * 60 * 1000 // 5 分钟

          if (alive && !lockStale) {
            console.error(`[instance-lock] locked by PID ${existing.pid} (acquired at ${existing.acquired_at})`)
            return { acquired: false, existingPid: existing.pid, existingAcquiredAt: existing.acquired_at }
          }
          // PID 死了 或 lock 太久没活动 → stale
          console.warn(`[instance-lock] removing stale lock (PID ${existing.pid} alive=${alive} age=${Math.round(lockAge/1000)}s)`)
          fs.unlinkSync(this.lockPath)
        }
      }

      // 写入新锁
      const lockData = {
        pid: process.pid,
        acquired_at: new Date().toISOString(),
        version: '0.3.0',
      }
      fs.writeFileSync(this.lockPath, JSON.stringify(lockData, null, 2))
      this.acquired = true

      // process.on('exit') 自动清理 (Lesson #431)
      process.on('exit', () => this.release())
      process.on('SIGINT', () => { this.release(); process.exit(0) })
      process.on('SIGTERM', () => { this.release(); process.exit(0) })

      console.log(`[instance-lock] acquired (PID ${process.pid}, path=${this.lockPath})`)
      return { acquired: true, pid: process.pid }
    } catch (e) {
      console.error(`[instance-lock] acquire error: ${e.message}`)
      return { acquired: false, error: e.message }
    }
  }

  release() {
    if (!this.acquired) return
    try {
      if (fs.existsSync(this.lockPath)) {
        const data = JSON.parse(fs.readFileSync(this.lockPath, 'utf-8'))
        if (data.pid === process.pid) {
          fs.unlinkSync(this.lockPath)
          console.log(`[instance-lock] released (PID ${process.pid})`)
        } else {
          console.warn(`[instance-lock] lock owned by PID ${data.pid}, not releasing (we are ${process.pid})`)
        }
      }
      this.acquired = false
    } catch (e) {
      console.error(`[instance-lock] release error: ${e.message}`)
    }
  }
}

module.exports = InstanceLock
