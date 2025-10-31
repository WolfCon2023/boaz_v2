// Complete diagnostic query for checking admin role assignment
// Run this in mongosh

var userId = "6904cff0c8dd5d3950744a8b";
var userEmail = "qatest1@wolfconsultingnc.com";

print("============================================");
print("COMPLETE ADMIN ROLE DIAGNOSTIC");
print("============================================\n");

// 1. Check if user exists
print("1. Checking user...");
var user = db.users.findOne({ _id: ObjectId(userId) });
if (user) {
  print("   ✅ User found:");
  print("      _id: " + user._id.toString());
  print("      email: " + user.email);
  print("      name: " + (user.name || "N/A"));
  print("");
} else {
  print("   ❌ User NOT found with ID: " + userId);
  print("");
  var userByEmail = db.users.findOne({ email: userEmail });
  if (userByEmail) {
    print("   ℹ️  User found by email, but ID mismatch!");
    print("      Found ID: " + userByEmail._id.toString());
    print("      Expected ID: " + userId);
    print("");
  }
}

// 2. Check if admin role exists
print("2. Checking admin role...");
var adminRole = db.roles.findOne({ name: "admin" });
if (adminRole) {
  print("   ✅ Admin role found:");
  print("      _id: " + adminRole._id.toString());
  print("      name: " + adminRole.name);
  print("      permissions: " + JSON.stringify(adminRole.permissions));
  print("");
} else {
  print("   ❌ Admin role NOT found!");
  print("   Available roles:");
  db.roles.find().forEach(function(role) {
    print("      - " + role.name + " (ID: " + role._id.toString() + ")");
  });
  print("");
}

// 3. Check user_roles assignment (userId as STRING - this is what the backend uses!)
print("3. Checking role assignment (userId as STRING)...");
if (adminRole && user) {
  var assignment = db.user_roles.findOne({ 
    userId: userId,  // Must be string, not ObjectId!
    roleId: adminRole._id 
  });
  
  if (assignment) {
    print("   ✅ Role assignment FOUND:");
    print("      _id: " + assignment._id.toString());
    print("      userId: \"" + assignment.userId + "\" (type: " + typeof assignment.userId + ")");
    print("      roleId: " + assignment.roleId.toString());
    print("      createdAt: " + assignment.createdAt);
    print("");
    print("   ✅ This should work correctly!");
  } else {
    print("   ❌ NO role assignment found with userId as STRING!");
    print("");
    
    // Check if it exists with ObjectId (wrong format)
    print("   Checking for assignment with userId as ObjectId (wrong format)...");
    var assignmentWrong = db.user_roles.findOne({ 
      userId: ObjectId(userId),
      roleId: adminRole._id 
    });
    if (assignmentWrong) {
      print("   ⚠️  Found assignment with ObjectId format (this won't work!):");
      print("      userId type: " + assignmentWrong.userId.constructor.name);
      print("      You need to fix this - userId must be a STRING");
      print("");
    }
    
    // Show all assignments for this user
    print("   All user_roles entries for this user:");
    var count = 0;
    db.user_roles.find({ userId: userId }).forEach(function(ur) {
      count++;
      var role = db.roles.findOne({ _id: ur.roleId });
      print("      ✅ Found (string): userId=\"" + ur.userId + "\", role=" + (role ? role.name : ur.roleId.toString()));
    });
    db.user_roles.find({ userId: ObjectId(userId) }).forEach(function(ur) {
      count++;
      var role = db.roles.findOne({ _id: ur.roleId });
      print("      ⚠️  Found (ObjectId): userId=" + ur.userId.toString() + " (type: ObjectId), role=" + (role ? role.name : ur.roleId.toString()));
    });
    if (count === 0) {
      print("      ❌ No assignments found at all!");
    }
    print("");
  }
}

// 4. Simulate backend query (what the API actually does)
print("4. Simulating backend query (what the API does)...");
if (user && adminRole) {
  // This is exactly what the backend does at line 70 of rbac.ts:
  // const joins = await db.collection('user_roles').find({ userId: auth.userId })
  var backendQuery = db.user_roles.find({ userId: userId }).toArray();
  
  if (backendQuery.length > 0) {
    print("   ✅ Backend query would find " + backendQuery.length + " role assignment(s):");
    backendQuery.forEach(function(ur) {
      var role = db.roles.findOne({ _id: ur.roleId });
      print("      - Role: " + (role ? role.name : ur.roleId.toString()));
      if (role) {
        print("        Permissions: " + JSON.stringify(role.permissions));
        if (role.permissions && role.permissions.includes("*")) {
          print("        ✅ Has admin permission (*)");
        }
      }
    });
    print("");
  } else {
    print("   ❌ Backend query would find NO roles!");
    print("   This means the user cannot access admin endpoints.");
    print("");
  }
}

// 5. Summary and fix instructions
print("============================================");
print("SUMMARY");
print("============================================");
if (user && adminRole) {
  var correctAssignment = db.user_roles.findOne({ userId: userId, roleId: adminRole._id });
  if (correctAssignment) {
    print("✅ Everything looks correct!");
    print("");
    print("If admin portal still doesn't work:");
    print("1. Make sure you LOGGED OUT and LOGGED BACK IN");
    print("2. Clear your browser cache/cookies");
    print("3. Check browser console for errors");
    print("4. Verify API is returning correct data: GET /api/auth/me/roles");
  } else {
    print("❌ Role assignment missing or incorrect!");
    print("");
    print("To fix, run this query:");
    print("---");
    print("var adminRole = db.roles.findOne({ name: 'admin' });");
    print("db.user_roles.insertOne({");
    print("  _id: ObjectId(),");
    print("  userId: '" + userId + "',");
    print("  roleId: adminRole._id,");
    print("  createdAt: new Date()");
    print("});");
    print("---");
  }
} else {
  print("❌ Prerequisites missing (user or admin role not found)");
}

