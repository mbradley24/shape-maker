import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type Konva from "konva";
import { createDiagramObject, rightTrianglePoints } from "../model/diagram";
import type { BoxObject, DiagramObject, LineObject } from "../model/diagram";
import type { TextObject } from "./EditorCanvas";
import {
  canvasPointerAction,
  dimensionEditCommitAction,
  dimensionEditValue,
  dimensionGuide,
  dimensionLabel,
  UnitIndicator,
  draggedObjectPositionPatch,
  ellipseRenderProps,
  inlineTextEditCommitAction,
  inlineTextEditorStyle,
  isCanvasSurfaceTarget,
  isDimensionableObject,
  visibleObjectDimensions,
  lineEndpointDragPatch,
  lineEndpointHandlePosition,
  LineEndpointHandles,
  lineLikeRenderProps,
  rectangleResizeDragPatch,
  rectangleResizeHandlePosition,
  RectangleResizeHandles,
  shouldStartInlineTextEdit,
  triangleCornerDragPatch,
  triangleCornerHandlePosition,
  TriangleCornerHandles,
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
type RectangleObject = BoxObject & { type: "rectangle" };

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

function applyRectanglePatch(
  rectangle: RectangleObject,
  patch: Partial<DiagramObject>,
): RectangleObject {
  return { ...rectangle, ...patch, type: "rectangle" };
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

describe("rectangle resize helpers", () => {
  it("places side and corner handles on the rendered rectangle edges", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 30, y: 40, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");

    expect(rectangleResizeHandlePosition(rectangle, "top-left")).toEqual({
      x: 30,
      y: 40,
    });
    expect(rectangleResizeHandlePosition(rectangle, "top")).toEqual({
      x: 110,
      y: 40,
    });
    expect(rectangleResizeHandlePosition(rectangle, "right")).toEqual({
      x: 190,
      y: 88,
    });
    expect(rectangleResizeHandlePosition(rectangle, "bottom")).toEqual({
      x: 110,
      y: 136,
    });
  });

  it("updates only width when the right side handle is dragged", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 30, y: 40, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");

    expect(rectangleResizeDragPatch(rectangle, "right", 230, 130)).toEqual({
      x: 30,
      y: 40,
      width: 200,
      height: 96,
    });
  });

  it("moves the left side while preserving the right edge", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 30, y: 40, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");

    const rightBefore = rectangleResizeHandlePosition(rectangle, "right");
    const patch = rectangleResizeDragPatch(rectangle, "left", 10, 150);
    const resized = applyRectanglePatch(rectangle as RectangleObject, patch);

    expect(patch).toEqual({
      x: 10,
      y: 40,
      width: 180,
      height: 96,
    });
    expect(rectangleResizeHandlePosition(resized, "right")).toEqual(
      rightBefore,
    );
  });

  it("moves a corner while preserving the opposite corner", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 30, y: 40, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");

    const bottomRightBefore = rectangleResizeHandlePosition(
      rectangle,
      "bottom-right",
    );
    const patch = rectangleResizeDragPatch(rectangle, "top-left", 50, 60);
    const resized = applyRectanglePatch(rectangle as RectangleObject, patch);

    expect(patch).toEqual({
      x: 50,
      y: 60,
      width: 140,
      height: 76,
    });
    expect(rectangleResizeHandlePosition(resized, "bottom-right")).toEqual(
      bottomRightBefore,
    );
  });

  it("preserves the opposite corner while resizing a rotated rectangle", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 100, y: 200, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");
    rectangle.rotation = 45;
    rectangle.width = 120;
    rectangle.height = 80;

    const bottomRightBefore = rectangleResizeHandlePosition(
      rectangle,
      "bottom-right",
    );
    const topLeftOffset = rotatePoint(20, 10, rectangle.rotation);
    const patch = rectangleResizeDragPatch(
      rectangle,
      "top-left",
      rectangle.x + topLeftOffset.x,
      rectangle.y + topLeftOffset.y,
    );
    const resized = applyRectanglePatch(rectangle as RectangleObject, patch);
    const bottomRightAfter = rectangleResizeHandlePosition(
      resized,
      "bottom-right",
    );

    expect(patch.width).toBeCloseTo(100);
    expect(patch.height).toBeCloseTo(70);
    expect(bottomRightAfter.x).toBeCloseTo(bottomRightBefore.x);
    expect(bottomRightAfter.y).toBeCloseTo(bottomRightBefore.y);
  });

  it("resizes a rotated side handle along local width only", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 100, y: 200, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");
    rectangle.rotation = 30;

    const leftBefore = rectangleResizeHandlePosition(rectangle, "left");
    const rightHandle = rectangleResizeHandlePosition(rectangle, "right");
    const dragOffset = rotatePoint(40, 30, rectangle.rotation);
    const patch = rectangleResizeDragPatch(
      rectangle,
      "right",
      rightHandle.x + dragOffset.x,
      rightHandle.y + dragOffset.y,
    );
    const resized = applyRectanglePatch(rectangle as RectangleObject, patch);

    expect(patch.x).toBeCloseTo(rectangle.x);
    expect(patch.y).toBeCloseTo(rectangle.y);
    expect(patch.width).toBeCloseTo(rectangle.width + 40);
    expect(patch.height).toBe(rectangle.height);
    expect(rectangleResizeHandlePosition(resized, "left").x).toBeCloseTo(
      leftBefore.x,
    );
    expect(rectangleResizeHandlePosition(resized, "left").y).toBeCloseTo(
      leftBefore.y,
    );
  });

  it("enforces the minimum size when a side drag crosses the opposite edge", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 30, y: 40, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");

    const rightBefore = rectangleResizeHandlePosition(rectangle, "right");
    const patch = rectangleResizeDragPatch(rectangle, "left", 300, 88);
    const resized = applyRectanglePatch(rectangle as RectangleObject, patch);

    expect(patch).toEqual({
      x: 182,
      y: 40,
      width: 8,
      height: 96,
    });
    expect(rectangleResizeHandlePosition(resized, "right")).toEqual(
      rightBefore,
    );
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

describe("dimension helpers", () => {
  it("renders a rectangle width dimension with extension lines and arrows", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 30, y: 40, id: "rect" },
      0,
    ) as BoxObject & { type: "rectangle" };
    rectangle.width = 225;

    const guide = dimensionGuide(rectangle, "width");

    expect(guide.text).toBe("225");
    expect(dimensionLabel(rectangle, "width")).toBe("225");
    expect(guide.extensions[0].start).toEqual({ x: 30, y: 36 });
    expect(guide.extensions[0].end).toEqual({ x: 30, y: 4 });
    expect(guide.extensions[1].start).toEqual({ x: 255, y: 36 });
    expect(guide.extensions[1].end).toEqual({ x: 255, y: 4 });
    expect(guide.arrows[0].end).toEqual({ x: 30, y: 12 });
    expect(guide.arrows[1].end).toEqual({ x: 255, y: 12 });
    expect(guide.arrows[0].start.x).toBeLessThan(guide.arrows[1].start.x);
    expect(guide.label.rotation).toBe(0);
  });

  it("breaks the dimension line around the value text", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 100, id: "rect" },
      0,
    ) as BoxObject & { type: "rectangle" };
    rectangle.width = 200;

    const guide = dimensionGuide(rectangle, "width");

    const gapStart = guide.arrows[0].start.x;
    const gapEnd = guide.arrows[1].start.x;
    expect(gapStart).toBeLessThan(100);
    expect(gapEnd).toBeGreaterThan(100);
    expect(guide.label.x).toBeGreaterThan(gapStart);
    expect(guide.label.x).toBeLessThan(gapEnd);
    expect(guide.label.y).toBeCloseTo(100 - 28 - 6);
  });

  it("places the value above an unbroken dimension line on narrow shapes", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 30, y: 40, id: "rect" },
      0,
    ) as BoxObject & { type: "rectangle" };
    rectangle.width = 30;

    const guide = dimensionGuide(rectangle, "width");

    expect(guide.arrows[0].start).toEqual(guide.arrows[1].start);
    expect(guide.label.y).toBeLessThan(guide.arrows[0].start.y);
  });

  it("labels ellipse dimensions as diameters", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    ) as BoxObject & { type: "ellipse" };

    const resized = { ...ellipse, width: 180, height: 90 };

    expect(dimensionLabel(resized, "width")).toBe("⌀180");
    expect(dimensionLabel(resized, "height")).toBe("⌀90");
  });

  it("keeps rotated triangle leg dimensions attached to the rendered leg", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 100, y: 200, id: "triangle" },
      0,
    ) as BoxObject & { type: "triangle" };
    triangle.rotation = 90;

    const guide = dimensionGuide(triangle, "height");

    expect(dimensionLabel(triangle, "height")).toBe("120");
    expect(guide.arrows[0].end.x).toBeCloseTo(100);
    expect(guide.arrows[0].end.y).toBeCloseTo(172);
    expect(guide.arrows[1].end.x).toBeCloseTo(-20);
    expect(guide.arrows[1].end.y).toBeCloseTo(172);
    expect(guide.label.rotation).toBe(0);
  });

  it("shows bare pixel labels while the measurement is uncalibrated", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    ) as RectangleObject;

    expect(dimensionLabel(rectangle, "width")).toBe("160");
    expect(
      dimensionLabel(rectangle, "width", { unit: "in", pixelsPerUnit: null }),
    ).toBe("160");
    expect(
      dimensionEditValue(rectangle, "width", {
        unit: "in",
        pixelsPerUnit: null,
      }),
    ).toBe("160");
  });

  it("labels dimensions with the calibrated unit value", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    ) as RectangleObject;
    const measurement = { unit: "in", pixelsPerUnit: 160 / 5.25 } as const;

    expect(dimensionLabel(rectangle, "width", measurement)).toBe("5.25 in");
    expect(dimensionGuide(rectangle, "width", measurement).text).toBe(
      "5.25 in",
    );
    expect(dimensionEditValue(rectangle, "width", measurement)).toBe("5.25");
  });

  it("keeps the diameter prefix ahead of calibrated ellipse labels", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 0, y: 0, id: "ellipse" },
      0,
    ) as BoxObject & { type: "ellipse" };
    const resized = { ...ellipse, width: 180, height: 90 };
    const measurement = { unit: "in", pixelsPerUnit: 180 / 3.5 } as const;

    expect(dimensionLabel(resized, "width", measurement)).toBe("⌀3.5 in");
    expect(dimensionLabel(resized, "height", measurement)).toBe("⌀1.75 in");
  });

  it("renders the unit indicator only when a unit is set", () => {
    const { container, rerender } = render(<UnitIndicator />);
    expect(container.querySelector('[name="unit-indicator"]')).toBeNull();

    rerender(
      <UnitIndicator measurement={{ unit: "mm", pixelsPerUnit: null }} />,
    );

    const indicator = container.querySelector('[name="unit-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.getAttribute("text")).toBe("Units: mm");
  });

  it("commits an edited dimension value for the selected shape", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );

    expect(
      dimensionEditCommitAction(rectangle, "rect", "width", "320"),
    ).toEqual({
      type: "updateSelectedDimension",
      dimension: "width",
      value: 320,
    });
  });

  it("ignores dimension edits for unselected shapes or invalid values", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );

    expect(dimensionEditCommitAction(rectangle, "other", "width", "320")).toBe(
      null,
    );
    expect(dimensionEditCommitAction(rectangle, "rect", "width", "abc")).toBe(
      null,
    );
    expect(dimensionEditCommitAction(null, "rect", "width", "320")).toBe(null);
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

describe("shape handle styling", () => {
  it("renders every triangle corner handle with the shared blue stroke", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    const { container } = render(
      <TriangleCornerHandles object={triangle} dispatch={vi.fn()} />,
    );

    const handles = container.querySelectorAll('[name$="-corner-handle"]');
    expect(handles).toHaveLength(3);

    for (const corner of ["right", "horizontal", "vertical"]) {
      const handle = container.querySelector(
        `[name="triangle-${corner}-corner-handle"]`,
      );
      expect(handle).not.toBeNull();
      expect(handle!.getAttribute("stroke")).toBe("#2563eb");
      expect(handle!.getAttribute("fill")).toBe("#ffffff");
      expect(handle!.getAttribute("radius")).toBe("7");
      expect(handle!.getAttribute("stroke-width")).toBe("2");
    }

    expect(container.innerHTML).not.toContain("#7c3aed");
  });

  it("renders triangle corner handles without text labels", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 30, y: 40, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    const { container } = render(
      <TriangleCornerHandles object={triangle} dispatch={vi.fn()} />,
    );

    expect(container.querySelectorAll('[name$="-corner-label"]')).toHaveLength(
      0,
    );
    for (const corner of ["right", "horizontal", "vertical"]) {
      expect(
        container.querySelector(`[name="triangle-${corner}-corner-label"]`),
      ).toBeNull();
    }

    expect(container.querySelectorAll('[name$="-corner-handle"]')).toHaveLength(
      3,
    );
  });

  it("keeps line endpoint handles on their existing blue styling", () => {
    const line = createDiagramObject(
      { type: "line", x: 10, y: 20, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");

    const { container } = render(
      <LineEndpointHandles object={line} dispatch={vi.fn()} />,
    );

    const handles = container.querySelectorAll('[name$="-endpoint-handle"]');
    expect(handles).toHaveLength(2);
    for (const handle of handles) {
      expect(handle.getAttribute("stroke")).toBe("#2563eb");
      expect(handle.getAttribute("fill")).toBe("#ffffff");
      expect(handle.getAttribute("radius")).toBe("6");
      expect(handle.getAttribute("stroke-width")).toBe("2");
    }
  });

  it("keeps rectangle resize handles on their existing teal styling", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 10, y: 20, id: "rectangle" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");

    const { container } = render(
      <RectangleResizeHandles object={rectangle} dispatch={vi.fn()} />,
    );

    const handles = container.querySelectorAll('[name$="-resize-handle"]');
    expect(handles).toHaveLength(8);
    for (const handle of handles) {
      expect(handle.getAttribute("stroke")).toBe("#0f766e");
      expect(handle.getAttribute("fill")).toBe("#ffffff");
      expect(handle.getAttribute("radius")).toBe("6");
      expect(handle.getAttribute("stroke-width")).toBe("2");
    }
  });
});

describe("line length dimension helpers", () => {
  function makeLine(points: LineObject["points"], x = 10, y = 20) {
    const line = createDiagramObject({ type: "line", x, y, id: "line" }, 0);
    if (line.type !== "line") throw new Error("expected line");
    return { ...line, type: "line" as const, points };
  }

  it("treats plain lines as dimensionable but never arrows", () => {
    const line = makeLine([0, 0, 180, 0]);
    const arrow = createDiagramObject(
      { type: "arrow", x: 10, y: 20, id: "arrow" },
      0,
    );

    expect(isDimensionableObject(line)).toBe(true);
    expect(isDimensionableObject(arrow)).toBe(false);
  });

  it("shows the length dimension for a selected line without a toggle", () => {
    const line = makeLine([0, 0, 180, 0]);

    expect(visibleObjectDimensions(line, "line")).toEqual(["length"]);
    expect(visibleObjectDimensions(line, null)).toEqual([]);
    expect(visibleObjectDimensions(line, "other")).toEqual([]);
  });

  it("keeps a toggled length dimension visible when the line is deselected", () => {
    const line = makeLine([0, 0, 180, 0]);
    line.dimensions = ["length"];

    expect(visibleObjectDimensions(line, null)).toEqual(["length"]);
    expect(visibleObjectDimensions(line, "line")).toEqual(["length"]);
  });

  it("never reveals dimensions for a selected arrow", () => {
    const arrow = createDiagramObject(
      { type: "arrow", x: 10, y: 20, id: "arrow" },
      0,
    );

    expect(visibleObjectDimensions(arrow, "arrow")).toEqual([]);
  });

  it("does not add dimensions to boxes just because they are selected", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );

    expect(visibleObjectDimensions(rectangle, "rect")).toEqual([]);
  });

  it("renders a horizontal line dimension like a rectangle width dimension", () => {
    const line = makeLine([0, 0, 180, 0], 10, 20);

    const guide = dimensionGuide(line, "length");

    expect(guide.text).toBe("180");
    expect(guide.extensions[0].start.x).toBeCloseTo(10);
    expect(guide.extensions[0].start.y).toBeCloseTo(16);
    expect(guide.extensions[0].end.x).toBeCloseTo(10);
    expect(guide.extensions[0].end.y).toBeCloseTo(-16);
    expect(guide.extensions[1].start.x).toBeCloseTo(190);
    expect(guide.extensions[1].start.y).toBeCloseTo(16);
    expect(guide.arrows[0].end.x).toBeCloseTo(10);
    expect(guide.arrows[0].end.y).toBeCloseTo(-8);
    expect(guide.arrows[1].end.x).toBeCloseTo(190);
    expect(guide.arrows[1].end.y).toBeCloseTo(-8);
    expect(guide.arrows[0].start.x).toBeLessThan(guide.arrows[1].start.x);
    expect(guide.label.rotation).toBeCloseTo(0);
  });

  it("keeps the dimension guide parallel to a diagonal line", () => {
    const line = makeLine([0, 0, 80, 60], 100, 200);

    const guide = dimensionGuide(line, "length");

    // Unit vector (0.8, 0.6); offset normal is (0.6, -0.8).
    expect(guide.text).toBe("100");
    expect(guide.extensions[0].start.x).toBeCloseTo(100 + 0.6 * 4);
    expect(guide.extensions[0].start.y).toBeCloseTo(200 - 0.8 * 4);
    expect(guide.extensions[0].end.x).toBeCloseTo(100 + 0.6 * 36);
    expect(guide.extensions[0].end.y).toBeCloseTo(200 - 0.8 * 36);
    expect(guide.arrows[0].end.x).toBeCloseTo(100 + 0.6 * 28);
    expect(guide.arrows[0].end.y).toBeCloseTo(200 - 0.8 * 28);
    expect(guide.arrows[1].end.x).toBeCloseTo(180 + 0.6 * 28);
    expect(guide.arrows[1].end.y).toBeCloseTo(260 - 0.8 * 28);
    expect(guide.label.rotation).toBeCloseTo(36.87, 1);
  });

  it("adds the object rotation to the dimension label angle", () => {
    const line = makeLine([0, 0, 80, 60], 100, 200);
    line.rotation = 15;

    const guide = dimensionGuide(line, "length");

    expect(guide.label.rotation).toBeCloseTo(51.87, 1);
  });

  it("labels line lengths with the calibrated unit and edits in unit values", () => {
    const line = makeLine([0, 0, 180, 0]);
    const measurement = { unit: "in", pixelsPerUnit: 180 / 5.25 } as const;

    expect(dimensionLabel(line, "length", measurement)).toBe("5.25 in");
    expect(dimensionGuide(line, "length", measurement).text).toBe("5.25 in");
    expect(dimensionEditValue(line, "length", measurement)).toBe("5.25");
  });

  it("falls back to rounded pixel lengths while no scale is calibrated", () => {
    const line = makeLine([0, 0, 80, 60]);

    expect(dimensionLabel(line, "length")).toBe("100");
    expect(dimensionEditValue(line, "length")).toBe("100");
    expect(
      dimensionLabel(line, "length", { unit: "in", pixelsPerUnit: null }),
    ).toBe("100");
    expect(
      dimensionEditValue(line, "length", { unit: "in", pixelsPerUnit: null }),
    ).toBe("100");
  });

  it("commits double-click length edits for the selected line only", () => {
    const line = makeLine([0, 0, 180, 0]);

    expect(dimensionEditCommitAction(line, "line", "length", "240")).toEqual({
      type: "updateSelectedDimension",
      dimension: "length",
      value: 240,
    });
    expect(dimensionEditCommitAction(line, "other", "length", "240")).toBe(
      null,
    );
    expect(dimensionEditCommitAction(line, "line", "length", "abc")).toBe(null);
  });

  it("never commits length edits for arrows", () => {
    const arrow = createDiagramObject(
      { type: "arrow", x: 10, y: 20, id: "arrow" },
      0,
    );

    expect(dimensionEditCommitAction(arrow, "arrow", "length", "240")).toBe(
      null,
    );
  });
});
