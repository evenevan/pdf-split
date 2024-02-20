import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';

/* eslint-disable no-await-in-loop */

interface Range {
    title: string;
    pages: number[];
    children: Range[];
}

// inclusive of start and end
const sequence = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
const getFirstPage = (range?: Range) => {
    if (!range) {
        return null;
    }

    let currRange = range;

    while (currRange.children.length > 0 && currRange.pages.length === 0) {
        currRange = currRange.children[0]!;
    }

    return currRange.pages[0];
};
const mapToRanges = async (pdf: pdfjs.PDFDocumentProxy, items: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getOutline']>>, endpoint: number, level: number) => {
    if (items.length === 0 || level === 0) {
        return [];
    }

    // ascending order
    const currRanges: Range[] = [];
    let currEndpoint = endpoint;

    // start from the back in order to the the endpoint for the "next" range
    // eslint-disable-next-line no-restricted-syntax
    for (const item of items.reverse()) {
        const destination = Array.isArray(item.dest)
            ? item.dest
            : await pdf.getDestination(item.dest as string);
        // 1-indexed
        const page = await pdf.getPageIndex(destination![0]) + 1;
        const childRanges = (await mapToRanges(pdf, item.items, currEndpoint, level - 1));
        const childFirstPage = getFirstPage(childRanges[0]);

        // ascending order page numbers (1-indexed)
        const newRange = sequence(page, (childFirstPage ?? currEndpoint) - 1);

        currRanges.unshift({
            title: item.title,
            pages: newRange,
            children: childRanges,
        });

        currEndpoint = page;
    }

    return currRanges;
};

const rangeToPDFs = async (pdf: PDFDocument, range: Range) => {
    const pdfs: PDFDocument[] = [];

    const newPDF = await PDFDocument.create();
    newPDF.setTitle(range.title);
    const copiedPages = await newPDF.copyPages(pdf, range.pages.map((page) => page - 1));
    copiedPages.forEach((page) => newPDF.addPage(page));
    pdfs.push(newPDF);

    const childrenPDFs = await Promise.all(range.children.map((child) => rangeToPDFs(pdf, child)));
    childrenPDFs.forEach((childPDF) => pdfs.push(...childPDF.flat(1)));

    return pdfs;
};

(async () => {
    const url = 'C:\\filepath\\to\\.pdf';
    const pdf = await pdfjs.getDocument(url).promise;
    const outline = await pdf.getOutline();

    if (!outline) {
        console.error('No outline found, cannot proceed');
        return;
    }

    // must have a non-null outline else will fail
    const ranges = await mapToRanges(pdf, outline, pdf.numPages + 1, 3);
    const firstChildPage = getFirstPage(ranges[0]);
    // ascending order page numbers (1-indexed)
    // assuming at least 1 child
    const pages = sequence(1, (firstChildPage ?? pdf.numPages + 1) - 1);
    const document: Range = {
        title: 'PDF',
        pages: pages,
        children: ranges,
    };

    console.log(JSON.stringify(document, null, 4));

    const existingPdfBytes = fs.readFileSync(url);
    const pdfs = await rangeToPDFs(await PDFDocument.load(existingPdfBytes), document);

    if (!fs.existsSync('./output')) {
        fs.mkdirSync('./output');
    }

    // eslint-disable-next-line no-restricted-syntax
    for (const newPDF of pdfs) {
        const pdfBytes = await newPDF.save();
        fs.writeFileSync(`./output/${(newPDF.getTitle() ?? '').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`, pdfBytes);
    }
})();

// import fs from 'fs';
// import * as pdf2img from 'pdf-img-convert';

// (async function () {
//     const pdfArray = await pdf2img.convert('C:/Users/User/Documents/code/onenote/test/152-notes-booklet.pdf') as string[];
//     console.log('saving');
//     for (let i = 0; i < pdfArray.length; i++) {
//         fs.writeFile(`output${i}.png`, pdfArray[i]!, (error) => {
//             if (error) { console.error(`Error: ${error}`); }
//         }); // writeFile
//     } // for
// }());
