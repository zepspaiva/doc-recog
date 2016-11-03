# doc-recog
Text-based document recognition.

The goal of this project is to allow document recognition and data extraction based on pre-defined templates. Templates define key elements that if found help determine the document type. Once the document recognition is complete it's possible to extract specific information from the document or tag using a QR code, for example.

If the input is a PDF file, doc-recog will use pdftotext output data to process the document. If no text is found or if the input is an image file, the result of OCR processing using tesseract will be used as input for the whole process.
