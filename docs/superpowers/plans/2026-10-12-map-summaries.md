# Administrative map summaries

Approved design: country views show province counts, regional views show city counts, local views show existing market markers. Counts mean township seats open on the selected date, never raw market rows. Regions without located seats have no bubble. Names and counts update together; bubble clicks drill down without selecting hidden seats. Nearby search always fits a local view; zooming out aggregates again. Preserve existing colors and calendars.

Implementation plan (writing-plans):
1. Add pure aggregation and level helpers in site/js/clusters.js; test date flags, administrative membership, unavailable regions and zoom thresholds.
2. Connect national metadata to map.js, add accessible bubble buttons and constrained screen spacing, hide individual markers and detailed borders at summary levels, preserve pan/zoom.
3. Wire province/city clicks to existing region navigation; city clicks enter local camera view. Add restrained styles and count explanation.
4. Run Node checks, inspect national/province/local views on phone and desktop, publish and verify GitHub Pages.

No data collection or API changes. Use existing national seats/county/city tables. Level uses geographic viewport width (province above 1400 km, city above 200 km, local below); city drill-down fits a local view around the city reference point. Bubble counts cover their whole administrative region. Zero-open regions with known seats show 0, distinct from uncollected regions. Test output consistency against real data.
