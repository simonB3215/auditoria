import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true, isolatedModules: true }],
  },
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/loadEnv.ts"],
  testTimeout: 30000,
  // Los módulos 2 y 4 crean/verifican tenants reales contra Supabase y
  // encolan jobs en Redis; correrlos en serie evita carreras entre tests
  // que comparten organizaciones/activos de prueba.
  maxWorkers: 1,
};

export default config;
