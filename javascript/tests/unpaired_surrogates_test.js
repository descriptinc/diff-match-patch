import assert from 'node:assert/strict';
import test from 'node:test';
import { diff_match_patch, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from '../index.js';

const dmp = new diff_match_patch();
const prefix = 'a'.repeat(10);
const suffix = 'b'.repeat(18);

for (const surrogate of ['\ud83d', '\udc00']) {
  for (const operation of ['insert', 'delete']) {
    test(`${operation} an unpaired ${surrogate === '\ud83d' ? 'high' : 'low'} surrogate`, () => {
      const withSurrogate = prefix + surrogate + suffix;
      const withoutSurrogate = prefix + suffix;
      const before = operation === 'delete' ? withSurrogate : withoutSurrogate;
      const after = operation === 'delete' ? withoutSurrogate : withSurrogate;

      const diffs = dmp.diff_main(before, after);
      const delta = dmp.diff_toDelta(diffs);
      if (operation === 'insert') {
        assert.match(delta, /%ED%[AB][0-9A-F]%[89AB][0-9A-F]/);
      }
      const decodedDiffs = dmp.diff_fromDelta(before, delta);
      assert.equal(dmp.diff_text1(decodedDiffs), before);
      assert.equal(dmp.diff_text2(decodedDiffs), after);

      const patches = dmp.patch_make(before, after);
      assert.notEqual(patches.length, 0);
      assert.deepEqual(dmp.patch_apply(patches, before), [after, [true]]);

      const patchText = dmp.patch_toText(patches);
      assert.match(patchText, /%ED%[AB][0-9A-F]%[89AB][0-9A-F]/);
      assert.deepEqual(dmp.patch_apply(dmp.patch_fromText(patchText), before), [after, [true]]);
    });
  }
}

test('moving a split surrogate pair preserves both texts', () => {
  const before = '\ud83d\ude00';
  const after = '\ud83d\ude01';
  const diffs = [[DIFF_EQUAL, '\ud83d'], [DIFF_DELETE, '\ude00'], [DIFF_INSERT, '\ude01']];

  dmp.diff_cleanupSplitSurrogates(diffs);
  assert.equal(dmp.diff_text1(diffs), before);
  assert.equal(dmp.diff_text2(diffs), after);
  assert.deepEqual(diffs, [[DIFF_DELETE, before], [DIFF_INSERT, after]]);
});

test('a high surrogate is retained when the next low surrogate belongs to only one text', () => {
  const diffs = [[DIFF_EQUAL, '\ud83d'], [DIFF_DELETE, '\ude00']];
  dmp.diff_cleanupSplitSurrogates(diffs);
  assert.equal(dmp.diff_text1(diffs), '\ud83d\ude00');
  assert.equal(dmp.diff_text2(diffs), '\ud83d');
});

test('patch text round-trips lone surrogates alongside valid Unicode and URI escapes', () => {
  const before = '😀 %\n' + '\ud83d' + ' middle ' + '\udc00' + ' end';
  const after = '😀 %\n' + '\udc00' + ' middle ' + '\ud83d' + ' end';
  const patches = dmp.patch_make(before, after);
  const patchText = dmp.patch_toText(patches);
  assert.deepEqual(dmp.patch_apply(dmp.patch_fromText(patchText), before)[0], after);
});
