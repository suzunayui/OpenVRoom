import { chromium } from '@playwright/test';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('console', message => console.log(message.text()));
  await page.goto('https://openvroom.com/');
  const result = await page.evaluate(async () => {
    const ws = new WebSocket('wss://openvroom.com/room/signal');
    const pcs: RTCPeerConnection[] = [];
    try {
      const config = await new Promise<RTCConfiguration>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Signaling timeout')), 10000);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'create', name: '接続テスト' }));
        ws.onmessage = event => { const data = JSON.parse(event.data); if (data.type === 'welcome') { clearTimeout(timer); resolve({ iceServers: data.iceServers, iceTransportPolicy: 'relay' }); } };
      });
      const a = new RTCPeerConnection(config), b = new RTCPeerConnection(config); pcs.push(a, b);
      const queues: RTCIceCandidate[][] = [[], []];
      for (const [i, pc] of pcs.entries()) {
        pc.onicecandidate = event => { if (event.candidate) {
          console.log('candidate', i, event.candidate.type, event.candidate.protocol);
          const target = pcs[1-i]; if (target.remoteDescription) void target.addIceCandidate(event.candidate); else queues[1-i].push(event.candidate);
        } };
        pc.onicecandidateerror = event => console.log('ICE error', event.errorCode, event.errorText);
        pc.onconnectionstatechange = () => console.log('state', i, pc.connectionState);
      }
      const channel = a.createDataChannel('test');
      const received = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`TURN timeout: ${a.connectionState}/${b.connectionState}`)), 30000);
        b.ondatachannel = event => { event.channel.onmessage = message => { clearTimeout(timer); resolve(message.data); }; };
        channel.onopen = () => channel.send('TURN relay verified');
      });
      await a.setLocalDescription(await a.createOffer()); await b.setRemoteDescription(a.localDescription!);
      for (const c of queues[1]) await b.addIceCandidate(c);
      await b.setLocalDescription(await b.createAnswer()); await a.setRemoteDescription(b.localDescription!);
      for (const c of queues[0]) await a.addIceCandidate(c);
      return await received;
    } finally { ws.close(); for (const pc of pcs) pc.close(); }
  });
  console.log(result);
} finally { await browser.close(); }
