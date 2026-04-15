/**
 * WebSocket client module.
 * createMultiplayer(callbacks) → { clientId, connect, send }
 */
export function createMultiplayer({
  // ── Eventos existentes ────────────────────────────────────────────────────
  onGrab, onMove, onRelease, onJoin, onPlayers, onAvatar, onDisconnect,
  // ── Chamado imediatamente após o WebSocket abrir ──────────────────────────
  onOpen,
  // ── Eventos de pênalti (servidor → cliente) ───────────────────────────────
  onPenaltyAssignRole,   // { role, roundState, score }
  onPenaltyRoundStart,   // { attackerId, goalkeeperPresent }
  onPenaltyShotStarted,  // { ball: BallData }
  onPenaltyRoundResult,  // { result, score }
  onPenaltyStateUpdate,  // { roundState, score }
} = {}) {
  const clientId = crypto.randomUUID();
  let ws = null;
  let onStatusChange = null;

  function connect(statusCallback) {
    onStatusChange = statusCallback;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.addEventListener('open', () => {
      onStatusChange?.(true);
      ws.send(JSON.stringify({ type: 'join', clientId }));
      onOpen?.(); // hook para enviar mensagens extras após conectar
    });

    ws.addEventListener('close', () => {
      onStatusChange?.(false);
      setTimeout(() => connect(onStatusChange), 2000);
    });

    ws.addEventListener('error', e => console.error('[WS] erro:', e));

    ws.addEventListener('message', e => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.clientId === clientId) return;

      switch (msg.type) {
        // ── Existentes ────────────────────────────────────────────────────
        case 'grab':       onGrab?.(msg);          break;
        case 'move':       onMove?.(msg);          break;
        case 'release':    onRelease?.(msg);       break;
        case 'join':       onJoin?.();             break;
        case 'players':    onPlayers?.(msg.count); break;
        case 'avatar':     onAvatar?.(msg);        break;
        case 'disconnect': onDisconnect?.(msg);    break;
        // ── Pênalti ───────────────────────────────────────────────────────
        case 'penalty:assign_role':  onPenaltyAssignRole?.(msg);  break;
        case 'penalty:round_start':  onPenaltyRoundStart?.(msg);  break;
        case 'penalty:shot_started': onPenaltyShotStarted?.(msg); break;
        case 'penalty:round_result': onPenaltyRoundResult?.(msg); break;
        case 'penalty:state_update': onPenaltyStateUpdate?.(msg); break;
      }
    });
  }

  function send(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ ...obj, clientId }));
  }

  return { clientId, connect, send };
}
