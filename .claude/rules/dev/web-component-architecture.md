# Component Architecture

- One component per file; filename matches the component name (PascalCase).
- Keep components small and single-responsibility.
- Separate concerns: data fetching in hooks or parent containers, pure rendering in presentational components.
- Colocate related files: `ComponentName/index.tsx`, `ComponentName.module.css`, `ComponentName.test.tsx`.
- Export components as named exports; use default exports only at page/route boundaries.
- Avoid prop drilling beyond 2 levels — use Context or lift state appropriately.
- Prefer React Compiler for automatic memoization. When React Compiler is not available, `React.memo` and `useCallback` must always be used together on list-item components. Define the component as a named const first, then export the memoised version for DevTools compatibility.
- Private sub-components used only within one parent file may be defined in the same file above the main export.
- Use `crypto.randomUUID()` for client-side ID generation. Do not install `uuid`, `nanoid`, or similar libraries.
- Enumerable UI options that drive a rendered list (e.g. filter buttons) must be defined as a typed module-level constant, not inline JSX.
- Components must not exceed 200 lines (excluding imports and type definitions). A component approaching this limit is a signal to extract a sub-component or a custom hook. Page/route components that compose multiple feature components may extend to 250 lines with a justification comment, but no further.
- Every component that loads remote data must render all three non-data states explicitly: a **loading** indicator (skeleton or spinner), an **error** state with a user-actionable message (not a raw error string), and an **empty** state when the data is present but contains no items. A component that renders nothing — or renders stale data — while loading, failing, or returning empty results is incomplete.

## useEffect & Cleanup

- Event listeners (`addEventListener`), subscriptions, and timers (`setInterval`, `setTimeout`) added in `useEffect` must be cleaned up in the return function.
- Store interval/timeout IDs so they can be cleared on unmount.
- `fetch` calls in `useEffect` must use `AbortController` to cancel in-flight requests when the component unmounts or dependencies change. When a dependency changes and triggers a new fetch, the previous response must be ignored.
- Avoid stale closures in event handlers and callbacks — use refs (`useRef`) or functional state updates (`setState(prev => ...)`) when the callback needs the latest value.
- Inside any async callback (including async `useEffect` bodies and event handlers), capture all props, route params, and context values into local `const` variables **before** the first `await`. Referencing `props.id` or `params.id` after an `await` reads a potentially stale or updated value if the component re-rendered during the async operation. This is a [BLOCKER] in code review.

  ```ts
  // ✅ correct — values captured before await
  useEffect(() => {
    const id = params.id;
    const signal = abortRef.current.signal;
    (async () => {
      const data = await fetchRecord(id, { signal });
      // use `data` — safe
    })();
  }, [params.id]);
  ```

## Rendering Performance

- `useEffect`, `useCallback`, and `useMemo` must list all referenced variables in their dependency arrays. Never suppress the exhaustive-deps lint rule without a documented reason.
- Values that can be computed from existing state/props must be calculated inline during render, not synced via `useEffect` (no derived-state-in-effect).
- Do not pass inline object or array literals as JSX props (e.g. `style={{...}}`, `options={[...]}`). Extract to a module-level constant or memoize with `useMemo`. React Compiler handles this automatically when enabled.
