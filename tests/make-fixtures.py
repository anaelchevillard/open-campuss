#!/usr/bin/env python3
"""Recrée les fichiers de test volumineux, exclus du dépôt."""
import pathlib, zipfile
here = pathlib.Path(__file__).parent / "fixtures"
(here / "gros.bin").write_bytes(b"x" * (20 * 1024 * 1024))
with zipfile.ZipFile(here / "bomb.zip", "w", zipfile.ZIP_DEFLATED, compresslevel=1) as z, z.open("zero.bin", "w", force_zip64=True) as f:
    for _ in range(1200):
        f.write(b"\0" * 1048576)


# --- imports de notes
import base64, hashlib, io, os, struct, zipfile as _zip
_here = os.path.dirname(os.path.abspath(__file__)) + "/fixtures/"
_png = open(_here + "page.png", "rb").read()

def _docx():
    W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    body = f"""<?xml version="1.0" encoding="UTF-8"?><w:document {W}><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Partie Word</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Un mot </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>important</w:t></w:r><w:r><w:t xml:space="preserve"> et un mot </w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>souligne</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100000" cy="100000"/><wp:docPr id="1" name="i"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="i"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId9"/></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>&lt;script&gt;window.__xss=1&lt;/script&gt;</w:t></w:r></w:p>
</w:body></w:document>"""
    with _zip.ZipFile(_here + "note.docx", "w", _zip.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        z.writestr("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        z.writestr("word/_rels/document.xml.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>')
        z.writestr("word/styles.xml", f'<?xml version="1.0"?><w:styles {W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>')
        z.writestr("word/document.xml", body)
        z.writestr("word/media/image1.png", _png)

def _varint(n):
    out = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        if n: out.append(b | 0x80)
        else: out.append(b); return bytes(out)

def _field(num, data):
    return _varint(num << 3 | 2) + _varint(len(data)) + data

def _vfield(num, value):
    return _varint(num << 3) + _varint(value)

def _pages():
    # Fichier fabriqué d'après la description du format : il vérifie le lecteur, pas la compatibilité avec un vrai Pages
    storage = _vfield(1, 0) + _field(3, "Texte venu de Pages\nDeuxième paragraphe ￼".encode())
    info = _vfield(1, 1) + _field(2, _vfield(1, 2001) + _vfield(3, len(storage)))
    raw = _varint(len(info)) + info + storage
    snappy = _varint(len(raw)) + bytes([61 << 2]) + struct.pack("<H", len(raw) - 1) + raw
    frame = b"\x00" + struct.pack("<I", len(snappy))[:3] + snappy
    with _zip.ZipFile(_here + "note.pages", "w") as z:
        z.writestr("Index/Document.iwa", frame)
        z.writestr("Data/photo-1.png", _png)
        z.writestr("preview.jpg", b"x")

def _others():
    open(_here + "note.md", "w", encoding="utf8").write("---\ntags: [cours]\n---\n# Note Obsidian\n\nVoir [[Autre note|cette note]] et [[Page]], un ==passage important== %%cache%%.\n\n> [!warning] Piège\n> Détail\n\n![[absente.png]]\n\n<script>window.__xss=1</script>\n")
    b64 = base64.b64encode(_png).decode()
    md5 = hashlib.md5(_png).hexdigest()
    open(_here + "note.enex", "w", encoding="utf8").write(f'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd"><en-export><note><title>Note Evernote</title><content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note><h1>Titre Evernote</h1><div>Contenu Evernote <b>gras</b></div><en-todo checked="true"/>fait<en-media hash="{md5}" type="image/png"/></en-note>]]></content><resource><data encoding="base64">{b64}</data><mime>image/png</mime></resource></note></en-export>')
    with _zip.ZipFile(_here + "vault.zip", "w", _zip.ZIP_DEFLATED) as z:
        z.writestr("Export/Cours 0123456789abcdef0123456789abcdef.md", "# Note depuis Notion\n\nTexte ![schema](Cours%200123456789abcdef0123456789abcdef/schema.png)\n")
        z.writestr("Export/Cours 0123456789abcdef0123456789abcdef/schema.png", _png)
        z.writestr("Export/.obsidian/workspace.md", "ignore")

_docx(); _pages(); _others()
