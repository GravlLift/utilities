/* eslint-disable */
import type { Config } from 'jest';

const config: Config = {
  displayName: 'libs/utilities',
  testEnvironment: 'node',
  rootDir: '.',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/libs/utilities',
  moduleNameMapper: {
    '^@gravllift/halo-helpers$': '<rootDir>/../halo-helpers/src/index.ts',
    '^@gravllift/utilities$': '<rootDir>/src/index.ts',
  },
};

export default config;
