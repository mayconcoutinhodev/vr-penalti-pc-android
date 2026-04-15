'use client';

import { useEffect, useRef } from 'react';

export default function GameCanvas({
  // ── Callbacks existentes ─────────────────────────────────────────────────
  onGrabCount, onWsStatus, onPlayerCount, onPlayerType,
  onServerUrl, onToast, onPlaceModel, onVrChange,
  // ── Callbacks de pênalti ─────────────────────────────────────────────────
  onPenaltyRole,        // (role: string) → void
  onPenaltyStateChange, // (roundState: string, score: object) → void
  onPenaltyResult,      // (result: string) → void
  onPenaltyReady,       // ({ setAim, confirmShot }) → void
}) {
  const containerRef = useRef(null);
  const vrBtnRef     = useRef(null);
  const cleanupRef   = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    import('../lib/engine').then(({ initEngine }) => {
      const { placeModel, vrButton, cleanup, penalty } = initEngine(containerRef.current, {
        onGrabCount,
        onWsStatus,
        onPlayerCount,
        onPlayerType,
        onServerUrl,
        onToast,
        onVrChange,
        // pênalti
        onPenaltyRole,
        onPenaltyStateChange,
        onPenaltyResult,
      });

      if (vrButton && vrBtnRef.current) {
        vrBtnRef.current.appendChild(vrButton);
      }

      onPlaceModel?.(placeModel);
      onPenaltyReady?.(penalty);
      cleanupRef.current = cleanup;
    });

    return () => {
      cleanupRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div
        ref={vrBtnRef}
        style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100,
        }}
      />
    </div>
  );
}
