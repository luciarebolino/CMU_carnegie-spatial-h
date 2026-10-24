# Hurricane Trails

Each student picks a hurricane, makes a satellite video of it in Google Earth Engine,
and turns it into a small web page where the storm moves across the screen like a
brush, leaving a trail of its own clouds behind it. All the pages live in one shared
GitHub repo. A collective page stacks every student's storm on one map, and where two
paths cross, a few seconds of a sound chosen by the students play.

```
Earth Engine ─► video.mp4 + frames.geojson ─► students/<name>/   (each student)
                                                     │
                       index.html (collective) ◄─────┘   all storms on one map
```

## What's in the repo

```
index.html                    the collective page (instructor)
students.json                 the student folders, for running it on your laptop
gee/hurricane_goes_loop.js    the Earth Engine script
students/
  _template/                  copy this folder to start
    index.html                  your page (you edit the SETTINGS at the top)
    storms.json                 the list of your storm(s)
  lucia/, ian-cloud-phase/,   example students (Ian 2022, Delta 2020, Eta 2020)
  bob/, ugo/
```

---

## For students

### 1. Make your video in Earth Engine

1. Open the [Earth Engine Code Editor](https://code.earthengine.google.com/), paste the whole
   `gee/hurricane_goes_loop.js` and click **Run**. A panel appears on the left.
2. Type a **year** and click **Show storms**. Every storm of that year is drawn on the map.
   Pick one in the list, **or click its track**.
3. Pick a **composite**: how the satellite picture is colored (see the
   [table below](#composites)). *Clean IR* and *Enhanced IR* work day and night; the
   ones marked *day only* go black at night.
4. **Minutes between frames**: 60 is a good start. For a storm that lasted more than
   ~10 days, use 120 (fewer frames, faster export).
5. Click **Preview**. You'll see the first frame of the video, the video's box (white),
   and the track (yellow dots = the part in the video). The image is *one moment*,
   not the whole storm; the storm is at the first yellow dot.
6. Tick **Quick test** and click **Export**. In the **Tasks** tab, click **RUN** on both
   tasks. A few minutes later, two files are in Google Drive → `gee_hurricanes`:
   a `.mp4` and a `_frames.geojson`.
7. Check the short clip in your page (step 2), then untick *Quick test* and export the
   whole storm.

*Clouds only (black background)* is optional: it blacks out everything that isn't
cloud before exporting. You normally don't need it (see `key` below).

### 2. Make your folder

1. Clone the class repo and open it in **VS Code**.
2. Copy `students/_template` and rename the copy `students/<your-name>`
   (lowercase, no spaces).
3. Put your two files from Drive in it.
4. Open `storms.json` and write your files' names:

   ```json
   [
     {
       "video": "IAN_2022_Clean_IR_Longwave_C13_.mp4",
       "frames": "IAN_2022_Clean_IR_Longwave_C13__frames.geojson",
       "invert": true,
       "key": "brightness",
       "sound": "https://www.youtube.com/watch?v=..."
     }
   ]
   ```

   | field | what to write |
   |---|---|
   | `video`, `frames` | your two files' names |
   | `invert` | only matters on a white page: `true` = dark clouds (good for Clean IR) · `false` = keep the colors. On black it's ignored (clouds stay light). |
   | `key` | how the clear sky disappears: `"brightness"` or `"background"`, see the [table](#composites) |
   | `sound` | optional: a **YouTube link**, or a sound/video file in your folder (`"rain.mp3"`). On the collective page, where your storm crosses someone else's, 8 seconds of it play from a random point. Leave `""` for none. |

   More than one storm? Add another `{ … }` after the first, separated by a comma.
5. Install the **Live Server** extension, right-click `index.html` → **Open with Live Server**.
   (The page loads your files with `fetch`, which doesn't work if you just double-click it.)

### 3. Make it yours

Open `index.html`. At the top, **SETTINGS** is all you need to change:

| setting | what it does |
|---|---|
| `BACKGROUND` | the page color: `'black'` (default), `'white'`, `'#f4efe6'`… |
| `SPEED` | `1` = normal, `0.5` = half speed |
| `BRUSH_KM` | how wide the trail is (km on Earth) |
| `BRUSH_OPACITY` | how thick the paint is: `0.03` airy … `0.8` solid |
| `BRUSH_SOFT` | the trail's edges: `0` sharp … `1` very soft |
| `SHOW_HEAD`, `HEAD_KM`, `HEAD_SOFT` | the storm "now", on top of its trail |
| `GRAIN`, `GRAIN_MOVING` | film-like texture |

Then try the ideas in **TRY THIS** at the bottom of the file. The rest of the code works
as it is, with comments explaining each step; read it and change it if you like, but
leave the block marked **DON'T REMOVE** (the collective page needs it).

The page has no text on it, only your storm(s). Keys: **space** pause · **R** restart ·
**F** full screen.

### 4. Share it

Commit and push your folder (or upload it on github.com). That's all: the collective
page finds it by itself. Your folder needs your video, your `_frames.geojson`, your
`storms.json` and your `index.html`. Keep each `.mp4` under 25 MB for web uploads;
100 MB is GitHub's limit.

---

## For the instructor

### Setup
1. Turn on **GitHub Pages** (Settings → Pages → deploy from `main`, root). The collective
   page (tab title **UA**) is the site's front page; each student's page is at
   `/students/<name>/` (tab title: the folder's name).
2. On GitHub Pages, the collective page **finds every folder in `students/` by itself**
   (it asks GitHub; folders starting with `_`, like `_template`, are skipped). Students
   just push their folder.
3. To run it on your laptop: list the folders in `students.json`
   (`["lucia", "bob", "ugo"]`), run `python3 -m http.server` in the repo and open
   <http://localhost:8000>. (Also used if GitHub can't be reached.)
4. A folder that's broken is skipped; the browser console says which.

### The collective page
- Every student page is loaded full screen on a transparent background. They all get the
  same map (the area covering every path), so the storms land where they really went,
  each drawn by its student's own code. On white, they blend like ink (`multiply`).
- It **starts black**. On black, every storm shows its clouds light (whatever its
  `invert`); on white, each student's `invert` is used. On white, storms blend like ink
  (`multiply`); on black, like light (`screen`).
- No text on screen except a small key guide, bottom-left: **W** black ↔ white (blue
  tick = black) · **B** next blend (its name is shown) · **R** restart · **H** hide the guide.
- Sound comes on with your first key press or click (browsers block it until then).
  For full screen, use the browser's own (⌃⌘F in Chrome on a Mac).
- Storm and crossing counts, and anything that fails to load, are in the browser console.
- 20–30 students is fine on a recent Mac.

### Crossings
- The page finds every place where two storms' paths cross, **in space only**, whatever
  their dates. Two students who picked the same storm don't count as crossing.
- Each student page tells the collective page where its storms are. When a storm comes
  within 80 km of a crossing, **that storm's** `sound` plays for 8 seconds from a random
  point, fading in and out (if it has none, the other storm's is used). Each crossing
  plays once per storm per loop; the same sound never plays twice at once.
- A sound **file** plays with nothing on screen. A **YouTube link** plays through
  YouTube's player, which YouTube requires to be visible while it plays: a small
  200×200 player fades in bottom-right for those 8 seconds. For pure sound, use files.
- The example storms cross: Ian 2022 × Delta 2020 at 17.6°N 81.6°W; Eta 2020 × Ian four
  times (Caribbean, western Cuba, off SW Florida, off the Carolinas) and × Delta once
  (18.8°N 83.8°W). Bob's sound is `test-tone.mp4`, a placeholder test tone.

---

## Reference

### Composites

| composite | day / night | clear sky | `key` |
|---|---|---|---|
| Clean IR Longwave (C13) | both | dark | `"brightness"` |
| Enhanced IR (color) | both | dark | `"brightness"` |
| Simple Water Vapor | both | colored | `"background"` |
| Differential Water Vapor | both | colored | `"background"` |
| Sandwich | day only | dark | `"brightness"` |
| Day Land Cloud | day only | dark (land stays) | `"brightness"` |
| Natural Color | day only | dark (land stays) | `"brightness"` |
| Air Mass | both | colored | `"background"` |
| Day Convection | day only | colored | `"background"` |
| Day Cloud Phase | day only | dark | `"brightness"` |
| Nighttime Microphysics | both | colored (blue) | `"background"` |
| Dust | both | colored | `"background"` |
| Split Window Difference | both | gray | `"background"` |

`"brightness"`: dark parts of the picture disappear. `"background"`: the picture's most
common hue disappears, in all its shades, like a green screen.

What each composite shows and what its colors mean:
[CIRA quick guides](https://rammb2.cira.colostate.edu/guide_tax/quick-guides) ·
[CIMSS quick guides](https://cimss.ssec.wisc.edu/goes/GOESR_QuickGuides.html).

### Good to know
- **Satellites:** GOES-16 (East) sees the Atlantic, 2017 – April 2025; GOES-17/18 (West)
  see the eastern Pacific. Nothing before 2017.
- **Storm tracks** come from [IBTrACS](https://www.ncei.noaa.gov/products/international-best-track-archive)
  (`NOAA/IBTrACS/v4` in Earth Engine), one point every 3 hours; the Earth Engine copy
  ends in May 2024.
- **Export time** depends on the number of frames and the composite (Clean IR reads one
  band, Day Convection six). Quick test first; 120 minutes between frames for long storms.
  A whole class exporting at once shares Earth Engine's queue: tasks can wait as
  *Ready* for a while before they start.
- **The preview's big hurricane may be another storm**: the image shows everything the
  satellite sees at that moment (for Ian, Hurricane Fiona is in the first frame too).
- **Use Chrome** for the pages (the soft edges use canvas features older Safari lacks).
- **How it lines up:** the video covers a fixed lat/lon box around the track, in Web
  Mercator (EPSG:3857). Each row of the `_frames.geojson` is one video frame: `frame`,
  `time_utc`, `lon`, `lat` (the eye, interpolated between IBTrACS points), `wind_kt`,
  `pressure_mb`, `category`, the box's `west/south/east/north`, `fps`. The page uses the
  same projection, so the eye in the picture lands on the eye's position.
