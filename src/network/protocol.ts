import { z } from 'zod';

export const MAX_MEMBERS = 6;
export const MAX_TRANSFER = 64 * 1024 * 1024;
export const memberId = z.string().uuid();
export const inviteToken = z.string().regex(/^(?:[A-Za-z0-9_-]{12}|[A-Za-z0-9_-]{32})$/);
export const displayName = z.string().trim().min(1).max(24).regex(/^[^\u0000-\u001f\u007f<>]+$/u);
export const memberSchema = z.object({ id: memberId, name: displayName }).strict();
const description = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(12000) }).strict();
const candidate = z.object({ candidate: z.string().max(1500), sdpMid: z.string().max(32).nullable().optional(), sdpMLineIndex: z.number().int().min(0).max(16).nullable().optional(), usernameFragment: z.string().max(256).nullable().optional() }).strict();
export const signalPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('description'), description }).strict(),
  z.object({ kind: z.literal('candidate'), candidate }).strict(),
]);
export const clientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), version: z.literal(2), name: displayName, shortInvite: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('join'), version: z.literal(2), name: displayName, token: inviteToken }).strict(),
  z.object({ type: z.literal('signal'), to: memberId, payload: signalPayload }).strict(),
  z.object({ type: z.literal('kick'), id: memberId }).strict(),
]);
export const serverMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), self: memberId, host: memberId, token: inviteToken, members: z.array(memberSchema).max(MAX_MEMBERS), iceServers: z.array(z.object({ urls: z.array(z.string().max(300)).max(4), username: z.string().max(100).optional(), credential: z.string().max(100).optional() }).strict()).max(3), relayOnly: z.boolean() }).strict(),
  z.object({ type: z.literal('members'), members: z.array(memberSchema).max(MAX_MEMBERS) }).strict(),
  z.object({ type: z.literal('signal'), from: memberId, payload: signalPayload }).strict(),
  z.object({ type: z.literal('closed'), reason: z.string().max(200) }).strict(),
  z.object({ type: z.literal('error'), message: z.string().max(200) }).strict(),
]);
export const poseSchema = z.object({
  x: z.number().finite().min(-10000).max(10000), y: z.number().finite().min(-10000).max(10000), z: z.number().finite().min(-10000).max(10000),
  yaw: z.number().finite().min(-10000).max(10000), speed: z.number().finite().min(0).max(20), running: z.boolean(),
}).strict();
export const peerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello') }).strict(),
  z.object({ type: z.literal('asset'), kind: z.enum(['room', 'avatar']), size: z.number().int().min(20).max(MAX_TRANSFER), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ type: z.literal('asset-end') }).strict(),
  z.object({ type: z.literal('asset-ack'), kind: z.enum(['room', 'avatar']) }).strict(),
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('voice'), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('pose'), pose: poseSchema }).strict(),
  z.object({ type: z.literal('poses'), poses: z.array(z.object({ id: memberId, pose: poseSchema }).strict()).max(MAX_MEMBERS) }).strict(),
]);
export type Member = z.infer<typeof memberSchema>;
export type Pose = z.infer<typeof poseSchema>;
export type Signal = z.infer<typeof signalPayload>;
