// Broad search for user
print("=== Searching for User ===");
print("");

// Search by email (case-insensitive)
var emailSearch = "qatest1@wolfconsultingnc.com";
print("1. Searching by exact email: " + emailSearch);
var user1 = db.users.findOne({ email: emailSearch });
if (user1) {
  print("   ✅ Found: " + user1.email + " (ID: " + user1._id.toString() + ")");
} else {
  print("   ❌ Not found");
}

// Search by email lowercase
print("\n2. Searching by lowercase email: " + emailSearch.toLowerCase());
var user2 = db.users.findOne({ email: emailSearch.toLowerCase() });
if (user2) {
  print("   ✅ Found: " + user2.email + " (ID: " + user2._id.toString() + ")");
} else {
  print("   ❌ Not found");
}

// Search by partial email
print("\n3. Searching by partial email (contains 'qatest'):");
db.users.find({ email: { $regex: "qatest", $options: "i" } }).forEach(function(u) {
  print("   ✅ Found: " + u.email + " (ID: " + u._id.toString() + ")");
});

// Search by ID directly
print("\n4. Searching by ObjectId: 6904cff0c8dd5d3950744a8b");
try {
  var user3 = db.users.findOne({ _id: ObjectId("6904cff0c8dd5d3950744a8b") });
  if (user3) {
    print("   ✅ Found: " + user3.email + " (ID: " + user3._id.toString() + ")");
  } else {
    print("   ❌ Not found");
  }
} catch (e) {
  print("   ❌ Error: " + e.message);
}

// List all users
print("\n5. All users in database:");
var allUsers = db.users.find().limit(20).toArray();
if (allUsers.length > 0) {
  allUsers.forEach(function(u) {
    print("   - " + u.email + " (ID: " + u._id.toString() + ", name: " + (u.name || "N/A") + ")");
  });
  print("   Total users: " + db.users.countDocuments());
} else {
  print("   ❌ No users found in database!");
}

// Check what database we're in
print("\n=== Database Info ===");
print("Current database: " + db.getName());
print("Collections: " + db.getCollectionNames().join(", "));

// Check user_roles to see what userIds are there
print("\n=== All User-Role Assignments ===");
var allAssignments = db.user_roles.find().toArray();
if (allAssignments.length > 0) {
  allAssignments.forEach(function(ur) {
    // Try to find user by the userId in user_roles
    var userFromRole = null;
    try {
      userFromRole = db.users.findOne({ _id: ObjectId(ur.userId) });
    } catch (e) {
      // userId might be a string, try as string
      userFromRole = db.users.findOne({ _id: ur.userId });
    }
    if (!userFromRole) {
      // Try finding user by string ID
      userFromRole = db.users.findOne({ _id: ur.userId });
    }
    
    var role = db.roles.findOne({ _id: ur.roleId });
    print("   userId: \"" + ur.userId + "\" (type: " + typeof ur.userId + ")");
    print("   roleId: " + ur.roleId.toString());
    print("   role: " + (role ? role.name : "Unknown"));
    print("   user exists: " + (userFromRole ? "✅ " + userFromRole.email : "❌ NOT FOUND"));
    print("");
  });
} else {
  print("   No user-role assignments found");
}

