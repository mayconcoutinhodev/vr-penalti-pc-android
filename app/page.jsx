'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useCallback } from 'react';
import HUD         from '../components/HUD';
import ModelPanel  from '../components/ModelPanel';
import PenaltyHUD  from '../components/PenaltyHUD';

const GameCanvas = dynamic(() => import('../components/GameCanvas'), { ssr: false });

export default function Page() {
  // ── Estado existente ─────────────────────────────────────────────────────
  const [grabCount,    setGrabCount]    = useState(0);
  const [playerCount,  setPlayerCount]  = useState(1);
  const [wsConnected,  setWsConnected]  = useState(false);
  const [playerType,   setPlayerType]   = useState('pc');
  const [serverUrl,    setServerUrl]    = useState('');
  const [toasts,       setToasts]       = useState([]);
  const [inVR,         setInVR]         = useState(false);
  const placeModelRef = useRef(null);

  // ── Estado de pênalti ────────────────────────────────────────────────────
  const [penaltyRole,  setPenaltyRole]  = useState(null);   // 'attacker' | 'goalkeeper' | 'spectator'
  const [roundState,   setRoundState]   = useState('waiting_players');
  const [penaltyScore, setPenaltyScore] = useState({ attacker: 0, goalkeeper: 0 });
  const penaltyRef = useRef(null); // { setAim, confirmShot } da engine

  // ── Toast helper ────────────────────────────────────────────────────────
  const showToast = useCallback((text) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3350);
  }, []);

  // ── Callbacks da engine ──────────────────────────────────────────────────
  const handlePlaceModel = useCallback((fn) => {
    placeModelRef.current = fn;
  }, []);

  const handlePenaltyReady = useCallback((api) => {
    penaltyRef.current = api;
  }, []);

  const handlePenaltyStateChange = useCallback((state, score) => {
    setRoundState(state);
    if (score) setPenaltyScore(score);
  }, []);

  const handlePenaltyResult = useCallback((result) => {
    const msgs = { goal: '⚽ GOL!', saved: '🥅 Defesa do goleiro!', rebound: '↩ Rebote!' };
    showToast(msgs[result] ?? result);
  }, [showToast]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <GameCanvas
        onGrabCount={setGrabCount}
        onWsStatus={setWsConnected}
        onPlayerCount={setPlayerCount}
        onPlayerType={setPlayerType}
        onServerUrl={setServerUrl}
        onToast={showToast}
        onPlaceModel={handlePlaceModel}
        onVrChange={setInVR}
        onPenaltyRole={setPenaltyRole}
        onPenaltyStateChange={handlePenaltyStateChange}
        onPenaltyResult={handlePenaltyResult}
        onPenaltyReady={handlePenaltyReady}
      />

      {/* HUD e painel de modelos apenas fora do VR */}
      {!inVR && (
        <>
          <HUD
            grabCount={grabCount}
            playerCount={playerCount}
            wsConnected={wsConnected}
            playerType={playerType}
            serverUrl={serverUrl}
          />
          <ModelPanel onPlace={(f) => placeModelRef.current?.(f)} />
        </>
      )}

      {/* HUD de pênalti — visível para todos (inclusive goleiro VR via overlay) */}
      <PenaltyHUD
        role={penaltyRole}
        roundState={roundState}
        score={penaltyScore}
        onAim={(target)  => penaltyRef.current?.setAim(target)}
        onShoot={(target) => penaltyRef.current?.confirmShot(target)}
      />

      {/* Toasts */}
      <div style={{
        position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)',
        zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 6, pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>
    </div>
  );
}
