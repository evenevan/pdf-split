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
const outputElement = document.getElementById('output') as HTMLParagraphElement;

formElement.onsubmit = (async (event) => {
    outputElement.textContent = '';
    event.preventDefault();
    const inputFile = fileElement.files!.item(0)!;

    const pdfjsPDF = await pdfjs.getDocument(await inputFile.arrayBuffer()).promise;
    const outline = await pdfjsPDF.getOutline();

    console.log(await pdfjsPDF.getMetadata());

    if (!outline) {
        outputElement.textContent = 'No outline found, cannot proceed';
        return;
    }

    outputElement.textContent = 'Processing...';

    const pageSections = await pdfToPageSections(pdfjsPDF, outline);
    const pdfLibPDF = await PDFDocument.load(await inputFile.arrayBuffer());
    const splitPDFs = await pageSectionsToPDFTree(pdfLibPDF, pageSections);
    const outputFiles: InputWithSizeMeta[] = [];

    await savePDFTree(splitPDFs, '', (path, bytes) => {
        outputFiles.push({ name: path, input: bytes });
    });

    saveAs(await downloadZip(outputFiles).blob(), 'splitPDFs.zip');
    outputElement.textContent = '';
});
