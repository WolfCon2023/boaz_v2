// MongoDB queries to assign admin role to user
// Run these in MongoDB shell or Compass

// Step 1: Find the admin role
// Run this to get the admin role ID:
db.roles.findOne({ name: "admin" })

// Step 2: Insert the user_roles assignment
// Replace ADMIN_ROLE_ID with the _id from Step 1, or run the complete query below:

// Complete query (one-liner that finds admin role and assigns it):
var adminRole = db.roles.findOne({ name: "admin" });
if (!adminRole) {
  print("ERROR: Admin role not found. Please ensure default roles are initialized.");
} else {
  var userId = "6904cff0c8dd5d3950744a8b"; // User ID from your data
  var existing = db.user_roles.findOne({ 
    userId: userId, 
    roleId: adminRole._id 
  });
  
  if (existing) {
    print("User already has admin role assigned.");
  } else {
    db.user_roles.insertOne({
      _id: ObjectId(),
      userId: userId,
      roleId: adminRole._id,
      createdAt: new Date()
    });
    print("✅ Admin role assigned successfully!");
    print("User ID: " + userId);
    print("Role ID: " + adminRole._id.toString());
  }
}

