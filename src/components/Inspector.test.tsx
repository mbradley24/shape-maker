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

describe("Inspector force magnitudes", () => {
  function arrow() {
    const object = createDiagramObject(
      { type: "arrow", x: 0, y: 0, id: "arrow" },
      0,
    );
    if (object.type !== "arrow") throw new Error("expected arrow");
    return object;
  }

  it("keeps arrows unchanged while no force unit is set", () => {
    render(
      <Inspector selected={arrow()} copiedStyle={null} dispatch={vi.fn()} />,
    );

    expect(screen.queryByText("Force")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Magnitude/)).not.toBeInTheDocument();
  });

  it("never shows a force field for lines or shapes", () => {
    const line = createDiagramObject(
      { type: "line", x: 0, y: 0, id: "line" },
      0,
    );

    render(
      <Inspector
        selected={line}
        copiedStyle={null}
        forceMeasurement={{ unit: "N", pixelsPerUnit: 1.8 }}
        dispatch={vi.fn()}
      />,
    );

    expect(screen.queryByText("Force")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Magnitude/)).not.toBeInTheDocument();
  });

  it("prompts for force calibration once a unit is set but unscaled", () => {
    render(
      <Inspector
        selected={arrow()}
        copiedStyle={null}
        forceMeasurement={{ unit: "kN", pixelsPerUnit: null }}
        dispatch={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Enter the first force magnitude to calibrate the kN scale.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Magnitude")).toBeInTheDocument();
  });

  it("shows the calibrated magnitude and dispatches the entered value on blur", () => {
    const dispatch = vi.fn();
    render(
      <Inspector
        selected={arrow()}
        copiedStyle={null}
        forceMeasurement={{ unit: "N", pixelsPerUnit: 1.8 }}
        dispatch={dispatch}
      />,
    );

    expect(screen.getByText("Forces are shown in N.")).toBeInTheDocument();
    const field = screen.getByLabelText("Magnitude (N)");
    // The default arrow is 180 px long, so at 1.8 px/N it carries 100 N.
    expect(field).toHaveValue(100);

    fireEvent.change(field, { target: { value: "200" } });
    fireEvent.blur(field);
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSelectedMagnitude",
      value: 200,
    });
  });

  it("buffers magnitude keystrokes and commits exactly once on Enter", () => {
    const dispatch = vi.fn();
    render(
      <Inspector
        selected={arrow()}
        copiedStyle={null}
        forceMeasurement={{ unit: "N", pixelsPerUnit: null }}
        dispatch={dispatch}
      />,
    );

    const field = screen.getByLabelText("Magnitude");
    for (const partial of ["1", "10", "100"]) {
      fireEvent.change(field, { target: { value: partial } });
    }
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: "Enter" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSelectedMagnitude",
      value: 100,
    });

    fireEvent.blur(field);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("calibrates from the final typed magnitude only, without resizing the arrow", () => {
    let latest!: EditorState;
    render(<ForceCalibrationHarness onState={(state) => (latest = state)} />);

    const initialPoints = arrowPointsOf(latest, "arrow");
    expect(latest.document.forceMeasurement).toEqual({
      unit: "N",
      pixelsPerUnit: null,
    });

    const field = screen.getByLabelText("Magnitude");
    for (const partial of ["9", "90"]) {
      fireEvent.change(field, { target: { value: partial } });
    }

    expect(latest.document.forceMeasurement).toEqual({
      unit: "N",
      pixelsPerUnit: null,
    });

    fireEvent.blur(field);

    expect(latest.document.forceMeasurement?.unit).toBe("N");
    expect(latest.document.forceMeasurement?.pixelsPerUnit).toBeCloseTo(2, 10);
    expect(arrowPointsOf(latest, "arrow")).toEqual(initialPoints);
  });
});

function ForceCalibrationHarness({
  onState,
}: {
  onState: (state: EditorState) => void;
}) {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => {
    let next = initialEditorState();
    next = editorReducer(next, {
      type: "createObject",
      shape: "arrow",
      x: 0,
      y: 0,
      id: "arrow",
    });
    next = editorReducer(next, { type: "setForceUnit", unit: "N" });
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
      forceMeasurement={state.document.forceMeasurement}
      dispatch={dispatch}
    />
  );
}

function arrowPointsOf(state: EditorState, id: string) {
  const object = state.objects.find((candidate) => candidate.id === id);
  if (!object || object.type !== "arrow") throw new Error("expected arrow");
  return [...object.points];
}

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

describe("Inspector line length dimension", () => {
  it("offers a Length toggle for plain lines and dispatches the toggle action", () => {
    const line = createDiagramObject(
      { type: "line", x: 0, y: 0, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");

    const dispatch = vi.fn();
    render(
      <Inspector selected={line} copiedStyle={null} dispatch={dispatch} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /length/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "setSelectedDimension",
      dimension: "length",
      visible: true,
    });
  });

  it("does not offer width or height toggles for lines", () => {
    const line = createDiagramObject(
      { type: "line", x: 0, y: 0, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");

    render(<Inspector selected={line} copiedStyle={null} dispatch={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /width side/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /height side/i }),
    ).not.toBeInTheDocument();
  });

  it("edits line length in raw pixels while no unit is set", () => {
    const line = createDiagramObject(
      { type: "line", x: 0, y: 0, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");
    line.points = [0, 0, 80, 60];
    line.dimensions = ["length"];

    const dispatch = vi.fn();
    render(
      <Inspector selected={line} copiedStyle={null} dispatch={dispatch} />,
    );

    const field = screen.getByLabelText("Length");
    expect(field).toHaveValue(100);

    fireEvent.change(field, { target: { value: "240" } });
    fireEvent.blur(field);
    expect(dispatch).toHaveBeenCalledWith({
      type: "updateSelectedDimension",
      dimension: "length",
      value: 240,
    });
  });

  it("shows calibrated line lengths in the global unit", () => {
    const line = createDiagramObject(
      { type: "line", x: 0, y: 0, id: "line" },
      0,
    );
    if (line.type !== "line") throw new Error("expected line");
    line.dimensions = ["length"];

    render(
      <Inspector
        selected={line}
        copiedStyle={null}
        measurement={{ unit: "in", pixelsPerUnit: 180 / 5.25 }}
        dispatch={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Length (in)")).toHaveValue(5.25);
  });

  it("offers no dimension controls for arrows", () => {
    const arrow = createDiagramObject(
      { type: "arrow", x: 0, y: 0, id: "arrow" },
      0,
    );
    if (arrow.type !== "arrow") throw new Error("expected arrow");

    render(
      <Inspector selected={arrow} copiedStyle={null} dispatch={vi.fn()} />,
    );

    expect(
      screen.queryByRole("button", { name: /length/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Dimensions")).not.toBeInTheDocument();
  });
});
