# MVP Backlog

Repository target: `mbradley24/shape-maker`

Milestone: `MVP: Usable Diagram Editor`

## 1. Bootstrap Tauri React App

- Tauri + React + TypeScript app runs locally on macOS.
- Uses Vite and Konva-ready frontend dependencies.
- Adds scripts for dev, build, test, lint, format check, and type check.
- Adds README with setup and commands.
- Claims the dev server port in `~/.config/opencode/port-registry.json` or `.md`.
- No drawing features beyond a basic editor shell.

## 2. Canvas Editor Foundation

- App opens directly into the editor.
- Konva canvas fills the workspace and resizes with the window.
- Includes compact toolbar, canvas area, and inspector.
- Supports select, deselect, drag move, delete, and arrow-key nudging.
- Arrow keys move selected objects by 1 px; Shift+arrow moves by 10 px.
- Editor state is held in React with tested reducer/state behavior.

## 3. Basic Shape Tools

- Toolbar includes rectangle, ellipse/circle, triangle, line, arrow, and text tools.
- User can place each shape on the canvas.
- Shapes have sensible default stroke/fill styles.
- Text labels can be created and edited.
- Selected shapes can be resized and rotated where applicable.
- Shape model stores explicit width/height or point geometry plus rotation angle.
- Tests verify creation and default properties for every supported shape.

## 4. Inspector, Dimensions, and Angles

- Inspector exposes editable position, size, and rotation angle for selected objects.
- Width/height are editable for rectangle, ellipse, triangle, and text bounding boxes.
- Line and arrow expose endpoint coordinates or equivalent length/angle controls.
- Numeric edits update the selected object without changing unrelated objects.
- Invalid numeric input is handled without corrupting state.
- Tests cover size, position, and angle updates.

## 5. Styling and Format Painter

- Inspector exposes stroke color, fill color, stroke width, opacity, and text size where applicable.
- Format Painter can copy visual style from one selected object and apply it to another.
- Format Painter does not copy geometry, position, text content, or layer order.
- Supports duplicate, delete, bring forward, and send backward.
- Tests cover style updates, format painter behavior, duplication, deletion, and layer ordering.

## 6. Local Project Save and Load

- Defines a versioned project JSON format for editable diagrams.
- Save/open uses Tauri file dialogs.
- Saves all objects, geometry, dimensions, rotation, styles, text, and layer order.
- Malformed or unsupported project files show a non-crashing error.
- Tests cover serialization, deserialization, version handling, and malformed input.

## 7. Export PNG and SVG

- User can export the current canvas to PNG.
- User can export the current diagram to SVG.
- Exports preserve geometry, styles, text, dimensions, angles, and layer order visually.
- Empty canvas export is handled intentionally.
- Tests cover export generation for representative shapes.

## 8. MVP Polish and Packaging

- macOS app build completes successfully.
- Keyboard shortcuts cover select, delete, duplicate, nudge, save, open, export, and format painter where practical.
- UI is compact and tool-like, with no landing page.
- Empty, dirty/unsaved, loading, and error states are handled.
- README documents MVP limitations and future Windows compatibility.
- Full verification passes before PR review.
