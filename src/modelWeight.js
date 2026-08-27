const DENSITY_G_CM3 = { PLA: 1.24, PETG: 1.27, TPU: 1.21, ABS: 1.04 };

function signedTriangleVolume(a, b, c) {
  return (
    a[0] * (b[1] * c[2] - b[2] * c[1])
    - a[1] * (b[0] * c[2] - b[2] * c[0])
    + a[2] * (b[0] * c[1] - b[1] * c[0])
  ) / 6;
}

function binaryStlVolume(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 84) return null;
  const triangles = view.getUint32(80, true);
  if (84 + triangles * 50 !== buffer.byteLength) return null;
  let volume = 0;
  for (let index = 0; index < triangles; index += 1) {
    const start = 84 + index * 50 + 12;
    const vertex = offset => [view.getFloat32(start + offset, true), view.getFloat32(start + offset + 4, true), view.getFloat32(start + offset + 8, true)];
    volume += signedTriangleVolume(vertex(0), vertex(12), vertex(24));
  }
  return Math.abs(volume);
}

function asciiStlVolume(text) {
  const vertices = [...text.matchAll(/vertex\s+(-?\d*\.?\d+(?:e[+-]?\d+)?)\s+(-?\d*\.?\d+(?:e[+-]?\d+)?)\s+(-?\d*\.?\d+(?:e[+-]?\d+)?)/gi)]
    .map(match => [Number(match[1]), Number(match[2]), Number(match[3])]);
  let volume = 0;
  for (let index = 0; index + 2 < vertices.length; index += 3) volume += signedTriangleVolume(vertices[index], vertices[index + 1], vertices[index + 2]);
  return Math.abs(volume);
}

function objVolume(text) {
  const vertices = [];
  let volume = 0;
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) vertices.push(parts.slice(1, 4).map(Number));
    if (parts[0] === 'f' && parts.length >= 4) {
      const face = parts.slice(1).map(part => {
        const value = Number(part.split('/')[0]);
        return vertices[value < 0 ? vertices.length + value : value - 1];
      }).filter(Boolean);
      for (let index = 1; index + 1 < face.length; index += 1) volume += signedTriangleVolume(face[0], face[index], face[index + 1]);
    }
  }
  return Math.abs(volume);
}

export async function estimateModelWeight(file, material, infillPercent = 15) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['stl', 'obj'].includes(extension)) throw new Error('Automatic weight estimation currently supports STL and OBJ files.');
  const buffer = await file.arrayBuffer();
  const volumeMm3 = extension === 'stl'
    ? (binaryStlVolume(buffer) ?? asciiStlVolume(new TextDecoder().decode(buffer)))
    : objVolume(new TextDecoder().decode(buffer));
  if (!Number.isFinite(volumeMm3) || volumeMm3 <= 0) throw new Error('The model volume could not be read. Enter the sliced weight manually.');
  const density = DENSITY_G_CM3[material] || DENSITY_G_CM3.PLA;
  const infill = Math.min(100, Math.max(0, Number(infillPercent))) / 100;
  const estimatedPrintedFraction = 0.25 + 0.75 * infill;
  return Math.max(0.1, Math.round(volumeMm3 / 1000 * density * estimatedPrintedFraction * 10) / 10);
}
