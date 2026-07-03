// Data hooks for the current user. useMe drives the shell (memberships, platform-admin);
// useUpdateTheme persists the theme preference server-side so it roams across devices.

import { useMutation, useQuery } from '@tanstack/react-query';
import type { MeDto, ThemePreference } from '@shared/types';

import { fetchMe, updateTheme } from './api';

export const ME_QUERY_KEY = ['users', 'me'] as const;

export function useMe() {
  return useQuery<MeDto>({
    queryKey: ME_QUERY_KEY,
    queryFn: ({ signal }) => fetchMe(signal),
  });
}

export function useUpdateTheme() {
  return useMutation<void, Error, ThemePreference>({
    mutationFn: (theme) => updateTheme(theme),
  });
}
