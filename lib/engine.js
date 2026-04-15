import * as THREE from 'three';
import { VRButton }                 from 'three/addons/webxr/VRButton.js';
import { XRHandModelFactory }       from 'three/addons/webxr/XRHandModelFactory.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OrbitControls }            from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader }               from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader }                from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader }                from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader }                from 'three/addons/loaders/MTLLoader.js';
import { createMultiplayer }        from './multiplayer.js';
import { createPenaltyScene, createFootballField } from './penaltyScene.js';

/**
 * Initialises the entire Three.js scene.
 * @param {HTMLElement} container  — div that receives the canvas
 * @param {object}      callbacks  — React state setters / toast fn
 * @returns {{ placeModel, vrButton, cleanup }}
 */
export function initEngine(container, {
  onGrabCount, onWsStatus, onPlayerCount, onPlayerType,
  onServerUrl, onToast, onVrChange,
  // ── Pênalti ──────────────────────────────────────────────────────────────
  onPenaltyRole,        // (role: string) → void
  onPenaltyStateChange, // (roundState: string, score: object) → void
  onPenaltyResult,      // (result: string) → void
} = {}) {

  // ─── Renderer ──────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });

  // ─── Scene / Camera ────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d1a);
  scene.fog = new THREE.FogExp2(0x0d0d1a, 0.04);

  const camera = new THREE.PerspectiveCamera(
    75, container.clientWidth / container.clientHeight, 0.01, 100
  );
  camera.position.set(0, 1.6, 3.5);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, 1.2, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;

  // ─── Lights ────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 10, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(2048);
  scene.add(sun);

  const lA = new THREE.PointLight(0x7c3aed, 4, 12);
  lA.position.set(-3, 3, -2);
  scene.add(lA);

  const lB = new THREE.PointLight(0xf43f5e, 4, 12);
  lB.position.set(3, 3, -2);
  scene.add(lB);

  // ─── Environment ──────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.GridHelper(30, 30, 0x1e1e4a, 0x1e1e4a));

  // ─── Cena de pênalti ──────────────────────────────────────────────────────
  const penaltyScene = createPenaltyScene(scene);

  // Estado local de pênalti (espelha o que o servidor envia)
  const penaltyState = {
    role:       null,  // 'attacker' | 'goalkeeper' | 'spectator'
    roundState: 'waiting_players',
    score:      { attacker: 0, goalkeeper: 0 },
  };

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 4),
    new THREE.MeshStandardMaterial({ color: 0x0f0f2d, roughness: 0.7 })
  );
  wall.position.set(0, 2, -4);
  wall.receiveShadow = true;
  scene.add(wall);

  for (let i = -2; i <= 2; i += 2) {
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x1e1e4a, roughness: 0.5 })
    );
    ped.position.set(i, 0.45, -2);
    ped.castShadow = true;
    ped.receiveShadow = true;
    scene.add(ped);
  }

  // ─── Interactive objects ───────────────────────────────────────────────────
  const interactiveObjects = [];
  let grabCount = 0;

  const COLORS = [0xa78bfa, 0xf43f5e, 0x34d399, 0xfbbf24, 0x38bdf8, 0xfb923c];
  const SHAPES = ['sphere', 'box', 'octahedron', 'torus', 'cone', 'dodecahedron'];

  function makeGeo(shape) {
    if (shape === 'sphere')     return new THREE.SphereGeometry(0.14, 32, 32);
    if (shape === 'box')        return new THREE.BoxGeometry(0.24, 0.24, 0.24);
    if (shape === 'octahedron') return new THREE.OctahedronGeometry(0.18);
    if (shape === 'torus')      return new THREE.TorusGeometry(0.14, 0.055, 16, 32);
    if (shape === 'cone')       return new THREE.ConeGeometry(0.14, 0.28, 16);
    return new THREE.DodecahedronGeometry(0.16);
  }

  function spawnObject(pos, colorIdx, shapeIdx) {
    const color = COLORS[colorIdx % COLORS.length];
    const mesh = new THREE.Mesh(
      makeGeo(SHAPES[shapeIdx % SHAPES.length]),
      new THREE.MeshStandardMaterial({
        color, roughness: 0.25, metalness: 0.55,
        emissive: new THREE.Color(color), emissiveIntensity: 0.08,
      })
    );
    mesh.position.copy(pos);
    mesh.castShadow = true;
    mesh.userData = {
      interactive: true,
      originalColor: color,
      velocity: new THREE.Vector3(),
      isGrabbed: false,
    };
    scene.add(mesh);
    interactiveObjects.push(mesh);
    return mesh;
  }

  for (let i = 0; i < 14; i++) {
    spawnObject(
      new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        0.9 + Math.random() * 1.8,
        (Math.random() - 0.5) * 3 - 0.5
      ),
      i, i
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function setHighlight(obj, on) {
    const c = new THREE.Color(obj.userData.originalColor);
    obj.material.emissive.copy(c);
    obj.material.emissiveIntensity = on ? 0.5 : 0.08;
    obj.material.roughness = on ? 0.1 : 0.25;
  }

  function isRemotelyHeld(obj) {
    const idx = interactiveObjects.indexOf(obj);
    for (const state of remoteGrabs.values()) {
      if (state.objIdx === idx) return true;
    }
    return false;
  }

  function nearest(pos, maxDist) {
    let best = null, bestD = maxDist;
    for (const o of interactiveObjects) {
      if (o.userData.isGrabbed || isRemotelyHeld(o)) continue;
      const d = pos.distanceTo(o.position);
      if (d < bestD) { bestD = d; best = o; }
    }
    for (const { root } of placedModels) {
      if (root.userData.isGrabbed) continue;
      const d = pos.distanceTo(root.position);
      if (d < bestD) { bestD = d; best = root; }
    }
    return best;
  }

  function grab(obj, grabber) {
    obj.userData.isGrabbed = true;
    obj.userData.velocity.set(0, 0, 0);
    grabber.userData.grabbed = obj;
    if (obj.userData.isModel) return;
    setHighlight(obj, true);
    grabCount++;
    onGrabCount?.(grabCount);
    sendGrab(obj);
  }

  function release(obj, throwVel) {
    obj.userData.isGrabbed = false;
    if (throwVel) obj.userData.velocity.copy(throwVel);
    if (obj.userData.isModel) return;
    setHighlight(obj, false);
    sendRelease(obj, throwVel || new THREE.Vector3());
  }

  // ─── Models ───────────────────────────────────────────────────────────────
  const placedModels = [];

  function addToScene(obj3d, filename) {
    const box  = new THREE.Box3().setFromObject(obj3d);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0.001 && maxDim > 1.5) {
      obj3d.scale.multiplyScalar(1.5 / maxDim);
    }
    box.setFromObject(obj3d);
    const center = new THREE.Vector3();
    box.getCenter(center);
    obj3d.position.x -= center.x;
    obj3d.position.z -= center.z;
    obj3d.position.y -= box.min.y;

    const root = new THREE.Group();
    root.add(obj3d);
    root.position.set((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 2);
    root.userData = { isModel: true, isGrabbed: false, velocity: new THREE.Vector3() };

    const meshes = [];
    root.traverse(c => {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; meshes.push(c); }
    });

    scene.add(root);
    placedModels.push({ root, meshes });
    onToast?.('✅ ' + filename.replace(/\.(glb|gltf|fbx|obj)$/i, '') + ' colocado');
  }

  function onLoadError(filename, err) {
    console.error('Erro ao carregar ' + filename, err);
    onToast?.('❌ Erro: ' + filename);
  }

  const gltfLoader = new GLTFLoader();
  const fbxLoader  = new FBXLoader();
  const objLoader  = new OBJLoader();
  const mtlLoader  = new MTLLoader();

  function placeModel(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const url = '/models/' + encodeURIComponent(filename);

    if (ext === 'glb' || ext === 'gltf') {
      gltfLoader.load(url, g => addToScene(g.scene, filename), undefined,
        err => onLoadError(filename, err));

    } else if (ext === 'fbx') {
      fbxLoader.load(url, obj => addToScene(obj, filename), undefined,
        err => onLoadError(filename, err));

    } else if (ext === 'obj') {
      const mtlUrl = url.replace(/\.obj$/i, '.mtl');
      mtlLoader.load(
        mtlUrl,
        mats => {
          mats.preload();
          objLoader.setMaterials(mats);
          objLoader.load(url, obj => addToScene(obj, filename), undefined,
            err => onLoadError(filename, err));
        },
        undefined,
        () => {
          objLoader.setMaterials(null);
          objLoader.load(url, obj => {
            obj.traverse(c => {
              if (c.isMesh)
                c.material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.6 });
            });
            addToScene(obj, filename);
          }, undefined, err => onLoadError(filename, err));
        }
      );
    }
  }

  // ─── Raycasting ───────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();

  function hitTestAll() {
    const simpleHits  = raycaster.intersectObjects(interactiveObjects);
    const modelMeshes = [];
    const meshToRoot  = new Map();
    for (const { root, meshes } of placedModels) {
      if (root.userData.isGrabbed) continue;
      for (const m of meshes) { modelMeshes.push(m); meshToRoot.set(m, root); }
    }
    const modelHits = raycaster.intersectObjects(modelMeshes);
    const s = simpleHits[0], m = modelHits[0];
    if (!s && !m) return null;
    if (s && (!m || s.distance <= m.distance)) return { hit: s, draggable: s.object };
    return { hit: m, draggable: meshToRoot.get(m.object) };
  }

  // ─── Avatar helpers ────────────────────────────────────────────────────────
  function makeLabel(text, bg = 'rgba(0,0,0,0.78)', fg = '#fff') {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 72;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(4, 4, 248, 64, 14);
    else ctx.rect(4, 4, 248, 64);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 36);
    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false,
    });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(0.78, 0.22, 1);
    return sp;
  }

  function buildAvatar(type) {
    const isVR    = type === 'vr';
    const bodyCol = isVR ? 0x7c3aed : 0x2563eb;
    const headCol = isVR ? 0xe8c8f8 : 0xffcc99;
    const labelTxt = isVR ? '🥽 VR' : '💻 PC';
    const labelBg  = isVR ? 'rgba(90,30,200,0.88)' : 'rgba(20,80,200,0.88)';

    const group   = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.6, metalness: 0.1 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.55, 4, 8), bodyMat);
    body.position.y = 0.82;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshStandardMaterial({ color: headCol, roughness: 0.7 })
    );
    head.position.y = 1.52;
    head.castShadow = true;
    group.add(head);

    let lArm = null, rArm = null;
    if (!isVR) {
      const armGeo = new THREE.CapsuleGeometry(0.055, 0.38, 4, 8);
      lArm = new THREE.Mesh(armGeo, bodyMat.clone());
      lArm.position.set(-0.28, 1.0, 0);
      lArm.rotation.z = 0.25;
      lArm.castShadow = true;
      group.add(lArm);

      rArm = new THREE.Mesh(armGeo, bodyMat.clone());
      rArm.position.set(0.28, 1.0, 0);
      rArm.rotation.z = -0.25;
      rArm.castShadow = true;
      group.add(rArm);
    }

    const label = makeLabel(labelTxt, labelBg);
    label.position.y = 1.95;
    group.add(label);

    group.userData = { type, body, head, lArm, rArm, action: 'idle', walkPhase: 0 };
    return group;
  }

  function createHandVisual(palmColor) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: palmColor, emissive: palmColor, emissiveIntensity: 0.55,
      roughness: 0.15, metalness: 0.4,
    });
    const lineMat = new THREE.LineBasicMaterial({ color: palmColor, transparent: true, opacity: 0.75 });

    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 10), mat);
    g.add(palm);

    const tips = [];
    for (let i = 0; i < 5; i++) {
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), mat.clone());
      g.add(tip);
      tips.push(tip);
    }

    const lineGeos = [];
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(0, 0.1, 0),
      ]);
      g.add(new THREE.Line(geo, lineMat.clone()));
      lineGeos.push(geo);
    }

    g.userData = { palm, tips, lineGeos };
    g.visible = false;
    return g;
  }

  function updateHandVisual(g, joints) {
    if (!joints || joints.length < 18) { g.visible = false; return; }
    g.visible = true;
    const { palm, tips, lineGeos } = g.userData;
    const wx = joints[0], wy = joints[1], wz = joints[2];
    palm.position.set(wx, wy, wz);
    for (let i = 0; i < 5; i++) {
      const tx = joints[3 + i * 3], ty = joints[4 + i * 3], tz = joints[5 + i * 3];
      tips[i].position.set(tx, ty, tz);
      const pos = lineGeos[i].attributes.position;
      pos.setXYZ(0, wx, wy, wz);
      pos.setXYZ(1, tx, ty, tz);
      pos.needsUpdate = true;
    }
  }

  // ─── Local player ──────────────────────────────────────────────────────────
  const spawnX = (Math.random() - 0.5) * 4;
  const spawnZ = 1 + Math.random() * 2;
  const localPlayer = { pos: new THREE.Vector3(spawnX, 0, spawnZ), rotY: 0, action: 'idle', type: 'pc' };
  const localAvatar = buildAvatar('pc');
  scene.add(localAvatar);

  camera.position.x += spawnX;
  camera.position.z += spawnZ;
  orbit.target.x += spawnX;
  orbit.target.z += spawnZ;

  // ─── Remote avatars ────────────────────────────────────────────────────────
  const remoteAvatars = new Map();

  function ensureRemoteAvatar(clientId, type) {
    let av = remoteAvatars.get(clientId);
    if (av && av.group.userData.type !== type) {
      scene.remove(av.group);
      if (av.lHandViz) scene.remove(av.lHandViz);
      if (av.rHandViz) scene.remove(av.rHandViz);
      av = null;
      remoteAvatars.delete(clientId);
    }
    if (!av) {
      const group = buildAvatar(type);
      scene.add(group);
      let lHandViz = null, rHandViz = null;
      if (type === 'vr') {
        lHandViz = createHandVisual(0x00e5ff);
        rHandViz = createHandVisual(0xe040fb);
        scene.add(lHandViz);
        scene.add(rHandViz);
      }
      av = { group, lHandViz, rHandViz, targetPos: new THREE.Vector3() };
      remoteAvatars.set(clientId, av);
    }
    return av;
  }

  function removeRemoteAvatar(clientId) {
    const av = remoteAvatars.get(clientId);
    if (!av) return;
    scene.remove(av.group);
    if (av.lHandViz) scene.remove(av.lHandViz);
    if (av.rHandViz) scene.remove(av.rHandViz);
    remoteAvatars.delete(clientId);
  }

  function applyAvatarMsg(msg) {
    const av = ensureRemoteAvatar(msg.clientId, msg.playerType);
    if (msg.playerType === 'pc') {
      av.targetPos.set(msg.pos.x, 0, msg.pos.z);
      av.group.rotation.y = msg.rotY;
      av.group.userData.action = msg.action;
    } else {
      av.targetPos.set(msg.headPos.x, 0, msg.headPos.z);
      av.group.userData.action = msg.action;
      if (av.lHandViz) updateHandVisual(av.lHandViz, msg.lh);
      if (av.rHandViz) updateHandVisual(av.rHandViz, msg.rh);
    }
  }

  // ─── WASD Movement ─────────────────────────────────────────────────────────
  const keys = {};
  const onKeyDown = e => { keys[e.code] = true; };
  const onKeyUp   = e => { keys[e.code] = false; };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup',   onKeyUp);

  function tickMovement(dt) {
    if (renderer.xr.isPresenting) return;

    const fwd = new THREE.Vector3().subVectors(orbit.target, camera.position).setY(0);
    if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3();
    if (keys['KeyW'] || keys['ArrowUp'])    move.addScaledVector(fwd,    1);
    if (keys['KeyS'] || keys['ArrowDown'])  move.addScaledVector(fwd,   -1);
    if (keys['KeyA'] || keys['ArrowLeft'])  move.addScaledVector(right, -1);
    if (keys['KeyD'] || keys['ArrowRight']) move.addScaledVector(right,  1);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(3 * dt);
      localPlayer.pos.add(move);
      camera.position.add(move);
      orbit.target.add(move);
      localPlayer.rotY = Math.atan2(move.x, move.z);
      localPlayer.action = 'walk';
    } else {
      localPlayer.action = dragged ? 'grab' : 'idle';
    }

    localAvatar.position.copy(localPlayer.pos);
    localAvatar.rotation.y = localPlayer.rotY;
    localAvatar.userData.action = localPlayer.action;
  }

  // ─── Avatar animation ──────────────────────────────────────────────────────
  function animateAvatar(g, dt) {
    const { body, lArm, rArm, action } = g.userData;
    g.userData.walkPhase += dt * (action === 'walk' ? 7 : action === 'grab' ? 3 : 1.5);
    const ph = g.userData.walkPhase;

    if (action === 'walk') {
      if (body) body.position.y = 0.82 + Math.abs(Math.sin(ph)) * 0.04;
      if (lArm) lArm.rotation.x =  Math.sin(ph) * 0.55;
      if (rArm) rArm.rotation.x = -Math.sin(ph) * 0.55;
    } else if (action === 'grab') {
      if (body) body.position.y = 0.82;
      if (lArm) { lArm.rotation.x = -0.9; lArm.rotation.z =  0.25 + Math.sin(ph) * 0.06; }
      if (rArm) { rArm.rotation.x = -0.9; rArm.rotation.z = -0.25 - Math.sin(ph) * 0.06; }
    } else {
      if (body) body.position.y = 0.82 + Math.sin(ph) * 0.008;
      if (lArm) lArm.rotation.x = 0;
      if (rArm) rArm.rotation.x = 0;
    }
  }

  function tickAvatars(dt) {
    animateAvatar(localAvatar, dt);
    for (const av of remoteAvatars.values()) {
      av.group.position.lerp(av.targetPos, Math.min(1, dt * 12));
      animateAvatar(av.group, dt);
    }
  }

  // ─── Multiplayer ──────────────────────────────────────────────────────────
  const remoteGrabs = new Map();

  const mp = createMultiplayer({
    // Entra na sala de pênalti assim que o WebSocket abrir
    onOpen: () => mp.send({ type: 'penalty:join_room', playerType: localPlayer.type }),

    onGrab: msg => {
      remoteGrabs.set(`${msg.clientId}-${msg.objIdx}`, {
        objIdx: msg.objIdx,
        target: new THREE.Vector3(msg.x, msg.y, msg.z),
      });
    },
    onMove: msg => {
      const state = remoteGrabs.get(`${msg.clientId}-${msg.objIdx}`);
      if (state) state.target.set(msg.x, msg.y, msg.z);
    },
    onRelease: msg => {
      remoteGrabs.delete(`${msg.clientId}-${msg.objIdx}`);
      const obj = interactiveObjects[msg.objIdx];
      if (obj) { obj.userData.velocity.set(msg.vx, msg.vy, msg.vz); setHighlight(obj, false); }
    },
    onJoin:       ()  => onToast?.('🎮 Jogador entrou na sala!'),
    onPlayers:    cnt => onPlayerCount?.(cnt),
    onAvatar:     msg => applyAvatarMsg(msg),
    onDisconnect: msg => {
      const type = remoteAvatars.get(msg.clientId)?.group.userData.type;
      removeRemoteAvatar(msg.clientId);
      onToast?.(type === 'vr' ? '🥽 Jogador VR saiu' : '💻 Jogador PC saiu');
    },

    // ── Pênalti ─────────────────────────────────────────────────────────────
    onPenaltyAssignRole: msg => {
      penaltyState.role       = msg.role;
      penaltyState.roundState = msg.roundState;
      penaltyState.score      = msg.score;
      onPenaltyRole?.(msg.role);
      onPenaltyStateChange?.(msg.roundState, msg.score);
    },
    onPenaltyRoundStart: msg => {
      penaltyScene.resetForNextRound();
      onPenaltyStateChange?.(penaltyState.roundState, penaltyState.score);
    },
    onPenaltyShotStarted: msg => {
      penaltyState.roundState = 'ball_in_flight';
      penaltyScene.showBall(msg.ball);
      onPenaltyStateChange?.('ball_in_flight', penaltyState.score);
    },
    onPenaltyRoundResult: msg => {
      penaltyState.roundState = 'round_end';
      penaltyState.score      = msg.score;
      penaltyScene.showResult(msg.result);
      onPenaltyResult?.(msg.result);
      onPenaltyStateChange?.('round_end', msg.score);
    },
    onPenaltyStateUpdate: msg => {
      penaltyState.roundState = msg.roundState;
      penaltyState.score      = msg.score;
      if (msg.roundState === 'preparing_shot') penaltyScene.resetForNextRound();
      onPenaltyStateChange?.(msg.roundState, msg.score);
    },
  });

  mp.connect(connected => onWsStatus?.(connected));

  const pollInterval = setInterval(async () => {
    try {
      const { count } = await fetch('/api/players').then(r => r.json());
      onPlayerCount?.(count);
    } catch {}
  }, 2000);

  fetch('/api/info').then(r => r.json()).then(info => {
    onServerUrl?.(`https://${info.ip}:${info.port}`);
  }).catch(() => {});

  function sendGrab(obj) {
    const idx = interactiveObjects.indexOf(obj); if (idx === -1) return;
    mp.send({ type: 'grab', objIdx: idx, x: obj.position.x, y: obj.position.y, z: obj.position.z });
  }

  const objLastSend = new Array(14).fill(0);
  const OBJ_SEND_MS = 50;

  function sendMove(obj) {
    const idx = interactiveObjects.indexOf(obj); if (idx === -1) return;
    const now = performance.now();
    if (now - objLastSend[idx] < OBJ_SEND_MS) return;
    objLastSend[idx] = now;
    mp.send({ type: 'move', objIdx: idx, x: obj.position.x, y: obj.position.y, z: obj.position.z });
  }

  function sendRelease(obj, vel) {
    const idx = interactiveObjects.indexOf(obj); if (idx === -1) return;
    mp.send({ type: 'release', objIdx: idx, vx: vel.x, vy: vel.y, vz: vel.z });
  }

  // ─── VR session events ─────────────────────────────────────────────────────
  renderer.xr.addEventListener('sessionstart', () => {
    onPlayerType?.('vr');
    onVrChange?.(true);
    localPlayer.type = 'vr';
    localAvatar.visible = false;
    // Atualiza o servidor: agora é VR → será atribuído como goleiro
    mp.send({ type: 'penalty:join_room', playerType: 'vr' });
  });

  renderer.xr.addEventListener('sessionend', () => {
    onPlayerType?.('pc');
    onVrChange?.(false);
    localPlayer.type = 'pc';
    localAvatar.visible = true;
  });

  // ─── XR Hands ─────────────────────────────────────────────────────────────
  const handFactory = new XRHandModelFactory();
  const vrHands = [];

  for (let i = 0; i < 2; i++) {
    const hand = renderer.xr.getHand(i);
    hand.add(handFactory.createHandModel(hand, 'mesh'));
    hand.userData = { grabbed: null, wasPinching: false, prevMid: new THREE.Vector3() };
    scene.add(hand);
    vrHands.push(hand);

    const pinchSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    );
    pinchSphere.visible = false;
    hand.userData.pinchSphere = pinchSphere;
    scene.add(pinchSphere);
  }

  const ctrlFactory = new XRControllerModelFactory();
  for (let i = 0; i < 2; i++) {
    const ctrl = renderer.xr.getController(i);
    ctrl.userData = { grabbed: null };
    ctrl.addEventListener('selectstart', () => {
      const pos = new THREE.Vector3(); ctrl.getWorldPosition(pos);
      const obj = nearest(pos, 0.4); if (obj) grab(obj, ctrl);
    });
    ctrl.addEventListener('selectend', () => {
      if (ctrl.userData.grabbed) { release(ctrl.userData.grabbed, null); ctrl.userData.grabbed = null; }
    });
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(ctrlFactory.createControllerModel(grip));
    const ray = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.35, transparent: true })
    );
    ray.scale.z = 3;
    ctrl.add(ray);
    scene.add(grip); scene.add(ctrl);
  }

  const VR_JOINTS = [
    'wrist', 'thumb-tip', 'index-finger-tip',
    'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip',
  ];

  function getHandArray(hand) {
    const arr = [];
    for (const name of VR_JOINTS) {
      const j = hand.joints?.[name];
      if (!j) return null;
      const p = new THREE.Vector3();
      j.getWorldPosition(p);
      arr.push(p.x, p.y, p.z);
    }
    return arr;
  }

  let avatarLastSend = 0;

  function sendAvatarData() {
    const now = performance.now();
    if (now - avatarLastSend < 40) return;
    avatarLastSend = now;

    if (renderer.xr.isPresenting) {
      const xrCam = renderer.xr.getCamera();
      const hPos = new THREE.Vector3();
      xrCam.getWorldPosition(hPos);
      mp.send({
        type: 'avatar', playerType: 'vr',
        headPos: { x: hPos.x, y: hPos.y, z: hPos.z },
        lh: getHandArray(vrHands[0]),
        rh: getHandArray(vrHands[1]),
        action: vrHands.some(h => h.userData.grabbed) ? 'grab' : 'idle',
      });
    } else {
      mp.send({
        type: 'avatar', playerType: 'pc',
        pos: { x: localPlayer.pos.x, y: localPlayer.pos.y, z: localPlayer.pos.z },
        rotY: localPlayer.rotY,
        action: localPlayer.action,
      });
    }
  }

  // ─── Posição do pulso de uma mão (para defesa de pênalti) ─────────────────
  function getWristPosition(hand) {
    const wrist = hand.joints?.['wrist'];
    if (!wrist) return null;
    const p = new THREE.Vector3();
    wrist.getWorldPosition(p);
    return { x: p.x, y: p.y, z: p.z };
  }

  // Throttle do envio das mãos (~30 Hz é mais que suficiente)
  let lastHandSendMs = 0;

  function sendHandUpdate() {
    if (penaltyState.role !== 'goalkeeper')          return;
    if (penaltyState.roundState !== 'ball_in_flight') return;
    const now = Date.now();
    if (now - lastHandSendMs < 33) return; // ~30 Hz
    lastHandSendMs = now;
    mp.send({
      type:  'penalty:hand_update',
      hands: {
        left:      getWristPosition(vrHands[0]),
        right:     getWristPosition(vrHands[1]),
        timestamp: now,
      },
    });
  }

  function tickHands() {
    for (const hand of vrHands) {
      const idx = hand.joints?.['index-finger-tip'];
      const thb = hand.joints?.['thumb-tip'];
      if (!idx || !thb) continue;

      const iPos = new THREE.Vector3(), tPos = new THREE.Vector3();
      idx.getWorldPosition(iPos); thb.getWorldPosition(tPos);
      const mid = iPos.clone().lerp(tPos, 0.5);
      const isPinching = iPos.distanceTo(tPos) < 0.03;

      hand.userData.pinchSphere.position.copy(mid);
      hand.userData.pinchSphere.visible = true;
      hand.userData.pinchSphere.material.color.setHex(isPinching ? 0xa78bfa : 0xffffff);
      hand.userData.pinchSphere.scale.setScalar(isPinching ? 1.6 : 1.0);

      if (isPinching && !hand.userData.wasPinching) {
        const obj = nearest(mid, 0.15); if (obj) grab(obj, hand);
      }
      if (!isPinching && hand.userData.wasPinching && hand.userData.grabbed) {
        release(
          hand.userData.grabbed,
          mid.clone().sub(hand.userData.prevMid).multiplyScalar(70)
        );
        hand.userData.grabbed = null;
      }
      if (hand.userData.grabbed) {
        hand.userData.grabbed.position.copy(mid);
        sendMove(hand.userData.grabbed);
      }
      hand.userData.wasPinching = isPinching;
      hand.userData.prevMid.copy(mid);
    }

    // Envia posição das mãos para o servidor verificar defesa
    sendHandUpdate();
  }

  // ─── Mouse interaction ─────────────────────────────────────────────────────
  const mouse     = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragOff   = new THREE.Vector3();
  const dragHit   = new THREE.Vector3();
  let dragged = null;

  function mouseToNDC(e) {
    mouse.x = (e.clientX / window.innerWidth)  *  2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * -2 + 1;
  }

  const onMouseDown = e => {
    if (renderer.xr.isPresenting) return;
    mouseToNDC(e);
    raycaster.setFromCamera(mouse, camera);
    const result = hitTestAll();
    if (!result) return;
    dragged = result.draggable;
    orbit.enabled = false;
    const n = camera.position.clone().sub(result.hit.point).normalize();
    dragPlane.setFromNormalAndCoplanarPoint(n, result.hit.point);
    dragOff.copy(result.hit.point).sub(dragged.position);
    grab(dragged, { userData: { grabbed: dragged } });
  };

  const onMouseMove = e => {
    if (renderer.xr.isPresenting) return;
    mouseToNDC(e);
    raycaster.setFromCamera(mouse, camera);
    if (dragged) {
      if (raycaster.ray.intersectPlane(dragPlane, dragHit)) {
        dragged.position.copy(dragHit.sub(dragOff));
        if (!dragged.userData.isModel) sendMove(dragged);
      }
    } else {
      const hits = raycaster.intersectObjects(interactiveObjects);
      for (const obj of interactiveObjects) {
        if (!obj.userData.isGrabbed)
          obj.material.emissiveIntensity = hits.some(h => h.object === obj) ? 0.3 : 0.08;
      }
    }
  };

  const onMouseUp = () => {
    if (dragged) { release(dragged, new THREE.Vector3()); dragged = null; }
    orbit.enabled = true;
  };

  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('mouseup',   onMouseUp);

  // ─── Physics ───────────────────────────────────────────────────────────────
  function tickPhysics(dt) {
    for (const { root } of placedModels) {
      if (root.userData.isGrabbed) continue;
      root.userData.velocity.y -= 4 * dt;
      root.position.addScaledVector(root.userData.velocity, dt);
      if (root.position.y < 0) {
        root.position.y = 0;
        root.userData.velocity.y  = Math.abs(root.userData.velocity.y) * 0.35;
        root.userData.velocity.x *= 0.82;
        root.userData.velocity.z *= 0.82;
      }
      if (Math.abs(root.position.x) > 6) { root.userData.velocity.x *= -0.7; root.position.x = Math.sign(root.position.x) * 6; }
      if (Math.abs(root.position.z) > 5) { root.userData.velocity.z *= -0.7; root.position.z = Math.sign(root.position.z) * 5; }
      if (root.userData.velocity.lengthSq() < 0.001) root.userData.velocity.set(0, 0, 0);
      else root.userData.velocity.multiplyScalar(0.99);
    }

    for (const obj of interactiveObjects) {
      if (obj.userData.isGrabbed || isRemotelyHeld(obj)) continue;
      obj.userData.velocity.y -= 4 * dt;
      obj.position.addScaledVector(obj.userData.velocity, dt);
      if (obj.position.y < 0.18) {
        obj.position.y = 0.18;
        obj.userData.velocity.y  = Math.abs(obj.userData.velocity.y) * 0.45;
        obj.userData.velocity.x *= 0.88;
        obj.userData.velocity.z *= 0.88;
      }
      if (Math.abs(obj.position.x) > 6) { obj.userData.velocity.x *= -0.7; obj.position.x = Math.sign(obj.position.x) * 6; }
      if (Math.abs(obj.position.z) > 5) { obj.userData.velocity.z *= -0.7; obj.position.z = Math.sign(obj.position.z) * 5; }
      obj.rotation.x += 0.003; obj.rotation.y += 0.006;
      if (obj.userData.velocity.lengthSq() < 0.0001) obj.userData.velocity.set(0, 0, 0);
      else obj.userData.velocity.multiplyScalar(0.995);
    }
  }

  function tickRemote(dt) {
    for (const state of remoteGrabs.values()) {
      const obj = interactiveObjects[state.objIdx];
      if (obj) obj.position.lerp(state.target, Math.min(1, dt * 15));
    }
  }

  // ─── Main loop ─────────────────────────────────────────────────────────────
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt   = Math.min(clock.getDelta(), 0.05);
    const time = clock.getElapsedTime();

    tickMovement(dt);
    tickPhysics(dt);
    tickRemote(dt);
    tickAvatars(dt);
    sendAvatarData();

    // Bola de pênalti (só roda algo se ball.visible = true)
    if (penaltyState.roundState === 'ball_in_flight') penaltyScene.updateBall();

    if (renderer.xr.isPresenting) {
      tickHands();
      orbit.enabled = false;
    } else {
      orbit.update();
    }

    lA.position.set(Math.sin(time * 0.4) * 4, 3 + Math.sin(time * 0.6) * 0.5, -2);
    lB.position.set(Math.cos(time * 0.4) * 4, 3 + Math.cos(time * 0.6) * 0.5, -2);

    renderer.render(scene, camera);
  });

  // ─── Resize ────────────────────────────────────────────────────────────────
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  function cleanup() {
    renderer.setAnimationLoop(null);
    clearInterval(pollInterval);
    window.removeEventListener('keydown',  onKeyDown);
    window.removeEventListener('keyup',    onKeyUp);
    window.removeEventListener('resize',   onResize);
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    renderer.domElement.removeEventListener('mousemove', onMouseMove);
    renderer.domElement.removeEventListener('mouseup',   onMouseUp);
    renderer.dispose();
    if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
  }

  // ─── API de pênalti exposta para o React ───────────────────────────────────
  const penalty = {
    /** Atacante moveu a mira (atualiza visual na cena 3D) */
    setAim: (target) => penaltyScene.setAimTarget(target),
    /** Atacante confirmou o chute — envia para o servidor */
    confirmShot: (target) => {
      if (penaltyState.roundState !== 'preparing_shot') return;
      mp.send({ type: 'penalty:confirm_shot', target });
    },
  };

  return { placeModel, vrButton, cleanup, penalty };
}
