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
- **Mandatory Courses**: Mark courses as mandatory to ensure they appear in every schedule
- **Day Selection**: Choose which days you want to attend classes
- **Closed Sections**: Option to include or exclude closed sections
- **Partial Schedules**: Allow schedules that don't include all selected courses
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
└── university-courses-scraper.js   # Data extraction tool
```

## Usage

### Data Extraction
1. Navigate to your university's course registration system
2. Open browser developer console (F12)
3. Paste and run the scraper script
4. Save the generated JSON file

### Schedule Generation
1. Upload the JSON file on the landing page
2. Select desired courses
3. Configure preferences (credit hours, days, etc.)
4. Click "Generate Schedules"
5. Browse and export your preferred schedule

## Algorithm

The schedule generator uses a **backtracking algorithm** with the following approach:

1. **Course Combination**: Generate all possible section combinations for selected courses
2. **Conflict Detection**: Check for time conflicts between sessions
3. **Filtering**: Apply user preferences (credit hours, days, closed sections)
4. **Scoring**: Rank schedules based on:
   - Registered sections presence
   - Open vs closed sections
   - Gap minimization between classes
   - Course distribution across days

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
