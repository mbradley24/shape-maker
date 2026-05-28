import { describe, expect, it } from "vitest";
import { createDiagramObject } from "../model/diagram";
import { ellipseRenderProps, transformedObjectPatch } from "./EditorCanvas";

describe("transformedObjectPatch", () => {
  it("keeps ellipse dimensions stable when the rendered node is not scaled", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");

    const patch = transformedObjectPatch(ellipse, {
      x: 15,
      y: 25,
      rotation: 30,
      scaleX: 1,
      scaleY: 1,
    });

    expect(patch).toMatchObject({
      x: 15,
      y: 25,
      rotation: 30,
      width: ellipse.width,
      height: ellipse.height,
    });
  });

  it("updates ellipse dimensions from transformer scale without scaling stroke", () => {
    const ellipse = createDiagramObject(
      { type: "ellipse", x: 10, y: 20, id: "ellipse" },
      0,
    );
    if (ellipse.type !== "ellipse") throw new Error("expected ellipse");

    const patch = transformedObjectPatch(ellipse, {
      x: 15,
      y: 25,
      rotation: 30,
      scaleX: 1.5,
      scaleY: 0.5,
    });

    expect(patch).toMatchObject({
      width: ellipse.width * 1.5,
      height: ellipse.height * 0.5,
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
      radiusX: ellipse.width / 2,
      radiusY: ellipse.height / 2,
      offsetX: -ellipse.width / 2,
      offsetY: -ellipse.height / 2,
      fill: "#22c55e",
      stroke: "#1d4ed8",
      strokeWidth: 6,
    });
  });
});
