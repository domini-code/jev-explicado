import { readFileSync } from 'node:fs'

import {
  AuthenticationError,
  choice,
  noul,
  RateLimitError,
  score,
  TypeSafeClient,
  type ChoiceResponse,
  type NoulResponse,
} from '@typesafe-ai/sdk'

type Comment = { id: number; text: string }

// 1 · Un solo cliente, con la versión fijada: los umbrales se calibran contra un modelo concreto.
const client = new TypeSafeClient({ defaultModel: 'jev-1.13.0' })

// 2 · Fan-out: cuatro preguntas en UNA llamada. Las que no apliquen, el código las ignora.
//     Preguntas en inglés (idioma principal del modelo); el comentario va en castellano.
const questions = {
  kind: choice('What is `comment`, left under a programming video on YouTube?', {
    question: { what: 'Asks for technical help or reports a problem', not_for: 'Asking for a future video' },
    video_request: { what: 'Asks the creator to make a future video on a topic', not_for: 'Asking for help now' },
    spam: { what: 'Promotes money, followers, links or products unrelated to the video' },
    criticism: { what: 'Disagrees with or criticises the video or the creator' },
    thanks: { what: 'Thanks the creator or praises the video, and nothing else' },
  }),
  urgency: score('How soon should the creator reply to `comment`?', [
    'No reply needed',
    'Reply this week',
    'Reply today',
    'Reply now: the viewer is blocked on a deadline',
  ]),
  asksVideo: noul('Does `comment` ask for a future video on a specific topic?'),
  insults: noul('Does `comment` insult or harass a person?'),
}

// 3 · La política vive en el código. Umbral más alto para lo que tiene más riesgo (ocultar).
const LABELS: Record<string, string> = {
  question: 'duda técnica',
  video_request: 'petición de vídeo',
  spam: 'spam',
  criticism: 'crítica',
  thanks: 'agradecimiento',
}

function gap(kind: ChoiceResponse): number {
  const [first = 0, second = 0] = Object.values(kind.probabilities).sort((a, b) => b - a)
  return first - second
}

function decide(kind: ChoiceResponse, urgency: number, asksVideo: NoulResponse, insults: NoulResponse): string {
  if (insults.noul >= 0.65) return '👤 revisión humana (posible insulto)'
  if (kind.choice === 'spam') return kind.confidence >= 0.9 ? '🗑️  ocultar' : '👤 revisión humana (¿spam?)'
  if (gap(kind) < 0.15 || kind.confidence < 0.8) return '🤖 a un LLM o a una persona (dudoso)'
  if (kind.choice === 'question') return urgency >= 1.5 ? '⚡ responder hoy' : '💬 responder esta semana'
  if (asksVideo.noul >= 0.65) return '💡 guardar como idea de vídeo'
  return '✅ nada que hacer'
}

// 4 · El bucle: una llamada por comentario
const comments: Comment[] = JSON.parse(readFileSync('comentarios.json', 'utf8'))

let inputTokens = 0
const times: number[] = []
const actions = new Map<string, number>()

for (const comment of comments) {
  const start = performance.now()
  try {
    const { answers, model, usage } = await client.systemOne({ state: { comment: comment.text }, questions })
    const ms = performance.now() - start
    times.push(ms)
    inputTokens += usage.input_tokens

    const { kind, urgency, asksVideo, insults } = answers
    const action = decide(kind, urgency.score, asksVideo, insults)
    const key = action.split(' (')[0]!
    actions.set(key, (actions.get(key) ?? 0) + 1)

    console.log(`\n#${comment.id}  "${comment.text.slice(0, 70)}${comment.text.length > 70 ? '…' : ''}"`)
    console.log(
      `    ${LABELS[kind.choice]} · confidence ${kind.confidence.toFixed(2)} · urgencia ${urgency.score.toFixed(2)}` +
        ` · pide vídeo ${asksVideo.noul.toFixed(2)} · insulto ${insults.noul.toFixed(2)}`
    )
    console.log(`    → ${action}   (${model} · ${Math.round(ms)} ms)`)
  } catch (error) {
    if (error instanceof AuthenticationError) throw new Error('401: revisa TYPESAFE_API_KEY en .env')
    if (error instanceof RateLimitError) {
      console.log(`#${comment.id}  429 tras los reintentos del SDK: lo dejo para luego`)
      continue
    }
    throw error
  }
}

// 5 · Resumen: qué ha decidido el código, cuánto ha tardado y cuánto ha costado
const cost = (inputTokens / 1_000_000) * 0.042 // solo se factura la entrada
const sorted = [...times].sort((a, b) => a - b)
const median = sorted[Math.floor(sorted.length / 2)] ?? 0
const total = times.reduce((a, b) => a + b, 0)

console.log('\n──────── resumen ────────')
for (const [action, n] of actions) console.log(`${String(n).padStart(2)} × ${action}`)
console.log(`\n${comments.length} comentarios · 4 preguntas cada uno · ${comments.length} llamadas`)
console.log(`tiempo total: ${Math.round(total)} ms · mediana por comentario: ${Math.round(median)} ms`)
console.log(`coste: $${cost.toFixed(6)} (${inputTokens} tokens de entrada)`)
