import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {afterEach, test} from 'node:test';
import {createPreviewDemo} from '../src/preview-demo.ts';
import {renderPreviewComment} from '../../src/comment.ts';

const globals = new Map(
  ['window', 'document', 'IntersectionObserver'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
);
afterEach(() => {
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function demo(t, reduced = false) {
  t.mock.timers.enable({apis: ['setTimeout']});
  const motion = Object.assign(new EventTarget(), {matches: reduced});
  const document = Object.assign(new EventTarget(), {hidden: false});
  let observer;
  class Observer {
    disconnected = false;
    constructor(callback) {
      this.callback = callback;
      observer = this;
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  for (const [name, value] of Object.entries({
    window: {matchMedia: () => motion},
    document,
    IntersectionObserver: Observer,
  })) {
    Object.defineProperty(globalThis, name, {configurable: true, value});
  }
  const component = createPreviewDemo({});
  component.init();
  return {
    component,
    motion,
    document,
    observer,
    tick: (ms) => t.mock.timers.tick(ms),
  };
}

test('walkthrough advances once and holds the completed comment', (t) => {
  const {component, tick} = demo(t);
  assert.equal(component.step, 0);
  assert.equal(component.running, true);
  for (const [duration, step] of [
    [2400, 1],
    [2800, 2],
    [2600, 3],
  ]) {
    tick(duration);
    assert.equal(component.step, step);
  }
  assert.equal(component.playing, false);
  assert.equal(component.controlLabel, 'Replay walkthrough');
  assert.equal(component.announcement, '');
  tick(60000);
  assert.equal(component.step, 3);
  component.toggle();
  assert.equal(component.step, 0);
  assert.equal(component.playing, true);
  component.destroy();
});

test('pause and play control the timer without skipping steps', (t) => {
  const {component, tick} = demo(t);
  component.toggle();
  assert.equal(component.controlLabel, 'Play walkthrough');
  tick(10000);
  assert.equal(component.step, 0);
  component.toggle();
  tick(2400);
  assert.equal(component.step, 1);
  component.destroy();
});

test('manual step selection pauses playback and announces only that selection', (t) => {
  const {component, tick} = demo(t);
  component.select(2);
  assert.match(component.announcement, /^Step 3: Deploy a preview/);
  tick(10000);
  assert.equal(component.step, 2);
  assert.equal(component.playing, false);
  for (const value of [-1, 4, 1.5, NaN]) component.select(value);
  assert.equal(component.step, 2);
  component.destroy();
});

test('reduced motion starts completed and allows untimed step selection', (t) => {
  const {component, tick} = demo(t, true);
  assert.equal(component.step, 3);
  component.select(1);
  component.toggle();
  tick(10000);
  assert.equal(component.step, 1);
  assert.equal(component.running, false);
  component.destroy();
});

test('a live reduced-motion preference change cancels playback', (t) => {
  const {component, motion, tick} = demo(t);
  motion.matches = true;
  motion.dispatchEvent(new Event('change'));
  tick(10000);
  assert.equal(component.step, 3);
  assert.equal(component.playing, false);
  motion.matches = false;
  motion.dispatchEvent(new Event('change'));
  tick(10000);
  assert.equal(component.step, 3);
  component.toggle();
  assert.equal(component.running, true);
  component.destroy();
});

test('hidden documents suspend playback and resume without fast-forwarding', (t) => {
  const {component, document, tick} = demo(t);
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  tick(60000);
  assert.equal(component.step, 0);
  assert.equal(component.running, false);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  tick(2399);
  assert.equal(component.step, 0);
  tick(1);
  assert.equal(component.step, 1);
  component.destroy();
});

test('offscreen demos suspend playback without undoing a user pause', (t) => {
  const {component, observer, tick} = demo(t);
  observer.callback([{isIntersecting: false}]);
  tick(60000);
  assert.equal(component.step, 0);
  observer.callback([{isIntersecting: true}]);
  tick(2400);
  assert.equal(component.step, 1);
  component.toggle();
  observer.callback([{isIntersecting: false}]);
  observer.callback([{isIntersecting: true}]);
  tick(10000);
  assert.equal(component.step, 1);
  component.destroy();
});

test('teardown removes listeners, disconnects observation, and cancels timers', (t) => {
  const {component, observer, document, motion, tick} = demo(t);
  component.destroy();
  assert.equal(observer.disconnected, true);
  tick(60000);
  motion.matches = true;
  motion.dispatchEvent(new Event('change'));
  document.hidden = true;
  document.dispatchEvent(new Event('visibilitychange'));
  component.toggle();
  component.select(2);
  assert.equal(component.step, 0);
  assert.equal(component.hidden, false);
  assert.equal(component.reducedMotion, false);
});

test('illustrative bot comment matches the actual Action comment wording', async () => {
  const html = await readFile(
    new URL('../index.html', import.meta.url),
    'utf8',
  );
  const body = html.match(/class="demo-comment-body">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(body);
  const plain = (value) =>
    value.replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim();
  const displayed = plain(
    body.replace(/<\/(?:p|h4)>|<br\s*\/>/g, '\n').replace(/<[^>]+>/g, ''),
  );
  const comment = renderPreviewComment({
    schemaVersion: 1,
    repository: 'example/storefront',
    pullRequest: 128,
    sha: 'a1b2c3d4e5f6' + '0'.repeat(28),
    context: 'proof-123456-128',
    store: 'example.myshopify.com',
    themeId: '123',
    previewUrl: 'https://example.invalid/preview',
    editorUrl: 'https://example.invalid/editor',
  });
  const expected = plain(
    comment
      .replace(/<!--[^]*?-->/g, '')
      .replace(/^## /gm, '')
      .replaceAll('`', '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
  );
  assert.equal(displayed, expected);
  assert.match(html, /Illustrative demo/);
  assert.doesNotMatch(body, /href=/);
});
