import {
  cloneStyle,
  createDiagramObject,
  DiagramDocument,
  DiagramObject,
  DiagramStyle,
  EditorState,
  initialEditorState,
  normalizeLayers,
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
