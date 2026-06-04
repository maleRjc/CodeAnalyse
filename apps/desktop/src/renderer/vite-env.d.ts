/// <reference types="vite/client" />

import type { RuanzhuApi } from '../shared/api';

declare global {
  interface Window {
    ruanzhu: RuanzhuApi;
  }
}

export {};
