#!/usr/bin/env bash
# Runs the grouping pass's lever (scripts/arc-pass.ts) on copies only: by default the four demo courses, seeded fresh
# into the sandbox, which are the ones calibration scores. Edo's SMM and AIKR run only when COURSES names them, as an
# unscored check once their slides are fresh; of each, .study/course.json, .study/workspace.json and the course's
# folder are copied.
# The engine runs under the sandbox's HOME, so no real registry, record or backup is read or written; the originals'
# checksums are taken before and after, and the run fails if one changed. The demo copies settle their edges
# (--edges apply); the real copies only propose (--edges propose), and each run's run.json names its original, the
# one course --apply may later give its arcs, with his approval.
#
#   OUT=<empty folder> ACCOUNT=<Claude account label> PY=<python with the engine's packages> \
#     [COURSES="calculus linear-algebra probability real-analysis" | COURSES="SMM AIKR"] [CUT_ON=stored] bash scripts/arc-pass-copies.sh
#
# CUT_ON=stored cuts a real copy on its stored edges only, so a proposed edge cannot reorder the material
# (scripts/arc-pass.ts --cut-on).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
APP="$(cd "$HERE/.." && pwd -P)"
ENGINE="$(cd "$APP/.." && pwd -P)"
: "${OUT:?OUT names an empty folder for the sandbox and the runs}" "${ACCOUNT:?ACCOUNT names the Claude account}" "${PY:?PY names the python with the engine packages}"
SEED="${SEED:-$HOME/.config/logbook/adapters/journal/seed}"
VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/the-vault"
COURSES="${COURSES:-calculus linear-algebra probability real-analysis}"
real_of() {
	case "$1" in
		SMM) echo "$VAULT/university/msc/SMM" ;;
		AIKR) echo "$VAULT/university/msc/AIKR" ;;
	esac
}
REAL_NAMES=""
for name in $COURSES; do if [ -n "$(real_of "$name")" ]; then REAL_NAMES="$REAL_NAMES $name"; fi; done

case "$OUT" in /*) ;; *) echo "refusing: OUT must be absolute, not $OUT" >&2; exit 1 ;; esac
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT")" ]; then echo "refusing: $OUT is not empty" >&2; exit 1; fi
mkdir -p "$OUT/runs" "$OUT/real/home" "$OUT/real/courses"

originals() { for name in $REAL_NAMES; do shasum -a 256 "$(real_of "$name")/.study/course.json"; done | sort; }
originals > "$OUT/originals.before"

SB="$OUT/demo" ENGINE="$ENGINE" PY="$PY" bash "$SEED/seed.sh" > "$OUT/seed.log"

# A real course's folder is copied beside its record, read from the original only, so the copy's pass reads the same
# material a live pass would: its registered sources and the files the engine's scan finds beside them. A course whose
# workspace.json links its material elsewhere reads it in place: the pass only reads material.
copy_sources() {
	"$PY" -I - "$1" "$2" <<'EOF'
import json, os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
if json.load(open(f"{src}/.study/workspace.json")).get("sources"):
    sys.exit()
skip = shutil.ignore_patterns(".study", "node_modules", ".git", ".obsidian", ".trash")
for name in os.listdir(src):
    a, b = os.path.join(src, name), os.path.join(dst, name)
    if skip(src, [name]) or os.path.exists(b):
        continue
    if os.path.isdir(a):
        shutil.copytree(a, b, ignore=skip)
    else:
        shutil.copy2(a, b)
EOF
}

for name in $REAL_NAMES; do
	mkdir -p "$OUT/real/courses/$name/.study"
	cp "$(real_of "$name")/.study/course.json" "$(real_of "$name")/.study/workspace.json" "$OUT/real/courses/$name/.study/"
	copy_sources "$(real_of "$name")" "$OUT/real/courses/$name"
	HOME="$OUT/real/home" PYTHONPATH="$ENGINE" "$PY" -m learning migrate --workspace "$OUT/real/courses/$name" > "$OUT/real/$name.migrate.json"
done

pids=()
for name in $COURSES; do
	if [ -n "$(real_of "$name")" ]; then
		args=(--workspace "$OUT/real/courses/$name" --engine-home "$OUT/real/home" --edges propose --cut-on "${CUT_ON:-proposed}" --original "$(real_of "$name")")
	else
		args=(--workspace "$OUT/demo/courses/$name" --engine-home "$OUT/demo/home" --engine-vault "$OUT/demo/vault" --edges apply)
	fi
	(cd "$APP" && LH_LEARNING_PYTHON="$PY" npx tsx scripts/arc-pass.ts "${args[@]}" --out "$OUT/runs/$name" --account "$ACCOUNT" > "$OUT/runs/$name.log" 2>&1) &
	pids+=($!)
done
status=0
for pid in ${pids[@]+"${pids[@]}"}; do wait "$pid" || status=1; done

originals > "$OUT/originals.after"
if ! diff -q "$OUT/originals.before" "$OUT/originals.after" > /dev/null; then echo "an original course.json changed" >&2; exit 2; fi
for name in $COURSES; do tail -n 1 "$OUT/runs/$name.log"; done
exit "$status"
