import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

/* eslint-disable max-len */
/* eslint-disable no-await-in-loop */

export interface Section {
    title: string;
    pages: number[];
    children: Section[];
}

export interface PDFTree {
    pdf: PDFDocument;
    children: PDFTree[];
}

interface Item {
    title: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getOutline']>>[number]['title'],
    dest: Awaited<ReturnType<pdfjs.PDFDocumentProxy['getOutline']>>[number]['dest'] | number,
    items: Item[],
}

// inclusive of start and end
export const sequence = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, i) => start + i);

const getFirstPage = (range?: Section) => {
    if (!range) {
        return null;
    }

    let currRange = range;

    while (currRange.children.length > 0 && currRange.pages.length === 0) {
        currRange = currRange.children[0]!;
    }

    return currRange.pages[0];
};

export const itemToSection = async (pdf: pdfjs.PDFDocumentProxy, item: Item, endpoint: number, level: number): Promise<Section> => {
    // 1-indexed
    const itemPageIndex = typeof item.dest === 'number'
        ? item.dest
        : await pdf.getPageIndex(
            (Array.isArray(item.dest)
                ? item.dest
                : await pdf.getDestination(item.dest as string))![0],
        ) + 1;

    if (level === 0) {
        return {
            title: item.title,
            pages: sequence(itemPageIndex, endpoint - 1),
            children: [],
        };
    }

    const children: Section[] = [];
    let currEndpoint = endpoint;

    // eslint-disable-next-line no-restricted-syntax
    for (const childItem of item.items.reverse()) {
        const section = await itemToSection(pdf, childItem, currEndpoint, level - 1);
        children.unshift(section);
        currEndpoint = getFirstPage(section)!;
    }

    return {
        title: item.title,
        pages: sequence(itemPageIndex, currEndpoint - 1),
        children: children,
    };
};

export const sectionToPDFTree = async (pdf: PDFDocument, section: Section): Promise<PDFTree> => {
    const newPDF = await PDFDocument.create();
    newPDF.setTitle(section.title);
    const copiedPages = await newPDF.copyPages(pdf, section.pages.map((page) => page - 1));
    copiedPages.forEach((page) => newPDF.addPage(page));

    const childPDFs = await Promise.all(section.children.map((child) => sectionToPDFTree(pdf, child)));

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

export const outlineToSections = async (pdf: pdfjs.PDFDocumentProxy, outline: Item[], maximumLevel: number): Promise<Section> => {
    const metadata = await pdf.getMetadata();
    const mainItem = {
        // @ts-ignore
        title: metadata.info.Title ?? metadata.get('dc:title') ?? 'Title',
        items: outline,
        dest: 1, // little hack; starting page index (1-indexed)
    } as Item;

    return itemToSection(pdf, mainItem, pdf.numPages + 1, maximumLevel);
};
