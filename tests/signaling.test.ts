import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createSignaling } from '../server/signaling';
import { peerMessage } from '../src/network/protocol';

test('rooms enforce capacity, isolate signaling, remove guests and end with the host', async () => {
  const server = createSignaling({ origins: ['http://localhost'], turnHost: 'turn.example.com', turnSecret: 'test-only' });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const port = (server.http.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/room/signal`, { origin: 'http://localhost' }); sockets.push(ws);
    const queue: any[] = []; ws.on('message', raw => queue.push(JSON.parse(raw.toString())));
    await once(ws, 'open');
    return { ws, queue, async next(type: string) {
      const end = Date.now() + 3000;
      while (Date.now() < end) { const index = queue.findIndex(x => x.type === type); if (index >= 0) return queue.splice(index, 1)[0]; await new Promise(r => setTimeout(r, 10)); }
      throw new Error(`Missing ${type}`);
    } };
  }
  try {
    const host = await connect(); host.ws.send(JSON.stringify({ type: 'create', name: 'Host' }));
    const welcome = await host.next('welcome'); assert.match(welcome.token, /^[\w-]{32}$/);
    assert.equal(welcome.iceServers.length, 2); assert.ok(welcome.iceServers[1].credential);
    const guests = [];
    for (let i = 0; i < 5; i++) { const guest = await connect(); guest.ws.send(JSON.stringify({ type: 'join', name: `Guest ${i}`, token: welcome.token })); await guest.next('welcome'); guests.push(guest); }
    const overflow = await connect(); overflow.ws.send(JSON.stringify({ type: 'join', name: 'Overflow', token: welcome.token }));
    assert.match((await overflow.next('error')).message, /満員/);
    const outsider = await connect(); outsider.ws.send(JSON.stringify({ type: 'create', name: 'Other room' }));
    await outsider.next('welcome');
    const signal = { type: 'signal', to: welcome.self, payload: { kind: 'description', description: { type: 'offer', sdp: 'test' } } };
    outsider.ws.send(JSON.stringify(signal)); await new Promise(r => setTimeout(r, 50)); assert.equal(host.queue.some(x => x.type === 'signal'), false);
    guests[0].ws.send(JSON.stringify(signal)); assert.equal((await host.next('signal')).payload.description.sdp, 'test');
    const departed = once(guests[0].ws, 'close'); guests[0].ws.close(); await departed;
    const replacement = await connect(); replacement.ws.send(JSON.stringify({ type: 'join', name: 'Replacement', token: welcome.token })); assert.equal((await replacement.next('welcome')).members.length, 6);
    const memberList = host.queue.filter(x => x.type === 'members').at(-1).members;
    const kicked = memberList.find((m: { name: string }) => m.name === 'Guest 1');
    host.ws.send(JSON.stringify({ type: 'kick', id: kicked.id }));
    assert.match((await guests[1].next('closed')).reason, /接続/);
    host.ws.close(); assert.match((await replacement.next('closed')).reason, /ホスト/);
    const expired = await connect(); expired.ws.send(JSON.stringify({ type: 'join', name: 'Expired', token: welcome.token })); assert.match((await expired.next('error')).message, /終了/);
  } finally { for (const socket of sockets) socket.terminate(); await server.close(); }
});

test('rejects untrusted origins, malformed messages, and oversized transfer declarations', async () => {
  assert.equal(peerMessage.safeParse({ type: 'asset', kind: 'avatar', size: 65 * 1024 * 1024, sha256: 'a'.repeat(64) }).success, false);
  assert.equal(peerMessage.safeParse({ type: 'pose', pose: { x: 0, y: 0, z: Infinity, yaw: 0, speed: 0, running: false } }).success, false);
  const server = createSignaling({ origins: ['http://localhost'] });
  await new Promise<void>(resolve => server.http.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${(server.http.address() as { port: number }).port}/room/signal`;
  try {
    const forbidden = new WebSocket(url, { origin: 'https://untrusted.example' });
    await once(forbidden, 'error');
    const malformed = new WebSocket(url, { origin: 'http://localhost' }); await once(malformed, 'open');
    const closed = once(malformed, 'close'); malformed.send('{bad'); assert.equal((await closed)[0], 1008);
  } finally { await server.close(); }
});
