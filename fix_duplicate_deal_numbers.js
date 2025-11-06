// MongoDB shell script to fix duplicate deal numbers
// Run this in mongosh: mongosh <connection_string> < fix_duplicate_deal_numbers.js
// Or paste it directly into mongosh

// Connect to your database (adjust as needed)
// use boaz_v2_dev;  // or your database name

print("Starting to fix duplicate deal numbers...");

// Step 1: Find all deals and group by dealNumber to find duplicates
const allDeals = db.deals.find({ dealNumber: { $type: "number" } }).toArray();

// Group deals by dealNumber
const dealNumberGroups = {};
allDeals.forEach(deal => {
  const num = deal.dealNumber;
  if (!dealNumberGroups[num]) {
    dealNumberGroups[num] = [];
  }
  dealNumberGroups[num].push(deal);
});

// Step 2: Identify duplicates (keep first, fix the rest)
const dealsToFix = [];
for (const [dealNumber, deals] of Object.entries(dealNumberGroups)) {
  if (deals.length > 1) {
    print(`Found ${deals.length} deals with dealNumber ${dealNumber}`);
    // Keep the first one (oldest by _id timestamp), fix the rest
    const sorted = deals.sort((a, b) => a._id.getTimestamp() - b._id.getTimestamp());
    dealsToFix.push(...sorted.slice(1)); // All except the first
  }
}

if (dealsToFix.length === 0) {
  print("No duplicate deal numbers found. All good!");
  quit(0);
}

print(`Found ${dealsToFix.length} deals to renumber.`);

// Step 3: Get the current maximum deal number from deals that are NOT being fixed
const fixedDealIds = new Set(dealsToFix.map(d => d._id.toString()));
const validDealNumbers = allDeals
  .filter(d => !fixedDealIds.has(d._id.toString()))
  .map(d => d.dealNumber)
  .filter(n => typeof n === "number");

let nextNumber = validDealNumbers.length > 0 ? Math.max(...validDealNumbers) : 100000;

// Check counter collection
try {
  const counter = db.counters.findOne({ _id: "dealNumber" });
  if (counter && counter.seq > nextNumber) {
    nextNumber = counter.seq - 1;
  }
} catch (e) {
  print("Counter collection check failed, continuing with calculated max...");
}

print(`Starting renumbering from ${nextNumber + 1}...`);

// Step 4: Renumber the deals
let fixed = 0;
dealsToFix.forEach(deal => {
  nextNumber += 1;
  const result = db.deals.updateOne(
    { _id: deal._id },
    { $set: { dealNumber: nextNumber } }
  );
  
  if (result.modifiedCount === 1) {
    fixed++;
    print(`  Fixed deal ${deal._id} (${deal.title || "Untitled"}): ${deal.dealNumber} -> ${nextNumber}`);
  } else {
    print(`  WARNING: Failed to update deal ${deal._id}`);
  }
});

// Step 5: Update the counter collection
try {
  db.counters.updateOne(
    { _id: "dealNumber" },
    { $set: { seq: nextNumber } },
    { upsert: true }
  );
  print(`Updated counter collection to ${nextNumber}`);
} catch (e) {
  print(`WARNING: Failed to update counter collection: ${e.message}`);
}

print(`\n✅ Successfully fixed ${fixed} deals with duplicate numbers.`);
print(`Next deal number will be: ${nextNumber + 1}`);

// Step 6: Verify no duplicates remain
const verification = db.deals.aggregate([
  { $match: { dealNumber: { $type: "number" } } },
  { $group: { _id: "$dealNumber", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
]).toArray();

if (verification.length === 0) {
  print("✅ Verification passed: No duplicate deal numbers remain.");
} else {
  print("⚠️  WARNING: Some duplicates may still exist:");
  verification.forEach(v => {
    print(`  dealNumber ${v._id}: ${v.count} deals`);
  });
}

