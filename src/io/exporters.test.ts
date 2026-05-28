import { describe, expect, it } from "vitest";
import { createDiagramObject } from "../model/diagram";
import { exportDiagramSvg } from "./exporters";

describe("exportDiagramSvg", () => {
  it("exports representative shapes in layer order", () => {
    const arrow = createDiagramObject(
      { type: "arrow", x: 12, y: 24, id: "arrow" },
      1,
    );
    const text = createDiagramObject(
      { type: "text", x: 30, y: 40, id: "text" },
      0,
    );
    if (text.type !== "text") throw new Error("expected text");
    text.text = "A<B";

    const svg = exportDiagramSvg([arrow, text], 640, 480);

    expect(svg).toContain('width="640"');
    expect(svg.indexOf("<text")).toBeLessThan(svg.indexOf("<line"));
    expect(svg).toContain("A&lt;B");
    expect(svg).toContain('marker-end="url(#arrowhead)"');
  });

  it("handles an empty canvas intentionally", () => {
    expect(exportDiagramSvg([], 100, 80)).toContain('viewBox="0 0 100 80"');
  });
});
