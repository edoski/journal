#!/bin/bash
# Builds <name>.app in ~/Applications, where Spotlight finds it. The .app is
# a copy of the checkout's own Electron with the app's name and icon, whose
# main only hands over to scripts/launcher/launch.cjs in the checkout: each
# launch updates the checkout, starts next dev and opens the app's shell.
#
#   scripts/launcher/install.sh [--checkout DIR] [--dest DIR]
#
# --checkout defaults to the repository's main checkout (not a worktree);
# --dest to ~/Applications. Rerun it only when this script or app/ changes:
# the launcher reinstalls the .app itself when main moves to a new Electron.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
app_src="$(cd "$here/../.." && pwd)"
checkout="$(dirname "$(git -C "$app_src" rev-parse --path-format=absolute --git-common-dir)")"
dest="$HOME/Applications"
while [ $# -gt 0 ]; do
	case "$1" in
		--checkout) checkout="$(cd "$2" && pwd)"; shift 2 ;;
		--dest) dest="$2"; shift 2 ;;
		*) echo "unknown option: $1" >&2; exit 2 ;;
	esac
done

id="com.learnharness.launcher"
name="$(sed -nE 's/.*PRODUCT_NAME: "([^"]+)".*/\1/p' "$app_src/electron/product.cjs")"
electron="$checkout/learnharness/node_modules/electron/dist/Electron.app"
[ -n "$name" ] || { echo "no PRODUCT_NAME in electron/product.cjs" >&2; exit 1; }
[ -d "$electron" ] || { echo "no Electron in $checkout/learnharness: run npm ci and node node_modules/electron/install.js there" >&2; exit 1; }

target="$dest/$name.app"
if [ -e "$target" ]; then
	existing="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$target/Contents/Info.plist" 2>/dev/null || true)"
	[ "$existing" = "$id" ] || { echo "$target is another app ($existing); not replacing it" >&2; exit 1; }
fi

mkdir -p "$dest"
staging="$(mktemp -d "$dest/.$name-install.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
bundle="$staging/$name.app"
cp -cR "$electron" "$bundle" 2>/dev/null || cp -R "$electron" "$bundle"

contents="$bundle/Contents"
plist="$contents/Info.plist"
for key in CFBundleName CFBundleDisplayName; do plutil -replace "$key" -string "$name" "$plist"; done
plutil -replace CFBundleIdentifier -string "$id" "$plist"
plutil -replace CFBundleIconFile -string icon.icns "$plist"
plutil -remove ElectronAsarIntegrity "$plist" 2>/dev/null || true
rm -f "$contents/Resources/default_app.asar" "$contents/Resources/electron.icns"

# The icon, as electron-builder makes it: Icon Composer's layered icon in
# Assets.car for macOS 26+, the full-size icns for older systems.
developer="${DEVELOPER_DIR:-$(ls -d /Applications/Xcode*.app 2>/dev/null | tail -1)/Contents/Developer}"
if DEVELOPER_DIR="$developer" xcrun --find actool >/dev/null 2>&1; then
	DEVELOPER_DIR="$developer" xcrun actool "$app_src/build/icon.icon" --compile "$contents/Resources" \
		--app-icon icon --platform macosx --target-device mac --minimum-deployment-target 13.0 \
		--output-partial-info-plist "$staging/icon.plist" --output-format human-readable-text >/dev/null
	plutil -replace CFBundleIconName -string icon "$plist"
else
	echo "no actool (Xcode 26+); using the flat icon only" >&2
fi
cp "$app_src/build/icon.icns" "$contents/Resources/icon.icns"

mkdir "$contents/Resources/app"
cp "$here/app/package.json" "$here/app/main.cjs" "$contents/Resources/app/"
json="${checkout//\\/\\\\}"
printf '{ "checkout": "%s" }\n' "${json//\"/\\\"}" >"$contents/Resources/app/checkout.json"
codesign --force --sign - "$bundle"

rm -rf "$target"
mv "$bundle" "$target"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$target"
mdimport "$target" 2>/dev/null || true
echo "$target -> $checkout"
