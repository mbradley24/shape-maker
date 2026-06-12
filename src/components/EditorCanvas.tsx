import {
  CSSProperties,
  Fragment,
  forwardRef,
  KeyboardEvent,
  useImperativeHandle,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch } from "react";
import {
  Arrow,
  Circle,
  Ellipse,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import { EditorAction } from "../model/editorReducer";
import {
  BoxObject,
  DiagramForceMeasurement,
  DiagramMeasurement,
  DiagramObject,
  EditorState,
  formatDimensionValue,
  isCalibratedMeasurement,
  lineMetrics,
  LineObject,
  pixelsToDimensionValue,
  rightTrianglePoints,
  selectedObject,
  ShapeDimension,
  sortByLayer,
  UNIT_INDICATOR_LAYOUT,
  unitIndicatorText,
} from "../model/diagram";
import { isShapeTool } from "../App";

export type StageHandle = {
  toPng: () => string | null;
};

export type TransformSnapshot = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

type Props = {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
};

export const MIN_LINE_LIKE_HIT_STROKE_WIDTH = 16;
const LINE_LIKE_HIT_PADDING = 12;
const LINE_ENDPOINT_HANDLE_RADIUS = 6;
const LINE_ENDPOINT_HANDLE_STROKE_WIDTH = 2;
const TRIANGLE_CORNER_HANDLE_RADIUS = 7;
const TRIANGLE_CORNER_HANDLE_STROKE_WIDTH = 2;
const TRIANGLE_MIN_LEG_LENGTH = 8;
const RECTANGLE_RESIZE_HANDLE_RADIUS = 6;
const RECTANGLE_RESIZE_HANDLE_STROKE_WIDTH = 2;
const RECTANGLE_MIN_SIDE_LENGTH = 8;
const DIMENSION_OFFSET = 28;
const DIMENSION_EXTENSION_GAP = 4;
const DIMENSION_EXTENSION_OVERSHOOT = 8;
const DIMENSION_FONT_SIZE = 12;
const DIMENSION_TEXT_GAP_PADDING = 5;
const DIMENSION_MIN_ARROW_SEGMENT = 12;
const DIMENSION_ARROW_POINTER_LENGTH = 9;
const DIMENSION_ARROW_POINTER_WIDTH = 5;
const DIMENSION_COLOR = "#1e293b";
const ARROW_MAGNITUDE_LABEL_OFFSET = 14;

type TriangleObject = Pick<
  BoxObject,
  "id" | "x" | "y" | "width" | "height" | "rotation"
>;
type RectangleObject = Pick<
  BoxObject,
  "id" | "x" | "y" | "width" | "height" | "rotation"
>;
export type TextObject = BoxObject & { type: "text" };

export const EditorCanvas = forwardRef<StageHandle, Props>(
  function EditorCanvas({ state, dispatch }, ref) {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const [size, setSize] = useState({ width: 900, height: 640 });
    const selected = selectedObject(state);
    const [inlineTextEdit, setInlineTextEdit] = useState<{
      objectId: string;
      value: string;
    } | null>(null);
    const [dimensionEdit, setDimensionEdit] = useState<{
      objectId: string;
      dimension: ShapeDimension;
      value: string;
    } | null>(null);
    const dimensionEditObject = dimensionEdit
      ? (state.objects.find(
          (object): object is DimensionableObject =>
            object.id === dimensionEdit.objectId &&
            isDimensionableObject(object),
        ) ?? null)
      : null;
    const selectedLineLike =
      selected?.type === "line" || selected?.type === "arrow" ? selected : null;
    const selectedTriangle = selected?.type === "triangle" ? selected : null;
    const selectedRectangle = selected?.type === "rectangle" ? selected : null;
    const inlineTextObject: TextObject | null =
      inlineTextEdit &&
      selected?.id === inlineTextEdit.objectId &&
      isTextObject(selected)
        ? selected
        : null;

    useEffect(() => {
      if (!inlineTextEdit) return;
      if (
        selected?.id !== inlineTextEdit.objectId ||
        selected.type !== "text"
      ) {
        setInlineTextEdit(null);
      }
    }, [inlineTextEdit, selected]);

    useImperativeHandle(ref, () => ({
      toPng: () => stageRef.current?.toDataURL({ pixelRatio: 2 }) ?? null,
    }));

    function syncSize(node: HTMLDivElement | null) {
      if (!node) return;
      const observer = new ResizeObserver(([entry]) => {
        setSize({
          width: Math.max(320, entry.contentRect.width),
          height: Math.max(240, entry.contentRect.height),
        });
      });
      observer.observe(node);
    }

    function onStagePointerDown(event: Konva.KonvaEventObject<PointerEvent>) {
      const stage = event.target.getStage();
      if (!stage || !isCanvasSurfaceTarget(event.target)) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const action = canvasPointerAction(state, pointer);
      if (action) dispatch(action);
    }

    function bindNode(node: Konva.Node | null, object: DiagramObject) {
      if (!node || object.id !== state.selectedId || !transformerRef.current)
        return;
      if (
        object.type === "line" ||
        object.type === "arrow" ||
        object.type === "triangle"
      ) {
        transformerRef.current.nodes([]);
        transformerRef.current.getLayer()?.batchDraw();
        return;
      }
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer()?.batchDraw();
    }

    return (
      <div className="canvas-wrap" ref={syncSize}>
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          onPointerDown={onStagePointerDown}
        >
          <Layer>
            <Rect
              name="canvas-background"
              x={0}
              y={0}
              width={size.width}
              height={size.height}
              fill="#f8fafc"
            />
            <UnitIndicator
              measurement={state.document.measurement}
              forceMeasurement={state.document.forceMeasurement}
            />
            {sortByLayer(state.objects).map((object) => (
              <Fragment key={object.id}>
                <DrawableObject
                  object={object}
                  selectedId={state.selectedId}
                  hasCopiedStyle={Boolean(state.copiedStyle)}
                  dispatch={dispatch}
                  bindNode={bindNode}
                  onRequestTextEdit={() =>
                    setInlineTextEdit({
                      objectId: object.id,
                      value: object.type === "text" ? (object.text ?? "") : "",
                    })
                  }
                />
                <DimensionOverlay
                  object={object}
                  measurement={state.document.measurement}
                  dispatch={dispatch}
                  onEditDimension={(dimension) => {
                    if (!isDimensionableObject(object)) return;
                    dispatch({ type: "select", id: object.id });
                    setDimensionEdit({
                      objectId: object.id,
                      dimension,
                      value: dimensionEditValue(
                        object,
                        dimension,
                        state.document.measurement,
                      ),
                    });
                  }}
                />
                <ArrowMagnitudeLabel
                  object={object}
                  forceMeasurement={state.document.forceMeasurement}
                />
              </Fragment>
            ))}
            {selectedLineLike ? (
              <LineEndpointHandles
                object={selectedLineLike}
                dispatch={dispatch}
              />
            ) : selectedTriangle ? (
              <TriangleCornerHandles
                object={selectedTriangle}
                dispatch={dispatch}
              />
            ) : selectedRectangle ? (
              <>
                <RectangleResizeHandles
                  object={selectedRectangle}
                  dispatch={dispatch}
                />
                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  enabledAnchors={[]}
                />
              </>
            ) : (
              <Transformer
                ref={transformerRef}
                rotateEnabled
                enabledAnchors={[
                  "top-left",
                  "top-right",
                  "bottom-left",
                  "bottom-right",
                ]}
              />
            )}
          </Layer>
        </Stage>
        {inlineTextObject && inlineTextEdit ? (
          <InlineTextEditor
            object={inlineTextObject}
            value={inlineTextEdit.value}
            onChange={(value) =>
              setInlineTextEdit({ objectId: inlineTextObject.id, value })
            }
            onCommit={() => {
              const action = inlineTextEditCommitAction(
                inlineTextObject,
                state.selectedId,
                inlineTextEdit.value,
              );
              if (action) dispatch(action);
              setInlineTextEdit(null);
            }}
            onCancel={() => setInlineTextEdit(null)}
          />
        ) : null}
        {dimensionEditObject && dimensionEdit ? (
          <DimensionValueEditor
            object={dimensionEditObject}
            measurement={state.document.measurement}
            dimension={dimensionEdit.dimension}
            value={dimensionEdit.value}
            onChange={(value) => setDimensionEdit({ ...dimensionEdit, value })}
            onCommit={() => {
              const action = dimensionEditCommitAction(
                dimensionEditObject,
                state.selectedId,
                dimensionEdit.dimension,
                dimensionEdit.value,
              );
              if (action) dispatch(action);
              setDimensionEdit(null);
            }}
            onCancel={() => setDimensionEdit(null)}
          />
        ) : null}
        {state.objects.length === 0 ? (
          <div className="empty-canvas">Choose a tool and click the canvas</div>
        ) : null}
      </div>
    );
  },
);

type DrawableProps = {
  object: DiagramObject;
  selectedId: string | null;
  hasCopiedStyle: boolean;
  dispatch: Dispatch<EditorAction>;
  bindNode: (node: Konva.Node | null, object: DiagramObject) => void;
  onRequestTextEdit: () => void;
};

function DrawableObject({
  object,
  selectedId,
  hasCopiedStyle,
  dispatch,
  bindNode,
  onRequestTextEdit,
}: DrawableProps) {
  const common = {
    ref: (node: Konva.Node | null) => bindNode(node, object),
    x: object.x,
    y: object.y,
    rotation: object.rotation,
    stroke: object.style.stroke,
    fill: object.style.fill,
    strokeWidth: object.style.strokeWidth,
    opacity: object.style.opacity,
    draggable: true,
    onClick: () =>
      hasCopiedStyle && selectedId && selectedId !== object.id
        ? dispatch({ type: "applyCopiedStyle", id: object.id })
        : shouldStartInlineTextEdit(object, selectedId)
          ? onRequestTextEdit()
          : dispatch({ type: "select", id: object.id }),
    onTap: () => dispatch({ type: "select", id: object.id }),
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) =>
      dispatch({
        type: "move",
        id: object.id,
        ...draggedObjectPositionPatch(
          object,
          event.target.x(),
          event.target.y(),
        ),
      }),
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target;
      const patch = transformedObjectPatch(object, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
      node.scaleX(1);
      node.scaleY(1);
      if (patch) dispatch({ type: "updateSelected", patch });
    },
  };

  switch (object.type) {
    case "rectangle":
      return <Rect {...common} width={object.width} height={object.height} />;
    case "ellipse":
      return <Ellipse {...common} {...ellipseRenderProps(object)} />;
    case "triangle":
      return <Line {...common} points={rightTrianglePoints(object)} closed />;
    case "text":
      return (
        <Text
          {...common}
          text={object.text ?? ""}
          width={object.width}
          height={object.height}
          fontSize={object.style.fontSize ?? 18}
          fill={object.style.fill}
          strokeWidth={0}
          onDblClick={() => {
            if (selectedId !== object.id) {
              dispatch({ type: "select", id: object.id });
            }
            onRequestTextEdit();
          }}
        />
      );
    case "line":
      return (
        <Line
          {...common}
          {...lineLikeRenderProps(object)}
          fillEnabled={false}
        />
      );
    case "arrow":
      return (
        <Arrow
          {...common}
          {...lineLikeRenderProps(object)}
          pointerLength={14}
          pointerWidth={14}
          fill={object.style.stroke}
        />
      );
  }
}

type DimensionOverlayProps = {
  object: DiagramObject;
  measurement?: DiagramMeasurement;
  dispatch: Dispatch<EditorAction>;
  onEditDimension: (dimension: ShapeDimension) => void;
};

function DimensionOverlay({
  object,
  measurement,
  dispatch,
  onEditDimension,
}: DimensionOverlayProps) {
  if (!isDimensionableObject(object) || !object.dimensions?.length) {
    return null;
  }

  return (
    <>
      {object.dimensions.map((dimension) => {
        const guide = dimensionGuide(object, dimension, measurement);
        return (
          <Fragment key={`${object.id}-${dimension}-dimension`}>
            {guide.extensions.map((extension, index) => (
              <Line
                key={`extension-${index}`}
                name={`dimension-${object.id}-${dimension}-extension-${index}`}
                points={[
                  extension.start.x,
                  extension.start.y,
                  extension.end.x,
                  extension.end.y,
                ]}
                stroke={DIMENSION_COLOR}
                strokeWidth={1}
                listening={false}
              />
            ))}
            {guide.arrows.map((arrow, index) => (
              <Arrow
                key={`arrow-${index}`}
                name={`dimension-${object.id}-${dimension}-arrow-${index}`}
                points={[
                  arrow.start.x,
                  arrow.start.y,
                  arrow.end.x,
                  arrow.end.y,
                ]}
                stroke={DIMENSION_COLOR}
                fill={DIMENSION_COLOR}
                strokeWidth={1}
                pointerLength={DIMENSION_ARROW_POINTER_LENGTH}
                pointerWidth={DIMENSION_ARROW_POINTER_WIDTH}
                listening={false}
              />
            ))}
            <Text
              name={`dimension-${object.id}-${dimension}-label`}
              x={guide.label.x}
              y={guide.label.y}
              rotation={guide.label.rotation}
              text={guide.text}
              fontSize={DIMENSION_FONT_SIZE}
              fill={DIMENSION_COLOR}
              onClick={(event) => {
                event.cancelBubble = true;
                dispatch({ type: "select", id: object.id });
              }}
              onTap={(event) => {
                event.cancelBubble = true;
                dispatch({ type: "select", id: object.id });
              }}
              onDblClick={(event) => {
                event.cancelBubble = true;
                onEditDimension(dimension);
              }}
              onDblTap={(event) => {
                event.cancelBubble = true;
                onEditDimension(dimension);
              }}
            />
          </Fragment>
        );
      })}
    </>
  );
}

type DimensionValueEditorProps = {
  object: DimensionableObject;
  measurement?: DiagramMeasurement;
  dimension: ShapeDimension;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

function DimensionValueEditor({
  object,
  measurement,
  dimension,
  value,
  onChange,
  onCommit,
  onCancel,
}: DimensionValueEditorProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const style = useMemo(
    () => dimensionEditorStyle(object, dimension, measurement),
    [object, dimension, measurement],
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [object.id, dimension]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onCommit();
    }
  }

  return (
    <input
      ref={inputRef}
      type="number"
      aria-label={`Edit ${dimension} dimension`}
      className="dimension-editor"
      value={value}
      style={style}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
    />
  );
}

export function dimensionEditorStyle(
  object: DimensionableObject,
  dimension: ShapeDimension,
  measurement?: DiagramMeasurement | null,
): CSSProperties {
  const guide = dimensionGuide(object, dimension, measurement);
  return {
    left: guide.label.x - 6,
    top: guide.label.y - 6,
  };
}

export function dimensionEditCommitAction(
  object: DiagramObject | null,
  selectedId: string | null,
  dimension: ShapeDimension,
  rawValue: string,
): EditorAction | null {
  if (!object || !isDimensionableObject(object) || object.id !== selectedId) {
    return null;
  }
  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value)) return null;
  return { type: "updateSelectedDimension", dimension, value };
}

type InlineTextEditorProps = {
  object: TextObject;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

function InlineTextEditor({
  object,
  value,
  onChange,
  onCommit,
  onCancel,
}: InlineTextEditorProps) {
  const inputRef = useRef<{ focus: () => void; select: () => void } | null>(
    null,
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [object.id]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onCommit();
    }
  }

  return (
    <textarea
      ref={(node) => {
        inputRef.current = node;
      }}
      aria-label="Edit text"
      className="inline-text-editor"
      value={value}
      style={inlineTextEditorStyle(object)}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={onKeyDown}
    />
  );
}

export function shouldStartInlineTextEdit(
  object: DiagramObject,
  selectedId: string | null,
) {
  return object.type === "text" && object.id === selectedId;
}

export function inlineTextEditCommitAction(
  object: DiagramObject | null,
  selectedId: string | null,
  text: string,
): EditorAction | null {
  if (!object || object.type !== "text" || object.id !== selectedId) {
    return null;
  }
  return { type: "updateText", text };
}

function isTextObject(object: DiagramObject): object is TextObject {
  return object.type === "text";
}

export function inlineTextEditorStyle(object: TextObject): CSSProperties {
  return {
    left: object.x,
    top: object.y,
    width: object.width,
    minHeight: object.height,
    color: object.style.fill,
    fontSize: object.style.fontSize ?? 18,
    opacity: object.style.opacity,
    transform: `rotate(${object.rotation}deg)`,
  };
}

export type TriangleCorner = "right" | "horizontal" | "vertical";
export type RectangleResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

type RectangleResizeHandlesProps = {
  object: RectangleObject;
  dispatch: Dispatch<EditorAction>;
};

const RECTANGLE_RESIZE_HANDLES: RectangleResizeHandle[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
];

export function RectangleResizeHandles({
  object,
  dispatch,
}: RectangleResizeHandlesProps) {
  return (
    <>
      {RECTANGLE_RESIZE_HANDLES.map((handle) => {
        const { x, y } = rectangleResizeHandlePosition(object, handle);
        return (
          <Circle
            key={`${object.id}-${handle}-resize`}
            name={`rectangle-${handle}-resize-handle`}
            x={x}
            y={y}
            radius={RECTANGLE_RESIZE_HANDLE_RADIUS}
            fill="#ffffff"
            stroke="#0f766e"
            strokeWidth={RECTANGLE_RESIZE_HANDLE_STROKE_WIDTH}
            draggable
            onPointerDown={(event) => {
              event.cancelBubble = true;
            }}
            onClick={(event) => {
              event.cancelBubble = true;
            }}
            onDragMove={(event) => {
              const patch = rectangleResizeDragPatch(
                object,
                handle,
                event.target.x(),
                event.target.y(),
              );
              event.target.position(
                rectangleResizeHandlePosition({ ...object, ...patch }, handle),
              );
              dispatch({
                type: "updateSelected",
                patch,
              });
            }}
            onDragEnd={(event) => {
              const patch = rectangleResizeDragPatch(
                object,
                handle,
                event.target.x(),
                event.target.y(),
              );
              event.target.position(
                rectangleResizeHandlePosition({ ...object, ...patch }, handle),
              );
              dispatch({
                type: "updateSelected",
                patch,
              });
            }}
          />
        );
      })}
    </>
  );
}

type TriangleCornerHandlesProps = {
  object: TriangleObject;
  dispatch: Dispatch<EditorAction>;
};

const TRIANGLE_CORNERS: TriangleCorner[] = ["right", "horizontal", "vertical"];

export function TriangleCornerHandles({
  object,
  dispatch,
}: TriangleCornerHandlesProps) {
  return (
    <>
      {TRIANGLE_CORNERS.map((corner) => {
        const { x, y } = triangleCornerHandlePosition(object, corner);
        return (
          <Circle
            key={`${object.id}-${corner}-corner`}
            name={`triangle-${corner}-corner-handle`}
            x={x}
            y={y}
            radius={TRIANGLE_CORNER_HANDLE_RADIUS}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={TRIANGLE_CORNER_HANDLE_STROKE_WIDTH}
            draggable
            onPointerDown={(event) => {
              event.cancelBubble = true;
            }}
            onClick={(event) => {
              event.cancelBubble = true;
            }}
            onDragMove={(event) => {
              const patch = triangleCornerDragPatch(
                object,
                corner,
                event.target.x(),
                event.target.y(),
              );
              event.target.position(
                triangleCornerHandlePosition({ ...object, ...patch }, corner),
              );
              dispatch({
                type: "updateSelected",
                patch,
              });
            }}
            onDragEnd={(event) => {
              const patch = triangleCornerDragPatch(
                object,
                corner,
                event.target.x(),
                event.target.y(),
              );
              event.target.position(
                triangleCornerHandlePosition({ ...object, ...patch }, corner),
              );
              dispatch({
                type: "updateSelected",
                patch,
              });
            }}
          />
        );
      })}
    </>
  );
}

type LineEndpointHandlesProps = {
  object: LineObject;
  dispatch: Dispatch<EditorAction>;
};

export function LineEndpointHandles({
  object,
  dispatch,
}: LineEndpointHandlesProps) {
  return (
    <>
      {(["start", "end"] as const).map((endpoint) => {
        const { x, y } = lineEndpointHandlePosition(object, endpoint);
        return (
          <Circle
            key={`${object.id}-${endpoint}-endpoint`}
            name={`line-${endpoint}-endpoint-handle`}
            x={x}
            y={y}
            radius={LINE_ENDPOINT_HANDLE_RADIUS}
            fill="#ffffff"
            stroke="#2563eb"
            strokeWidth={LINE_ENDPOINT_HANDLE_STROKE_WIDTH}
            draggable
            onPointerDown={(event) => {
              event.cancelBubble = true;
            }}
            onClick={(event) => {
              event.cancelBubble = true;
            }}
            onDragMove={(event) => {
              dispatch({
                type: "updateSelected",
                patch: lineEndpointDragPatch(
                  object,
                  endpoint,
                  event.target.x(),
                  event.target.y(),
                ),
              });
            }}
            onDragEnd={(event) => {
              dispatch({
                type: "updateSelected",
                patch: lineEndpointDragPatch(
                  object,
                  endpoint,
                  event.target.x(),
                  event.target.y(),
                ),
              });
            }}
          />
        );
      })}
    </>
  );
}

export function transformedObjectPatch(
  object: DiagramObject,
  snapshot: TransformSnapshot,
): Partial<DiagramObject> | null {
  if (object.type === "line" || object.type === "arrow") {
    return {
      x: snapshot.x,
      y: snapshot.y,
      rotation: snapshot.rotation,
    };
  }
  if (!("width" in object) || !("height" in object)) return null;

  if (object.type === "ellipse") {
    const width = Math.max(8, object.width * snapshot.scaleX);
    const height = Math.max(8, object.height * snapshot.scaleY);

    return {
      x: snapshot.x - width / 2,
      y: snapshot.y - height / 2,
      rotation: snapshot.rotation,
      width,
      height,
    };
  }

  return {
    x: snapshot.x,
    y: snapshot.y,
    rotation: snapshot.rotation,
    width: Math.max(8, object.width * snapshot.scaleX),
    height: Math.max(8, object.height * snapshot.scaleY),
  } as Partial<DiagramObject>;
}

export function draggedObjectPositionPatch(
  object: DiagramObject,
  x: number,
  y: number,
) {
  if (object.type === "ellipse") {
    return {
      x: x - object.width / 2,
      y: y - object.height / 2,
    };
  }

  return { x, y };
}

export function ellipseRenderProps(object: {
  x: number;
  y: number;
  width: number;
  height: number;
  style: DiagramObject["style"];
}) {
  return {
    x: object.x + object.width / 2,
    y: object.y + object.height / 2,
    radiusX: object.width / 2,
    radiusY: object.height / 2,
    fill: object.style.fill,
    stroke: object.style.stroke,
    strokeWidth: object.style.strokeWidth,
  };
}

export function lineLikeRenderProps(object: LineObject) {
  return {
    points: object.points,
    hitStrokeWidth: Math.max(
      MIN_LINE_LIKE_HIT_STROKE_WIDTH,
      object.style.strokeWidth + LINE_LIKE_HIT_PADDING,
    ),
  };
}

export type LineEndpoint = "start" | "end";

export function lineEndpointHandlePosition(
  object: LineObject,
  endpoint: LineEndpoint,
) {
  const pointIndex = endpoint === "start" ? 0 : 2;
  const rotated = rotatePoint(
    object.points[pointIndex],
    object.points[pointIndex + 1],
    object.rotation,
  );
  return {
    x: object.x + rotated.x,
    y: object.y + rotated.y,
  };
}

export function lineEndpointDragPatch(
  object: LineObject,
  endpoint: LineEndpoint,
  handleX: number,
  handleY: number,
): Pick<LineObject, "points"> {
  const point = rotatePoint(
    handleX - object.x,
    handleY - object.y,
    -object.rotation,
  );
  const points = [...object.points] as LineObject["points"];
  const pointIndex = endpoint === "start" ? 0 : 2;
  points[pointIndex] = point.x;
  points[pointIndex + 1] = point.y;
  return { points };
}

export function triangleCornerHandlePosition(
  object: TriangleObject,
  corner: TriangleCorner,
) {
  const point = triangleCornerLocalPosition(object, corner);
  const rotated = rotatePoint(point.x, point.y, object.rotation);
  return {
    x: object.x + rotated.x,
    y: object.y + rotated.y,
  };
}

export function triangleCornerDragPatch(
  object: TriangleObject,
  corner: TriangleCorner,
  handleX: number,
  handleY: number,
): Partial<DiagramObject> {
  const local = rotatePoint(
    handleX - object.x,
    handleY - object.y,
    -object.rotation,
  );

  switch (corner) {
    case "horizontal":
      return {
        width: Math.max(TRIANGLE_MIN_LEG_LENGTH, local.x),
      };
    case "vertical":
      return {
        height: Math.max(TRIANGLE_MIN_LEG_LENGTH, local.y),
      };
    case "right": {
      const originOffset = rotatePoint(local.x, local.y, object.rotation);
      return {
        x: object.x + originOffset.x,
        y: object.y + originOffset.y,
        width: Math.max(TRIANGLE_MIN_LEG_LENGTH, object.width - local.x),
        height: Math.max(TRIANGLE_MIN_LEG_LENGTH, object.height - local.y),
      };
    }
  }
}

export function rectangleResizeHandlePosition(
  object: RectangleObject,
  handle: RectangleResizeHandle,
) {
  const point = rectangleResizeHandleLocalPosition(object, handle);
  const rotated = rotatePoint(point.x, point.y, object.rotation);
  return {
    x: object.x + rotated.x,
    y: object.y + rotated.y,
  };
}

export function rectangleResizeDragPatch(
  object: RectangleObject,
  handle: RectangleResizeHandle,
  handleX: number,
  handleY: number,
): Pick<RectangleObject, "x" | "y" | "width" | "height"> {
  const local = rotatePoint(
    handleX - object.x,
    handleY - object.y,
    -object.rotation,
  );
  const movesLeft = handle.includes("left");
  const movesRight = handle.includes("right");
  const movesTop = handle.includes("top");
  const movesBottom = handle.includes("bottom");

  const left = movesLeft
    ? Math.min(local.x, object.width - RECTANGLE_MIN_SIDE_LENGTH)
    : 0;
  const right = movesRight
    ? Math.max(local.x, RECTANGLE_MIN_SIDE_LENGTH)
    : object.width;
  const top = movesTop
    ? Math.min(local.y, object.height - RECTANGLE_MIN_SIDE_LENGTH)
    : 0;
  const bottom = movesBottom
    ? Math.max(local.y, RECTANGLE_MIN_SIDE_LENGTH)
    : object.height;
  const originOffset = rotatePoint(left, top, object.rotation);

  return {
    x: object.x + originOffset.x,
    y: object.y + originOffset.y,
    width: right - left,
    height: bottom - top,
  };
}

function rectangleResizeHandleLocalPosition(
  object: RectangleObject,
  handle: RectangleResizeHandle,
) {
  switch (handle) {
    case "top-left":
      return { x: 0, y: 0 };
    case "top":
      return { x: object.width / 2, y: 0 };
    case "top-right":
      return { x: object.width, y: 0 };
    case "right":
      return { x: object.width, y: object.height / 2 };
    case "bottom-right":
      return { x: object.width, y: object.height };
    case "bottom":
      return { x: object.width / 2, y: object.height };
    case "bottom-left":
      return { x: 0, y: object.height };
    case "left":
      return { x: 0, y: object.height / 2 };
  }
}

function triangleCornerLocalPosition(
  object: TriangleObject,
  corner: TriangleCorner,
) {
  switch (corner) {
    case "right":
      return { x: 0, y: 0 };
    case "horizontal":
      return { x: object.width, y: 0 };
    case "vertical":
      return { x: 0, y: object.height };
  }
}

export type DimensionableObject = BoxObject & {
  type: "rectangle" | "ellipse" | "triangle";
};

export function isDimensionableObject(
  object: DiagramObject,
): object is DimensionableObject {
  return (
    object.type === "rectangle" ||
    object.type === "ellipse" ||
    object.type === "triangle"
  );
}

export function dimensionLabel(
  object: DimensionableObject,
  dimension: ShapeDimension,
  measurement?: DiagramMeasurement | null,
) {
  const text = formatDimensionValue(
    dimension === "width" ? object.width : object.height,
    measurement,
  );
  return object.type === "ellipse" ? `⌀${text}` : text;
}

export function dimensionEditValue(
  object: DimensionableObject,
  dimension: ShapeDimension,
  measurement?: DiagramMeasurement | null,
): string {
  return String(
    pixelsToDimensionValue(
      dimension === "width" ? object.width : object.height,
      measurement,
    ),
  );
}

type UnitIndicatorProps = {
  measurement?: DiagramMeasurement | null;
  forceMeasurement?: DiagramForceMeasurement | null;
};

export function UnitIndicator({
  measurement,
  forceMeasurement,
}: UnitIndicatorProps) {
  const text = unitIndicatorText(measurement, forceMeasurement);
  if (!text) return null;
  return (
    <Text
      name="unit-indicator"
      x={UNIT_INDICATOR_LAYOUT.margin}
      y={UNIT_INDICATOR_LAYOUT.margin}
      text={text}
      fontSize={UNIT_INDICATOR_LAYOUT.fontSize}
      fill={UNIT_INDICATOR_LAYOUT.color}
      listening={false}
    />
  );
}

type ArrowMagnitudeLabelProps = {
  object: DiagramObject;
  forceMeasurement?: DiagramForceMeasurement | null;
};

export function ArrowMagnitudeLabel({
  object,
  forceMeasurement,
}: ArrowMagnitudeLabelProps) {
  if (object.type !== "arrow") return null;
  const layout = arrowMagnitudeLabelLayout(object, forceMeasurement);
  if (!layout) return null;
  return (
    <Text
      name={`arrow-${object.id}-magnitude-label`}
      x={layout.x}
      y={layout.y}
      text={layout.text}
      fontSize={DIMENSION_FONT_SIZE}
      fill={DIMENSION_COLOR}
      listening={false}
    />
  );
}

// Arrows only carry a magnitude label once the force scale is calibrated;
// before that they render exactly as they did without force support.
export function arrowMagnitudeLabel(
  object: LineObject,
  forceMeasurement?: DiagramForceMeasurement | null,
): string | null {
  if (object.type !== "arrow" || !isCalibratedMeasurement(forceMeasurement)) {
    return null;
  }
  return formatDimensionValue(lineMetrics(object).length, forceMeasurement);
}

export function arrowMagnitudeLabelLayout(
  object: LineObject,
  forceMeasurement?: DiagramForceMeasurement | null,
): { x: number; y: number; text: string } | null {
  const text = arrowMagnitudeLabel(object, forceMeasurement);
  if (text === null) return null;

  const [x1, y1, x2, y2] = object.points;
  const { dx, dy, length } = lineMetrics(object);
  // Offset the label perpendicular to the shaft so it sits beside the arrow.
  const normal =
    length > 0 ? { x: dy / length, y: -dx / length } : { x: 0, y: -1 };
  const anchor = rotateLocalPoint(object, {
    x: (x1 + x2) / 2 + normal.x * ARROW_MAGNITUDE_LABEL_OFFSET,
    y: (y1 + y2) / 2 + normal.y * ARROW_MAGNITUDE_LABEL_OFFSET,
  });
  const textWidth = text.length * DIMENSION_FONT_SIZE * 0.62;
  return {
    x: anchor.x - textWidth / 2,
    y: anchor.y - DIMENSION_FONT_SIZE / 2,
    text,
  };
}

type DimensionSegment = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

export type DimensionGuide = {
  extensions: DimensionSegment[];
  arrows: DimensionSegment[];
  label: { x: number; y: number; rotation: number };
  text: string;
};

export function dimensionGuide(
  object: DimensionableObject,
  dimension: ShapeDimension,
  measurement?: DiagramMeasurement | null,
): DimensionGuide {
  const text = dimensionLabel(object, dimension, measurement);
  const textWidth = text.length * DIMENSION_FONT_SIZE * 0.62;
  const halfGap = textWidth / 2 + DIMENSION_TEXT_GAP_PADDING;

  if (dimension === "width") {
    const lineY = -DIMENSION_OFFSET;
    const mid = object.width / 2;
    const textFitsInline = mid - halfGap >= DIMENSION_MIN_ARROW_SEGMENT;
    return globalDimensionGuide(object, text, object.rotation, {
      extensions: [
        {
          start: { x: 0, y: -DIMENSION_EXTENSION_GAP },
          end: { x: 0, y: lineY - DIMENSION_EXTENSION_OVERSHOOT },
        },
        {
          start: { x: object.width, y: -DIMENSION_EXTENSION_GAP },
          end: { x: object.width, y: lineY - DIMENSION_EXTENSION_OVERSHOOT },
        },
      ],
      arrows: [
        {
          start: { x: textFitsInline ? mid - halfGap : mid, y: lineY },
          end: { x: 0, y: lineY },
        },
        {
          start: { x: textFitsInline ? mid + halfGap : mid, y: lineY },
          end: { x: object.width, y: lineY },
        },
      ],
      label: {
        x: mid - textWidth / 2,
        y: textFitsInline
          ? lineY - DIMENSION_FONT_SIZE / 2
          : lineY - DIMENSION_FONT_SIZE - 6,
      },
    });
  }

  const lineX = -DIMENSION_OFFSET;
  const mid = object.height / 2;
  return globalDimensionGuide(object, text, 0, {
    extensions: [
      {
        start: { x: -DIMENSION_EXTENSION_GAP, y: 0 },
        end: { x: lineX - DIMENSION_EXTENSION_OVERSHOOT, y: 0 },
      },
      {
        start: { x: -DIMENSION_EXTENSION_GAP, y: object.height },
        end: { x: lineX - DIMENSION_EXTENSION_OVERSHOOT, y: object.height },
      },
    ],
    arrows: [
      { start: { x: lineX, y: mid }, end: { x: lineX, y: 0 } },
      { start: { x: lineX, y: mid }, end: { x: lineX, y: object.height } },
    ],
    label: {
      x: lineX - DIMENSION_TEXT_GAP_PADDING - textWidth,
      y: mid - DIMENSION_FONT_SIZE / 2,
    },
  });
}

function globalDimensionGuide(
  object: DimensionableObject,
  text: string,
  labelRotation: number,
  local: {
    extensions: DimensionSegment[];
    arrows: DimensionSegment[];
    label: { x: number; y: number };
  },
): DimensionGuide {
  const toGlobal = (segment: DimensionSegment) => ({
    start: rotateLocalPoint(object, segment.start),
    end: rotateLocalPoint(object, segment.end),
  });
  return {
    extensions: local.extensions.map(toGlobal),
    arrows: local.arrows.map(toGlobal),
    label: {
      ...rotateLocalPoint(object, local.label),
      rotation: labelRotation,
    },
    text,
  };
}

function rotateLocalPoint(
  object: Pick<DiagramObject, "x" | "y" | "rotation">,
  point: { x: number; y: number },
) {
  const rotated = rotatePoint(point.x, point.y, object.rotation);
  return {
    x: object.x + rotated.x,
    y: object.y + rotated.y,
  };
}

export function isCanvasSurfaceTarget(target: Konva.Node) {
  return target === target.getStage() || target.name() === "canvas-background";
}

export function canvasPointerAction(
  state: Pick<EditorState, "activeTool" | "selectedId">,
  pointer: { x: number; y: number },
): EditorAction | null {
  if (isShapeTool(state.activeTool)) {
    return {
      type: "createObject",
      shape: state.activeTool,
      x: pointer.x,
      y: pointer.y,
    };
  }

  return state.selectedId ? { type: "select", id: null } : null;
}

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = degrees * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}
