#!/bin/bash
# Аддон MapTool «DM Cockpit Bridge» (Q17): архив .mtlib из scripts/maptool/bridge/ — library.json, events.json,
# mts_properties.json в корне, макросы и окно под library/. Собранный файл — maptool/dm-cockpit-bridge.mtlib
# (в .gitignore: собирается из исходников). В MapTool: File → Add On Libraries → Add.
set -euo pipefail
cd "$(dirname "$0")/../.."
src=scripts/maptool/bridge
out=maptool/dm-cockpit-bridge.mtlib
mkdir -p maptool
rm -f "$out"
(cd "$src" && zip -q -X -r "../../../$out" library.json events.json mts_properties.json library)
echo "собран $out ($(wc -c < "$out" | tr -d ' ') байт)"
