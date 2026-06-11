import { describe, expect, it } from "vitest";
import { createDiagramObject, defaultDocument } from "../model/diagram";
import { parseProject, serializeProject } from "./project";

describe("project serialization", () => {
  it("round trips geometry, style, text, rotation, and layer order", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 10, y: 20, id: "rect" },
      1,
    );
    rectangle.dimensions = ["width", "height"];
    const text = createDiagramObject(
      { type: "text", x: 30, y: 40, id: "label" },
      0,
    );
    if (text.type !== "text") throw new Error("expected text");
    text.text = "Bracket";
    text.rotation = 15;
    text.style.fill = "#123456";

    const parsed = parseProject(
      serializeProject([rectangle, text], defaultDocument),
    );

    expect(parsed.objects.map((object) => object.id)).toEqual([
      "label",
      "rect",
    ]);
    expect(parsed.objects.find((object) => object.id === "rect")).toMatchObject(
      {
        dimensions: ["width", "height"],
      },
    );
    expect(
      parsed.objects.find((object) => object.id === "label"),
    ).toMatchObject({
      text: "Bracket",
      rotation: 15,
      style: { fill: "#123456" },
    });
  });

  it("rejects malformed JSON and unsupported versions", () => {
    expect(() => parseProject("{not json")).toThrow("not valid JSON");
    expect(() =>
      parseProject(JSON.stringify({ version: 999, document: {}, objects: [] })),
    ).toThrow("Unsupported project version");
  });

  it("rejects malformed line points", () => {
    const raw = JSON.stringify({
      version: 1,
      document: defaultDocument,
      objects: [
        {
          id: "bad",
          type: "line",
          x: 0,
          y: 0,
          rotation: 0,
          zIndex: 0,
          style: { stroke: "#000", fill: "#fff", strokeWidth: 1, opacity: 1 },
          points: [0, 1],
        },
      ],
    });

    expect(() => parseProject(raw)).toThrow("malformed points");
  });

  it("round trips the global unit and calibrated scale", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 10, y: 20, id: "rect" },
      0,
    );
    const document = {
      ...defaultDocument,
      measurement: { unit: "in" as const, pixelsPerUnit: 160 / 5.25 },
    };

    const parsed = parseProject(serializeProject([rectangle], document));

    expect(parsed.document.measurement).toEqual({
      unit: "in",
      pixelsPerUnit: 160 / 5.25,
    });
    expect(parsed.objects[0]).toMatchObject({ width: 160, height: 96 });
  });

  it("round trips an uncalibrated unit selection", () => {
    const document = {
      ...defaultDocument,
      measurement: { unit: "mm" as const, pixelsPerUnit: null },
    };

    const parsed = parseProject(serializeProject([], document));

    expect(parsed.document.measurement).toEqual({
      unit: "mm",
      pixelsPerUnit: null,
    });
  });

  it("opens legacy projects without unit metadata in pixel mode", () => {
    const parsed = parseProject(serializeProject([], defaultDocument));

    expect(parsed.document.measurement).toBeUndefined();
    expect(parsed.document).not.toHaveProperty("measurement");
  });

  it("drops malformed measurement metadata instead of failing", () => {
    const raw = JSON.stringify({
      version: 1,
      document: {
        ...defaultDocument,
        measurement: { unit: "furlong", pixelsPerUnit: 12 },
      },
      objects: [],
    });

    expect(parseProject(raw).document.measurement).toBeUndefined();

    const negativeScale = JSON.stringify({
      version: 1,
      document: {
        ...defaultDocument,
        measurement: { unit: "cm", pixelsPerUnit: -3 },
      },
      objects: [],
    });

    expect(parseProject(negativeScale).document.measurement).toEqual({
      unit: "cm",
      pixelsPerUnit: null,
    });
  });

  it("sanitizes persisted dimensions to supported measurement keys", () => {
    const raw = JSON.stringify({
      version: 1,
      document: defaultDocument,
      objects: [
        {
          id: "rect",
          type: "rectangle",
          x: 0,
          y: 0,
          rotation: 0,
          zIndex: 0,
          style: { stroke: "#000", fill: "#fff", strokeWidth: 1, opacity: 1 },
          width: 160,
          height: 96,
          dimensions: ["width", "depth", "height", "width"],
        },
      ],
    });

    expect(parseProject(raw).objects[0]).toMatchObject({
      dimensions: ["width", "height"],
    });
  });
});
