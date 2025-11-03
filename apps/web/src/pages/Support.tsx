import * as React from 'react'
import { Link } from 'react-router-dom'
import { HelpCircle, Phone, Mail, FileText, ChevronDown, ChevronUp } from 'lucide-react'

type FAQItem = {
  question: string
  answer: string
  category: string
}

const faqs: FAQItem[] = [
  // Account & Access
  {
    category: 'Account & Access',
    question: 'How do I reset my password?',
    answer: 'Click on "Forgot password?" on the login page and enter your email address. You will receive an email with instructions to reset your password. You can also contact support if you need assistance.',
  },
  {
    category: 'Account & Access',
    question: 'How do I request access to an application?',
    answer: 'If you have access to the Marketplace or Workspace, you can request access to applications directly by clicking the "Request Access" button on any application you don\'t have access to. Your request will be sent to administrators for approval. Once approved, you\'ll receive an email notification and can then install the application from the Marketplace.',
  },
  {
    category: 'Account & Access',
    question: 'I received a registration approval email. What do I do next?',
    answer: 'Click the enrollment link in the email to complete your account setup. You will need to set up security questions and create a password. Make sure to save your security questions and answers in a safe place.',
  },
  {
    category: 'Account & Access',
    question: 'How do I change my password?',
    answer: 'Go to Settings from the sidebar, then navigate to the Security section. You can change your password there. If you are required to change your password on first login, you will be redirected to the change password page automatically.',
  },
  // CRM
  {
    category: 'CRM',
    question: 'How do I add a new contact?',
    answer: 'Navigate to CRM > Contacts and click the "New Contact" button. Fill in the contact information including name, email, phone, and any other relevant details. Contacts can be linked to accounts for better organization.',
  },
  {
    category: 'CRM',
    question: 'How do I create a quote or invoice?',
    answer: 'Go to CRM > Quotes or CRM > Invoices, then click "New Quote" or "New Invoice". Select the account or contact, add line items, and configure pricing. Quotes can be converted to invoices once accepted.',
  },
  {
    category: 'CRM',
    question: 'How do I manage deals and opportunities?',
    answer: 'Navigate to CRM > Deals to view your sales pipeline. Create new deals, update their stage, set values, and track progress. You can filter and sort deals to focus on the most important opportunities.',
  },
  {
    category: 'CRM',
    question: 'What is the difference between Contacts and Accounts?',
    answer: 'Contacts are individual people, while Accounts are companies or organizations. Contacts can be associated with Accounts to show relationships. This structure helps manage B2B relationships where multiple people work at the same company.',
  },
  {
    category: 'CRM',
    question: 'How do I set up email sequences?',
    answer: 'Go to CRM > Outreach > Sequences. Create a new sequence and add email templates with delays between each step. You can assign sequences to contacts and track engagement. Templates can be customized with merge fields for personalization.',
  },
  {
    category: 'CRM',
    question: 'How do I print an invoice?',
    answer: 'Open the invoice you want to print from CRM > Invoices, then click the "Print" button. This will open a print-friendly view of the invoice that you can print or save as PDF.',
  },
  // Helpdesk
  {
    category: 'Helpdesk',
    question: 'How do I submit a helpdesk ticket?',
    answer: 'Click the "Submit a Helpdesk Ticket" button below, or navigate to the Helpdesk application if you have access. Fill in the ticket details including a short description, full description, and any attachments. You will receive a ticket number for tracking.',
  },
  {
    category: 'Helpdesk',
    question: 'How do I check the status of my ticket?',
    answer: 'Use the Customer Portal at /portal to look up your ticket by ticket number. You can also view ticket details and add comments through the portal. If you have Helpdesk access, you can view all tickets in the Helpdesk application.',
  },
  {
    category: 'Helpdesk',
    question: 'What are SLAs and how do they work?',
    answer: 'SLAs (Service Level Agreements) define response and resolution time commitments for tickets. The system tracks SLA compliance and will alert when tickets are at risk of breaching SLAs. View SLA status in the Helpdesk application.',
  },
  {
    category: 'Helpdesk',
    question: 'How do I access the Knowledge Base?',
    answer: 'Navigate to CRM > Knowledge Base if you have CRM access. The Knowledge Base contains articles and self-service help documentation. Articles can be searched and organized by category for easy access.',
  },
  // Marketplace & Workspace
  {
    category: 'Workspace',
    question: 'How do I customize my workspace?',
    answer: 'Go to Workspace from the sidebar. You can install and uninstall applications from the Marketplace, reorder applications by dragging them, and customize your workspace layout. Changes are saved automatically.',
  },
  {
    category: 'Workspace',
    question: 'What applications are available?',
    answer: 'Available applications include CRM, Helpdesk, Marketplace, Workspace, Dashboard, and more. Check the Marketplace to see all available applications and their descriptions. Install the ones you need for your role.',
  },
  {
    category: 'Marketplace',
    question: 'How do I install an application?',
    answer: 'Go to the Marketplace from the sidebar, browse available applications, and click "Install" on the applications you want. Installed applications will appear in your Workspace. You can uninstall them at any time.',
  },
  // General
  {
    category: 'General',
    question: 'What is BOAZ-OS?',
    answer: 'BOAZ-OS (Back Office Applications ZoneOS) is a comprehensive business platform that integrates CRM, Helpdesk, Marketplace, and other business applications in one unified system. It provides tools for managing customers, support, sales, and operations.',
  },
  {
    category: 'General',
    question: 'How do I get help with a technical issue?',
    answer: 'For technical issues, submit a helpdesk ticket using the button below or contact support directly at support@wolfconsultingnc.com or (999) 999-9999. Include as much detail as possible about the issue, including steps to reproduce if applicable.',
  },
  {
    category: 'General',
    question: 'What browsers are supported?',
    answer: 'BOAZ-OS works best with modern browsers including Chrome, Firefox, Safari, and Edge. Make sure your browser is up to date for the best experience. JavaScript must be enabled.',
  },
]

export default function Support() {
  const [expandedFaq, setExpandedFaq] = React.useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = React.useState<string>('All')

  const categories = ['All', ...Array.from(new Set(faqs.map(faq => faq.category)))]

  const filteredFaqs = selectedCategory === 'All' 
    ? faqs 
    : faqs.filter(faq => faq.category === selectedCategory)

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            Get help, contact support, and find answers to common questions
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          to="/apps/helpdesk"
          className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] transition-colors"
        >
          <FileText className="mb-3 h-8 w-8 text-[color:var(--color-primary-600)]" />
          <div className="text-base font-semibold">Submit a Helpdesk Ticket</div>
          <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            Create a support ticket for technical issues or questions
          </div>
        </Link>

        <a
          href="tel:+19999999999"
          className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] transition-colors"
        >
          <Phone className="mb-3 h-8 w-8 text-[color:var(--color-primary-600)]" />
          <div className="text-base font-semibold">Call Support</div>
          <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            (999) 999-9999
          </div>
        </a>

        <a
          href="mailto:support@wolfconsultingnc.com"
          className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6 hover:bg-[color:var(--color-muted)] transition-colors"
        >
          <Mail className="mb-3 h-8 w-8 text-[color:var(--color-primary-600)]" />
          <div className="text-base font-semibold">Email Support</div>
          <div className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            support@wolfconsultingnc.com
          </div>
        </a>
      </div>

      {/* FAQs */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-[color:var(--color-primary-600)]" />
          <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>
        </div>

        {/* Category Filter */}
        <div className="mb-4 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => {
                setSelectedCategory(category)
                setExpandedFaq(null)
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                selectedCategory === category
                  ? 'border-[color:var(--color-primary-600)] bg-[color:var(--color-primary-600)] text-white'
                  : 'border-[color:var(--color-border)] hover:bg-[color:var(--color-muted)]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* FAQ List */}
        <div className="space-y-2">
          {filteredFaqs.map((faq) => {
            const globalIndex = faqs.findIndex(f => f === faq)
            const isExpanded = expandedFaq === globalIndex
            return (
              <div
                key={globalIndex}
                className="rounded-lg border border-[color:var(--color-border)]"
              >
                <button
                  onClick={() => toggleFaq(globalIndex)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-[color:var(--color-muted)] transition-colors"
                >
                  <div>
                    <div className="font-medium">{faq.question}</div>
                    <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                      {faq.category}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 text-[color:var(--color-text-muted)] flex-shrink-0 ml-4" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-[color:var(--color-text-muted)] flex-shrink-0 ml-4" />
                  )}
                </button>
                {isExpanded && (
                  <div className="border-t border-[color:var(--color-border)] p-4 text-sm text-[color:var(--color-text-muted)] leading-relaxed">
                    {faq.answer}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredFaqs.length === 0 && (
          <div className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
            No FAQs found in this category.
          </div>
        )}
      </div>

      {/* Additional Help */}
      <div className="rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-panel)] p-6">
        <h3 className="mb-3 text-base font-semibold">Still need help?</h3>
        <p className="mb-4 text-sm text-[color:var(--color-text-muted)]">
          If you couldn't find what you're looking for, our support team is here to help.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="mailto:support@wolfconsultingnc.com"
            className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
          >
            Email Support
          </a>
          <a
            href="tel:+19999999999"
            className="rounded-lg border border-[color:var(--color-border)] px-4 py-2 text-sm hover:bg-[color:var(--color-muted)]"
          >
            Call (999) 999-9999
          </a>
          <Link
            to="/apps/helpdesk"
            className="rounded-lg bg-[color:var(--color-primary-600)] px-4 py-2 text-sm text-white hover:bg-[color:var(--color-primary-700)]"
          >
            Submit a Ticket
          </Link>
        </div>
      </div>
    </div>
  )
}
