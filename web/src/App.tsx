// App root — providers (query + auth), router, and the app shell. The McDermott design-system
// CSS is imported once here: base tokens (mws/styles.css), the token override layer
// (mws/tokens.css), then the app-shell layer (mws/app-shell.css).

import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/shared/auth/AuthProvider';
import { AppShell } from '@/shared/components/Layout/AppShell';
import { NAV_SECTIONS } from '@/shared/components/Layout/navItems';
import { queryClient } from '@/shared/queryClient';
import { HomePage } from '@/pages/HomePage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

import '@/mws/styles.css';
import '@/mws/tokens.css';
import '@/mws/app-shell.css';

const PLACEHOLDER_ROUTES = NAV_SECTIONS.flatMap((section) => section.items).filter(
  (item) => item.to !== '/',
);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              {PLACEHOLDER_ROUTES.map((item) => (
                <Route key={item.to} path={item.to} element={<PlaceholderPage title={item.label} />} />
              ))}
              <Route path="*" element={<PlaceholderPage title="Page not found" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
