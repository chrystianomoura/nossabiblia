import { useId, useState } from 'react';

// Campo de formulário da conta: rótulo visível, erro ligado ao campo (aria-describedby) e aria-invalid.
export function Field({ label, error, inputRef, ...props }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        ref={inputRef}
        className={`auth-input${error ? ' has-error' : ''}`}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errId : undefined}
        {...props}
      />
      {error && <p className="auth-error" id={errId}>{error}</p>}
    </div>
  );
}

// Senha com botão "Mostrar": no celular, digitar duas vezes sem ver o que escreve é a maior fonte de erro.
export function PasswordField({ label, error, inputRef, ...props }) {
  const id = useId();
  const errId = `${id}-err`;
  const [shown, setShown] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          id={id}
          ref={inputRef}
          type={shown ? 'text' : 'password'}
          className={`auth-input${error ? ' has-error' : ''}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errId : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...props}
        />
        <button type="button" className="auth-toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
          {shown ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error && <p className="auth-error" id={errId}>{error}</p>}
    </div>
  );
}
