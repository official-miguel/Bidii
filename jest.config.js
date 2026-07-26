/** @type {import('jest').Config} */
const config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testMatch: ["**/src/__tests__/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    // Resolve @/ path aliases defined in tsconfig.json
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react",
          esModuleInterop: true,
        },
      },
    ],
  },
};

module.exports = config;
