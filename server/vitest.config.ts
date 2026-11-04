import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Testes de integração com sockets reais e partidas inteiras: 5 s é pouco quando vários rodam em paralelo.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
