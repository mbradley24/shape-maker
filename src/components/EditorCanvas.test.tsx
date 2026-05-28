import { describe, expect, it } from "vitest";
import { createDiagramObject } from "../model/diagram";
import { transformedObjectPatch } from "./EditorCanvas";

describe("transformedObjectPatch", () => {
  it("normalizes ellipse baseline scale before updating dimensions", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");

    const patch = transformedObjectPatch(ellipse, {
      x: 15,
      y: 25,
      rotation: 30,
      scaleX: ellipse.width / 2,
      scaleY: ellipse.height / 2,
    });

    expect(patch).toMatchObject({
      x: 15,
      y: 25,
      rotation: 30,
      width: ellipse.width,
      height: ellipse.height,
    });
  });
});
