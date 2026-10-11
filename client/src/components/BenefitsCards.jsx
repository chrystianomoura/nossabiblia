import React from 'react';
import { Bookmark, TrendingUp, ShieldCheck } from 'lucide-react';

export default function BenefitsCards() {
  const benefits = [
    {
      icon: <Bookmark size={18} strokeWidth={2.2} />,
      title: 'Marcações & Notas',
      description: 'Destaque versículos em cores suaves e guarde suas reflexões íntimas.',
    },
    {
      icon: <TrendingUp size={18} strokeWidth={2.2} />,
      title: 'Progresso diário',
      description: 'Acompanhe seu hábito diário de leitura com histórico sincronizado em qualquer dispositivo.',
    },
    {
      icon: <ShieldCheck size={18} strokeWidth={2.2} />,
      title: 'Leitura sem distrações',
      description: 'Sem anúncios, sem interrupções, apenas o texto bíblico.',
    },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
    }}>
      {benefits.map((b, idx) => (
        <div
          key={idx}
          style={{
            padding: '12px 18px',
            borderRadius: '16px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-light)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
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
          }}>
            {b.icon}
          </div>
          <div>
            <h4 style={{
              fontSize: '14.5px',
              fontWeight: '600',
              color: 'var(--text-main)',
              lineHeight: '1.25',
              marginBottom: '3px',
            }}>
              {b.title}
            </h4>
            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: '1.4',
              textWrap: 'pretty',
            }}>
              {b.description}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
