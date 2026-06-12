export const PROJECT_VERSION = 1;

export type Tool =
  | "select"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "line"
  | "arrow"
  | "text";

export type ShapeType = Exclude<Tool, "select">;

export type DiagramStyle = {
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  fontSize?: number;
};

export type ShapeDimension = "width" | "height" | "length";

export const LENGTH_UNITS = ["in", "mm", "cm", "m", "ft"] as const;

export type LengthUnit = (typeof LENGTH_UNITS)[number];

export type DiagramMeasurement = {
  unit: LengthUnit;
  pixelsPerUnit: number | null;
};

export type BaseObject = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  rotation: number;
  style: DiagramStyle;
  zIndex: number;
  dimensions?: ShapeDimension[];
};

export type BoxObject = BaseObject & {
  type: "rectangle" | "ellipse" | "triangle" | "text";
  width: number;
  height: number;
  text?: string;
};

export type LineObject = BaseObject & {
  type: "line" | "arrow";
  points: [number, number, number, number];
};

export type DiagramObject = BoxObject | LineObject;

export type DiagramDocument = {
  width: number;
  height: number;
  title: string;
  measurement?: DiagramMeasurement;
};

export type DiagramProject = {
  version: typeof PROJECT_VERSION;
  document: DiagramDocument;
  objects: DiagramObject[];
};

export type EditorState = {
  document: DiagramDocument;
  objects: DiagramObject[];
  selectedId: string | null;
  activeTool: Tool;
  copiedStyle: DiagramStyle | null;
  error: string | null;
  dirty: boolean;
};

export type CreateObjectInput = {
  type: ShapeType;
  x: number;
  y: number;
  id?: string;
};

export const defaultDocument: DiagramDocument = {
  width: 1280,
  height: 800,
  title: "Untitled diagram",
};

export const defaultStyle: DiagramStyle = {
  stroke: "#1f2937",
  fill: "#ffffff",
  strokeWidth: 2,
  opacity: 1,
  fontSize: 18,
};

export const arrowStyle: DiagramStyle = {
  ...defaultStyle,
  stroke: "#b91c1c",
  fill: "#b91c1c",
  strokeWidth: 3,
};

export function initialEditorState(): EditorState {
  return {
    document: defaultDocument,
    objects: [],
    selectedId: null,
    activeTool: "select",
    copiedStyle: null,
    error: null,
    dirty: false,
  };
}

export function cloneStyle(style: DiagramStyle): DiagramStyle {
  return { ...style };
}

export function createDiagramObject(
  input: CreateObjectInput,
  zIndex: number,
): DiagramObject {
  const id = input.id ?? cryptoId();
  const base = {
    id,
    x: input.x,
    y: input.y,
    rotation: 0,
    zIndex,
  };

  switch (input.type) {
    case "rectangle":
      return {
        ...base,
        type: "rectangle",
        width: 160,
        height: 96,
        style: cloneStyle(defaultStyle),
      };
    case "ellipse":
      return {
        ...base,
        type: "ellipse",
        width: 120,
        height: 120,
        style: cloneStyle(defaultStyle),
      };
    case "triangle":
      return {
        ...base,
        type: "triangle",
        width: 140,
        height: 120,
        style: cloneStyle(defaultStyle),
      };
    case "line":
      return {
        ...base,
        type: "line",
        points: [0, 0, 180, 0],
        style: cloneStyle(defaultStyle),
      };
    case "arrow":
      return {
        ...base,
        type: "arrow",
        points: [0, 0, 180, 0],
        style: cloneStyle(arrowStyle),
      };
    case "text":
      return {
        ...base,
        type: "text",
        width: 180,
        height: 44,
        text: "Label",
        style: {
          ...cloneStyle(defaultStyle),
          fill: "#111827",
          stroke: "#111827",
        },
      };
  }
}

export function sortByLayer(objects: DiagramObject[]): DiagramObject[] {
  return [...objects].sort((a, b) => a.zIndex - b.zIndex);
}

export function normalizeLayers(objects: DiagramObject[]): DiagramObject[] {
  return sortByLayer(objects).map((object, index) => ({
    ...object,
    zIndex: index,
  }));
}

export function selectedObject(state: EditorState): DiagramObject | null {
  return state.objects.find((object) => object.id === state.selectedId) ?? null;
}

export function isLengthUnit(value: unknown): value is LengthUnit {
  return (
    typeof value === "string" &&
    (LENGTH_UNITS as readonly string[]).includes(value)
  );
}

export function isCalibratedMeasurement(
  measurement: DiagramMeasurement | null | undefined,
): measurement is DiagramMeasurement & { pixelsPerUnit: number } {
  return Boolean(
    measurement &&
    typeof measurement.pixelsPerUnit === "number" &&
    Number.isFinite(measurement.pixelsPerUnit) &&
    measurement.pixelsPerUnit > 0,
  );
}

export function pixelsToDimensionValue(
  pixels: number,
  measurement?: DiagramMeasurement | null,
): number {
  if (!isCalibratedMeasurement(measurement)) {
    return Math.round(pixels);
  }
  return Math.round((pixels / measurement.pixelsPerUnit) * 100) / 100;
}

export function formatDimensionValue(
  pixels: number,
  measurement?: DiagramMeasurement | null,
): string {
  const value = pixelsToDimensionValue(pixels, measurement);
  return isCalibratedMeasurement(measurement)
    ? `${value} ${measurement.unit}`
    : `${value}`;
}

// Shared by the on-canvas indicator (top-left anchored) and the SVG export
// (baseline anchored), so the two renderings stay visually in sync.
export const UNIT_INDICATOR_LAYOUT = {
  margin: 12,
  baselineY: 24,
  fontSize: 13,
  color: "#1e293b",
} as const;

export function lineMetrics(object: LineObject): {
  dx: number;
  dy: number;
  length: number;
  angle: number;
} {
  const [x1, y1, x2, y2] = object.points;
  const dx = x2 - x1;
  const dy = y2 - y1;
  return {
    dx,
    dy,
    length: Math.hypot(dx, dy),
    angle: Math.atan2(dy, dx) * (180 / Math.PI),
  };
}

// Current pixel size of an object's dimensionable measurement, or null when
// the object does not support that dimension (e.g. arrows never have one).
export function objectDimensionPixels(
  object: DiagramObject,
  dimension: ShapeDimension,
): number | null {
  if (object.type === "line") {
    return dimension === "length" ? lineMetrics(object).length : null;
  }
  if (
    (object.type === "rectangle" ||
      object.type === "ellipse" ||
      object.type === "triangle") &&
    (dimension === "width" || dimension === "height")
  ) {
    return object[dimension];
  }
  return null;
}

// Resizes a line to the given pixel length while keeping its start point and
// direction (angle) fixed; only the end point moves. A degenerate zero-length
// line extends along its local +X axis.
export function lineResizedToLength(
  object: LineObject,
  length: number,
): LineObject["points"] {
  const [x1, y1] = object.points;
  const metrics = lineMetrics(object);
  const ux = metrics.length > 0 ? metrics.dx / metrics.length : 1;
  const uy = metrics.length > 0 ? metrics.dy / metrics.length : 0;
  return [x1, y1, x1 + ux * length, y1 + uy * length];
}

export function rightTrianglePoints(object: {
  width: number;
  height: number;
}): [number, number, number, number, number, number] {
  return [0, 0, object.width, 0, 0, object.height];
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `shape-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
