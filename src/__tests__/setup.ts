// Mock Tauri's invoke so unit tests don't need a running Tauri process
import { vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))
