import { describe, expect, it } from "vitest";
import {
  createDiagramObject,
  initialEditorState,
  lineMetrics,
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
      state.objects.find((object) => object.type === "arrow"),
    ).toMatchObject({ points: [0, 0, 180, 0] });
    expect(
      state.objects.every((object) => Number.isFinite(object.rotation)),
    ).toBe(true);
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
});
