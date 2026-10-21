/**
 * Configuração pública do Supabase. A chave é a publishable (vai para o
 * navegador de qualquer jeito); o acesso real é limitado pelas policies RLS.
 * Nunca coloque aqui uma chave service_role/secret.
 */

export const SUPABASE_URL = 'https://jylkqxmfbjrtnuwqcmry.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_HBlH4B7IInOCfptFks2oFg_rYrbC7Ja';

// Domínio do e-mail sintético `<usuario>@<domínio>` (o Supabase Auth exige e-mail).
// example.com é reservado (RFC 2606) e aceito pelo Supabase.
export const DOMINIO_EMAIL = 'example.com';
