import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
// @ts-ignore
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import { downloadZip, InputWithSizeMeta } from 'client-zip';
import { saveAs } from 'file-saver';
import { pageSectionsToPDFTree, pdfToPageSections, savePDFTree } from './pdf-split';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const formElement = document.getElementById('form') as HTMLFormElement;
const fileElement = document.getElementById('pdf') as HTMLInputElement;
const levelElement = document.getElementById('level') as HTMLInputElement;
const outputElement = document.getElementById('output') as HTMLParagraphElement;

formElement.onsubmit = (async (event) => {
    outputElement.textContent = '';
    event.preventDefault();
    const inputFile = fileElement.files!.item(0)!;

    const pdfjsPDF = await pdfjs.getDocument(await inputFile.arrayBuffer()).promise;
    const outline = await pdfjsPDF.getOutline();
    const metadata = await pdfjsPDF.getMetadata();
    // @ts-ignore
    const version: string | null = metadata.info.PDFFormatVersion ?? null;

    // console.log(await pdfjsPDF.getMetadata());

    if (!outline) {
        outputElement.textContent = 'No PDF outline found, cannot proceed.';
        return;
    }

    if (Number(version) <= 1.4) {
        outputElement.textContent = `Warning: PDF version is ${version}. You may experience issues, try upgrading PDF versions. `;
    }

    outputElement.textContent += 'Processing...';

    outputElement.textContent += ' Loading PDF...';
    const pdfLibPDF = await PDFDocument.load(await inputFile.arrayBuffer());
    outputElement.textContent += ' Generating sub-PDF files...';
    const pageSections = await pdfToPageSections(pdfjsPDF, outline, Number(levelElement.value));
    const splitPDFs = await pageSectionsToPDFTree(pdfLibPDF, pageSections);
    const outputFiles: InputWithSizeMeta[] = [];

    outputElement.textContent += ' Creating zip...';

    await savePDFTree(splitPDFs, '', (path, bytes) => {
        outputFiles.push({ name: path, input: bytes });
    });

    saveAs(await downloadZip(outputFiles).blob(), 'splitPDFs.zip');
    outputElement.textContent += ' Done.';
});
