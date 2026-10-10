import pool from './db.js';

/**
 * Keep-alive ping inteligente para evitar a suspensão do Neon (cold start).
 * Executa um ping leve (SELECT 1) a cada 4 minutos entre 06:00 e 23:00 (horário de São Paulo).
 * De madrugada (23:00 às 06:00), deixa o banco dormir para economizar horas de computação.
 */
export function startKeepAlive() {
  const PING_INTERVAL_MS = 4 * 60 * 1000; // 4 minutos (Neon suspende aos 5 min)

  async function ping() {
    try {
      // Pega a hora atual no fuso de São Paulo
      const spTimeStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: 'numeric',
        hour12: false,
      }).format(new Date());

      const hour = parseInt(spTimeStr, 10);

      // Horário ativo: 06:00 até 23:00
      if (hour >= 6 && hour < 23) {
        await pool.query('SELECT 1;');
        // Log sutil apenas em debug
      }
    } catch (err) {
      console.warn('Falha temporária no keep-alive ping:', err.message);
    }
  }

  // Agenda intervalo
  const intervalId = setInterval(ping, PING_INTERVAL_MS);
  // Executa uma vez no início
  ping();

  return () => clearInterval(intervalId);
}
