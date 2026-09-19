import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
export async function applicationPdf(input: {
  name: string;
  title: string;
  text: string;
  font: Uint8Array;
}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(input.font, { subset: true });
  const chars = new Set(font.getCharacterSet());
  for (const c of input.name + input.title + input.text)
    if (!/\s/.test(c) && !chars.has(c.codePointAt(0)!))
      throw new Error("UNSUPPORTED_PDF_CHARACTER");
  doc.setTitle(input.title);
  doc.setAuthor(input.name);
  doc.setProducer("JobbFlow");
  let page = doc.addPage([595.28, 841.89]),
    y = 785;
  function line(text: string, size = 11) {
    if (y < 60) {
      page = doc.addPage([595.28, 841.89]);
      y = 785;
    }
    page.drawText(text, {
      x: 52,
      y,
      size,
      font,
      color: rgb(0.063, 0.145, 0.106),
    });
    y -= size * 1.6;
  }
  function paragraph(value: string, size = 11) {
    for (const sourceLine of value.split("\n")) {
      let current = "";
      for (const word of sourceLine.split(/\s+/)) {
        const next = current ? current + " " + word : word;
        if (font.widthOfTextAtSize(next, size) > 490 && current) {
          line(current, size);
          current = "";
        }
        if (font.widthOfTextAtSize(word, size) > 490) {
          for (const c of word) {
            if (font.widthOfTextAtSize(current + c, size) > 490) {
              line(current, size);
              current = "";
            }
            current += c;
          }
        } else current = current ? current + " " + word : word;
      }
      line(current, size);
    }
    y -= 6;
  }
  paragraph(input.name, 24);
  paragraph(input.title, 13);
  y -= 18;
  paragraph(input.text);
  return doc.save();
}
