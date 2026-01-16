# poyo.client

**The React Client for Poyo Framework**

This directory contains the source code for the frontend application, built with **React 19**, **TypeScript**, and **Vite**. It is designed to work seamlessly with the .NET Server via a Multi-Page Application (MPA) architecture.

---

## 🏗️ Project Structure

The project follows a feature-based structure designed for scalability and type safety.

```bash
src/
├── pages/              # 📄 Application Pages (One per route)
│   └── [Feature]/
│       └── index.page.tsx  # The page component
├── hooks/              # 🎣 Custom Hooks
│   ├── use-page.ts     # The MOST IMPORTANT hook (Server Data)
│   └── ...
├── hooks-api/          # ⚡ Data Fetching (TanStack Query)
│   ├── auth/           # Auth-related mutations/queries
│   └── index.ts        # Central export
├── services/           # 🌐 API Services (Axios)
│   └── auth.service.ts
├── providers/          # 🧱 Context Providers
│   ├── auth-provider.tsx
│   └── theme-provider.tsx
├── schemas/            # 🛡️ Generated Validation Schemas
│   ├── dtos.generated.ts        # From Server OpenAPI
│   └── validations.generated.ts # Zod Schemas
└── lib/                # 🛠️ Utilities
    ├── http/           # Axios instance configuration
    └── react-query/    # QueryClient configuration
```

---

## 🔑 Key Concepts

### 1. Server Data Injection (`usePage`)

**Stop making API calls for initial data!**
In Poyo, the server injects data directly into the HTML when the page loads. This is faster (no waterfalls) and SEO-friendly.

**How to use it:**

```typescript
import { usePage } from "@/hooks/use-page";

// 1. Define the shape of data you expect from the server
interface DashboardData {
    userName: string;
    notifications: number;
}

export default function DashboardPage() {
    // 2. Get the data (It's already there!)
    const data = usePage<DashboardData>();

    if (!data) return <div>Loading...</div>;

    return <h1>Welcome back, {data.userName}!</h1>;
}
```

> **Note:** The server must populate `ViewBag.ServerData` for this to work.

### 2. Client-Side Routing? No.

**Poyo is an MPA.** Usage of `react-router` is **NOT** supported for top-level navigation.
- **Navigation**: Standard `<a href="/path">` links trigger a full page load (browser navigation).
- **Why?** This allows the server to handle routing, auth checks, and data injection for every page.

### 3. Adding New Routes

Routes are managed at the **Root** level of the repository.

**DO NOT** manually create files in `src/pages` unless you know what you are doing.

Run this command from the **Root Directory** (parent of this folder):
```bash
npm run route:add User/Settings
```
This will:
1. Update `routes.json`
2. Create `src/pages/User/Settings/index.page.tsx`
3. Create the corresponding Razor view on the server

### 4. API Integration (TanStack Query)

All async data fetching (after initial load) should use **TanStack Query**.

**Example:**
```typescript
// src/hooks-api/your-feature.ts
export function useUpdateProfile() {
    return useMutation({
        mutationFn: (data: ProfileDto) => api.post('/api/profile', data)
    });
}
```

### 5. Type Safety & Code Gen

We generate TypeScript types directly from the Server's OpenAPI spec.

1. Ensure the server is running.
2. Run `npm run generate` in this directory.
3. Import types from `@/schemas/dtos.generated`.

---

## 📜 Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Vite development server (HMR enabled). |
| `npm run build` | Builds the application for production ( outputs to `dist/`). |
| `npm run generate` | Runs both DTO and Zod schema generation. |
| `npm run lint` | Runs Biome linting. |
| `npm run format` | Runs Biome formatting. |

---

## 🎨 Styling

We use **Tailwind CSS v4**.
- No `tailwind.config.js` (configured in CSS).
- No generic UI libraries (e.g. MUI, AntD).
- We use a custom set of headless components powered by **Radix UI** semantics where necessary.

---

## ⚠️ Important Rules

1.  **Strict TypeScript**: No `any`.
2.  **No Component Libraries**: Build what you need with Tailwind.
3.  **Validate Everything**: Use Zod for all forms and unknown data inputs.
