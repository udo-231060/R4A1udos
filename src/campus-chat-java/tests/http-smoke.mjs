// Uses temporary data only. Checks the real server, cookies/CSRF, uploads and persistence across restarts.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../',import.meta.url));
const directory = await mkdtemp(join(tmpdir(),'campus-chat-test-'));
const jar = resolve(project,'target/campus-chat-1.0.0.jar');
let server, origin, output = '';
async function start() {
  output = '';
  server = spawn(process.env.JAVA_EXE || 'java',['-jar',jar,'--server.port=0'], {cwd:directory,windowsHide:true,stdio:['ignore','pipe','pipe']});
  return new Promise((ok,fail) => {
    const timer = setTimeout(() => fail(new Error('Server did not start: '+output)),30000);
    server.on('error',e => { clearTimeout(timer); fail(e); });
    server.on('exit',code => { clearTimeout(timer); fail(new Error('Server exited: '+code+' '+output)); });
    const receive = data => {
      output += data.toString();
      const port = output.match(/Tomcat started on port (\d+)/)?.[1];
      if (port) { origin = `http://127.0.0.1:${port}`; clearTimeout(timer); ok(); }
    };
    server.stdout.on('data',receive); server.stderr.on('data',receive);
  });
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  await new Promise(resolve => { server.once('exit',resolve); server.kill(); });
}
function client() {
  let cookie = '', csrf;
  async function request(path,opts={}) {
    const headers = {...opts.headers};
    if (cookie) headers.Cookie = cookie;
    if (opts.method === 'POST' && opts.csrf !== false) headers[csrf.headerName] = csrf.token;
    const r = await fetch(origin+path,{...opts,headers});
    const set = r.headers.getSetCookie().find(s => s.startsWith('JSESSIONID='));
    if (set) cookie = set.split(';')[0];
    return r;
  }
  async function token() { const r = await request('/api/csrf'); assert.equal(r.status,200); csrf = await r.json(); }
  async function login() {
    await token();
    const r = await request('/api/login',{method:'POST',body:new URLSearchParams({username:'test-student',password:'test-only-password-123'})});
    assert.equal(r.status,204); await token();
  }
  return {request,token,login};
}
try {
  await start();
  const browser = client();
  assert.equal((await browser.request('/')).status,200);
  assert.equal((await browser.request('/app.js')).status,200);
  assert.equal((await browser.request('/api/chat')).status,401);
  await browser.token();
  assert.equal((await browser.request('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'test-student',password:'test-only-password-123'})})).status,201);
  await browser.login();
  const profile = await (await browser.request('/api/chat?action=profile')).json();
  assert.equal(profile.level,1);
  assert.equal((await browser.request('/api/chat?action=profile',{method:'POST',csrf:false,headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6eT8AAAAASUVORK5CYII=','base64');
  const data = new FormData(); data.set('room','general'); data.set('body','再起動後も残る投稿'); data.set('file',new Blob([png],{type:'image/png'}),'test.png');
  const sent = await browser.request('/api/chat',{method:'POST',body:data}); assert.equal(sent.status,201); const {id} = await sent.json();
  const media = await browser.request('/api/chat?action=media&id='+id); assert.equal(media.status,200); assert.deepEqual(Buffer.from(await media.arrayBuffer()),png);
  await stop(); await start();
  const returning = client(); await returning.login();
  const savedResponse = await returning.request('/api/chat'); assert.equal(savedResponse.status,200);
  const saved = await savedResponse.json(); assert.equal(saved.length,1,'The committed post must survive a forced process stop.'); assert.equal(saved[0].body,'再起動後も残る投稿');
  const savedMedia = await returning.request('/api/chat?action=media&id='+id); assert.equal(savedMedia.status,200); assert.deepEqual(Buffer.from(await savedMedia.arrayBuffer()),png);
  assert.equal((await returning.request('/api/logout',{method:'POST'})).status,204);
  assert.equal((await returning.request('/api/chat')).status,401);
  console.log('HTTP smoke passed: real login, CSRF, multipart upload, restart persistence and logout.');
} finally { await stop(); await rm(directory,{recursive:true,force:true}); }
