import { invoke } from '@tauri-apps/api/core'

export type RuntimeConfig = {
  llamaBinaryPath: string
  whisperBinaryPath: string
  llamaModelPath: string
  whisperModelPath: string
  contextSize: number
  threads: number
  gpuLayers: number
  host: string
  port: number
}

export type RuntimeStatus = {
  llamaRunning: boolean
  whisperRunning: boolean
  lastError: string | null
}

export const getRuntimeConfig = () =>
  invoke<RuntimeConfig>('get_runtime_config')

export const setRuntimeConfig = (config: RuntimeConfig) =>
  invoke<RuntimeConfig>('set_runtime_config', { config })

export const getRuntimeStatus = () =>
  invoke<RuntimeStatus>('get_runtime_status')

export const startLlama = () => invoke<RuntimeStatus>('start_llama')

export const startWhisper = () => invoke<RuntimeStatus>('start_whisper')

export const stopAllRuntimes = () =>
  invoke<RuntimeStatus>('stop_all_runtimes')

export const transcribeAudio = async (
  blob: Blob,
  extension = 'webm',
): Promise<string> => {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  let binary = ''
  bytes.forEach((value) => {
    binary += String.fromCharCode(value)
  })
  const audioBase64 = btoa(binary)

  return invoke<string>('transcribe_audio', {
    audioBase64,
    extension,
  })
}

export const writeWorklogFile = (
  dateKey: string,
  content: string,
  outputDir?: string,
) =>
  invoke<string>('write_worklog_file', {
    dateKey,
    content,
    outputDir,
  })

export const organizeNoteWithRuntime = (input: string) =>
  invoke<string>('organize_note_with_runtime', { input })
