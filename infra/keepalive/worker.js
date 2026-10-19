// Mantém a API (Render, plano gratuito) acordada: ela dorme depois de 15 min sem pedidos e a primeira visita seguinte leva ~50 s.
// Roda a cada 10 min por um gatilho agendado (cron) do Cloudflare Workers, de graça. Chama só o /healthz, que não consulta o banco: não gasta a
// cota da Neon. Ligada o mês todo, a API usa ~744 das 750 horas gratuitas da Render (por isso nenhum outro serviço gratuito no mesmo espaço da Render).
export default {
  async scheduled() {
    const res = await fetch('https://api.nossabiblia.party/healthz', { headers: { 'User-Agent': 'nossabiblia-keepalive' } });
    console.log(`healthz ${res.status}`);
  },
};
