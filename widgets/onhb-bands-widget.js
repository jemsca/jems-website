/* ONHB Registration Summary - widget logic
 * ---------------------------------------------------------------------------
 * Hosted in the site's Site Assets library and loaded as an EXTERNAL script by
 * the ONHB HTML Widget web part. (The tenant CSP blocks inline scripts, but
 * allows same-origin external scripts loaded by the trusted web part.)
 *
 * To change the widget: edit this file, re-upload it to Site Assets (overwrite),
 * and bump the ?v= number in the paste snippet (BandsSummary.html) to bust the
 * browser cache. No SPFx rebuild.
 *
 * Renders into <div id="onhb-bands-host"> (created by the paste snippet).
 */

(function () {
  "use strict";

  window.jemsWebsiteCapabilities = window.jemsWebsiteCapabilities || {};
  window.jemsWebsiteCapabilities.onhbBands = Object.freeze([
    "list_sessions",
    "view_session_band_summary",
    "refresh_session_band_summary",
  ]);

  var CONFIG = {
    lists: { sessions: "Sessions", bands: "Bands", instruments: "Instruments", registration: "Registration" },
    // Leader-facing roster view (Migration/Add-RegistrationBandListsView.ps1):
    // First/Last Name, Email, Instrument, Member Notes only - no admin/payment
    // columns. Leader links filter into it via FilterField/FilterValue.
    views: { bandLists: "Band Lists" },
    fields: {
      sessionYear:   ["Year"],
      sessionSeason: ["SeasonLookup", "Season"],
      sessionMin:    ["MinMembers"],
      sessionSync:   ["LastSynced"],
      bandLeader:    ["LeaderLookup", "Leader"],
      bandLevel:     ["BandLevelLookup", "BandLevel", "Level"],
      bandType:      ["BandTypeLookup", "BandType", "Type"],
      bandSession:   ["SessionLookup", "Session"],
      bandMax:       ["MaxMembers"],
      // Admin-tracking only (Migration/Add-BandsClosedInstrumentsFields.ps1,
      // 2026-08-25) - does not touch the live Gravity Forms form, just
      // records what's closed for the widget to show.
      bandClosedInstr: ["ClosedInstruments"],
      bandClosed:    ["BandClosed"],
      // Per-instrument Warning (yellow)/Cap (red) counts, one pair per band
      // context (Migration/Add-InstrumentsCapWarningFields.ps1, 2026-08-25) -
      // fully data-driven, replacing the old hardcoded 6/9 thresholds +
      // CONFIG.cappedFallback special-casing in code.
      instrJazzWarn:    ["JazzWarn", "Jazz_x0020_Warn"],
      instrJazzCap:     ["JazzCap", "Jazz_x0020_Cap"],
      instrConcertWarn: ["ConcertWarn", "Concert_x0020_Warn"],
      instrConcertCap:  ["ConcertCap", "Concert_x0020_Cap"],
      // Non-blank = this instrument applies to this band context (same
      // fields Migration/Add-BandsClosedInstrumentsFields.ps1's AppliesToAny
      // filter and Migration/Clear-InstrumentsCapWarnByBandType.ps1 key off
      // of). Used only to hide inapplicable columns while focused on a band
      // (2026-08-25) - unfocused view is unchanged, still shows every column.
      instrJazz:    ["Jazz"],
      instrConcert: ["Concert"],
      regBand:       ["BandLookup", "Band"],
      regInstr:      ["InstrumentLookup", "Instrument"],
      regStatus:     ["StatusLookup", "Status"],
      regSession:    ["SessionLookup", "Session"]
    },
    excludedStatuses: ["Withdrawn", "Duplicate"],   // count every active registration; Withdrawn/Duplicate excluded (paid or not: Registered/Priority/Pending/Testing all count toward capacity)
    // The rhythm-section cap only applies to Jazz bands (Band Types = "Jazz").
    jazzBandType: "Jazz",
    // Instruments folded into the "Other" column instead of getting their own
    // (blanks and unknown instruments always fall into Other too).
    collapseToOther: ["Other", "Soprano Sax"],
    // Count these instruments under another instrument's column instead of
    // their own. Temporary: "TBD" registrations should be corrected in the
    // Registration list; until then they show under Percussion.
    remap: { "TBD": "Percussion" },
    // Custom column headers where truncation is ambiguous (e.g. Bass Clarinet /
    // Bassoon / Bass Guitar all truncate to "Bass"). Names <= 5 chars show in
    // full; anything else not listed here uses its first 4 letters.
    headerOverride: { "Bass Clarinet": "BClar", "Bassoon": "Basso" },
    // Session dropdown starts here. Season rank: Winter=1, Spring=2, Fall=3;
    // 2024 Fall = 2024*10 + 3.
    earliestSessionKey: 2024 * 10 + 3,
    fallbackSite: "https://ottawanewhorizons.sharepoint.com/sites/Registration"
  };

  var STYLE = '<style>' +
    '.onhb-w{--pink:#f6c6d4;--pink-bd:#e0899f;--yellow:#fdeb9e;--yellow-bd:#e6cf5a;--grey:#d9d9d9;--grey-bd:#9a9a9a;--bd:#d0d0d0;--hd:#2f3b52;--hd-fg:#fff;--stripe:#f6f7f9;' +
      'font:13px/1.4 "Segoe UI",Roboto,Arial,sans-serif;color:#1b1b1b;max-width:100%}' +
    '.onhb-w h2{font-size:16px;margin:0 0 2px}' +
    '.onhb-w .sub{color:#666;margin:0 0 10px;font-size:12px}' +
    '.onhb-w .bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}' +
    '.onhb-w select,.onhb-w button{font:inherit;padding:3px 8px}' +
    '.onhb-w .scroll{overflow-x:auto;border:1px solid var(--bd);border-radius:6px;padding-bottom:12px}' +
    '.onhb-w table{border-collapse:collapse;width:100%;white-space:nowrap}' +
    '.onhb-w th,.onhb-w td{border:1px solid var(--bd);padding:2px 4px;text-align:center}' +
    '.onhb-w thead th{background:var(--hd);color:var(--hd-fg);position:sticky;top:0}' +
    '.onhb-w th.leader,.onhb-w td.leader{text-align:left;position:sticky;left:0;z-index:1;padding:2px 8px}' +
    '.onhb-w td.leader{background:#fff;font-weight:600}' +
    '.onhb-w tbody tr:nth-child(even) td.leader,.onhb-w tbody tr:nth-child(even) td{background:var(--stripe)}' +
    '.onhb-w tfoot td{font-weight:700;background:#eef0f4}' +
    '.onhb-w td.total{font-weight:700}' +
    '.onhb-w td.pink{background:var(--pink)!important;box-shadow:inset 0 0 0 1px var(--pink-bd)}' +
    '.onhb-w td.yellow{background:var(--yellow)!important;box-shadow:inset 0 0 0 1px var(--yellow-bd)}' +
    '.onhb-w td.grey{background:var(--grey)!important;box-shadow:inset 0 0 0 1px var(--grey-bd)}' +
    '.onhb-w .legend{margin-top:8px;color:#555;font-size:11.5px;display:flex;gap:14px;flex-wrap:wrap}' +
    '.onhb-w .legend .sw{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px;margin-right:4px}' +
    '.onhb-w .err{background:#fdecec;border:1px solid #e3a0a0;color:#8a1f1f;padding:10px;border-radius:6px;white-space:pre-wrap}' +
    '.onhb-w .muted{color:#999}' +
    '.onhb-w .foot{margin-top:8px;color:#666;font-size:11.5px}' +
    '.onhb-w td.leader a{color:inherit;text-decoration:none}' +
    '.onhb-w td.leader a:hover{text-decoration:underline}' +
    '.onhb-w td.total a{color:inherit;text-decoration:none;cursor:pointer}' +
    '.onhb-w td.total a:hover{text-decoration:underline}' +
    '.onhb-w td.total.focused{box-shadow:inset 0 0 0 2px var(--hd)}' +
    '.onhb-w .focus-bar{margin:0 0 8px;font-size:12px;color:#555}' +
    '.onhb-w .focus-bar a{color:#0071eb;text-decoration:none;cursor:pointer}' +
    '.onhb-w .focus-bar a:hover{text-decoration:underline}' +
    '</style>';

  var MARKUP =
    '<div class="onhb-w">' +
      '<div class="bar"><label>Session <select data-session></select></label>' +
        '<button data-refresh>Refresh</button><span class="muted" data-status></span></div>' +
      '<div data-out></div>' +
    '</div>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }

  function render(container, siteUrl) {
    container.innerHTML = STYLE + MARKUP;
    boot(container, siteUrl);
  }

  function boot(root, siteUrl) {
    var q = function (sel) { return root.querySelector(sel); };
    var origin = siteUrl.replace(/^(https?:\/\/[^\/]+).*$/, "$1");   // scheme+host, for absolute view links

    function spGet(url) {
      return fetch(url, { headers: { "Accept": "application/json;odata=nometadata" }, credentials: "include" })
        .then(function (r) {
          if (!r.ok) { return r.text().then(function (t) { throw new Error("HTTP " + r.status + " for " + url + "\n" + t.slice(0, 300)); }); }
          return r.json();
        });
    }
    var apiList = function (name) { return siteUrl + "/_api/web/lists/getbytitle('" + encodeURIComponent(name) + "')"; };

    function resolveFields(listName, wanted) {
      return spGet(apiList(listName) + "/fields?$select=InternalName,Title&$top=500").then(function (d) {
        var byInt = {}, byTitle = {};
        (d.value || []).forEach(function (f) {
          byInt[String(f.InternalName).toLowerCase()] = f.InternalName;
          byTitle[String(f.Title || "").toLowerCase()] = f.InternalName;
        });
        var out = {};
        Object.keys(wanted).forEach(function (key) {
          var found = null;
          wanted[key].some(function (cand) {
            var c = cand.toLowerCase();
            if (byInt[c]) { found = byInt[c]; return true; }
            if (byTitle[c]) { found = byTitle[c]; return true; }
            return false;
          });
          out[key] = found;
        });
        return out;
      });
    }
    function itemsUrl(listName, opts) {
      var u = apiList(listName) + "/items?$top=5000";
      if (opts.select) { u += "&$select=" + opts.select.map(encodeURIComponent).join(","); }
      if (opts.expand) { u += "&$expand=" + opts.expand.map(encodeURIComponent).join(","); }
      if (opts.filter) { u += "&$filter=" + encodeURIComponent(opts.filter); }
      if (opts.order)  { u += "&$orderby=" + encodeURIComponent(opts.order); }
      return u;
    }
    var lookupVal = function (item, field) { return field && item[field] ? item[field].Title : ""; };
    var lookupId = function (item, field) { return field && item[field] ? item[field].Id : null; };

    var STATE = { sessions: [], F: {}, focusBandId: null, lastData: null, lastSession: null };

    function loadFieldMaps() {
      var f = CONFIG.fields;
      return Promise.all([
        resolveFields(CONFIG.lists.sessions, { year: f.sessionYear, season: f.sessionSeason, min: f.sessionMin, sync: f.sessionSync }),
        resolveFields(CONFIG.lists.bands, { leader: f.bandLeader, level: f.bandLevel, type: f.bandType, session: f.bandSession, max: f.bandMax,
                                            closedInstr: f.bandClosedInstr, closed: f.bandClosed }),
        resolveFields(CONFIG.lists.instruments, { jazzWarn: f.instrJazzWarn, jazzCap: f.instrJazzCap,
                                                  concertWarn: f.instrConcertWarn, concertCap: f.instrConcertCap,
                                                  jazz: f.instrJazz, concert: f.instrConcert }),
        resolveFields(CONFIG.lists.registration, { band: f.regBand, instr: f.regInstr, status: f.regStatus, session: f.regSession }),
        spGet(apiList(CONFIG.lists.registration) + "/RootFolder?$select=ServerRelativeUrl").catch(function () { return {}; }),
        spGet(apiList(CONFIG.lists.registration) + "/views/getbytitle('" + encodeURIComponent(CONFIG.views.bandLists) + "')?$select=Id").catch(function () { return {}; })
      ]).then(function (r) {
        STATE.F = { s: r[0], b: r[1], i: r[2], r: r[3] };
        // Navigate to the LIST's own page (AllItems.aspx) with ?viewid=<Band
        // Lists GUID>, not the view's own dedicated .aspx URL: a fresh
        // navigation straight to a custom view's own page can throw "Unknown
        // render failure" in the modern experience, even though switching to
        // the same view from inside an already-loaded list page works fine.
        // ?viewid= reuses the reliable AllItems.aspx shell and just selects
        // the Band Lists columns within it. Falls back to plain AllItems (no
        // viewid) if the view lookup fails, same as before this existed.
        STATE.regViewUrl = r[4] && r[4].ServerRelativeUrl ? (origin + r[4].ServerRelativeUrl + "/AllItems.aspx") : null;
        STATE.regViewId = r[5] && r[5].Id ? r[5].Id : null;
      });
    }

    function loadSessions() {
      var F = STATE.F.s;
      var sel = ["Id", "Title"]; if (F.year) { sel.push(F.year); } if (F.min) { sel.push(F.min); } if (F.sync) { sel.push(F.sync); }
      var exp = []; if (F.season) { sel.push(F.season + "/Title"); sel.push(F.season + "/Id"); exp.push(F.season); }
      return spGet(itemsUrl(CONFIG.lists.sessions, { select: sel, expand: exp })).then(function (d) {
        STATE.sessions = (d.value || []).map(function (it) {
          return { id: it.Id, title: it.Title,
            year: F.year ? (Number(it[F.year]) || 0) : 0,
            rank: F.season ? (lookupId(it, F.season) || 0) : 0,
            min:  F.min ? (it[F.min] == null ? null : Number(it[F.min])) : null,
            sync: F.sync ? (it[F.sync] || null) : null };
        }).filter(function (s) {
          return (s.year * 10 + s.rank) >= CONFIG.earliestSessionKey;
        }).sort(function (a, b) { return (b.year * 10 + b.rank) - (a.year * 10 + a.rank); });
      });
    }

    function loadSession(sessionId) {
      var Fb = STATE.F.b, Fi = STATE.F.i, Fr = STATE.F.r;
      var bSel = ["Id", "Title"], bExp = [];
      if (Fb.leader) { bSel.push(Fb.leader + "/Title"); bExp.push(Fb.leader); }
      if (Fb.level)  { bSel.push(Fb.level + "/Title"); bExp.push(Fb.level); }
      if (Fb.type)   { bSel.push(Fb.type + "/Title"); bExp.push(Fb.type); }
      if (Fb.max)    { bSel.push(Fb.max); }
      if (Fb.closedInstr) { bSel.push(Fb.closedInstr); }
      if (Fb.closed) { bSel.push(Fb.closed); }
      var bFilter = Fb.session ? (Fb.session + "Id eq " + sessionId) : null;
      var pBands = spGet(itemsUrl(CONFIG.lists.bands, { select: bSel, expand: bExp, filter: bFilter, order: "Id" }));

      var iSel = ["Id", "Title"];
      if (Fi.jazzWarn) { iSel.push(Fi.jazzWarn); }
      if (Fi.jazzCap) { iSel.push(Fi.jazzCap); }
      if (Fi.concertWarn) { iSel.push(Fi.concertWarn); }
      if (Fi.concertCap) { iSel.push(Fi.concertCap); }
      if (Fi.jazz) { iSel.push(Fi.jazz); }
      if (Fi.concert) { iSel.push(Fi.concert); }
      var pInstr = spGet(itemsUrl(CONFIG.lists.instruments, { select: iSel, order: "Id" }));

      var rSel = ["Id"], rExp = [];
      if (Fr.band)   { rSel.push(Fr.band + "/Id"); rExp.push(Fr.band); }
      if (Fr.instr)  { rSel.push(Fr.instr + "/Id"); rSel.push(Fr.instr + "/Title"); rExp.push(Fr.instr); }
      if (Fr.status) { rSel.push(Fr.status + "/Title"); rExp.push(Fr.status); }
      var rFilter = Fr.session ? (Fr.session + "Id eq " + sessionId) : null;
      var pReg = spGet(itemsUrl(CONFIG.lists.registration, { select: rSel, expand: rExp, filter: rFilter }));

      return Promise.all([pBands, pInstr, pReg]).then(function (r) {
        return { bands: r[0].value || [], instruments: r[1].value || [], regs: r[2].value || [] };
      });
    }

    // CAP IS INCLUSIVE (hitting it is already red, not one past it -
    // Migration/Add-InstrumentsCapWarningFields.ps1). Relies SOLELY on
    // Instruments' own per-context Warning/Cap (2026-08-25 - no JS-level
    // fallback any more): a cell with no Warning/Cap value for this band's
    // context (the migration hasn't been run/backfilled for this instrument
    // yet) simply never highlights, rather than guessing at a default.
    function cellClass(val, instr, band) {
      if (!val) { return ""; }
      var jazz = band && band.type === CONFIG.jazzBandType;
      var warn = instr && (jazz ? instr.jazzWarn : instr.concertWarn);
      var cap = instr && (jazz ? instr.jazzCap : instr.concertCap);
      if (cap != null && val >= cap) { return "pink"; }
      if (warn != null && val >= warn) { return "yellow"; }
      return "";
    }
    function totalClass(band, session) {
      if (band.max != null && band.total > band.max) { return "pink"; }
      if (session && session.min != null && band.total < session.min) { return "yellow"; }
      return "";
    }

    function build(data, session) {
      STATE.lastData = data; STATE.lastSession = session;
      var Fb = STATE.F.b, Fi = STATE.F.i, Fr = STATE.F.r;
      var norm = function (n) { return String(n).trim().toLowerCase(); };

      // id lookup over ALL instruments (needed to resolve remap targets)
      var idByName = {}; data.instruments.forEach(function (it) { idByName[norm(it.Title)] = it.Id; });
      // remap source-id -> target-id (e.g. TBD's id -> Percussion's id)
      var remapId = {};
      Object.keys(CONFIG.remap).forEach(function (src) {
        var sid = idByName[norm(src)], tid = idByName[norm(CONFIG.remap[src])];
        if (sid != null && tid != null) { remapId[sid] = tid; }
      });

      // Instruments that get no column of their own: collapsed (-> Other) and
      // remap sources (-> counted under their target column).
      var noColumn = CONFIG.collapseToOther.concat(Object.keys(CONFIG.remap)).map(norm);
      var num = function (it, fieldName) {
        return fieldName && it[fieldName] != null && it[fieldName] !== "" ? Number(it[fieldName]) : null;
      };
      var instrs = data.instruments.filter(function (it) {
        return noColumn.indexOf(norm(it.Title)) === -1;
      }).map(function (it) {
        return { id: it.Id, name: it.Title,
          jazzWarn: num(it, Fi.jazzWarn), jazzCap: num(it, Fi.jazzCap),
          concertWarn: num(it, Fi.concertWarn), concertCap: num(it, Fi.concertCap),
          jazz: !!(Fi.jazz && it[Fi.jazz]), concert: !!(Fi.concert && it[Fi.concert]) };
      });
      var instrById = {}; instrs.forEach(function (x) { instrById[x.id] = x; });

      // MultiChoice comes back either as a plain array or {results:[...]}
      // depending on the REST call shape - handle both.
      var multiChoice = function (val) {
        if (!val) { return []; }
        if (Array.isArray(val)) { return val; }
        if (val.results) { return val.results; }
        return [];
      };

      var bands = data.bands.map(function (b) {
        var closedInstr = multiChoice(Fb.closedInstr ? b[Fb.closedInstr] : null).map(norm);
        return { id: b.Id, title: b.Title || "", leader: lookupVal(b, Fb.leader) || "(no leader)",
          level: lookupVal(b, Fb.level) || "",
          type: lookupVal(b, Fb.type) || "",
          max: Fb.max ? (b[Fb.max] == null ? null : Number(b[Fb.max])) : null,
          closed: Fb.closed ? (b[Fb.closed] === "Yes") : false,
          closedInstr: closedInstr,
          counts: {}, other: 0, total: 0 };
      });
      bands.sort(function (a, b) { return String(a.leader).localeCompare(String(b.leader)); });  // leaders A-Z by first name
      var nameSeen = {}; bands.forEach(function (b) { nameSeen[b.leader] = (nameSeen[b.leader] || 0) + 1; });
      bands.forEach(function (b) { b.label = (nameSeen[b.leader] > 1 && b.level) ? (b.leader + " (" + b.level + ")") : b.leader; });
      var bandById = {}; bands.forEach(function (b) { bandById[b.id] = b; });

      // A focused band that no longer exists in this data (stale after a
      // session switch, or the band itself was removed) falls back to
      // showing everything rather than an empty table.
      if (STATE.focusBandId != null && !bandById[STATE.focusBandId]) { STATE.focusBandId = null; }

      data.regs.forEach(function (rg) {
        if (Fr.status) { if (CONFIG.excludedStatuses.indexOf(lookupVal(rg, Fr.status)) !== -1) { return; } }
        var b = bandById[lookupId(rg, Fr.band)]; if (!b) { return; }
        var iId = lookupId(rg, Fr.instr);
        if (remapId[iId] != null) { iId = remapId[iId]; }   // e.g. TBD -> Percussion
        if (iId && instrById[iId]) { b.counts[iId] = (b.counts[iId] || 0) + 1; } else { b.other++; }
        b.total++;
      });

      var colTotals = {}, otherTotal = 0, grand = 0;
      bands.forEach(function (b) {
        instrs.forEach(function (x) { if (b.counts[x.id]) { colTotals[x.id] = (colTotals[x.id] || 0) + b.counts[x.id]; } });
        otherTotal += b.other; grand += b.total;
      });

      // Focused on one band (click its Total to toggle) - everything above
      // is still computed from the FULL band list (colTotals/otherTotal/
      // grand, in the footer below), so the footer keeps showing session-
      // wide totals for context even while only one row is shown.
      var h = '';
      var focused = STATE.focusBandId != null ? bandById[STATE.focusBandId] : null;
      if (focused) {
        h += '<div class="focus-bar">Focused on <strong>' + esc(focused.label) +
          '</strong> - <a href="#" data-focus-band="">show all bands</a></div>';
      }
      var rowBands = focused ? [focused] : bands;

      // Focused on one band: also hide any instrument column that doesn't
      // apply to that band's own type (Instruments.Jazz/Concert - the same
      // applies-to fields Migration/Add-BandsClosedInstrumentsFields.ps1's
      // AppliesToAny filter and Migration/Clear-InstrumentsCapWarnByBandType.ps1
      // key off of), added 2026-08-25 - a Concert band never shows a
      // Jazz-only column (and vice versa) once focused, since it's always
      // blank/irrelevant there anyway. Falls back to showing every column,
      // same as unfocused, if the Jazz/Concert fields aren't resolved on
      // this site (e.g. the migration hasn't been run yet) - never hides a
      // column based on missing data.
      var canFilterByType = !!(Fi.jazz && Fi.concert);
      var visibleInstrs = (focused && canFilterByType) ? instrs.filter(function (x) {
        return focused.type === CONFIG.jazzBandType ? x.jazz : x.concert;
      }) : instrs;

      // Columns: Band | Total | <instruments> | Other
      h += '<div class="scroll"><table><thead><tr><th class="leader">Band</th><th>Total</th>';
      visibleInstrs.forEach(function (x) {
        var full = String(x.name);
        var hdr = CONFIG.headerOverride[x.name] || (full.length <= 5 ? full : full.slice(0, 4));
        h += '<th title="' + esc(x.name) + '">' + esc(hdr) + '</th>';
      });
      h += '<th>Other</th></tr></thead><tbody>';
      rowBands.forEach(function (b) {
        // Band Closed / Closed Instruments (Migration/Add-BandsClosedInstrumentsFields.ps1,
        // 2026-08-25 - admin-tracking only, doesn't touch the live GF form)
        // override every other highlight with grey - a hard "don't
        // register here" signal takes priority over capacity color, and
        // shows regardless of the current count (even 0), unlike the
        // capacity colors which never highlight an empty cell.
        var tc = b.closed ? "grey" : totalClass(b, session);
        // Leader links to the Band Lists view (roster columns only), filtered on
        // Band alone (no Session filter) - Bands ALSO has a field named
        // SessionLookup, so a second filter on Registration's SessionLookup goes
        // ambiguous once SharePoint needs Bands in the query (same underlying bug
        // as Fix-RegistrationViewAmbiguousColumn.ps1). A single per-session Band
        // already encodes both leader and session (e.g. "Colin (2026 Fall)"), so
        // filtering on it alone is unambiguous and sufficient.
        //
        // FilterValue1 is the band's real item ID with FilterLookupId1=1, NOT its
        // title text - found live 2026-09-10: comparing a Lookup column (BandLookup)
        // by display text instead of its lookup id defeats SharePoint's own index on
        // that column (same bug as the "2026 Fall" views fixed by
        // Fix-SessionViewLookupFilter.ps1) and threw the same "exceeds the list view
        // threshold" render failure once Registration grew past 5,000 rows.
        var leaderCell = esc(b.label);
        if (STATE.regViewUrl && Fr.band && b.id) {
          var href = STATE.regViewUrl + "?";
          if (STATE.regViewId) { href += "viewid=" + encodeURIComponent(STATE.regViewId) + "&"; }
          href += "FilterField1=" + encodeURIComponent(Fr.band) +
            "&FilterValue1=" + encodeURIComponent(b.id) + "&FilterLookupId1=1";
          leaderCell = '<a href="' + esc(href) + '" target="_blank" rel="noopener" ' +
            'title="Open this band\'s roster (Band Lists view)">' + esc(b.label) + '</a>';
        }
        h += '<tr><td class="leader">' + leaderCell + '</td>';
        // Total doubles as the "focus on just this band" control (click to
        // toggle) - only when there's something to focus on (b.total > 0),
        // same "blank rather than a bare 0" convention every other cell here
        // uses. Focused band's own Total gets a highlighted box so it's
        // clear which one is active, on top of the focus-bar above.
        var isFocused = STATE.focusBandId === b.id;
        var totalCls = 'total' + (tc ? ' ' + tc : '') + (isFocused ? ' focused' : '');
        var totalTxt = b.total ?
          '<a href="#" data-focus-band="' + b.id + '" title="' +
            (isFocused ? 'Click to show all bands' : 'Click to focus on just this band') +
            '">' + b.total + '</a>' : '';
        h += '<td class="' + totalCls + '">' + totalTxt + '</td>';
        visibleInstrs.forEach(function (x) {
          var v = b.counts[x.id] || 0;
          var closedHere = b.closed || b.closedInstr.indexOf(norm(x.name)) !== -1;
          var cls = closedHere ? "grey" : cellClass(v, x, b);
          h += '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + (v || "") + '</td>';
        });
        var otherClosed = b.closed || b.closedInstr.indexOf(norm("Other")) !== -1;
        var otherCls = otherClosed ? "grey" : (b.other ? "pink" : "");
        h += '<td' + (otherCls ? ' class="' + otherCls + '"' : '') + '>' + (b.other || "") + '</td></tr>';
      });
      h += '</tbody>';
      // The totals footer is session-wide, not this-one-band-wide - showing
      // it next to a single focused row read as if it were meant to match
      // (it never does), so it's hidden entirely while focused rather than
      // left in as confusing context.
      if (!focused) {
        h += '<tfoot><tr><td class="leader">Total</td><td>' + (grand || "") + '</td>';
        instrs.forEach(function (x) { h += '<td>' + (colTotals[x.id] || "") + '</td>'; });
        h += '<td>' + (otherTotal || "") + '</td></tr></tfoot>';
      }
      h += '</table></div>';

      // Footer: data freshness from Sessions.LastSynced (§4.7 / registrar view).
      var ls = session && session.sync ? new Date(session.sync) : null;
      var lsTxt = (ls && !isNaN(ls.getTime())) ? ls.toLocaleString() : "not recorded";
      h += '<div class="foot">Last synced: ' + esc(lsTxt) + '</div>';
      q('[data-out]').innerHTML = h;
      q('[data-status]').textContent = "";
    }

    function showError(e) {
      q('[data-out]').innerHTML = '<div class="err">Could not load data.\n\n' + esc(e && e.message ? e.message : e) +
        '\n\nList names in CONFIG.lists must match the site lists.</div>';
    }
    function selectSession(id) {
      var s = STATE.sessions.filter(function (x) { return x.id === id; })[0];
      q('[data-status]').textContent = "Loading…";
      loadSession(id).then(function (data) { build(data, s); }).catch(showError);
    }

    // Click a band's Total to focus on just that band (click again, or "show
    // all bands", to go back) - re-renders from the already-loaded data, no
    // re-fetch needed. Delegated on [data-out] itself, which build() never
    // replaces (only its innerHTML), so this only needs binding once.
    q('[data-out]').addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('[data-focus-band]');
      if (!el) { return; }
      e.preventDefault();
      var id = el.getAttribute('data-focus-band');
      var newId = id ? Number(id) : null;
      STATE.focusBandId = (STATE.focusBandId === newId) ? null : newId;
      if (STATE.lastData) { build(STATE.lastData, STATE.lastSession); }
    });

    loadFieldMaps().then(loadSessions).then(function () {
      if (!STATE.sessions.length) { throw new Error("No Sessions found."); }
      var sel = q('[data-session]'); sel.innerHTML = "";
      STATE.sessions.forEach(function (s) { var o = document.createElement("option"); o.value = String(s.id); o.textContent = s.title; sel.appendChild(o); });
      sel.value = String(STATE.sessions[0].id);
      // A session switch invalidates any focused band (ids don't carry over
      // between sessions) - a plain Refresh of the SAME session deliberately
      // does NOT reset it, since the band you're looking at is presumably
      // still the one you want after a refresh.
      sel.onchange = function () { STATE.focusBandId = null; selectSession(Number(sel.value)); };
      q('[data-refresh]').onclick = function () { selectSession(Number(sel.value)); };
      selectSession(STATE.sessions[0].id);
    }).catch(showError);
  }

  // --- self-run: resolve site + host, then render ---
  var site = (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) || CONFIG.fallbackSite;
  var host = document.getElementById("onhb-bands-host");
  if (host) { render(host, site); }
})();
