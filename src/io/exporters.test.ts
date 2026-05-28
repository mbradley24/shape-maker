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
    expect(svg).toContain('marker-end="url(#arrowhead-0)"');
  });

  it("exports arrowheads with each arrow stroke color", () => {
    const firstArrow = createDiagramObject(
      { type: "arrow", x: 12, y: 24, id: "first" },
      0,
    );
    const secondArrow = createDiagramObject(
      { type: "arrow", x: 32, y: 48, id: "second" },
      1,
    );
    firstArrow.style.stroke = "#2563eb";
    secondArrow.style.stroke = "#16a34a";

    const svg = exportDiagramSvg([secondArrow, firstArrow], 640, 480);

    expect(svg).toContain('id="arrowhead-0"');
    expect(svg).toContain('fill="#2563eb"');
    expect(svg).toContain('marker-end="url(#arrowhead-0)"');
    expect(svg).toContain('id="arrowhead-1"');
    expect(svg).toContain('fill="#16a34a"');
    expect(svg).toContain('marker-end="url(#arrowhead-1)"');
    expect(svg).not.toContain(
      '<polygon points="0 0, 10 3.5, 0 7" fill="#b91c1c" />',
    );
  });

  it("handles an empty canvas intentionally", () => {
    expect(exportDiagramSvg([], 100, 80)).toContain('viewBox="0 0 100 80"');
  });
});
