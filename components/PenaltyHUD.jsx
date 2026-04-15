'use client';

import { useState, useRef, useCallback } from 'react';

/**
 * Overlay de pênalti.
 *
 * Props:
 *   role        — 'attacker' | 'goalkeeper' | 'spectator' | null
 *   roundState  — RoundState
 *   score       — { attacker, goalkeeper }
 *   onAim       — (target: {x, y}) → void   (preview em tempo real)
 *   onShoot     — (target: {x, y}) → void   (confirma chute)
 */
export default function PenaltyHUD({ role, roundState, score, onAim, onShoot }) {
  const [aimTarget, setAimTarget] = useState(null);
  const goalRef   = useRef(null);
  const scoreStr  = `${score?.attacker ?? 0} × ${score?.goalkeeper ?? 0}`;

  // ── Calcula alvo normalizado a partir do clique/toque no div do gol ───────
  const calcTarget = useCallback((clientX, clientY) => {
    if (!goalRef.current) return null;
    const rect = goalRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left)  / rect.width)  * 2 - 1; // -1..1
    const y = 1 - (clientY - rect.top) / rect.height;           //  0..1
    return {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(0,  Math.min(1, y)),
    };
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (roundState !== 'preparing_shot') return;
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const t  = calcTarget(cx, cy);
    if (!t) return;
    setAimTarget(t);
    onAim?.(t);
  }, [roundState, calcTarget, onAim]);

  // ── Espectador ────────────────────────────────────────────────────────────
  if (!role || role === 'spectator') {
    return (
      <div style={{ ...s.badge, color: '#777' }}>
        👀 Espectador &nbsp;·&nbsp; <span style={{ color: '#a78bfa' }}>{scoreStr}</span>
      </div>
    );
  }

  // ── Goleiro VR ────────────────────────────────────────────────────────────
  if (role === 'goalkeeper') {
    return (
      <div style={s.badge}>
        🥅 Goleiro VR &nbsp;
        <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>{scoreStr}</span>
        {roundState === 'ball_in_flight' && (
          <span style={s.alertPulse}> ⚡ DEFENDA!</span>
        )}
        {roundState === 'preparing_shot' && (
          <span style={{ color: '#888', marginLeft: 8 }}>Aguardando chute...</span>
        )}
      </div>
    );
  }

  // ── Atacante PC / Android ─────────────────────────────────────────────────
  return (
    <div style={s.attackerPanel}>
      {/* Placar */}
      <div style={s.score}>
        ⚽ <span style={{ color: '#f97316' }}>{score?.attacker ?? 0}</span>
        &nbsp;×&nbsp;
        <span style={{ color: '#22c55e' }}>{score?.goalkeeper ?? 0}</span> 🥅
      </div>

      {roundState === 'preparing_shot' && (
        <>
          <p style={s.hint}>
            {aimTarget ? 'Confirme o chute' : 'Clique / toque no gol para mirar'}
          </p>

          {/* Representação do gol */}
          <div
            ref={goalRef}
            style={s.goalGrid}
            onClick={handlePointerDown}
            onTouchStart={handlePointerDown}
          >
            {/* 3 zonas visuais */}
            <div style={{ ...s.zone, background: 'rgba(255,80,80,0.15)' }} />
            <div style={{ ...s.zone, background: 'rgba(255,255,255,0.04)', borderInline: '1px solid rgba(255,255,255,0.15)' }} />
            <div style={{ ...s.zone, background: 'rgba(255,80,80,0.15)' }} />

            {/* Traves */}
            <div style={s.postLeft}  />
            <div style={s.postRight} />
            <div style={s.crossbar}  />

            {/* Marcador de mira */}
            {aimTarget && (
              <div style={{
                ...s.aimDot,
                left:   `${((aimTarget.x + 1) / 2) * 100}%`,
                bottom: `${aimTarget.y * 100}%`,
              }} />
            )}
          </div>

          {/* Botão de chute */}
          {aimTarget && (
            <button
              style={s.shootBtn}
              onClick={() => onShoot?.(aimTarget)}
              onTouchEnd={e => { e.preventDefault(); onShoot?.(aimTarget); }}
            >
              ⚽ CHUTAR!
            </button>
          )}
        </>
      )}

      {roundState === 'ball_in_flight' && (
        <p style={{ ...s.hint, color: '#f97316', fontWeight: 'bold' }}>
          Bola em jogo...
        </p>
      )}

      {roundState === 'round_end' && (
        <p style={{ ...s.hint, color: '#a78bfa' }}>
          Próxima rodada em breve...
        </p>
      )}

      {roundState === 'waiting_players' && (
        <p style={{ ...s.hint, color: '#777' }}>
          Aguardando goleiro VR...
        </p>
      )}
    </div>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const panelBase = {
  background:   'rgba(0,0,0,0.75)',
  border:       '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12,
  color:        '#fff',
  fontFamily:   'Arial, sans-serif',
};

const s = {
  badge: {
    ...panelBase,
    position:  'absolute',
    bottom:    24,
    left:      '50%',
    transform: 'translateX(-50%)',
    padding:   '10px 22px',
    zIndex:    150,
    fontSize:  14,
    display:   'flex',
    alignItems: 'center',
    gap:       6,
    whiteSpace: 'nowrap',
  },
  alertPulse: {
    color:     '#f97316',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  attackerPanel: {
    ...panelBase,
    position:       'absolute',
    bottom:         24,
    left:           '50%',
    transform:      'translateX(-50%)',
    padding:        '14px 20px',
    zIndex:         150,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            10,
    minWidth:       300,
  },
  score: {
    fontSize:   18,
    fontWeight: 'bold',
  },
  hint: {
    margin:   0,
    fontSize: 12,
    color:    '#ccc',
  },
  goalGrid: {
    position:   'relative',
    width:       260,
    height:      140,
    border:      '2px solid rgba(255,255,255,0.6)',
    cursor:      'crosshair',
    display:     'flex',
    overflow:    'hidden',
    borderRadius: 3,
    userSelect:  'none',
    touchAction: 'none',
  },
  zone: {
    flex: 1,
  },
  postLeft: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 4, background: '#fff', opacity: 0.7,
  },
  postRight: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: 4, background: '#fff', opacity: 0.7,
  },
  crossbar: {
    position: 'absolute', left: 0, right: 0, top: 0,
    height: 4, background: '#fff', opacity: 0.7,
  },
  aimDot: {
    position:     'absolute',
    width:         18,
    height:        18,
    borderRadius: '50%',
    background:   '#ef4444',
    border:       '2px solid #fff',
    transform:    'translate(-50%, 50%)',
    pointerEvents: 'none',
    boxShadow:    '0 0 10px #ef4444',
    zIndex:        2,
  },
  shootBtn: {
    background:   '#ef4444',
    color:        '#fff',
    border:       'none',
    borderRadius:  8,
    padding:      '11px 36px',
    fontSize:      16,
    fontWeight:   'bold',
    cursor:       'pointer',
    letterSpacing: 1,
    touchAction:  'manipulation',
  },
};
