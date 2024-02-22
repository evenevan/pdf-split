/* eslint-disable max-len */
import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
// import fs from 'fs';

/* eslint-disable no-await-in-loop */

export interface Sections {
    title: string;
    pages: number[];
    children: Sections[];
}

export interface PDFTree {
    pdf: PDFDocument;
    children: PDFTree[];
}

// inclusive of start and end
export const sequence = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);
const getFirstPage = (range?: Sections) => {
    if (!range) {
        return null;
    }

    let currRange = range;

    while (currRange.children.length > 0 && currRange.pages.length === 0) {
        currRange = currRange.children[0]!;
    }

    return currRange.pages[0];
};
export const pdfToPageSectionsHelper = async (pdf: pdfjs.PDFDocumentProxy, items: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getOutline']>>, endpoint: number, level: number) => {
    if (items.length === 0 || level === 0) {
        return [];
    }

    // ascending order
    const currRanges: Sections[] = [];
    let currEndpoint = endpoint;

    // start from the back in order to the the endpoint for the "next" range
    // eslint-disable-next-line no-restricted-syntax
    for (const item of items.reverse()) {
        const destination = Array.isArray(item.dest)
            ? item.dest
            : await pdf.getDestination(item.dest as string);
        // 1-indexed
        const page = await pdf.getPageIndex(destination![0]) + 1;
        const childRanges = (await pdfToPageSectionsHelper(pdf, item.items, currEndpoint, level - 1));
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

export const pageSectionsToPDFTree = async (pdf: PDFDocument, range: Sections): Promise<PDFTree> => {
    const newPDF = await PDFDocument.create();
    newPDF.setTitle(range.title);
    const copiedPages = await newPDF.copyPages(pdf, range.pages.map((page) => page - 1));
    copiedPages.forEach((page) => newPDF.addPage(page));

    const childPDFs = await Promise.all(range.children.map((child) => pageSectionsToPDFTree(pdf, child)));

    return {
        pdf: newPDF,
        children: childPDFs,
    };
};

export const savePDFTree = async (pdf: PDFTree, path: string, save: (path: string, bytes: Uint8Array) => Promise<void> | void) => {
    const title = (pdf.pdf.getTitle() ?? '').replace(/[/\\?%*:|"<>]/g, '-');

    // eslint-disable-next-line no-restricted-syntax
    for (const children of pdf.children) {
        await savePDFTree(children, `${path}/${title}`, save);
    }

    if (pdf.pdf.getPageCount() === 0) {
        return;
    }

    const pdfBytes = await pdf.pdf.save();

    if (pdf.children.length === 0) {
        save(`${path}/${title}.pdf`, pdfBytes);
    } else {
        save(`${path}/${title}/${title}.pdf`, pdfBytes);
    }
};

export const pdfToPageSections = async (pdf: pdfjs.PDFDocumentProxy, outline: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getOutline']>>, maximumLevel: number) => {
    // must have a non-null outline else will fail
    const ranges = await pdfToPageSectionsHelper(pdf, outline, pdf.numPages + 1, maximumLevel);
    const firstChildPage = getFirstPage(ranges[0]);
    // ascending order page numbers (1-indexed)
    // assuming at least 1 child
    const pages = sequence(1, (firstChildPage ?? pdf.numPages + 1) - 1);
    const metadata = await pdf.getMetadata();
    const document: Sections = {
        // @ts-ignore
        title: metadata.info.Title ?? metadata.get('dc:title') ?? 'Title',
        pages: pages,
        children: ranges,
    };

    return document;
};
