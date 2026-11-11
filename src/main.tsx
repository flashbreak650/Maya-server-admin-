import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled UI Error caught by RootErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    localStorage.removeItem('wg_ui_lang');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#f5f7f6',
          fontFamily: 'Inter, "Hind Siliguri", system-ui, sans-serif',
          color: '#1c3027'
        }}>
          <div style={{
            maxWidth: '480px',
            width: '100%',
            background: '#ffffff',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            border: '1px solid #e9efeb',
            textAlign: 'center'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: '#fff0ef',
              color: '#d94e50',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: 'bold',
              marginBottom: '16px'
            }}>
              ⚠️
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>
              অ্যাপ রেন্ডারে সমস্যা হয়েছে (UI Error)
            </h2>
            <p style={{ fontSize: '12px', color: '#64766b', lineHeight: 1.6, marginBottom: '16px' }}>
              {this.state.error?.message || 'একটি অপ্রত্যাশিত সমস্যা দেখা দিয়েছে। নিচের বাটনে ক্লিক করে রিলোড দিন।'}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: '#087f55',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🔄 Reload App
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  background: '#f3f8f5',
                  color: '#087f55',
                  border: '1px solid #c3e6d5',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Reset Settings
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
