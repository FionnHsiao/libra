import type { LibraApi } from '../../shared/protocol'

declare global {
  interface Window {
    libra: LibraApi
  }
}

export {}