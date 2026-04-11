# Dashboard Architecture

Technical reference for `packages/dashboard` (Next.js frontend).

## File Structure

```
packages/dashboard/src/
├── app/
│   ├── layout.tsx              # Root HTML layout, fonts, metadata
│   ├── globals.css             # Tailwind imports + theme CSS variables
│   ├── login/
│   │   └── page.tsx            # Login (outside auth guard)
│   └── (dashboard)/            # Route group — all authenticated pages
│       ├── layout.tsx          # Wraps children in Auth + Store + Theme providers + Shell
│       ├── page.tsx            # Dashboard home (stats + charts)
│       ├── orders/page.tsx     # Orders list + detail panel
│       ├── chats/page.tsx      # WhatsApp-style inbox
│       ├── products/page.tsx   # Odoo product table
│       ├── customers/page.tsx  # Customer cards
│       ├── whatsapp/page.tsx   # Evolution instance manager
│       ├── reports/page.tsx    # Detailed statistics
│       └── settings/page.tsx   # Theme, logo, printer, store info
├── components/
│   ├── sidebar.tsx             # Collapsible dark sidebar
│   ├── header.tsx              # Header with store selector
│   ├── shell.tsx               # Layout wrapper (sidebar + header + main)
│   └── stat-card.tsx           # Reusable KPI card
└── lib/
    ├── api.ts                  # HTTP client with JWT
    ├── auth.tsx                # Auth context + provider
    ├── store.tsx               # Current store context + provider
    ├── theme.tsx               # Theme context (color + logo)
    └── printer.ts              # Bluetooth + ESC/POS
```

## Routing

Uses the Next.js App Router with a **route group** `(dashboard)` that doesn't affect URLs but provides a shared layout and auth guard.

```
/ → app/(dashboard)/page.tsx      → Home
/orders → app/(dashboard)/orders/page.tsx
/login → app/login/page.tsx       ← outside the group, no auth
```

The `(dashboard)/layout.tsx` wraps all children with `<AuthProvider>`, `<StoreProvider>`, `<ThemeProvider>` and `<Shell>`. The shell shows the sidebar and header, and redirects to `/login` if the user isn't authenticated.

## Auth flow

1. User opens any `(dashboard)` route
2. `AuthProvider` reads `token` from `localStorage`
3. If present, calls `GET /api/v1/auth/me` with the token
4. If valid, sets the user in context; otherwise clears token and redirects
5. Login page calls `POST /api/v1/auth/login`, stores token, pushes to `/`

Dev mode: if the token is literally `"dev-token"`, the provider reads the user from a `dev-user` localStorage entry without hitting the API. Used for local development before auth was built.

## State management

Three React contexts, all client-side:

### `AuthContext` (`lib/auth.tsx`)
- `user` — current user or null
- `loading` — initial load flag
- `login(email, password)`
- `logout()`

### `StoreContext` (`lib/store.tsx`)
- `currentStore` — selected store
- `stores` — list from the user
- `selectStore(store)` — persists to localStorage

### `ThemeContext` (`lib/theme.tsx`)
- `theme` — `{ primaryColor, logoUrl }`
- `setTheme(partial)` — merges and applies to DOM CSS vars

No Redux, Zustand, or similar. Pages do their own data fetching with `useEffect`.

## Theming

The primary color is a **CSS custom property**, not a Tailwind class. When the user picks a color in settings:

1. `setTheme({ primaryColor: "#ec4899" })` is called
2. `applyThemeToDOM()` converts hex → HSL
3. Sets CSS variables on `:root`:
   - `--primary: #ec4899`
   - `--primary-dark: hsl(...)` (10% darker)
   - `--primary-light: hsl(..., 95% lightness)`
   - `--sidebar-bg: hsl(...)` (very dark version)
   - And more
4. Components use classes like `bg-primary`, `bg-primary-dark`, `text-primary` which are defined in `globals.css` to reference the variables

This means color changes are instant, no rebuild, and work on any component that uses the theme classes.

## API client

`lib/api.ts` wraps `fetch` with:
- Base URL from `NEXT_PUBLIC_API_URL` (baked at Docker build time)
- Automatic JWT Authorization header
- 401 → clear token + redirect to login
- JSON serialization
- Query param helper

```ts
const orders = await api.get<Order[]>(
  `/api/v1/stores/${storeId}/orders`,
  { status: "pending", limit: "50" }
);
```

## Data fetching pattern

Each page does its own fetching in `useEffect`. No SWR, TanStack Query, or similar:

```tsx
const { currentStore } = useStore();
const [orders, setOrders] = useState<Order[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  setLoading(true);
  api.get<Order[]>(`/api/v1/stores/${currentStore?.id}/orders`)
    .then(setOrders)
    .catch(() => setOrders([]))
    .finally(() => setLoading(false));
}, [currentStore?.id]);
```

When/if the app gets more complex, we can introduce a query library. For now it's fine.

## Build

```bash
cd packages/dashboard
npm run build   # Next.js standalone build
```

The `Dockerfile` uses multi-stage:
1. **builder** stage: `npm ci` + `next build` (emits `.next/standalone`)
2. **runner** stage: copies standalone output only, runs `node server.js`

Resulting image is ~150 MB. Runtime port is 3000.

The **`NEXT_PUBLIC_API_URL`** is injected via `ARG` in the Dockerfile with a default of `https://api.leofarmacia.com`. This is critical because Next.js inlines `NEXT_PUBLIC_*` vars at build time, not runtime.
