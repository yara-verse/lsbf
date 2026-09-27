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

## Your data

The default deadlines are in `js/data.js`. Anything you change in the app (ticks, logged hours, marks, edits) is saved in your browser's local storage. Use **Manage → Download backup** to move it to another device.

## How the plan works

- **Effort estimate**: about 1 hour per 100 words, 12h for a poster or presentation, 6h for a quiz and 15h for a report with no word count. You can override it per assessment with "Estimated hours".
- **Day-by-day plan**: each day, your available hours go to the unfinished piece with the earliest finish-by date (the deadline minus your buffer days). This front-loads work so you finish early.
- **Start by**: the latest day you can begin a piece and still finish on time, given everything else due.
