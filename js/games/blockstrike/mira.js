/**
 * Block Strike — mira configurável (Crosshair Lab): estilo, tamanho, espessura, abertura, ponto e cor.
 * Módulo puro: valida o que vem do storage; o desenho é CSS (ver `.bs-mira` em blockstrike.css).
 */

export const ESTILOS_MIRA = [
  ['dinamica', 'Dinâmica'], ['estatica', 'Estática'], ['classica', 'Aberta clássica'], ['ponto', 'Só o ponto'],
];
// Limites dos sliders em px: [mínimo, máximo, passo].
export const LIMITES_MIRA = { tamanho: [2, 20, 1], espessura: [1, 6, 1], abertura: [0, 14, 1] };
export const MIRA_PADRAO = { estilo: 'dinamica', tamanho: 8, espessura: 2, abertura: 4, ponto: false, cor: '#4ade80' };
// Aberta clássica: a estática com um vão largo e fixo no meio.
const ABERTURA_CLASSICA = 6;
const COR = /^#[0-9a-f]{6}$/i;

const inteiro = (v, [min, max], padrao) => (Number.isFinite(Number(v)) ? Math.max(min, Math.min(max, Math.round(Number(v)))) : padrao);

// `bruto` é o objeto salvo (ou lixo); `corLegada` é a cor da versão antiga, que só tinha 5 cores fixas.
export function lerMira(bruto, corLegada) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  const cor = [b.cor, corLegada].find((c) => typeof c === 'string' && COR.test(c)) ?? MIRA_PADRAO.cor;
  return {
    estilo: ESTILOS_MIRA.some(([v]) => v === b.estilo) ? b.estilo : MIRA_PADRAO.estilo,
    tamanho: inteiro(b.tamanho, LIMITES_MIRA.tamanho, MIRA_PADRAO.tamanho),
    espessura: inteiro(b.espessura, LIMITES_MIRA.espessura, MIRA_PADRAO.espessura),
    abertura: inteiro(b.abertura, LIMITES_MIRA.abertura, MIRA_PADRAO.abertura),
    ponto: typeof b.ponto === 'boolean' ? b.ponto : MIRA_PADRAO.ponto,
    cor: cor.toLowerCase(),
  };
}

// Vão do centro até cada braço (px): a dinâmica soma o spread da arma; as outras ficam paradas.
export function aberturaMira(mira, extraSpread) {
  if (mira.estilo === 'classica') return mira.abertura + ABERTURA_CLASSICA;
  return mira.abertura + (mira.estilo === 'dinamica' ? extraSpread : 0);
}
