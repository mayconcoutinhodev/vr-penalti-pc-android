// ─── Jogador ──────────────────────────────────────────────────────────────────

export type PlayerType = 'pc' | 'vr' | 'android';
export type PlayerRole = 'attacker' | 'goalkeeper' | 'spectator';

// ─── Máquina de estados da rodada ─────────────────────────────────────────────

export type RoundState =
  | 'waiting_players'   // sem atacante disponível
  | 'preparing_shot'    // atacante presente, esperando chute
  | 'ball_in_flight'    // bola em jogo
  | 'round_end';        // resultado definido, aguardando reset

export type RoundResult = 'goal' | 'saved' | 'rebound';

// ─── Vetores e posições ───────────────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// ─── Bola ─────────────────────────────────────────────────────────────────────

export interface BallData {
  origin:    Vec3;
  target:    Vec3;
  speed:     number; // m/s
  startTime: number; // Date.now() no servidor
}

// ─── Alvo do chute (coordenadas normalizadas no gol) ──────────────────────────
//   x: -1 (esquerda) → 1 (direita)
//   y:  0 (baixo)    → 1 (cima)

export interface ShotTarget {
  x: number;
  y: number;
}

// ─── Mãos do goleiro ──────────────────────────────────────────────────────────

export interface HandsData {
  left:      Vec3 | null;
  right:     Vec3 | null;
  timestamp: number;
}

// ─── Placar ───────────────────────────────────────────────────────────────────

export interface Score {
  attacker:   number;
  goalkeeper: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mensagens de rede — cliente → servidor
// ═══════════════════════════════════════════════════════════════════════════════

export interface Msg_PenaltyJoinRoom {
  type:       'penalty:join_room';
  clientId:   string;
  playerType: PlayerType;
}

export interface Msg_PenaltyConfirmShot {
  type:     'penalty:confirm_shot';
  clientId: string;
  target:   ShotTarget;
}

export interface Msg_PenaltyHandUpdate {
  type:     'penalty:hand_update';
  clientId: string;
  hands:    HandsData;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mensagens de rede — servidor → cliente
// ═══════════════════════════════════════════════════════════════════════════════

export interface Msg_PenaltyAssignRole {
  type:       'penalty:assign_role';
  role:       PlayerRole;
  roundState: RoundState;
  score:      Score;
}

export interface Msg_PenaltyRoundStart {
  type:               'penalty:round_start';
  attackerId:         string;
  goalkeeperPresent:  boolean;
}

export interface Msg_PenaltyShotStarted {
  type: 'penalty:shot_started';
  ball: BallData;
}

export interface Msg_PenaltyRoundResult {
  type:   'penalty:round_result';
  result: RoundResult;
  score:  Score;
}

export interface Msg_PenaltyStateUpdate {
  type:       'penalty:state_update';
  roundState: RoundState;
  score:      Score;
}
