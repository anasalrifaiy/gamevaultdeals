# Cloudflare Worker Setup Guide

This guide will help you deploy the ITAD API proxy using Cloudflare Workers (100% free!).

## Why do we need this?

IsThereAnyDeal (ITAD) API doesn't support direct browser calls due to CORS restrictions. The Cloudflare Worker acts as a secure proxy that:
- Runs on Cloudflare's edge network (super fast!)
- Adds CORS headers so your browser can access it
- Keeps your API key secure server-side
- Blocks requests from unauthorized domains

## Step 1: Sign up for Cloudflare Workers

1. Go to: https://workers.cloudflare.com/
2. Click **"Sign Up"** (it's free!)
3. Create your account
4. Verify your email

**Free Tier Limits:**
- 100,000 requests/day (more than enough!)
- No credit card required
- Unlimited workers

## Step 2: Create Your Worker

1. In the Cloudflare dashboard, go to **Workers & Pages**
2. Click **"Create Application"**
3. Click **"Create Worker"**
4. Give it a name like: `itad-proxy` or `gamevault-proxy`
5. Click **"Deploy"** (we'll add code in the next step)

## Step 3: Add the Proxy Code

1. After deployment, click **"Edit Code"**
2. **Delete all the default code** in the editor
3. Open `cloudflare-worker.js` from your project
4. **Copy ALL the code** from `cloudflare-worker.js`
5. **Paste it** into the Cloudflare Worker editor
6. Click **"Save and Deploy"**

## Step 4: Get Your Worker URL

After deploying, you'll see your worker URL. It will look like:
```
https://itad-proxy.YOUR-USERNAME.workers.dev
```

**Copy this URL!** You'll need it in the next step.

## Step 5: Update Your Frontend

1. Open `script.js` in your project
2. Find the line that says:
   ```javascript
   WORKER_URL: 'YOUR_WORKER_URL_HERE'
   ```
3. Replace `'YOUR_WORKER_URL_HERE'` with your actual worker URL:
   ```javascript
   WORKER_URL: 'https://itad-proxy.YOUR-USERNAME.workers.dev'
   ```
4. Find the line:
   ```javascript
   USE_ITAD: false,
   ```
5. Change it to:
   ```javascript
   USE_ITAD: true,
   ```
6. Save the file
7. Commit and push to GitHub

## Step 6: Test It!

1. Wait a few minutes for GitHub Pages to update
2. Visit your website: https://gamevaultdeals.com
3. Open browser console (F12)
4. Refresh the page
5. You should see deals loading without CORS errors!

## Security Best Practices

### Option 1: Use Environment Variables (Recommended)

1. In Cloudflare Worker dashboard, go to **Settings** → **Variables**
2. Add a new variable:
   - **Variable name:** `ITAD_API_KEY`
   - **Value:** `99e0e63eb8ed51b7f92fde653aa38ffdead5be40`
   - Click **"Encrypt"** to make it a secret
3. In `cloudflare-worker.js`, change line 17 to:
   ```javascript
   const ITAD_API_KEY = env.ITAD_API_KEY;
   ```
4. Save and deploy

### Option 2: Keep it in Code (Simpler)

The API key is already in the code (line 17). This is fine since:
- ITAD keys are meant for public use
- The worker code is not publicly accessible
- You can add domain restrictions in ITAD dashboard

## Troubleshooting

### "Worker not found" error
- Make sure you copied the correct worker URL
- Check that the worker is deployed (green checkmark in dashboard)

### Still getting CORS errors
- Verify `USE_ITAD: true` in script.js
- Check that `WORKER_URL` is set correctly
- Make sure your website domain is in `ALLOWED_ORIGINS` array

### No deals showing up
- Open browser console (F12) and check for errors
- Test the worker directly: `https://YOUR-WORKER-URL.workers.dev/?limit=10`
- Verify ITAD API key is correct

### Worker returns 403 Forbidden
- Check that your website domain is in the `ALLOWED_ORIGINS` array
- Add your domain if it's missing

## Cost & Limits

**Cloudflare Workers Free Tier:**
- ✅ 100,000 requests/day
- ✅ No credit card required
- ✅ Unlimited workers
- ✅ Global edge network

**Your usage:**
- Each page load = 1 request to worker
- Cache lasts 15 minutes
- Estimated usage: ~100-500 requests/day
- **You'll stay well within free limits!**

## Need Help?

If you encounter issues:
1. Check the Cloudflare Worker logs (in the dashboard)
2. Check browser console for errors
3. Verify all URLs are correct
4. Make sure worker is deployed

## Alternative: Netlify Functions

If you prefer Netlify over Cloudflare:
1. Create a Netlify account
2. Deploy your site to Netlify (instead of GitHub Pages)
3. Create a function file: `netlify/functions/itad-proxy.js`
4. Use similar proxy logic

Both options are free and work great!
