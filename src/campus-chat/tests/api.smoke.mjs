import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
const signIn = await fetch(origin + '/signin-with-chatgpt?return_to=%2F', {
  redirect: 'manual',
});
assert.equal(signIn.status, 302);
const cookie = signIn.headers.get('set-cookie').split(';')[0];
async function request(query, body, authenticated = true) {
  return fetch(origin + '/api/chat?' + query, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(authenticated ? { Cookie: cookie } : {}),
      ...(body ? { Origin: origin } : {}),
      ...(body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
}
async function read(q, b) {
  const r = await request(q, b);
  const d = await r.json();
  assert.ok(r.ok, JSON.stringify(d));
  return d;
}
const original = await read('action=profile');
try {
  assert.equal((await request('room=general', undefined, false)).status, 401);
  assert.equal((await request('room=non-participant')).status, 403);
  assert.equal(
    (await request('action=profile', { ...original, level: 4 })).status,
    400,
  );
  assert.equal(
    (await request('action=profile', { ...original, registered: '', level: 0 }))
      .status,
    400,
  );
  const ids = [];
  for (const level of [0, 1, 2, 3]) {
    await read('action=profile', {
      registered: '試験登録名',
      nickname: '試験ニックネーム',
      level,
    });
    const form = new FormData();
    form.set('body', '匿名レベル検証 ' + level);
    form.set('room', 'general');
    const posted = await read('action=send', form);
    ids.push(posted.id);
  }
  const messages = await read('room=general');
  const sent = ids.map((id) => messages.find((m) => m.id === id));
  assert.equal(sent[0].name, '試験登録名');
  assert.equal(sent[1].name, '試験ニックネーム');
  assert.match(sent[2].name, /^メンバー・/);
  assert.match(sent[3].name, /^匿名・/);
  for (const m of sent) {
    assert.equal('author' in m, false);
    assert.equal('email' in m, false);
    assert.equal('media' in m, false);
  }
  await read('action=profile', { ...original, level: 1 });
  const reread = await read('room=general');
  assert.equal(reread.find((m) => m.id === ids[0]).name, '試験登録名');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRz8AAAAASUVORK5CYII=',
    'base64',
  );
  const form = new FormData();
  form.set('room', 'general');
  form.set('body', '添付の保存テスト');
  form.set('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const media = await read('action=send', form);
  const response = await request('action=media&id=' + media.id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  assert.equal(
    (await request('action=media&id=' + media.id, undefined, false)).status,
    401,
  );
  const bad = new FormData();
  bad.set('file', new Blob(['not a png'], { type: 'image/png' }), 'bad.png');
  assert.equal((await request('action=send', bad)).status, 400);
  const dm = await read('action=thread', {
    code: 'ABCDEF0123456789ABCDEF0123456789',
  });
  const dmMessage = new FormData();
  dmMessage.set('room', dm.id);
  dmMessage.set('body', '個人チャットの保存テスト');
  const dmSent = await read('action=send', dmMessage);
  assert.ok((await read('room=' + dm.id)).some((m) => m.id === dmSent.id));
  assert.equal((await request('room=fixture-private')).status, 403);
  assert.equal(
    (await request('action=media&id=fixture-private-media')).status,
    403,
  );
  assert.ok((await read('action=threads')).some((t) => t.id === dm.id));
  await read('action=report', { id: ids[0] });
  console.log(
    'PASS: login, persistence, levels 0–3, immutable names, identity filtering, image upload, private chat and attachment access, report.',
  );
} finally {
  await read('action=profile', original);
}
