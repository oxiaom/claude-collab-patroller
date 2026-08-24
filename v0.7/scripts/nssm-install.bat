@echo off
REM nssm-install.bat — Windows Service install for v0.7 daemon
REM
REM 用户 8/24 01:25 SGT 拍板 B (Phase 1 only) + 8/25 00:30 user "全部 推进"
REM   Phase 1.2: Node.js daemon + PM2/systemd 守护 (本文件 + ecosystem.config.js)
REM   修 v0.7 daemon ~30s 死问题 (Windows background process)
REM
REM 前置:
REM   1. 下载 nssm (https://nssm.cc/download/) 解压到 C:\Tools\nssm-2.24\
REM   2. 准备 Node.js 安装路径 (默认 C:\Program Files\nodejs\)
REM
REM 用法 (admin cmd):
REM   cd C:\Tools\nssm-2.24\win64
REM   nssm.exe install claude-collab-patroller-daemon
REM   (然后按下面提示填字段)
REM
REM   或用本脚本自动填:
REM   nssm-install.bat
REM
REM nssm 字段说明:
REM   Path:        C:\Program Files\nodejs\node.exe
REM   Startup dir: D:\myopenclaw\projects\claude-collab-patroller\v0.7
REM   Arguments:   src\daemon.js
REM   Service name: claude-collab-patroller-daemon
REM   Display name: claude-collab-patroller daemon
REM   Description: Claude-collab-patroller Node.js daemon (Phase 1.2 hardening)
REM
REM   Environment variables (I/O → Environment):
REM     CCP_POLL_INTERVAL=10000
REM     CCP_WAKE_METHOD=file-marker
REM     CCP_HEALTH_PORT=7777
REM     CCP_HEALTH_HOST=127.0.0.1
REM     CCP_LOG_LEVEL=info
REM     CCP_LOG_FORMAT=json
REM     CCP_LOG_DEST=file
REM     CLAUDE_COLLAB=D:\myopenclaw\scripts\mcp-collab-claude.sh
REM     CLAUDE_API_KEY_FILE=C:\Users\SUISHUO-GK\.collab-mcp\claude-api-key
REM     NODE_ENV=production
REM
REM   I/O → Startup → Type: Automatic (Delayed Start)
REM   I/O → Recovery → First failure: Restart service
REM   I/O → Recovery → Subsequent failures: Restart service
REM   I/O → Exit actions → On exit: Restart
REM   I/O → Process tree: Kill the process tree of children
REM
REM 卸载:
REM   nssm.exe stop claude-collab-patroller-daemon
REM   nssm.exe remove claude-collab-patroller-daemon confirm

setlocal enabledelayedexpansion

set NSSM=C:\Tools\nssm-2.24\win64\nssm.exe
set NODE=C:\Program Files\nodejs\node.exe
set WORKDIR=D:\myopenclaw\projects\claude-collab-patroller\v0.7
set SVC=claude-collab-patroller-daemon
set SCRIPT=src\daemon.js

echo === Installing Windows Service via nssm ===
echo.

REM Check nssm exists
if not exist "%NSSM%" (
    echo ERROR: nssm not found at %NSSM%
    echo Download from https://nssm.cc/download/ and adjust path
    exit /b 1
)

REM Install service
"%NSSM%" install %SVC% "%NODE%" "%SCRIPT%"

REM Set working directory
"%NSSM%" set %SVC% AppDirectory "%WORKDIR%"

REM Set display info
"%NSSM%" set %SVC% DisplayName "claude-collab-patroller daemon"
"%NSSM%" set %SVC% Description "Claude-collab-patroller Node.js daemon (Phase 1.2 hardening)"

REM Set startup type (delayed auto start)
"%NSSM%" set %SVC% Start SERVICE_AUTO_START

REM Set recovery options (restart on failure)
"%NSSM%" set %SVC% RecoveryAction OnFailure
"%NSSM%" set %SVC% ResetFailureAfter 60
"%NSSM%" set %SVC% RebootMsg "claude-collab-patroller-daemon crashed, rebooting in 60s"

REM Set environment variables
"%NSSM%" set %SVC% AppEnvironmentExtra "NODE_ENV=production"
"%NSSM%" set %SVC% AppEnvironmentExtra "CCP_POLL_INTERVAL=10000"
"%NSSM%" set %SVC% AppEnvironmentExtra "CCP_WAKE_METHOD=file-marker"
"%NSSM%" set %SVC% AppEnvironmentExtra "CCP_HEALTH_PORT=7777"
"%NSSM%" set %SVC% AppEnvironmentExtra "CCP_HEALTH_HOST=127.0.0.1"
"%NSSM%" set %SVC% AppEnvironmentExtra "CCP_LOG_LEVEL=info"
"%NSSM%" set %SVC% AppEnvironmentExtra "CCP_LOG_FORMAT=json"
"%NSSM%" set %SVC% AppEnvironmentExtra "CCP_LOG_DEST=file"
"%NSSM%" set %SVC% AppEnvironmentExtra "CLAUDE_COLLAB=D:\myopenclaw\scripts\mcp-collab-claude.sh"
"%NSSM%" set %SVC% AppEnvironmentExtra "CLAUDE_API_KEY_FILE=C:\Users\SUISHUO-GK\.collab-mcp\claude-api-key"

REM Set log output
"%NSSM%" set %SVC% AppStdout "C:\Users\SUISHUO-GK\.claude\patrol\logs\daemon-stdout.log"
"%NSSM%" set %SVC% AppStderr "C:\Users\SUISHUO-GK\.claude\patrol\logs\daemon-stderr.log"

REM Set log rotation
"%NSSM%" set %SVC% AppRotateFiles 1
"%NSSM%" set %SVC% AppRotateBytes 10485760

REM Set process priority
"%NSSM%" set %SVC% AppPriority NORMAL_PRIORITY_CLASS

echo.
echo === nssm install complete ===
echo.
echo To start:    nssm start %SVC%
echo To status:  sc query %SVC%
echo To stop:     nssm stop %SVC%
echo To remove:   nssm remove %SVC% confirm
echo.
echo Log file:    C:\Users\SUISHUO-GK\.claude\patrol\logs\daemon-stdout.log

endlocal
