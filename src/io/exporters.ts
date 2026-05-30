import {
  DiagramObject,
  LineObject,
  rightTrianglePoints,
  sortByLayer,
} from "../model/diagram";

export function exportDiagramSvg(
  objects: DiagramObject[],
  width: number,
  height: number,
): string {
  const orderedObjects = sortByLayer(objects);
  const arrowMarkerIds = new Map<string, string>();
  const arrowMarkers = orderedObjects
    .filter((object) => object.type === "arrow")
    .map((object, index) => {
      const markerId = `arrowhead-${index}`;
      arrowMarkerIds.set(object.id, markerId);
      return [
        `    <marker id="${markerId}" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">`,
        `      <polygon points="0 0, 10 3.5, 0 7" fill="${escapeXml(object.style.stroke)}" />`,
        "    </marker>",
      ].join("\n");
    })
    .join("\n");
  const body = orderedObjects
    .map((object) => objectToSvg(object, arrowMarkerIds.get(object.id)))
    .join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "  <defs>",
    arrowMarkers,
    "  </defs>",
    body,
    "</svg>",
  ].join("\n");
}

function objectToSvg(object: DiagramObject, arrowMarkerId?: string): string {
  const common = `stroke="${escapeXml(object.style.stroke)}" fill="${escapeXml(object.style.fill)}" stroke-width="${object.style.strokeWidth}" opacity="${object.style.opacity}"`;
  const transform = `transform="translate(${object.x} ${object.y}) rotate(${object.rotation})"`;

  switch (object.type) {
    case "rectangle":
      return `<rect ${transform} width="${object.width}" height="${object.height}" ${common} />`;
    case "ellipse":
      return `<ellipse ${transform} cx="${object.width / 2}" cy="${object.height / 2}" rx="${object.width / 2}" ry="${object.height / 2}" ${common} />`;
    case "triangle":
      return `<polygon ${transform} points="${svgPoints(rightTrianglePoints(object))}" ${common} />`;
    case "text":
      return `<text ${transform} x="0" y="${object.style.fontSize ?? 18}" font-size="${object.style.fontSize ?? 18}" fill="${escapeXml(object.style.fill)}" opacity="${object.style.opacity}">${escapeXml(object.text ?? "")}</text>`;
    case "line":
      return lineToSvg(object, common, transform, false);
    case "arrow":
      return lineToSvg(object, common, transform, arrowMarkerId);
  }
}

function lineToSvg(
  object: LineObject,
  common: string,
  transform: string,
  arrowMarkerId?: string | false,
): string {
  const [x1, y1, x2, y2] = object.points;
  const marker = arrowMarkerId ? ` marker-end="url(#${arrowMarkerId})"` : "";
  return `<line ${transform} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${common}${marker} />`;
}

function svgPoints(points: number[]): string {
  const pairs: string[] = [];
  for (let index = 0; index < points.length; index += 2) {
    pairs.push(`${points[index]},${points[index + 1]}`);
  }
  return pairs.join(" ");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
