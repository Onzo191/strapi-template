#!/bin/sh
# Start clamd, wait for it to be answering, then exec the Lambda runtime.
#
# `exec` on the last line matters: the Node runtime must become PID 1's foreground
# process so Lambda's lifecycle signals reach it. Without exec, SIGTERM on
# shutdown would go to this shell and the runtime would never drain.
set -e

clamd --config-file=/etc/clamd.d/scan.conf &

# clamd loads ~250 MB of signatures; on a cold start that is a few seconds. Poll
# rather than sleeping a fixed amount, and give up loudly instead of silently
# handing the handler a dead scanner (which would report every object as an
# error and mask real infections behind noise).
i=0
while [ "$i" -lt 60 ]; do
  if printf 'PING' | timeout 1 /bin/sh -c 'cat > /dev/tcp/127.0.0.1/3310' 2>/dev/null; then
    break
  fi
  i=$((i + 1))
  sleep 1
done

if [ "$i" -ge 60 ]; then
  echo "[virus-scan] clamd did not become ready within 60s" >&2
  exit 1
fi

exec /lambda-entrypoint.sh "$@"
