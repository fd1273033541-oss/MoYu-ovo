import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { Tracker, labelPeople, validDescriptor, distance } from './watch-logic.mjs';

function harness() {
  const elements = new Map(), stored = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', disabled: false, callbacks: {}, readyState: 4, videoWidth: 640, videoHeight: 480,
      classList: { add() {}, remove() {}, toggle() {} }, style: {},
      addEventListener(event, callback) { this.callbacks[event] = callback; }
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    Tracker, labelPeople, validDescriptor, distance, console, setTimeout, clearTimeout,
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    document: { getElementById: element, createElement: () => ({ getContext: () => ({ drawImage() {} }) }) },
    window: { addEventListener() {} },
    faceapi: {
      TinyFaceDetectorOptions: class {},
      detectAllFaces: () => ({ withFaceLandmarks: () => ({ withFaceDescriptors: () => Promise.resolve(context.results) }) })
    }
  });
  context.results = [{ descriptor: Array(128).fill(0) }];
  const source = fs.readFileSync(new URL('./camera-monitor.js', import.meta.url), 'utf8').replace(/^import .*\n/, '');
  vm.runInContext(source, context);
  vm.runInContext('stream = { getTracks: () => [] }; modelsReady = true; mode = "enrollment";', context);
  return { context, element, stored, run: code => vm.runInContext(code, context), click: () => element('enrollBtn').callbacks.click() };
}
test('enrollment stays clickable during inference and queues without losing clicks', async () => {
  const h = harness();
  h.run('busy = true; detectionDone = new Promise(resolve => { globalThis.release = resolve; }); ownerUI();');
  assert.equal(h.element('enrollBtn').disabled, false);
  const pending = h.click();
  assert.equal(h.element('enrollBtn').disabled, true);
  assert.equal(h.stored.size, 0);
  h.run('busy = false; release();');
  await pending;
  assert.equal(h.stored.size, 0);
  assert.equal(h.run('draft.length'), 1);
  assert.match(h.element('ownerHint').textContent, /1\/3/);
});
test('three captures require confirmation before saving or enabling monitoring', async () => {
  const h = harness();
  for (let i = 0; i < 3; i++) await h.click();
  assert.equal(h.stored.size, 0);
  assert.equal(h.element('enrollBtn').disabled, true);
  assert.equal(h.element('startBtn').disabled, true);
  h.element('confirmOwnerBtn').callbacks.click();
  assert.equal(JSON.parse(h.stored.get('camera-watch-owner-v1')).samples.length, 3);
  assert.equal(h.element('startBtn').disabled, false);
  assert.equal(h.run('mode'), 'idle');
  assert.match(h.element('ownerHint').textContent, /确认保存/);
});
test('cancel replacement leaves confirmed profile unchanged', async () => {
  const h = harness();
  h.run('samples = [Array(128).fill(0), Array(128).fill(0), Array(128).fill(0)]; localStorage.setItem(KEY, JSON.stringify({ samples }));');
  const previous = h.stored.get('camera-watch-owner-v1');
  await h.click();
  h.element('cancelOwnerBtn').callbacks.click();
  assert.equal(h.stored.get('camera-watch-owner-v1'), previous);
  assert.equal(h.run('draft.length'), 0);
});
test('enrollment never starts inference or automatic notification', async () => {
  const h = harness();
  await h.run('tick(generation)');
  await h.run('alertTracks([{ hits: 3, identity: "other" }], generation)');
  assert.equal(h.run('lastAttempt'), -Infinity);
});
test('unregistered monitoring cannot open camera', async () => {
  const h = harness();
  h.run('stream = null; mode = "idle";');
  await h.run('start()');
  assert.match(h.element('notice').textContent, /先点击录入/);
  assert.equal(h.run('mode'), 'idle');
});
test('missing and multiple faces provide distinct errors without saving', async () => {
  const h = harness();
  h.context.results = [];
  await h.click();
  assert.match(h.element('ownerHint').textContent, /未找到清晰人脸/);
  h.context.results = [{}, {}];
  await h.click();
  assert.match(h.element('ownerHint').textContent, /多张人脸/);
  assert.equal(h.stored.size, 0);
});
test('stop while waiting cancels enrollment without writing a sample', async () => {
  const h = harness();
  h.run('detectionDone = new Promise(resolve => { globalThis.release = resolve; });');
  const pending = h.click();
  h.run('generation++; stream = null; release();');
  await pending;
  assert.equal(h.stored.size, 0);
  assert.match(h.element('ownerHint').textContent, /取消/);
});
