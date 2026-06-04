import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyWatermark, validateLicenseKey } from '../dist/index.js';

test('validateLicenseKey accepts demo key', () => {
  assert.equal(validateLicenseKey('RUANZHU-DEMO-PRO'), true);
  assert.equal(validateLicenseKey('invalid'), false);
});

test('applyWatermark adds banner when not licensed', () => {
  const out = applyWatermark('hello', false);
  assert.ok(out.includes('hello'));
  assert.ok(out.includes('预览版'));
});

test('applyWatermark skips when licensed', () => {
  assert.equal(applyWatermark('hello', true), 'hello');
});
