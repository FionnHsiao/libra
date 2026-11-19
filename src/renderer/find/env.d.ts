export interface FindApi {
  query(text: string, forward: boolean, mode: 'new' | 'next'): void
  close(): void
  onResult(callback: (result: { active: number; matches: number }) => void): () => void
}

declare global {
  interface Window {
    findApi: FindApi
  }
}

export {}
