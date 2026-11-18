import { test } from 'node:test';
import assert from 'node:assert/strict';

test('ambiente tem DecompressionStream e CompressionStream', () => {
  assert.equal(typeof DecompressionStream, 'function');
  assert.equal(typeof CompressionStream, 'function');
});
