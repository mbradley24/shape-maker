import { describe, expect, it } from "vitest";
import { BoxObject, DiagramObject, LineObject, defaultStyle } from "./diagram";
import { SNAP_THRESHOLD_PX, lineOrientation, resolveSnap } from "./snap";

function box(
  id: string,
  type: BoxObject["type"],
  x: number,
  y: number,
  width: number,
  height: number,
): BoxObject {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex: 0,
    style: { ...defaultStyle },
  };
}

function line(
  id: string,
  type: LineObject["type"],
  x: number,
  y: number,
  points: [number, number, number, number],
): LineObject {
  return {
    id,
    type,
    x,
    y,
    points,
    rotation: 0,
    zIndex: 0,
    style: { ...defaultStyle },
  };
}

describe("resolveSnap edge alignment", () => {
  const a = box("a", "rectangle", 100, 100, 160, 96);

  function dragRect(
    candidateX: number,
    candidateY: number,
    others: DiagramObject[] = [a],
  ) {
    const b = box("b", "rectangle", candidateX, candidateY, 160, 96);
    return resolveSnap(b, candidateX, candidateY, others);
  }

  it("snaps B's left edge exactly onto A's left edge within threshold", () => {
    const result = dragRect(a.x + (SNAP_THRESHOLD_PX - 1), 400);
    // B.x === A.x
    expect(result.x).toBe(a.x);
  });

  it("snaps B's right edge exactly onto A's right edge within threshold", () => {
    // Place B so its right edge is just inside threshold of A's right edge but
    // its left edge is far from A's left edge.
    const targetRight = a.x + a.width;
    const candidateX = targetRight - 160 + (SNAP_THRESHOLD_PX - 1);
    const result = dragRect(candidateX, 400);
    // B.x + B.width === A.x + A.width
    expect(result.x + 160).toBe(a.x + a.width);
  });

  it("snaps B's top edge exactly onto A's top edge within threshold", () => {
    const result = dragRect(600, a.y + (SNAP_THRESHOLD_PX - 1));
    // B.y === A.y
    expect(result.y).toBe(a.y);
  });

  it("snaps B's bottom edge exactly onto A's bottom edge within threshold", () => {
    const targetBottom = a.y + a.height;
    const candidateY = targetBottom - 96 + (SNAP_THRESHOLD_PX - 1);
    const result = dragRect(600, candidateY);
    // B.y + B.height === A.y + A.height
    expect(result.y + 96).toBe(a.y + a.height);
  });

  it("snaps a triangle to a rectangle edge the same way (box-modeled)", () => {
    const triangle = box("t", "triangle", a.x + 2, 500, 140, 120);
    const result = resolveSnap(triangle, a.x + 2, 500, [a]);
    expect(result.x).toBe(a.x);
  });

  it("does not snap when just outside the threshold (tracks pointer)", () => {
    const candidateX = a.x + (SNAP_THRESHOLD_PX + 1);
    const result = dragRect(candidateX, 400);
    expect(result.x).toBe(candidateX);
    expect(result.guides).toHaveLength(0);
  });
});

describe("resolveSnap ellipse centers", () => {
  const e1 = box("e1", "ellipse", 200, 200, 120, 120);

  it("snaps center x onto another ellipse center x within threshold", () => {
    // e2 center x within threshold of e1 center x.
    const e1CenterX = e1.x + e1.width / 2;
    const e2Width = 80;
    const candidateX = e1CenterX - e2Width / 2 + (SNAP_THRESHOLD_PX - 1);
    const e2 = box("e2", "ellipse", candidateX, 500, e2Width, 80);
    const result = resolveSnap(e2, candidateX, 500, [e1]);
    // e2.x + e2.width/2 === e1.x + e1.width/2
    expect(result.x + e2Width / 2).toBe(e1.x + e1.width / 2);
  });

  it("snaps center y onto another ellipse center y within threshold", () => {
    const e1CenterY = e1.y + e1.height / 2;
    const e2Height = 80;
    const candidateY = e1CenterY - e2Height / 2 + (SNAP_THRESHOLD_PX - 1);
    const e2 = box("e2", "ellipse", 600, candidateY, 80, e2Height);
    const result = resolveSnap(e2, 600, candidateY, [e1]);
    expect(result.y + e2Height / 2).toBe(e1.y + e1.height / 2);
  });

  it("does not snap an ellipse center to a rectangle", () => {
    const rect = box("r", "rectangle", 200, 200, 120, 120);
    const rectCenterX = rect.x + rect.width / 2;
    const candidateX = rectCenterX - 40 + (SNAP_THRESHOLD_PX - 1);
    const e2 = box("e2", "ellipse", candidateX, 500, 80, 80);
    const result = resolveSnap(e2, candidateX, 500, [rect]);
    // No center-to-center snap, and edges are far apart, so no snap.
    expect(result.x).toBe(candidateX);
  });
});

describe("resolveSnap line vs rectangle side", () => {
  const rect = box("r", "rectangle", 100, 100, 200, 150);

  it("snaps a horizontal line's y onto the rectangle top within threshold", () => {
    const hLine = line(
      "l",
      "line",
      120,
      rect.y + (SNAP_THRESHOLD_PX - 1),
      [0, 0, 180, 0],
    );
    const result = resolveSnap(hLine, hLine.x, hLine.y, [rect]);
    expect(result.y).toBe(rect.y);
  });

  it("snaps a horizontal line's y onto the rectangle bottom within threshold", () => {
    const targetBottom = rect.y + rect.height;
    const hLine = line(
      "l",
      "line",
      120,
      targetBottom - (SNAP_THRESHOLD_PX - 1),
      [0, 0, 180, 0],
    );
    const result = resolveSnap(hLine, hLine.x, hLine.y, [rect]);
    expect(result.y).toBe(targetBottom);
  });

  it("snaps a vertical line's x onto the rectangle left within threshold", () => {
    const vLine = line(
      "l",
      "line",
      rect.x + (SNAP_THRESHOLD_PX - 1),
      120,
      [0, 0, 0, 180],
    );
    const result = resolveSnap(vLine, vLine.x, vLine.y, [rect]);
    expect(result.x).toBe(rect.x);
  });

  it("snaps a vertical line's x onto the rectangle right within threshold", () => {
    const targetRight = rect.x + rect.width;
    const vLine = line(
      "l",
      "line",
      targetRight - (SNAP_THRESHOLD_PX - 1),
      120,
      [0, 0, 0, 180],
    );
    const result = resolveSnap(vLine, vLine.x, vLine.y, [rect]);
    expect(result.x).toBe(targetRight);
  });

  it("does not snap a line to another line", () => {
    const other = line("o", "line", 100, 100, [0, 0, 200, 0]);
    const hLine = line(
      "l",
      "line",
      120,
      100 + (SNAP_THRESHOLD_PX - 1),
      [0, 0, 180, 0],
    );
    const result = resolveSnap(hLine, hLine.x, hLine.y, [other]);
    expect(result.y).toBe(hLine.y);
    expect(result.guides).toHaveLength(0);
  });
});

describe("lineOrientation", () => {
  it("classifies a mostly-horizontal line as horizontal", () => {
    expect(lineOrientation(line("h", "line", 0, 0, [0, 0, 100, 0]))).toBe(
      "horizontal",
    );
  });
  it("classifies a mostly-vertical line as vertical", () => {
    expect(lineOrientation(line("v", "line", 0, 0, [0, 0, 0, 100]))).toBe(
      "vertical",
    );
  });
  it("classifies a 45-degree line as diagonal", () => {
    expect(lineOrientation(line("d", "line", 0, 0, [0, 0, 100, 100]))).toBe(
      "diagonal",
    );
  });
});

describe("resolveSnap guide lines", () => {
  const a = box("a", "rectangle", 100, 100, 160, 96);

  it("emits a vertical guide spanning both shapes while snapped on x", () => {
    // Narrower than A so only the left edge is within threshold (right edge is
    // far), making the snapped axis unambiguous.
    const b = box("b", "rectangle", a.x + (SNAP_THRESHOLD_PX - 1), 400, 60, 96);
    const result = resolveSnap(b, b.x, b.y, [a]);
    const vertical = result.guides.find((g) => g.axis === "vertical");
    expect(vertical).toBeDefined();
    if (vertical && vertical.axis === "vertical") {
      expect(vertical.x).toBe(a.x);
      // Span covers both A (top 100) and B (bottom 400+96).
      expect(vertical.from).toBeLessThanOrEqual(Math.min(a.y, b.y));
      expect(vertical.to).toBeGreaterThanOrEqual(
        Math.max(a.y + a.height, b.y + b.height),
      );
    }
  });

  it("emits no guides when nothing is within threshold", () => {
    const b = box("b", "rectangle", 1000, 1000, 160, 96);
    const result = resolveSnap(b, b.x, b.y, [a]);
    expect(result.guides).toHaveLength(0);
  });

  it("emits both axis guides when snapping on x and y simultaneously", () => {
    const b = box(
      "b",
      "rectangle",
      a.x + (SNAP_THRESHOLD_PX - 1),
      a.y + (SNAP_THRESHOLD_PX - 1),
      160,
      96,
    );
    const result = resolveSnap(b, b.x, b.y, [a]);
    expect(result.guides.map((g) => g.axis).sort()).toEqual([
      "horizontal",
      "vertical",
    ]);
  });
});
