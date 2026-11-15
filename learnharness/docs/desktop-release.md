# Desktop builds

This fork has no update feed and no in-app updater. `electron-builder.yml` sets `publish: null`, so a packaged build carries no `app-update.yml` and never offers upstream's releases. The owner runs the app from the dev server; a packaged build is a local artifact only.

## Platform

LearnHarness is Mac only: a signed, notarized Apple Silicon DMG. The custom app bar keeps the macOS traffic lights on its left, and the app keeps the system menu.

The icon (2026-10-13) is the Icon Composer document `build/icon.icon`, which actool compiles into `Assets.car` (macOS 26 Liquid Glass) plus a fallback icns that `scripts/after-pack.cjs` replaces with the hand-packed full-res `build/icon.icns` (actool's caps at 256px). Building it needs **macOS 26+ and Xcode 26+** (`actool`): Xcode 26's asset compiler crashes on macOS 15 because its host frameworks lack required symbols. `desktop:dist` injects `DEVELOPER_DIR` locally. The older-OS fallback icon remains included.

## Build pipeline

1. `npm ci`
2. Native PDF/SVG renderer tests, running in Electron's bundled Node (no display needed).
3. `npm run build` (`output: "standalone"`).
4. `node scripts/build-server.mjs` — copy static assets, refuse leaked data/keys, remove only standalone-root `dist/` and `node_modules/electron/` (old installers and the development runtime), check prompt assets. Runtime dependencies' own `dist/` directories and native renderer binaries stay intact.
5. `node scripts/smoke-server.mjs --electron` — boot the standalone server in Electron's bundled Node, using empty temporary data/auth, then check the home route and GET-only APIs.
6. `electron-builder --mac --arm64`.

The shell lives in `app.asar`; the standalone server and native renderer binaries ship unpacked as `extraResources`. `npm run desktop:dist` runs these steps and signs with the `LH_NOTARY` keychain profile.

## CI

In the journal repository, GitHub runs only the root workflows, so this folder's `.github/` (kept from upstream) is inert. The root `.github/workflows/ci.yml` runs on main pushes and pull requests:

- The repository gate on macOS (`macos-15`): `python tools/check.py`, which runs the Python packages' checks and this app's typecheck, full deterministic test suite and lint.
- Native renderer tests plus standalone build/boot-smoke on macOS (`macos-15`).
