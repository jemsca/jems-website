# -*- coding: utf-8 -*-
"""Render marked tokens (JSON) into a .docx, reusing an existing How To.docx as
the style/numbering template. Args: tokens.json  template.docx  output.docx"""
import sys, os, io, re, json, html, zipfile, shutil, tempfile

TOKENS, TEMPLATE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

CAL = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri" />'
MONO = '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas" />'

def esc(s):
    return html.unescape(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

# ---- heading bookmarks (so #anchor links / wikilinks jump in Word) ----
def slug(h):
    s = h.strip().lower()
    s = re.sub(r'[^a-z0-9 _-]', '', s)
    return s.replace(' ', '-')

def plain_text(toks):
    s = ''
    for t in toks or []:
        if t.get('type') == 'html':
            continue
        if t.get('tokens'):
            s += plain_text(t['tokens'])
        elif t.get('text'):
            s += t['text']
    return s

def bookmark_name(anchor, n):
    """Word bookmark names must start with a letter and contain only
    letters/digits/underscores (40-char cap) - derive one from the heading's
    own anchor slug instead of an opaque 'bkm%d', so any tool that falls
    back to showing a bookmark's raw name (rather than resolving the
    surrounding heading text) still shows something readable. Found live
    2026-08-22: a doc viewer's navigation pane showed literal 'bkm5'/'bkm6'/
    etc. for a set of nested H3 subsections instead of their real headings
    ("Gravity Forms", "WordPress", ...) - those headings render with real
    text just fine (verified directly against document.xml), so this wasn't
    a rendering bug, just an unreadable name for whatever fallback path the
    viewer used. Falls back to 'bkm%d' only if the slug yields nothing
    usable (no alphanumeric characters at all) or, in the rare case two
    different anchors happen to collide once non-alphanumerics are
    stripped, for whichever collides second - anchors themselves are
    already de-duped upstream (the seen{} counter below), so a true name
    collision here should essentially never happen."""
    base = re.sub(r'[^A-Za-z0-9_]', '_', anchor).strip('_')
    if base and not base[0].isalpha():
        base = 'h_' + base
    return base[:36] if base else ('bkm%d' % n)


SLUG2BK = {}     # heading anchor slug -> Word bookmark name
HEAD_BK = []     # per top-level heading, in document order: (bookmark id, name)
def build_bookmarks(tokens):
    """Assign a Word bookmark to every top-level heading, keyed by its GitHub-style
    anchor slug (GitHub-style de-dup), so internal #anchor links can target it."""
    seen = {}
    used_names = set()
    n = 0
    for t in tokens:
        if t.get('type') == 'heading':
            base = slug(plain_text(t['tokens']))
            if base in seen:
                seen[base] += 1
                anchor = '%s-%d' % (base, seen[base])
            else:
                seen[base] = 0
                anchor = base
            n += 1
            name = bookmark_name(anchor, n)
            if name in used_names:   # true collision (rare) - fall back to a unique id
                name = 'bkm%d' % n
            used_names.add(name)
            SLUG2BK[anchor] = name
            HEAD_BK.append((1000 + n, name))   # ids offset to avoid template collisions

def heading_para(runs, depth, bkid, bkname):
    ppr = '<w:pStyle w:val="Heading%d" /><w:rPr>%s</w:rPr>' % (min(depth, 3), CAL)
    return ('<w:p><w:pPr>%s</w:pPr>'
            '<w:bookmarkStart w:id="%d" w:name="%s" />%s<w:bookmarkEnd w:id="%d" /></w:p>'
            % (ppr, bkid, bkname, runs, bkid))

# ---- hyperlink relationships to add ----
_rels = []       # (rid, url)
_ridn = [0]
def link_rid(url):
    _ridn[0] += 1
    rid = "rHtoLink%d" % _ridn[0]
    _rels.append((rid, url))
    return rid

# ---- runs ----
def run(text, bold=False, italic=False, code=False, hyper=False):
    if not text:
        return ''
    rpr = []
    if hyper:
        rpr.append('<w:rStyle w:val="Hyperlink" />')
    rpr.append(MONO if code else CAL)
    if bold:
        rpr.append('<w:b /><w:bCs />')
    if italic:
        rpr.append('<w:i /><w:iCs />')
    if code:
        rpr.append('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2" />')
    return ('<w:r><w:rPr>%s</w:rPr><w:t xml:space="preserve">%s</w:t></w:r>'
            % (''.join(rpr), esc(text)))

def render_inline(tokens, bold=False, italic=False):
    out = []
    for t in tokens or []:
        ty = t.get('type')
        if ty == 'text':
            if t.get('tokens'):
                out.append(render_inline(t['tokens'], bold, italic))
            else:
                out.append(run(t.get('text', ''), bold, italic))
        elif ty == 'strong':
            out.append(render_inline(t.get('tokens') or [{'type': 'text', 'text': t.get('text', '')}], True, italic))
        elif ty == 'em':
            out.append(render_inline(t.get('tokens') or [{'type': 'text', 'text': t.get('text', '')}], bold, True))
        elif ty in ('codespan', 'code'):
            out.append(run(t.get('text', ''), bold, italic, code=True))
        elif ty == 'del':
            out.append(render_inline(t.get('tokens') or [{'type': 'text', 'text': t.get('text', '')}], bold, italic))
        elif ty == 'br':
            out.append('<w:r><w:rPr>%s</w:rPr><w:br /></w:r>' % CAL)
        elif ty == 'html':
            pass  # inline HTML (e.g. <!-- omit in toc -->) - not real content
        elif ty == 'link':
            href = t.get('href', '')
            inner = t.get('tokens') or [{'type': 'text', 'text': t.get('text', '')}]
            # render link inner as hyperlink-styled runs
            runs = []
            for it in inner:
                if it.get('type') == 'text' and not it.get('tokens'):
                    runs.append(run(it.get('text', ''), bold, italic, hyper=True))
                elif it.get('type') == 'codespan':
                    runs.append(run(it.get('text', ''), bold, italic, code=True, hyper=True))
                elif it.get('type') == 'strong':
                    runs.append(run(it.get('text', ''), True, italic, hyper=True))
                else:
                    runs.append(run(it.get('text', ''), bold, italic, hyper=True))
            joined = ''.join(runs)
            key = href[1:] if href.startswith('#') else None
            if key is not None and key in SLUG2BK:
                # internal jump to a heading bookmark (no relationship needed)
                out.append('<w:hyperlink w:anchor="%s">%s</w:hyperlink>' % (SLUG2BK[key], joined))
            else:
                rid = link_rid(href)
                out.append('<w:hyperlink r:id="%s">%s</w:hyperlink>' % (rid, joined))
        else:
            if t.get('tokens'):
                out.append(render_inline(t['tokens'], bold, italic))
            elif t.get('text'):
                out.append(run(t.get('text', ''), bold, italic))
    return ''.join(out)

# numId used for bullet lists (a real bullet definition is injected into
# numbering.xml at build time; set there). numId=1 (the template's decimal list)
# is reserved for the T4A section, which keeps step numbers.
BULLET_NUMID = [1]   # placeholder; real value set after numbering.xml is read

# ---- paragraphs / blocks ----
def para(runs, style=None, ilvl=None, indent=None, italic_ppr=False, numid=None):
    ppr = []
    if style:
        ppr.append('<w:pStyle w:val="%s" />' % style)
    if ilvl is not None:
        nid = numid if numid is not None else BULLET_NUMID[0]
        ppr.append('<w:numPr><w:ilvl w:val="%d" /><w:numId w:val="%d" /></w:numPr>' % (ilvl, nid))
    if indent:
        ppr.append('<w:ind w:left="%d" />' % indent)
    rpr = CAL + ('<w:i /><w:iCs />' if italic_ppr else '')
    ppr.append('<w:rPr>%s</w:rPr>' % rpr)
    return '<w:p><w:pPr>%s</w:pPr>%s</w:p>' % (''.join(ppr), runs)

def empty_para():
    return '<w:p><w:pPr><w:rPr>%s</w:rPr></w:pPr></w:p>' % CAL

def render_list(tok, level, indent=None, out=None, numid=None):
    for it in tok['items']:
        text_tok = next((x for x in it['tokens'] if x['type'] == 'text'), None)
        runs = render_inline(text_tok['tokens'], ) if text_tok and text_tok.get('tokens') else \
               (run(text_tok.get('text', '')) if text_tok else '')
        out.append(para(runs, ilvl=level, indent=indent, numid=numid))
        for x in it['tokens']:
            if x['type'] == 'list':
                render_list(x, min(level + 1, 3), indent, out, numid)

def render_table(tok, out):
    ncol = len(tok['header'])
    total = 9360
    w = total // ncol
    grid = ''.join('<w:gridCol w:w="%d" />' % w for _ in range(ncol))
    borders = ('<w:tblBorders>' +
               ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="auto" />' % s
                       for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV')) +
               '</w:tblBorders>')
    def cell(tokens, header=False):
        runs = render_inline(tokens)
        if header:
            # bold the cell content
            runs = runs.replace('<w:rPr>' + CAL, '<w:rPr>' + CAL + '<w:b /><w:bCs />')
        shd = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9" />' if header else ''
        p = '<w:p><w:pPr><w:rPr>%s</w:rPr></w:pPr>%s</w:p>' % (CAL, runs or '')
        return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa" />%s</w:tcPr>%s</w:tc>'
                % (w, shd, p))
    rows = ['<w:tr>' + ''.join(cell(h['tokens'], True) for h in tok['header']) + '</w:tr>']
    for r in tok['rows']:
        rows.append('<w:tr>' + ''.join(cell(c['tokens']) for c in r) + '</w:tr>')
    out.append('<w:tbl><w:tblPr><w:tblW w:w="%d" w:type="dxa" />%s</w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>'
               % (total, borders, grid, ''.join(rows)))
    out.append(empty_para())

def render_blockquote(tok, out):
    for child in tok['tokens']:
        ty = child['type']
        if ty == 'paragraph':
            out.append(para(render_inline(child['tokens']), indent=360, italic_ppr=True))
        elif ty == 'list':
            render_list(child, 0, indent=360, out=out)
        elif ty == 'text':
            out.append(para(render_inline(child.get('tokens') or [{'type': 'text', 'text': child.get('text', '')}]),
                            indent=360, italic_ppr=True))
        elif ty == 'blockquote':
            render_blockquote(child, out)

# The one section that keeps NUMBERED steps (uses the template's decimal list).
NUMBERED_SECTION = "Prepare T4A forms"

def walk(tokens):
    out = []
    in_numbered = False
    hcount = [0]
    for t in tokens:
        ty = t['type']
        if ty == 'heading':
            if t['depth'] <= 2:      # a new H1/H2 sets/clears the numbered section
                txt = ''.join(x.get('text', '') for x in t['tokens'])
                in_numbered = (t['depth'] == 2 and txt.strip() == NUMBERED_SECTION)
            bkid, bkname = HEAD_BK[hcount[0]]
            hcount[0] += 1
            out.append(heading_para(render_inline(t['tokens']), t['depth'], bkid, bkname))
        elif ty == 'paragraph':
            out.append(para(render_inline(t['tokens'])))
        elif ty == 'list':
            render_list(t, 0, out=out, numid=(1 if in_numbered else None))
        elif ty == 'table':
            render_table(t, out)
        elif ty == 'blockquote':
            render_blockquote(t, out)
        elif ty == 'code':
            out.append(para(run(t.get('text', ''), code=True)))
        elif ty == 'hr':
            out.append('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto" /></w:pBdr><w:rPr>%s</w:rPr></w:pPr></w:p>' % CAL)
        # html (comments) and space: skip
    return ''.join(out)

# ---- build the document from the template ----
tokens = json.load(io.open(TOKENS, encoding='utf-8'))

tmp = tempfile.mkdtemp()
with zipfile.ZipFile(TEMPLATE) as z:
    z.extractall(tmp)

# Inject a real bullet-list definition into numbering.xml and use it for all
# lists except the T4A section (which keeps numId=1, the decimal list).
numpath = os.path.join(tmp, 'word', 'numbering.xml')
numxml = io.open(numpath, encoding='utf-8').read()
aid = max([int(n) for n in re.findall(r'w:abstractNumId="(\d+)"', numxml)] + [0]) + 1
nid = max([int(n) for n in re.findall(r'w:numId="(\d+)"', numxml)] + [1]) + 1
BULLET_NUMID[0] = nid
_bul = ['•', '◦', '▪', '•']   # bullet, white bullet, small square
lvls = ''.join(
    '<w:lvl w:ilvl="%d"><w:start w:val="1" /><w:numFmt w:val="bullet" />'
    '<w:lvlText w:val="%s" /><w:lvlJc w:val="left" />'
    '<w:pPr><w:ind w:left="%d" w:hanging="360" /></w:pPr></w:lvl>'
    % (i, _bul[i], (i + 1) * 720) for i in range(4))
abs = ('<w:abstractNum w:abstractNumId="%d"><w:multiLevelType w:val="hybridMultilevel" />%s</w:abstractNum>'
       % (aid, lvls))
numdef = '<w:num w:numId="%d"><w:abstractNumId w:val="%d" /></w:num>' % (nid, aid)
m = re.search(r'<w:num\b', numxml)
numxml = numxml[:m.start()] + abs + numxml[m.start():]      # abstractNum before first num
numxml = numxml.replace('</w:numbering>', numdef + '</w:numbering>')
io.open(numpath, 'w', encoding='utf-8').write(numxml)

build_bookmarks(tokens)   # assign heading bookmarks before rendering links
body = walk(tokens)   # now BULLET_NUMID is set

docpath = os.path.join(tmp, 'word', 'document.xml')
doc = io.open(docpath, encoding='utf-8').read()
prefix = doc[:doc.index('<w:body>') + len('<w:body>')]
sect = doc[doc.rindex('<w:sectPr'):]                 # sectPr ... </w:body></w:document>
new_doc = prefix + body + sect
io.open(docpath, 'w', encoding='utf-8').write(new_doc)

# add hyperlink relationships
relpath = os.path.join(tmp, 'word', '_rels', 'document.xml.rels')
rels = io.open(relpath, encoding='utf-8').read()
# The template is the PREVIOUS output, so converter-generated hyperlink rels
# accumulate and (because rHtoLink ids restart each run) collide with stale
# targets. Purge all rHtoLink* rels first, then re-add exactly this run's.
rels = re.sub(r'<Relationship\b[^>]*\bId="rHtoLink\d+"[^>]*/>', '', rels)
existing = set(re.findall(r'Id="([^"]+)"', rels))
adds = []
for rid, url in _rels:
    if rid in existing:
        continue
    u = url.replace('&', '&amp;').replace('"', '&quot;')
    adds.append('<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" '
                'Target="%s" TargetMode="External" Id="%s" />' % (u, rid))
rels = rels.replace('</Relationships>', ''.join(adds) + '</Relationships>')
io.open(relpath, 'w', encoding='utf-8').write(rels)

# repackage - write to a temp file next to OUT, then atomically replace it
# (rename-over, not delete-then-create) so a OneDrive-synced destination sees
# an edit of the same file, not a delete+new-upload - the latter can hand a
# SharePoint "Copy link"-style sourcedoc={GUID} nav link a brand new item ID.
out_tmp = OUT + ".tmp"
with zipfile.ZipFile(out_tmp, 'w', zipfile.ZIP_DEFLATED) as z:
    for dp, dn, fn in os.walk(tmp):
        for f in fn:
            full = os.path.join(dp, f)
            z.write(full, os.path.relpath(full, tmp).replace(os.sep, '/'))
os.replace(out_tmp, OUT)
shutil.rmtree(tmp, ignore_errors=True)

# sanity
import xml.dom.minidom as M
M.parseString(io.open(docpath if False else None).read() if False else new_doc.encode('utf-8'))
print("OK: wrote", OUT, "| body paras/tbls:", new_doc.count('<w:p>') + new_doc.count('<w:tbl>'),
      "| hyperlinks:", len(_rels))
