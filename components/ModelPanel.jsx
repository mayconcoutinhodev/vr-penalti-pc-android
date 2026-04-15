'use client';

import { useState, useEffect } from 'react';

export default function ModelPanel({ onPlace }) {
  const [models, setModels] = useState(null);
  const [error, setError]   = useState(false);

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(setModels)
      .catch(() => setError(true));
  }, []);

  return (
    <div style={{
      position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)',
      zIndex: 100,
      background: 'rgba(0,0,0,0.78)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 10,
      padding: '10px 10px 6px',
      color: '#ccc',
      minWidth: 148,
      maxHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <h3 style={{
        color: '#a78bfa', fontSize: 12, textAlign: 'center',
        marginBottom: 8, paddingBottom: 6,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        flexShrink: 0,
      }}>
        📦 Modelos 3D
      </h3>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {error ? (
          <div style={{ fontSize: 10, color: '#555', textAlign: 'center', padding: '6px 0' }}>
            Erro ao listar modelos
          </div>
        ) : !models ? (
          <div style={{ fontSize: 10, color: '#555', textAlign: 'center', padding: '6px 0' }}>
            Carregando...
          </div>
        ) : models.length === 0 ? (
          <div style={{ fontSize: 10, color: '#555', textAlign: 'center', padding: '6px 0' }}>
            Nenhum modelo na pasta<br />
            <small style={{ color: '#444' }}>public/models/  (.glb .fbx .obj)</small>
          </div>
        ) : models.map(f => {
          const ext   = f.split('.').pop().toUpperCase();
          const label = f.replace(/\.(glb|gltf|fbx|obj)$/i, '');
          return (
            <button
              key={f}
              title={f}
              onClick={() => onPlace(f)}
              style={{
                display: 'block', width: '100%',
                background: 'rgba(255,255,255,0.07)',
                color: '#ddd',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                padding: '6px 8px',
                marginBottom: 5,
                cursor: 'pointer',
                fontSize: 11,
                textAlign: 'left',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(167,139,250,0.28)';
                e.currentTarget.style.borderColor = '#a78bfa';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = '#ddd';
              }}
            >
              <span style={{ color: '#666', fontSize: 9, marginRight: 4 }}>{ext}</span>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
