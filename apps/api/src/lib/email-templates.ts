/**
 * Unified BOAZ-OS Email Template System
 * 
 * Provides consistent, professional email templates across all system emails
 */

export type EmailTemplateOptions = {
  header: {
    title: string
    subtitle?: string
    icon?: string // Emoji icon
  }
  content: {
    greeting?: string
    message: string // Main message (can include HTML)
    infoBox?: {
      title?: string
      items: Array<{ label: string; value: string | number }>
    }
    actionButton?: {
      text: string
      url: string
    }
    additionalInfo?: string
  }
  footer?: {
    customMessage?: string
  }
}

/**
 * Generate a professional, branded email template
 */
export function generateEmailTemplate(options: EmailTemplateOptions): { html: string; text: string } {
  const now = new Date()
  const year = now.getFullYear()
  
  // HTML Email
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      margin: 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
      background-color: #ffffff;
    }
    .greeting {
      font-size: 16px;
      margin-bottom: 20px;
      color: #333;
    }
    .message {
      font-size: 15px;
      line-height: 1.8;
      color: #555;
      margin-bottom: 25px;
    }
    .info-box {
      background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%);
      border-left: 4px solid #667eea;
      padding: 25px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .info-box-title {
      font-size: 16px;
      font-weight: 600;
      color: #667eea;
      margin: 0 0 15px 0;
    }
    .info-item {
      margin: 12px 0;
      display: flex;
      flex-direction: column;
    }
    .info-label {
      font-weight: 600;
      color: #667eea;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }
    .info-value {
      font-size: 15px;
      color: #333;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      transition: transform 0.2s;
    }
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
    }
    .additional-info {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
      margin-top: 25px;
      padding-top: 25px;
      border-top: 1px solid #e0e0e0;
    }
    .footer {
      background-color: #f9f9f9;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }
    .footer-message {
      font-size: 13px;
      color: #666;
      margin-bottom: 15px;
    }
    .footer-brand {
      font-size: 14px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 8px;
    }
    .footer-copyright {
      font-size: 12px;
      color: #999;
    }
    .footer-links {
      margin-top: 15px;
    }
    .footer-link {
      color: #667eea;
      text-decoration: none;
      font-size: 12px;
      margin: 0 10px;
    }
    @media only screen and (max-width: 600px) {
      .header {
        padding: 30px 20px;
      }
      .header h1 {
        font-size: 24px;
      }
      .content {
        padding: 30px 20px;
      }
      .info-box {
        padding: 20px;
      }
      .button {
        padding: 12px 24px;
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <!-- Header -->
    <div class="header">
      <h1>${options.header.icon ? `${options.header.icon} ` : ''}${options.header.title}</h1>
      ${options.header.subtitle ? `<p>${options.header.subtitle}</p>` : ''}
    </div>
    
    <!-- Content -->
    <div class="content">
      ${options.content.greeting ? `<div class="greeting">${options.content.greeting}</div>` : ''}
      
      <div class="message">
        ${options.content.message}
      </div>
      
      ${options.content.infoBox ? `
        <div class="info-box">
          ${options.content.infoBox.title ? `<div class="info-box-title">${options.content.infoBox.title}</div>` : ''}
          ${options.content.infoBox.items.map(item => `
            <div class="info-item">
              <div class="info-label">${item.label}</div>
              <div class="info-value">${item.value}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${options.content.actionButton ? `
        <div class="button-container">
          <a href="${options.content.actionButton.url}" class="button">${options.content.actionButton.text}</a>
        </div>
      ` : ''}
      
      ${options.content.additionalInfo ? `
        <div class="additional-info">
          ${options.content.additionalInfo}
        </div>
      ` : ''}
    </div>
    
    <!-- Footer -->
    <div class="footer">
      ${options.footer?.customMessage ? `<div class="footer-message">${options.footer.customMessage}</div>` : ''}
      
      <div class="footer-brand">BOAZ-OS</div>
      <div class="footer-copyright">© ${year} Wolf Consulting Group, LLC. All rights reserved.</div>
      
      <div class="footer-links">
        <a href="https://wolfconsultingnc.com" class="footer-link">Website</a>
        <span style="color: #ccc;">•</span>
        <a href="mailto:contactwcg@wolfconsultingnc.com" class="footer-link">Contact</a>
      </div>
    </div>
  </div>
</body>
</html>
  `
  
  // Plain Text Email
  const textParts: string[] = []
  
  // Header
  textParts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  textParts.push(`${options.header.icon ? `${options.header.icon} ` : ''}${options.header.title.toUpperCase()}`)
  if (options.header.subtitle) {
    textParts.push(options.header.subtitle)
  }
  textParts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  textParts.push('')
  
  // Greeting
  if (options.content.greeting) {
    textParts.push(options.content.greeting)
    textParts.push('')
  }
  
  // Message (strip HTML tags for plain text)
  const plainMessage = options.content.message
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
  textParts.push(plainMessage)
  textParts.push('')
  
  // Info Box
  if (options.content.infoBox) {
    textParts.push('┌─────────────────────────────────────┐')
    if (options.content.infoBox.title) {
      textParts.push(`│ ${options.content.infoBox.title}`)
      textParts.push('│')
    }
    options.content.infoBox.items.forEach(item => {
      textParts.push(`│ ${item.label}:`)
      textParts.push(`│ ${item.value}`)
      textParts.push('│')
    })
    textParts.push('└─────────────────────────────────────┘')
    textParts.push('')
  }
  
  // Action Button
  if (options.content.actionButton) {
    textParts.push(`[ ${options.content.actionButton.text.toUpperCase()} ]`)
    textParts.push(options.content.actionButton.url)
    textParts.push('')
  }
  
  // Additional Info
  if (options.content.additionalInfo) {
    textParts.push('─────────────────────────────────────')
    const plainAdditionalInfo = options.content.additionalInfo
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
    textParts.push(plainAdditionalInfo)
    textParts.push('')
  }
  
  // Footer
  textParts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (options.footer?.customMessage) {
    textParts.push(options.footer.customMessage)
    textParts.push('')
  }
  textParts.push('BOAZ-OS')
  textParts.push(`© ${year} Wolf Consulting Group, LLC`)
  textParts.push('https://wolfconsultingnc.com')
  textParts.push('contactwcg@wolfconsultingnc.com')
  textParts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  const text = textParts.join('\n')
  
  return { html, text }
}

/**
 * Format timestamp for emails (Eastern Time)
 */
export function formatEmailTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * Backward-compatible helper functions for legacy code
 * These wrap the new generateEmailTemplate function
 */

export function createField(label: string, value: string): string {
  return `
    <div style="margin: 15px 0;">
      <div style="font-weight: 600; color: #667eea; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
        ${label}
      </div>
      <div style="font-size: 15px; color: #333;">
        ${value}
      </div>
    </div>
  `
}

export function createContentBox(content: string): string {
  return `
    <div style="background: linear-gradient(135deg, #f8f9ff 0%, #f0f2ff 100%); border-left: 4px solid #667eea; padding: 25px; margin: 25px 0; border-radius: 8px;">
      ${content}
    </div>
  `
}

type StandardEmailOptions = {
  title: string
  emoji?: string
  subtitle?: string
  bodyContent: string
  buttonText?: string
  buttonUrl?: string
  footerText?: string
}

export function createStandardEmailTemplate(options: StandardEmailOptions): string {
  const year = new Date().getFullYear()
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      margin: 0;
      font-size: 14px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
      background-color: #ffffff;
    }
    .message {
      font-size: 15px;
      line-height: 1.8;
      color: #555;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    .footer {
      background-color: #f9f9f9;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }
    .footer-message {
      font-size: 13px;
      color: #666;
      margin-bottom: 15px;
    }
    .footer-brand {
      font-size: 14px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 8px;
    }
    .footer-copyright {
      font-size: 12px;
      color: #999;
    }
    .footer-links {
      margin-top: 15px;
    }
    .footer-link {
      color: #667eea;
      text-decoration: none;
      font-size: 12px;
      margin: 0 10px;
    }
    @media only screen and (max-width: 600px) {
      .header { padding: 30px 20px; }
      .header h1 { font-size: 24px; }
      .content { padding: 30px 20px; }
      .button { padding: 12px 24px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="header">
      <h1>${options.emoji ? `${options.emoji} ` : ''}${options.title}</h1>
      ${options.subtitle ? `<p>${options.subtitle}</p>` : ''}
    </div>
    
    <div class="content">
      <div class="message">
        ${options.bodyContent}
      </div>
      
      ${options.buttonText && options.buttonUrl ? `
        <div class="button-container">
          <a href="${options.buttonUrl}" class="button">${options.buttonText}</a>
        </div>
      ` : ''}
    </div>
    
    <div class="footer">
      ${options.footerText ? `<div class="footer-message">${options.footerText}</div>` : ''}
      <div class="footer-brand">BOAZ-OS</div>
      <div class="footer-copyright">© ${year} Wolf Consulting Group, LLC. All rights reserved.</div>
      <div class="footer-links">
        <a href="https://wolfconsultingnc.com" class="footer-link">Website</a>
        <span style="color: #ccc;">•</span>
        <a href="mailto:contactwcg@wolfconsultingnc.com" class="footer-link">Contact</a>
      </div>
    </div>
  </div>
</body>
</html>
  `
}

export function createStandardTextEmail(options: StandardEmailOptions): string {
  const year = new Date().getFullYear()
  const parts: string[] = []
  
  parts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  parts.push(`${options.emoji ? `${options.emoji} ` : ''}${options.title.toUpperCase()}`)
  if (options.subtitle) {
    parts.push(options.subtitle)
  }
  parts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  parts.push('')
  
  // Body content (strip HTML)
  const plainBody = options.bodyContent
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
  
  parts.push(plainBody)
  parts.push('')
  
  if (options.buttonText && options.buttonUrl) {
    parts.push(`[ ${options.buttonText.toUpperCase()} ]`)
    parts.push(options.buttonUrl)
    parts.push('')
  }
  
  if (options.footerText) {
    parts.push('─────────────────────────────────────')
    parts.push(options.footerText)
    parts.push('')
  }
  
  parts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  parts.push('BOAZ-OS')
  parts.push(`© ${year} Wolf Consulting Group, LLC`)
  parts.push('https://wolfconsultingnc.com')
  parts.push('contactwcg@wolfconsultingnc.com')
  parts.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  return parts.join('\n')
}

