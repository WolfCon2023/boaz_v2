// Find the actual user ID and compare with user_roles
var userEmail = "qatest1@wolfconsultingnc.com";
var expectedUserId = "6904cff0c8dd5d3950744a8b";

print("=== Finding User by Email ===");
var user = db.users.findOne({ email: userEmail });
if (user) {
  print("✅ User found by email:");
  print("   _id: " + user._id.toString());
  print("   email: " + user.email);
  print("   name: " + (user.name || "N/A"));
  print("");
  
  var actualUserId = user._id.toString();
  print("=== Comparing IDs ===");
  print("   Expected (from your data): " + expectedUserId);
  print("   Actual (from database): " + actualUserId);
  
  if (actualUserId === expectedUserId) {
    print("   ✅ IDs match!");
  } else {
    print("   ⚠️  IDs DO NOT MATCH!");
    print("   This is the problem - the userId in user_roles doesn't match the actual user ID");
  }
  
  print("\n=== Checking Role Assignment with CORRECT User ID ===");
  var adminRole = db.roles.findOne({ name: "admin" });
  if (adminRole) {
    // Check with the ACTUAL user ID
    var assignment = db.user_roles.findOne({ 
      userId: actualUserId,
      roleId: adminRole._id 
    });
    
    if (assignment) {
      print("✅ Assignment found with ACTUAL user ID:");
      print("   userId: \"" + assignment.userId + "\"");
      print("   roleId: " + assignment.roleId.toString());
      print("");
      print("✅ User should have admin access!");
    } else {
      print("❌ No assignment found with ACTUAL user ID");
      print("   Need to create assignment with userId: " + actualUserId);
      print("");
      print("Run this to fix:");
      print("---");
      print("var adminRole = db.roles.findOne({ name: 'admin' });");
      print("var user = db.users.findOne({ email: '" + userEmail + "' });");
      print("db.user_roles.insertOne({");
      print("  _id: ObjectId(),");
      print("  userId: user._id.toString(),");
      print("  roleId: adminRole._id,");
      print("  createdAt: new Date()");
      print("});");
      print("---");
    }
    
    // Also check what's in user_roles with the wrong ID
    var wrongAssignment = db.user_roles.findOne({ 
      userId: expectedUserId,
      roleId: adminRole._id 
    });
    if (wrongAssignment) {
      print("⚠️  Found assignment with WRONG user ID (" + expectedUserId + ")");
      print("   This assignment won't work because the user doesn't have that ID!");
      print("   You should delete this:");
      print("   db.user_roles.deleteOne({ userId: '" + expectedUserId + "', roleId: adminRole._id });");
    }
  }
} else {
  print("❌ User NOT found by email: " + userEmail);
  print("\nSearching all users...");
  db.users.find({ email: { $regex: "qatest", $options: "i" } }).forEach(function(u) {
    print("   Found: " + u.email + " (ID: " + u._id.toString() + ")");
  });
}

