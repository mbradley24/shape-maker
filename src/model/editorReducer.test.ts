import { describe, expect, it } from "vitest";
import {
  createDiagramObject,
  defaultStyle,
  initialEditorState,
  lineMetrics,
  rightTrianglePoints,
} from "./diagram";
import { editorReducer } from "./editorReducer";

describe("editorReducer", () => {
  it("creates each default shape with explicit geometry", () => {
    const shapes = [
      "rectangle",
      "ellipse",
      "triangle",
      "line",
      "arrow",
      "text",
    ] as const;
    let state = initialEditorState();

    shapes.forEach((shape, index) => {
      state = editorReducer(state, {
        type: "createObject",
        shape,
        x: 10 + index,
        y: 20 + index,
        id: shape,
      });
    });

    expect(state.objects).toHaveLength(shapes.length);
    expect(state.objects.map((object) => object.type)).toEqual(shapes);
    expect(
      state.objects.find((object) => object.type === "rectangle"),
    ).toMatchObject({ width: 160, height: 96 });
    expect(
      state.objects.find((object) => object.type === "ellipse"),
    ).toMatchObject({ width: 120, height: 120 });
    expect(
      state.objects.find((object) => object.type === "triangle"),
    ).toMatchObject({ width: 140, height: 120 });
    expect(
      state.objects.find((object) => object.type === "arrow"),
    ).toMatchObject({ points: [0, 0, 180, 0] });
    expect(
      state.objects.every((object) => Number.isFinite(object.rotation)),
    ).toBe(true);
  });

  it("creates triangles with right-angle render points", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 10, y: 20, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    expect(rightTrianglePoints(triangle)).toEqual([0, 0, 140, 0, 0, 120]);
  });

  it("nudges by the provided delta without moving unrelated objects", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 10,
      y: 20,
      id: "a",
    });
    state = editorReducer(state, {
      type: "createObject",
      shape: "ellipse",
      x: 100,
      y: 120,
      id: "b",
    });
    state = editorReducer(state, { type: "select", id: "a" });

    state = editorReducer(state, { type: "nudgeSelected", dx: 10, dy: -1 });

    expect(state.objects.find((object) => object.id === "a")).toMatchObject({
      x: 20,
      y: 19,
    });
    expect(state.objects.find((object) => object.id === "b")).toMatchObject({
      x: 100,
      y: 120,
    });
  });

  it("updates dimensions and rotation for the selected object only", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id: "a",
    });
    state = editorReducer(state, {
      type: "createObject",
      shape: "triangle",
      x: 0,
      y: 0,
      id: "b",
    });
    state = editorReducer(state, {
      type: "updateSelected",
      patch: { width: 220, height: 75, rotation: 30 },
    });

    expect(state.objects.find((object) => object.id === "b")).toMatchObject({
      width: 220,
      height: 75,
      rotation: 30,
    });
    expect(state.objects.find((object) => object.id === "a")).toMatchObject({
      width: 160,
      height: 96,
      rotation: 0,
    });
  });

  it("adds editable dimensions only to supported selected shapes", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id: "rect",
    });

    state = editorReducer(state, {
      type: "setSelectedDimension",
      dimension: "width",
      visible: true,
    });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 244,
    });

    expect(state.objects.find((object) => object.id === "rect")).toMatchObject({
      dimensions: ["width"],
      width: 244,
      height: 96,
      type: "rectangle",
    });

    state = editorReducer(state, {
      type: "createObject",
      shape: "line",
      x: 0,
      y: 0,
      id: "line",
    });
    state = editorReducer(state, {
      type: "setSelectedDimension",
      dimension: "height",
      visible: true,
    });

    expect(
      state.objects.find((object) => object.id === "line"),
    ).not.toHaveProperty("dimensions");
  });

  it("clamps typed dimension values while preserving the other measurement", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "triangle",
      x: 0,
      y: 0,
      id: "triangle",
    });
    state = editorReducer(state, {
      type: "setSelectedDimension",
      dimension: "height",
      visible: true,
    });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "height",
      value: 0,
    });

    expect(
      state.objects.find((object) => object.id === "triangle"),
    ).toMatchObject({
      type: "triangle",
      width: 140,
      height: 8,
      dimensions: ["height"],
    });
  });

  it("copies visual style without copying geometry or text", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "text",
      x: 0,
      y: 0,
      id: "source",
    });
    state = editorReducer(state, {
      type: "updateSelectedStyle",
      patch: { stroke: "#ff0000", fill: "#00ff00", strokeWidth: 8 },
    });
    state = editorReducer(state, { type: "updateText", text: "Source text" });
    state = editorReducer(state, { type: "copySelectedStyle" });
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 50,
      y: 60,
      id: "target",
    });
    state = editorReducer(state, { type: "applyCopiedStyle", id: "target" });

    const target = state.objects.find((object) => object.id === "target");
    expect(target).toMatchObject({
      x: 50,
      y: 60,
      width: 160,
      height: 96,
      style: { stroke: "#ff0000", fill: "#00ff00", strokeWidth: 8 },
    });
    expect(target).not.toHaveProperty("text", "Source text");
  });

  it("clears copied style after applying it once", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id: "source",
    });
    state = editorReducer(state, {
      type: "updateSelectedStyle",
      patch: { stroke: "#f97316", fill: "#f9a8d4", strokeWidth: 6 },
    });
    state = editorReducer(state, { type: "copySelectedStyle" });
    state = editorReducer(state, {
      type: "createObject",
      shape: "ellipse",
      x: 200,
      y: 0,
      id: "first-target",
    });
    state = editorReducer(state, {
      type: "createObject",
      shape: "triangle",
      x: 400,
      y: 0,
      id: "second-target",
    });

    state = editorReducer(state, {
      type: "applyCopiedStyle",
      id: "first-target",
    });

    expect(state.copiedStyle).toBeNull();
    expect(
      state.objects.find((object) => object.id === "first-target"),
    ).toMatchObject({
      style: { stroke: "#f97316", fill: "#f9a8d4", strokeWidth: 6 },
    });

    state = editorReducer(state, {
      type: "applyCopiedStyle",
      id: "second-target",
    });

    expect(
      state.objects.find((object) => object.id === "second-target"),
    ).toMatchObject({
      style: defaultStyle,
    });
  });

  it("selects normally and creates default-styled shapes after format painter is used", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id: "source",
    });
    state = editorReducer(state, {
      type: "updateSelectedStyle",
      patch: { stroke: "#f97316", fill: "#f9a8d4", strokeWidth: 6 },
    });
    state = editorReducer(state, { type: "copySelectedStyle" });
    state = editorReducer(state, {
      type: "createObject",
      shape: "ellipse",
      x: 200,
      y: 0,
      id: "target",
    });

    state = editorReducer(state, { type: "applyCopiedStyle", id: "target" });
    state = editorReducer(state, { type: "select", id: "source" });
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 400,
      y: 0,
      id: "new-shape",
    });

    expect(state.selectedId).toBe("new-shape");
    expect(
      state.objects.find((object) => object.id === "source"),
    ).toMatchObject({
      style: { stroke: "#f97316", fill: "#f9a8d4", strokeWidth: 6 },
    });
    expect(
      state.objects.find((object) => object.id === "new-shape"),
    ).toMatchObject({
      style: defaultStyle,
    });
  });

  it("duplicates, deletes, and moves layers deterministically", () => {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id: "a",
    });
    state = editorReducer(state, {
      type: "createObject",
      shape: "ellipse",
      x: 0,
      y: 0,
      id: "b",
    });
    state = editorReducer(state, { type: "select", id: "a" });
    state = editorReducer(state, { type: "duplicateSelected", id: "a-copy" });

    expect(state.objects.map((object) => object.id)).toEqual([
      "a",
      "b",
      "a-copy",
    ]);
    expect(state.selectedId).toBe("a-copy");

    state = editorReducer(state, { type: "sendBackward" });
    expect(state.objects.find((object) => object.id === "a-copy")?.zIndex).toBe(
      1,
    );

    state = editorReducer(state, { type: "deleteSelected" });
    expect(state.objects.map((object) => object.id)).toEqual(["a", "b"]);
    expect(state.selectedId).toBeNull();
  });
});

describe("measurement units and scale calibration", () => {
  function stateWithRectangle(id = "rect") {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id,
    });
    return state;
  }

  it("keeps dimension edits in raw pixels while no unit is set", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 244,
    });

    expect(state.document.measurement).toBeUndefined();
    expect(state.objects[0]).toMatchObject({ width: 244, height: 96 });
  });

  it("sets the global unit without calibrating a scale", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });

    expect(state.document.measurement).toEqual({
      unit: "in",
      pixelsPerUnit: null,
    });
    expect(state.dirty).toBe(true);
  });

  it("allows switching the unit or returning to pixels before calibration", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "mm" });

    expect(state.document.measurement).toEqual({
      unit: "mm",
      pixelsPerUnit: null,
    });

    state = editorReducer(state, { type: "setMeasurementUnit", unit: null });
    expect(state.document.measurement).toBeUndefined();
  });

  it("calibrates the scale from the first dimension entry without resizing", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 5.25,
    });

    expect(state.objects[0]).toMatchObject({ width: 160, height: 96 });
    expect(state.document.measurement?.unit).toBe("in");
    expect(state.document.measurement?.pixelsPerUnit).toBeCloseTo(
      160 / 5.25,
      10,
    );
  });

  it("resizes subsequent dimension entries using the calibrated scale", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 5.25,
    });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "height",
      value: 10.5,
    });

    const rectangle = state.objects[0];
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");
    expect(rectangle.height).toBeCloseTo(320, 10);
    expect(rectangle.height).toBeCloseTo(rectangle.width * 2, 10);
    expect(rectangle.width).toBe(160);
  });

  it("keeps already-drawn shapes at their pixel sizes after calibration", () => {
    let state = stateWithRectangle("first");
    state = editorReducer(state, {
      type: "createObject",
      shape: "ellipse",
      x: 300,
      y: 0,
      id: "second",
    });
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "mm" });
    state = editorReducer(state, { type: "select", id: "first" });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 40,
    });

    expect(state.objects.find((object) => object.id === "first")).toMatchObject(
      { width: 160, height: 96 },
    );
    expect(
      state.objects.find((object) => object.id === "second"),
    ).toMatchObject({ width: 120, height: 120 });
  });

  it("ignores non-positive calibration values", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });
    const beforeZero = state;

    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 0,
    });
    expect(state).toBe(beforeZero);

    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: -4,
    });
    expect(state).toBe(beforeZero);
    expect(state.document.measurement?.pixelsPerUnit).toBeNull();
  });

  it("locks the unit once the scale is calibrated", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 5.25,
    });
    const calibrated = state;

    state = editorReducer(state, { type: "setMeasurementUnit", unit: "mm" });
    expect(state).toBe(calibrated);

    state = editorReducer(state, { type: "setMeasurementUnit", unit: null });
    expect(state).toBe(calibrated);
  });

  it("clamps calibrated resizes to the minimum pixel size", () => {
    let state = stateWithRectangle();
    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 160,
    });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "height",
      value: 0.5,
    });

    expect(state.objects[0]).toMatchObject({ height: 8 });
  });
});

describe("force units and magnitude calibration", () => {
  function stateWithArrow(id = "arrow") {
    let state = initialEditorState();
    state = editorReducer(state, {
      type: "createObject",
      shape: "arrow",
      x: 0,
      y: 0,
      id,
    });
    return state;
  }

  function arrowPoints(
    state: ReturnType<typeof initialEditorState>,
    id: string,
  ) {
    const arrow = state.objects.find((object) => object.id === id);
    if (!arrow || arrow.type !== "arrow") throw new Error("expected arrow");
    return arrow.points;
  }

  it("sets the global force unit without calibrating a scale or touching the length unit", () => {
    let state = stateWithArrow();
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });

    expect(state.document.forceMeasurement).toEqual({
      unit: "N",
      pixelsPerUnit: null,
    });
    expect(state.document.measurement).toBeUndefined();
    expect(state.dirty).toBe(true);
  });

  it("allows switching the force unit or clearing it before calibration", () => {
    let state = stateWithArrow();
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    state = editorReducer(state, { type: "setForceUnit", unit: "lbf" });

    expect(state.document.forceMeasurement).toEqual({
      unit: "lbf",
      pixelsPerUnit: null,
    });

    state = editorReducer(state, { type: "setForceUnit", unit: null });
    expect(state.document.forceMeasurement).toBeUndefined();
  });

  it("ignores magnitude edits while no force unit is set", () => {
    const state = stateWithArrow();

    const next = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });

    expect(next).toBe(state);
    expect(arrowPoints(next, "arrow")).toEqual([0, 0, 180, 0]);
  });

  it("calibrates the force scale from the first magnitude without resizing", () => {
    let state = stateWithArrow();
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });

    expect(arrowPoints(state, "arrow")).toEqual([0, 0, 180, 0]);
    expect(state.document.forceMeasurement?.unit).toBe("N");
    expect(state.document.forceMeasurement?.pixelsPerUnit).toBeCloseTo(
      180 / 100,
      10,
    );
  });

  it("resizes subsequent magnitude entries proportionally on the calibrated scale", () => {
    let state = stateWithArrow("first");
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });
    state = editorReducer(state, {
      type: "createObject",
      shape: "arrow",
      x: 0,
      y: 300,
      id: "second",
    });
    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 200,
    });

    const firstLength = Math.hypot(
      arrowPoints(state, "first")[2] - arrowPoints(state, "first")[0],
      arrowPoints(state, "first")[3] - arrowPoints(state, "first")[1],
    );
    const second = arrowPoints(state, "second");
    const secondLength = Math.hypot(
      second[2] - second[0],
      second[3] - second[1],
    );

    expect(firstLength).toBe(180);
    expect(secondLength).toBeCloseTo(360, 10);
    expect(secondLength).toBeCloseTo(firstLength * 2, 10);
    expect(state.document.forceMeasurement?.pixelsPerUnit).toBeCloseTo(1.8, 10);
  });

  it("preserves the start point and direction when resizing a magnitude", () => {
    let state = stateWithArrow();
    state = editorReducer(state, {
      type: "updateSelected",
      patch: { points: [10, 20, 40, 60] },
    });
    state = editorReducer(state, { type: "setForceUnit", unit: "kN" });
    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });

    const before = state.objects[0];
    if (before.type !== "arrow") throw new Error("expected arrow");
    const angleBefore = lineMetrics(before).angle;

    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 25,
    });

    const after = state.objects[0];
    if (after.type !== "arrow") throw new Error("expected arrow");
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.points[0]).toBe(10);
    expect(after.points[1]).toBe(20);
    expect(lineMetrics(after).angle).toBeCloseTo(angleBefore, 10);
    // 50 px was calibrated to 100 kN, so 25 kN is exactly 12.5 px.
    expect(lineMetrics(after).length).toBeCloseTo(12.5, 10);
    expect(after.points[2]).toBeCloseTo(17.5, 10);
    expect(after.points[3]).toBeCloseTo(30, 10);
  });

  it("ignores non-positive magnitudes before and after calibration", () => {
    let state = stateWithArrow();
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    const uncalibrated = state;

    state = editorReducer(state, { type: "updateSelectedMagnitude", value: 0 });
    expect(state).toBe(uncalibrated);
    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: -50,
    });
    expect(state).toBe(uncalibrated);
    expect(state.document.forceMeasurement?.pixelsPerUnit).toBeNull();

    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });
    const calibrated = state;
    state = editorReducer(state, { type: "updateSelectedMagnitude", value: 0 });
    expect(state).toBe(calibrated);
  });

  it("locks the force unit once the scale is calibrated", () => {
    let state = stateWithArrow();
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });
    const calibrated = state;

    state = editorReducer(state, { type: "setForceUnit", unit: "lbf" });
    expect(state).toBe(calibrated);

    state = editorReducer(state, { type: "setForceUnit", unit: null });
    expect(state).toBe(calibrated);
  });

  it("ignores magnitude edits when the selection is not an arrow", () => {
    let state = stateWithArrow();
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    state = editorReducer(state, {
      type: "createObject",
      shape: "line",
      x: 0,
      y: 0,
      id: "line",
    });
    const withLineSelected = state;

    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });

    expect(state).toBe(withLineSelected);
    expect(state.document.forceMeasurement?.pixelsPerUnit).toBeNull();
  });

  it("cannot calibrate from a zero-length arrow", () => {
    let state = stateWithArrow();
    state = editorReducer(state, {
      type: "updateSelected",
      patch: { points: [10, 20, 10, 20] },
    });
    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    const before = state;

    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 100,
    });

    expect(state).toBe(before);
    expect(state.document.forceMeasurement?.pixelsPerUnit).toBeNull();
  });

  it("keeps the length scale and force scale fully independent", () => {
    let state = stateWithArrow("arrow");
    state = editorReducer(state, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id: "rect",
    });

    state = editorReducer(state, { type: "setMeasurementUnit", unit: "in" });
    state = editorReducer(state, {
      type: "updateSelectedDimension",
      dimension: "width",
      value: 5.25,
    });

    // Length calibration must not create or touch the force scale.
    expect(state.document.measurement?.pixelsPerUnit).toBeCloseTo(
      160 / 5.25,
      10,
    );
    expect(state.document.forceMeasurement).toBeUndefined();

    state = editorReducer(state, { type: "setForceUnit", unit: "N" });
    state = editorReducer(state, { type: "select", id: "arrow" });
    state = editorReducer(state, {
      type: "updateSelectedMagnitude",
      value: 90,
    });

    // Force calibration must not touch the length scale.
    expect(state.document.forceMeasurement?.pixelsPerUnit).toBeCloseTo(2, 10);
    expect(state.document.measurement?.pixelsPerUnit).toBeCloseTo(
      160 / 5.25,
      10,
    );
  });
});

describe("lineMetrics", () => {
  it("derives line length and angle from endpoints", () => {
    const line = createDiagramObject(
      { type: "line", x: 0, y: 0, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");
    line.points = [0, 0, 3, 4];

    expect(lineMetrics(line)).toMatchObject({ dx: 3, dy: 4, length: 5 });
    expect(lineMetrics(line).angle).toBeCloseTo(53.13, 2);
  });
});
