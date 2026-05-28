import { forwardRef, useImperativeHandle, useRef, useState } from "react";
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
  DiagramObject,
  EditorState,
  LineObject,
  selectedObject,
  sortByLayer,
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

export const EditorCanvas = forwardRef<StageHandle, Props>(
  function EditorCanvas({ state, dispatch }, ref) {
    const stageRef = useRef<Konva.Stage>(null);
    const transformerRef = useRef<Konva.Transformer>(null);
    const [size, setSize] = useState({ width: 900, height: 640 });
    const selected = selectedObject(state);
    const selectedLineLike =
      selected?.type === "line" || selected?.type === "arrow" ? selected : null;

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
      const isCanvasSurface =
        event.target === event.target.getStage() ||
        event.target.name() === "canvas-background";
      if (!isCanvasSurface) return;
      const pointer = event.target.getStage()?.getPointerPosition();
      if (!pointer) return;
      if (isShapeTool(state.activeTool)) {
        dispatch({
          type: "createObject",
          shape: state.activeTool,
          x: pointer.x,
          y: pointer.y,
        });
      } else {
        dispatch({ type: "select", id: null });
      }
    }

    function bindNode(node: Konva.Node | null, object: DiagramObject) {
      if (!node || object.id !== state.selectedId || !transformerRef.current)
        return;
      if (object.type === "line" || object.type === "arrow") {
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
            {sortByLayer(state.objects).map((object) => (
              <DrawableObject
                key={object.id}
                object={object}
                selectedId={state.selectedId}
                hasCopiedStyle={Boolean(state.copiedStyle)}
                dispatch={dispatch}
                bindNode={bindNode}
              />
            ))}
            {selectedLineLike ? (
              <LineEndpointHandles
                object={selectedLineLike}
                dispatch={dispatch}
              />
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
};

function DrawableObject({
  object,
  selectedId,
  hasCopiedStyle,
  dispatch,
  bindNode,
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
      return (
        <Line
          {...common}
          points={[
            object.width / 2,
            0,
            object.width,
            object.height,
            0,
            object.height,
          ]}
          closed
        />
      );
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
            const text = window.prompt("Edit label", object.text ?? "");
            if (text !== null) dispatch({ type: "updateText", text });
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

type LineEndpointHandlesProps = {
  object: LineObject;
  dispatch: Dispatch<EditorAction>;
};

function LineEndpointHandles({ object, dispatch }: LineEndpointHandlesProps) {
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

function rotatePoint(x: number, y: number, degrees: number) {
  const radians = degrees * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}
