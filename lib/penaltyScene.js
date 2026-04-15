import * as THREE from 'three';

// ─── Constantes compartilhadas com server.js ──────────────────────────────────
// ATENÇÃO: alterar aqui requer alterar também em server.js (constante GOAL)

export const GOAL_CONFIG = {
  halfWidth:  1.85,   // gol total: 3.7 m (padrão FIFA)
  height:     2.44,   // altura padrão FIFA
  postRadius: 0.06,
  netDepth:   1.0,
};

export const BALL_ORIGIN_Z = 2.0;  // ponto de pênalti (z do cobrador)
export const GOAL_Z        = -9.0; // linha do gol — distância 11m do ponto de pênalti

// ─── Campo de futebol ─────────────────────────────────────────────────────────
/**
 * Cria o campo de futebol (gramado, marcações, linha do fundo).
 * Retorna uma função cleanup para remover da cena.
 */
export function createFootballField(scene) {
  const objs = [];

  function add(mesh) { scene.add(mesh); objs.push(mesh); return mesh; }

  // ── Gramado principal ────────────────────────────────────────────────────
  add(plane(0, 0, 14, 24, 0x2e7d32, 0.92)); // chão verde base

  // Listras alternadas (efeito de campo cortado)
  const stripeColors = [0x276b27, 0x2e7d32];
  for (let i = 0; i < 12; i++) {
    const col = stripeColors[i % 2];
    add(plane(0, -10 + i * 2 + 1, 14, 2, col, 0.92, 0.001));
  }

  // ── Linhas brancas ────────────────────────────────────────────────────────
  // Helper: retângulo branco raso (y=0.003)
  function wline(cx, cz, w, d) {
    add(plane(cx, cz, w, d, 0xffffff, 1, 0.003));
  }

  const FW  = 6.5;  // metade da largura do campo
  const FT  = 7.5;  // limite z superior (lado do atacante)
  const FB  = -10;  // limite z inferior (atrás do gol)
  const FH  = FT - FB;
  const FMZ = (FT + FB) / 2;

  // Contorno do campo
  wline(0,    FT,    FW * 2, 0.08);   // linha de fundo (lado atacante)
  wline(0,    FB,    FW * 2, 0.08);   // linha de fundo (atrás do gol)
  wline(-FW,  FMZ,   0.08,   FH);     // linha lateral esquerda
  wline( FW,  FMZ,   0.08,   FH);     // linha lateral direita

  // Linha do gol
  wline(0, GOAL_Z, FW * 2, 0.08);

  // ── Grande área (penalty area) ─────────────────────────────────────────
  // ~5m a cada lado do gol (x=±5), 5m profundidade a partir da linha do gol
  const PA_HW = 4.0;
  const PA_D  = 5.0;
  const PA_FZ = GOAL_Z + PA_D; // linha frontal da grande área
  wline(0,         PA_FZ,         PA_HW * 2,  0.06);  // frente
  wline(-PA_HW,   GOAL_Z + PA_D / 2, 0.06, PA_D);    // lado esq
  wline( PA_HW,   GOAL_Z + PA_D / 2, 0.06, PA_D);    // lado dir

  // ── Pequena área (goal area) ────────────────────────────────────────────
  const GA_HW = 2.3;
  const GA_D  = 1.8;
  const GA_FZ = GOAL_Z + GA_D;
  wline(0,        GA_FZ,           GA_HW * 2, 0.05);
  wline(-GA_HW,  GOAL_Z + GA_D / 2, 0.05, GA_D);
  wline( GA_HW,  GOAL_Z + GA_D / 2, 0.05, GA_D);

  // ── Ponto de pênalti ────────────────────────────────────────────────────
  add(disc(0, BALL_ORIGIN_Z, 0.14, 0xffffff, 0.004));

  // ── Arco do pênalti (semicírculo à frente da grande área) ──────────────
  {
    const pts = [];
    const R   = 2.2; // raio do arco
    for (let a = Math.PI * 0.12; a <= Math.PI * 0.88; a += 0.06) {
      pts.push(new THREE.Vector3(
        Math.sin(a) * R,
        0.004,
        BALL_ORIGIN_Z - Math.cos(a) * R  // arco fica à frente do ponto
      ));
    }
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff }));
    scene.add(line); objs.push(line);
  }

  // ── Linha de meio campo (referência visual) ─────────────────────────────
  wline(0, FMZ + 2, FW * 2, 0.06);  // linha de meio campo aproximada

  // ── Área de saída (fundo do campo, atrás do gol) ───────────────────────
  // Plano escuro para fechar visualmente
  const backdrop = plane(0, FB - 0.5, 14, 2, 0x1a4a1a, 1, 0);
  add(backdrop);

  // ── Placas/bandeirinhas de canto (simples) ──────────────────────────────
  cornerFlag(scene, objs, -FW, FT);
  cornerFlag(scene, objs,  FW, FT);
  cornerFlag(scene, objs, -FW, GOAL_Z);
  cornerFlag(scene, objs,  FW, GOAL_Z);

  return { cleanup: () => { for (const o of objs) scene.remove(o); } };
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function plane(cx, cz, w, d, color, roughness = 0.9, y = 0) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color, roughness })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  return m;
}

function disc(cx, cz, r, color, y = 0.003) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(cx, y, cz);
  return m;
}

function cornerFlag(scene, objs, x, z) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6),
    new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.5 })
  );
  pole.position.set(x, 0.5, z);
  scene.add(pole); objs.push(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide })
  );
  flag.position.set(x + 0.16, 0.95, z);
  scene.add(flag); objs.push(flag);
}

// ─── Cena de pênalti (bola, gol, mira) ───────────────────────────────────────
/**
 * Cria e gerencia todos os objetos 3D dinâmicos do modo pênalti.
 * (gol, bola, indicador de mira, sprite de resultado)
 */
export function createPenaltyScene(scene) {
  const disposables = [];

  // ── Materiais ────────────────────────────────────────────────────────────
  const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.7 });
  const netMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.22 });
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const aimMat  = new THREE.MeshBasicMaterial({ color: 0xff2222, side: THREE.DoubleSide });

  // ── Gol ──────────────────────────────────────────────────────────────────
  const hw = GOAL_CONFIG.halfWidth;
  const h  = GOAL_CONFIG.height;
  const pr = GOAL_CONFIG.postRadius;

  const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, h, 10), postMat);
  leftPost.position.set(-hw, h / 2, GOAL_Z);
  leftPost.castShadow = true;
  scene.add(leftPost); disposables.push(leftPost);

  const rightPost = leftPost.clone();
  rightPost.position.set(hw, h / 2, GOAL_Z);
  scene.add(rightPost); disposables.push(rightPost);

  const crossbar = new THREE.Mesh(
    new THREE.CylinderGeometry(pr, pr, hw * 2 + pr * 2, 10), postMat
  );
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, h, GOAL_Z);
  scene.add(crossbar); disposables.push(crossbar);

  // Rede traseira
  const netBack = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, h, 12, 8), netMat);
  netBack.position.set(0, h / 2, GOAL_Z - GOAL_CONFIG.netDepth / 2);
  scene.add(netBack); disposables.push(netBack);

  // Rede superior
  const netTop = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, GOAL_CONFIG.netDepth, 12, 4), netMat);
  netTop.rotation.x = Math.PI / 2;
  netTop.position.set(0, h, GOAL_Z - GOAL_CONFIG.netDepth / 4);
  scene.add(netTop); disposables.push(netTop);

  // Redes laterais
  for (const sx of [-1, 1]) {
    const netSide = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_CONFIG.netDepth, h, 4, 8), netMat);
    netSide.rotation.y = Math.PI / 2;
    netSide.position.set(sx * (hw + pr / 2), h / 2, GOAL_Z - GOAL_CONFIG.netDepth / 2);
    scene.add(netSide); disposables.push(netSide);
  }

  // ── Bola ─────────────────────────────────────────────────────────────────
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 20), ballMat);
  ball.castShadow = true;
  ball.position.set(0, 0.11, BALL_ORIGIN_Z);
  ball.visible = false;
  scene.add(ball); disposables.push(ball);

  // ── Indicador de mira ────────────────────────────────────────────────────
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.14, 28), aimMat);
  aimRing.rotation.y = Math.PI;
  aimRing.visible = false;
  scene.add(aimRing); disposables.push(aimRing);

  const crossH = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.028), aimMat);
  crossH.rotation.y = Math.PI;
  aimRing.add(crossH);
  const crossV = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.24), aimMat);
  crossV.rotation.y = Math.PI;
  aimRing.add(crossV);

  // ── Sprite de resultado ──────────────────────────────────────────────────
  let resultSprite = null;

  function showResultSprite(text, color) {
    if (resultSprite) { scene.remove(resultSprite); resultSprite = null; }
    const cv  = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.font = 'bold 76px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false });
    resultSprite = new THREE.Sprite(mat);
    resultSprite.scale.set(3.4, 0.85, 1);
    resultSprite.position.set(0, 4.0, GOAL_Z);
    scene.add(resultSprite);
  }

  // ── Estado interno ───────────────────────────────────────────────────────
  let currentBall = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // API pública
  // ═══════════════════════════════════════════════════════════════════════════

  function setAimTarget(target) {
    const gx = target.x * hw;
    const gy = target.y * h;
    aimRing.position.set(gx, gy, GOAL_Z + 0.08);
    aimRing.visible = true;
  }

  function hideAim() { aimRing.visible = false; }

  function showBall(ballData) {
    currentBall = ballData;
    ball.position.set(ballData.origin.x, ballData.origin.y, ballData.origin.z);
    ball.visible = true;
    aimRing.visible = false;
  }

  function updateBall() {
    if (!currentBall || !ball.visible) return;
    const elapsed = (Date.now() - currentBall.startTime) / 1000;
    const { origin, target, speed } = currentBall;
    const dx   = target.x - origin.x;
    const dy   = target.y - origin.y;
    const dz   = target.z - origin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const frac = Math.min(1, (elapsed * speed) / dist);
    ball.position.set(
      origin.x + dx * frac,
      origin.y + dy * frac,
      origin.z + dz * frac,
    );
    ball.rotation.x += 0.09;
    ball.rotation.z += 0.06;
  }

  function showResult(result) {
    ball.visible    = false;
    currentBall     = null;
    aimRing.visible = false;
    if (result === 'goal')    showResultSprite('⚽ GOL!',    '#f97316');
    if (result === 'saved')   showResultSprite('🥅 DEFESA!', '#22c55e');
    if (result === 'rebound') showResultSprite('↩ REBOTE!', '#a78bfa');
  }

  function resetForNextRound() {
    if (resultSprite) { scene.remove(resultSprite); resultSprite = null; }
    ball.visible    = false;
    aimRing.visible = false;
    currentBall     = null;
  }

  function cleanup() {
    for (const obj of disposables) scene.remove(obj);
    if (resultSprite) scene.remove(resultSprite);
  }

  return { setAimTarget, hideAim, showBall, updateBall, showResult, resetForNextRound, cleanup };
}
