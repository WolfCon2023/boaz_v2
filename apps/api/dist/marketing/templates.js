import { Router } from 'express';
export const marketingTemplatesRouter = Router();
const templates = [
    {
        key: 'basic',
        name: 'Basic newsletter',
        mjml: `<mjml>
  <mj-body background-color="#f4f5f7">
    <mj-section background-color="#ffffff">
      <mj-column>
        <mj-text font-size="18px" font-weight="700">{{title}}</mj-text>
        <mj-text font-size="14px">Hello {{name}},<br/>This is a basic MJML template.</mj-text>
        <mj-button href="{{ctaUrl}}" background-color="#2563eb">{{ctaLabel}}</mj-button>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-text font-size="12px" color="#64748b">You received this email because you subscribed. <a href="{{unsubscribeUrl}}">Unsubscribe</a></mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
    },
    {
        key: 'hero',
        name: 'Hero headline',
        mjml: `<mjml>
  <mj-body background-color="#0f172a">
    <mj-section background-color="#111827">
      <mj-column>
        <mj-image width="120px" src="{{logoUrl}}"></mj-image>
        <mj-text align="center" color="#e5e7eb" font-size="24px" font-weight="700">{{headline}}</mj-text>
        <mj-text align="center" color="#cbd5e1" font-size="14px">{{subhead}}</mj-text>
        <mj-button href="{{ctaUrl}}" background-color="#22c55e">{{ctaLabel}}</mj-button>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-text align="center" color="#94a3b8" font-size="12px">© {{year}} Your Company — <a href="{{unsubscribeUrl}}" style="color:#60a5fa">Unsubscribe</a></mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
    }
];
// GET /api/marketing/templates
marketingTemplatesRouter.get('/templates', (_req, res) => {
    res.json({ data: { items: templates }, error: null });
});
