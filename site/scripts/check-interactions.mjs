import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {createCopyCode, createDocsNavigation} from '../src/components.ts';

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator',
);
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);
const originalRAF = Object.getOwnPropertyDescriptor(
  globalThis,
  'requestAnimationFrame',
);
const originalCancelRAF = Object.getOwnPropertyDescriptor(
  globalThis,
  'cancelAnimationFrame',
);

afterEach(() => {
  for (const [name, descriptor] of [
    ['navigator', originalNavigator],
    ['window', originalWindow],
    ['document', originalDocument],
    ['requestAnimationFrame', originalRAF],
    ['cancelAnimationFrame', originalCancelRAF],
  ]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});

function clipboard(api, code = 'npm run dev\n') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {clipboard: api},
  });
  return createCopyCode({
    querySelector(selector) {
      return {
        textContent: selector === '[data-code-label]' ? 'Terminal one' : code,
      };
    },
  });
}

test('clipboard copies exact text, announces success, then resets', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let copied;
  const component = clipboard({
    async writeText(value) {
      copied = value;
    },
  });
  await component.copy();
  assert.equal(copied, 'npm run dev\n');
  assert.equal(component.status, 'Copied to clipboard.');
  assert.equal(component.pending, false);
  t.mock.timers.tick(3000);
  assert.equal(component.status, '');
  component.destroy();
});

test('clipboard denial is caught and exposes a manual-copy fallback', async () => {
  const component = clipboard({
    async writeText() {
      throw new Error('Permission denied');
    },
  });
  await assert.doesNotReject(component.copy());
  assert.equal(component.status, 'Could not copy. Select the code to copy it.');
  assert.equal(component.pending, false);
  component.destroy();
});

test('clipboard absence and missing code never announce success', async () => {
  for (const create of [
    () => clipboard(undefined),
    () =>
      clipboard({writeText: async () => assert.fail('No code to copy')}, null),
  ]) {
    const component = create();
    await assert.doesNotReject(component.copy());
    assert.equal(
      component.status,
      'Copy unavailable. Select the code to copy it.',
    );
    component.destroy();
  }
});

test('copy ignores repeated requests and does not update after teardown', async () => {
  let complete;
  let calls = 0;
  const component = clipboard({
    writeText() {
      calls += 1;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  const pending = component.copy();
  assert.equal(component.pending, true);
  await component.copy();
  assert.equal(calls, 1);
  component.destroy();
  complete();
  await pending;
  assert.equal(component.status, '');
  await component.copy();
  assert.equal(calls, 1);
});

test('copy teardown cancels its feedback timer', async (t) => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const component = clipboard({writeText: async () => {}});
  await component.copy();
  component.destroy();
  t.mock.timers.tick(3000);
  assert.equal(component.status, 'Copied to clipboard.');
});

function navigation(hash = '#production') {
  const frames = new Map();
  let sequence = 0;
  const desktop = {matches: false};
  const window = Object.assign(new EventTarget(), {
    location: {hash},
    innerHeight: 800,
    scrollY: 0,
    matchMedia: () => desktop,
  });
  const document = {activeElement: null, documentElement: {scrollHeight: 2000}};
  const section = (id, top) => ({
    id,
    top,
    getBoundingClientRect() {
      return {top: this.top};
    },
    closest() {
      return this;
    },
    focus() {
      document.activeElement = this;
    },
    scrollIntoView(options) {
      this.scrollOptions = options;
    },
  });
  const sections = [section('quick-start', 0), section('production', 1000)];
  const topic = {
    ...section('production-topic', 1100),
    closest: () => sections[1],
  };
  const targets = [...sections, topic];
  const trigger = {
    focus() {
      document.activeElement = this;
    },
  };
  const menu = {
    open: true,
    querySelector: () => trigger,
    contains: (element) => element === trigger,
  };
  const sidebarLink = {};
  const sidebar = {contains: (element) => element === sidebarLink};
  const root = {
    querySelectorAll: (selector) =>
      selector === 'main [id]' ? targets : sections,
    querySelector(selector) {
      if (selector === 'details') return menu;
      if (selector === 'aside') return sidebar;
      return targets.find((item) => `#${item.id}` === selector);
    },
  };
  for (const [name, value] of Object.entries({
    window,
    document,
    requestAnimationFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  })) {
    Object.defineProperty(globalThis, name, {configurable: true, value});
  }
  const flush = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback();
    }
  };
  const component = createDocsNavigation(root);
  component.init();
  return {
    component,
    sections,
    topic,
    menu,
    trigger,
    sidebarLink,
    desktop,
    window,
    document,
    flush,
    frames,
  };
}

test('navigation synchronizes direct hashes, history, and scrolling, and tears down', () => {
  const {component, window, sections, flush, frames} = navigation();
  assert.equal(component.activeSection, 'production');
  window.location.hash = '#quick-start';
  window.dispatchEvent(new Event('hashchange'));
  assert.equal(component.activeSection, 'quick-start');
  sections[1].top = 100;
  window.dispatchEvent(new Event('scroll'));
  window.dispatchEvent(new Event('scroll'));
  assert.equal(frames.size, 1);
  flush();
  assert.equal(component.activeSection, 'production');
  window.dispatchEvent(new Event('scroll'));
  component.destroy();
  assert.equal(frames.size, 0);
  window.location.hash = '#quick-start';
  window.dispatchEvent(new Event('hashchange'));
  assert.equal(component.activeSection, 'production');
});

test('scrollspy selects the last section at the bottom even below the reading threshold', () => {
  const {component, window, sections, flush} = navigation('');
  assert.equal(component.activeSection, 'quick-start');
  sections[1].top = 492;
  window.scrollY = 1200;
  window.dispatchEvent(new Event('scroll'));
  flush();
  assert.equal(component.activeSection, 'production');
  component.destroy();
});

test('an unscrollable page does not automatically select its last section', () => {
  const {component, window, document, flush} = navigation('');
  document.documentElement.scrollHeight = window.innerHeight;
  window.dispatchEvent(new Event('resize'));
  flush();
  assert.equal(component.activeSection, 'quick-start');
  component.destroy();
});

test('tablet reflow moves sidebar focus to the visible disclosure', () => {
  const {component, sidebarLink, trigger, document, window} = navigation();
  document.activeElement = sidebarLink;
  window.dispatchEvent(new Event('resize'));
  assert.equal(document.activeElement, trigger);
  component.destroy();
});

test('Escape closes the native disclosure and returns focus to its summary', () => {
  const {component, menu, trigger, document} = navigation();
  component.closeMenu();
  assert.equal(menu.open, false);
  assert.equal(document.activeElement, trigger);
  component.destroy();
});

test('section selection closes the disclosure and uses the CSS scroll preference', () => {
  const {component, menu, sections, document, flush} = navigation();
  component.navigate({currentTarget: {hash: '#quick-start'}});
  assert.equal(menu.open, false);
  flush();
  assert.equal(document.activeElement, sections[0]);
  assert.deepEqual(sections[0].scrollOptions, {
    behavior: 'auto',
    block: 'start',
  });
  component.destroy();
});

test('topic hashes and history select their parent section', () => {
  const {component, window} = navigation('#production-topic');
  assert.equal(component.activeSection, 'production');
  window.location.hash = '#quick-start';
  window.dispatchEvent(new Event('hashchange'));
  assert.equal(component.activeSection, 'quick-start');
  window.location.hash = '#production-topic';
  window.dispatchEvent(new Event('hashchange'));
  assert.equal(component.activeSection, 'production');
  component.destroy();
});

test('repeated topic navigation keeps the parent active and focuses the heading', () => {
  const {component, topic, document, flush} = navigation('#quick-start');
  for (let attempt = 0; attempt < 2; attempt++) {
    component.navigate({currentTarget: {hash: '#production-topic'}});
    flush();
    assert.equal(component.activeSection, 'production');
    assert.equal(document.activeElement, topic);
    assert.deepEqual(topic.scrollOptions, {behavior: 'auto', block: 'start'});
  }
  component.destroy();
});

test('modified navigation preserves the disclosure and native browser behavior', () => {
  const {component, menu, frames} = navigation();
  component.navigate({ctrlKey: true, currentTarget: {hash: '#quick-start'}});
  assert.equal(menu.open, true);
  assert.equal(frames.size, 0);
  component.destroy();
});

test('desktop reflow moves focus out of the hidden mobile disclosure', () => {
  const {component, menu, trigger, desktop, document, window, sections} =
    navigation();
  document.activeElement = trigger;
  desktop.matches = true;
  window.dispatchEvent(new Event('resize'));
  assert.equal(menu.open, false);
  assert.equal(document.activeElement, sections[1]);
  component.destroy();
});
