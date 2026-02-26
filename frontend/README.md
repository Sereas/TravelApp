# TravelApp Frontend

Next.js 14 Web app (App Router) for trip planning. Uses TypeScript, Tailwind CSS, and a shadcn/ui–style component set with design tokens.

---

## Structure

| Path                        | Purpose                                                                        |
| --------------------------- | ------------------------------------------------------------------------------ |
| `src/app/`                  | App Router: `layout.tsx`, `page.tsx`, `globals.css`. Routes and global layout. |
| `src/components/layout/`    | PageShell, SiteHeader. Wraps all pages.                                        |
| `src/components/ui/`        | Button, Card, Input, Label. Shared primitives (design tokens).                 |
| `src/components/trips/`     | TripCard. Trip list items.                                                     |
| `src/components/locations/` | LocationRow. Location list rows.                                               |
| `src/components/feedback/`  | EmptyState, ErrorBanner, LoadingSpinner. Empty/error/loading states.           |
| `src/lib/`                  | `utils.ts` (e.g. `cn()` for class names).                                      |
| `src/test/`                 | Vitest setup (`setup.ts`).                                                     |

---

## Scripts

| Command              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Start dev server (http://localhost:3000). |
| `npm run build`      | Production build.                         |
| `npm run start`      | Run production server (after `build`).    |
| `npm run lint`       | ESLint + Prettier check.                  |
| `npm run lint:fix`   | ESLint --fix + Prettier write.            |
| `npm run typecheck`  | `tsc --noEmit`.                           |
| `npm run test`       | Vitest run.                               |
| `npm run test:watch` | Vitest watch.                             |

---

## Design system

- **Tokens:** `src/app/globals.css` (CSS variables), `tailwind.config.ts` (Tailwind theme).
- **Components:** Use `@/components/ui` and pattern components (`TripCard`, `LocationRow`, `EmptyState`, etc.) so UI stays consistent.
- Full reference: [docs/design/design-system-web.md](../docs/design/design-system-web.md) in the repo root.

---

## Environment

For local dev, optional env (e.g. in `.env.local`):

- `NEXT_PUBLIC_API_URL` — Backend API base URL (for future API client).
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — For Supabase Auth (when added).

Not required for the current stub home page.
