# 🚀 Running Migration Scripts Locally

## Prerequisites

You'll need your Railway MongoDB connection string. Get it from:
1. Go to Railway dashboard
2. Select your API service
3. Go to Variables tab
4. Copy the `MONGO_URL` value

---

## 📝 **Commands to Run**

### **1. Add IT Roles**

**Windows PowerShell:**
```powershell
$env:MONGO_URL="mongodb+srv://YOUR-CONNECTION-STRING"; npx tsx apps/api/src/scripts/add_it_roles.ts
```

**Windows CMD:**
```cmd
set MONGO_URL=mongodb+srv://YOUR-CONNECTION-STRING && npx tsx apps/api/src/scripts/add_it_roles.ts
```

**Mac/Linux (Git Bash):**
```bash
MONGO_URL="mongodb+srv://YOUR-CONNECTION-STRING" npx tsx apps/api/src/scripts/add_it_roles.ts
```

**Expected Output:**
```
🔧 Adding IT and IT Manager roles...
✅ IT role added successfully
✅ IT Manager role added successfully

📋 Current roles in database:
   - admin (1 permissions)
   - manager (3 permissions)
   - staff (1 permissions)
   - customer (0 permissions)
   - it (13 permissions)
   - it_manager (21 permissions)
✅ Migration complete!
```

---

### **2. Add Roles & Permissions KB Article**

**Windows PowerShell:**
```powershell
$env:MONGO_URL="mongodb+srv://YOUR-CONNECTION-STRING"; npx tsx apps/api/src/scripts/seed_roles_kb.ts
```

**Windows CMD:**
```cmd
set MONGO_URL=mongodb+srv://YOUR-CONNECTION-STRING && npx tsx apps/api/src/scripts/seed_roles_kb.ts
```

**Mac/Linux (Git Bash):**
```bash
MONGO_URL="mongodb+srv://YOUR-CONNECTION-STRING" npx tsx apps/api/src/scripts/seed_roles_kb.ts
```

**Expected Output:**
```
📚 Seeding Roles & Permissions KB article...
✅ Article created successfully
📋 Article Details:
   - Title: User Roles & Permissions Guide
   - Category: Administration
   - Slug: user-roles-permissions
   - Tags: admin, roles, permissions, security, access control
✅ KB article seeded successfully!
🔗 Access at: /apps/crm/support/kb/user-roles-permissions
```

---

### **3. (Optional) Clean Up Problematic Customer User**

**Windows PowerShell:**
```powershell
$env:MONGO_URL="mongodb+srv://YOUR-CONNECTION-STRING"; npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts user@example.com
```

**Windows CMD:**
```cmd
set MONGO_URL=mongodb+srv://YOUR-CONNECTION-STRING && npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts user@example.com
```

**Mac/Linux (Git Bash):**
```bash
MONGO_URL="mongodb+srv://YOUR-CONNECTION-STRING" npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts user@example.com
```

**Expected Output:**
```
🔧 Attempting to remove customer portal user: user@example.com
📋 User found:
   - ID: 507f1f77bcf86cd799439011
   - Email: user@example.com
   - Name: John Doe
   - Email Verified: false
   - Created: Mon Dec 08 2024
✅ User removed successfully
```

---

## ⚠️ **Important Notes**

1. **Connection String Security**
   - Never commit connection strings to git
   - Keep your MONGO_URL private
   - The connection string is only used during script execution

2. **Safe to Run Multiple Times**
   - All scripts check if data already exists
   - Won't create duplicates
   - Will skip and notify if already exists

3. **PowerShell vs CMD vs Bash**
   - Use the command format for your shell
   - If unsure, try PowerShell first (Windows default)
   - Git Bash users: use the Mac/Linux format

---

## 🎯 **Quick Copy-Paste Template**

Replace `YOUR-CONNECTION-STRING` with your actual Railway MongoDB URL:

**PowerShell (Recommended for Windows):**
```powershell
# Set your connection string once
$env:MONGO_URL="mongodb+srv://YOUR-CONNECTION-STRING"

# Then run commands
npx tsx apps/api/src/scripts/add_it_roles.ts
npx tsx apps/api/src/scripts/seed_roles_kb.ts
```

---

## ✅ **Verification After Running**

### **1. Check Roles in Admin Portal:**
- Login to your app
- Go to Admin Portal
- Click Users tab
- Try to edit a user's role
- Confirm "IT" and "IT Manager" appear in dropdown

### **2. Check KB Article:**
- Go to Admin Portal
- Click "Roles Guide" button (top right)
- Or navigate to: `/apps/crm/support/kb/user-roles-permissions`
- Verify article displays correctly

### **3. Check Customer Portal:**
- Go to Admin Portal
- Click "Customer Portal Users" button
- Verify page loads
- Try creating a test customer user

---

## 🆘 **Troubleshooting**

### **"MONGO_URL environment variable is not set"**
- Make sure you're setting the variable in the same command
- PowerShell: Use `$env:MONGO_URL=`
- CMD: Use `set MONGO_URL=`
- Bash: Use `MONGO_URL=`

### **"Failed to connect to database"**
- Verify your connection string is correct
- Check Railway dashboard for the current MONGO_URL
- Ensure your IP is whitelisted in MongoDB Atlas (if applicable)

### **"Role already exists, skipping..."**
- This is normal! The script is safe to run multiple times
- If you see this, the role is already in your database

---

## 📞 **Need Help?**

If you encounter issues:
1. Copy the error message
2. Check the connection string is correct
3. Verify you're using the right shell syntax
4. Make sure you're in the project root directory

---

**Last Updated:** December 2024

