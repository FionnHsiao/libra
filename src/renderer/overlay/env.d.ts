export interface OverlayApi {
  ready(): void
  measure(height: number): void
  select(id: string): void
  close(): void
  onData(callback: (payload: { items: import('../../shared/protocol').OverlayItem[]; width: number }) => void): () => void
}

declare global {
  interface Window {
    overlayApi: OverlayApi
  }
}

export {}