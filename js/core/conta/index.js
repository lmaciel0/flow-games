/**
 * Serviço de conta: estado da sessão, sync do progresso local no login,
 * limpeza no logout, registro de eventos de jogo e leitura do placar.
 * Nenhum método público lança; os assíncronos nunca rejeitam.
 * A instância real só toca a rede depois de `conta.iniciar()`.
 */

import { cliente as clienteReal } from './cliente.js';
import * as storageReal from '../storage.js';
import { SUPABASE_URL } from './config.js';
import { validarUsuario, validarSenha } from './validar.js';
import { normalizar } from './progresso.js';
import {
  ICONES, codificarIcone, codificarFoto, decodificarAvatar, redimensionarFoto,
} from './avatar.js';

// Chaves locais (escopo `arcade:`) de cada jogo que entra no progresso da conta.
const CHAVE_TERMO = 'termo:stats';
const CHAVE_2048 = 'game2048:recorde';
const CHAVE_SNAKE = 'snake:recorde';
const CHAVE_TETRIS = 'tetris:recorde';
const CHAVE_MINAS = 'minesweeper:recordes';
const CHAVE_VELHA = 'tictactoe:vitorias';
const CHAVE_BS_VITORIAS = 'blockstrike:vitorias';
const CHAVE_BS_PARTIDAS = 'blockstrike:partidas';
const CHAVE_BS_KD = 'blockstrike:melhorKD';
// id da conta dona do progresso local ('' = progresso anônimo).
const CHAVE_DONO = 'conta:dono';

const ERRO_GENERICO = 'Algo deu errado. Tente novamente em instantes.';
const ERRO_NAO_LOGADO = 'Entre na sua conta para continuar.';
const ERRO_SENHA_VAZIA = 'Digite a senha.';
const ERRO_AVATAR = 'Escolha um avatar.';
const ERRO_ICONE = 'Escolha um dos ícones disponíveis.';
const ERRO_FOTO = 'Não foi possível usar essa imagem.';
const AVISO_FOTO = 'Conta criada, mas a foto não pôde ser enviada.';

function falha(erro) {
  return { ok: false, erro };
}

// Montada sem o cliente porque `cliente.urlFoto` é assíncrono e a UI precisa
// do avatar na hora de desenhar.
function urlFotoPublica(userId, versao) {
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/`
    + `${encodeURIComponent(userId)}/avatar?v=${encodeURIComponent(versao)}`;
}

// Embrulha um método assíncrono para nunca rejeitar.
function seguro(fn, reserva) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch {
      return reserva();
    }
  };
}

export function criarConta({ cliente, storage, redimensionar = redimensionarFoto }) {
  let pronto = false;
  let usuario = null;
  let inicio = null;
  // Operações do próprio serviço em andamento: eventos de sessão vindos do
  // cliente nesse meio-tempo são ecos delas e são ignorados.
  let ocupado = 0;
  // Muda a cada login/logout; uma abertura de sessão atropelada não grava nada.
  let geracao = 0;
  const assinantes = new Set();

  function estado() {
    return { pronto, logado: usuario !== null, usuario: usuario ? { ...usuario } : null };
  }

  function assinar(fn) {
    if (typeof fn !== 'function') return () => {};
    const embrulho = (evento) => fn(evento);
    assinantes.add(embrulho);
    return () => { assinantes.delete(embrulho); };
  }

  function emitir(evento) {
    const e = typeof evento === 'string' ? { tipo: evento } : evento;
    for (const fn of [...assinantes]) {
      try { fn(e); } catch { /* assinante com erro não derruba os outros */ }
    }
  }

  function emitirTodos(tipos) {
    for (const tipo of tipos) emitir({ tipo });
  }

  function lerLocal() {
    const minas = storage.get(CHAVE_MINAS, {});
    return normalizar({
      termo: storage.get(CHAVE_TERMO, { wins: 0, streak: 0 }),
      game2048: storage.get(CHAVE_2048, 0),
      snake: storage.get(CHAVE_SNAKE, 0),
      tetris: storage.get(CHAVE_TETRIS, 0),
      velha: storage.get(CHAVE_VELHA, 0),
      minas,
      blockstrike: {
        vitorias: storage.get(CHAVE_BS_VITORIAS, 0),
        partidas: storage.get(CHAVE_BS_PARTIDAS, 0),
        melhorKD: storage.get(CHAVE_BS_KD, 0),
      },
    });
  }

  function gravarLocal(progresso) {
    const p = normalizar(progresso);
    storage.set(CHAVE_TERMO, p.termo);
    storage.set(CHAVE_2048, p.game2048);
    storage.set(CHAVE_SNAKE, p.snake);
    storage.set(CHAVE_TETRIS, p.tetris);
    storage.set(CHAVE_VELHA, p.velha);
    storage.set(CHAVE_MINAS, p.minas);
    storage.set(CHAVE_BS_VITORIAS, p.blockstrike.vitorias);
    storage.set(CHAVE_BS_PARTIDAS, p.blockstrike.partidas);
    storage.set(CHAVE_BS_KD, p.blockstrike.melhorKD);
  }

  function limparLocal() {
    geracao++;
    usuario = null;
    gravarLocal(null);
    storage.set(CHAVE_DONO, '');
  }

  function sairLocal() {
    limparLocal();
    emitirTodos(['sessao', 'progresso']);
  }

  // Carrega o perfil, sincroniza e devolve os eventos a emitir (null se não abriu).
  async function abrirSessao(id, reserva = {}) {
    const minha = ++geracao;
    const p = await cliente.perfil(id);
    if (minha !== geracao) return null;
    const dados = p?.ok && p.dados ? p.dados : null;
    if (!dados && !reserva.username) return null;
    usuario = {
      id,
      username: dados?.username ?? reserva.username,
      avatar: dados?.avatar ?? reserva.avatar ?? codificarIcone(ICONES[0]),
    };
    // Progresso de outra conta (ex.: restauração que falhou sem `sair`): zera antes do sync.
    const dono = storage.get(CHAVE_DONO, '');
    const zerou = dono !== '' && dono !== id;
    if (zerou) gravarLocal(null);
    // Aparelho já ligado a esta conta: o servidor manda (lê sem enviar o local), para uma
    // correção feita na conta valer. Progresso anônimo (dono vazio): junta, vale o melhor.
    const doServidor = dono === id;
    storage.set(CHAVE_DONO, id);
    const s = await cliente.sincronizar(doServidor ? normalizar(null) : lerLocal());
    if (minha !== geracao) return null;
    if (!s?.ok || !s.dados) return zerou ? ['sessao', 'progresso'] : ['sessao'];
    gravarLocal(s.dados);
    return ['sessao', 'progresso'];
  }

  async function concluirLogin(id, reserva) {
    // Outra conta neste aparelho: o progresso dela não pode ir para esta.
    const trocou = usuario !== null && usuario.id !== id;
    if (trocou) limparLocal();
    const eventos = (await abrirSessao(id, reserva)) ?? ['sessao'];
    if (trocou && !eventos.includes('progresso')) eventos.push('progresso');
    emitirTodos(eventos);
    return usuario?.id === id ? { ok: true } : falha(ERRO_GENERICO);
  }

  // { icone } vira o código; { arquivo } é redimensionado antes de qualquer rede.
  async function prepararAvatar(avatar) {
    if (typeof avatar?.icone === 'string') {
      return ICONES.includes(avatar.icone) ? { codigo: codificarIcone(avatar.icone) } : { erro: ERRO_ICONE };
    }
    if (avatar?.arquivo) {
      try {
        return { blob: await redimensionar(avatar.arquivo) };
      } catch (e) {
        return { erro: e instanceof Error && e.message ? e.message : ERRO_FOTO };
      }
    }
    return { erro: ERRO_AVATAR };
  }

  async function aoMudarSessao(sessao) {
    if (ocupado > 0) return;
    const id = sessao?.id ?? null;
    if (id === (usuario?.id ?? null)) return;
    if (!id) {
      sairLocal();
      return;
    }
    ocupado++;
    try {
      await concluirLogin(id, {});
    } finally {
      ocupado--;
    }
  }

  function iniciar() {
    if (!inicio) {
      inicio = (async () => {
        await Promise.resolve();
        let eventos = ['sessao'];
        ocupado++;
        try {
          const s = await cliente.sessaoAtual();
          if (s?.ok && s.dados?.id) eventos = (await abrirSessao(s.dados.id)) ?? ['sessao'];
          await cliente.aoMudarSessao((sessao) => aoMudarSessao(sessao).catch(() => {}));
        } catch { /* sem sessão restaurada */ } finally {
          ocupado--;
        }
        pronto = true;
        emitirTodos(eventos);
      })();
    }
    return inicio;
  }

  async function entrar(nome, senha) {
    // Só o formato do usuário: a regra de 6 caracteres não trava contas antigas.
    const erro = validarUsuario(nome) ?? (typeof senha === 'string' && senha ? null : ERRO_SENHA_VAZIA);
    if (erro) return falha(erro);
    ocupado++;
    try {
      const r = await cliente.entrar(nome, senha);
      if (!r?.ok) return falha(r?.erro ?? ERRO_GENERICO);
      return await concluirLogin(r.dados.id, { username: nome });
    } finally {
      ocupado--;
    }
  }

  // Cadastro que falhou com sessão aberta (conta sem perfil) é desfeito.
  async function desfazerOrfa() {
    const s = await cliente.sessaoAtual();
    const orfa = s?.ok ? Boolean(s.dados?.id) && s.dados.id !== usuario?.id : usuario === null;
    if (!orfa) return;
    await cliente.sair();
    if (usuario) sairLocal();
  }

  async function criar(nome, senha, avatar) {
    const erro = validarUsuario(nome) ?? validarSenha(senha);
    if (erro) return falha(erro);
    const prep = await prepararAvatar(avatar);
    if (prep.erro) return falha(prep.erro);
    ocupado++;
    try {
      const inicial = prep.codigo ?? codificarIcone(ICONES[0]);
      const r = await cliente.cadastrar(nome, senha, inicial);
      if (!r?.ok) {
        await desfazerOrfa();
        return falha(r?.erro ?? ERRO_GENERICO);
      }
      const id = r.dados.id;
      let final = inicial;
      let aviso = null;
      if (prep.blob) {
        const codigo = codificarFoto();
        const envio = await cliente.enviarFoto(id, prep.blob);
        const troca = envio?.ok ? await cliente.trocarAvatar(codigo) : envio;
        if (troca?.ok) final = codigo;
        else aviso = AVISO_FOTO;
      }
      const res = await concluirLogin(id, { username: nome, avatar: final });
      return res.ok && aviso ? { ...res, aviso } : res;
    } finally {
      ocupado--;
    }
  }

  async function sair() {
    ocupado++;
    try {
      await cliente.sair();
    } catch { /* o local é apagado mesmo assim */ } finally {
      ocupado--;
    }
    sairLocal();
  }

  async function trocarAvatar(avatar) {
    if (!usuario) return falha(ERRO_NAO_LOGADO);
    const prep = await prepararAvatar(avatar);
    if (prep.erro) return falha(prep.erro);
    const id = usuario.id;
    let codigo = prep.codigo;
    if (prep.blob) {
      const envio = await cliente.enviarFoto(id, prep.blob);
      if (!envio?.ok) return falha(envio?.erro ?? ERRO_GENERICO);
      codigo = codificarFoto();
    }
    const r = await cliente.trocarAvatar(codigo);
    if (!r?.ok) return falha(r?.erro ?? ERRO_GENERICO);
    if (usuario?.id === id) {
      usuario = { ...usuario, avatar: codigo };
      emitir({ tipo: 'sessao' });
    }
    return { ok: true };
  }

  function registrar(jogo, evento) {
    if (!usuario) return;
    try {
      Promise.resolve(cliente.registrar(jogo, evento)).catch(() => {});
    } catch { /* fire-and-forget */ }
  }

  async function lerPlacar(jogo, limite = 50) {
    const r = await cliente.lerPlacar(jogo, limite);
    if (!r?.ok) return null;
    const meuId = usuario?.id ?? null;
    const linhas = (r.dados?.linhas ?? []).map((l) => ({ ...l, eu: meuId !== null && l.userId === meuId }));
    let eu = linhas.find((l) => l.eu) ?? null;
    if (!eu && meuId) {
      const m = await cliente.minhaPosicao(jogo);
      if (m?.ok && m.dados && m.dados.userId === meuId) eu = { ...m.dados, eu: true };
    }
    return { linhas, eu };
  }

  function avatarVisual(avatar, userId) {
    const a = decodificarAvatar(avatar);
    if (a.tipo === 'foto' && typeof userId === 'string' && userId) {
      return { url: urlFotoPublica(userId, a.versao) };
    }
    return { emoji: a.tipo === 'icone' ? a.emoji : ICONES[0] };
  }

  return {
    estado,
    assinar,
    emitir,
    iniciar,
    criarConta: seguro(criar, () => falha(ERRO_GENERICO)),
    entrar: seguro(entrar, () => falha(ERRO_GENERICO)),
    sair: seguro(sair, () => undefined),
    trocarAvatar: seguro(trocarAvatar, () => falha(ERRO_GENERICO)),
    registrar,
    lerPlacar: seguro(lerPlacar, () => null),
    avatarVisual,
  };
}

export const conta = criarConta({ cliente: clienteReal, storage: storageReal });
