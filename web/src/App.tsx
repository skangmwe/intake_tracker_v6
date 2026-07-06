// App root — providers (query + auth), router, and the app shell. The McDermott design-system
// CSS is imported once here: base tokens (mws/styles.css), the token override layer
// (mws/tokens.css), then the app-shell layer (mws/app-shell.css).

import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from '@/shared/auth/AuthProvider';
import { AppShell } from '@/shared/components/Layout/AppShell';
import { NAV_SECTIONS } from '@/shared/components/Layout/navItems';
import { queryClient } from '@/shared/queryClient';
import {
  AnnouncementDetailPage,
  AnnouncementsListPage,
  ManageAnnouncementsPage,
} from '@/features/announcements';
import { FieldsAdminPage, PlatformFieldsPage } from '@/features/fields';
import { AddToCatalogPage, FeatureCatalogPage, FeatureDetailPage } from '@/features/features';
import { LifecyclePage } from '@/features/lifecycle';
import {
  DraftsPage,
  IntakeFormPage,
  RecordDetailPage,
  RequestsListPage,
} from '@/features/requests';
import { SearchResultsPage } from '@/features/search';
import { HomePage } from '@/pages/HomePage';
import { PlaceholderPage } from '@/pages/PlaceholderPage';

import '@/mws/styles.css';
import '@/mws/tokens.css';
import '@/mws/app-shell.css';
import '@/features/announcements/announcements.css';
import '@/features/fields/fields.css';
import '@/features/lifecycle/lifecycle.css';
import '@/features/requests/requests.css';
import '@/features/features/features.css';
import '@/features/saved-views/savedViews.css';
import '@/features/search/search.css';

// Routes implemented by real feature surfaces; excluded from the placeholder fallback.
const IMPLEMENTED_ROUTES = new Set([
  '/admin/fields',
  '/admin/lifecycle',
  '/admin/announcements',
  '/requests',
  '/feature-catalog',
]);

const PLACEHOLDER_ROUTES = NAV_SECTIONS.flatMap((section) => section.items).filter(
  (item) => item.to !== '/' && !IMPLEMENTED_ROUTES.has(item.to),
);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/admin/fields" element={<FieldsAdminPage />} />
              <Route path="/admin/lifecycle" element={<LifecyclePage />} />
              <Route path="/platform/fields" element={<PlatformFieldsPage />} />
              <Route path="/requests" element={<RequestsListPage />} />
              <Route path="/requests/new" element={<IntakeFormPage />} />
              <Route path="/requests/:recordId" element={<RecordDetailPage />} />
              <Route path="/drafts" element={<DraftsPage />} />
              <Route path="/feature-catalog" element={<FeatureCatalogPage />} />
              <Route path="/feature-catalog/new" element={<AddToCatalogPage />} />
              <Route path="/feature-catalog/:recordId" element={<FeatureDetailPage />} />
              <Route path="/search" element={<SearchResultsPage />} />
              <Route path="/announcements" element={<AnnouncementsListPage />} />
              <Route path="/announcements/:id" element={<AnnouncementDetailPage />} />
              <Route path="/admin/announcements" element={<ManageAnnouncementsPage />} />
              {PLACEHOLDER_ROUTES.map((item) => (
                <Route
                  key={item.to}
                  path={item.to}
                  element={<PlaceholderPage title={item.label} />}
                />
              ))}
              <Route path="*" element={<PlaceholderPage title="Page not found" />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
