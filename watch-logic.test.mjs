import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tracker, labelPeople, distance } from './watch-logic.mjs';
const body = { x: 0, y: 0, width: 100, height: 200 };
const descriptor = Array(128).fill(0);
const samples = [descriptor, descriptor, descriptor];
const face = { box: { x: 25, y: 10, width: 30, height: 30 }, descriptor };
test('owner suppressed without silencing a second person without a face', () => {
  assert.deepEqual(labelPeople([body, { ...body, x: 150 }], [face], samples).map(p => p.identity), ['owner', 'unknown']);
});
test('ambiguous overlapping bodies cannot inherit owner identity', () => {
  assert.ok(labelPeople([body, { ...body, x: 5 }], [face], samples).every(p => p.identity !== 'owner'));
});
test('face-only owner works and owner missing on next frame is not remembered', () => {
  const t = new Tracker();
  assert.equal(labelPeople([], [face], samples)[0].identity, 'owner');
  t.update(labelPeople([body], [face], samples), 0);
  assert.equal(t.update(labelPeople([body], [], samples), 200)[0].identity, 'unknown');
});
test('bad profiles never match; unregistered does not silence anybody', () => {
  assert.equal(distance([], descriptor), Infinity);
  assert.equal(labelPeople([body], [face], [])[0].identity, 'other');
});
test('multiple apparent owner matches are not all suppressed', () => {
  const otherBody = { ...body, x: 150 };
  const otherFace = { ...face, box: { ...face.box, x: 175 } };
  assert.ok(labelPeople([body, otherBody], [face, otherFace], samples).every(p => p.identity !== 'owner'));
});
test('three distinct updates confirm; absence expires track and resets alert', () => {
  const t = new Tracker();
  const input = [{ box: body, identity: 'unknown' }];
  let track = t.update(input, 0)[0];
  assert.equal(track.hits, 1);
  track = t.update(input, 250)[0];
  assert.equal(track.hits, 2);
  track = t.update(input, 500)[0];
  assert.equal(track.hits, 3);
  track.alerted = true;
  t.update([], 2500);
  assert.equal(t.update(input, 2600)[0].alerted, false);
});
test('movement and stopping are reported', () => {
  const t = new Tracker();
  t.update([{ box: body }], 0);
  const moved = { ...body, x: 15 };
  assert.equal(t.update([{ box: moved }], 200)[0].activity, '移动');
  assert.equal(t.update([{ box: moved }], 400)[0].activity, '停留');
});
