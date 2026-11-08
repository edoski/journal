# Desktop builds

This fork has no update feed and no in-app updater. `electron-builder.yml` sets `publish: null`, so a packaged build carries no `app-update.yml` and never offers upstream's releases. The owner runs the app from the dev server; a packaged build is a local artifact only.

## Platforms

| Platform | Packages |
|---|---|
| macOS, Apple Silicon | signed/notarized DMG |
| Windows, x64 | unsigned per-user NSIS installer |
| Linux, x64 | AppImage + `.deb` |

The custom app bar stays on all three platforms. macOS keeps its left-side traffic lights; Windows/Linux use Electron's native right-side Window Controls Overlay, with CSS space reserved from the overlay's actual geometry. Windows/Linux hide the native menu until Alt is pressed. macOS keeps its system menu.

Icons are per-platform (2026-10-13): macOS compiles the Icon Composer document `build/icon.icon` via actool into `Assets.car` (macOS 26 Liquid Glass) plus a fallback icns that `scripts/after-pack.cjs` replaces with the hand-packed full-res `build/icon.icns` (actool's caps at 256px); Windows embeds `build/icon.ico` and Linux uses `build/icon.png`, both generated from the flat design (`build/icon-flat.svg`) by `node scripts/make-icons.mjs`. Building the mac icon needs **macOS 26+ and Xcode 26+** (`actool`): Xcode 26's asset compiler crashes on macOS 15 because its host frameworks lack required symbols. `desktop:dist` injects `DEVELOPER_DIR` locally. The older-OS fallback icon remains included. Linux's desktop identity is `learnharness.desktop`. Public package-maintainer metadata uses the owner's GitHub no-reply address; support goes through [GitHub Issues](https://github.com/amosblomqvist/learnharness/issues).

## Build pipeline

Each OS installs its own dependencies and builds its own Next standalone tree:

1. `npm ci`
2. Native PDF/SVG renderer tests for that OS, running in Electron's bundled Node (no display needed).
3. `npm run build` (`output: "standalone"`).
4. `node scripts/build-server.mjs` — copy static assets, refuse leaked data/keys, remove only standalone-root `dist/` and `node_modules/electron/` (old installers and the development runtime), check prompt assets. Runtime dependencies' own `dist/` directories and native renderer binaries stay intact.
5. `node scripts/smoke-server.mjs --electron` — boot the standalone server in Electron's bundled Node, using empty temporary data/auth, then check the home route and GET-only APIs.
6. `npx electron-builder <platform flags> --publish never`.

The shell lives in `app.asar`; the standalone server and native renderer binaries ship unpacked as `extraResources`. **Do not cross-build the server payload.** Next traces the build machine's native binaries, so a macOS-built standalone tree is not a Windows/Linux payload.

`npm run desktop:dist` remains the local macOS signing path, using the `LH_NOTARY` keychain profile. For a local Windows/Linux build, run steps 1–5 above, then:

```sh
# On Windows:
npx electron-builder --win --x64 --publish never

# On Linux:
npx electron-builder --linux --x64 --publish never
```

## CI

In the journal repository, GitHub runs only the root workflows, so this folder's `.github/` (kept from upstream) is inert. The root `.github/workflows/ci.yml` runs on main pushes and pull requests:

- The repository gate on macOS (`macos-15`): `python tools/check.py`, which runs the Python packages' checks and this app's typecheck, full deterministic test suite and lint.
- Native renderer tests plus standalone build/boot-smoke on macOS (`macos-15`), Windows, and Linux.
