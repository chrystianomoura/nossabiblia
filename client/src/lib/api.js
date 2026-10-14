// Endereço da API. Em desenvolvimento fica vazio: as chamadas são relativas (`/api/...`) e o proxy do Vite as leva ao servidor
// local. Publicado, o site (nossabiblia.party) e a API (api.nossabiblia.party) ficam em endereços diferentes: o build define
// VITE_API_URL (por exemplo, https://api.nossabiblia.party), sem barra no fim.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path) => `${BASE}${path}`;
