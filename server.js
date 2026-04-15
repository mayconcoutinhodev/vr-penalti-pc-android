const https      = require('https');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const url        = require('url');
const selfsigned = require('selfsigned');
const { WebSocketServer } = require('ws');
const next       = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// ─── Certificado auto-assinado ────────────────────────────────────────────────
const CERT_FILE = path.join(__dirname, '.cert.json');
let pems;

if (fs.existsSync(CERT_FILE)) {
  pems = JSON.parse(fs.readFileSync(CERT_FILE, 'utf8'));
} else {
  console.log('Gerando certificado SSL...');
  pems = selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    { days: 365, keySize: 2048 }
  );
  fs.writeFileSync(CERT_FILE, JSON.stringify(pems));
}

// ─── IP local ─────────────────────────────────────────────────────────────────
const ifaces   = os.networkInterfaces();
const LOCAL_IP = Object.values(ifaces)
  .flat()
  .find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';

const PORT = 8443;

// ─── Constantes do gol (devem espelhar penaltyScene.js no cliente) ────────────
const GOAL = {
  halfWidth: 1.85,  // metros (gol total 3.7 m)
  height:    2.0,   // metros
  z:        -3.5,   // posição z do gol na cena
};
const BALL_ORIGIN = { x: 0, y: 0.22, z: 2.0 }; // ponto de partida da bola
const BALL_SPEED  = 14;   // m/s
const SAVE_RADIUS = 0.38; // metros — raio de colisão mão + bola
const FLIGHT_BUFFER_MS = 300; // ms extras antes de declarar gol

// ─── Sala de pênalti ──────────────────────────────────────────────────────────
// Estrutura: clientId → { ws, role, playerType }
function createPenaltyRoom() {
  const clients    = new Map();
  let roundState   = 'waiting_players';
  let currentBall  = null;
  let flightTimer  = null;
  let score        = { attacker: 0, goalkeeper: 0 };

  // ── Broadcast helpers ────────────────────────────────────────────────────
  function broadcast(data) {
    const text = JSON.stringify(data);
    for (const { ws } of clients.values()) {
      if (ws.readyState === 1) ws.send(text);
    }
  }

  function sendTo(clientId, data) {
    const c = clients.get(clientId);
    if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(data));
  }

  // ── Role assignment ───────────────────────────────────────────────────────
  function assignRoles() {
    let hasAttacker    = false;
    let hasGoalkeeper  = false;

    // Prioridade: VR → goleiro; demais → atacante (primeiro), espectador (resto)
    for (const [id, c] of clients) {
      if (c.playerType === 'vr' && !hasGoalkeeper) {
        c.role = 'goalkeeper';
        hasGoalkeeper = true;
      } else if (!hasAttacker) {
        c.role = 'attacker';
        hasAttacker = true;
      } else {
        c.role = 'spectator';
      }
      sendTo(id, { type: 'penalty:assign_role', role: c.role, roundState, score });
    }

    if (hasAttacker && roundState === 'waiting_players') {
      roundState = 'preparing_shot';
      const attacker = [...clients.entries()].find(([, c]) => c.role === 'attacker');
      broadcast({
        type: 'penalty:round_start',
        attackerId: attacker[0],
        goalkeeperPresent: hasGoalkeeper,
      });
    }

    if (!hasAttacker && roundState !== 'waiting_players') {
      roundState = 'waiting_players';
      if (flightTimer) { clearTimeout(flightTimer); flightTimer = null; }
      currentBall = null;
      broadcast({ type: 'penalty:state_update', roundState, score });
    }
  }

  // ── Cálculo da trajetória (autoritativo) ──────────────────────────────────
  function computeBall(target) {
    // target: { x: -1..1, y: 0..1 } normalizado
    const gx = target.x * GOAL.halfWidth;
    const gy = target.y * GOAL.height;
    return {
      origin:    { ...BALL_ORIGIN },
      target:    { x: gx, y: gy, z: GOAL.z },
      speed:     BALL_SPEED,
      startTime: Date.now(),
    };
  }

  // ── Duração do voo em ms ──────────────────────────────────────────────────
  function flightDuration(ball) {
    const dx = ball.target.x - ball.origin.x;
    const dy = ball.target.y - ball.origin.y;
    const dz = ball.target.z - ball.origin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return (dist / ball.speed) * 1000;
  }

  // ── Posição da bola em um instante ───────────────────────────────────────
  function ballPositionAt(ball, nowMs) {
    const elapsed = (nowMs - ball.startTime) / 1000;
    const dx = ball.target.x - ball.origin.x;
    const dy = ball.target.y - ball.origin.y;
    const dz = ball.target.z - ball.origin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const frac = Math.min(1, (elapsed * ball.speed) / dist);
    return {
      x: ball.origin.x + dx * frac,
      y: ball.origin.y + dy * frac,
      z: ball.origin.z + dz * frac,
    };
  }

  // ── Verificação de defesa ─────────────────────────────────────────────────
  function checkSave(hands, ball) {
    const now   = Date.now();
    const bPos  = ballPositionAt(ball, now);
    const LATEN = 150; // ms de tolerância para latência

    // Checa também a posição 150ms no futuro (tolera delay do cliente)
    const bPosFuture = ballPositionAt(ball, now + LATEN);

    for (const pos of [hands.left, hands.right]) {
      if (!pos) continue;
      for (const bp of [bPos, bPosFuture]) {
        const dx = pos.x - bp.x;
        const dy = pos.y - bp.y;
        const dz = pos.z - bp.z;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < SAVE_RADIUS) return true;
      }
    }
    return false;
  }

  // ── Fim de rodada ─────────────────────────────────────────────────────────
  function endRound(result) {
    if (flightTimer) { clearTimeout(flightTimer); flightTimer = null; }
    roundState  = 'round_end';
    currentBall = null;

    if (result === 'goal')  score.attacker++;
    if (result === 'saved') score.goalkeeper++;

    broadcast({ type: 'penalty:round_result', result, score });
    console.log(`⚽ Rodada encerrada: ${result} | Placar ${score.attacker}×${score.goalkeeper}`);

    setTimeout(() => resetRound(), 3500);
  }

  function resetRound() {
    roundState  = 'preparing_shot';
    currentBall = null;
    broadcast({ type: 'penalty:state_update', roundState, score });
  }

  // ── Handler de mensagens penalty ──────────────────────────────────────────
  function handleMessage(clientId, msg, ws) {
    switch (msg.type) {

      case 'penalty:join_room': {
        const existing = clients.get(clientId);
        if (existing) {
          existing.playerType = msg.playerType; // atualiza (ex: entrou em VR)
        } else {
          clients.set(clientId, { ws, role: 'spectator', playerType: msg.playerType });
        }
        console.log(`🎮 [penalty] ${clientId.slice(0, 8)} entrou como ${msg.playerType}`);
        assignRoles();
        break;
      }

      case 'penalty:confirm_shot': {
        const c = clients.get(clientId);
        if (!c || c.role !== 'attacker')         break;
        if (roundState !== 'preparing_shot')     break;

        roundState   = 'ball_in_flight';
        currentBall  = computeBall(msg.target);

        broadcast({ type: 'penalty:shot_started', ball: currentBall });
        console.log(`🦵 Chute confirmado → alvo x=${msg.target.x.toFixed(2)} y=${msg.target.y.toFixed(2)}`);

        const dur = flightDuration(currentBall) + FLIGHT_BUFFER_MS;
        flightTimer = setTimeout(() => {
          if (roundState === 'ball_in_flight') endRound('goal');
        }, dur);
        break;
      }

      case 'penalty:hand_update': {
        const c = clients.get(clientId);
        if (!c || c.role !== 'goalkeeper')   break;
        if (roundState !== 'ball_in_flight') break;
        if (!currentBall)                    break;

        if (checkSave(msg.hands, currentBall)) {
          endRound('saved');
        }
        break;
      }
    }
  }

  // ── Remoção de cliente ────────────────────────────────────────────────────
  function removeClient(clientId) {
    if (!clients.has(clientId)) return;
    clients.delete(clientId);
    console.log(`🎮 [penalty] ${clientId.slice(0, 8)} saiu`);
    assignRoles();
  }

  return { handleMessage, removeClient };
}

// ─── Inicializa Next.js e sobe o servidor ─────────────────────────────────────
app.prepare().then(() => {
  const server = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const { pathname } = parsedUrl;

    if (pathname === '/api/models') {
      const modelsDir = path.join(__dirname, 'public', 'models');
      if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });
      const files = fs.readdirSync(modelsDir)
        .filter(f => /\.(glb|gltf|fbx|obj)$/i.test(f))
        .sort();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(files));
      return;
    }

    if (pathname === '/api/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ip: LOCAL_IP, port: PORT }));
      return;
    }

    if (pathname === '/api/players') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: wss.clients.size }));
      return;
    }

    handle(req, res, parsedUrl);
  });

  // ─── WebSocket ────────────────────────────────────────────────────────────
  const wss          = new WebSocketServer({ server });
  const penaltyRoom  = createPenaltyRoom();

  function broadcastAll(data) {
    for (const c of wss.clients) if (c.readyState === 1) c.send(data);
  }

  function broadcastExcept(ws, data) {
    for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(data);
  }

  wss.on('connection', ws => {
    let myClientId = null;

    console.log(`🔌 Cliente conectado (${wss.clients.size} total)`);
    broadcastAll(JSON.stringify({ type: 'players', count: wss.clients.size }));

    ws.on('message', rawData => {
      const text = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
      let msg;
      try { msg = JSON.parse(text); } catch(e) { return; }

      if (msg.clientId && !myClientId) myClientId = msg.clientId;

      // ── Mensagens penalty: servidor autoritativo, sem relay ────────────────
      if (typeof msg.type === 'string' && msg.type.startsWith('penalty:')) {
        penaltyRoom.handleMessage(myClientId || msg.clientId, msg, ws);
        return;
      }

      // ── Mensagens existentes: relay normal ─────────────────────────────────
      if (msg.type === 'join') {
        broadcastAll(JSON.stringify({ type: 'players', count: wss.clients.size }));
      }

      broadcastExcept(ws, text);
    });

    ws.on('close', () => {
      console.log(`❌ Cliente desconectado (${wss.clients.size} total)`);
      if (myClientId) {
        broadcastAll(JSON.stringify({ type: 'disconnect', clientId: myClientId }));
        penaltyRoom.removeClient(myClientId);
      }
      broadcastAll(JSON.stringify({ type: 'players', count: wss.clients.size }));
    });
  });

  // ─── Start ────────────────────────────────────────────────────────────────
  server.listen(PORT, '0.0.0.0', () => {
    console.log('\n✅ Servidor HTTPS rodando!\n');
    console.log(`  💻 No PC:       https://localhost:${PORT}`);
    console.log(`  🥽 No Quest 3:  https://${LOCAL_IP}:${PORT}`);
    console.log('\n⚠️  No Quest 3, aceite o aviso de certificado:');
    console.log('   Clique em "Avançado" → "Continuar para o site"\n');
    console.log('Pressione Ctrl+C para parar.\n');
  });
});
