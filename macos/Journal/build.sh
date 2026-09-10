#!/bin/sh
set -eu

install=0
for arg in "$@"; do
    case "$arg" in
        -i|--install)
            install=1
            ;;
        *)
            printf 'Unknown argument: %s\n' "$arg" >&2
            exit 1
            ;;
    esac
done

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$project_dir/../.." && pwd)
app_dir="$repo_dir/build/Journal.app"
contents_dir="$app_dir/Contents"
resources_dir="$contents_dir/Resources"
python_version=$(tr -d '[:space:]' < "$project_dir/python-version")
python_executable=$(uv python find \
    --managed-python \
    --no-python-downloads \
    "$python_version")
python_dir=$(CDPATH= cd -- "$(dirname -- "$python_executable")/.." && pwd)
codesign_identity=${JOURNAL_CODESIGN_IDENTITY:-}
if [ -z "$codesign_identity" ]; then
    codesign_identity=$(security find-identity -p codesigning -v 2>/dev/null | awk -F'"' '/Apple Development/ { print $2; exit }')
    codesign_identity=${codesign_identity:--}
fi

rm -rf "$app_dir"
mkdir -p "$contents_dir/MacOS" "$resources_dir/JournalSync/sync"
cp "$project_dir/Info.plist" "$contents_dir/Info.plist"
mkdir -p "$resources_dir/Python"
rsync -a \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    "$python_dir/" \
    "$resources_dir/Python/"
python_binary="$resources_dir/Python/bin/python3.14"
python_library="$resources_dir/Python/lib/libpython3.14.dylib"
python_library_source=$(otool -L "$python_binary" | awk '/libpython3[.]14[.]dylib/ { print $1; exit }')
install_name_tool \
    -change "$python_library_source" \
    '@rpath/libpython3.14.dylib' \
    "$python_binary"
install_name_tool -id '@rpath/libpython3.14.dylib' "$python_library"
rsync -a \
    --exclude '__pycache__' \
    --exclude '*.pyc' \
    --exclude '.DS_Store' \
    "$repo_dir/sync/" \
    "$resources_dir/JournalSync/sync/"
xcrun swiftc \
    -O \
    -framework AppKit \
    -framework Carbon \
    "$project_dir/Sources/Journal.swift" \
    -o "$contents_dir/MacOS/Journal"

find "$resources_dir/Python" -type f -print | while IFS= read -r binary; do
    if file "$binary" | grep -q 'Mach-O'; then
        codesign \
            --force \
            --sign "$codesign_identity" \
            --timestamp=none \
            "$binary"
    fi
done
codesign \
    --force \
    --identifier com.edo.journal.python \
    --sign "$codesign_identity" \
    --timestamp=none \
    "$python_binary"
codesign \
    --force \
    --sign "$codesign_identity" \
    --timestamp=none \
    "$app_dir"

if [ "$install" -eq 1 ]; then
    install_target="/Applications/Journal.app"
    rm -rf "$install_target"
    cp -R "$app_dir" "$install_target"
    printf 'Installed to %s\n' "$install_target"
else
    printf '%s\n' "$app_dir"
fi
