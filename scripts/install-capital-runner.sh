#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RUNNER="$PROJECT_DIR/scripts/capital-runner.mjs"
NODE_BIN=$(command -v node)
CODEX_BIN=$(command -v codex)
ASIDE_BIN=$(command -v aside 2>/dev/null || true)
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/.codex/log"
PLIST="$LAUNCH_AGENTS_DIR/com.vinny.capital-runner.plist"
DOMAIN="gui/$(id -u)"

if [ ! -f "$RUNNER" ]; then
  echo "Capital Runner is missing: $RUNNER" >&2
  exit 1
fi

xml_escape() {
  printf '%s' "$1" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g; s/'"'"'/\&apos;/g'
}

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

NODE_XML=$(xml_escape "$NODE_BIN")
RUNNER_XML=$(xml_escape "$RUNNER")
PROJECT_XML=$(xml_escape "$PROJECT_DIR")
LOG_XML=$(xml_escape "$LOG_DIR/capital-runner.log")
ERROR_XML=$(xml_escape "$LOG_DIR/capital-runner-error.log")
RUNNER_PATH=$(dirname "$NODE_BIN"):$(dirname "$CODEX_BIN")
if [ -n "$ASIDE_BIN" ]; then
  RUNNER_PATH="$RUNNER_PATH:$(dirname "$ASIDE_BIN")"
fi
RUNNER_PATH="$RUNNER_PATH:/usr/bin:/bin:/usr/sbin:/sbin"
RUNNER_PATH_XML=$(xml_escape "$RUNNER_PATH")

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vinny.capital-runner</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_XML</string>
    <string>$RUNNER_XML</string>
    <string>--watch</string>
    <string>--interval</string>
    <string>5</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_XML</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$RUNNER_PATH_XML</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  <string>$LOG_XML</string>
  <key>StandardErrorPath</key>
  <string>$ERROR_XML</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootout "$DOMAIN" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl kickstart -k "$DOMAIN/com.vinny.capital-runner"

echo "Capital Runner installed and watching for queued tasks."
