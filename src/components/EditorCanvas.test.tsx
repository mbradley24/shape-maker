import { describe, expect, it } from "vitest";
import { createDiagramObject } from "../model/diagram";
import type { DiagramObject, LineObject } from "../model/diagram";
import {
  draggedObjectPositionPatch,
  ellipseRenderProps,
  lineEndpointDragPatch,
  lineEndpointHandlePosition,
  lineLikeRenderProps,
  transformedObjectPatch,
} from "./EditorCanvas";

type EllipseObject = DiagramObject & {
  type: "ellipse";
  width: number;
  height: number;
};
type EllipsePatch = Partial<EllipseObject> &
  Pick<EllipseObject, "x" | "y" | "rotation" | "width" | "height">;

function expectEllipsePatch(
  patch: Partial<DiagramObject> | null,
): asserts patch is EllipsePatch {
  expect(patch).not.toBeNull();
  expect(patch).toHaveProperty("x");
  expect(patch).toHaveProperty("y");
  expect(patch).toHaveProperty("rotation");
  expect(patch).toHaveProperty("width");
  expect(patch).toHaveProperty("height");
}

describe("transformedObjectPatch", () => {
  it("keeps ellipse dimensions stable during a rotation-only transform", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");

    const patch = transformedObjectPatch(ellipse, {
      x: ellipse.x + ellipse.width / 2,
      y: ellipse.y + ellipse.height / 2,
      rotation: 30,
      scaleX: 1,
      scaleY: 1,
    });

    expectEllipsePatch(patch);
    expect(patch).toMatchObject({
      x: ellipse.x,
      y: ellipse.y,
      rotation: 30,
      width: ellipse.width,
      height: ellipse.height,
    });
  });

  it("preserves equal width and height during a uniform circle resize", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");

    const patch = transformedObjectPatch(ellipse, {
      x: ellipse.x + ellipse.width / 2,
      y: ellipse.y + ellipse.height / 2,
      rotation: 30,
      scaleX: 1.5,
      scaleY: 1.5,
    });

    expectEllipsePatch(patch);
    expect(patch).toMatchObject({
      width: ellipse.width * 1.5,
      height: ellipse.height * 1.5,
    });
    expect(patch?.width).toBe(patch?.height);
  });

  it("does not compound ellipse dimensions through repeated rotate and resize cycles", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");

    const applyTransform = (
      target: typeof ellipse,
      scaleX: number,
      scaleY: number,
      rotation: number,
    ) => {
      const patch = transformedObjectPatch(target, {
        x: target.x + target.width / 2,
        y: target.y + target.height / 2,
        rotation,
        scaleX,
        scaleY,
      });
      expectEllipsePatch(patch);
      return { ...target, ...patch, type: "ellipse" } satisfies EllipseObject;
    };

    const afterRotate = applyTransform(ellipse, 1, 1, 45);
    const afterResize = applyTransform(afterRotate, 1.25, 1.25, 45);
    const afterSecondRotate = applyTransform(afterResize, 1, 1, 90);
    const afterSecondResize = applyTransform(afterSecondRotate, 0.8, 0.8, 90);

    expect(afterRotate).toMatchObject({
      width: 120,
      height: 120,
    });
    expect(afterResize).toMatchObject({
      width: 150,
      height: 150,
    });
    expect(afterSecondRotate).toMatchObject({
      width: 150,
      height: 150,
    });
    expect(afterSecondResize).toMatchObject({
      width: 120,
      height: 120,
    });
  });

  it("allows intentional nonuniform ellipse resize", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");
    const stretchedEllipse = {
      ...ellipse,
      width: 160,
      height: 100,
    };

    const patch = transformedObjectPatch(stretchedEllipse, {
      x: stretchedEllipse.x + stretchedEllipse.width / 2,
      y: stretchedEllipse.y + stretchedEllipse.height / 2,
      rotation: 15,
      scaleX: 1.5,
      scaleY: 0.5,
    });

    expectEllipsePatch(patch);
    expect(patch).toMatchObject({
      width: 240,
      height: 50,
    });
  });

  it("maps ellipse fill to the interior and stroke to the border", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");
    ellipse.style.fill = "#22c55e";
    ellipse.style.stroke = "#1d4ed8";
    ellipse.style.strokeWidth = 6;

    expect(ellipseRenderProps(ellipse)).toMatchObject({
      x: ellipse.x + ellipse.width / 2,
      y: ellipse.y + ellipse.height / 2,
      radiusX: ellipse.width / 2,
      radiusY: ellipse.height / 2,
      fill: "#22c55e",
      stroke: "#1d4ed8",
      strokeWidth: 6,
    });
  });

  it("stores ellipse drag positions as top-left coordinates", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");

    expect(
      draggedObjectPositionPatch(
        ellipse,
        ellipse.x + ellipse.width / 2 + 25,
        ellipse.y + ellipse.height / 2 + 35,
      ),
    ).toMatchObject({
      x: 35,
      y: 55,
    });
  });
});

describe("lineLikeRenderProps", () => {
  it.each([
    ["horizontal", [0, 0, 180, 0]],
    ["vertical", [20, 0, 20, 180]],
    ["diagonal", [0, 0, 140, 90]],
  ] satisfies Array<[string, LineObject["points"]]>)(
    "keeps %s line visuals unchanged while widening the hit target",
    (_orientation, points) => {
      const line = createDiagramObject(
        { type: "line", x: 10, y: 20, id: "line" },
        0,
      );
      if (line.type !== "line") throw new Error("expected line");
      const shapedLine = { ...line, points };

      expect(lineLikeRenderProps(shapedLine)).toMatchObject({
        points,
        hitStrokeWidth: expect.any(Number),
      });
      expect(lineLikeRenderProps(shapedLine).hitStrokeWidth).toBeGreaterThan(
        shapedLine.style.strokeWidth,
      );
    },
  );

  it("widens arrow hit targets without changing arrow geometry props", () => {
    const arrow = createDiagramObject(
      { type: "arrow", x: 10, y: 20, id: "arrow" },
      0,
    );
    if (arrow.type !== "arrow") throw new Error("expected arrow");
    const diagonalArrow = {
      ...arrow,
      points: [0, 0, 140, 90],
    } satisfies LineObject;

    expect(lineLikeRenderProps(diagonalArrow)).toMatchObject({
      points: diagonalArrow.points,
      hitStrokeWidth: expect.any(Number),
    });
    expect(lineLikeRenderProps(diagonalArrow).hitStrokeWidth).toBeGreaterThan(
      diagonalArrow.style.strokeWidth,
    );
  });
});

describe("line endpoint helpers", () => {
  it("updates only the start endpoint from a dragged handle", () => {
    const line = createDiagramObject(
      { type: "line", x: 10, y: 20, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");
    line.points = [0, 0, 180, 40];

    expect(lineEndpointDragPatch(line, "start", 25, 35)).toEqual({
      points: [15, 15, 180, 40],
    });
  });

  it("updates only the end endpoint from a dragged handle", () => {
    const arrow = createDiagramObject(
      { type: "arrow", x: 10, y: 20, id: "arrow" },
      0,
    );
    if (arrow.type !== "arrow") throw new Error("expected arrow");
    arrow.points = [5, 10, 180, 40];

    expect(lineEndpointDragPatch(arrow, "end", 210, 75)).toEqual({
      points: [5, 10, 200, 55],
    });
  });

  it("round-trips rotated endpoint handles through local line geometry", () => {
    const line = createDiagramObject(
      { type: "line", x: 100, y: 200, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");
    line.rotation = 90;
    line.points = [0, 0, 30, 10];

    const endHandle = lineEndpointHandlePosition(line, "end");
    expect(endHandle.x).toBeCloseTo(90);
    expect(endHandle.y).toBeCloseTo(230);

    const patch = lineEndpointDragPatch(
      line,
      "end",
      endHandle.x - 20,
      endHandle.y + 10,
    );

    expect(patch.points[0]).toBe(0);
    expect(patch.points[1]).toBe(0);
    expect(patch.points[2]).toBeCloseTo(40);
    expect(patch.points[3]).toBeCloseTo(30);
  });
});
