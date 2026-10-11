// Shared camera transform for Canvas markers and pointer hit testing.
export function worldToScreen([x, y], [vx, vy, vw, vh], width, height) {
  return [(x - vx) * width / vw, (y - vy) * height / vh];
}

export function screenToWorld([x, y], [vx, vy, vw, vh], width, height) {
  return [vx + x * vw / width, vy + y * vh / height];
}

export function limitView([x, y, w, h], width, height, maxZoom = 60) {
  const cx = x + w / 2, cy = y + h / 2;
  const nextWidth = Math.max(width / maxZoom, Math.min(width, w));
  h *= nextWidth / w;
  w = nextWidth;
  x = cx - w / 2; y = cy - h / 2;
  return [Math.min(Math.max(x, -w / 2), width - w / 2),
          Math.min(Math.max(y, -h / 2), height - h / 2), w, h];
}
