import { getDb } from '../db.js';
async function main() {
    const db = await getDb();
    if (!db) {
        console.error('Database not available');
        process.exit(1);
    }
    const coll = db.collection('kb_articles');
    const updates = [
        {
            title: 'Using the Customer Success app in BOAZ‑OS CRM',
            body: `Customer Success – Health scores, dashboards, and playbooks

Purpose
The Customer Success app turns signals from surveys, support tickets, assets, and projects into an account-level health score and clear playbook recommendations.
It helps you quickly see which customers are healthy, which are at risk, and where to focus proactive work.

Opening the app
- Go to CRM Hub → Customer Success.
- Or click the Success badge or the Customer success health card from an Account.

Main layout
- Header tiles showing counts of high-risk and medium-risk accounts.
- Filters for search and Success level so you can focus on the riskiest customers.
- Accounts table with columns for Success label, score, and key drivers.
- CSV export so you can share or analyze Success data outside the app.

How the Success health score works
The Success health score is a risk score from 0–100. Higher scores mean more risk and therefore a Medium or High Success label.
It combines four main signal groups:

1. Surveys (from Surveys and Feedback)
- Score goes up when the last survey score is lower.
- Thresholds for the last survey score:
  - Last score less than or equal to 6 has a big impact on risk.
  - Last score less than or equal to 7.5 has a medium impact.
  - Last score less than or equal to 8.5 has a small impact.

2. Support tickets (from Support and Tickets)
- More open tickets increases risk.
- More high or urgent tickets increases risk further.
- Breached SLAs add additional risk.

3. Assets and Installed Base (from Assets and Renewals)
- The asset risk score feeds directly into Success and is scaled so it matters but does not dominate.
- Expired or expiring licenses add risk.
- Products marked Needs Upgrade or Pending Renewal add risk.

4. Projects (from Projects and Delivery)
- Projects with health equal to at_risk or off_track add risk.
- More at-risk or off-track projects means a higher Success risk score.

Thresholds for Success labels
- Score greater than or equal to 70 means the label is High (high risk).
- Score greater than or equal to 35 and less than 70 means the label is Medium.
- Score less than 35 means the label is Low or OK.

Where you see the Success label
- In the Accounts table Success column.
- In the Account drawer Customer success health card.
- In the Customer Success page, including filters, tiles, and CSV export.

Customer Success in the Account drawer
From the Account drawer you can:
- See the Success badge for that account.
- Review a Signals list summarizing surveys, support load, asset risk, and projects.
- See Suggested playbooks that describe recommended actions.
- Trigger playbook actions when Success is Medium or High, including creating follow-up tasks, scheduling QBR tasks, and opening Outreach sequences for targeted communication.

How to deliberately test Medium or High Success states
To see playbook actions and risk behavior in a demo or test environment you can intentionally drive an account to Medium or High Success (higher risk) by adding more negative signals in the four areas above:

- Surveys: send a survey to that account and record a low score, for example a score less than or equal to 6 or in the 6 to 7.5 range.
- Support tickets: create several tickets for the account, mark some as high or urgent, and let at least one breach its SLA.
- Assets and Installed Base: ensure the account owns assets with expired or soon-expiring licenses and products marked Needs Upgrade or Pending Renewal.
- Projects: create projects for that account and set some projects to At risk or Off track.

Once the combined score crosses the thresholds (score greater than or equal to 35 for Medium, or greater than or equal to 70 for High) you will see the updated label in the Accounts table Success column, the Account drawer Customer success health card, and the Customer Success page.
When Success is Medium or High the Account drawer will also surface playbook actions so teams can quickly create follow-up tasks or schedule QBRs.`,
        },
        {
            title: 'Using the Contracts & SLAs app in BOAZ‑OS CRM',
            body: `Contracts and SLAs – Legal agreements and service commitments

Overview
The Contracts and SLAs app is where you manage customer agreements, legal terms, and formal service level commitments. It centralizes who is covered by which contract, what you have promised, and whether the agreement is fully signed and active. The app integrates with Accounts, Deals, Assets, Renewals, Support, and Customer Success.

Opening the app
Go to CRM Hub → Contracts and SLAs or use the CRM navigation menu and choose Contracts and SLAs.

Main screen
The main table lists contracts with columns for Account, Contract name, Type, Status, dates, and SLA metrics. Filters let you narrow by account, type, and status. Use New SLA or contract to create a new record or click a contract name to edit.

Creating a contract
When you create a contract you should set:
1. Account for the agreement.
2. Name and Type such as Managed Services Agreement, Subscription, SOW, or NDA.
3. Status, for example Draft, In review, Sent, or Active.
4. Effective date, Start date, End date, Renewal date, and whether the contract auto renews.
5. Renewal term in months and any notice period in days.

You can also capture Billing frequency, Currency, Base amount, and Invoice due days so commercial information is available alongside the legal data.

SLA and support targets
Use the SLA section to define:
1. Default response and resolution targets in minutes.
2. Uptime target percentage.
3. Support hours and SLA exclusions.
4. Optional per priority targets for P1 through P4 or other severities.
These values feed reporting and health indicators in Success and Support.

Parties, governance, and legal terms
The Parties and governance panels store customer and provider legal names and addresses, key contacts such as customer executive sponsor and technical contact, and provider account manager and CSM. The Legal terms section summarizes limitation of liability, indemnification, confidentiality, data protection, IP ownership, termination conditions, and change order process so non legal users can quickly understand the agreement.

Compliance and risk
The compliance panel records data classification, whether a data processing addendum is in place, audit rights, usage restrictions, and subprocessors. This information is used by risk and success dashboards to highlight sensitive contracts and accounts.

Links and covered scope
In the Links and playbooks block you can tie a contract to its primary quote and primary deal and record covered asset and service tags. Success playbook constraints describe any limits on outreach, interventions, or automation that should respect contractual terms.

Templates and rendering
The Contracts and SLAs app supports contract templates so you can standardize language:
- Use templates to generate HTML versions of agreements with merge fields such as account names, dates, and SLA summaries.
- Preview what the final document will look like before sending it to a customer.
- Save existing contracts as templates so future agreements follow the same structure.

Sending for review and signature
Use the Email or Send for signature action in the table or editor to send a contract for signature. The system will:
1. Create a signing invite with an expiring token.
2. Email a temporary signing username and a one time security code in separate messages.
3. Email a third message with a secure signing link that requires the username and code before the contract is revealed.
The signing page shows the key fields and summaries from the contract so the signer can review before approving.

Digital signature flow and audit trail
When a signer completes the digital signature the app:
1. Records the signer name, email, title, time, IP address, and user agent in the signature audit trail.
2. Marks the contract Active and sets the executed date when conditions are met.
3. Generates a final HTML and PDF snapshot of the contract summary.
4. Stores these as attachments on the contract and emails signed copies to the signer.

Working from Accounts and Deals
From an Account drawer you can see contracts and renewal information to support QBRs and renewal planning. From a Deal drawer you can see which contracts are tied to that opportunity and jump into the contract editor.

Best practices
1. Keep contract status and dates accurate so renewals and health dashboards are reliable.
2. Align SLA targets and summaries in the app with the signed legal document.
3. Use covered asset and service tags for better integration with Assets, Renewals, and Success.
4. Use the Email, history, and Documents panels in the contract editor to see when contracts were sent, signed, and which copies were delivered.`,
        },
    ];
    for (const u of updates) {
        const res = await coll.updateOne({ title: u.title }, {
            $set: {
                body: u.body,
                updatedAt: new Date(),
            },
        });
        console.log(res.matchedCount
            ? `Updated KB article body for: ${u.title}`
            : `KB article not found (no update): ${u.title}`);
    }
    console.log('Done updating KB articles.');
}
main()
    .catch((err) => {
    console.error(err);
    process.exit(1);
})
    .finally(() => process.exit(0));
