# University Schedule Generator

An intelligent academic schedule builder designed for university students. Automatically generates conflict-free schedules based on course availability and student preferences.

## Features

### Smart Schedule Generation
- **Conflict Detection**: Automatically detects and prevents time conflicts between courses
- **Multiple Solutions**: Generates hundreds of valid schedule combinations
- **Flexible Filtering**: Customize credit hours, days, and section preferences
- **Priority System**: Support for pre-registered sections with higher priority

### User-Friendly Interface
- **Course Selection**: Easy-to-use interface for selecting courses
- **Real-time Validation**: Instant feedback on schedule conflicts
- **Visual Schedule Display**: Clear weekly calendar view of generated schedules
- **Export Functionality**: Download schedules as JPEG images for easy sharing

### Advanced Features
- **Preferred Instructors**: Search and pick your preferred instructors — either as a ranking boost or as a hard filter
- **Mandatory Courses**: Mark courses as mandatory to ensure they appear in every schedule
- **Day Selection**: Choose which days you want to attend classes
- **Closed Sections**: Option to include or exclude closed sections
- **Partial Schedules**: Allow schedules that don't include all selected courses
- **Sorting**: Order results by overall score, fewest attendance days, or fewest gaps
- **Duplicate-Free Results**: Every result is a distinct schedule, with an option to collapse schedules that share an identical timetable
- **Scoring System**: Schedules are ranked based on quality metrics

## Technical Stack

### Frontend
- Pure JavaScript (ES6+)
- HTML5 & CSS3

### Libraries Used
- `html2canvas` - For schedule export functionality
- Cairo Font - Arabic language support


## File Structure

```
project/
├── index.html                      # Landing page
├── schedule-builder.html           # Main schedule builder interface
├── styles.css                      # Global styles
├── landing-script.js               # Landing page logic
├── schedule-script.js              # Core scheduling algorithm
├── export-schedule.js              # Export functionality
├── university-courses-scraper.js   # Data extraction tool (single source of truth)
├── extension/                      # Chrome extension (see extension/README.md)
│   ├── manifest.json
│   ├── popup.html / popup.css / popup.js
│   ├── scraper-core.js             # Generated from university-courses-scraper.js
│   ├── scraper-runner.js           # Drives the scrape inside the university page
│   ├── bridge.js                   # Hands the data to this site
│   ├── background.js               # Badge + opens the site when done
│   └── icons/
└── tools/
    ├── sync-scraper.js             # Regenerates extension/scraper-core.js
    └── make-icons.js               # Regenerates the extension icons
```

The landing page fetches `university-courses-scraper.js` at runtime instead of
embedding a copy, so the script a student copies is always the script in the
repository. (This means the landing page needs to be served over HTTP — opening
`index.html` directly from disk with `file://` will block the fetch.)

## Usage

### Option A — Chrome Extension (recommended)
1. Install the unpacked extension from `extension/` (see [extension/README.md](extension/README.md))
2. Open your university's "offered courses" page
3. Click the extension icon and press "ابدأ السحب"
4. The extension then drives the tab to the "registered courses" page, reads the
   sections you are already registered in, and fills them into the builder
5. The schedule builder opens automatically with everything loaded

### Option B — Console Script
1. Navigate to your university's course registration system
2. Open browser developer console (F12)
3. Paste and run the scraper script
4. Save the generated JSON file

### Schedule Generation
1. Upload the JSON file on the landing page (skipped when using the extension)
2. Select desired courses
3. Configure preferences (credit hours, days, preferred instructors, etc.)
4. Click "Generate Schedules"
5. Sort the results, then browse and export your preferred schedule

## Development

```bash
# Serve locally (the landing page fetches the scraper over HTTP)
python3 -m http.server 8000

# After editing university-courses-scraper.js, regenerate the extension copy
node tools/sync-scraper.js
node tools/sync-scraper.js --check   # verify the two are in sync

# Regenerate extension icons
node tools/make-icons.js
```

## Algorithm

The schedule generator uses a **backtracking algorithm** with the following approach:

1. **Pruning**: Sections on excluded days (and, optionally, closed sections or
   non-preferred instructors) are dropped before the search starts
2. **Course Combination**: Generate all possible section combinations for selected courses
3. **Conflict Detection**: Check for time conflicts incrementally as each section is added
4. **Recording**: A schedule is recorded only when its branch is complete, and only
   if its section-set fingerprint has not been seen — this is what keeps results
   free of duplicates
5. **Scoring**: Rank schedules based on:
   - Preferred instructors
   - Open vs closed sections
   - Gap minimization between classes
   - Course distribution across days

Sections you are already registered in are kept in the pool even when closed,
but they carry no scoring bonus — they are scored as open sections. Ranking by
what you already hold would push worse timetables to the top.

## Performance

- **Processing Speed**: Generates 1000+ schedules in ~2-3 seconds
- **Export Speed**: JPEG export in 1-1.5 seconds
- **Memory Efficient**: Handles large course datasets without performance degradation

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Contact

For questions or feedback, please open an issue on GitHub.

---

**Note**: This tool is independent and not officially affiliated with any university.
