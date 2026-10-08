import assert from 'node:assert/strict';
import test from 'node:test';
import mergeOptions from '../src/mergeOptions.ts';

class ImageSpec {}
class VideoSpec {}
class CustomSpec {}

function defaults() {
  return {
    specs: [ImageSpec, VideoSpec],
    align: { allowAligning: true, alignments: ['left', 'center', 'right'] },
    overlay: { className: 'overlay', style: { position: 'absolute', border: '1px dashed #444' } },
    resize: { allowResizing: true, minimumWidthPx: 25 },
    image: {
      altTitleModalOptions: {
        styles: { label: { color: 'black', fontSize: '14px' } },
        labels: { alt: 'Alt Text', title: 'Image Title' },
      },
    },
  };
}

test('nested option overrides preserve unspecified defaults', () => {
  const result = mergeOptions(defaults(), {
    overlay: { style: { border: 'none', color: 'red' } },
    resize: { allowResizing: false, minimumWidthPx: 0 },
    image: { altTitleModalOptions: { labels: { alt: '' } } },
  });
  assert.deepEqual(result.overlay, {
    className: 'overlay', style: { position: 'absolute', border: 'none', color: 'red' },
  });
  assert.deepEqual(result.resize, { allowResizing: false, minimumWidthPx: 0 });
  assert.deepEqual(result.image, {
    altTitleModalOptions: {
      styles: { label: { color: 'black', fontSize: '14px' } },
      labels: { alt: '', title: 'Image Title' },
    },
  });
});

test('arrays replace defaults by reference, including empty arrays and spec constructors', () => {
  const options = { specs: [CustomSpec], align: { alignments: [] } };
  const result = mergeOptions(defaults(), options);
  assert.strictEqual(result.specs, options.specs);
  assert.strictEqual(result.specs[0], CustomSpec);
  assert.strictEqual(result.align.alignments, options.align.alignments);
  assert.equal(result.align.allowAligning, true);
});

test('default arrays and constructors retain their identity', () => {
  const original = defaults();
  const result = mergeOptions(original, {});
  assert.strictEqual(result.specs, original.specs);
  assert.strictEqual(result.specs[0], ImageSpec);
  assert.strictEqual(result.align.alignments, original.align.alignments);
});

test('null and explicit undefined disable optional styles', () => {
  const result = mergeOptions(defaults(), {
    overlay: { style: null },
    image: { altTitleModalOptions: { styles: undefined } },
  });
  assert.strictEqual(result.overlay.style, null);
  assert.strictEqual(result.image.altTitleModalOptions.styles, undefined);
  assert.ok(Object.hasOwn(result.image.altTitleModalOptions, 'styles'));
});

test('nested objects are cloned without mutating either input or later merges', () => {
  const original = defaults();
  const options = { overlay: { style: { color: 'red' } }, extra: { nested: { value: 1 } } };
  const result = mergeOptions(original, options);
  assert.notStrictEqual(result.overlay.style, original.overlay.style);
  assert.notStrictEqual(result.image.altTitleModalOptions.styles.label,
    original.image.altTitleModalOptions.styles.label);
  assert.notStrictEqual(result.extra.nested, options.extra.nested);
  result.overlay.style.position = 'fixed';
  result.extra.nested.value = 2;
  assert.equal(original.overlay.style.position, 'absolute');
  assert.equal(options.extra.nested.value, 1);
  assert.equal(mergeOptions(original, {}).overlay.style.position, 'absolute');
});

test('object overrides replace null placeholders and array/object mismatches', () => {
  assert.deepEqual(mergeOptions({ style: null, values: [] }, {
    style: { color: 'red' }, values: { enabled: true },
  }), { style: { color: 'red' }, values: { enabled: true } });
  const values = [];
  assert.strictEqual(mergeOptions({ values: { enabled: true } }, { values }).values, values);
});

test('only own enumerable keys are copied, including symbols', () => {
  const symbol = Symbol('option');
  const options = Object.create({ inherited: true });
  options.visible = { enabled: true };
  options[symbol] = { value: 1 };
  Object.defineProperty(options, 'hidden', { value: true });
  const result = mergeOptions({}, options);
  assert.deepEqual(result, { visible: { enabled: true }, [symbol]: { value: 1 } });
  assert.notStrictEqual(result[symbol], options[symbol]);
});

test('prototype-related keys are discarded in both inputs and nested records', () => {
  const payload = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"prototype":{"polluted":true},"color":"red"}');
  for (const result of [mergeOptions(payload, {}), mergeOptions({}, payload)]) {
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.deepEqual(result, { color: 'red' });
    assert.equal(result.polluted, undefined);
  }
  const result = mergeOptions({ style: null }, { style: payload });
  assert.equal(Object.getPrototypeOf(result.style), Object.prototype);
  assert.deepEqual(result.style, { color: 'red' });
  assert.equal(Object.prototype.polluted, undefined);
});

test('null-prototype records cannot poison returned prototypes (PR #277 cases)', () => {
  const payload = Object.assign(Object.create(null),
    JSON.parse('{"__proto__":{"polluted":true},"color":"red"}'));
  const results = [
    mergeOptions(Object.create(null), payload),
    mergeOptions(payload, {}),
    mergeOptions({ style: null }, { style: payload }).style,
  ];
  for (const result of results) {
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.deepEqual(result, { color: 'red' });
    assert.equal(result.polluted, undefined);
    assert.equal(Object.hasOwn(result, '__proto__'), false);
  }
  assert.equal(Object.hasOwn(payload, '__proto__'), true);
  assert.equal(Object.prototype.polluted, undefined);
});

test('non-record values and callbacks are preserved rather than traversed', () => {
  class CustomValue { value = 1; }
  const instance = new CustomValue();
  const callback = () => 'value';
  const date = new Date();
  const pattern = /image/;
  const result = mergeOptions({}, { instance, callback, date, pattern });
  assert.strictEqual(result.instance, instance);
  assert.strictEqual(result.callback, callback);
  assert.strictEqual(result.date, date);
  assert.strictEqual(result.pattern, pattern);
});