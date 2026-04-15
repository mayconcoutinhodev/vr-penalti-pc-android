export default function HUD({ grabCount, playerCount, wsConnected, playerType, serverUrl }) {
  const panel = {
    background: 'rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    color: '#ccc',
  };

  return (
    <>
      {/* Título central */}
      <div style={{
        ...panel,
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center', padding: '10px 22px', pointerEvents: 'none', zIndex: 100,
      }}>
        <h2 style={{ fontSize: 16, color: '#a78bfa', marginBottom: 4 }}>VR Interativo</h2>
        <p style={{ fontSize: 12 }}>
          PC: <b>WASD</b> mover · mouse girar · clique pegar &nbsp;|&nbsp; Quest 3: pinch (indicador+polegar) para pegar
        </p>
      </div>

      {/* Placar */}
      <div style={{ ...panel, position: 'absolute', top: 12, right: 16, padding: '8px 16px', fontSize: 14, zIndex: 100 }}>
        Pegou: <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{grabCount}</span>
      </div>

      {/* Jogadores + status WS */}
      <div style={{
        ...panel,
        position: 'absolute', top: 12, left: 16, padding: '8px 14px', fontSize: 13,
        display: 'flex', alignItems: 'center', gap: 8, zIndex: 100,
      }}>
        <div style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          background: wsConnected ? '#22c55e' : '#ef4444',
          boxShadow: `0 0 6px ${wsConnected ? '#22c55e' : '#ef4444'}`,
          transition: 'background 0.4s, box-shadow 0.4s',
        }} />
        Jogadores: <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{playerCount}</span>
      </div>

      {/* Tipo do jogador */}
      <div style={{ ...panel, position: 'absolute', top: 52, left: 16, padding: '6px 14px', fontSize: 12, zIndex: 100 }}>
        Você: <span style={{ fontWeight: 'bold', color: '#fff' }}>
          {playerType === 'vr' ? '🥽 VR' : '💻 PC'}
        </span>
      </div>

      {/* Dica de movimento */}
      <div style={{
        ...panel,
        position: 'absolute', bottom: 80, right: 16, padding: '8px 14px',
        fontSize: 11, textAlign: 'center', lineHeight: 1.8, zIndex: 100,
      }}>
        <b style={{ color: '#a78bfa' }}>W A S D</b> ou <b style={{ color: '#a78bfa' }}>↑ ↓ ← →</b> mover<br />
        Mouse: girar câmera
      </div>

      {/* URL do servidor */}
      {serverUrl && (
        <div style={{
          ...panel,
          position: 'absolute', bottom: 80, left: 16, padding: '8px 14px', fontSize: 11, zIndex: 100,
        }}>
          <span style={{ color: '#a78bfa', fontWeight: 'bold', display: 'block', marginBottom: 2, fontSize: 10 }}>
            Digite no Quest 3 ou outro PC:
          </span>
          <b style={{ color: '#fff' }}>{serverUrl}</b>
        </div>
      )}
    </>
  );
}
