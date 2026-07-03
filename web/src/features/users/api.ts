// Users feature API calls — GET /users/me and POST /users/me/theme (api-contracts.md §1).

import type { MeDto, ThemePreference } from '@shared/types';

import { apiFetch } from '@/shared/http/apiClient';

export function fetchMe(signal?: AbortSignal): Promise<MeDto> {
  return apiFetch<MeDto>('/v1/users/me', signal ? { signal } : {});
}

export function updateTheme(theme: ThemePreference): Promise<void> {
  return apiFetch<void>('/v1/users/me/theme', { method: 'POST', body: { theme } });
}
