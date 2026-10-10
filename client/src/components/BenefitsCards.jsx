import React from 'react';
import { Bookmark, TrendingUp, EyeOff } from 'lucide-react';

export default function BenefitsCards() {
  const benefits = [
    {
      icon: <Bookmark size={18} strokeWidth={2} />,
      title: 'Marcações & Notas',
      description: 'Destaque versículos em cores suaves e guarde suas reflexões íntimas.',
    },
    {
      icon: <TrendingUp size={18} strokeWidth={2} />,
      title: 'Progresso Diário',
      description: 'Acompanhe seu hábito de leitura com histórico contínuo em qualquer aparelho.',
    },
    {
      icon: <EyeOff size={18} strokeWidth={2} />,
      title: '100% Livre de Distrações',
      description: 'Sem anúncios, sem redes sociais, pura imersão editorial.',
    },
  ];

  return (
    <div style={{ marginTop: '32px' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '20px',
      }}>
        {benefits.map((b, idx) => (
          <div
            key={idx}
            style={{
              padding: '16px 20px',
              borderRadius: '16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)';
              e.currentTarget.style.transform = 'translateX(3px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-light)';
              e.currentTarget.style.transform = 'translateX(0)';
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'var(--gold-soft-bg)',
              color: 'var(--gold-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: '2px',
            }}>
              {b.icon}
            </div>
            <div>
              <h4 style={{
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--text-main)',
                marginBottom: '2px',
              }}>
                {b.title}
              </h4>
              <p style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: '1.45',
              }}>
                {b.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Botão de Criação de Conta Gratuita */}
      <button
        onClick={() => alert('O fluxo de cadastro será construído na próxima fase de Autenticação!')}
        style={{
          width: '100%',
          padding: '14px 24px',
          borderRadius: '30px',
          background: 'var(--btn-dark)',
          color: 'var(--btn-dark-text)',
          fontSize: '14px',
          fontWeight: '600',
          transition: 'all 0.2s',
          border: '1px solid var(--border-strong)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.92';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        Criar Conta Gratuita
      </button>
    </div>
  );
}
