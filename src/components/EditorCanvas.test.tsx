import { describe, expect, it } from "vitest";
import type Konva from "konva";
import { createDiagramObject, rightTrianglePoints } from "../model/diagram";
import type { BoxObject, DiagramObject, LineObject } from "../model/diagram";
import type { TextObject } from "./EditorCanvas";
import {
  canvasPointerAction,
  draggedObjectPositionPatch,
  ellipseRenderProps,
  inlineTextEditCommitAction,
  inlineTextEditorStyle,
  isCanvasSurfaceTarget,
  lineEndpointDragPatch,
  lineEndpointHandlePosition,
  lineLikeRenderProps,
  shouldStartInlineTextEdit,
  triangleCornerDragPatch,
  triangleCornerHandlePosition,
  transformedObjectPatch,
} from "./EditorCanvas";

type EllipseObject = DiagramObject & {
  type: "ellipse";
  width: number;
  height: number;
};
type EllipsePatch = Partial<EllipseObject> &
  Pick<EllipseObject, "x" | "y" | "rotation" | "width" | "height">;
type TriangleObject = BoxObject & { type: "triangle" };

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

function fakeKonvaTarget({
  isStage = false,
  name = "",
}: {
  isStage?: boolean;
  name?: string;
}): Konva.Node {
  const stage = {
    getStage: () => stage,
    name: () => "",
  };
  const node = isStage
    ? stage
    : {
        getStage: () => stage,
        name: () => name,
      };
  return node as unknown as Konva.Node;
}

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = degrees * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

function renderedTriangleCornerPosition(
  triangle: TriangleObject,
  corner: "right" | "horizontal" | "vertical",
) {
  const points = rightTrianglePoints(triangle);
  const pointIndex = corner === "right" ? 0 : corner === "horizontal" ? 2 : 4;
  const rotated = rotatePoint(
    points[pointIndex],
    points[pointIndex + 1],
    triangle.rotation,
  );
  return {
    x: triangle.x + rotated.x,
    y: triangle.y + rotated.y,
  };
}

function expectHandleOnRenderedCorner(
  triangle: TriangleObject,
  corner: "right" | "horizontal" | "vertical",
) {
  const handle = triangleCornerHandlePosition(triangle, corner);
  const rendered = renderedTriangleCornerPosition(triangle, corner);

  expect(handle.x).toBeCloseTo(rendered.x);
  expect(handle.y).toBeCloseTo(rendered.y);
}

function applyTrianglePatch(
  triangle: TriangleObject,
  patch: Partial<DiagramObject>,
): TriangleObject {
  return { ...triangle, ...patch, type: "triangle" };
}

describe("canvas pointer handling", () => {
  it("treats the stage and background rectangle as empty canvas targets", () => {
    expect(isCanvasSurfaceTarget(fakeKonvaTarget({ isStage: true }))).toBe(
      true,
    );
    expect(
      isCanvasSurfaceTarget(fakeKonvaTarget({ name: "canvas-background" })),
    ).toBe(true);
  });

  it("does not treat objects or endpoint handles as empty canvas targets", () => {
    expect(isCanvasSurfaceTarget(fakeKonvaTarget({ name: "" }))).toBe(false);
    expect(
      isCanvasSurfaceTarget(
        fakeKonvaTarget({ name: "line-start-endpoint-handle" }),
      ),
    ).toBe(false);
  });

  it("deselects on empty canvas in select mode only when something is selected", () => {
    expect(
      canvasPointerAction(
        { activeTool: "select", selectedId: "rectangle" },
        { x: 25, y: 40 },
      ),
    ).toEqual({ type: "select", id: null });
    expect(
      canvasPointerAction(
        { activeTool: "select", selectedId: null },
        { x: 25, y: 40 },
      ),
    ).toBeNull();
  });

  it("keeps shape tool placement as a create action", () => {
    expect(
      canvasPointerAction(
        { activeTool: "rectangle", selectedId: "selected" },
        { x: 25, y: 40 },
      ),
    ).toEqual({
      type: "createObject",
      shape: "rectangle",
      x: 25,
      y: 40,
    });
  });
});

describe("inline text editing helpers", () => {
  it("starts inline editing only for an already selected text object", () => {
    const text = createDiagramObject(
      { type: "text", x: 10, y: 20, id: "text" },
      0,
    );
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 40, y: 50, id: "rectangle" },
      1,
    );

    expect(shouldStartInlineTextEdit(text, "text")).toBe(true);
    expect(shouldStartInlineTextEdit(text, "other")).toBe(false);
    expect(shouldStartInlineTextEdit(rectangle, "rectangle")).toBe(false);
  });

  it("commits text, including intentionally empty text, only for the selected text object", () => {
    const text = createDiagramObject(
      { type: "text", x: 10, y: 20, id: "text" },
      0,
    );
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 40, y: 50, id: "rectangle" },
      1,
    );

    expect(inlineTextEditCommitAction(text, "text", "Renamed")).toEqual({
      type: "updateText",
      text: "Renamed",
    });
    expect(inlineTextEditCommitAction(text, "text", "")).toEqual({
      type: "updateText",
      text: "",
    });
    expect(inlineTextEditCommitAction(text, "other", "Nope")).toBeNull();
    expect(
      inlineTextEditCommitAction(rectangle, "rectangle", "Nope"),
    ).toBeNull();
    expect(inlineTextEditCommitAction(null, "text", "Nope")).toBeNull();
  });

  it("positions the inline editor over the text object without mutating geometry", () => {
    const text = createDiagramObject(
      { type: "text", x: 10, y: 20, id: "text" },
      0,
    ) as TextObject;
    text.width = 240;
    text.height = 64;
    text.rotation = 15;
    text.style.fill = "#334155";
    text.style.opacity = 0.75;
    text.style.fontSize = 22;

    expect(inlineTextEditorStyle(text)).toMatchObject({
      left: 10,
      top: 20,
      width: 240,
      minHeight: 64,
      color: "#334155",
      opacity: 0.75,
      fontSize: 22,
      transform: "rotate(15deg)",
    });
  });
});

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

describe("triangle corner helpers", () => {
  it("places handles on the three right-triangle corners", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    expect(triangleCornerHandlePosition(triangle, "right")).toEqual({
      x: 30,
      y: 40,
    });
    expect(triangleCornerHandlePosition(triangle, "horizontal")).toEqual({
      x: 170,
      y: 40,
    });
    expect(triangleCornerHandlePosition(triangle, "vertical")).toEqual({
      x: 30,
      y: 160,
    });
  });

  it("round-trips rotated triangle corner handles through local geometry", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 100, y: 200, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");
    triangle.rotation = 90;

    expect(triangleCornerHandlePosition(triangle, "horizontal").x).toBeCloseTo(
      100,
    );
    expect(triangleCornerHandlePosition(triangle, "horizontal").y).toBeCloseTo(
      340,
    );
    expect(triangleCornerHandlePosition(triangle, "vertical").x).toBeCloseTo(
      -20,
    );
    expect(triangleCornerHandlePosition(triangle, "vertical").y).toBeCloseTo(
      200,
    );
  });

  it("updates only the horizontal leg when the horizontal marker is dragged", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    expect(triangleCornerDragPatch(triangle, "horizontal", 210, 55)).toEqual({
      width: 180,
    });
  });

  it("keeps the horizontal marker on the rendered horizontal endpoint after off-axis resizing", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    const patch = triangleCornerDragPatch(triangle, "horizontal", 210, 55);
    const resized = applyTrianglePatch(triangle as TriangleObject, patch);

    expectHandleOnRenderedCorner(resized, "right");
    expectHandleOnRenderedCorner(resized, "horizontal");
    expectHandleOnRenderedCorner(resized, "vertical");
    expect(triangleCornerHandlePosition(resized, "horizontal")).toEqual({
      x: 210,
      y: 40,
    });
  });

  it("updates only the vertical leg when the vertical marker is dragged", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    expect(triangleCornerDragPatch(triangle, "vertical", 45, 200)).toEqual({
      height: 160,
    });
  });

  it("keeps the vertical marker on the rendered vertical endpoint after off-axis resizing", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    const patch = triangleCornerDragPatch(triangle, "vertical", 45, 200);
    const resized = applyTrianglePatch(triangle as TriangleObject, patch);

    expectHandleOnRenderedCorner(resized, "right");
    expectHandleOnRenderedCorner(resized, "horizontal");
    expectHandleOnRenderedCorner(resized, "vertical");
    expect(triangleCornerHandlePosition(resized, "vertical")).toEqual({
      x: 30,
      y: 200,
    });
  });

  it("moves the right-angle corner and preserves fixed leg endpoints where practical", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    expect(triangleCornerDragPatch(triangle, "right", 50, 70)).toEqual({
      x: 50,
      y: 70,
      width: 120,
      height: 90,
    });
  });

  it("keeps all markers on rendered corners after repeated right-triangle resize operations", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    const afterHorizontal = applyTrianglePatch(
      triangle as TriangleObject,
      triangleCornerDragPatch(triangle, "horizontal", 210, 55),
    );
    const afterVertical = applyTrianglePatch(
      afterHorizontal,
      triangleCornerDragPatch(afterHorizontal, "vertical", 25, 210),
    );
    const afterRight = applyTrianglePatch(
      afterVertical,
      triangleCornerDragPatch(afterVertical, "right", 50, 70),
    );

    expectHandleOnRenderedCorner(afterRight, "right");
    expectHandleOnRenderedCorner(afterRight, "horizontal");
    expectHandleOnRenderedCorner(afterRight, "vertical");
  });

  it("keeps rotated triangle markers on rendered corners after resizing", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 100, y: 200, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");
    triangle.rotation = 45;

    const horizontalHandle = triangleCornerHandlePosition(
      triangle as TriangleObject,
      "horizontal",
    );
    const afterHorizontal = applyTrianglePatch(
      triangle as TriangleObject,
      triangleCornerDragPatch(
        triangle,
        "horizontal",
        horizontalHandle.x + 60,
        horizontalHandle.y + 35,
      ),
    );
    const verticalHandle = triangleCornerHandlePosition(
      afterHorizontal,
      "vertical",
    );
    const afterVertical = applyTrianglePatch(
      afterHorizontal,
      triangleCornerDragPatch(
        afterHorizontal,
        "vertical",
        verticalHandle.x - 50,
        verticalHandle.y + 45,
      ),
    );

    expectHandleOnRenderedCorner(afterVertical, "right");
    expectHandleOnRenderedCorner(afterVertical, "horizontal");
    expectHandleOnRenderedCorner(afterVertical, "vertical");
  });

  it("keeps triangle legs positive after a corner drag crosses the opposite leg", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    expect(triangleCornerDragPatch(triangle, "right", 300, 300)).toMatchObject({
      width: 8,
      height: 8,
    });
  });
});
