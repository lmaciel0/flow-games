/**
 * Block Strike — render Three.js (único módulo que importa Three.js).
 * Mapa em uma BufferGeometry só (uma draw call) e bonecos de blocos sob demanda.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { olho } from './fisica.js';
import { ARMAS, FOV_PADRAO } from './config.js';
import { SAQUE } from './armas.js';
import { criarRng } from './rng.js';
import { MODELOS_ARMA } from './modelos.js';

const PITCH_CAM = Math.PI / 2 - 0.01; // pitch + recuo nunca passa da vertical
const COR_CABECA = 0xf5cd30;
const COR_TIME = { azul: 0x2f6fde, laranja: 0xf08a24 };
const MAX_IMPACTOS = 64;
const DURACAO_CLARAO = 0.05;
const MAX_RASTROS = 24;
const VIDA_RASTRO = 0.05;
const MAX_GOTAS = 48;
const VIDA_GOTA = 0.45;
const MAX_FAGULHAS = 32;
const VIDA_FAGULHA = 0.35;
const POS_VIEW = { x: 0.24, y: -0.22, z: -0.4 }; // arma em repouso, no espaço da câmera
const VEL_OLHO = 10; // 1/s: suaviza a câmera ao agachar e levantar
const VEL_ZOOM = 18; // 1/s: a luneta abre e fecha deslizando o campo de visão
// Boneco segurando a arma: braços para a frente (rad, ordem YXZ) e a arma na altura das mãos.
const POSE = { bracoD: [1.25, 0.2], bracoE: [1.4, -0.7], arma: { x: 0.17, y: 1.27, z: -0.45 } };

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
  const aleatorio = criarRng(Date.now()); // efeitos visuais: sangue, destroços, faíscas e tremor
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

  // Bombsites: retângulo amarelo translúcido no chão com a letra grande (textura de canvas, uma por site).
  const marcasSite = [];
  for (const [nome, s] of Object.entries(mapa.bombsites ?? {})) {
    const larg = s.max.x - s.min.x;
    const prof = s.max.z - s.min.z;
    const tela = document.createElement('canvas');
    tela.width = 256;
    tela.height = Math.round(256 * (prof / larg));
    const c2 = tela.getContext('2d');
    c2.fillStyle = 'rgba(250, 204, 21, 0.18)';
    c2.fillRect(0, 0, tela.width, tela.height);
    c2.strokeStyle = 'rgba(250, 204, 21, 0.9)';
    c2.lineWidth = 6;
    c2.strokeRect(3, 3, tela.width - 6, tela.height - 6);
    c2.fillStyle = 'rgba(250, 204, 21, 0.85)';
    c2.font = `bold ${Math.round(tela.height * 0.7)}px sans-serif`;
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillText(nome, tela.width / 2, tela.height / 2 + 4);
    const textura = new THREE.CanvasTexture(tela);
    const marca = new THREE.Mesh(
      new THREE.PlaneGeometry(larg, prof).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: textura, transparent: true, depthWrite: false }));
    marca.position.set(s.centro.x, 0.02, s.centro.z);
    scene.add(marca);
    marcasSite.push(marca);
  }

  // C4 no chão: caixa escura com LED. Aparece solta ou plantada; o LED pisca vermelho (verde se desarmada).
  const matC4 = new THREE.MeshLambertMaterial({ color: 0x2b2e35 });
  const matLed = new THREE.MeshBasicMaterial({ color: 0xff2020 });
  const geoC4 = new THREE.BoxGeometry(0.4, 0.16, 0.28);
  const geoLed = new THREE.BoxGeometry(0.06, 0.03, 0.06);
  const c4 = new THREE.Group();
  const c4Corpo = new THREE.Mesh(geoC4, matC4);
  c4Corpo.position.y = 0.08;
  const c4Led = new THREE.Mesh(geoLed, matLed);
  c4Led.position.set(0.12, 0.175, 0);
  c4.add(c4Corpo, c4Led);
  c4.visible = false;
  scene.add(c4);

  // Avatares estilo Roblox: caixas compartilhadas, criados na primeira vez que a entidade aparece.
  const topo = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0); // pivô no topo
  const geo = {
    cabeca: new THREE.BoxGeometry(0.4, 0.4, 0.4).translate(0, 0.2, 0),
    olho: new THREE.BoxGeometry(0.07, 0.07, 0.02),
    tronco: new THREE.BoxGeometry(0.5, 0.6, 0.28).translate(0, 0.3, 0),
    braco: topo(0.18, 0.6, 0.18),
    perna: topo(0.22, 0.8, 0.22),
    sombra: new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2),
  };
  const mat = {
    cabeca: new THREE.MeshLambertMaterial({ color: COR_CABECA }),
    olho: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    sombra: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
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
    // Cabeça e olhos num grupo com pivô no pescoço: o idle vira a cabeça inteira.
    const cabeca = new THREE.Group();
    cabeca.position.y = 1.4;
    g.add(cabeca);
    cabeca.add(new THREE.Mesh(geo.cabeca, mat.cabeca));
    for (const x of [-0.1, 0.1]) {
      const olhoM = new THREE.Mesh(geo.olho, mat.olho);
      olhoM.position.set(x, 0.22, -0.2);
      cabeca.add(olhoM);
    }
    const escuro = mat[`${ent.time}Escuro`];
    const bracoE = parte(geo.braco, escuro, -0.34, 1.4);
    const bracoD = parte(geo.braco, escuro, 0.34, 1.4);
    bracoE.rotation.order = 'YXZ';
    bracoD.rotation.order = 'YXZ';
    bracoE.rotation.y = POSE.bracoE[1];
    bracoD.rotation.y = POSE.bracoD[1];
    const pernaE = parte(geo.perna, escuro, -0.12, 0.8);
    const pernaD = parte(geo.perna, escuro, 0.12, 0.8);
    const arma = new THREE.Group();
    arma.position.set(POSE.arma.x, POSE.arma.y, POSE.arma.z);
    g.add(arma);
    parte(geo.sombra, mat.sombra, 0, 0.03); // sombra de blob: ancora o boneco no chão sem sombra dinâmica
    scene.add(g);
    const a = { g, cabeca, bracoE, bracoD, pernaE, pernaD, arma, tipo: undefined, dist: ent.distAndada ?? 0, amp: 0, fase: (ent.id ?? 0) * 1.7 };
    respirar(a, 0);
    return a;
  }

  // Troca o modelo na mão do boneco: as mesmas caixas da arma em primeira pessoa (a granada não aparece).
  function armarAvatar(a, tipo) {
    a.tipo = tipo;
    a.arma.clear();
    const modelo = MODELOS_ARMA[tipo];
    if (!modelo) return;
    for (const [w, h, d, x, y, z, claro] of modelo.caixas) {
      const chave = `${w},${h},${d}`;
      if (!geoArma.has(chave)) geoArma.set(chave, new THREE.BoxGeometry(w, h, d));
      const m = new THREE.Mesh(geoArma.get(chave), tipo === 'faca' && !claro ? matFaca : claro ? matArmaClara : matArma);
      m.position.set(x, y, z);
      a.arma.add(m);
    }
  }

  // Idle: os braços sobem e descem com a respiração e a arma acompanha as mãos.
  function respirar(a, t) {
    const r = Math.sin(t * 1.6 + a.fase) * 0.035;
    a.bracoE.rotation.x = POSE.bracoE[0] + r;
    a.bracoD.rotation.x = POSE.bracoD[0] + r;
    a.arma.position.y = POSE.arma.y + r * 0.57;
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
    const tipo = ent.armas?.[ent.slot]?.tipo ?? null;
    if (tipo !== a.tipo) armarAvatar(a, tipo);
    const andou = ent.distAndada - a.dist;
    a.dist = ent.distAndada;
    a.amp += ((andou > 0.0005 ? 0.8 : 0) - a.amp) * 0.3;
    const balanco = Math.sin(ent.distAndada * 4) * a.amp;
    a.pernaE.rotation.x = balanco;
    a.pernaD.rotation.x = -balanco;
    respirar(a, performance.now() / 1000); // os braços seguram a arma: não balançam ao andar
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
    for (const f of fagulhas) { f.vida = 0; f.m.visible = false; }
    for (const p of pecas) { p.vida = 0; p.m.visible = false; }
    fogoT = 0;
    fogo.visible = false;
    brilhoT = 0;
    brilho.visible = false;
    tremor = 0;
    for (const f of faiscas) { f.vida = 0; f.m.visible = false; }
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
      gt.v.set((aleatorio() - 0.5) * 3, aleatorio() * 2.5, (aleatorio() - 0.5) * 3);
      gt.m.visible = true;
      gt.vida = VIDA_GOTA;
    }
  }

  // Fagulhas do capacete: cubinhos amarelos e laranja que saltam do ponto do headshot.
  const geoFagulha = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  const matsFagulha = [new THREE.MeshBasicMaterial({ color: 0xffd23f }), new THREE.MeshBasicMaterial({ color: 0xff8a1f })];
  const fagulhas = [];
  let proxFagulha = 0;

  function fagulhasCapacete(ponto) {
    for (let i = 0; i < 10; i++) {
      if (fagulhas.length < MAX_FAGULHAS) {
        const m = new THREE.Mesh(geoFagulha, matsFagulha[fagulhas.length % 2]);
        m.visible = false;
        scene.add(m);
        fagulhas.push({ m, vida: 0, v: new THREE.Vector3() });
      }
      const f = fagulhas[proxFagulha % MAX_FAGULHAS];
      proxFagulha += 1;
      f.m.position.set(ponto.x, ponto.y, ponto.z);
      f.v.set((aleatorio() - 0.5) * 6, 1.5 + aleatorio() * 3.5, (aleatorio() - 0.5) * 6);
      f.m.visible = true;
      f.vida = VIDA_FAGULHA * (0.6 + aleatorio() * 0.4);
    }
  }

  // Desmanche ao morrer: os 6 blocos do boneco saem voando, quicam e ficam no chão por um tempo.
  // [geometria, material, x, y (centro do bloco), alturaDoBloco]; braços e pernas têm pivô no topo.
  const PECAS = [
    ['tronco', 'time', 0, 0.8, 0.3], ['cabeca', 'cabeca', 0, 1.4, 0.2],
    ['braco', 'escuro', -0.34, 1.4, 0.09], ['braco', 'escuro', 0.34, 1.4, 0.09],
    ['perna', 'escuro', -0.12, 0.8, 0.11], ['perna', 'escuro', 0.12, 0.8, 0.11],
  ];
  const MAX_PECAS = 72;
  const VIDA_PECA = 6;
  const pecas = [];
  let proxPeca = 0;

  function desmanchar(ent, vel = 2.5) {
    const cos = Math.cos(ent.yaw);
    const sen = Math.sin(ent.yaw);
    for (const [chave, material, ox, oy, piso] of PECAS) {
      if (pecas.length < MAX_PECAS) {
        const m = new THREE.Mesh(geo.tronco, mat.cabeca);
        m.visible = false;
        scene.add(m);
        pecas.push({ m, v: new THREE.Vector3(), giro: new THREE.Vector3(), vida: 0, piso: 0 });
      }
      const p = pecas[proxPeca % MAX_PECAS];
      proxPeca += 1;
      p.m.geometry = geo[chave];
      p.m.material = material === 'time' ? mat[ent.time] : material === 'escuro' ? mat[`${ent.time}Escuro`] : mat.cabeca;
      p.m.position.set(ent.pos.x + ox * cos, ent.pos.y + oy, ent.pos.z - ox * sen);
      p.m.rotation.set(0, ent.yaw, 0);
      p.v.set((aleatorio() - 0.5) * vel, 2 + aleatorio() * 2.5, (aleatorio() - 0.5) * vel);
      p.giro.set((aleatorio() - 0.5) * 12, (aleatorio() - 0.5) * 8, (aleatorio() - 0.5) * 12);
      p.piso = ent.pos.y + piso;
      p.m.visible = true;
      p.vida = VIDA_PECA;
    }
  }

  function animarPecas(dt) {
    for (const p of pecas) {
      if (p.vida <= 0) continue;
      p.vida -= dt;
      if (p.vida <= 0) { p.m.visible = false; continue; }
      p.v.y -= 16 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.giro.x * dt;
      p.m.rotation.y += p.giro.y * dt;
      p.m.rotation.z += p.giro.z * dt;
      if (p.m.position.y < p.piso) {
        p.m.position.y = p.piso;
        p.v.y = Math.abs(p.v.y) > 1.2 ? -p.v.y * 0.35 : 0;
        p.v.x *= 0.6;
        p.v.z *= 0.6;
        p.giro.multiplyScalar(0.5);
      }
    }
  }

  // Explosão da C4: bola de fogo que cresce e some, faíscas com gravidade e tremor da câmera por perto.
  const matFogo = new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0, depthWrite: false });
  const geoFogo = new THREE.BoxGeometry(1, 1, 1);
  const fogo = new THREE.Mesh(geoFogo, matFogo);
  fogo.visible = false;
  scene.add(fogo);
  const matFaisca = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const geoFaisca = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const faiscas = [];
  let vidaFogo = 0.9;
  let escalaFogo = 20;
  let fogoT = 0;
  let tremor = 0;
  let tremorDe = null;

  // `pequena`: granada HE (bola menor, rápida e com tremor fraco); senão, a C4.
  function explosao(ponto, pequena = false) {
    fogo.position.set(ponto.x, ponto.y + (pequena ? 0.6 : 1), ponto.z);
    vidaFogo = pequena ? 0.45 : 0.9;
    escalaFogo = pequena ? 7 : 20;
    fogoT = vidaFogo;
    fogo.visible = true;
    tremor = pequena ? 0.45 : 1;
    tremorDe = ponto;
    for (let i = 0; i < (pequena ? 12 : 28); i++) {
      if (faiscas.length < 28) {
        const m = new THREE.Mesh(geoFaisca, matFaisca);
        m.visible = false;
        scene.add(m);
        faiscas.push({ m, vida: 0, v: new THREE.Vector3() });
      }
      const f = faiscas[i];
      f.m.position.set(ponto.x, ponto.y + 0.5, ponto.z);
      f.v.set((aleatorio() - 0.5) * 18, 4 + aleatorio() * 12, (aleatorio() - 0.5) * 18);
      f.m.visible = true;
      f.vida = 1.4;
    }
    // Quem estava perto vira blocos pelo evento de morte; aqui só o ambiente.
  }

  function animarExplosao(dt) {
    if (fogoT > 0) {
      fogoT -= dt;
      const k = 1 - Math.max(0, fogoT) / vidaFogo;
      fogo.scale.setScalar(1 + k * escalaFogo);
      matFogo.opacity = Math.max(0, 0.85 * (1 - k * k));
      if (fogoT <= 0) fogo.visible = false;
    }
    for (const f of faiscas) {
      if (f.vida <= 0) continue;
      f.vida -= dt;
      f.v.y -= 18 * dt;
      f.m.position.addScaledVector(f.v, dt);
      if (f.m.position.y < 0.1) { f.m.position.y = 0.1; f.v.multiplyScalar(0.3); }
      if (f.vida <= 0) f.m.visible = false;
    }
    tremor = Math.max(0, tremor - dt * 1.1);
  }

  // Granadas no ar: um cubo por granada, da cor do tipo, girando.
  const matsGranada = {
    flash: new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    smoke: new THREE.MeshLambertMaterial({ color: 0x8b95a1 }),
    he: new THREE.MeshLambertMaterial({ color: 0x2f5d2f }),
  };
  const geoGranada = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const cubosGranada = [];
  function desenharGranadas(mundo, dt) {
    const lista = mundo.granadas ?? [];
    while (cubosGranada.length < Math.min(lista.length, 16)) {
      const m = new THREE.Mesh(geoGranada, matsGranada.he);
      m.visible = false;
      scene.add(m);
      cubosGranada.push(m);
    }
    cubosGranada.forEach((m, i) => {
      const g = lista[i];
      m.visible = Boolean(g);
      if (!g) return;
      m.material = matsGranada[g.tipo];
      m.position.set(g.pos.x, g.pos.y, g.pos.z);
      m.rotation.x += dt * 9;
      m.rotation.z += dt * 6;
    });
  }

  // Smoke: uma InstancedMesh (1 draw call) com os blocos vivos de todas as nuvens. Nascem do centro,
  // somem nos buracos de tiro/HE e encolhem nos últimos 2 s.
  const MAX_CUBOS_FUMACA = 900;
  const matFumaca = new THREE.MeshLambertMaterial({ color: 0xdde1e6, transparent: true, opacity: 0.9, depthWrite: false });
  const geoFumaca = new THREE.BoxGeometry(1, 1, 1);
  const fumaca = new THREE.InstancedMesh(geoFumaca, matFumaca, MAX_CUBOS_FUMACA);
  fumaca.frustumCulled = false;
  fumaca.count = 0;
  fumaca.renderOrder = 2;
  scene.add(fumaca);
  const m4 = new THREE.Matrix4();
  function desenharFumaca(mundo) {
    let n = 0;
    for (const f of mundo.fumacas ?? []) {
      const idade = mundo.tempo - f.nasceEm;
      const encolhe = Math.min(1, Math.max(0, f.fim - mundo.tempo) / 2);
      for (const c of f.cubos) {
        if (!c.vivo || idade < c.atraso || n >= MAX_CUBOS_FUMACA) continue;
        const k = f.cubo * 1.15 * Math.min(1, (idade - c.atraso) / 0.25) * encolhe;
        m4.makeScale(k, k, k).setPosition(c.x, c.y, c.z);
        fumaca.setMatrixAt(n++, m4);
      }
    }
    fumaca.count = n;
    fumaca.instanceMatrix.needsUpdate = true;
  }

  // Estouro da flash: bloco branco que cresce e some rápido.
  const matBrilho = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const brilho = new THREE.Mesh(geoFogo, matBrilho);
  brilho.visible = false;
  scene.add(brilho);
  let brilhoT = 0;
  const clarearFlash = (ponto) => {
    brilho.position.set(ponto.x, ponto.y, ponto.z);
    brilhoT = 0.3;
    brilho.visible = true;
  };

  function animarEfeitos(dt) {
    animarPecas(dt);
    animarExplosao(dt);
    if (brilhoT > 0) {
      brilhoT -= dt;
      const k = 1 - Math.max(0, brilhoT) / 0.3;
      brilho.scale.setScalar(0.5 + k * 5);
      matBrilho.opacity = Math.max(0, 1 - k);
      if (brilhoT <= 0) brilho.visible = false;
    }
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
    for (const f of fagulhas) {
      if (f.vida <= 0) continue;
      f.vida -= dt;
      f.v.y -= 14 * dt;
      f.m.position.addScaledVector(f.v, dt);
      if (f.vida <= 0) f.m.visible = false;
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
    let pente = null;
    for (const [i, [w, h, d, x, y, z, claro]] of modelo.caixas.entries()) {
      const chave = `${w},${h},${d}`;
      if (!geoArma.has(chave)) geoArma.set(chave, new THREE.BoxGeometry(w, h, d));
      const mat = tipo === 'faca' ? (claro ? matArmaClara : matFaca) : claro ? matArmaClara : matArma;
      const m = new THREE.Mesh(geoArma.get(chave), mat);
      m.position.set(x, y, z);
      g.add(m);
      if (i === modelo.pente) pente = { m, y };
    }
    const boca = new THREE.Mesh(geoClarao, matClarao);
    boca.position.set(0, modelo.caixas[0][4], modelo.boca);
    boca.visible = false;
    g.add(boca);
    g.position.set(POS_VIEW.x, POS_VIEW.y, POS_VIEW.z);
    g.visible = false;
    camera.add(g);
    return { g, boca, pente };
  }

  // Granada na mão: um cubo de 0,05 m da cor do tipo selecionado (o mesmo material da granada no ar).
  const geoGranadaMao = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  function criarViewmodelGranada(sel) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geoGranadaMao, matsGranada[sel] ?? matsGranada.he));
    const boca = new THREE.Mesh(geoClarao, matClarao);
    boca.visible = false;
    g.add(boca);
    g.position.set(POS_VIEW.x, POS_VIEW.y, POS_VIEW.z);
    g.visible = false;
    camera.add(g);
    return { g, boca, pente: null };
  }

  // `chave` é o tipo da arma; a granada ganha um modelo por tipo selecionado (`granada-he`, ...).
  function viewmodelDe(chave) {
    if (!viewmodels.has(chave)) {
      viewmodels.set(chave, chave.startsWith('granada-') ? criarViewmodelGranada(chave.slice(8)) : criarViewmodel(chave));
    }
    return viewmodels.get(chave);
  }

  const flash = () => {
    clarao = DURACAO_CLARAO;
    inspecao = 0; // atirar interrompe a inspeção
  };
  // Animações da arma na mão (tempos em s): saque ao trocar, golpe da faca.
  let saque = 0;
  let saqueDur = 0.3;
  let golpeT = 0;
  let golpeForte = false;
  let golpeLado = 1;
  const golpe = (forte) => {
    golpeForte = forte;
    inspecao = 0;
    golpeT = forte ? 0.45 : 0.3;
    golpeLado = -golpeLado; // golpes leves alternam o lado, como no CS
  };
  let balanco = 0; // amplitude do balanço ao andar (0..1)
  let yawAntes = null;
  let ginga = 0; // a arma atrasa um pouco quando a mira gira
  let pitchAntes = null;
  let gingaV = 0; // e sobe/desce um pouco quando a mira sobe ou desce
  const DUR_INSPECAO = 1.7;
  let inspecao = 0; // F: gira a arma na frente da câmera para admirá-la
  const inspecionar = () => { if (saque <= 0 && golpeT <= 0) inspecao = DUR_INSPECAO; };
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
    if (pitchAntes !== null) {
      gingaV += (Math.max(-0.06, Math.min(0.06, (vista.pitch - pitchAntes) * -2)) - gingaV) * Math.min(1, dt * 12);
    }
    pitchAntes = vista.pitch;
    ry += ginga;
    x -= ginga * 0.3;
    y += gingaV * 0.4;
    rx += gingaV;
    if (!vista.noChao) y += 0.02; // no ar a arma sobe um pouco
    // Recarga: abaixa e gira a arma; volta no fim (curva em seno do progresso).
    if (arma.recarregandoAte > 0) {
      inspecao = 0;
      const def = ARMAS[arma.tipo];
      const p = 1 - Math.max(0, arma.recarregandoAte - mundo.tempo) / def.recarga;
      const k = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
      y -= 0.12 * k;
      rx -= 0.5 * k;
      rz += 0.6 * k;
    }
    const pente = viewAtual.pente;
    if (pente) {
      let dy = 0;
      let visivel = true;
      if (arma.recarregandoAte > 0) {
        const p = 1 - Math.max(0, arma.recarregandoAte - mundo.tempo) / ARMAS[arma.tipo].recarga;
        if (p < 0.3) dy = -(p / 0.3) * 0.28; // pente solta e desce
        else if (p < 0.55) visivel = false; // fora da arma
        else if (p < 0.8) dy = -(1 - (p - 0.55) / 0.25) * 0.28; // pente novo sobe
      }
      pente.m.visible = visivel;
      pente.m.position.y = pente.y + dy;
    }
    if (inspecao > 0) {
      const k = Math.sin(Math.min(1, (DUR_INSPECAO - inspecao) / DUR_INSPECAO) * Math.PI);
      const u = (DUR_INSPECAO - inspecao) / DUR_INSPECAO;
      x -= 0.2 * k;
      y += 0.17 * k;
      z -= 0.05 * k;
      ry += (Math.sin(u * Math.PI * 2) * 0.9 + u * 0.8) * k;
      rx += Math.sin(u * Math.PI * 3) * 0.35 * k;
      rz += 0.5 * k;
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
      fovAtual += (fov - fovAtual) * Math.min(1, dt * VEL_ZOOM);
      if (Math.abs(fov - fovAtual) < 0.3) fovAtual = fov;
      camera.fov = fovAtual;
      camera.updateProjectionMatrix();
    }
    const o = olho(vista);
    // Agachar/levantar suave: a altura do olho persegue o alvo (troca de vista é instantânea).
    const altura = o.y - vista.pos.y;
    if (vistaAntes !== idVista || olhoY === null) olhoY = altura;
    else olhoY += (altura - olhoY) * Math.min(1, dt * VEL_OLHO);
    vistaAntes = idVista;
    // Tremor da explosão: some com a distância e com o tempo.
    let tx = 0;
    let ty = 0;
    if (tremor > 0 && tremorDe) {
      const forca = Math.max(0, 1 - Math.hypot(o.x - tremorDe.x, o.z - tremorDe.z) / 45) * tremor * 0.18;
      tx = (aleatorio() - 0.5) * forca;
      ty = (aleatorio() - 0.5) * forca;
    }
    camera.position.set(o.x + tx, vista.pos.y + olhoY + ty, o.z);
    // C4 no chão: visível solta ou plantada; LED pisca vermelho (verde depois de desarmada).
    const bomba = mundo.bomba;
    c4.visible = Boolean(bomba && bomba.pos);
    if (c4.visible) {
      c4.position.set(bomba.pos.x, bomba.pos.y, bomba.pos.z);
      matLed.color.setHex(bomba.desarmada ? 0x22dd55 : Math.floor(agora / (bomba.plantada ? 250 : 700)) % 2 ? 0xff2020 : 0x550808);
    }
    const subida = vista.vivo && vista.armas ? vista.armas[vista.slot].recuoAcum : 0; // a mira acompanha o spray
    const inclina = vista.pitch + subida + recuo;
    camera.rotation.set(Math.max(-PITCH_CAM, Math.min(PITCH_CAM, inclina)), vista.yaw, 0);
    recuo = Math.max(0, recuo - dt * 0.3);

    // Arma na mão: some com o zoom da sniper (mira de luneta) e sai do campo de visão ao morrer.
    const armaAtiva = vista.vivo && vista.armas ? vista.armas[vista.slot] : null;
    const tipoAtivo = armaAtiva ? armaAtiva.tipo : null;
    const chaveView = tipoAtivo === 'granada' ? `granada-${armaAtiva.sel ?? 'he'}` : tipoAtivo;
    const alvoView = chaveView && zoomFov === undefined ? viewmodelDe(chaveView) : null;
    if (alvoView !== viewAtual) {
      if (viewAtual) viewAtual.g.visible = false;
      // Arma nova (não a mesma voltando do zoom): sobe de baixo da tela durante o saque.
      if (alvoView && chaveView !== tipoAntes) {
        saqueDur = SAQUE[ARMAS[tipoAtivo].slot] ?? 0.3;
        saque = saqueDur;
        golpeT = 0;
        inspecao = 0;
      }
      viewAtual = alvoView;
      if (viewAtual) viewAtual.g.visible = true;
    }
    if (chaveView) tipoAntes = chaveView;
    clarao = Math.max(0, clarao - dt);
    recuoArma = Math.max(0, recuoArma - dt * 0.6);
    saque = Math.max(0, saque - dt);
    inspecao = Math.max(0, inspecao - dt);
    golpeT = Math.max(0, golpeT - dt);
    animarEfeitos(dt);
    desenharGranadas(mundo, dt);
    desenharFumaca(mundo);
    if (viewAtual) posarArma(vista, mundo, dt);
    luzTiro.intensity = clarao > 0 ? 2 : 0;
    luzTiro.position.copy(camera.position);
    renderer.render(scene, camera);
  }

  // Fundo do menu: um boneco parado no spawn A e a câmera indo e voltando devagar na frente dele.
  let vitrine = null;
  function desenharVitrine(time = 'azul', tipo = 'rifle') {
    if (!vitrine || vitrine.time !== time) {
      if (vitrine) scene.remove(vitrine.g);
      vitrine = { ...criarAvatar({ time }), time };
      vitrine.g.position.set(0, 0, 24);
      vitrine.g.rotation.y = -0.7; // em 3/4, virado para o centro da tela: a arma aparece de lado
    }
    if (vitrine.tipo !== tipo) armarAvatar(vitrine, tipo);
    const t = performance.now() / 1000;
    const a = Math.sin(t * 0.25) * 0.5;
    // Idle do menu: respira, olha em volta e passa o peso de uma perna para a outra.
    respirar(vitrine, t);
    vitrine.cabeca.rotation.y = Math.sin(t * 0.45) * 0.35;
    vitrine.g.rotation.z = Math.sin(t * 0.8) * 0.015;
    const p = vitrine.g.position;
    camera.position.set(p.x - Math.sin(a) * 3, 1.5, p.z - Math.cos(a) * 3);
    camera.lookAt(p.x, 1.1, p.z);
    camera.rotateY(0.3); // boneco à direita da tela, painel do menu à esquerda
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
    for (const m of marcasSite) { m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); }
    [geoC4, geoLed, geoFogo, geoFaisca].forEach((g) => g.dispose());
    [matC4, matLed, matFogo, matFaisca, matFumaca, matBrilho, ...Object.values(matsGranada)].forEach((m) => m.dispose());
    [geoGranada, geoGranadaMao, geoFumaca].forEach((g) => g.dispose());
    fumaca.dispose();
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
    desenhar, redimensionar, impacto, limparImpactos, flash, recuoVisual, golpe, rastro, sangue, fagulhasCapacete, desmanchar,
    explosao, clarao: clarearFlash, inspecionar, desenharVitrine, destruir,
  };
}
