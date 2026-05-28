import { DiagramObject, LineObject, sortByLayer } from "../model/diagram";

export function exportDiagramSvg(
  objects: DiagramObject[],
  width: number,
  height: number,
): string {
  const body = sortByLayer(objects).map(objectToSvg).join("\n  ");
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    "  <defs>",
    '    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">',
    '      <polygon points="0 0, 10 3.5, 0 7" fill="#b91c1c" />',
    "    </marker>",
    "  </defs>",
    body,
    "</svg>",
  ].join("\n");
}

function objectToSvg(object: DiagramObject): string {
  const common = `stroke="${escapeXml(object.style.stroke)}" fill="${escapeXml(object.style.fill)}" stroke-width="${object.style.strokeWidth}" opacity="${object.style.opacity}"`;
  const transform = `transform="translate(${object.x} ${object.y}) rotate(${object.rotation})"`;

  switch (object.type) {
    case "rectangle":
      return `<rect ${transform} width="${object.width}" height="${object.height}" ${common} />`;
    case "ellipse":
      return `<ellipse ${transform} cx="${object.width / 2}" cy="${object.height / 2}" rx="${object.width / 2}" ry="${object.height / 2}" ${common} />`;
    case "triangle":
      return `<polygon ${transform} points="${object.width / 2},0 ${object.width},${object.height} 0,${object.height}" ${common} />`;
    case "text":
      return `<text ${transform} x="0" y="${object.style.fontSize ?? 18}" font-size="${object.style.fontSize ?? 18}" fill="${escapeXml(object.style.fill)}" opacity="${object.style.opacity}">${escapeXml(object.text ?? "")}</text>`;
    case "line":
      return lineToSvg(object, common, transform, false);
    case "arrow":
      return lineToSvg(object, common, transform, true);
  }
}

function lineToSvg(
  object: LineObject,
  common: string,
  transform: string,
  arrow: boolean,
): string {
  const [x1, y1, x2, y2] = object.points;
  const marker = arrow ? ' marker-end="url(#arrowhead)"' : "";
  return `<line ${transform} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${common}${marker} />`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
