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

  it("exports triangles as right-angle polygons", () => {
    const triangle = createDiagramObject(
      { type: "triangle", x: 12, y: 24, id: "triangle" },
      0,
    );
    if (triangle.type !== "triangle") throw new Error("expected triangle");

    const svg = exportDiagramSvg([triangle], 640, 480);

    expect(svg).toContain(
      '<polygon transform="translate(12 24) rotate(0)" points="0,0 140,0 0,120"',
    );
  });

  it("handles an empty canvas intentionally", () => {
    expect(exportDiagramSvg([], 100, 80)).toContain('viewBox="0 0 100 80"');
  });

  it("renders the unit indicator once a unit is set", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 10, y: 20, id: "rect" },
      0,
    );

    const svg = exportDiagramSvg([rectangle], 640, 480, {
      unit: "in",
      pixelsPerUnit: 160 / 5.25,
    });

    expect(svg).toContain(">Units: in</text>");
    expect(svg.indexOf("</svg>")).toBeGreaterThan(svg.indexOf("Units: in"));
  });

  it("renders the unit indicator even before the scale is calibrated", () => {
    const svg = exportDiagramSvg([], 640, 480, {
      unit: "mm",
      pixelsPerUnit: null,
    });

    expect(svg).toContain(">Units: mm</text>");
  });

  it("renders the force unit in the indicator without requiring a length unit", () => {
    const svg = exportDiagramSvg([], 640, 480, null, {
      unit: "N",
      pixelsPerUnit: 1.8,
    });

    expect(svg).toContain(">Force: N</text>");
    expect(svg).not.toContain("Units:");
  });

  it("renders both length and force units in a single indicator", () => {
    const svg = exportDiagramSvg(
      [],
      640,
      480,
      { unit: "in", pixelsPerUnit: 160 / 5.25 },
      { unit: "kN", pixelsPerUnit: null },
    );

    expect(svg).toContain(">Units: in | Force: kN</text>");
  });

  it("omits the unit indicator when no unit is set", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 10, y: 20, id: "rect" },
      0,
    );

    expect(exportDiagramSvg([rectangle], 640, 480)).not.toContain("Units:");
    expect(exportDiagramSvg([rectangle], 640, 480)).not.toContain("Force:");
    expect(exportDiagramSvg([rectangle], 640, 480, null, null)).not.toContain(
      "Units:",
    );
  });
});
