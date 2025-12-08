# 🚀 Quick Start: Running Migration Scripts

## Step 1: Get Your MongoDB URL

1. Go to **Railway Dashboard**
2. Click on your **API service**
3. Go to **Variables** tab
4. Copy the `MONGO_URL` value

It looks like:
```
mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

---

## Step 2: Create .env File (One-Time Setup)

### Option A: Use Git Bash (Recommended)

```bash
# Navigate to the API directory
cd apps/api

# Create .env file with your MONGO_URL
echo "MONGO_URL=your-mongodb-url-here" > .env

# Add other required vars
echo "PORT=3000" >> .env
echo "NODE_ENV=development" >> .env
echo "JWT_SECRET=devsecret_devsecret_devsecret_devsecret" >> .env
echo "ORIGIN=http://localhost:5173" >> .env
```

### Option B: Manual Creation

1. Create file: `apps/api/.env`
2. Add this content:

```env
MONGO_URL=mongodb+srv://your-connection-string-here
PORT=3000
NODE_ENV=development
JWT_SECRET=devsecret_devsecret_devsecret_devsecret
ORIGIN=http://localhost:5173
```

3. Replace `your-connection-string-here` with your Railway MONGO_URL

---

## Step 3: Run the Scripts

From project root (`boaz_v2` directory):

```bash
# Add IT and IT Manager roles
npx tsx apps/api/src/scripts/add_it_roles.ts

# Add Roles & Permissions KB article
npx tsx apps/api/src/scripts/seed_roles_kb.ts

# (Optional) Remove problematic customer user
npx tsx apps/api/src/scripts/cleanup_customer_portal_user.ts user@example.com
```

---

## ✅ Expected Output

### IT Roles:
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

### KB Article:
```
📚 Seeding Roles & Permissions KB article...
✅ Article created successfully
📋 Article Details:
   - Title: User Roles & Permissions Guide
   - Category: Administration
   - Slug: user-roles-permissions
✅ KB article seeded successfully!
🔗 Access at: /apps/crm/support/kb/user-roles-permissions
```

---

## 🆘 Still Getting "MONGO_URL environment variable is not set"?

### Check .env file exists:
```bash
cd apps/api
ls -la .env
```

### Check .env content:
```bash
cat apps/api/.env
```

Should show your MONGO_URL and other vars.

### Alternative: One-Line Command (Git Bash)

If you don't want to create `.env` file:

```bash
cd apps/api && MONGO_URL="your-mongodb-url" npx tsx src/scripts/add_it_roles.ts
cd apps/api && MONGO_URL="your-mongodb-url" npx tsx src/scripts/seed_roles_kb.ts
```

---

## 📁 Important Notes

- **`.env` is gitignored** - Never commit it!
- **Use Railway MONGO_URL** - This connects to your production database
- **Scripts are safe to run multiple times** - They check for existing data
- **Run from project root** or use `cd apps/api` first

---

## 🎯 Quick Copy-Paste (Update MONGO_URL first!)

```bash
# Create .env file (replace with your actual URL)
cd apps/api
echo 'MONGO_URL=mongodb+srv://YOUR-URL-HERE' > .env
echo 'PORT=3000' >> .env
echo 'NODE_ENV=development' >> .env
echo 'JWT_SECRET=devsecret_devsecret_devsecret_devsecret' >> .env
echo 'ORIGIN=http://localhost:5173' >> .env

# Go back to project root
cd ../..

# Run scripts
npx tsx apps/api/src/scripts/add_it_roles.ts
npx tsx apps/api/src/scripts/seed_roles_kb.ts
```

---

**Last Updated:** December 2024

