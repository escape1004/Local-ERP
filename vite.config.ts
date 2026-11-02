import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { builtinModules } from 'module';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (mode === 'preload') {
    return {
      publicDir: false,
      build: {
        outDir: 'dist-electron-app',
        lib: {
          entry: {
            preload: path.resolve(__dirname, 'src/main/preload.ts'),
            'browser-preload': path.resolve(__dirname, 'src/main/browser-preload.ts'),
          },
          formats: ['cjs'],
          fileName: (_format, entryName) => `${entryName}.js`,
        },
        rollupOptions: {
          external: [
            'electron',
            ...builtinModules,
          ],
          output: {
            entryFileNames: '[name].js',
          },
        },
        emptyOutDir: false,
      },
    };
  }

  return {
    server: {
      port: 5174,
      strictPort: true,
    },
    plugins: [
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: process.env.VITE_DEV_SERVER_URL ? '/' : './',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: '.',  // 루트에 에셋 파일 생성
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
        },
      }
    },
    optimizeDeps: {
      exclude: ['electron']
    }
  };
});
