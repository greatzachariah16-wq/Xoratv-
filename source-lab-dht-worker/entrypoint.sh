#!/bin/sh
set -eu
# Always apply the intended Hydra settings. Ignore any platform-supplied args.
exec /hydra-booster -nheads=150 -name=source-lab-dht -httpapi-addr=0.0.0.0:7779 -db=/data -ui-theme=none
