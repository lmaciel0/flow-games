/**
 * Block Strike — formato das armas em caixas. Módulo puro: o render monta os modelos 3D
 * e o menu desenha as miniaturas do loadout a partir das mesmas caixas.
 */

// Armas em primeira pessoa: [largura, altura, profundidade, x, y, z, madeira?] no espaço da câmera.
// A primeira caixa é o corpo (define a altura do clarão); `boca` é o z do cano.
export const MODELOS_ARMA = {
  rifle: {
    caixas: [[0.07, 0.09, 0.5, 0, 0, -0.1], [0.03, 0.03, 0.25, 0, 0.01, -0.5], [0.06, 0.16, 0.06, 0, -0.12, 0.02, 1], [0.07, 0.1, 0.2, 0, -0.02, 0.28, 1]],
    boca: -0.68,
    pente: 2,
  },
  fuzil: {
    caixas: [[0.08, 0.1, 0.52, 0, 0, -0.1], [0.035, 0.035, 0.28, 0, 0.01, -0.52], [0.06, 0.2, 0.07, 0, -0.14, -0.02], [0.08, 0.11, 0.22, 0, -0.02, 0.28, 1]],
    boca: -0.72,
    pente: 2,
  },
  // Silenciadas: o cano grosso e comprido é o silenciador.
  rifleS: {
    caixas: [[0.07, 0.09, 0.5, 0, 0, -0.1], [0.05, 0.05, 0.32, 0, 0.01, -0.52], [0.06, 0.14, 0.06, 0, -0.11, 0.02], [0.07, 0.1, 0.2, 0, -0.02, 0.28]],
    boca: -0.74,
    pente: 2,
  },
  smg: {
    caixas: [[0.07, 0.09, 0.32, 0, 0, -0.05], [0.03, 0.03, 0.14, 0, 0.01, -0.32], [0.05, 0.2, 0.05, 0, -0.14, 0.04]],
    boca: -0.45,
    pente: 2,
  },
  miniSmg: {
    caixas: [[0.06, 0.1, 0.24, 0, 0, -0.02], [0.03, 0.03, 0.08, 0, 0.01, -0.18], [0.04, 0.22, 0.04, 0, -0.15, 0]],
    boca: -0.24,
    pente: 2,
  },
  smgS: {
    caixas: [[0.07, 0.09, 0.32, 0, 0, -0.05], [0.05, 0.05, 0.26, 0, 0.01, -0.34], [0.05, 0.2, 0.05, 0, -0.14, 0.04]],
    boca: -0.5,
    pente: 2,
  },
  sniper: {
    caixas: [[0.06, 0.08, 0.7, 0, 0, -0.2], [0.03, 0.03, 0.4, 0, 0.01, -0.75], [0.05, 0.06, 0.2, 0, 0.08, -0.15], [0.07, 0.1, 0.25, 0, -0.02, 0.3, 1]],
    boca: -1,
  },
  escopeta: {
    caixas: [[0.07, 0.07, 0.6, 0, 0, -0.15], [0.05, 0.05, 0.5, 0, -0.05, -0.2, 1], [0.07, 0.1, 0.2, 0, -0.03, 0.3, 1]],
    boca: -0.55,
  },
  pistola: {
    caixas: [[0.05, 0.07, 0.2, 0, 0, -0.05], [0.05, 0.12, 0.06, 0, -0.09, 0.04, 1]],
    boca: -0.2,
    pente: 1,
  },
  faca: {
    caixas: [[0.02, 0.05, 0.28, 0, 0.02, -0.2], [0.04, 0.04, 0.1, 0, -0.01, 0.02, 1]],
    boca: -0.35,
  },
};
