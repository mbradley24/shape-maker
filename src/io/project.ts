import {
  defaultDocument,
  DiagramObject,
  DiagramProject,
  PROJECT_VERSION,
  ShapeDimension,
  sortByLayer,
} from "../model/diagram";

export function serializeProject(
  objects: DiagramObject[],
  document = defaultDocument,
): string {
  const project: DiagramProject = {
    version: PROJECT_VERSION,
    document,
    objects: sortByLayer(objects),
  };
  return JSON.stringify(project, null, 2);
}

export function parseProject(raw: string): DiagramProject {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Project file is not valid JSON.");
  }

  if (!isObject(value)) {
    throw new Error("Project file is malformed.");
  }
  if (value.version !== PROJECT_VERSION) {
    throw new Error(`Unsupported project version: ${String(value.version)}`);
  }
  if (!isObject(value.document) || !Array.isArray(value.objects)) {
    throw new Error("Project file is missing document data.");
  }

  const document = {
    width: numberOr(value.document.width, defaultDocument.width),
    height: numberOr(value.document.height, defaultDocument.height),
    title:
      typeof value.document.title === "string"
        ? value.document.title
        : defaultDocument.title,
  };

  const objects = value.objects.map(parseObject);
  return { version: PROJECT_VERSION, document, objects };
}

function parseObject(value: unknown): DiagramObject {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.type !== "string"
  ) {
    throw new Error("Project contains a malformed object.");
  }
  if (!isObject(value.style)) {
    throw new Error(`Object ${value.id} is missing style data.`);
  }

  const base = {
    id: value.id,
    x: numberOr(value.x, 0),
    y: numberOr(value.y, 0),
    rotation: numberOr(value.rotation, 0),
    zIndex: numberOr(value.zIndex, 0),
    style: {
      stroke: stringOr(value.style.stroke, "#1f2937"),
      fill: stringOr(value.style.fill, "#ffffff"),
      strokeWidth: numberOr(value.style.strokeWidth, 2),
      opacity: numberOr(value.style.opacity, 1),
      fontSize:
        typeof value.style.fontSize === "number"
          ? value.style.fontSize
          : undefined,
    },
    dimensions: parseDimensions(value.dimensions),
  };

  if (value.type === "line" || value.type === "arrow") {
    if (!Array.isArray(value.points) || value.points.length !== 4) {
      throw new Error(`Object ${value.id} has malformed points.`);
    }
    return {
      ...base,
      type: value.type,
      points: value.points.map((point) => numberOr(point, 0)) as [
        number,
        number,
        number,
        number,
      ],
    };
  }

  if (
    value.type === "rectangle" ||
    value.type === "ellipse" ||
    value.type === "triangle" ||
    value.type === "text"
  ) {
    return {
      ...base,
      type: value.type,
      width: numberOr(value.width, 100),
      height: numberOr(value.height, 80),
      text:
        typeof value.text === "string"
          ? value.text
          : value.type === "text"
            ? "Label"
            : undefined,
    };
  }

  throw new Error(`Unsupported object type: ${value.type}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function parseDimensions(value: unknown): ShapeDimension[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const dimensions = value.filter(
    (dimension): dimension is ShapeDimension =>
      dimension === "width" || dimension === "height",
  );
  return dimensions.length > 0 ? Array.from(new Set(dimensions)) : undefined;
}
