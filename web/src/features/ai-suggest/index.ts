// Public API of the ai-suggest feature. The shared FieldControl mounts SuggestButton when a call site passes a
// FieldSuggestContext; the button self-hides when AI assist is off for the workspace.

export { SuggestButton } from './components/SuggestButton';
export type { FieldSuggestContext, FieldSuggestion, FieldSuggestionRequest } from './types';
