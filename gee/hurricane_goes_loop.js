// =====================================================================
// HURRICANE GOES LOOP
// A satellite video of one hurricane + where its eye is in every frame.
// =====================================================================
// HOW TO USE (paste this whole file in the Earth Engine Code Editor, Run):
//   1. Year + Show storms: every storm of that year appears on the map.
//      Pick one in the list, or click its track.
//   2. Composite: how the satellite picture is colored (see COMPOSITES).
//      Minutes between frames: 60 is a good start (120 for long storms).
//   3. Preview: the first frame, the video's box and the track.
//   4. Tick "Quick test" and Export: a short clip, ready in a few minutes.
//      Tasks tab -> RUN on both tasks. Untick it for the whole storm.
//   5. From Drive > gee_hurricanes, put the .mp4 and the _frames.geojson in
//      your folder (students/<your-name>/) and list them in storms.json.
//
// You don't need to change anything below to use it. SETTINGS has the
// defaults; COMPOSITES has the color recipes (add your own there).
//
// How it works: the video covers a fixed lat/lon box around the track, in
// Web Mercator (EPSG:3857), so the web page can put it back on its map.
// The _frames.geojson has one row per video frame: time, eye position
// (lon/lat), wind, and the box's edges.

// =================== SETTINGS ===================
var DEFAULTS = {
  name: 'IAN',         // selected when the page opens
  season: '2022',
  satellite: 'NOAA/GOES/16/MCMIPF',
  composite: 'Clean IR Longwave (C13)',
  stepMinutes: '60',   // one frame every N minutes (GOES full disk = 10 min)
  padDegrees: 6,       // margin around the track (room for the trail and head)
  fps: 10,
  videoDims: 720,      // longest side of the video, in pixels (smaller = faster)
  previewFrames: 24,   // the animated preview only shows the first N frames
  quickFrames: 24,     // "Quick test" exports only the first N frames
  // "Clouds only": fade to black what isn't cloud, using cloud-top temperature
  // (infrared band 13, in every frame whatever the composite)
  cloudWarm: 15,       // °C: warmer than this = clear sky (ocean, land) -> black
  cloudCold: -10       // °C: colder than this = cloud -> full color
};

// id: the image collection; lon: where the satellite sits above the equator
// (it sees about 65° of longitude to each side).
var SATELLITES = {
  'GOES-16 (East, 2017-2025)': {id: 'NOAA/GOES/16/MCMIPF', lon: -75.2},
  'GOES-17 (West, 2018-2023)': {id: 'NOAA/GOES/17/MCMIPF', lon: -137.2},
  'GOES-18 (West, 2022-)': {id: 'NOAA/GOES/18/MCMIPF', lon: -137.2}
};

var IBTRACS = ee.FeatureCollection('NOAA/IBTrACS/v4');

// =================== TRACK ===================
// SEASON may be stored as a number or as text, so accept both.
function inSeason(season) {
  return ee.Filter.or(
    ee.Filter.eq('SEASON', season),
    ee.Filter.eq('SEASON', String(season))
  );
}

// =================== STORMS OF A YEAR ===================
// Every storm of one year, brought into the browser in one go (a few thousand
// points at most): the map draws their tracks, the list shows their names,
// and the box and frame positions are computed here from the chosen track.
// No basin filter: the code "NA" (North Atlantic) is often read as "missing".
// The points come back as plain lists (one row of values per point), not as
// features: a busy year worldwide has more than the 5000 features Earth
// Engine will send to the browser at once.
var COLUMNS = ['sid', 'name', 'iso', 'lon', 'lat', 'wind', 'pressure', 'category'];
var NONE = -999;   // stands in for a missing value (rows with a gap would be dropped)

function fetchSeason(season, done) {
  var orNone = function(v) { return ee.Algorithms.If(ee.Algorithms.IsEqual(v, null), NONE, v); };
  IBTRACS
    .filter(inSeason(season))
    .filter(ee.Filter.neq('TRACK_TYPE', 'spur'))              // side branches
    .filter(ee.Filter.neq('TRACK_TYPE', 'PROVISIONAL_spur'))
    .map(function(f) {
      var xy = f.geometry().coordinates();
      return ee.Feature(null, {
        sid: f.get('SID'), name: orNone(f.get('NAME')), iso: f.get('ISO_TIME'),
        lon: xy.get(0), lat: xy.get(1),
        wind: orNone(f.get('USA_WIND')), pressure: orNone(f.get('USA_PRES')),
        category: orNone(f.get('USA_SSHS'))
      });
    })
    .reduceColumns(ee.Reducer.toList(COLUMNS.length), COLUMNS)
    .get('list')
    .evaluate(function(rows, err) {
      if (err) { done(null, err); return; }
      var tracks = {};   // sid -> {sid, name, points}
      rows.forEach(function(row) {
        var p = {};
        COLUMNS.forEach(function(c, i) { p[c] = row[i] === NONE ? null : row[i]; });
        p.t = Date.parse(String(p.iso).replace(' ', 'T') + 'Z');   // "2022-09-28 18:00:00", UTC
        if (!tracks[p.sid]) tracks[p.sid] = {sid: p.sid, name: p.name, points: []};
        tracks[p.sid].points.push(p);
      });
      done(Object.keys(tracks).map(function(sid) {
        var tr = tracks[sid];
        tr.points.sort(function(a, b) { return a.t - b.t; });
        tr.maxWind = Math.max.apply(null, tr.points.map(function(p) { return p.wind || 0; }));
        return tr;
      }));
    });
}

// Can this satellite see (most of) the track?
function inView(track, satLon) {
  var seen = track.points.filter(function(p) {
    var d = Math.abs(((p.lon - satLon) % 360 + 540) % 360 - 180);   // longitude gap, -180..180
    return d < 65;
  });
  return seen.length > track.points.length / 2;
}

function trackLabel(tr) {
  var d = new Date(tr.points[0].t);
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return tr.name + '  ·  ' + months[d.getUTCMonth()] + ' ' + d.getUTCDate() +
    '  ·  ' + (tr.maxWind ? tr.maxWind + ' kt' : '?');
}

// =================== IMAGERY ===================
function applyScaleAndOffset(img, bandList) {
  var scales = bandList.map(function(b) { return img.get(b + '_scale'); });
  var offsets = bandList.map(function(b) { return img.get(b + '_offset'); });
  var scaled = img.select(bandList)
    .multiply(ee.Image.constant(scales))
    .add(ee.Image.constant(offsets));
  return img.addBands(scaled, null, true);
}

// min > max is allowed and inverts the band (used for "cold = bright").
function normalize(img, min, max) {
  min = ee.Number(min);
  max = ee.Number(max);
  return img.subtract(min).divide(max.subtract(min)).clamp(0, 1);
}

function celsius(img, band) {
  return img.select(band).subtract(273.15);
}

// GOES frames between two dates, thinned to one per step.
function getFrames(satellite, start, end, stepMinutes) {
  var stepMs = stepMinutes * 60 * 1000;
  var thinned = ee.ImageCollection(satellite)
    .filterDate(start, end)
    .map(function(img) {
      return img.set('slot', ee.Number(img.get('system:time_start')).divide(stepMs).floor());
    })
    .distinct('slot');
  // distinct() returns a generic collection, so cast it back to images.
  return ee.ImageCollection(thinned).sort('system:time_start');
}

// Turns a raw GOES image into a 0-1 RGB image using a composite recipe.
// Gamma is applied here (not in vis params) so preview and export match.
// cloudsOnly: everything that isn't cloud fades to black (the web page then
// makes black see-through), so any composite keeps its colors on the clouds.
function render(img, c, cloudsOnly) {
  img = ee.Image(img);
  var rgb = c.rgb(applyScaleAndOffset(img, c.bands));
  var bands = ['R', 'G', 'B'].map(function(b) {
    var gamma = typeof c.gamma === 'number' ? c.gamma : c.gamma[b];   // one for all, or one per color
    return normalize(rgb.select(b), c.ranges[b][0], c.ranges[b][1]).pow(1 / gamma);
  });
  var out = ee.Image.cat(bands).rename(['R', 'G', 'B']);
  if (cloudsOnly) {
    // 0 = clear sky, 1 = cloud, with a soft ramp in between (thin cloud edges)
    var temp = celsius(applyScaleAndOffset(img, ['CMI_C13']), 'CMI_C13');
    out = out.multiply(normalize(temp, DEFAULTS.cloudWarm, DEFAULTS.cloudCold));
  }
  return out.set('system:time_start', img.get('system:time_start'));
}

// =================== COMPOSITES ===================
// Brightness temperatures are converted to °C, reflectances are 0-1.
// Ranges follow the standard RGB recipes. What each one shows, and what its
// colors mean, is in the quick guides (1-2 page PDFs):
//   https://rammb2.cira.colostate.edu/guide_tax/quick-guides
//   https://cimss.ssec.wisc.edu/goes/GOESR_QuickGuides.html

// A color scale for cloud-top temperature, from +30 °C (left) to -90 °C
// (right), one color every 10 °C: warm = black/gray, cold = cyan, blue,
// green, yellow, red, magenta, white. Used by Enhanced IR and Sandwich.
var IR_COLORS = ['000000', '1c1c1c', '383838', '555555', '717171', '8d8d8d', 'aaaaaa',
                 '00ffff', '0066ff', '00cc00', 'ffff00', 'ff0000', 'ff00ff', 'ffffff'];

function colorByTemperature(temp, palette) {
  return normalize(temp, 30, -90)
    .visualize({min: 0, max: 1, palette: palette})
    .divide(255).rename(['R', 'G', 'B']);
}

var composites = {
  // Works day AND night: the safest choice for a multi-day hurricane loop.
  'Clean IR Longwave (C13)': {
    bands: ['CMI_C13'],
    rgb: function(img) {
      var t = celsius(img, 'CMI_C13');
      return ee.Image.cat([t, t, t]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [30, -80], G: [30, -80], B: [30, -80]},  // cold cloud tops = bright
    gamma: 1.0
  },

  // The classic hurricane picture: Clean IR with a color scale for cold tops.
  // Day and night. Clear sky is dark (works with the page's default cut).
  'Enhanced IR (color)': {
    bands: ['CMI_C13'],
    rgb: function(img) { return colorByTemperature(celsius(img, 'CMI_C13'), IR_COLORS); },
    ranges: {R: [0, 1], G: [0, 1], B: [0, 1]},
    gamma: 1.0
  },

  // Moisture at three heights (dry = orange, moist = green/white). Day and
  // night. Clear sky is colored: use "key": "background" on the page.
  'Simple Water Vapor': {
    bands: ['CMI_C08', 'CMI_C10', 'CMI_C13'],
    rgb: function(img) {
      return ee.Image.cat([
        celsius(img, 'CMI_C13'),
        celsius(img, 'CMI_C08'),
        celsius(img, 'CMI_C10')
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [5.81, -70.86], G: [-30.48, -58.49], B: [-12.12, -28.03]},
    gamma: 1.0
  },

  // Dry and moist layers in the upper air. Day and night. Clear sky is
  // colored: use "key": "background" on the page.
  'Differential Water Vapor': {
    bands: ['CMI_C08', 'CMI_C10'],
    rgb: function(img) {
      return ee.Image.cat([
        img.select('CMI_C10').subtract(img.select('CMI_C08')),
        celsius(img, 'CMI_C10'),
        celsius(img, 'CMI_C08')
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [-3, 30], G: [5, -60], B: [-29.25, -64.65]},
    gamma: {R: 0.2587, G: 0.4, B: 0.4}
  },

  // Visible texture (band 2) times the Enhanced IR colors: you see both the
  // bumps of the cloud tops and how cold they are. Daytime only.
  'Sandwich (day only)': {
    bands: ['CMI_C02', 'CMI_C13'],
    rgb: function(img) {
      var visible = img.select('CMI_C02').sqrt().clamp(0, 1);   // brighten dark areas a little
      // warm parts stay white (so the visible shows through), cold parts get colors
      var colors = colorByTemperature(celsius(img, 'CMI_C13'),
        ['ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff', 'ffffff'].concat(IR_COLORS.slice(7)));
      return colors.multiply(visible).rename(['R', 'G', 'B']);
    },
    ranges: {R: [0, 1], G: [0, 1], B: [0, 1]},
    gamma: 1.0
  },

  // Land green/brown, clouds white and cyan, ocean black. Daytime only.
  'Day Land Cloud (day only)': {
    bands: ['CMI_C02', 'CMI_C03', 'CMI_C05'],
    rgb: function(img) {
      return ee.Image.cat([
        img.select('CMI_C05'),
        img.select('CMI_C03'),
        img.select('CMI_C02')
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [0, 0.975], G: [0, 1.086], B: [0, 1]},
    gamma: 1.0
  },

  // Daytime only: frames go black at night.
  'Natural Color (day only)': {
    bands: ['CMI_C01', 'CMI_C02', 'CMI_C03'],
    rgb: function(img) {
      var blue = img.select('CMI_C01');
      var red = img.select('CMI_C02');
      var nir = img.select('CMI_C03');
      var green = red.multiply(0.45).add(nir.multiply(0.10)).add(blue.multiply(0.45));
      var stretch = function(band) {
        return band.multiply(100).sqrt().multiply(25.5).divide(255).clamp(0, 1);
      };
      return ee.Image.cat([stretch(red), stretch(green), stretch(blue)])
        .rename(['R', 'G', 'B']);
    },
    ranges: {R: [0, 1], G: [0, 1], B: [0, 1]},
    gamma: 0.8
  },

  'Air Mass': {
    bands: ['CMI_C08', 'CMI_C10', 'CMI_C12', 'CMI_C13'],
    rgb: function(img) {
      return ee.Image.cat([
        img.select('CMI_C08').subtract(img.select('CMI_C10')),
        img.select('CMI_C12').subtract(img.select('CMI_C13')),
        celsius(img, 'CMI_C08')
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [-26.2, 0.6], G: [-43.2, 6.7], B: [-29.25, -64.65]},
    gamma: 1.0
  },

  'Day Convection': {
    bands: ['CMI_C02', 'CMI_C05', 'CMI_C07', 'CMI_C08', 'CMI_C10', 'CMI_C13'],
    rgb: function(img) {
      return ee.Image.cat([
        img.select('CMI_C08').subtract(img.select('CMI_C10')),
        img.select('CMI_C07').subtract(img.select('CMI_C13')),
        img.select('CMI_C05').subtract(img.select('CMI_C02'))
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [-35, 5], G: [-5, 60], B: [-0.75, 0.25]},
    gamma: 1.0
  },

  'Day Cloud Phase': {
    bands: ['CMI_C02', 'CMI_C05', 'CMI_C13'],
    rgb: function(img) {
      return ee.Image.cat([
        celsius(img, 'CMI_C13'),
        img.select('CMI_C02'),
        img.select('CMI_C05')
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [7.5, -53.5], G: [0, 0.78], B: [0.01, 0.59]},
    gamma: 1.0
  },

  'Nighttime Microphysics': {
    bands: ['CMI_C07', 'CMI_C13', 'CMI_C15'],
    rgb: function(img) {
      return ee.Image.cat([
        img.select('CMI_C15').subtract(img.select('CMI_C13')),
        img.select('CMI_C13').subtract(img.select('CMI_C07')),
        celsius(img, 'CMI_C13')
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [-6.7, 2.6], G: [-3.1, 5.2], B: [-29.6, 19.5]},
    gamma: 1.0
  },

  // Saharan dust outbreaks show up pink/magenta.
  'Dust': {
    bands: ['CMI_C11', 'CMI_C13', 'CMI_C15'],
    rgb: function(img) {
      return ee.Image.cat([
        img.select('CMI_C15').subtract(img.select('CMI_C13')),
        img.select('CMI_C13').subtract(img.select('CMI_C11')),
        celsius(img, 'CMI_C13')
      ]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [-6.7, 2.6], G: [-0.5, 20], B: [-11.95, 15.55]},
    gamma: 1.0
  },

  'Split Window Difference (gray)': {
    bands: ['CMI_C13', 'CMI_C15'],
    rgb: function(img) {
      var swd = img.select('CMI_C13').subtract(img.select('CMI_C15'));
      return ee.Image.cat([swd, swd, swd]).rename(['R', 'G', 'B']);
    },
    ranges: {R: [-10, 10], G: [-10, 10], B: [-10, 10]},
    gamma: 1.0
  }
};

// =================== THE CHOSEN TRACK ===================
// Time window of the video: the whole track, or only its first few frames
// in "Quick test".
function videoWindow(s, points) {
  var start = points[0].t;
  var end = points[points.length - 1].t;
  if (s.quick) end = Math.min(end, start + DEFAULTS.quickFrames * s.stepMinutes * 60 * 1000);
  return {start: start, end: end};
}

// Track points covering a time window, plus one on each side (positions in
// between are interpolated).
function pointsInWindow(points, w) {
  var from = 0, to = points.length - 1;
  for (var i = 0; i < points.length; i++) if (points[i].t <= w.start) from = i;
  for (var j = points.length - 1; j >= 0; j--) if (points[j].t >= w.end) to = j;
  return points.slice(from, to + 1);
}

// Box around some track points, plus a margin, in degrees.
function getBox(points, pad) {
  var lons = points.map(function(p) { return p.lon; });
  var lats = points.map(function(p) { return p.lat; });
  return {
    west: Math.min.apply(null, lons) - pad, east: Math.max.apply(null, lons) + pad,
    south: Math.min.apply(null, lats) - pad, north: Math.max.apply(null, lats) + pad
  };
}

function boxToRegion(box) {
  // geodesic: false -> straight edges, i.e. a true rectangle in Web Mercator
  return ee.Geometry.Rectangle({
    coords: [box.west, box.south, box.east, box.north], geodesic: false
  });
}

// Meters per video pixel. Exporting at this scale lets Earth Engine read the
// imagery at the resolution the video needs instead of GOES' native 2 km,
// which is much faster for a big box.
function videoScale(box) {
  var mercY = function(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); };
  var width = (box.east - box.west) * Math.PI / 180;
  var height = mercY(box.north) - mercY(box.south);
  return Math.max(width, height) * 6378137 / DEFAULTS.videoDims;
}

// Where the storm is at time t: in between the two track points around it.
function stormAt(points, t) {
  var i = 0;
  while (i < points.length - 2 && points[i + 1].t <= t) i++;
  var a = points[i], b = points[i + 1];
  var f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
  return {
    lon: a.lon + (b.lon - a.lon) * f,
    lat: a.lat + (b.lat - a.lat) * f,
    wind: a.wind, pressure: a.pressure, category: a.category
  };
}

// The frames table: one feature per video frame (times = the frames' times).
function frameTable(times, points, box, meta) {
  return ee.FeatureCollection(times.map(function(t, i) {
    var p = stormAt(points, t);
    return ee.Feature(ee.Geometry.Point([p.lon, p.lat]), {
      frame: i, time_ms: t, time_utc: new Date(t).toISOString().slice(0, 16) + 'Z',
      lon: p.lon, lat: p.lat,
      wind_kt: p.wind, pressure_mb: p.pressure, category: p.category,
      west: box.west, south: box.south, east: box.east, north: box.north,
      // (|| '' because Earth Engine can't store "undefined", e.g. in the preview)
      storm: meta.storm || '', sid: meta.sid || '', composite: meta.composite || '', fps: DEFAULTS.fps
    });
  }));
}

// Everything the preview and the export need, from the current UI values.
function build(s, points) {
  var w = videoWindow(s, points);
  var inVideo = pointsInWindow(points, w);
  var box = getBox(inVideo, DEFAULTS.padDegrees);
  var c = composites[s.composite];
  var frames = getFrames(s.satellite, ee.Date(w.start), ee.Date(w.end), s.stepMinutes)
    .map(function(img) { return render(img, c, s.cloudsOnly); });
  return {inVideo: inVideo, box: box, region: boxToRegion(box), scale: videoScale(box), frames: frames};
}

// =================== UI ===================
var seasonBox = ui.Textbox({value: DEFAULTS.season, style: {width: '260px'}});
var stormSelect = ui.Select({placeholder: 'Click "Show storms" first', style: {width: '260px'}});
var satSelect = ui.Select({
  items: Object.keys(SATELLITES), value: Object.keys(SATELLITES)[0],
  style: {width: '260px'}
});
var compositeSelect = ui.Select({
  items: Object.keys(composites), value: DEFAULTS.composite,
  style: {width: '260px'}
});
var stepBox = ui.Textbox({value: DEFAULTS.stepMinutes, style: {width: '260px'}});
var quickBox = ui.Checkbox({label: 'Quick test (first ' + DEFAULTS.quickFrames + ' frames)', value: false});
// Optional: export the composite as it is (default), or black out what isn't cloud
var cloudsBox = ui.Checkbox({label: 'Clouds only (black background)', value: false});
var status = ui.Label('', {color: '#555', whiteSpace: 'pre-wrap'});

var seasonList = [];     // the storms shown on the map
var chosen = null;       // the selected storm: {sid, name, points}

function readInputs() {
  return {
    name: chosen ? chosen.name : '',
    season: parseInt(seasonBox.getValue(), 10),
    satellite: SATELLITES[satSelect.getValue()].id,
    composite: compositeSelect.getValue(),
    stepMinutes: Math.max(10, parseInt(stepBox.getValue(), 10) || 60),
    quick: quickBox.getValue(),
    cloudsOnly: cloudsBox.getValue()
  };
}

// Calls done(s, sid, points) with the selected storm, or asks to pick one.
function withStorm(done) {
  if (!chosen) { status.setValue('Pick a storm first (list or map).'); return; }
  done(readInputs(), chosen.sid, chosen.points);
}

// The season's tracks on the map: gray, and the chosen one in red.
function drawSeason() {
  var lines = seasonList.filter(function(tr) { return tr.points.length > 1; }).map(function(tr) {
    return ee.Feature(ee.Geometry.LineString(tr.points.map(function(p) { return [p.lon, p.lat]; })));
  });
  Map.layers().reset();
  Map.addLayer(ee.FeatureCollection(lines), {color: '888888'}, 'All storms ' + seasonBox.getValue());
  if (chosen) {
    Map.addLayer(ee.Geometry.LineString(chosen.points.map(function(p) { return [p.lon, p.lat]; })),
      {color: 'red'}, chosen.name);
  }
}

function choose(sid) {
  chosen = seasonList.filter(function(tr) { return tr.sid === sid; })[0] || null;
  if (!chosen) return;
  drawSeason();
  status.setValue(trackLabel(chosen) + ' selected (' + sid + '). Now Preview.');
}

function showStorms() {
  var season = parseInt(seasonBox.getValue(), 10);
  if (isNaN(season)) { status.setValue('Type a year first.'); return; }
  status.setValue('Loading the storms of ' + season + '...');
  fetchSeason(season, function(tracks, err) {
    if (err) { status.setValue('Error: ' + err); return; }
    var sat = SATELLITES[satSelect.getValue()];
    seasonList = tracks.filter(function(tr) { return inView(tr, sat.lon); })
      .sort(function(a, b) { return a.points[0].t - b.points[0].t; });
    chosen = null;
    stormSelect.items().reset(seasonList.map(function(tr) {
      return {label: trackLabel(tr), value: tr.sid};
    }));
    stormSelect.setPlaceholder(seasonList.length + ' storms: pick one, or click a track');
    drawSeason();
    status.setValue(seasonList.length + ' storms in ' + season + ' that ' +
      satSelect.getValue().split(' (')[0] + ' can see.');
    // first time: select the default storm
    var start = seasonList.filter(function(tr) { return tr.name === DEFAULTS.name; })[0];
    if (start && season === parseInt(DEFAULTS.season, 10)) stormSelect.setValue(start.sid);
  });
}

var showBtn = ui.Button({label: 'Show storms', style: {width: '260px'}, onClick: showStorms});
satSelect.onChange(showStorms);   // East and West see different storms

stormSelect.onChange(choose);

// Click near a track on the map to choose that storm.
Map.onClick(function(c) {
  var best = null, bestD = 3;   // within about 3 degrees
  seasonList.forEach(function(tr) {
    tr.points.forEach(function(p) {
      var d = Math.sqrt(Math.pow((p.lon - c.lon) * Math.cos(c.lat * Math.PI / 180), 2) + Math.pow(p.lat - c.lat, 2));
      if (d < bestD) { bestD = d; best = tr; }
    });
  });
  if (best) stormSelect.setValue(best.sid);
});

var previewBtn = ui.Button({
  label: 'Preview', style: {width: '260px'},
  onClick: function() {
    withStorm(function(s, sid, points) {
      var b = build(s, points);
      var xy = function(list) { return list.map(function(p) { return [p.lon, p.lat]; }); };
      drawSeason();
      Map.centerObject(b.region);
      Map.addLayer(b.frames.first(), {min: 0, max: 1}, s.composite + ' (first frame)');
      Map.addLayer(ee.Image().paint(ee.FeatureCollection([ee.Feature(b.region)]), 0, 2),
        {palette: ['white']}, 'Video extent');
      Map.addLayer(ee.Geometry.MultiPoint(xy(points)), {color: '999999'}, 'Track points (all)');
      Map.addLayer(ee.Geometry.MultiPoint(xy(b.inVideo)), {color: 'yellow'}, 'Track points (in the video)');

      print('=== ' + s.name + ' ' + s.season + ' (' + sid + ') ===');
      b.frames.aggregate_array('system:time_start').evaluate(function(times) {
        print('Frames in the video: ' + times.length);
        print('First rows of the frames table:', frameTable(times.slice(0, 5), points, b.box, {}));
      });
      print(ui.Thumbnail(b.frames.limit(DEFAULTS.previewFrames), {
        min: 0, max: 1, dimensions: 360, region: b.region,
        framesPerSecond: DEFAULTS.fps, crs: 'EPSG:3857'
      }));
      status.setValue('Preview ready (' + sid + '). The animation shows the first ' +
        DEFAULTS.previewFrames + ' frames.');
    });
  }
});

var exportBtn = ui.Button({
  label: 'Export video + frames table', style: {width: '260px'},
  onClick: function() {
    withStorm(function(s, sid, points) {
      var b = build(s, points);
      var base = (s.name + '_' + s.season + '_' + s.composite +
        (s.quick ? '_test' : '')).replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);
      var scale = b.scale;
      Export.video.toDrive({
        // 8-bit RGB the same way the preview animation makes it, pinned to
        // Web Mercator at the video's own resolution: GOES' geostationary
        // projection can't be transformed everywhere, which fails the export.
        collection: b.frames.map(function(img) {
          return ee.Image(img).visualize({min: 0, max: 1})
            .reproject({crs: 'EPSG:3857', scale: scale});
        }),
        description: base + '_video',
        fileNamePrefix: base,
        folder: 'gee_hurricanes',
        dimensions: DEFAULTS.videoDims,
        framesPerSecond: DEFAULTS.fps,
        region: b.region,
        crs: 'EPSG:3857',
        maxFrames: 5000
      });
      status.setValue('Video task created. Getting the frame times for the table...');

      // The table is made here in the browser from the frames' times, so this
      // task has nothing heavy to compute and finishes in seconds.
      b.frames.aggregate_array('system:time_start').evaluate(function(times, err) {
        if (err) { status.setValue('Error: ' + err); return; }
        Export.table.toDrive({
          collection: frameTable(times, points, b.box, {storm: s.name, sid: sid, composite: s.composite}),
          description: base + '_frames',
          fileNamePrefix: base + '_frames',
          folder: 'gee_hurricanes',
          fileFormat: 'GeoJSON'
        });
        status.setValue('Two tasks created (' + times.length + ' frames). Open the Tasks tab\n' +
          'and click RUN on both. They land in Drive > gee_hurricanes.');
      });
    });
  }
});

var panel = ui.Panel({
  widgets: [
    ui.Label('🌀 Hurricane GOES Loop', {fontWeight: 'bold', fontSize: '16px'}),
    ui.Label('Year:'), seasonBox,
    ui.Label('Satellite:'), satSelect,
    showBtn,
    ui.Label('Storm (or click a track on the map):'), stormSelect,
    ui.Label('Composite:'), compositeSelect,
    ui.Label('Minutes between frames (min 10):'), stepBox,
    cloudsBox,
    quickBox,
    previewBtn, exportBtn, status
  ],
  style: {width: '300px', padding: '10px'}
});

ui.root.insert(0, panel);
Map.setCenter(-75, 25, 3);
showStorms();   // show the default year right away
