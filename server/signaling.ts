import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { clientMessage, MAX_MEMBERS, type Member } from '../src/network/protocol.ts';

interface Client extends Member { ws: WebSocket; room?: Room; alive: boolean; budget: number; refill: number; ip: string; }
interface Room { token: string; host: string; members: Map<string, Client>; created: number; }
export function createSignaling(options: { origins: string[]; turnSecret?: string; turnHost?: string; relayOnly?: boolean; trustProxy?: boolean }) {
  const rooms = new Map<string, Room>();
  const clients = new Set<Client>();
  const attempts = new Map<string, { count: number; until: number }>();
  const http = createServer((req, res) => {
    res.writeHead(req.url === '/health' ? 200 : 404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end(req.url === '/health' ? 'ok' : 'not found');
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
  function send(client: Client, value: unknown) {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    if (client.ws.bufferedAmount > 128 * 1024) { client.ws.terminate(); return; }
    client.ws.send(JSON.stringify(value));
  }
  function members(room: Room) { return [...room.members.values()].map(({ id, name }) => ({ id, name })); }
  function broadcast(room: Room, value: unknown) { for (const client of room.members.values()) send(client, value); }
  function closeRoom(room: Room, reason: string) {
    rooms.delete(room.token);
    for (const client of room.members.values()) { client.room = undefined; send(client, { type: 'closed', reason }); client.ws.close(1000); }
    room.members.clear();
  }
  function remove(client: Client) {
    clients.delete(client);
    const room = client.room; client.room = undefined;
    if (!room) return;
    if (room.host === client.id) closeRoom(room, 'ホストが退出したため、ルームを終了しました。');
    else { room.members.delete(client.id); broadcast(room, { type: 'members', members: members(room) }); }
  }
  http.on('upgrade', (req, socket, head) => {
    const ip = options.trustProxy ? String(req.headers['x-real-ip'] ?? req.socket.remoteAddress) : String(req.socket.remoteAddress);
    const now = Date.now();
    let attempt = attempts.get(ip);
    if (!attempt || attempt.until < now) { attempt = { count: 0, until: now + 60000 }; attempts.set(ip, attempt); }
    attempt.count++;
    if (req.url !== '/room/signal' || !options.origins.includes(req.headers.origin ?? '') || clients.size >= 300 || [...clients].filter(c => c.ip === ip).length >= 24 || attempt.count > 40) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      const client: Client = { ws, id: randomUUID(), name: '旅人', alive: true, budget: 120, refill: now, ip };
      clients.add(client);
      const timeout = setTimeout(() => { if (!client.room) ws.close(1008, 'Join timeout'); }, 15000);
      ws.on('pong', () => { client.alive = true; });
      ws.on('error', () => ws.terminate());
      ws.on('close', () => { clearTimeout(timeout); remove(client); });
      ws.on('message', (raw, binary) => {
        const time = Date.now(); client.budget = Math.min(120, client.budget + (time - client.refill) * 0.04); client.refill = time;
        if (binary || --client.budget < 0) { ws.close(1008, 'Rate limit'); return; }
        try {
          const msg = clientMessage.parse(JSON.parse(raw.toString()));
          if (msg.type === 'kick') {
            const room = client.room;
            if (room?.host !== client.id || msg.id === client.id) throw new Error();
            const target = room.members.get(msg.id);
            if (target) { remove(target); send(target, { type: 'closed', reason: 'ホストとの接続を維持できませんでした。入室し直してください。' }); target.ws.close(1000); }
            return;
          }
          if (msg.type === 'signal') {
            const target = client.room?.members.get(msg.to);
            if (!target || target === client) return;
            send(target, { type: 'signal', from: client.id, payload: msg.payload }); return;
          }
          if (client.room) throw new Error('Already joined');
          client.name = msg.name;
          let room: Room | undefined;
          if (msg.type === 'create') {
            if (rooms.size >= 60) { send(client, { type: 'error', message: 'ただいま混み合っています。少し待って再試行してください。' }); ws.close(); return; }
            const token = randomBytes(24).toString('base64url');
            room = { token, host: client.id, members: new Map(), created: time }; rooms.set(token, room);
          } else room = rooms.get(msg.token);
          if (!room) { send(client, { type: 'error', message: '招待リンクが無効か、ルームが終了しています。' }); ws.close(); return; }
          if (room.members.size >= MAX_MEMBERS) { send(client, { type: 'error', message: 'ルームは満員です（最大6人）。' }); ws.close(); return; }
          client.room = room; room.members.set(client.id, client); clearTimeout(timeout);
          const iceServers: { urls: string[]; username?: string; credential?: string }[] = [];
          if (options.turnHost && options.turnSecret) {
            const username = `${Math.floor(time / 1000) + 8 * 3600}:${client.id}`;
            iceServers.push({ urls: [`stun:${options.turnHost}:3478`] });
            iceServers.push({ urls: [`turn:${options.turnHost}:3478?transport=udp`, `turn:${options.turnHost}:3478?transport=tcp`], username, credential: createHmac('sha1', options.turnSecret).update(username).digest('base64') });
          }
          send(client, { type: 'welcome', self: client.id, host: room.host, token: room.token, members: members(room), iceServers, relayOnly: !!options.relayOnly });
          broadcast(room, { type: 'members', members: members(room) });
        } catch { ws.close(1008, 'Invalid message'); }
      });
    });
  });
  const timer = setInterval(() => {
    for (const client of clients) { if (!client.alive) client.ws.terminate(); else { client.alive = false; client.ws.ping(); } }
    for (const room of rooms.values()) if (Date.now() - room.created > 6 * 3600000) closeRoom(room, '6時間の制限に達したためルームを終了しました。新しく作成してください。');
    for (const [ip, entry] of attempts) if (entry.until < Date.now()) attempts.delete(ip);
  }, 20000);
  return { http, close: async () => { clearInterval(timer); for (const client of clients) client.ws.terminate(); wss.close(); await new Promise<void>(resolve => http.close(() => resolve())); } };
}
