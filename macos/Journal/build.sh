#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$project_dir/../.." && pwd)
app_dir="$repo_dir/build/Journal.app"
contents_dir="$app_dir/Contents"

rm -rf "$app_dir"
mkdir -p "$contents_dir/MacOS"
cp "$project_dir/Info.plist" "$contents_dir/Info.plist"
xcrun swiftc \
    -O \
    -framework AppKit \
    -framework Carbon \
    "$project_dir/Sources/Journal.swift" \
    -o "$contents_dir/MacOS/Journal"

if [ -n "${JOURNAL_CODESIGN_IDENTITY:-}" ]; then
    codesign --force --deep --sign "$JOURNAL_CODESIGN_IDENTITY" "$app_dir"
fi

printf '%s\n' "$app_dir"
