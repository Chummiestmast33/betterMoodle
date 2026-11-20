import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider } from '@fluentui/react-components';
import App from './App';
import { ThemeModeProvider, useThemeMode } from './lib/theme';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      refetchOnWindowFocus: false,
    },
  },
});

function ThemedRoot() {
  const { theme } = useThemeMode();
  return (
    <FluentProvider theme={theme} style={{ minHeight: '100vh' }}>
      <App />
    </FluentProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeModeProvider>
        <ThemedRoot />
      </ThemeModeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
