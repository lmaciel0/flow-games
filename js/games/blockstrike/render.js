/**
 * Block Strike — render Three.js (único módulo que importa Three.js).
 * Mapa em uma BufferGeometry só (uma draw call) e bonecos de blocos sob demanda.
 */

import * as THREE from '../../vendor/three.module.min.js';
import { olho } from './fisica.js';

const FOV_PADRAO = 75;
const COR_CABECA = 0xf5cd30;
const COR_TIME = { azul: 0x2f6fde, laranja: 0xf08a24 };

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
  };
  const mat = {
    cabeca: new THREE.MeshLambertMaterial({ color: COR_CABECA }),
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

  // Efeitos: marcas de impacto (pool pequeno), clarão do cano e recuo da câmera.
  const geoImpacto = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const matImpacto = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const impactos = [];
  let proxImpacto = 0;
  const luzTiro = new THREE.PointLight(0xffd070, 0, 12);
  scene.add(luzTiro);
  let clarao = 0;
  let recuo = 0;

  function impacto(ponto, normal) {
    if (impactos.length < 24) {
      const m = new THREE.Mesh(geoImpacto, matImpacto);
      scene.add(m);
      impactos.push({ m, ttl: 0 });
    }
    const i = impactos[proxImpacto % impactos.length];
    proxImpacto += 1;
    i.m.position.set(ponto.x + normal.x * 0.02, ponto.y + normal.y * 0.02, ponto.z + normal.z * 0.02);
    i.m.visible = true;
    i.ttl = 8;
  }
  const flash = () => { clarao = 1; };
  const recuoVisual = () => { recuo = 0.04; };

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
    camera.position.set(o.x, o.y, o.z);
    camera.rotation.set(vista.pitch + recuo, vista.yaw, 0);
    recuo = Math.max(0, recuo - dt * 0.3);

    clarao = Math.max(0, clarao - dt * 20);
    luzTiro.intensity = clarao * 2;
    luzTiro.position.copy(camera.position);
    for (const i of impactos) {
      if (i.ttl > 0) {
        i.ttl -= dt;
        if (i.ttl <= 0) i.m.visible = false;
      }
    }
    renderer.render(scene, camera);
  }

  function destruir() {
    observador.disconnect();
    geoMapa.dispose();
    matMapa.dispose();
    geoImpacto.dispose();
    matImpacto.dispose();
    Object.values(geo).forEach((g) => g.dispose());
    Object.values(mat).forEach((m) => m.dispose());
    avatares.clear();
    renderer.dispose();
  }

  return { desenhar, redimensionar, impacto, flash, recuoVisual, destruir };
}
