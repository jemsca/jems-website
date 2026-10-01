/* ONHB Treasurer Summary - widget logic
 * ---------------------------------------------------------------------------
 * Three live tables of OUTSTANDING (Pending) items from the Payments list:
 *   1. Outstanding Payments  - Type=Payment,  Status=Pending
 *   2. Refund Cheques        - Type=Refund, Method=Cheque, Status=Pending
 *   3. PayPal Refunds        - Type=Refund, Method=PayPal, Status=Pending
 * Replaces the manual weekly treasurer email - always current, all sessions.
 *
 * Every row here is Status=Pending, so Payments.TransactionDate (only ever set
 * on a SETTLED row - accept_payment.py/reconcile_payments.py) is always blank
 * for everything this widget shows. "Date" is the linked Registration row's
 * RegDate instead (Registration.EntryID == Payments.EntryID - there's no
 * SharePoint Lookup relationship between the two lists, just the shared entry
 * id, so this needs its own small Registration fetch + a client-side
 * EntryID -> RegDate map, same shape as the Python Flows' own preloads).
 * Payer links to the linked Member's record (Payments.MemberLookup); Entry ID
 * links to Payments filtered on that Entry ID (AllItems.aspx?FilterField1=
 * EntryID&FilterValue1=..., not this one row's own DispForm.aspx - an Entry ID
 * can have more than one Payments row, e.g. a Partial + its balance, or a
 * payment alongside a refund, same reasoning Migration/Set-Registration
 * EntryIdLink.ps1 already uses for the SAME filtered-view link on the live
 * Registration list's own EntryID column). Both links via each list's real
 * RootFolder/ServerRelativeUrl (fetched, not guessed from the list's display
 * Title, which can drift from its actual URL after a rename - same reliable
 * pattern onhb-bands-widget.js already uses for its own list links).
 *
 * Hosted in Site Assets, loaded as an external script by the jems HTML
 * Widget SPFx web part, which mounts it into the <div> it creates (found
 * here as this script's own parentElement - no fixed host id needed).
 *
 * GENERALIZED 2026-10-01 (jems-tasks board item #69): list/field names
 * (CONFIG, below) now load from a sibling "config.json" published next to
 * this .js in Site Assets, instead of being hardcoded here - the one copy of
 * this file works for ANY #register instance's own SharePoint list naming.
 * Also replaces the old "re-upload the .js, then hand-edit ?v= in the
 * snippet" step: the web part reads this file's own SharePoint
 * TimeLastModified to cache-bust automatically.
 */
(function () {
  "use strict";

  window.jemsWebsiteCapabilities = window.jemsWebsiteCapabilities || {};
  window.jemsWebsiteCapabilities.treasurerSummary = Object.freeze([
    "view_outstanding_payments_and_refunds",
  ]);

  // Populated from this widget's own sibling config.json - see the self-run
  // section at the bottom of this file. See onhb-treasurer-config.json for
  // the real ONHB values. Shape:
  //   list, registrationList, membersList
  //   f: { payer, type, method, status, amountDue, amount, txnId, entryId, member }
  //   reg: { entryId, date }
  //   fallbackSite
  var CONFIG = null;

  var STYLE = '<style>' +
    '.onhb-t{--bd:#d0d0d0;--hd:#2f3b52;--hd-fg:#fff;--stripe:#f6f7f9;font:13px/1.4 "Segoe UI",Roboto,Arial,sans-serif;color:#1b1b1b;max-width:100%}' +
    '.onhb-t h2{font-size:16px;margin:0 0 2px}' +
    '.onhb-t .sub{color:#666;margin:0 0 10px;font-size:12px}' +
    '.onhb-t h3{font-size:14px;margin:16px 0 4px}' +
    '.onhb-t h3:first-child{margin-top:0}' +
    '.onhb-t .cnt{color:#888;font-weight:400;font-size:12px}' +
    '.onhb-t .none{color:#777;margin:2px 0 0;font-style:italic}' +
    '.onhb-t .bar{margin-bottom:6px}' +
    '.onhb-t .scroll{overflow-x:auto;border:1px solid var(--bd);border-radius:6px}' +
    '.onhb-t table{border-collapse:collapse;width:100%;white-space:nowrap}' +
    '.onhb-t th,.onhb-t td{border:1px solid var(--bd);padding:3px 8px;text-align:left}' +
    '.onhb-t thead th{background:var(--hd);color:var(--hd-fg)}' +
    '.onhb-t td.num,.onhb-t th.num{text-align:right}' +
    '.onhb-t tbody tr:nth-child(even) td{background:var(--stripe)}' +
    '.onhb-t tfoot td{font-weight:700;background:#eef0f4}' +
    '.onhb-t a{color:#0071eb;text-decoration:none}' +
    '.onhb-t a:hover{text-decoration:underline}' +
    '.onhb-t .err{background:#fdecec;border:1px solid #e3a0a0;color:#8a1f1f;padding:10px;border-radius:6px;white-space:pre-wrap}' +
    '.onhb-t .muted{color:#999}' +
    '.onhb-t .foot{margin-top:8px;color:#666;font-size:11.5px}' +
    '</style>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c];
    });
  }
  function money(v) { var n = Number(v); return (v == null || v === "" || isNaN(n)) ? "" : "$" + n.toFixed(2); }
  function dstr(v) { return v ? String(v).slice(0, 10) : ""; }  // ISO -> YYYY-MM-DD
  // SharePoint's Number field returns EntryID as e.g. 1573.0 on one list and
  // 1573 on another - normalize both sides the same way so the Registration
  // EntryID -> RegDate map actually matches Payments rows (same trick the
  // Python Flows' own _eid() exists for).
  function eidStr(v) {
    if (v == null || v === "") { return ""; }
    var n = Number(v);
    return isNaN(n) ? String(v) : String(Math.trunc(n));
  }

  function render(container, siteUrl) {
    container.innerHTML = STYLE +
      '<div class="onhb-t">' +
      '<div data-out></div>' +
      '<div class="bar"><span class="muted" data-status></span></div></div>';
    var root = container.querySelector(".onhb-t");
    var q = function (sel) { return root.querySelector(sel); };
    var origin = siteUrl.replace(/^(https?:\/\/[^\/]+).*$/, "$1");   // scheme+host, for absolute item links
    load();

    function spGet(url) {
      return fetch(url, { headers: { "Accept": "application/json;odata=nometadata" }, credentials: "include" })
        .then(function (r) {
          if (!r.ok) { return r.text().then(function (t) { throw new Error("HTTP " + r.status + " for " + url + "\n" + t.slice(0, 300)); }); }
          return r.json();
        });
    }
    // Function declaration, not `var apiList = function...` - load() (called
    // below, before this line runs) needs it available immediately via
    // hoisting; a var-assigned function expression's VALUE isn't hoisted, only
    // the binding, which would leave apiList undefined at call time.
    function apiList(name) { return siteUrl + "/_api/web/lists/getbytitle('" + encodeURIComponent(name) + "')"; }

    function load() {
      q("[data-status]").textContent = "Loading…";
      var F = CONFIG.f;
      var sel = ["Id", F.payer, F.type, F.method, F.status, F.amountDue, F.amount, F.txnId, F.entryId, F.member + "/Id"];
      var itemsUrl = apiList(CONFIG.list) + "/items?$top=5000"
        + "&$select=" + sel.map(encodeURIComponent).join(",")
        + "&$expand=" + encodeURIComponent(F.member)
        + "&$filter=" + encodeURIComponent(F.status + " eq 'Pending'");
      var regUrl = apiList(CONFIG.registrationList) + "/items?$top=5000"
        + "&$select=" + [CONFIG.reg.entryId, CONFIG.reg.date].map(encodeURIComponent).join(",");
      var membersRootUrl = apiList(CONFIG.membersList) + "/RootFolder?$select=ServerRelativeUrl";
      var paymentsRootUrl = apiList(CONFIG.list) + "/RootFolder?$select=ServerRelativeUrl";

      Promise.all([
        spGet(itemsUrl), spGet(regUrl),
        spGet(membersRootUrl).catch(function () { return {}; }),
        spGet(paymentsRootUrl).catch(function () { return {}; })
      ]).then(function (r) {
        var regDateMap = {};
        (r[1].value || []).forEach(function (it) {
          var key = eidStr(it[CONFIG.reg.entryId]);
          if (key && !(key in regDateMap)) { regDateMap[key] = it[CONFIG.reg.date]; }
        });
        build(r[0].value || [], regDateMap,
          r[2].ServerRelativeUrl || null, r[3].ServerRelativeUrl || null);
      }).catch(function (e) {
        q("[data-out]").innerHTML = '<div class="err">Could not load the Payments list.\n\n' +
          esc(e && e.message ? e.message : e) + '</div>';
        q("[data-status]").textContent = "";
      });
    }

    function build(items, regDateMap, membersRoot, paymentsRoot) {
      var F = CONFIG.f;
      var payments = [], cheques = [], paypal = [];
      items.forEach(function (it) {
        var type = it[F.type], method = it[F.method];
        if (type === "Payment") { payments.push(it); }
        else if (type === "Refund" && method === "Cheque") { cheques.push(it); }
        else if (type === "Refund" && method === "PayPal") { paypal.push(it); }
      });

      var payerCol = {
        head: "Payer", html: true,
        get: function (r) {
          var name = r[F.payer];
          var memberId = r[F.member] && r[F.member].Id;
          if (!memberId || !membersRoot) { return esc(name); }
          var url = origin + membersRoot + "/DispForm.aspx?ID=" + encodeURIComponent(memberId);
          return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(name) + '</a>';
        }
      };
      var dateCol = {
        head: "Date",
        get: function (r) { return dstr(regDateMap[eidStr(r[F.entryId])]); }
      };
      var entryIdCol = {
        head: "Entry ID", html: true,
        get: function (r) {
          var eid = eidStr(r[F.entryId]);
          if (!eid || !paymentsRoot) { return esc(eid); }
          // Payments filtered to this Entry ID, not just this one row - an Entry
          // ID can have more than one Payments row (a Partial + its balance, or
          // a payment alongside a refund). Same FilterField1/FilterValue1
          // mechanism the live Registration.EntryID column formatting already
          // uses (Migration/Set-RegistrationEntryIdLink.ps1).
          var url = origin + paymentsRoot + "/AllItems.aspx?FilterField1=" + encodeURIComponent(F.entryId)
            + "&FilterValue1=" + encodeURIComponent(eid);
          return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(eid) + '</a>';
        }
      };
      var methodCol = { head: "Method", get: function (r) { return r[F.method]; } };
      var dueCol = { head: "Amount Due", num: true, total: F.amountDue, get: function (r) { return money(r[F.amountDue]); } };
      var refundCol = { head: "Refund Amount", num: true, total: F.amount, get: function (r) { return money(r[F.amount]); } };
      var chequeNoCol = { head: "Cheque #", get: function (r) { return r[F.txnId]; } };
      var txnCol = { head: "Transaction ID", get: function (r) { return r[F.txnId]; } };

      var h = "";
      h += section("Outstanding Payments", payments, [payerCol, dateCol, entryIdCol, dueCol, methodCol]);
      h += section("Refund Cheques", cheques, [payerCol, dateCol, entryIdCol, refundCol, chequeNoCol]);
      h += section("PayPal Refunds", paypal, [payerCol, dateCol, entryIdCol, refundCol, txnCol]);
      h += '<div class="foot">Last updated: ' + esc(new Date().toLocaleString()) + '</div>';
      q("[data-out]").innerHTML = h;
      q("[data-status]").textContent = "";
    }

    function section(title, rows, cols) {
      var h = '<h3>' + esc(title) + ' <span class="cnt">(' + rows.length + ')</span></h3>';
      h += '<div class="scroll"><table><thead><tr>';
      cols.forEach(function (c) { h += '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.head) + '</th>'; });
      h += '</tr></thead><tbody>';
      var totals = {};
      rows.forEach(function (r) {
        h += '<tr>';
        cols.forEach(function (c) {
          var val = c.get(r);
          h += '<td' + (c.num ? ' class="num"' : '') + '>' + (c.html ? val : esc(val)) + '</td>';
          if (c.total) { totals[c.total] = (totals[c.total] || 0) + (Number(r[c.total]) || 0); }
        });
        h += '</tr>';
      });
      h += '</tbody><tfoot><tr>';
      cols.forEach(function (c, i) {
        if (i === 0) { h += '<td>Total (' + rows.length + ')</td>'; }
        else if (c.total) { h += '<td class="num">' + money(totals[c.total]) + '</td>'; }
        else { h += '<td></td>'; }
      });
      h += '</tr></tfoot></table></div>';
      return h;
    }
  }

  // --- self-run: load config.json, then resolve site + host, then render ---
  var currentScript = document.currentScript;
  var host = currentScript ? currentScript.parentElement : document.getElementById("onhb-treasurer-host");
  if (host) {
    if (!currentScript) {
      host.innerHTML = '<div class="err">This widget must be loaded via the jems HTML Widget web part (needs its own script URL to find config.json).</div>';
    } else {
      var configUrl = currentScript.src.replace(/[^\/]*(\?.*)?$/, "config.json");
      fetch(configUrl, { credentials: "include" }).then(function (r) {
        if (!r.ok) { throw new Error("HTTP " + r.status + " loading config.json"); }
        return r.json();
      }).then(function (cfg) {
        CONFIG = cfg;
        var site = (window._spPageContextInfo && window._spPageContextInfo.webAbsoluteUrl) || CONFIG.fallbackSite;
        render(host, site);
      }).catch(function (e) {
        host.innerHTML = '<div class="err">Could not load widget configuration (config.json).\n\n' + esc(e && e.message ? e.message : e) + '</div>';
      });
    }
  }
})();
