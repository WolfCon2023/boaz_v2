import { ObjectId } from 'mongodb';
import { getDb } from '../db.js';
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('No DB connection; aborting contract template seed.');
        return;
    }
    const coll = db.collection('contract_templates');
    const templates = [
        {
            key: 'msa-standard',
            name: 'Standard Managed Services Agreement',
            description: 'Generic managed services agreement summary with SLA and governance sections.',
            htmlBody: `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Managed Services Agreement {{contractNumber}} – {{name}}</title>
  </head>
  <body>
    <h1>Managed Services Agreement {{contractNumber}} – {{name}}</h1>
    <p>Between {{customerLegalName}} ("Customer") and {{providerLegalName}} ("Provider").</p>
    <h2>Scope of services</h2>
    <p>{{serviceScopeSummary}}</p>
    <h2>Term</h2>
    <p>Effective {{effectiveDate}} with service term from {{startDate}} to {{endDate}}. Auto-renew: {{autoRenew}}.</p>
    <h2>Commercial terms</h2>
    <p>Billing frequency: {{billingFrequency}}. Base amount: {{baseAmountFormatted}}. Invoice due: {{invoiceDueDays}} days.</p>
    <h2>SLA and support</h2>
    <p>Uptime target: {{uptimeTargetPercent}}%. Support hours: {{supportHours}}.</p>
    <p>Default response target: {{responseTargetMinutes}} minutes. Default resolution target: {{resolutionTargetMinutes}} minutes.</p>
    <h2>Key legal terms</h2>
    <p>Limitation of liability: {{limitationOfLiability}}</p>
    <p>Indemnification: {{indemnificationSummary}}</p>
    <p>Confidentiality: {{confidentialitySummary}}</p>
    <p>Data protection: {{dataProtectionSummary}}</p>
    <p>IP ownership: {{ipOwnershipSummary}}</p>
    <p>Termination: {{terminationConditions}}</p>
    <h2>Signatures</h2>
    <p>Customer signer: {{signedByCustomer}} on {{signedAtCustomer}}</p>
    <p>Provider signer: {{signedByProvider}} on {{signedAtProvider}}</p>
  </body>
</html>`,
        },
        {
            key: 'subscription-standard',
            name: 'Standard Subscription Agreement',
            description: 'Subscription terms with recurring billing and SLA summary.',
            htmlBody: `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Subscription Agreement {{contractNumber}} – {{name}}</title>
  </head>
  <body>
    <h1>Subscription Agreement {{contractNumber}} – {{name}}</h1>
    <p>Customer: {{customerLegalName}} · Provider: {{providerLegalName}}</p>
    <h2>Subscription</h2>
    <p>{{serviceScopeSummary}}</p>
    <h2>Commercials</h2>
    <p>Billing frequency: {{billingFrequency}} in {{currency}}. Base amount: {{baseAmountFormatted}}.</p>
    <p>Auto increase on renewal: {{autoIncreasePercentOnRenewal}}%. Invoice due: {{invoiceDueDays}} days.</p>
    <h2>SLA</h2>
    <p>Uptime: {{uptimeTargetPercent}}%. Support hours: {{supportHours}}.</p>
    <p>SLA exclusions: {{slaExclusionsSummary}}</p>
  </body>
</html>`,
        },
        {
            key: 'sow-basic',
            name: 'Basic Statement of Work',
            description: 'Lightweight SOW template with scope and deliverables sections.',
            htmlBody: `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Statement of Work {{contractNumber}} – {{name}}</title>
  </head>
  <body>
    <h1>Statement of Work {{contractNumber}} – {{name}}</h1>
    <p>This SOW is entered into between {{customerLegalName}} and {{providerLegalName}} under the governing Master Agreement.</p>
    <h2>Scope</h2>
    <p>{{serviceScopeSummary}}</p>
    <h2>Timeline</h2>
    <p>Start date: {{startDate}} · Target completion: {{endDate}}</p>
    <h2>Assumptions and dependencies</h2>
    <p>{{notes}}</p>
  </body>
</html>`,
        },
    ];
    for (const tpl of templates) {
        const existing = await coll.findOne({ key: tpl.key });
        if (existing) {
            console.log('Contract template already exists, skipping:', tpl.key);
            continue;
        }
        const now = new Date();
        await coll.insertOne({
            _id: new ObjectId(),
            key: tpl.key,
            name: tpl.name,
            description: tpl.description,
            htmlBody: tpl.htmlBody,
            createdAt: now,
            updatedAt: now,
        });
        console.log('Created contract template:', tpl.key);
    }
}
main()
    .catch((err) => {
    console.error('Error seeding contract templates:', err);
    process.exit(1);
})
    .finally(() => process.exit(0));
