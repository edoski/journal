#!/usr/bin/env bash
# Runs the grouping pass's lever (scripts/arc-pass.ts) on copies only: the four demo courses, seeded fresh into the
# sandbox, and Edo's SMM, AIKR and Amoreg, of which .study/course.json, .study/workspace.json and the registered sources
# are copied.
# The engine runs under the sandbox's HOME, so no real registry, record or backup is read or written; the originals'
# checksums are taken before and after, and the run fails if one changed. The demo copies settle their edges
# (--edges apply); the real copies only propose (--edges propose), and each run's run.json names its original, the
# one course --apply may later give its arcs, with his approval.
#
#   OUT=<empty folder> ACCOUNT=<Claude account label> PY=<python with the engine's packages> \
#     [COURSES="calculus linear-algebra probability real-analysis SMM AIKR amoreg"] bash scripts/arc-pass-copies.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
APP="$(cd "$HERE/.." && pwd -P)"
ENGINE="$(cd "$APP/.." && pwd -P)"
: "${OUT:?OUT names an empty folder for the sandbox and the runs}" "${ACCOUNT:?ACCOUNT names the Claude account}" "${PY:?PY names the python with the engine packages}"
SEED="${SEED:-$HOME/.claude/skills/logbook/adapters/journal/seed}"
VAULT="$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/the-vault"
COURSES="${COURSES:-calculus linear-algebra probability real-analysis SMM AIKR amoreg}"
REAL_NAMES="SMM AIKR amoreg"
real_of() {
	case "$1" in
		SMM) echo "$VAULT/university/msc/SMM" ;;
		AIKR) echo "$VAULT/university/msc/AIKR" ;;
		amoreg) echo "$VAULT/learn/amoreg" ;;
	esac
}

case "$OUT" in /*) ;; *) echo "refusing: OUT must be absolute, not $OUT" >&2; exit 1 ;; esac
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT")" ]; then echo "refusing: $OUT is not empty" >&2; exit 1; fi
mkdir -p "$OUT/runs" "$OUT/real/home" "$OUT/real/courses"

originals() { for name in $REAL_NAMES; do shasum -a 256 "$(real_of "$name")/.study/course.json"; done | sort; }
originals > "$OUT/originals.before"

SB="$OUT/demo" ENGINE="$ENGINE" PY="$PY" bash "$SEED/seed.sh" > "$OUT/seed.log"

# Each registered source of a real course is copied beside its record, read from the original only, so the copy's pass
# reads the same material a live pass would. A course whose workspace.json links its material elsewhere (Amoreg) reads
# it in place: the pass only reads material.
copy_sources() {
	"$PY" -I - "$1" "$2" <<'EOF'
import json, os, shutil, sys
src, dst = sys.argv[1], sys.argv[2]
if json.load(open(f"{src}/.study/workspace.json")).get("sources"):
    sys.exit()
for source in json.load(open(f"{src}/.study/course.json")).get("sources", {}).values():
    rel = source.get("path")
    if not rel or "://" in rel or os.path.isabs(rel):
        continue
    a, b = os.path.join(src, rel), os.path.join(dst, rel)
    if not os.path.exists(a) or os.path.exists(b):
        continue
    os.makedirs(os.path.dirname(b), exist_ok=True)
    if os.path.isdir(a):
        shutil.copytree(a, b, ignore=shutil.ignore_patterns(".study", "node_modules", ".git"))
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
		args=(--workspace "$OUT/real/courses/$name" --engine-home "$OUT/real/home" --edges propose --original "$(real_of "$name")")
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
