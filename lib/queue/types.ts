export type QueueDirection = 'to_user' | 'to_builder'

export type QueueMessageType = 'question' | 'answer' | 'progress' | 'complete' | 'error' | 'secret_request' | 'secret_response'

export interface QueueMessage {
  id: string
  build_id: string
  direction: QueueDirection
  msg_type: QueueMessageType
  payload: Record<string, unknown>
  read: boolean
  created_at: number
}

export interface QuestionPayload {
  question: string
  context?: string
}

export interface AnswerPayload {
  answer: string
}

export interface ProgressPayload {
  step: string
  detail?: string
  percent?: number
}

export interface CompletePayload {
  capability_id: string
  capability_name: string
  summary: string
}

export interface ErrorPayload {
  error: string
  recoverable: boolean
}

export interface SecretRequestPayload {
  name: string
  description: string
}

export interface SecretResponsePayload {
  name: string
  saved: boolean
}
