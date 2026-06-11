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

  it("shows the pixel hint while no unit is set", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );

    render(
      <Inspector selected={rectangle} copiedStyle={null} dispatch={vi.fn()} />,
    );

    expect(screen.getByText("Canvas units are pixels.")).toBeInTheDocument();
  });

  it("prompts for calibration once a unit is set but unscaled", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );

    render(
      <Inspector
        selected={rectangle}
        copiedStyle={null}
        measurement={{ unit: "in", pixelsPerUnit: null }}
        dispatch={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Enter the first dimension value to calibrate the in scale.",
      ),
    ).toBeInTheDocument();
  });

  it("shows calibrated dimension values in the global unit and dispatches unit values", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");
    rectangle.dimensions = ["width"];

    const dispatch = vi.fn();
    render(
      <Inspector
        selected={rectangle}
        copiedStyle={null}
        measurement={{ unit: "in", pixelsPerUnit: 160 / 5.25 }}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByText("Dimensions are shown in in.")).toBeInTheDocument();
    const field = screen.getByLabelText("Side W (in)");
    expect(field).toHaveValue(5.25);

    fireEvent.change(field, { target: { value: "10.5" } });
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSelectedDimension",
      dimension: "width",
      value: 10.5,
    });
  });
});
