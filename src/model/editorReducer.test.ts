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
