import { createSignaling } from './signaling.ts';
const production = process.env.NODE_ENV === 'production';
if (production && (!process.env.TURN_SECRET || !process.env.TURN_HOST)) throw new Error('TURN configuration is required');
const server = createSignaling({
  origins: (process.env.ALLOWED_ORIGINS ?? 'http://127.0.0.1:5173,http://127.0.0.1:5180').split(','),
  turnSecret: process.env.TURN_SECRET, turnHost: process.env.TURN_HOST,
  relayOnly: process.env.RELAY_ONLY === '1', trustProxy: production,
});
server.http.listen(Number(process.env.PORT ?? 8080), '127.0.0.1', () => console.log('OpenVRoom signaling ready'));
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { void server.close().then(() => process.exit(0)); });
