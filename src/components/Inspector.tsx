import { ArrowDown, ArrowUp, Copy, Ruler, Trash2 } from "lucide-react";
import type { Dispatch } from "react";
import { EditorAction } from "../model/editorReducer";
import {
  DiagramMeasurement,
  DiagramObject,
  DiagramStyle,
  isCalibratedMeasurement,
  lineMetrics,
  pixelsToDimensionValue,
  ShapeDimension,
} from "../model/diagram";

type Props = {
  selected: DiagramObject | null;
  copiedStyle: DiagramStyle | null;
  measurement?: DiagramMeasurement;
  dispatch: Dispatch<EditorAction>;
};

export function Inspector({
  selected,
  copiedStyle,
  measurement,
  dispatch,
}: Props) {
  if (!selected) {
    return (
      <aside className="inspector">
        <h2>Inspector</h2>
        <p className="muted">No selection</p>
        {copiedStyle ? (
          <p className="muted">Style copied. Select a target to paint it.</p>
        ) : null}
      </aside>
    );
  }

  const isLineLike = selected.type === "line" || selected.type === "arrow";
  const line = isLineLike ? lineMetrics(selected) : null;

  return (
    <aside className="inspector">
      <h2>{selected.type}</h2>
      <div className="field-grid">
        <NumberField
          label="X"
          value={selected.x}
          onCommit={(x) => dispatch({ type: "updateSelected", patch: { x } })}
        />
        <NumberField
          label="Y"
          value={selected.y}
          onCommit={(y) => dispatch({ type: "updateSelected", patch: { y } })}
        />
        <NumberField
          label="Angle"
          value={selected.rotation}
          onCommit={(rotation) =>
            dispatch({ type: "updateSelected", patch: { rotation } })
          }
        />
        {isLineLike && line ? (
          <>
            <NumberField
              label="X2"
              value={selected.points[2]}
              onCommit={(value) => updatePoint(selected, dispatch, 2, value)}
            />
            <NumberField
              label="Y2"
              value={selected.points[3]}
              onCommit={(value) => updatePoint(selected, dispatch, 3, value)}
            />
            <Readout label="Length" value={line.length.toFixed(1)} />
            <Readout
              label="Line angle"
              value={`${line.angle.toFixed(1)} deg`}
            />
          </>
        ) : "width" in selected && "height" in selected ? (
          <>
            <NumberField
              label="W"
              value={selected.width}
              onCommit={(width) =>
                dispatch({
                  type: "updateSelected",
                  patch: { width } as Partial<DiagramObject>,
                })
              }
            />
            <NumberField
              label="H"
              value={selected.height}
              onCommit={(height) =>
                dispatch({
                  type: "updateSelected",
                  patch: { height } as Partial<DiagramObject>,
                })
              }
            />
          </>
        ) : null}
      </div>

      {selected.type === "text" ? (
        <label className="field full">
          Text
          <input
            value={selected.text ?? ""}
            onChange={(event) =>
              dispatch({ type: "updateText", text: event.target.value })
            }
          />
        </label>
      ) : null}

      {isDimensionable(selected) ? (
        <>
          <h3>Dimensions</h3>
          <p className="muted compact">{measurementHint(measurement)}</p>
          <div className="dimension-toggle-grid">
            {(["width", "height"] as const).map((dimension) => {
              const visible = selected.dimensions?.includes(dimension) ?? false;
              return (
                <button
                  key={dimension}
                  className={
                    visible ? "dimension-toggle active" : "dimension-toggle"
                  }
                  onClick={() =>
                    dispatch({
                      type: "setSelectedDimension",
                      dimension,
                      visible: !visible,
                    })
                  }
                >
                  <Ruler size={15} />
                  {dimensionButtonLabel(selected, dimension)}
                </button>
              );
            })}
          </div>
          {selected.dimensions?.length ? (
            <div className="field-grid dimension-fields">
              {selected.dimensions.map((dimension) => (
                <NumberField
                  key={dimension}
                  label={dimensionFieldLabel(selected, dimension, measurement)}
                  value={pixelsToDimensionValue(
                    selected[dimension],
                    measurement,
                  )}
                  min={isCalibratedMeasurement(measurement) ? undefined : 8}
                  step={isCalibratedMeasurement(measurement) ? 0.01 : 1}
                  onCommit={(value) =>
                    dispatch({
                      type: "updateSelectedDimension",
                      dimension,
                      value,
                    })
                  }
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <h3>Style</h3>
      <div className="field-grid">
        <ColorField
          label="Stroke"
          value={selected.style.stroke}
          onCommit={(stroke) =>
            dispatch({ type: "updateSelectedStyle", patch: { stroke } })
          }
        />
        <ColorField
          label="Fill"
          value={selected.style.fill}
          onCommit={(fill) =>
            dispatch({ type: "updateSelectedStyle", patch: { fill } })
          }
        />
        <NumberField
          label="Stroke"
          value={selected.style.strokeWidth}
          min={0}
          onCommit={(strokeWidth) =>
            dispatch({ type: "updateSelectedStyle", patch: { strokeWidth } })
          }
        />
        <NumberField
          label="Opacity"
          value={selected.style.opacity}
          min={0}
          max={1}
          step={0.05}
          onCommit={(opacity) =>
            dispatch({ type: "updateSelectedStyle", patch: { opacity } })
          }
        />
        {selected.type === "text" ? (
          <NumberField
            label="Text"
            value={selected.style.fontSize ?? 18}
            min={6}
            onCommit={(fontSize) =>
              dispatch({ type: "updateSelectedStyle", patch: { fontSize } })
            }
          />
        ) : null}
      </div>

      <div className="button-row">
        <button onClick={() => dispatch({ type: "copySelectedStyle" })}>
          <Copy size={15} /> Style
        </button>
        <button onClick={() => dispatch({ type: "bringForward" })}>
          <ArrowUp size={15} /> Front
        </button>
        <button onClick={() => dispatch({ type: "sendBackward" })}>
          <ArrowDown size={15} /> Back
        </button>
        <button onClick={() => dispatch({ type: "deleteSelected" })}>
          <Trash2 size={15} /> Delete
        </button>
      </div>
    </aside>
  );
}

type DimensionableObject = DiagramObject & {
  type: "rectangle" | "ellipse" | "triangle";
  width: number;
  height: number;
};

function isDimensionable(object: DiagramObject): object is DimensionableObject {
  return (
    object.type === "rectangle" ||
    object.type === "ellipse" ||
    object.type === "triangle"
  );
}

function dimensionButtonLabel(
  object: DimensionableObject,
  dimension: ShapeDimension,
) {
  if (object.type === "ellipse") {
    return dimension === "width" ? "Width diameter" : "Height diameter";
  }
  if (object.type === "triangle") {
    return dimension === "width" ? "Horizontal leg" : "Vertical leg";
  }
  return dimension === "width" ? "Width side" : "Height side";
}

function dimensionFieldLabel(
  object: DimensionableObject,
  dimension: ShapeDimension,
  measurement?: DiagramMeasurement,
) {
  const base =
    object.type === "ellipse"
      ? dimension === "width"
        ? "Diameter W"
        : "Diameter H"
      : object.type === "triangle"
        ? dimension === "width"
          ? "Leg W"
          : "Leg H"
        : dimension === "width"
          ? "Side W"
          : "Side H";
  return isCalibratedMeasurement(measurement)
    ? `${base} (${measurement.unit})`
    : base;
}

function measurementHint(measurement?: DiagramMeasurement) {
  if (!measurement) {
    return "Canvas units are pixels.";
  }
  if (!isCalibratedMeasurement(measurement)) {
    return `Enter the first dimension value to calibrate the ${measurement.unit} scale.`;
  }
  return `Dimensions are shown in ${measurement.unit}.`;
}

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onCommit(next);
        }}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  return (
    <label className="field color-field">
      {label}
      <input
        type="color"
        value={value}
        onChange={(event) => onCommit(event.target.value)}
      />
    </label>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="field readout">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function updatePoint(
  selected: DiagramObject,
  dispatch: Dispatch<EditorAction>,
  index: number,
  value: number,
) {
  if (selected.type !== "line" && selected.type !== "arrow") return;
  const points = [...selected.points] as [number, number, number, number];
  points[index] = value;
  dispatch({
    type: "updateSelected",
    patch: { points } as Partial<DiagramObject>,
  });
}
