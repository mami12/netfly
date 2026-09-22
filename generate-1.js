const fs = require('fs');
const path = require('path');

const write = (filePath, content) => {
  const fullPath = path.join(__dirname, 'client', filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content.trim() + '\n');
};

const packageJson = `{
  "name": "netfly-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "lucide-react": "^0.294.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.0"
  }
}`;

const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});`;

const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        secondary: '#1e293b',
        tertiary: '#334155',
        'accent-green': '#10b981',
        'accent-red': '#ef4444',
        'accent-yellow': '#f59e0b',
        'accent-blue': '#3b82f6',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
      }
    },
  },
  plugins: [],
}`;

const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Netfly Sport</title>
  </head>
  <body class="bg-primary text-text-primary min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .animate-flash-green {
    animation: flashGreen 1s ease-out;
  }
  .animate-flash-red {
    animation: flashRed 1s ease-out;
  }
}

@keyframes flashGreen {
  0% { background-color: #10b981; }
  100% { background-color: transparent; }
}
@keyframes flashRed {
  0% { background-color: #ef4444; }
  100% { background-color: transparent; }
}`;

write('package.json', packageJson);
write('vite.config.ts', viteConfig);
write('tailwind.config.js', tailwindConfig);
write('postcss.config.js', postcssConfig);
write('index.html', indexHtml);
write('src/index.css', indexCss);
write('src/main.tsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);`);

write('src/App.tsx', `import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { BetslipProvider } from './context/BetslipContext';
import LoginPage from './pages/LoginPage';
import SportsbookPage from './pages/SportsbookPage';
import AdminPage from './pages/AdminPage';
import MyBetsPage from './pages/MyBetsPage';

const ProtectedRoute = ({ children, requireAdmin = false }: { children: JSX.Element, requireAdmin?: boolean }) => {
  const { user, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  if (requireAdmin && user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  if (!requireAdmin && user?.role === 'ADMIN') return <Navigate to="/admin" replace />;

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><SportsbookPage /></ProtectedRoute>} />
      <Route path="/match/:id" element={<ProtectedRoute><SportsbookPage /></ProtectedRoute>} />
      <Route path="/my-bets" element={<ProtectedRoute><MyBetsPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute>} />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <BetslipProvider>
            <AppRoutes />
          </BetslipProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}`);

console.log('Setup basic configs done');
