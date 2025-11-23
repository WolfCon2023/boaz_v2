import { ObjectId } from 'mongodb';
import { getDb, getNextSequence } from '../db.js';
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('No DB connection; aborting contract seed.');
        return;
    }
    const accounts = await db
        .collection('accounts')
        .find({}, { projection: { _id: 1, name: 1, accountNumber: 1, legalName: 1, billingAddress: 1 } })
        .limit(10)
        .toArray();
    if (!accounts.length) {
        console.error('No accounts found. Create CRM accounts before seeding contracts.');
        return;
    }
    const now = new Date();
    const docs = [];
    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const accountId = account._id;
        const contractNumber = await getNextSequence('contractNumber');
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() + 7); // Go live in 1 week
        const endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        const renewalDate = new Date(endDate);
        const baseAmountCents = 2500000 + i * 500000; // $25k + steps
        const doc = {
            _id: new ObjectId(),
            accountId,
            contractNumber,
            name: `Managed Services & Cloud SLA – ${account.name ?? 'Customer'}`,
            type: 'msa',
            status: 'active',
            effectiveDate: now,
            startDate,
            endDate,
            autoRenew: true,
            renewalDate,
            renewalTermMonths: 12,
            noticePeriodDays: 60,
            billingFrequency: 'Monthly',
            currency: 'USD',
            baseAmountCents,
            invoiceDueDays: 30,
            uptimeTargetPercent: 99.9,
            supportHours: '24x7 for P1/P2, business hours for P3/P4',
            slaExclusionsSummary: 'Planned maintenance windows, third-party outages outside provider control, and customer-caused incidents.',
            responseTargetMinutes: 60, // default
            resolutionTargetMinutes: 8 * 60,
            entitlements: 'Remote monitoring and management, patching, backup monitoring, incident response, and quarterly service reviews.',
            notes: 'Seeded compliance contract. Ensure DPA and security exhibits are aligned with the latest regulatory guidance before use with real customers.',
            severityTargets: [
                { key: 'P1', label: 'P1 – Critical / Sev 1', responseTargetMinutes: 30, resolutionTargetMinutes: 4 * 60 },
                { key: 'P2', label: 'P2 – High / Sev 2', responseTargetMinutes: 60, resolutionTargetMinutes: 8 * 60 },
                { key: 'P3', label: 'P3 – Medium / Sev 3', responseTargetMinutes: 4 * 60, resolutionTargetMinutes: 3 * 24 * 60 },
                { key: 'P4', label: 'P4 – Low / Sev 4', responseTargetMinutes: 8 * 60, resolutionTargetMinutes: 7 * 24 * 60 },
            ],
            // Parties
            customerLegalName: account.legalName || account.name,
            customerAddress: account.billingAddress ||
                'Customer billing address on file with Wolf Consulting Group, LLC.',
            providerLegalName: 'Wolf Consulting Group, LLC',
            providerAddress: 'Wolf Consulting Group, LLC – 620 Charlotte Ave, Suite 200, Charlotte, NC 28202',
            // Governance & legal
            governingLaw: 'State of North Carolina, USA',
            jurisdiction: 'Courts of Mecklenburg County, North Carolina, USA',
            paymentTerms: 'Net 30 from invoice date. Late fees may apply to overdue balances.',
            serviceScopeSummary: 'Managed IT services covering core infrastructure, end-user support, and approved cloud workloads as documented in the attached service catalog.',
            limitationOfLiability: 'Aggregate liability limited to 12 months of fees paid under this agreement, excluding carve-outs required by law.',
            indemnificationSummary: 'Mutual indemnities for third-party IP infringement and bodily injury/property damage arising from negligence.',
            confidentialitySummary: 'Mutual confidentiality obligations with at least industry-standard protections for customer confidential information.',
            dataProtectionSummary: 'Provider will process personal data solely as instructed by customer and in accordance with the Data Processing Addendum.',
            ipOwnershipSummary: 'Customer retains ownership of its data; Provider retains ownership of pre-existing IP and tools used to deliver the services.',
            terminationConditions: 'Either party may terminate for uncured material breach with 30 days written notice; customer may terminate for convenience with 60 days notice.',
            changeOrderProcess: 'Material changes to scope, SLAs, or fees must be documented in a mutually agreed change order prior to implementation.',
            // Compliance / security
            dataClassification: 'Customer Data – Confidential; Personal Data as defined in applicable privacy laws.',
            hasDataProcessingAddendum: true,
            auditRightsSummary: 'Customer may request reasonable evidence of compliance and may conduct audits no more than once per year, subject to confidentiality and scheduling.',
            usageRestrictionsSummary: 'Customer may not use the services for unlawful activities, high-risk activities without prior written consent, or to infringe the rights of others.',
            subprocessorUseSummary: 'Provider may use subprocessors listed in the applicable Subprocessor List, subject to written data protection terms at least as protective as this agreement.',
            // Commercial levers
            autoIncreasePercentOnRenewal: 3.0,
            earlyTerminationFeeModel: 'Early termination subject to payment of 3 months of recurring fees.',
            upsellCrossSellRights: 'Provider may propose additional services and solutions during governance meetings; acceptance is at customer discretion.',
            // Metadata
            version: 1,
            parentContractId: null,
            isAmendment: false,
            amendmentNumber: null,
            executedDate: null,
            signedByCustomer: null,
            signedByProvider: null,
            signedAtCustomer: null,
            signedAtProvider: null,
            attachments: [],
            emailSends: [],
            signatureAudit: [],
            createdAt: now,
            updatedAt: now,
        };
        docs.push(doc);
    }
    if (!docs.length) {
        console.log('No contracts generated.');
        return;
    }
    await db.collection('sla_contracts').insertMany(docs);
    console.log(`Inserted ${docs.length} compliance-focused SLA contracts.`);
}
main().catch((err) => {
    console.error('Error seeding compliance contracts:', err);
});
