// Public API of the ai-config feature. The shell reads the config query hook to gate the Ask entry;
// the admin page is routed at /admin/ai.

export { AiSettingsPage } from './components/AiSettingsPage';
export { AiConfigPanel } from './components/AiConfigPanel';
export { useAiConfig } from './aiConfigModel';
