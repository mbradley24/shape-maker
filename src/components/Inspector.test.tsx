import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDiagramObject } from "../model/diagram";
import { Inspector } from "./Inspector";

describe("Inspector dimensions", () => {
  it("dispatches explicit dimension visibility and edit actions", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");
    rectangle.dimensions = ["width"];

    const dispatch = vi.fn();
    render(
      <Inspector selected={rectangle} copiedStyle={null} dispatch={dispatch} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /height side/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setSelectedDimension",
      dimension: "height",
      visible: true,
    });

    fireEvent.change(screen.getByLabelText("Side W"), {
      target: { value: "240" },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSelectedDimension",
      dimension: "width",
      value: 240,
    });
  });
});
