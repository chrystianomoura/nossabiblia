import { Component } from 'react';

// Rede de segurança na raiz: se qualquer tela quebrar ao desenhar (dado inesperado da API, por exemplo), a pessoa vê esta mensagem com saídas,
// e não uma página em branco. Fica acima de tudo (até da barra), por isso não usa nada que possa ser justamente o que quebrou.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="auth-page error-screen">
        <main className="auth-main">
          <div className="auth-col">
            <div className="auth-card">
              <h1 className="auth-title">Algo deu errado</h1>
              <p className="auth-lead">Ocorreu um erro inesperado. Recarregar a página costuma resolver.</p>
              <button type="button" className="btn-primary auth-submit" onClick={() => window.location.reload()}>Recarregar</button>
              <p className="auth-alt"><a className="auth-link" href="/">Ir para o início</a></p>
            </div>
          </div>
        </main>
      </div>
    );
  }
}
