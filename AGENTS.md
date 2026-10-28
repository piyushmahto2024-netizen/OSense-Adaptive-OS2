<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- All OS simulation logic lives in `src/lib/osense/` as pure, framework-free TypeScript (scheduling, memory, page replacement, adaptive engine, rng, export, history). UI components in `src/components/osense/` only call these modules — never put algorithm logic in components. Why: the engine is unit-tested in `src/test/osense-*.test.ts` and must stay testable without a DOM.
- Experiment history persists in `localStorage` via `src/lib/osense/history.ts` (key `osense2-history`, max 50 records); there is no backend. Why: the app is fully client-side by design.
- The app is dark-only; `:root` and `.dark` in `src/styles.css` must stay identical. Why: the console theme is the single visual identity.
