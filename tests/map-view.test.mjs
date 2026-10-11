import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../site/js/view.js', import.meta.url), 'utf8');
const { worldToScreen, screenToWorld, limitView } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

// A town at the view centre must stay at the screen centre after zooming.
assert.deepEqual(worldToScreen([600, 300], [500, 250, 200, 100], 400, 200), [200, 100]);
// Moving the view 50 world units right moves the town 100 screen pixels left.
assert.deepEqual(worldToScreen([600, 300], [550, 250, 200, 100], 400, 200), [100, 100]);
// Hit testing must invert the same transform, including the panned origin.
assert.deepEqual(screenToWorld([100, 100], [550, 250, 200, 100], 400, 200), [600, 300]);
for (const view of [[0, 0, 1000, 800], [550, 250, 200, 160], [592, 294, 20, 16]]) {
  for (const size of [[390, 312], [800, 640]]) {
    const town = [601.2, 302.4];
    const restored = screenToWorld(worldToScreen(town, view, ...size), view, ...size);
    assert.ok(Math.hypot(restored[0] - town[0], restored[1] - town[1]) < 1e-9);
  }
}
for (const view of [[100, 200, 4, 3.2], [-400, -300, 1800, 1440]]) {
  const limited = limitView(view, 1000, 800);
  assert.ok(Math.abs(limited[0] + limited[2] / 2 - (view[0] + view[2] / 2)) < 1e-9);
  assert.ok(Math.abs(limited[1] + limited[3] / 2 - (view[1] + view[3] / 2)) < 1e-9);
  assert.ok(limited[2] >= 1000 / 480 && limited[2] <= 1000);
}
console.log('Map view regression checks passed: zoom, pan, hit testing and responsive sizes.');

// Local views must zoom beyond the former 60x ceiling, on phone and desktop.
const closeView = limitView([492, 393.6, 8, 6.4], 1000, 800);
assert.equal(closeView[2], 8);
assert.equal(closeView[0] + closeView[2] / 2, 496);
const maxView = limitView([499.5, 399.6, 1, .8], 1000, 800);
assert.equal(maxView[2], 1000 / 480);
for (const size of [[390, 312], [800, 640]]) {
  const point = worldToScreen([500, 400], maxView, ...size);
  assert.ok(Math.hypot(point[0] - size[0] / 2, point[1] - size[1] / 2) < 1e-8);
}
