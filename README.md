# 🥟 Chowpal — Navigate China Like a Local

Screenshot → Best dishes + Ride there. Free to deploy and use.

## Tech Stack (100% Free)
- **Frontend**: React + Vite
- **Backend**: Vercel Serverless Functions
- **AI**: Google Gemini 2.0 Flash (free tier: 1,500 req/day)
- **Search**: Google Search Grounding (built into Gemini)
- **GPS**: Browser native
- **Ride**: Didi deep link

## Deploy to Vercel (5 minutes)

### Step 1: Get a free Gemini API key
1. Go to https://aistudio.google.com/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy the key

### Step 2: Push to GitHub
```bash
cd chowpal-deploy
git init
git add .
git commit -m "Initial commit"
# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/chowpal.git
git push -u origin main
```

### Step 3: Deploy on Vercel
1. Go to https://vercel.com
2. Click "Import Project" → Select your GitHub repo
3. In "Environment Variables", add:
   - Name: `GEMINI_API_KEY`
   - Value: (paste your Gemini key)
4. Click "Deploy"

Done! You'll get a URL like `https://chowpal.vercel.app` — share it with friends.

## Local Development
```bash
npm install

# Create .env file with your Gemini key
echo "GEMINI_API_KEY=your_key_here" > .env

# For local dev, you need vercel CLI to run the API route:
npm i -g vercel
vercel dev
```

## Project Structure
```
chowpal-deploy/
├── api/
│   └── gemini.js        # Serverless function (Gemini proxy + rate limit)
├── src/
│   ├── App.jsx           # Main Chowpal app
│   └── main.jsx          # React entry
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
```

## Rate Limits
- Gemini free tier: 15 req/min, 1,500 req/day
- Server rate limit: 30 req/hour per IP
- Enough for ~500 daily users

## Cost
$0. Completely free on Vercel Hobby plan + Gemini free tier.
