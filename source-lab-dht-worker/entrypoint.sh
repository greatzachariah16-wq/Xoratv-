#!/bin/sh
set -eu
# Keep the isolated DHT worker within a more conservative resource budget.
exec /hydra-booster -nheads=50 -name=source-lab-dht -httpapi-addr=0.0.0.0:7779 -db=/data -ui-theme=none
