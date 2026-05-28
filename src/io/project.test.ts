import { describe, expect, it } from "vitest";
import { createDiagramObject, defaultDocument } from "../model/diagram";
import { parseProject, serializeProject } from "./project";

describe("project serialization", () => {
  it("round trips geometry, style, text, rotation, and layer order", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 10, y: 20, id: "rect" },
      1,
    );
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
});
