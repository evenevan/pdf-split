import * as pdfjs from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
// @ts-ignore
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import { downloadZip, InputWithSizeMeta } from 'client-zip';
import { saveAs } from 'file-saver';
import { outlineToSections, savePDFTree, sectionToPDFTree } from './pdf-split';

pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const formElement = document.getElementById('form') as HTMLFormElement;
const fileElement = document.getElementById('pdf') as HTMLInputElement;
const levelElement = document.getElementById('level') as HTMLInputElement;
const outputElement = document.getElementById('output') as HTMLParagraphElement;

formElement.onsubmit = (async (event) => {
    outputElement.textContent = 'Processing...';
    event.preventDefault();
    const inputFile = fileElement.files!.item(0)!;

    const pdfjsPDF = await pdfjs.getDocument(await inputFile.arrayBuffer()).promise;
    const outline = await pdfjsPDF.getOutline();
    const metadata = await pdfjsPDF.getMetadata();

    // console.log(await pdfjsPDF.getMetadata());

    if (!outline) {
        outputElement.textContent += ' No PDF outline found, cannot proceed.';
        return;
    }

    // @ts-ignore
    const version: string | null = metadata.info.PDFFormatVersion ?? null;

    if (Number(version) <= 1.4) {
        outputElement.textContent += ` Warning: PDF version is ${version}. If you may experience issues, try upgrading PDF versions.`;
    }

    outputElement.textContent += ' Loading PDF...';
    const pdfLibPDF = await PDFDocument.load(await inputFile.arrayBuffer());
    outputElement.textContent += ' Generating sub-PDF files...';
    const sections = await outlineToSections(pdfjsPDF, outline, Number(levelElement.value));
    // console.log(sections);
    const splitPDFs = await sectionToPDFTree(pdfLibPDF, sections);
    // console.log(splitPDFs);
    const outputFiles: InputWithSizeMeta[] = [];

    outputElement.textContent += ' Creating zip...';

    await savePDFTree(splitPDFs, (path, bytes) => {
        // illegal character handling would be here but it seems the library does that for me
        const filePath = `./${path.slice(1).join('/')}.pdf`;
        outputFiles.push({ name: filePath, input: bytes });
    });

    saveAs(await downloadZip(outputFiles).blob(), `${inputFile.name.replace('.pdf', '')}_split.zip`);
    outputElement.textContent += ' Done.';
});
