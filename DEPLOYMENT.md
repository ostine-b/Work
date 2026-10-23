# 🚀 HostelHub Deployment Guide

This guide explains how to deploy your hostel management system to make it accessible online.

## 📋 Prerequisites

Before deploying, you need:
- A GitHub account
- Your code pushed to a GitHub repository

---

## Method 1: Deploy to Render (Recommended - Free)

Render offers a free tier perfect for this application.

### Step 1: Push to GitHub

```powershell
# In the hostel-system directory
git init
git add backend/ frontend/ README.md
git commit -m "Initial commit: Hostel management system"

# Create a new repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/hostel-system.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `hostelhub` (or your choice)
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && node server.js`
   - **Instance Type**: Free

5. Add environment variables (optional):
   - `ADMIN_EMAIL` → `your-admin@email.com`
   - `ADMIN_PASSWORD` → `YourSecurePassword123!`
   - `JWT_SECRET` → `your-random-secret-key-here`

6. Click **"Create Web Service"**

### Step 3: Get Your Link

After deployment (takes 2-5 minutes), Render will give you a URL like:
```
https://hostelhub.onrender.com
```

⚠️ **Note**: Free tier apps sleep after 15 minutes of inactivity. First request may take 30-60 seconds to wake up.

---

## Method 2: Deploy to Railway.app

Railway offers $5 free credit/month and better performance.

### Steps:

1. Go to [railway.app](https://railway.app) and sign up
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. Railway auto-detects Node.js
5. Add these environment variables:
   - `PORT` → `3000`
   - `ADMIN_EMAIL` → `your-admin@email.com` (optional)
   - `ADMIN_PASSWORD` → `YourSecurePassword` (optional)

6. Click **"Deploy"**

Your app will be live at: `https://your-app.up.railway.app`

---

## Method 3: Deploy to Fly.io

Fly.io offers 3 free VMs with fast global deployment.

### Steps:

1. Install Fly CLI:
   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. Sign up and login:
   ```powershell
   fly auth signup
   fly auth login
   ```

3. Create `fly.toml` in your project root:
   ```toml
   app = "hostelhub"

   [build]
   
   [env]
     PORT = "8080"

   [[services]]
     internal_port = 8080
     protocol = "tcp"

     [[services.ports]]
       handlers = ["http"]
       port = 80

     [[services.ports]]
       handlers = ["tls", "http"]
       port = 443
   ```

4. Deploy:
   ```powershell
   fly launch
   fly deploy
   ```

Your app will be live at: `https://hostelhub.fly.dev`

---

## 🔐 Security Recommendations

Before deploying to production:

1. **Change default admin credentials**:
   - Set strong `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables
   
2. **Set a secure JWT_SECRET**:
   ```powershell
   # Generate a random secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Add this as `JWT_SECRET` environment variable

3. **Enable HTTPS**: All recommended platforms (Render, Railway, Fly) provide free SSL certificates automatically

4. **Database backups**: Consider upgrading to a hosted database solution (PostgreSQL) for production use

---

## 🧪 Testing Your Deployment

Once deployed, test these URLs:

1. **Landing page**: `https://your-app-url.com/`
2. **Health check**: `https://your-app-url.com/api/health`
3. **Admin login**: `https://your-app-url.com/pages/admin-login.html`
4. **Student login**: `https://your-app-url.com/pages/student-login.html`

---

## 📧 Sharing Your Link

After deployment, share this with users:

**Main URL**: `https://your-app-url.com`

**User Roles**:
- **Students**: Register at `/pages/student-login.html`
- **Managers**: Register at `/pages/manager-login.html`
- **Admin**: Login at `/pages/admin-login.html`
  - Default: `admin@hostelhub.com` / `Admin@123` (change this!)

---

## 🆘 Troubleshooting

**App won't start?**
- Check logs on your hosting platform dashboard
- Verify `backend/node_modules` are installed
- Ensure `PORT` environment variable is set correctly

**Database errors?**
- SQLite is file-based and works on all platforms
- Database file is created automatically on first run

**Can't login?**
- Check browser console for errors
- Verify API endpoints are accessible (`/api/health`)
- Check that JWT_SECRET environment variable is set

---

## 💡 Quick Share (Temporary Testing)

If you just want to quickly share for testing without full deployment, use **ngrok**:

```powershell
# Install ngrok
winget install ngrok

# Start your server (localhost:3000)
# In a new terminal:
ngrok http 3000
```

Ngrok will give you a temporary URL like: `https://abc123.ngrok.io`

⚠️ **Warning**: This link expires when you close ngrok. Not suitable for permanent deployment.

---

Need help? Check the logs on your hosting platform's dashboard.
