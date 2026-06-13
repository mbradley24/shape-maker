import { DiagramObject, LineObject, lineMetrics } from "./diagram";

// Single source of truth for how close (in model/screen px) a dragged shape's
// alignment feature must be to a candidate before it softly snaps. Shared by
// the snap-resolution logic and its tests so behaviour and assertions agree.
export const SNAP_THRESHOLD_PX = 6;

// An axis-aligned guide line to render while a snap is active. Horizontal guides
// hold a constant `y` and span [from, to] on x; vertical guides hold a constant
// `x` and span [from, to] on y.
export type GuideLine =
  | { axis: "vertical"; x: number; from: number; to: number }
  | { axis: "horizontal"; y: number; from: number; to: number };

export type SnapResult = {
  // Snapped top-left model position for the dragged object.
  x: number;
  y: number;
  // Guide lines to render for the active snaps (empty when nothing snapped).
  guides: GuideLine[];
};

function isLineLike(object: DiagramObject): object is LineObject {
  return object.type === "line" || object.type === "arrow";
}

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
};

// Axis-aligned bounding box of an object in absolute model coordinates, given a
// candidate top-left position. Rotation is ignored: snapping is specified for
// axis-aligned alignment only (out of scope: rotated snapping).
function boundsAt(object: DiagramObject, x: number, y: number): Bounds {
  if (isLineLike(object)) {
    const [x1, y1, x2, y2] = object.points;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    return {
      left: x + minX,
      right: x + maxX,
      top: y + minY,
      bottom: y + maxY,
      centerX: x + (minX + maxX) / 2,
      centerY: y + (minY + maxY) / 2,
    };
  }
  const { width, height } = object;
  return {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

function objectBounds(object: DiagramObject): Bounds {
  return boundsAt(object, object.x, object.y);
}

// "horizontal" lines vary mostly in x (snap their y); "vertical" lines vary
// mostly in y (snap their x). A perfectly diagonal line is treated as neither.
export function lineOrientation(
  object: LineObject,
): "horizontal" | "vertical" | "diagonal" {
  const { dx, dy } = lineMetrics(object);
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax === ay) return "diagonal";
  return ax > ay ? "horizontal" : "vertical";
}

type AxisCandidate = {
  // The dragged feature value (in absolute coords) we compare to the target.
  draggedValue: number;
  // The target value to snap onto.
  targetValue: number;
  // Span of the guide line along the perpendicular axis (covers both shapes).
  spanFrom: number;
  spanTo: number;
};

// Picks the closest in-threshold candidate on one axis, if any.
function bestCandidate(candidates: AxisCandidate[]): AxisCandidate | null {
  let best: AxisCandidate | null = null;
  let bestDistance = SNAP_THRESHOLD_PX;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.draggedValue - candidate.targetValue);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

// Vertical-axis (x) snap candidates between the dragged object and one other
// object. Left-to-left, right-to-right, center-to-center for box-modeled
// shapes; a vertical line snaps its x onto the other's left/right sides.
function verticalCandidates(
  dragged: DiagramObject,
  draggedBounds: Bounds,
  other: DiagramObject,
  otherBounds: Bounds,
): AxisCandidate[] {
  const span = {
    spanFrom: Math.min(draggedBounds.top, otherBounds.top),
    spanTo: Math.max(draggedBounds.bottom, otherBounds.bottom),
  };

  if (dragged.type === "line" || dragged.type === "arrow") {
    if (lineOrientation(dragged) !== "vertical") return [];
    // Only lines snap to rectangle-like sides (not to other lines).
    if (other.type === "line" || other.type === "arrow") return [];
    return [
      {
        draggedValue: draggedBounds.left,
        targetValue: otherBounds.left,
        ...span,
      },
      {
        draggedValue: draggedBounds.left,
        targetValue: otherBounds.right,
        ...span,
      },
    ];
  }

  if (other.type === "line" || other.type === "arrow") return [];

  // Ellipse centers snap only to other ellipse centers.
  if (dragged.type === "ellipse" && other.type === "ellipse") {
    return [
      {
        draggedValue: draggedBounds.centerX,
        targetValue: otherBounds.centerX,
        ...span,
      },
    ];
  }

  return [
    {
      draggedValue: draggedBounds.left,
      targetValue: otherBounds.left,
      ...span,
    },
    {
      draggedValue: draggedBounds.right,
      targetValue: otherBounds.right,
      ...span,
    },
  ];
}

// Horizontal-axis (y) snap candidates between the dragged object and one other.
function horizontalCandidates(
  dragged: DiagramObject,
  draggedBounds: Bounds,
  other: DiagramObject,
  otherBounds: Bounds,
): AxisCandidate[] {
  const span = {
    spanFrom: Math.min(draggedBounds.left, otherBounds.left),
    spanTo: Math.max(draggedBounds.right, otherBounds.right),
  };

  if (dragged.type === "line" || dragged.type === "arrow") {
    if (lineOrientation(dragged) !== "horizontal") return [];
    if (other.type === "line" || other.type === "arrow") return [];
    return [
      {
        draggedValue: draggedBounds.top,
        targetValue: otherBounds.top,
        ...span,
      },
      {
        draggedValue: draggedBounds.top,
        targetValue: otherBounds.bottom,
        ...span,
      },
    ];
  }

  if (other.type === "line" || other.type === "arrow") return [];

  if (dragged.type === "ellipse" && other.type === "ellipse") {
    return [
      {
        draggedValue: draggedBounds.centerY,
        targetValue: otherBounds.centerY,
        ...span,
      },
    ];
  }

  return [
    { draggedValue: draggedBounds.top, targetValue: otherBounds.top, ...span },
    {
      draggedValue: draggedBounds.bottom,
      targetValue: otherBounds.bottom,
      ...span,
    },
  ];
}

// Pure snap resolution. Given the object being dragged and the unsnapped
// candidate top-left position it would otherwise take, returns the snapped
// top-left position plus any active guide lines.
//
// Coordinates are model coordinates (top-left for boxes, top-left of the
// bounding box for lines). The Konva glue is responsible for converting node
// coordinates (e.g. ellipse centers) to/from this space.
export function resolveSnap(
  dragged: DiagramObject,
  candidateX: number,
  candidateY: number,
  others: DiagramObject[],
): SnapResult {
  const draggedBounds = boundsAt(dragged, candidateX, candidateY);

  let bestVertical: AxisCandidate | null = null;
  let bestHorizontal: AxisCandidate | null = null;

  for (const other of others) {
    if (other.id === dragged.id) continue;
    const otherBounds = objectBounds(other);

    const vertical = bestCandidate(
      verticalCandidates(dragged, draggedBounds, other, otherBounds),
    );
    if (
      vertical &&
      (!bestVertical ||
        Math.abs(vertical.draggedValue - vertical.targetValue) <
          Math.abs(bestVertical.draggedValue - bestVertical.targetValue))
    ) {
      bestVertical = vertical;
    }

    const horizontal = bestCandidate(
      horizontalCandidates(dragged, draggedBounds, other, otherBounds),
    );
    if (
      horizontal &&
      (!bestHorizontal ||
        Math.abs(horizontal.draggedValue - horizontal.targetValue) <
          Math.abs(bestHorizontal.draggedValue - bestHorizontal.targetValue))
    ) {
      bestHorizontal = horizontal;
    }
  }

  let x = candidateX;
  let y = candidateY;
  const guides: GuideLine[] = [];

  if (bestVertical) {
    // Shift x so the dragged feature lands exactly on the target.
    x += bestVertical.targetValue - bestVertical.draggedValue;
    guides.push({
      axis: "vertical",
      x: bestVertical.targetValue,
      from: bestVertical.spanFrom,
      to: bestVertical.spanTo,
    });
  }

  if (bestHorizontal) {
    y += bestHorizontal.targetValue - bestHorizontal.draggedValue;
    guides.push({
      axis: "horizontal",
      y: bestHorizontal.targetValue,
      from: bestHorizontal.spanFrom,
      to: bestHorizontal.spanTo,
    });
  }

  return { x, y, guides };
}
