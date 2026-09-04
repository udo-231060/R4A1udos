import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validLevel,
  visibleName,
  publicMessage,
  canReadRoom,
} from '../lib/privacy.ts';
test('匿名レベルは0〜3の整数だけ', () => {
  for (const v of [0, 1, 2, 3]) assert.equal(validLevel(v), true);
  for (const v of [-1, 4, 1.5, '1', null, undefined, NaN])
    assert.equal(validLevel(v), false);
});
test('公開名は選択されたレベルだけを使う', () => {
  const p = { registered: '登録名', nickname: 'ニックネーム', level: 0 };
  assert.equal(visibleName(p, '会話仮名', '12345678-ab'), '登録名');
  assert.equal(
    visibleName({ ...p, level: 1 }, '会話仮名', '12345678-ab'),
    'ニックネーム',
  );
  assert.equal(
    visibleName({ ...p, level: 2 }, '会話仮名', '12345678-ab'),
    '会話仮名',
  );
  assert.equal(
    visibleName({ ...p, level: 3 }, '会話仮名', '12345678-ab'),
    '匿名・12345678',
  );
  assert.throws(() => visibleName({ ...p, registered: '' }, 'x', 'x'));
});
test('公開レスポンスはメール・内部ID・保存キーを含まない', () => {
  const r = publicMessage(
    {
      id: 'post',
      author: 'secret-user',
      email: 'private@example.invalid',
      registered: '秘密の名前',
      media: 'private-object',
      name: '匿名・1234',
      level: 3,
      body: '投稿',
      mime: 'image/png',
      created: 1,
    },
    'viewer',
  );
  assert.deepEqual(
    Object.keys(r).sort(),
    [
      'id',
      'name',
      'level',
      'body',
      'mime',
      'created',
      'mine',
      'mediaUrl',
    ].sort(),
  );
  assert.equal(r.mine, false);
  assert.equal(JSON.stringify(r).includes('secret-user'), false);
  assert.equal(JSON.stringify(r).includes('private-object'), false);
});
test('個人チャットは参加者だけが閲覧できる', () => {
  assert.equal(canReadRoom('general', 'visitor', null), true);
  assert.equal(canReadRoom('private', 'a', { a: 'a', b: 'b' }), true);
  assert.equal(canReadRoom('private', 'b', { a: 'a', b: 'b' }), true);
  assert.equal(canReadRoom('private', 'c', { a: 'a', b: 'b' }), false);
  assert.equal(canReadRoom('private', 'a', null), false);
});
