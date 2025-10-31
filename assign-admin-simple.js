// Simple MongoDB query to assign admin role
// Copy and paste this entire block into MongoDB shell or Compass

var adminRole = db.roles.findOne({ name: "admin" });
if (!adminRole) {
  print("ERROR: Admin role not found. Run the API server to initialize default roles.");
} else {
  var userId = "6904cff0c8dd5d3950744a8b";
  var existing = db.user_roles.findOne({ userId: userId, roleId: adminRole._id });
  if (existing) {
    print("✅ User already has admin role.");
  } else {
    db.user_roles.insertOne({
      _id: ObjectId(),
      userId: userId,
      roleId: adminRole._id,
      createdAt: new Date()
    });
    print("✅ Admin role assigned to user: 6904cff0c8dd5d3950744a8b");
    print("   Email: qatest1@wolfconsultingnc.com");
    print("   Role: admin");
    print("\n⚠️  IMPORTANT: User must log out and log back in for changes to take effect!");
  }
}

