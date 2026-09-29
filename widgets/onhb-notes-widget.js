/* ONHB Notes - widget logic
 * ---------------------------------------------------------------------------
 * Two live tables, both session-scoped (same session dropdown pattern as
 * onhb-bands-widget.js, defaulting to the most recent session):
 *   1. Member Notes - every Registration row this session (excluding
 *      Withdrawn/Duplicate) with a non-blank Member Notes value - GF's "Any
 *      additional information?" field, a switched-instrument note, etc.
 *   2. Band Notes   - every Band this session with a non-blank Notes value -
 *      an administrator note, e.g. "Alto Sax closed - full"
 *      (Bands.Notes, Migration/Add-BandsNotesField.ps1 - new field, not
 *      backfilled from anything, set directly in the Bands list).
 *
 * Hosted in Site Assets, loaded as an external script by the ONHB HTML Widget
 * web part (tenant CSP blocks inline scripts). Renders into #onhb-notes-host.
 * To change it: edit this file, re-upload to Site Assets, bump ?v= in the
 * paste snippet.
 */
(function () {
  "use strict";

  window.jemsWebsiteCapabilities = window.jemsWebsiteCapabilities || {};
  window.jemsWebsiteCapabilities.onhbNotes = Object.freeze([
    "list_sessions",
    "view_session_member_and_band_notes",
    "refresh_session_notes",
  ]);

  var CONFIG = {
    lists: { sessions: "Sessions", bands: "Bands", registration: "Registration", members: "Members" },
    // Leader-facing roster view (Migration/Add-RegistrationBandListsView.ps1) -
    // reused here for the Band Notes "Band Name" link, same as onhb-bands-widget.js's
    // leader-cell link (filtered on Band alone).
    views: { bandLists: "Band Lists" },
    fields: {
      sessionYear:   ["Year"],
      sessionSeason: ["SeasonLookup", "Season"],
      sessionSync:   ["LastSynced"],
      bandSession:   ["SessionLookup", "Session"],
      bandNotes:     ["Notes"],
      regBand:       ["BandLookup", "Band"],
      regStatus:     ["StatusLookup", "Status"],
      regSession:    ["SessionLookup", "Session"],
      regMember:     ["MemberLookup", "Member"],
      regEntryId:    ["EntryID", "Entry ID"],
      regMemberNotes:["MemberNotes", "Member Notes"],
      memberLast:    ["LastName", "Last Name"]
    },
    excludedStatuses: ["Withdrawn", "Duplicate"],   // same rule the Bands widget's counts use
    // Session dropdown starts here. Season rank: Winter=1, Spring=2, Fall=3;
    // 2024 Fall = 2024*10 + 3.
    earliestSessionKey: 2024 * 10 + 3,
    fallbackSite: "https://ottawanewhorizons.sharepoint.com/sites/Registration"
  };

  var STYLE = '<style>' +
    '.onhb-n{--bd:#d0d0d0;--hd:#2f3b52;--hd-fg:#fff;--stripe:#f6f7f9;font:13px/1.4 "Segoe UI",Roboto,Arial,sans-serif;color:#1b1b1b;max-width:100%}' +
    '.onhb-n .bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}' +
    '.onhb-n select,.onhb-n button{font:inherit;padding:3px 8px}' +
    '.onhb-n h3{font-size:14px;margin:16px 0 4px}' +
    '.onhb-n h3:first-child{margin-top:0}' +
    '.onhb-n .cnt{color:#888;font-weight:400;font-size:12px}' +
    '.onhb-n .none{color:#777;margin:2px 0 0;font-style:italic}' +
    '.onhb-n .scroll{overflow-x:auto;border:1px solid var(--bd);border-radius:6px}' +
    '.onhb-n table{border-collapse:collapse;width:100%;white-space:normal}' +
    '.onhb-n th,.onhb-n td{border:1px solid var(--bd);padding:3px 8px;text-align:left;vertical-align:top}' +
    '.onhb-n thead th{background:var(--hd);color:var(--hd-fg)}' +
    '.onhb-n tbody tr:nth-child(even) td{background:var(--stripe)}' +
    '.onhb-n a{color:#0071eb;text-decoration:none}' +
    '.onhb-n a:hover{text-decoration:underline}' +
    '.onhb-n .err{background:#fdecec;border:1px solid #e3a0a0;color:#8a1f1f;padding:10px;border-radius:6px;white-space:pre-wrap}' +
    '.onhb-n .muted{color:#999}' +
    '.onhb-n .foot{margin-top:8px;color:#666;font-size:11.5px}' +
    '</style>';

  var MARKUP =
    '<div class="onhb-n">' +
      '<div data-out></div>' +
      '<div class="bar"><label>Session <select data-session></select></label>' +
        '<button data-refresh>Refresh</button><span class="muted" data-status></span></div>' +
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

    var STATE = { sessions: [], F: {} };

    function loadFieldMaps() {
      var f = CONFIG.fields;
      return Promise.all([
        resolveFields(CONFIG.lists.sessions, { year: f.sessionYear, season: f.sessionSeason, sync: f.sessionSync }),
        resolveFields(CONFIG.lists.bands, { session: f.bandSession, notes: f.bandNotes }),
        resolveFields(CONFIG.lists.registration, { band: f.regBand, status: f.regStatus, session: f.regSession, member: f.regMember, entryId: f.regEntryId, notes: f.regMemberNotes }),
        resolveFields(CONFIG.lists.members, { last: f.memberLast }),
        spGet(apiList(CONFIG.lists.registration) + "/RootFolder?$select=ServerRelativeUrl").catch(function () { return {}; }),
        spGet(apiList(CONFIG.lists.registration) + "/views/getbytitle('" + encodeURIComponent(CONFIG.views.bandLists) + "')?$select=Id").catch(function () { return {}; }),
        // Same DispForm.aspx-by-own-RootFolder pattern onhb-treasurer-widget.js
        // uses for its Payer/Member links - one record's own page, not a
        // filtered view.
        spGet(apiList(CONFIG.lists.bands) + "/RootFolder?$select=ServerRelativeUrl").catch(function () { return {}; }),
        spGet(apiList(CONFIG.lists.members) + "/RootFolder?$select=ServerRelativeUrl").catch(function () { return {}; })
      ]).then(function (r) {
        STATE.F = { s: r[0], b: r[1], r: r[2], m: r[3] };
        // Same reliable-URL pattern onhb-bands-widget.js uses: the LIST's own
        // page (AllItems.aspx) with a query string, not a view's own dedicated
        // .aspx URL (which can throw "Unknown render failure" in the modern
        // experience on a fresh navigation).
        STATE.regRoot = r[4] && r[4].ServerRelativeUrl ? (origin + r[4].ServerRelativeUrl + "/AllItems.aspx") : null;
        STATE.regViewId = r[5] && r[5].Id ? r[5].Id : null;
        STATE.bandsRoot = r[6] && r[6].ServerRelativeUrl ? (origin + r[6].ServerRelativeUrl) : null;
        STATE.membersRoot = r[7] && r[7].ServerRelativeUrl ? (origin + r[7].ServerRelativeUrl) : null;
      });
    }

    function loadSessions() {
      var F = STATE.F.s;
      var sel = ["Id", "Title"]; if (F.year) { sel.push(F.year); } if (F.sync) { sel.push(F.sync); }
      var exp = []; if (F.season) { sel.push(F.season + "/Title"); sel.push(F.season + "/Id"); exp.push(F.season); }
      return spGet(itemsUrl(CONFIG.lists.sessions, { select: sel, expand: exp })).then(function (d) {
        STATE.sessions = (d.value || []).map(function (it) {
          return { id: it.Id, title: it.Title,
            year: F.year ? (Number(it[F.year]) || 0) : 0,
            rank: F.season ? ((it[F.season] && it[F.season].Id) || 0) : 0,
            sync: F.sync ? (it[F.sync] || null) : null };
        }).filter(function (s) {
          return (s.year * 10 + s.rank) >= CONFIG.earliestSessionKey;
        }).sort(function (a, b) { return (b.year * 10 + b.rank) - (a.year * 10 + a.rank); });
      });
    }

    function loadSession(sessionId) {
      var Fb = STATE.F.b, Fr = STATE.F.r, Fm = STATE.F.m;

      var bSel = ["Id", "Title"], bExp = [];
      if (Fb.notes) { bSel.push(Fb.notes); }
      var bFilter = Fb.session ? (Fb.session + "Id eq " + sessionId) : null;
      var pBands = spGet(itemsUrl(CONFIG.lists.bands, { select: bSel, expand: bExp, filter: bFilter, order: "Title" }));

      var rSel = ["Id", "Modified"], rExp = [];
      if (Fr.status)  { rSel.push(Fr.status + "/Title"); rExp.push(Fr.status); }
      if (Fr.entryId) { rSel.push(Fr.entryId); }
      if (Fr.notes)   { rSel.push(Fr.notes); }
      // Registration.Title is the COMBINED "First Last" string (no separate
      // name fields on Registration itself) - Member for the notes list below
      // comes from the linked Member record instead (Title = first,
      // LastName-ish = last).
      if (Fr.member) {
        rSel.push(Fr.member + "/Id");
        rSel.push(Fr.member + "/Title");
        if (Fm.last) { rSel.push(Fr.member + "/" + Fm.last); }
        rExp.push(Fr.member);
      }
      var rFilter = Fr.session ? (Fr.session + "Id eq " + sessionId) : null;
      var pReg = spGet(itemsUrl(CONFIG.lists.registration, { select: rSel, expand: rExp, filter: rFilter }));

      return Promise.all([pBands, pReg]).then(function (r) {
        return { bands: r[0].value || [], regs: r[1].value || [] };
      });
    }

    // Most-recently-updated first (each row's own SharePoint Modified stamp -
    // a native field on every list item, no schema change needed), so a note
    // that just changed surfaces at the top instead of wherever the
    // alphabetical order happened to put it. Ties (or a missing/unparseable
    // Modified) fall back to the old alphabetical order rather than an
    // arbitrary one.
    function byModifiedDesc(aIso, bIso, aKey, bKey) {
      var am = aIso ? new Date(aIso).getTime() : 0;
      var bm = bIso ? new Date(bIso).getTime() : 0;
      if (isNaN(am)) { am = 0; }
      if (isNaN(bm)) { bm = 0; }
      if (bm !== am) { return bm - am; }
      return aKey.localeCompare(bKey);
    }

    // Highest Entry ID first (GF assigns them sequentially, so this reads as
    // "most recently submitted registration first" - a plain numeric sort,
    // not the row's own text). A blank/unparseable Entry ID (shouldn't
    // happen live - every synced Registration row carries one) falls back to
    // Modified, then alphabetical by Member, rather than sorting to an
    // arbitrary spot.
    function byEntryIdDesc(aId, bId, aIso, bIso, aKey, bKey) {
      var ae = parseInt(aId, 10), be = parseInt(bId, 10);
      var aOk = !isNaN(ae), bOk = !isNaN(be);
      if (aOk && bOk && ae !== be) { return be - ae; }
      if (aOk !== bOk) { return aOk ? -1 : 1; }   // the one with a real Entry ID wins
      return byModifiedDesc(aIso, bIso, aKey, bKey);
    }

    // Note text, reverse-alphabetical (Z-A) - lets an admin scan notes by
    // their own wording rather than by when they were touched. Ties (equal
    // note text) fall back to Band Name alphabetical, same tie-break shape
    // every other sort here uses.
    function byNoteDesc(aNote, bNote, aKey, bKey) {
      var cmp = (bNote || "").localeCompare(aNote || "");
      if (cmp !== 0) { return cmp; }
      return aKey.localeCompare(bKey);
    }

    function memberNotesRows(regs) {
      var Fr = STATE.F.r, Fm = STATE.F.m;
      if (!Fr.notes) { return []; }
      var rows = [];
      regs.forEach(function (rg) {
        var note = (rg[Fr.notes] || "").trim();
        if (!note) { return; }
        if (Fr.status && CONFIG.excludedStatuses.indexOf(lookupVal(rg, Fr.status)) !== -1) { return; }
        var mem = Fr.member ? rg[Fr.member] : null;
        var first = (mem && mem.Title) || "";
        var last = (mem && Fm.last && mem[Fm.last]) || "";
        var member = (first + " " + last).trim();
        rows.push({ member: member, memberId: (mem && mem.Id) || null,
          entryId: Fr.entryId ? (rg[Fr.entryId] || "") : "", note: note, modified: rg.Modified || null });
      });
      rows.sort(function (a, b) { return byEntryIdDesc(a.entryId, b.entryId, a.modified, b.modified, a.member, b.member); });
      return rows;
    }

    function bandNotesRows(bands) {
      var Fb = STATE.F.b;
      if (!Fb.notes) { return []; }
      var rows = [];
      bands.forEach(function (b) {
        var note = (b[Fb.notes] || "").trim();
        if (!note) { return; }
        rows.push({ id: b.Id, title: b.Title || "", note: note });
      });
      rows.sort(function (a, b) { return byNoteDesc(a.note, b.note, a.title, b.title); });
      return rows;
    }

    // Entry ID -> Registration, filtered plainly on that Entry ID (not the
    // Band Lists roster view - a general "show me this submission" link, same
    // mechanism the live Registration.EntryID column formatting already uses
    // - Migration/Set-RegistrationEntryIdLink.ps1, and onhb-treasurer-widget.js's
    // own Entry ID column).
    function entryIdLink(eid) {
      if (!eid || !STATE.regRoot) { return esc(eid); }
      var url = STATE.regRoot + "?FilterField1=" + encodeURIComponent(STATE.F.r.entryId) +
        "&FilterValue1=" + encodeURIComponent(eid);
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(eid) + '</a>';
    }

    // Band Name -> Registration's Band Lists roster view, filtered on the
    // BAND'S TITLE (classic SharePoint's FilterField1/FilterValue1 filters a
    // lookup column by its displayed value, same as onhb-bands-widget.js's
    // leader-cell link). The band's own name is the visible link text.
    function bandNameLink(band) {
      var Fr = STATE.F.r;
      if (!STATE.regRoot || !Fr.band || !band.title) { return esc(band.title); }
      var href = STATE.regRoot + "?";
      if (STATE.regViewId) { href += "viewid=" + encodeURIComponent(STATE.regViewId) + "&"; }
      href += "FilterField1=" + encodeURIComponent(Fr.band) + "&FilterValue1=" + encodeURIComponent(band.title);
      return '<a href="' + esc(href) + '" target="_blank" rel="noopener" title="Open this band\'s roster (Band Lists view)">' +
        esc(band.title) + '</a>';
    }

    // ID -> the band's OWN record in the Bands list itself (DispForm.aspx,
    // re-added 2026-08-24 - a separate link target from Band Name above,
    // which goes to the roster view instead), same DispForm-by-own-
    // RootFolder pattern onhb-treasurer-widget.js uses for its Payer/Member
    // links.
    function bandIdLink(band) {
      if (!STATE.bandsRoot) { return esc(band.id); }
      var url = STATE.bandsRoot + "/DispForm.aspx?ID=" + encodeURIComponent(band.id);
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="Open this band\'s record">' +
        esc(band.id) + '</a>';
    }

    // Member -> that member's own record in the Members list (DispForm.aspx),
    // same pattern as bandIdLink/onhb-treasurer-widget.js's Payer link.
    function memberLink(row) {
      if (!row.memberId || !STATE.membersRoot) { return esc(row.member); }
      var url = STATE.membersRoot + "/DispForm.aspx?ID=" + encodeURIComponent(row.memberId);
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener" title="Open this member\'s record">' +
        esc(row.member) + '</a>';
    }

    function build(data, session) {
      var memberRows = memberNotesRows(data.regs);
      var bandRows = bandNotesRows(data.bands);

      var h = '';

      h += '<h3>Band Notes <span class="cnt">(' + bandRows.length + ')</span></h3>';
      if (!bandRows.length) {
        h += '<p class="none">(none this session)</p>';
      } else {
        h += '<div class="scroll"><table><thead><tr>' +
          '<th>Band Name</th><th>ID</th><th>Notes</th></tr></thead><tbody>';
        bandRows.forEach(function (r) {
          h += '<tr><td>' + bandNameLink(r) + '</td><td>' + bandIdLink(r) + '</td><td>' + esc(r.note) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }

      h += '<h3>Member Notes <span class="cnt">(' + memberRows.length + ')</span></h3>';
      if (!memberRows.length) {
        h += '<p class="none">(none this session)</p>';
      } else {
        h += '<div class="scroll"><table><thead><tr>' +
          '<th>Member</th><th>Entry&nbsp;ID</th><th>Notes</th></tr></thead><tbody>';
        memberRows.forEach(function (r) {
          h += '<tr><td>' + memberLink(r) + '</td><td>' + entryIdLink(r.entryId) + '</td><td>' + esc(r.note) + '</td></tr>';
        });
        h += '</tbody></table></div>';
      }

      // Footer: data freshness from Sessions.LastSynced (same convention the
      // Bands widget uses).
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

    loadFieldMaps().then(loadSessions).then(function () {
      if (!STATE.sessions.length) { throw new Error("No Sessions found."); }
      var sel = q('[data-session]'); sel.innerHTML = "";
      STATE.sessions.forEach(function (s) { var o = document.createElement("option"); o.value = String(s.id); o.textContent = s.title; sel.appendChild(o); });
      sel.value = String(STATE.sessions[0].id);
      sel.onchange = function () { selectSession(Number(sel.value)); };
      q('[data-refresh]').onclick = function () { selectSession(Number(sel.value)); };
      selectSession(STATE.sessions[0].id);
    }).catch(showError);
  }

  // --- self-run: resolve site + host, then render ---
  var site = (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) || CONFIG.fallbackSite;
  var host = document.getElementById("onhb-notes-host");
  if (host) { render(host, site); }
})();
