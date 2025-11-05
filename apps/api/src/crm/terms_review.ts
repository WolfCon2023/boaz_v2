import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { getDb } from '../db.js'
import { sendAuthEmail } from '../auth/email.js'

export type CustomTermsDoc = {
  _id: ObjectId
  name: string
  description?: string
  content: string
  isDefault?: boolean
  accountIds?: ObjectId[]
  isActive?: boolean
  createdAt: Date
  updatedAt: Date
}

export type TermsReviewRequestDoc = {
  _id: ObjectId
  termsId: ObjectId
  termsName: string
  accountId?: ObjectId
  contactId?: ObjectId
  recipientEmail: string
  recipientName?: string
  senderId?: string
  senderEmail?: string
  senderName?: string
  status: 'pending' | 'viewed' | 'approved' | 'rejected'
  customMessage?: string
  reviewToken: string
  sentAt: Date
  viewedAt?: Date
  respondedAt?: Date
  responseNotes?: string
  createdAt: Date
  updatedAt: Date
}

export const termsReviewRouter = Router()

// GET /api/terms/review/:token (public endpoint - no auth required)
termsReviewRouter.get('/review/:token', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const { token } = req.params
    const request = await db.collection('terms_review_requests').findOne({ reviewToken: token }) as TermsReviewRequestDoc | null
    
    if (!request) {
      return res.status(404).json({ data: null, error: 'review_request_not_found' })
    }
    
    // Get terms content
    const terms = await db.collection<CustomTermsDoc>('custom_terms').findOne({ _id: request.termsId })
    if (!terms) {
      return res.status(404).json({ data: null, error: 'terms_not_found' })
    }
    
    // Mark as viewed if still pending
    if (request.status === 'pending') {
      await db.collection('terms_review_requests').updateOne(
        { _id: request._id },
        { $set: { status: 'viewed', viewedAt: new Date(), updatedAt: new Date() } }
      )
    }
    
    res.json({ 
      data: { 
        request: {
          ...request,
          status: request.status === 'pending' ? 'viewed' : request.status,
          viewedAt: request.status === 'pending' ? new Date() : request.viewedAt
        },
        terms: {
          _id: terms._id,
          name: terms.name,
          description: terms.description,
          content: terms.content,
        }
      }, 
      error: null 
    })
  } catch (err: any) {
    console.error('Get review by token error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_get_review' })
  }
})

// POST /api/terms/review/:token/respond (public endpoint - no auth required)
termsReviewRouter.post('/review/:token/respond', async (req, res) => {
  const db = await getDb()
  if (!db) return res.status(500).json({ data: null, error: 'db_unavailable' })
  
  try {
    const { token } = req.params
    const { action, notes, signerName } = req.body || {} // action: 'approve' | 'reject'
    
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ data: null, error: 'invalid_action' })
    }
    
    const request = await db.collection('terms_review_requests').findOne({ reviewToken: token }) as TermsReviewRequestDoc | null
    
    if (!request) {
      return res.status(404).json({ data: null, error: 'review_request_not_found' })
    }
    
    if (request.status === 'approved' || request.status === 'rejected') {
      return res.status(400).json({ data: null, error: 'already_responded' })
    }
    
    // Update request
    const now = new Date()
    await db.collection('terms_review_requests').updateOne(
      { _id: request._id },
      { 
        $set: { 
          status: action === 'approve' ? 'approved' : 'rejected',
          respondedAt: now,
          responseNotes: notes?.trim() || undefined,
          updatedAt: now,
        } 
      }
    )
    
    // Send notification email to sender
    if (request.senderEmail) {
      try {
        const terms = await db.collection<CustomTermsDoc>('custom_terms').findOne({ _id: request.termsId })
        await sendAuthEmail({
          to: request.senderEmail,
          subject: `Terms Review ${action === 'approve' ? 'Approved' : 'Rejected'}: ${terms?.name || request.termsName}`,
          checkPreferences: true,
          html: `
            <h2>Terms Review ${action === 'approve' ? 'Approved' : 'Rejected'}</h2>
            <p>The terms and conditions review request has been ${action === 'approve' ? 'approved' : 'rejected'} by ${signerName || request.recipientName || request.recipientEmail}.</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Terms:</strong> ${terms?.name || request.termsName}</p>
              <p><strong>Recipient:</strong> ${request.recipientName || request.recipientEmail}</p>
              ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
              <p><strong>Status:</strong> ${action === 'approve' ? '✅ Approved' : '❌ Rejected'}</p>
            </div>
          `,
          text: `
Terms Review ${action === 'approve' ? 'Approved' : 'Rejected'}

The terms and conditions review request has been ${action === 'approve' ? 'approved' : 'rejected'} by ${signerName || request.recipientName || request.recipientEmail}.

Terms: ${terms?.name || request.termsName}
Recipient: ${request.recipientName || request.recipientEmail}
${notes ? `Notes: ${notes}` : ''}
Status: ${action === 'approve' ? 'Approved' : 'Rejected'}
          `,
        })
      } catch (emailErr) {
        console.error('Failed to send notification email:', emailErr)
      }
    }
    
    res.json({ data: { message: `Terms review ${action === 'approve' ? 'approved' : 'rejected'} successfully` }, error: null })
  } catch (err: any) {
    console.error('Respond to review error:', err)
    res.status(500).json({ data: null, error: err.message || 'failed_to_respond' })
  }
})

