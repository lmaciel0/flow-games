/**
 * Validações puras de cadastro/login. Devolvem a mensagem de erro em pt-BR
 * ou `null` quando o valor é válido. Espelham as regras do banco
 * (profiles.username ~ '^[A-Za-z0-9_]{3,16}$') e do Supabase Auth (senha >= 6).
 */

import { DOMINIO_EMAIL } from './config.js';

const PADRAO_USUARIO = /^[A-Za-z0-9_]{3,16}$/;
const SENHA_MINIMA = 6;

export function validarUsuario(texto) {
  const usuario = typeof texto === 'string' ? texto : '';
  if (usuario.length < 3 || usuario.length > 16) {
    return 'O nome de usuário precisa ter de 3 a 16 caracteres.';
  }
  if (!PADRAO_USUARIO.test(usuario)) {
    return 'Use só letras sem acento, números e _ no nome de usuário.';
  }
  return null;
}

export function validarSenha(texto) {
  const senha = typeof texto === 'string' ? texto : '';
  if (senha.length < SENHA_MINIMA) {
    return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  }
  return null;
}

// Minúsculas: o nome é único sem diferenciar maiúsculas, então "Lucas" e
// "lucas" precisam cair no mesmo e-mail.
export function emailSintetico(usuario) {
  return `${String(usuario).toLowerCase()}@${DOMINIO_EMAIL}`;
}
