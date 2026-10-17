/**
 * Block Strike — render Three.js (único módulo que importa Three.js).
 * Mapa em uma BufferGeometry só (uma draw call) e bonecos de blocos sob demanda.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { olho } from './fisica.js';
import { ARMAS } from './config.js';
import { SAQUE } from './armas.js';

const FOV_PADRAO = 75;
const PITCH_CAM = Math.PI / 2 - 0.01; // pitch + recuo nunca passa da vertical
const COR_CABECA = 0xf5cd30;
const COR_TIME = { azul: 0x2f6fde, laranja: 0xf08a24 };
const MAX_IMPACTOS = 64;
const DURACAO_CLARAO = 0.05;
const MAX_RASTROS = 24;
const VIDA_RASTRO = 0.05;
const MAX_GOTAS = 48;
const VIDA_GOTA = 0.45;
const POS_VIEW = { x: 0.24, y: -0.22, z: -0.4 }; // arma em repouso, no espaço da câmera
const VEL_OLHO = 10; // 1/s: suaviza a câmera ao agachar e levantar

// Armas em primeira pessoa: [largura, altura, profundidade, x, y, z, madeira?] no espaço da câmera.
// A primeira caixa é o corpo (define a altura do clarão); `boca` é o z do cano.
const MODELOS_ARMA = {
  rifle: {
    caixas: [[0.07, 0.09, 0.5, 0, 0, -0.1], [0.03, 0.03, 0.25, 0, 0.01, -0.5], [0.06, 0.16, 0.06, 0, -0.12, 0.02, 1], [0.07, 0.1, 0.2, 0, -0.02, 0.28, 1]],
    boca: -0.68,
  },
  smg: {
    caixas: [[0.07, 0.09, 0.32, 0, 0, -0.05], [0.03, 0.03, 0.14, 0, 0.01, -0.32], [0.05, 0.2, 0.05, 0, -0.14, 0.04]],
    boca: -0.45,
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
  },
  faca: {
    caixas: [[0.02, 0.05, 0.28, 0, 0.02, -0.2], [0.04, 0.04, 0.1, 0, -0.01, 0.02, 1]],
    boca: -0.35,
  },
};

// Faces de uma caixa: normal e os 4 cantos (em ordem anti-horária vista de fora).
const FACES = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

// 24 vértices e 36 índices por caixa, normal por face e cor por vértice.
function geometriaDoMapa(caixas) {
  const pos = new Float32Array(caixas.length * 24 * 3);
  const nor = new Float32Array(caixas.length * 24 * 3);
  const cor = new Float32Array(caixas.length * 24 * 3);
  const idx = new Uint32Array(caixas.length * 36);
  const c = new THREE.Color();
  caixas.forEach((caixa, i) => {
    c.setHex(caixa.cor);
    const { min, max } = caixa;
    FACES.forEach((face, f) => {
      // Sombreamento fixo por face dá leitura de volume mesmo sem luz forte.
      const tom = face.n[1] > 0 ? 1 : face.n[1] < 0 ? 0.6 : face.n[0] !== 0 ? 0.85 : 0.75;
      face.v.forEach((q, k) => {
        const o = (i * 24 + f * 4 + k) * 3;
        pos[o] = q[0] ? max.x : min.x;
        pos[o + 1] = q[1] ? max.y : min.y;
        pos[o + 2] = q[2] ? max.z : min.z;
        nor.set(face.n, o);
        cor[o] = c.r * tom;
        cor[o + 1] = c.g * tom;
        cor[o + 2] = c.b * tom;
      });
      const b = i * 24 + f * 4;
      idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 36 + f * 6);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export function criarRender(canvas, mapa) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(mapa.ceu);
  scene.fog = new THREE.Fog(mapa.ceu, mapa.neblina[0], mapa.neblina[1]);
  const camera = new THREE.PerspectiveCamera(FOV_PADRAO, 16 / 9, 0.05, 200);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.9));
  const sol = new THREE.DirectionalLight(0xffffff, 0.8);
  sol.position.set(20, 40, 10);
  scene.add(sol);

  const geoMapa = geometriaDoMapa(mapa.caixas);
  const matMapa = new THREE.MeshLambertMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(geoMapa, matMapa));

  // Avatares estilo Roblox: caixas compartilhadas, criados na primeira vez que a entidade aparece.
  const topo = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0); // pivô no topo
  const geo = {
    cabeca: new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(0, 0.2, 0),
    olho: new THREE.BoxGeometry(0.07, 0.07, 0.02),
    tronco: new THREE.BoxGeometry(0.5, 0.6, 0.28).translate(0, 0.3, 0),
    braco: topo(0.18, 0.6, 0.18),
    perna: topo(0.22, 0.8, 0.22),
    armaAvatar: new THREE.BoxGeometry(0.08, 0.1, 0.55),
  };
  const mat = {
    cabeca: new THREE.MeshLambertMaterial({ color: COR_CABECA }),
    armaAvatar: new THREE.MeshLambertMaterial({ color: 0x2a2c31 }),
    olho: new THREE.MeshBasicMaterial({ color: 0x111111 }),
  };
  for (const [time, hex] of Object.entries(COR_TIME)) {
    mat[time] = new THREE.MeshLambertMaterial({ color: hex });
    mat[`${time}Escuro`] = new THREE.MeshLambertMaterial({ color: new THREE.Color(hex).multiplyScalar(0.6) });
  }
  const avatares = new Map();

  function criarAvatar(ent) {
    const g = new THREE.Group();
    const parte = (geometria, material, x, y) => {
      const m = new THREE.Mesh(geometria, material);
      m.position.set(x, y, 0);
      g.add(m);
      return m;
    };
    parte(geo.tronco, mat[ent.time], 0, 0.8);
    parte(geo.cabeca, mat.cabeca, 0, 1.4);
    parte(geo.olho, mat.olho, -0.1, 1.62).position.z = -0.2;
    parte(geo.olho, mat.olho, 0.1, 1.62).position.z = -0.2;
    const escuro = mat[`${ent.time}Escuro`];
    const bracoE = parte(geo.braco, escuro, -0.34, 1.4);
    const bracoD = parte(geo.braco, escuro, 0.34, 1.4);
    const pernaE = parte(geo.perna, escuro, -0.12, 0.8);
    const pernaD = parte(geo.perna, escuro, 0.12, 0.8);
    const arma = parte(geo.armaAvatar, mat.armaAvatar, 0.22, 1.18);
    arma.position.z = -0.32;
    scene.add(g);
    return { g, bracoE, bracoD, pernaE, pernaD, dist: ent.distAndada, amp: 0 };
  }

  function atualizarAvatar(ent, idVista) {
    let a = avatares.get(ent.id);
    if (!a) {
      a = criarAvatar(ent);
      avatares.set(ent.id, a);
    }
    a.g.visible = ent.vivo && ent.id !== idVista;
    if (!a.g.visible) return;
    a.g.position.set(ent.pos.x, ent.pos.y, ent.pos.z);
    a.g.rotation.y = ent.yaw;
    a.g.scale.y = ent.agachado ? 1.2 / 1.8 : 1;
    const andou = ent.distAndada - a.dist;
    a.dist = ent.distAndada;
    a.amp += ((andou > 0.0005 ? 0.8 : 0) - a.amp) * 0.3;
    const balanco = Math.sin(ent.distAndada * 4) * a.amp;
    a.pernaE.rotation.x = balanco;
    a.pernaD.rotation.x = -balanco;
    a.bracoE.rotation.x = -balanco;
    a.bracoD.rotation.x = balanco;
  }

  // Marcas de impacto: anel de 64 caixas pretas reaproveitadas.
  const geoImpacto = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const matImpacto = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const impactos = [];
  let proxImpacto = 0;
  const luzTiro = new THREE.PointLight(0xffd070, 0, 12);
  scene.add(luzTiro);

  function impacto(ponto, normal) {
    if (impactos.length < MAX_IMPACTOS) {
      const m = new THREE.Mesh(geoImpacto, matImpacto);
      scene.add(m);
      impactos.push(m);
    }
    const m = impactos[proxImpacto % MAX_IMPACTOS];
    proxImpacto += 1;
    m.position.set(ponto.x + normal.x * 0.02, ponto.y + normal.y * 0.02, ponto.z + normal.z * 0.02);
  }

  // Novo round: tira todas as marcas da cena e reinicia o anel (geometria e material são compartilhados).
  function limparImpactos() {
    for (const m of impactos) scene.remove(m);
    impactos.length = 0;
    proxImpacto = 0;
    for (const r of rastros) { r.vida = 0; r.linha.visible = false; }
    for (const gt of gotas) { gt.vida = 0; gt.m.visible = false; }
  }

  // Rastros de bala: segmentos de linha reaproveitados, visíveis por um instante.
  const matRastro = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.75 });
  const rastros = [];
  let proxRastro = 0;
  const tmp = new THREE.Vector3();

  function rastro(de, ate, proprio) {
    if (rastros.length < MAX_RASTROS) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const linha = new THREE.Line(g, matRastro);
      linha.frustumCulled = false;
      linha.visible = false;
      scene.add(linha);
      rastros.push({ linha, vida: 0 });
    }
    const r = rastros[proxRastro % MAX_RASTROS];
    proxRastro += 1;
    // Do jogador, o rastro sai da boca da arma; dos outros, um pouco abaixo do olho.
    if (proprio && viewAtual) viewAtual.boca.getWorldPosition(tmp);
    else tmp.set(de.x, de.y - 0.2, de.z);
    const pos = r.linha.geometry.attributes.position;
    pos.setXYZ(0, tmp.x, tmp.y, tmp.z);
    pos.setXYZ(1, ate.x, ate.y, ate.z);
    pos.needsUpdate = true;
    r.linha.visible = true;
    r.vida = VIDA_RASTRO;
  }

  // Sangue: gotas (caixinhas vermelhas) com gravidade, de um pool fixo.
  const geoGota = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  const matGota = new THREE.MeshBasicMaterial({ color: 0xb3121b });
  const gotas = [];
  let proxGota = 0;

  function sangue(ponto, cabeca) {
    const n = cabeca ? 8 : 5;
    for (let i = 0; i < n; i++) {
      if (gotas.length < MAX_GOTAS) {
        const m = new THREE.Mesh(geoGota, matGota);
        m.visible = false;
        scene.add(m);
        gotas.push({ m, vida: 0, v: new THREE.Vector3() });
      }
      const gt = gotas[proxGota % MAX_GOTAS];
      proxGota += 1;
      gt.m.position.set(ponto.x, ponto.y, ponto.z);
      gt.v.set((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3);
      gt.m.visible = true;
      gt.vida = VIDA_GOTA;
    }
  }

  function animarEfeitos(dt) {
    for (const r of rastros) {
      if (r.vida <= 0) continue;
      r.vida -= dt;
      if (r.vida <= 0) r.linha.visible = false;
    }
    for (const gt of gotas) {
      if (gt.vida <= 0) continue;
      gt.vida -= dt;
      gt.v.y -= 12 * dt;
      gt.m.position.addScaledVector(gt.v, dt);
      if (gt.vida <= 0) gt.m.visible = false;
    }
  }

  // Arma em primeira pessoa: caixas presas à câmera, uma por slot, trocada conforme a arma ativa.
  scene.add(camera);
  const matArma = new THREE.MeshLambertMaterial({ color: 0x3a3d44 });
  const matArmaClara = new THREE.MeshLambertMaterial({ color: 0x8a6a3c });
  const matFaca = new THREE.MeshLambertMaterial({ color: 0xcfd6dd });
  const matClarao = new THREE.MeshBasicMaterial({ color: 0xffe040 });
  const geoClarao = new THREE.BoxGeometry(0.09, 0.09, 0.06);
  const geoArma = new Map();
  const viewmodels = new Map();
  let viewAtual = null;
  let clarao = 0;
  let recuo = 0;
  let recuoArma = 0;

  function criarViewmodel(tipo) {
    const modelo = MODELOS_ARMA[tipo] ?? MODELOS_ARMA.rifle;
    const g = new THREE.Group();
    for (const [w, h, d, x, y, z, claro] of modelo.caixas) {
      const chave = `${w},${h},${d}`;
      if (!geoArma.has(chave)) geoArma.set(chave, new THREE.BoxGeometry(w, h, d));
      const mat = tipo === 'faca' ? (claro ? matArmaClara : matFaca) : claro ? matArmaClara : matArma;
      const m = new THREE.Mesh(geoArma.get(chave), mat);
      m.position.set(x, y, z);
      g.add(m);
    }
    const boca = new THREE.Mesh(geoClarao, matClarao);
    boca.position.set(0, modelo.caixas[0][4], modelo.boca);
    boca.visible = false;
    g.add(boca);
    g.position.set(POS_VIEW.x, POS_VIEW.y, POS_VIEW.z);
    g.visible = false;
    camera.add(g);
    return { g, boca };
  }

  function viewmodelDe(tipo) {
    if (!viewmodels.has(tipo)) viewmodels.set(tipo, criarViewmodel(tipo));
    return viewmodels.get(tipo);
  }

  const flash = () => { clarao = DURACAO_CLARAO; };
  // Animações da arma na mão (tempos em s): saque ao trocar, golpe da faca.
  let saque = 0;
  let saqueDur = 0.3;
  let golpeT = 0;
  let golpeForte = false;
  let golpeLado = 1;
  const golpe = (forte) => {
    golpeForte = forte;
    golpeT = forte ? 0.45 : 0.3;
    golpeLado = -golpeLado; // golpes leves alternam o lado, como no CS
  };
  let balanco = 0; // amplitude do balanço ao andar (0..1)
  let yawAntes = null;
  let ginga = 0; // a arma atrasa um pouco quando a mira gira
  let olhoY = null;
  let vistaAntes = null;
  const recuoVisual = () => {
    recuo = 0.04;
    recuoArma = 0.08;
  };

  function redimensionar() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observador = new ResizeObserver(redimensionar);
  observador.observe(canvas);
  redimensionar();

  let ultimo = performance.now();
  let fovAtual = FOV_PADRAO;
  let tipoAntes = null;

  // Posição e giro da arma na mão: balanço ao andar, ginga ao mirar, saque, recarga e golpe.
  function posarArma(vista, mundo, dt) {
    const g = viewAtual.g;
    const arma = vista.armas[vista.slot];
    const andando = vista.noChao && vista.velHoriz > 0.5;
    balanco += ((andando ? Math.min(1, vista.velHoriz / 5) : 0) - balanco) * Math.min(1, dt * 8);
    const fase = vista.distAndada * 2.2;
    let x = POS_VIEW.x + Math.sin(fase) * 0.012 * balanco;
    let y = POS_VIEW.y - Math.abs(Math.cos(fase)) * 0.012 * balanco;
    let z = POS_VIEW.z + recuoArma;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    if (yawAntes !== null) {
      const giro = Math.atan2(Math.sin(vista.yaw - yawAntes), Math.cos(vista.yaw - yawAntes));
      ginga += (Math.max(-0.08, Math.min(0.08, giro * 2)) - ginga) * Math.min(1, dt * 12);
    }
    yawAntes = vista.yaw;
    ry += ginga;
    x -= ginga * 0.3;
    if (!vista.noChao) y += 0.02; // no ar a arma sobe um pouco
    // Recarga: abaixa e gira a arma; volta no fim (curva em seno do progresso).
    if (arma.recarregandoAte > 0) {
      const def = ARMAS[arma.tipo];
      const p = 1 - Math.max(0, arma.recarregandoAte - mundo.tempo) / def.recarga;
      const k = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
      y -= 0.12 * k;
      rx -= 0.5 * k;
      rz += 0.6 * k;
    }
    if (saque > 0) {
      const k = saque / saqueDur;
      y -= 0.3 * k;
      rx -= 0.8 * k;
    }
    if (golpeT > 0) {
      const total = golpeForte ? 0.45 : 0.3;
      const k = Math.sin((1 - golpeT / total) * Math.PI);
      if (golpeForte) {
        z -= 0.28 * k; // estocada para a frente
        x -= 0.12 * k;
        rx -= 0.3 * k;
      } else {
        x -= 0.22 * k * golpeLado; // corte de lado a lado
        ry += 1.1 * k * golpeLado;
        rz -= 0.5 * k * golpeLado;
      }
    }
    g.position.set(x, y, z);
    g.rotation.set(rx, ry, rz);
    viewAtual.boca.visible = clarao > 0;
  }

  function desenhar(mundo, idVista, { zoomFov } = {}) {
    const agora = performance.now();
    const dt = Math.min((agora - ultimo) / 1000, 0.1);
    ultimo = agora;
    for (const ent of mundo.entidades) atualizarAvatar(ent, idVista);

    const vista = mundo.entidades[idVista];
    const fov = zoomFov ?? FOV_PADRAO;
    if (fov !== fovAtual) {
      fovAtual = fov;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    const o = olho(vista);
    // Agachar/levantar suave: a altura do olho persegue o alvo (troca de vista é instantânea).
    const altura = o.y - vista.pos.y;
    if (vistaAntes !== idVista || olhoY === null) olhoY = altura;
    else olhoY += (altura - olhoY) * Math.min(1, dt * VEL_OLHO);
    vistaAntes = idVista;
    camera.position.set(o.x, vista.pos.y + olhoY, o.z);
    const subida = vista.vivo && vista.armas ? vista.armas[vista.slot].recuoAcum : 0; // a mira acompanha o spray
    const inclina = vista.pitch + subida + recuo;
    camera.rotation.set(Math.max(-PITCH_CAM, Math.min(PITCH_CAM, inclina)), vista.yaw, 0);
    recuo = Math.max(0, recuo - dt * 0.3);

    // Arma na mão: some com o zoom da sniper (mira de luneta) e sai do campo de visão ao morrer.
    const tipoAtivo = vista.vivo && vista.armas ? vista.armas[vista.slot].tipo : null;
    const alvoView = tipoAtivo && zoomFov === undefined ? viewmodelDe(tipoAtivo) : null;
    if (alvoView !== viewAtual) {
      if (viewAtual) viewAtual.g.visible = false;
      // Arma nova (não a mesma voltando do zoom): sobe de baixo da tela durante o saque.
      if (alvoView && tipoAtivo !== tipoAntes) {
        saqueDur = SAQUE[ARMAS[tipoAtivo].slot] ?? 0.3;
        saque = saqueDur;
        golpeT = 0;
      }
      viewAtual = alvoView;
      if (viewAtual) viewAtual.g.visible = true;
    }
    if (tipoAtivo) tipoAntes = tipoAtivo;
    clarao = Math.max(0, clarao - dt);
    recuoArma = Math.max(0, recuoArma - dt * 0.6);
    saque = Math.max(0, saque - dt);
    golpeT = Math.max(0, golpeT - dt);
    animarEfeitos(dt);
    if (viewAtual) posarArma(vista, mundo, dt);
    luzTiro.intensity = clarao > 0 ? 2 : 0;
    luzTiro.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  function destruir() {
    observador.disconnect();
    geoMapa.dispose();
    matMapa.dispose();
    geoImpacto.dispose();
    matImpacto.dispose();
    geoArma.forEach((g) => g.dispose());
    [matArma, matArmaClara, matFaca, matClarao].forEach((m) => m.dispose());
    geoClarao.dispose();
    for (const r of rastros) r.linha.geometry.dispose();
    matRastro.dispose();
    geoGota.dispose();
    matGota.dispose();
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mat).forEach((m) => m.dispose());
    avatares.clear();
    renderer.dispose();
  }

  return {
    desenhar, redimensionar, impacto, limparImpactos, flash, recuoVisual, golpe, rastro, sangue, destruir,
  };
}
