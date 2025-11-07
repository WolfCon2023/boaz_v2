import { getDb } from '../src/db.js'

async function main() {
  const db = await getDb()
  if (!db) {
    console.error('Database not available')
    process.exit(1)
  }

  // Check if article already exists
  const existing = await db.collection('kb_articles').findOne({
    title: { $regex: /document.*deletion/i }
  })

  if (existing) {
    console.log('KB article about document deletion already exists')
    return
  }

  const article = {
    title: 'Document Deletion Process',
    body: `# Document Deletion Process

## Overview
Documents in the Documents & Files app cannot be deleted by regular users. Only administrators have the ability to delete documents. This policy helps maintain data integrity and prevents accidental loss of important files.

## How to Request Document Deletion

If you need to delete a document, please follow these steps:

1. **Navigate to the Documents & Files app** in the CRM suite
2. **Locate the document** you wish to delete
3. **Click the "Request Deletion" button** (or similar option) on the document
4. **A helpdesk ticket will be automatically created** with the following information:
   - Document name and ID
   - Document category
   - Document owner
   - Number of versions
   - Your name and email as the requester

5. **An administrator will review your request** and process it accordingly

## What Happens After You Submit a Request

- A helpdesk ticket is created with ticket number #XXXXX
- The ticket is assigned to the support team
- An administrator will review the request
- You will be notified when the deletion is processed or if additional information is needed

## Important Notes

- **Document deletion is permanent** - once deleted, documents and all their versions cannot be recovered
- **Only administrators can delete documents** - this ensures proper oversight and prevents accidental data loss
- **Checkout status** - if a document is currently checked out, it may need to be checked in before deletion
- **Related entities** - if a document is linked to accounts, deals, contacts, quotes, or invoices, consider the impact of deletion

## Alternative Options

Before requesting deletion, consider:
- **Archiving**: Instead of deleting, you may want to archive the document
- **Updating permissions**: If you want to restrict access, update the document permissions instead
- **Contact the owner**: If you're not the document owner, contact them first

## Questions?

If you have questions about the document deletion process, please contact your system administrator or submit a helpdesk ticket.`,
    tags: ['documents', 'deletion', 'helpdesk', 'process'],
    category: 'Documentation',
    createdAt: new Date(),
    updatedAt: new Date(),
    author: 'system'
  }

  const result = await db.collection('kb_articles').insertOne(article)
  console.log('KB article created successfully:', result.insertedId)
}

main().catch(console.error).finally(() => process.exit(0))

