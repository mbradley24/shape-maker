import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  Circle,
  MousePointer2,
  Paintbrush,
  Save,
  Square,
  Type,
  Upload,
  Download,
  Triangle,
  ArrowRight,
  Minus,
} from "lucide-react";
import { EditorCanvas, StageHandle } from "./components/EditorCanvas";
import { Inspector } from "./components/Inspector";
import { editorReducer } from "./model/editorReducer";
import { initialEditorState, ShapeType, Tool } from "./model/diagram";
import { parseProject, serializeProject } from "./io/project";
import { exportDiagramSvg } from "./io/exporters";
import { openProjectFile, saveTextFile } from "./io/files";

const tools: Array<{ tool: Tool; label: string; icon: typeof Square }> = [
  { tool: "select", label: "Select", icon: MousePointer2 },
  { tool: "rectangle", label: "Rectangle", icon: Square },
  { tool: "ellipse", label: "Circle", icon: Circle },
  { tool: "triangle", label: "Triangle", icon: Triangle },
  { tool: "line", label: "Line", icon: Minus },
  { tool: "arrow", label: "Arrow", icon: ArrowRight },
  { tool: "text", label: "Text", icon: Type },
];

export function App() {
  const [state, dispatch] = useReducer(
    editorReducer,
    undefined,
    initialEditorState,
  );
  const stageRef = useRef<StageHandle>(null);
  const selected = useMemo(
    () =>
      state.objects.find((object) => object.id === state.selectedId) ?? null,
    [state.objects, state.selectedId],
  );

  const saveProject = useCallback(async () => {
    try {
      await saveTextFile(
        "shape-maker-project",
        "diagram.shapemaker.json",
        serializeProject(state.objects, state.document),
      );
      dispatch({ type: "markSaved" });
    } catch (error) {
      dispatch({
        type: "setError",
        error:
          error instanceof Error ? error.message : "Could not save project.",
      });
    }
  }, [state.document, state.objects]);

  const loadProject = useCallback(async () => {
    try {
      const raw = await openProjectFile();
      if (!raw) return;
      const project = parseProject(raw);
      dispatch({
        type: "loadProject",
        document: project.document,
        objects: project.objects,
      });
    } catch (error) {
      dispatch({
        type: "setError",
        error:
          error instanceof Error ? error.message : "Could not open project.",
      });
    }
  }, []);

  const exportSvg = useCallback(async () => {
    const svg = exportDiagramSvg(
      state.objects,
      state.document.width,
      state.document.height,
    );
    await saveTextFile("shape-maker-svg", "diagram.svg", svg);
  }, [state.document.height, state.document.width, state.objects]);

  const exportPng = useCallback(async () => {
    const dataUrl = stageRef.current?.toPng();
    if (!dataUrl) {
      dispatch({
        type: "setError",
        error: "The canvas is not ready to export.",
      });
      return;
    }
    const link = document.createElement("a");
    link.download = "diagram.png";
    link.href = dataUrl;
    link.click();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        void loadProject();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        dispatch({ type: "duplicateSelected" });
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        dispatch({ type: "copySelectedStyle" });
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        dispatch({ type: "deleteSelected" });
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      const nudges: Record<string, [number, number]> = {
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
      };
      const nudge = nudges[event.key];
      if (nudge) {
        event.preventDefault();
        dispatch({ type: "nudgeSelected", dx: nudge[0], dy: nudge[1] });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadProject, saveProject]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <span>Shape Maker</span>
          {state.dirty ? (
            <span className="dirty-dot" title="Unsaved changes" />
          ) : null}
        </div>
        <div className="toolbar" aria-label="Drawing tools">
          {tools.map(({ tool, label, icon: Icon }) => (
            <button
              className={state.activeTool === tool ? "tool active" : "tool"}
              key={tool}
              onClick={() => dispatch({ type: "setTool", tool })}
              title={label}
              aria-label={label}
            >
              <Icon size={18} />
            </button>
          ))}
          <span className="divider" />
          <button
            className="tool"
            onClick={() => dispatch({ type: "copySelectedStyle" })}
            title="Copy style"
            aria-label="Copy style"
          >
            <Paintbrush size={18} />
          </button>
          <button
            className="tool"
            onClick={() => dispatch({ type: "duplicateSelected" })}
            title="Duplicate"
            aria-label="Duplicate"
          >
            <Square size={16} />
            <span className="plus">+</span>
          </button>
        </div>
        <div className="filebar">
          <button className="command" onClick={loadProject}>
            <Upload size={16} /> Open
          </button>
          <button className="command" onClick={saveProject}>
            <Save size={16} /> Save
          </button>
          <button className="command" onClick={exportPng}>
            <Download size={16} /> PNG
          </button>
          <button className="command" onClick={exportSvg}>
            <Download size={16} /> SVG
          </button>
        </div>
      </header>
      {state.error ? <div className="error-strip">{state.error}</div> : null}
      <section className="workspace">
        <EditorCanvas ref={stageRef} state={state} dispatch={dispatch} />
        <Inspector
          selected={selected}
          copiedStyle={state.copiedStyle}
          dispatch={dispatch}
        />
      </section>
    </main>
  );
}

export function isShapeTool(tool: Tool): tool is ShapeType {
  return tool !== "select";
}
