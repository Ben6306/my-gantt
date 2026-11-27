import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages는 /my-gantt/ 하위 경로에서 열리므로 자산 경로를 상대 경로로 만든다
  base: './',
});
