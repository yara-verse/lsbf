# LSBF Advisor

A personal study advisor for the LSBF MBA, Autumn 2026. It has four sections.

- **Today**: the next deadline countdown, advice (deadline clashes, latest start dates, things to check with lecturers, grade warnings), today's study sessions, a calendar of the crunch weeks and every deadline with submit ticks.
- **Study plan**: set your weekday and weekend study hours. The advisor estimates the work in each assessment, builds a day-by-day plan that finishes everything before its deadline, and tells you when you're short on time. Log hours as you go and the plan adjusts.
- **Grades**: enter marks as they come back to see your module average and the mark you need on the rest for a pass (50%), merit (60%) or distinction (70%).
- **Manage**: add, edit or delete assessments, download a `.ics` file for Google, Outlook or Apple Calendar (with a 3-day reminder), and back up or restore your data.

## Run it

It's plain HTML, CSS and JavaScript, so there's nothing to install. Open `index.html` in a browser, or serve the folder to get offline and "Add to Home Screen" support:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Put it online with Supabase sync

The app is hosted on GitHub Pages, and Supabase stores your data and handles sign-in (an emailed link, no password). You do steps 1 to 3 once.

1. **Create the database table.** In your Supabase project, open **SQL Editor → New query**, paste in [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It creates the `advisor_state` table with row level security, so each person can only see their own data.
2. **Connect the app.** In Supabase, open **Project Settings → API**. Copy the **Project URL** and the **anon public** key into [`js/config.js`](js/config.js). The anon key is safe to publish; never use the `service_role` key here.
3. **Turn on hosting.** Push to `main`, then on GitHub open **Settings → Pages** and set **Source** to **GitHub Actions**. The workflow in `.github/workflows/pages.yml` publishes the site to `https://yara-verse.github.io/lsbf/`.
4. **Allow the sign-in link to come back to the app.** In Supabase, open **Authentication → URL Configuration**. Set **Site URL** to `https://yara-verse.github.io/lsbf/` and add the same address under **Redirect URLs**. Add `http://localhost:5173/` too if you want to sign in while testing locally.

Then open the site on your phone, go to **Manage → Sync across devices**, enter your email and open the link on the same phone. Use **Add to Home Screen** to install it like an app.

GitHub Pages needs a public repository on a free GitHub plan. If you'd rather keep the repo private, Netlify or Vercel can host the same files for free; point them at this folder with no build command.

## Your data

The default deadlines are in `js/data.js`. Anything you change in the app (ticks, logged hours, marks, edits) is saved in your browser. When you're signed in, it's also saved to Supabase and synced to every device you sign in on. If two devices change things while offline, the one that syncs last wins. Use **Manage → Download backup** for a copy of your own.

## How the plan works

- **Effort estimate**: about 1 hour per 100 words, 12h for a poster or presentation, 6h for a quiz and 15h for a report with no word count. You can override it per assessment with "Estimated hours".
- **Day-by-day plan**: each day, your available hours go to the unfinished piece with the earliest finish-by date (the deadline minus your buffer days). This front-loads work so you finish early.
- **Start by**: the latest day you can begin a piece and still finish on time, given everything else due.
