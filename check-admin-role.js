// MongoDB queries to check admin role assignment
// Run these in mongosh or MongoDB Compass

// Step 1: Check if admin role exists
print("=== Checking Admin Role ===");
var adminRole = db.roles.findOne({ name: "admin" });
if (adminRole) {
  print("✅ Admin role found:");
  print("   _id: " + adminRole._id.toString());
  print("   name: " + adminRole.name);
  print("   permissions: " + JSON.stringify(adminRole.permissions));
} else {
  print("❌ Admin role NOT found!");
  print("   All roles in database:");
  db.roles.find().forEach(function(role) {
    print("   - " + role.name + " (ID: " + role._id.toString() + ")");
  });
}

print("\n=== Checking User ===");
var userId = "6904cff0c8dd5d3950744a8b";
var user = db.users.findOne({ _id: ObjectId(userId) });
if (user) {
  print("✅ User found:");
  print("   _id: " + user._id.toString());
  print("   email: " + user.email);
  print("   name: " + (user.name || "N/A"));
} else {
  print("❌ User NOT found with ID: " + userId);
}

print("\n=== Checking User-Role Assignment ===");
if (adminRole && user) {
  // Check using userId as string
  var assignment1 = db.user_roles.findOne({ 
    userId: userId,
    roleId: adminRole._id 
  });
  
  // Check using userId as ObjectId (just in case)
  var assignment2 = db.user_roles.findOne({ 
    userId: ObjectId(userId),
    roleId: adminRole._id 
  });
  
  if (assignment1) {
    print("✅ Role assignment found (userId as string):");
    print("   _id: " + assignment1._id.toString());
    print("   userId: " + assignment1.userId + " (type: " + typeof assignment1.userId + ")");
    print("   roleId: " + assignment1.roleId.toString());
    print("   createdAt: " + assignment1.createdAt);
  } else if (assignment2) {
    print("✅ Role assignment found (userId as ObjectId):");
    print("   _id: " + assignment2._id.toString());
    print("   userId: " + assignment2.userId.toString() + " (type: ObjectId)");
    print("   roleId: " + assignment2.roleId.toString());
    print("   createdAt: " + assignment2.createdAt);
  } else {
    print("❌ NO role assignment found!");
    print("\n   All user_roles for this user:");
    db.user_roles.find({ userId: userId }).forEach(function(ur) {
      print("   - userId: " + ur.userId + ", roleId: " + ur.roleId.toString());
    });
    db.user_roles.find({ userId: ObjectId(userId) }).forEach(function(ur) {
      print("   - userId: " + ur.userId.toString() + " (ObjectId), roleId: " + ur.roleId.toString());
    });
  }
}

print("\n=== All User-Role Assignments ===");
print("Total assignments: " + db.user_roles.countDocuments());
db.user_roles.find().limit(10).forEach(function(ur) {
  var role = db.roles.findOne({ _id: ur.roleId });
  var userDoc = db.users.findOne({ _id: ObjectId(ur.userId) }) || db.users.findOne({ _id: ur.userId });
  print("   User: " + (userDoc ? userDoc.email : ur.userId) + " -> Role: " + (role ? role.name : ur.roleId.toString()));
});

