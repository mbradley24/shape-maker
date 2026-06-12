import {
  cloneStyle,
  createDiagramObject,
  DiagramDocument,
  DiagramObject,
  DiagramStyle,
  EditorState,
  ForceUnit,
  initialEditorState,
  isCalibratedMeasurement,
  LengthUnit,
  lineMetrics,
  LineObject,
  normalizeLayers,
  ShapeDimension,
  ShapeType,
  Tool,
} from "./diagram";

export type EditorAction =
  | { type: "setTool"; tool: Tool }
  | {
      type: "createObject";
      shape: ShapeType;
      x: number;
      y: number;
      id?: string;
    }
  | { type: "select"; id: string | null }
  | { type: "move"; id: string; x: number; y: number }
  | { type: "nudgeSelected"; dx: number; dy: number }
  | { type: "updateSelected"; patch: Partial<DiagramObject> }
  | { type: "updateSelectedStyle"; patch: Partial<DiagramStyle> }
  | {
      type: "setSelectedDimension";
      dimension: ShapeDimension;
      visible: boolean;
    }
  | {
      type: "updateSelectedDimension";
      dimension: ShapeDimension;
      value: number;
    }
  | { type: "setMeasurementUnit"; unit: LengthUnit | null }
  | { type: "setForceUnit"; unit: ForceUnit | null }
  | { type: "updateSelectedMagnitude"; value: number }
  | { type: "updateText"; text: string }
  | { type: "copySelectedStyle" }
  | { type: "applyCopiedStyle"; id: string }
  | { type: "duplicateSelected"; id?: string }
  | { type: "deleteSelected" }
  | { type: "bringForward" }
  | { type: "sendBackward" }
  | { type: "loadProject"; document: DiagramDocument; objects: DiagramObject[] }
  | { type: "setError"; error: string | null }
  | { type: "markSaved" };

export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  switch (action.type) {
    case "setTool":
      return { ...state, activeTool: action.tool };
    case "createObject": {
      const object = createDiagramObject(
        { type: action.shape, x: action.x, y: action.y, id: action.id },
        state.objects.length,
      );
      return {
        ...state,
        objects: [...state.objects, object],
        selectedId: object.id,
        activeTool: "select",
        dirty: true,
        error: null,
      };
    }
    case "select":
      return { ...state, selectedId: action.id, error: null };
    case "move":
      return updateObject(state, action.id, (object) => ({
        ...object,
        x: action.x,
        y: action.y,
      }));
    case "nudgeSelected":
      if (!state.selectedId) return state;
      return updateObject(state, state.selectedId, (object) => ({
        ...object,
        x: object.x + action.dx,
        y: object.y + action.dy,
      }));
    case "updateSelected":
      if (!state.selectedId) return state;
      return updateObject(
        state,
        state.selectedId,
        (object) => ({ ...object, ...action.patch }) as DiagramObject,
      );
    case "updateSelectedStyle":
      if (!state.selectedId) return state;
      return updateObject(state, state.selectedId, (object) => ({
        ...object,
        style: { ...object.style, ...action.patch },
      }));
    case "setSelectedDimension":
      if (!state.selectedId) return state;
      return updateObject(state, state.selectedId, (object) =>
        setObjectDimension(object, action.dimension, action.visible),
      );
    case "updateSelectedDimension":
      if (!state.selectedId) return state;
      return applySelectedDimensionValue(state, action.dimension, action.value);
    case "setMeasurementUnit": {
      if (isCalibratedMeasurement(state.document.measurement)) return state;
      return {
        ...state,
        document: {
          ...state.document,
          measurement: action.unit
            ? { unit: action.unit, pixelsPerUnit: null }
            : undefined,
        },
        dirty: true,
        error: null,
      };
    }
    case "setForceUnit": {
      if (isCalibratedMeasurement(state.document.forceMeasurement)) {
        return state;
      }
      return {
        ...state,
        document: {
          ...state.document,
          forceMeasurement: action.unit
            ? { unit: action.unit, pixelsPerUnit: null }
            : undefined,
        },
        dirty: true,
        error: null,
      };
    }
    case "updateSelectedMagnitude":
      return applySelectedMagnitudeValue(state, action.value);
    case "updateText":
      if (!state.selectedId) return state;
      return updateObject(state, state.selectedId, (object) => {
        if (object.type !== "text") return object;
        return { ...object, text: action.text };
      });
    case "copySelectedStyle": {
      const selected = state.objects.find(
        (object) => object.id === state.selectedId,
      );
      return selected
        ? { ...state, copiedStyle: cloneStyle(selected.style) }
        : state;
    }
    case "applyCopiedStyle":
      if (!state.copiedStyle) return state;
      return applyCopiedStyle(state, action.id);
    case "duplicateSelected": {
      const selected = state.objects.find(
        (object) => object.id === state.selectedId,
      );
      if (!selected) return state;
      const clone = {
        ...selected,
        id: action.id ?? `${selected.id}-copy`,
        x: selected.x + 24,
        y: selected.y + 24,
        zIndex: state.objects.length,
        style: cloneStyle(selected.style),
      } as DiagramObject;
      return {
        ...state,
        objects: [...state.objects, clone],
        selectedId: clone.id,
        dirty: true,
      };
    }
    case "deleteSelected":
      if (!state.selectedId) return state;
      return {
        ...state,
        objects: normalizeLayers(
          state.objects.filter((object) => object.id !== state.selectedId),
        ),
        selectedId: null,
        dirty: true,
      };
    case "bringForward":
      return moveLayer(state, 1);
    case "sendBackward":
      return moveLayer(state, -1);
    case "loadProject":
      return {
        ...initialEditorState(),
        document: action.document,
        objects: normalizeLayers(action.objects),
      };
    case "setError":
      return { ...state, error: action.error };
    case "markSaved":
      return { ...state, dirty: false };
  }
}

const MIN_DIMENSION_VALUE = 8;

function setObjectDimension(
  object: DiagramObject,
  dimension: ShapeDimension,
  visible: boolean,
): DiagramObject {
  if (!supportsDimension(object, dimension)) return object;
  const dimensions = object.dimensions ?? [];
  const hasDimension = dimensions.includes(dimension);
  if (visible && !hasDimension) {
    return { ...object, dimensions: [...dimensions, dimension] };
  }
  if (!visible && hasDimension) {
    const nextDimensions = dimensions.filter((item) => item !== dimension);
    return {
      ...object,
      dimensions: nextDimensions.length > 0 ? nextDimensions : undefined,
    };
  }
  return object;
}

function updateObjectDimension(
  object: DiagramObject,
  dimension: ShapeDimension,
  value: number,
): DiagramObject {
  if (!supportsDimension(object, dimension) || !Number.isFinite(value)) {
    return object;
  }
  return {
    ...object,
    [dimension]: Math.max(MIN_DIMENSION_VALUE, value),
  } as DiagramObject;
}

function applySelectedDimensionValue(
  state: EditorState,
  dimension: ShapeDimension,
  value: number,
): EditorState {
  const selected = state.objects.find(
    (object) => object.id === state.selectedId,
  );
  if (
    !selected ||
    !supportsDimension(selected, dimension) ||
    !Number.isFinite(value)
  ) {
    return state;
  }

  const measurement = state.document.measurement;
  if (measurement && !isCalibratedMeasurement(measurement)) {
    if (value <= 0) return state;
    return {
      ...state,
      document: {
        ...state.document,
        measurement: {
          ...measurement,
          pixelsPerUnit: selected[dimension] / value,
        },
      },
      dirty: true,
      error: null,
    };
  }

  const pixels = isCalibratedMeasurement(measurement)
    ? value * measurement.pixelsPerUnit
    : value;
  return updateObject(state, selected.id, (object) =>
    updateObjectDimension(object, dimension, pixels),
  );
}

// Arrows never store a magnitude: the displayed value is always derived from
// the pixel length and the force scale, mirroring how shape dimensions derive
// from pixels and the length scale. The first magnitude entry calibrates the
// pixels-per-force-unit scale without touching geometry; later entries resize
// the arrow along its own direction so the derived magnitude matches.
function applySelectedMagnitudeValue(
  state: EditorState,
  value: number,
): EditorState {
  const selected = state.objects.find(
    (object) => object.id === state.selectedId,
  );
  const forceMeasurement = state.document.forceMeasurement;
  if (
    !selected ||
    selected.type !== "arrow" ||
    !forceMeasurement ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return state;
  }

  const { length } = lineMetrics(selected);
  if (length <= 0) return state;

  if (!isCalibratedMeasurement(forceMeasurement)) {
    return {
      ...state,
      document: {
        ...state.document,
        forceMeasurement: {
          ...forceMeasurement,
          pixelsPerUnit: length / value,
        },
      },
      dirty: true,
      error: null,
    };
  }

  const scale = (value * forceMeasurement.pixelsPerUnit) / length;
  const [x1, y1, x2, y2] = selected.points;
  const points: LineObject["points"] = [
    x1,
    y1,
    x1 + (x2 - x1) * scale,
    y1 + (y2 - y1) * scale,
  ];
  return updateObject(state, selected.id, (object) => ({ ...object, points }));
}

function supportsDimension(
  object: DiagramObject,
  dimension: ShapeDimension,
): object is DiagramObject & Record<ShapeDimension, number> {
  return (
    (object.type === "rectangle" ||
      object.type === "ellipse" ||
      object.type === "triangle") &&
    dimension in object
  );
}

function applyCopiedStyle(state: EditorState, id: string): EditorState {
  if (!state.copiedStyle) return state;
  let changed = false;
  const copiedStyle = state.copiedStyle;
  const objects = state.objects.map((object) => {
    if (object.id !== id) return object;
    changed = true;
    return {
      ...object,
      style: cloneStyle(copiedStyle),
    };
  });
  return changed
    ? { ...state, objects, copiedStyle: null, dirty: true, error: null }
    : state;
}

function updateObject(
  state: EditorState,
  id: string,
  updater: (object: DiagramObject) => DiagramObject,
): EditorState {
  let changed = false;
  const objects = state.objects.map((object) => {
    if (object.id !== id) return object;
    changed = true;
    return updater(object);
  });
  return changed ? { ...state, objects, dirty: true, error: null } : state;
}

function moveLayer(state: EditorState, direction: 1 | -1): EditorState {
  if (!state.selectedId) return state;
  const ordered = normalizeLayers(state.objects);
  const index = ordered.findIndex((object) => object.id === state.selectedId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return state;
  const next = [...ordered];
  [next[index], next[target]] = [next[target], next[index]];
  return {
    ...state,
    objects: next.map((object, nextIndex) => ({
      ...object,
      zIndex: nextIndex,
    })),
    dirty: true,
  };
}
