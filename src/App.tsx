import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Circle,
  Eye,
  EyeOff,
  MousePointer2,
  Paintbrush,
  Ruler,
  Save,
  Square,
  Type,
  Upload,
  Download,
  TriangleRight,
  ArrowRight,
  Minus,
} from "lucide-react";
import { EditorCanvas, StageHandle } from "./components/EditorCanvas";
import { Inspector } from "./components/Inspector";
import { editorReducer } from "./model/editorReducer";
import {
  FORCE_UNITS,
  initialEditorState,
  isCalibratedMeasurement,
  isForceUnit,
  isLengthUnit,
  LENGTH_UNITS,
  MeasurementScale,
  ShapeType,
  Tool,
} from "./model/diagram";
import { parseProject, serializeProject } from "./io/project";
import { exportDiagramSvg } from "./io/exporters";
import { openProjectFile, saveTextFile } from "./io/files";

const tools: Array<{ tool: Tool; label: string; icon: typeof Square }> = [
  { tool: "select", label: "Select (V)", icon: MousePointer2 },
  { tool: "rectangle", label: "Rectangle", icon: Square },
  { tool: "ellipse", label: "Circle", icon: Circle },
  { tool: "triangle", label: "Triangle", icon: TriangleRight },
  { tool: "line", label: "Line", icon: Minus },
  { tool: "arrow", label: "Arrow", icon: ArrowRight },
  { tool: "text", label: "Text", icon: Type },
];

type AppShortcut =
  | { type: "action"; action: Parameters<typeof editorReducer>[1] }
  | { type: "saveProject" }
  | { type: "loadProject" }
  | { type: "exportPng" }
  | { type: "exportSvg" };

type ShortcutInput = Pick<
  KeyboardEvent,
  "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

export function App() {
  const [state, dispatch] = useReducer(
    editorReducer,
    undefined,
    initialEditorState,
  );
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const stageRef = useRef<StageHandle>(null);
  const selected = useMemo(
    () =>
      state.objects.find((object) => object.id === state.selectedId) ?? null,
    [state.objects, state.selectedId],
  );
  const isLoading = loadingMessage !== null;
  const isCalibrated = isCalibratedMeasurement(state.document.measurement);

  const runFileTask = useCallback(
    async (
      message: string,
      fallbackError: string,
      task: () => Promise<void>,
    ) => {
      if (loadingMessage) return;
      setLoadingMessage(message);
      dispatch({ type: "setError", error: null });
      try {
        await task();
      } catch (error) {
        dispatch({
          type: "setError",
          error: error instanceof Error ? error.message : fallbackError,
        });
      } finally {
        setLoadingMessage(null);
      }
    },
    [loadingMessage],
  );

  const saveProject = useCallback(async () => {
    await runFileTask(
      "Saving project...",
      "Could not save project.",
      async () => {
        await saveTextFile(
          "shape-maker-project",
          "diagram.shapemaker.json",
          serializeProject(state.objects, state.document),
        );
        dispatch({ type: "markSaved" });
      },
    );
  }, [runFileTask, state.document, state.objects]);

  const loadProject = useCallback(async () => {
    await runFileTask(
      "Opening project...",
      "Could not open project.",
      async () => {
        const raw = await openProjectFile();
        if (!raw) return;
        const project = parseProject(raw);
        dispatch({
          type: "loadProject",
          document: project.document,
          objects: project.objects,
        });
      },
    );
  }, [runFileTask]);

  const exportSvg = useCallback(async () => {
    await runFileTask("Exporting SVG...", "Could not export SVG.", async () => {
      const svg = exportDiagramSvg(
        state.objects,
        state.document.width,
        state.document.height,
        state.document.measurement,
        state.document.forceMeasurement,
      );
      await saveTextFile("shape-maker-svg", "diagram.svg", svg);
    });
  }, [
    runFileTask,
    state.document.forceMeasurement,
    state.document.height,
    state.document.measurement,
    state.document.width,
    state.objects,
  ]);

  const exportPng = useCallback(async () => {
    await runFileTask("Exporting PNG...", "Could not export PNG.", async () => {
      const dataUrl = stageRef.current?.toPng();
      if (!dataUrl) {
        throw new Error("The canvas is not ready to export.");
      }
      const link = document.createElement("a");
      link.download = "diagram.png";
      link.href = dataUrl;
      link.click();
    });
  }, [runFileTask]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isEditableShortcutTarget(target)) return;

      const shortcut = appShortcutForKey(event);
      if (!shortcut) return;

      event.preventDefault();
      switch (shortcut.type) {
        case "action":
          dispatch(shortcut.action);
          return;
        case "saveProject":
          void saveProject();
          return;
        case "loadProject":
          void loadProject();
          return;
        case "exportPng":
          void exportPng();
          return;
        case "exportSvg":
          void exportSvg();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exportPng, exportSvg, loadProject, saveProject]);

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
              aria-pressed={state.activeTool === tool}
            >
              <Icon size={18} />
            </button>
          ))}
          <span className="divider" />
          <button
            className="tool"
            onClick={() => dispatch({ type: "copySelectedStyle" })}
            title="Copy style (Cmd/Ctrl+Shift+C)"
            aria-label="Copy style"
          >
            <Paintbrush size={18} />
          </button>
          <button
            className="tool"
            onClick={() => dispatch({ type: "duplicateSelected" })}
            title="Duplicate (Cmd/Ctrl+D)"
            aria-label="Duplicate"
          >
            <Square size={16} />
            <span className="plus">+</span>
          </button>
          <button
            className={state.showDimensions ? "tool" : "tool active"}
            onClick={() => dispatch({ type: "toggleDimensionsVisibility" })}
            title="Show/hide dimensions (Cmd/Ctrl+Shift+D)"
            aria-label="Show/hide dimensions"
            aria-pressed={!state.showDimensions}
          >
            {state.showDimensions ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        </div>
        <div className="filebar">
          <label className="unit-select">
            Units
            <select
              aria-label="Diagram length unit"
              value={state.document.measurement?.unit ?? ""}
              title={
                isCalibrated
                  ? "Switch the display unit; shapes keep their on-screen size"
                  : "Set the diagram length unit"
              }
              onChange={(event) =>
                dispatch({
                  type: "setMeasurementUnit",
                  unit: isLengthUnit(event.target.value)
                    ? event.target.value
                    : null,
                })
              }
            >
              <option value="" disabled={isCalibrated}>
                px
              </option>
              {LENGTH_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
          {state.document.measurement ? (
            <span className="unit-indicator" title="Diagram length unit">
              {state.document.measurement.unit}
            </span>
          ) : null}
          {isCalibrated ? (
            <button
              className="command"
              onClick={() => dispatch({ type: "beginScaleRecalibration" })}
              title="Recalibrate scale: enter the real value of any shape dimension to set a new scale"
            >
              <Ruler size={16} /> Recalibrate
            </button>
          ) : null}
          <UnitScaleSelect
            label="Force"
            name="Diagram force unit"
            emptyOption="none"
            units={FORCE_UNITS}
            isUnit={isForceUnit}
            measurement={state.document.forceMeasurement}
            lockedTitle="Force unit is locked after the scale is calibrated"
            unlockedTitle="Set the diagram force unit"
            onSelect={(unit) => dispatch({ type: "setForceUnit", unit })}
          />
          <button
            className="command"
            onClick={loadProject}
            disabled={isLoading}
          >
            <Upload size={16} /> Open
          </button>
          <button
            className="command"
            onClick={saveProject}
            disabled={isLoading}
          >
            <Save size={16} /> Save
          </button>
          <button className="command" onClick={exportPng} disabled={isLoading}>
            <Download size={16} /> PNG
          </button>
          <button className="command" onClick={exportSvg} disabled={isLoading}>
            <Download size={16} /> SVG
          </button>
        </div>
      </header>
      {loadingMessage ? (
        <div className="loading-strip" role="status" aria-live="polite">
          {loadingMessage}
        </div>
      ) : null}
      {state.error ? <div className="error-strip">{state.error}</div> : null}
      <section className="workspace">
        <EditorCanvas ref={stageRef} state={state} dispatch={dispatch} />
        <Inspector
          selected={selected}
          copiedStyle={state.copiedStyle}
          measurement={state.document.measurement}
          forceMeasurement={state.document.forceMeasurement}
          dispatch={dispatch}
        />
      </section>
    </main>
  );
}

type UnitScaleSelectProps<Unit extends string> = {
  label: string;
  name: string;
  emptyOption: string;
  units: readonly Unit[];
  isUnit: (value: unknown) => value is Unit;
  measurement: MeasurementScale<Unit> | undefined;
  lockedTitle: string;
  unlockedTitle: string;
  onSelect: (unit: Unit | null) => void;
};

// One filebar control per measurement scale (length, force): a unit select
// that locks once the scale is calibrated, plus the active-unit indicator.
function UnitScaleSelect<Unit extends string>({
  label,
  name,
  emptyOption,
  units,
  isUnit,
  measurement,
  lockedTitle,
  unlockedTitle,
  onSelect,
}: UnitScaleSelectProps<Unit>) {
  const locked = isCalibratedMeasurement(measurement);
  return (
    <>
      <label className="unit-select">
        {label}
        <select
          aria-label={name}
          value={measurement?.unit ?? ""}
          disabled={locked}
          title={locked ? lockedTitle : unlockedTitle}
          onChange={(event) =>
            onSelect(isUnit(event.target.value) ? event.target.value : null)
          }
        >
          <option value="">{emptyOption}</option>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </label>
      {measurement ? (
        <span className="unit-indicator" title={name}>
          {measurement.unit}
        </span>
      ) : null}
    </>
  );
}

export function isShapeTool(tool: Tool): tool is ShapeType {
  return tool !== "select";
}

export function appShortcutForKey(input: ShortcutInput): AppShortcut | null {
  const key = input.key.toLowerCase();
  const command = input.metaKey || input.ctrlKey;

  if (!command && !input.altKey && key === "v") {
    return { type: "action", action: { type: "setTool", tool: "select" } };
  }
  if (command && !input.shiftKey && key === "s") {
    return { type: "saveProject" };
  }
  if (command && !input.shiftKey && key === "o") {
    return { type: "loadProject" };
  }
  if (command && !input.shiftKey && key === "d") {
    return { type: "action", action: { type: "duplicateSelected" } };
  }
  if (command && input.shiftKey && key === "d") {
    return { type: "action", action: { type: "toggleDimensionsVisibility" } };
  }
  if (command && !input.shiftKey && key === "e") {
    return { type: "exportPng" };
  }
  if (command && input.shiftKey && key === "e") {
    return { type: "exportSvg" };
  }
  if (command && input.shiftKey && key === "c") {
    return { type: "action", action: { type: "copySelectedStyle" } };
  }
  if (input.key === "Delete" || input.key === "Backspace") {
    return { type: "action", action: { type: "deleteSelected" } };
  }

  const step = input.shiftKey ? 10 : 1;
  const nudges: Record<string, [number, number]> = {
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
  };
  const nudge = nudges[input.key];
  return nudge
    ? {
        type: "action",
        action: { type: "nudgeSelected", dx: nudge[0], dy: nudge[1] },
      }
    : null;
}

export function isEditableShortcutTarget(target: HTMLElement | null): boolean {
  if (!target || typeof target.closest !== "function") return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']"),
  );
}
