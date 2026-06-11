import { fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createDiagramObject,
  EditorState,
  initialEditorState,
} from "../model/diagram";
import { editorReducer } from "../model/editorReducer";
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

    const field = screen.getByLabelText("Side W");
    fireEvent.change(field, { target: { value: "240" } });
    fireEvent.blur(field);
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
    fireEvent.blur(field);
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSelectedDimension",
      dimension: "width",
      value: 10.5,
    });
  });

  it("buffers keystrokes and commits a dimension entry exactly once on Enter", () => {
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
        measurement={{ unit: "in", pixelsPerUnit: null }}
        dispatch={dispatch}
      />,
    );

    const field = screen.getByLabelText("Side W");
    for (const partial of ["5", "5.2", "5.25"]) {
      fireEvent.change(field, { target: { value: partial } });
    }
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: "Enter" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSelectedDimension",
      dimension: "width",
      value: 5.25,
    });

    fireEvent.blur(field);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("does not commit a dimension entry on focus and blur without typing", () => {
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
        measurement={{ unit: "in", pixelsPerUnit: null }}
        dispatch={dispatch}
      />,
    );

    const field = screen.getByLabelText("Side W");
    fireEvent.focus(field);
    fireEvent.blur(field);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("accepts fractional calibration values once a unit is set but unscaled", () => {
    const rectangle = createDiagramObject(
      { type: "rectangle", x: 0, y: 0, id: "rect" },
      0,
    );
    if (rectangle.type !== "rectangle") throw new Error("expected rectangle");
    rectangle.dimensions = ["width"];

    render(
      <Inspector
        selected={rectangle}
        copiedStyle={null}
        measurement={{ unit: "in", pixelsPerUnit: null }}
        dispatch={vi.fn()}
      />,
    );

    const field = screen.getByLabelText("Side W");
    expect(field).toHaveAttribute("step", "0.01");
    expect(field).not.toHaveAttribute("min");
  });

  it("calibrates from the final typed value only, without resizing the shape", () => {
    let latest!: EditorState;
    render(<CalibrationHarness onState={(state) => (latest = state)} />);

    const initialWidth = objectWidth(latest, "rect");
    expect(latest.document.measurement).toEqual({
      unit: "in",
      pixelsPerUnit: null,
    });

    // Real typing produces one change event per keystroke.
    const field = screen.getByLabelText("Side W");
    for (const partial of ["5", "5.2", "5.25"]) {
      fireEvent.change(field, { target: { value: partial } });
    }

    // Partial values must never reach the reducer while typing.
    expect(latest.document.measurement).toEqual({
      unit: "in",
      pixelsPerUnit: null,
    });
    expect(objectWidth(latest, "rect")).toBe(initialWidth);

    fireEvent.blur(field);

    // Calibration uses the final entry and leaves geometry untouched.
    expect(latest.document.measurement?.unit).toBe("in");
    expect(latest.document.measurement?.pixelsPerUnit).toBeCloseTo(
      initialWidth / 5.25,
      10,
    );
    expect(objectWidth(latest, "rect")).toBe(initialWidth);
  });
});

function CalibrationHarness({
  onState,
}: {
  onState: (state: EditorState) => void;
}) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => {
    let next = initialEditorState();
    next = editorReducer(next, {
      type: "createObject",
      shape: "rectangle",
      x: 0,
      y: 0,
      id: "rect",
    });
    next = editorReducer(next, {
      type: "setSelectedDimension",
      dimension: "width",
      visible: true,
    });
    next = editorReducer(next, { type: "setMeasurementUnit", unit: "in" });
    return next;
  });
  onState(state);
  const selected =
    state.objects.find((object) => object.id === state.selectedId) ?? null;
  return (
    <Inspector
      selected={selected}
      copiedStyle={state.copiedStyle}
      measurement={state.document.measurement}
      dispatch={dispatch}
    />
  );
}

function objectWidth(state: EditorState, id: string): number {
  const object = state.objects.find((candidate) => candidate.id === id);
  if (!object || !("width" in object)) throw new Error("expected box object");
  return object.width;
}
