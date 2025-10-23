import express from 'express'
import cors from 'cors'
import { env } from './env'
import { createHealthResponse } from '@boaz/shared'
import { authRouter } from './auth/routes'
import { getDb } from './db'

const app = express()
app.use(cors({ origin: env.ORIGIN, credentials: true }))
app.use(express.json())
app.use('/auth', authRouter)

app.get('/health', (_req, res) => {
  res.json(createHealthResponse('api'))
})

// Simple metrics placeholder; replace with real queries when DB is connected
app.get('/api/metrics/summary', async (_req, res) => {
  try {
    const db = await getDb()
    if (!db) {
      return res.json({ data: { appointmentsToday: 0, tasksDueToday: 0, tasksCompletedToday: 0 }, error: null })
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    const appointmentsToday = await db.collection('appointments').countDocuments({ startsAt: { $gte: today, $lt: tomorrow } })
    const tasksDueToday = await db.collection('tasks').countDocuments({ dueAt: { $gte: today, $lt: tomorrow }, status: { $ne: 'done' } })
    const tasksCompletedToday = await db.collection('tasks').countDocuments({ status: 'done', completedAt: { $gte: today, $lt: tomorrow } })

    res.json({ data: { appointmentsToday, tasksDueToday, tasksCompletedToday }, error: null })
  } catch (e) {
    res.status(500).json({ data: null, error: 'metrics_error' })
  }
})

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.PORT}`)
})


