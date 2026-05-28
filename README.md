# Shape Maker

Shape Maker is a macOS-first desktop diagram editor for quick mechanical sketching workflows. The MVP focuses on simple PowerPoint-like drawing: rectangles, ellipses, triangles, lines, arrows, text labels, styling, nudging, dimensions, rotation, local project files, and PNG/SVG export.

## Requirements

- Node.js 20 or newer
- npm
- Rust and Cargo for native Tauri builds

This workspace currently has Node/npm available. Install Rust before running Tauri packaging commands.

## Development

```sh
npm install
npm run dev
```

The Vite dev server uses `127.0.0.1:5177`, registered in `~/.config/opencode/port-registry.json`.

## Verification

```sh
npm run test
npm run lint
npm run format:check
npm run typecheck
npm run build
```

Frontend verification also runs in GitHub Actions on every pull request and on
pushes to `main`. The CI workflow installs dependencies with `npm ci` and runs
the frontend test, lint, typecheck, and build checks listed above. Native Tauri
packaging is not part of the frontend CI workflow.

Native packaging:

```sh
npm run tauri build
```

## MVP Scope

Included:

- Shape tools: rectangle, ellipse, triangle, line, arrow, text
- Selection, dragging, delete, duplicate, layer movement
- Arrow-key nudge by 1 px and Shift+arrow nudge by 10 px
- Numeric inspector for position, dimensions, and rotation angle
- Style inspector and Format Painter
- Local `.shapemaker.json`-compatible project save/load
- PNG and SVG export

Deferred:

- Typed engineering dimensions and callouts
- Mechanical symbols such as supports, loads, constraints, and moments
- Windows packaging verification
