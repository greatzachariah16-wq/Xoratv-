#!/bin/sh
set -eu
# Keep the isolated DHT worker within a conservative resource budget.
# Lower bootstrap concurrency and stagger head startup to avoid connection/log storms.
exec /hydra-booster -nheads=50 -name=source-lab-dht -httpapi-addr=0.0.0.0:7779 -db=/data -ui-theme=none -bootstrap-conc=4 -stagger=500ms
