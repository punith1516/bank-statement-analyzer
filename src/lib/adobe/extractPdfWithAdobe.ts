import "server-only";
import fs from "fs";
import path from "path";
import os from "os";
import AdmZip from "adm-zip";
import {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  ExtractPDFParams,
  ExtractPDFJob,
  ExtractPDFResult,
  ExtractElementType,
  SDKError,
  ServiceUsageError,
  ServiceApiError,
} from "@adobe/pdfservices-node-sdk";

import type { AdobeStructuredData } from "@/lib/types";
import { getServerEnv } from "@/lib/env";

export type AdobeExtractError =
  | "PASSWORD_PROTECTED"
  | "FILE_TOO_LARGE"
  | "TIMEOUT"
  | "INVALID_PDF"
  | "RATE_LIMIT"
  | "API_ERROR"
  | "UNKNOWN";

export class AdobeExtractException extends Error {
  code: AdobeExtractError;
  constructor(code: AdobeExtractError, message: string) {
    super(message);
    this.code = code;
  }
}

function mapAdobeError(e: unknown): AdobeExtractException {
  if (e instanceof ServiceUsageError) {
    return new AdobeExtractException("RATE_LIMIT", "Adobe API rate limit exceeded");
  }

  if (e instanceof ServiceApiError) {
    const msg = e.message || "";
    if (/password|encrypted/i.test(msg)) {
      return new AdobeExtractException("PASSWORD_PROTECTED", "PDF is password protected");
    }
    if (/size|large|limit/i.test(msg)) {
      return new AdobeExtractException("FILE_TOO_LARGE", "PDF file too large for extraction");
    }
    return new AdobeExtractException("API_ERROR", msg || "Adobe API error");
  }

  if (e instanceof SDKError) {
    return new AdobeExtractException("API_ERROR", e.message || "Adobe SDK error");
  }

  if (e instanceof Error) {
    const msg = e.message || "";
    if (/timeout/i.test(msg)) {
      return new AdobeExtractException("TIMEOUT", "Adobe API request timed out");
    }
    if (/password|encrypted/i.test(msg)) {
      return new AdobeExtractException("PASSWORD_PROTECTED", "PDF is password protected");
    }
    return new AdobeExtractException("UNKNOWN", msg || "Unknown error");
  }

  return new AdobeExtractException("UNKNOWN", "Unknown error during PDF extraction");
}

export async function extractPdfWithAdobe(
  pdfBuffer: Buffer,
  fileName: string
): Promise<AdobeStructuredData> {
  const env = getServerEnv();

  // Write buffer to temp file (Adobe SDK requires file input)
  const tmpDir = os.tmpdir();
  const inputPath = path.join(tmpDir, `input-${Date.now()}-${fileName}`);

  try {
    fs.writeFileSync(inputPath, pdfBuffer);

    // Set up credentials using v4 API
    const credentials = new ServicePrincipalCredentials({
      clientId: env.PDF_SERVICES_CLIENT_ID,
      clientSecret: env.PDF_SERVICES_CLIENT_SECRET,
    });

    // Create PDFServices instance
    const pdfServices = new PDFServices({ credentials });

    // Create asset from file
    const readStream = fs.createReadStream(inputPath);
    const inputAsset = await pdfServices.upload({
      readStream,
      mimeType: MimeType.PDF,
    });

    // Configure extraction params (v4 API)
    const params = new ExtractPDFParams({
      elementsToExtract: [ExtractElementType.TEXT, ExtractElementType.TABLES],
    });

    // Create and execute job
    const job = new ExtractPDFJob({ inputAsset, params });
    const pollingURL = await pdfServices.submit({ job });
    const pdfServicesResponse = await pdfServices.getJobResult({
      pollingURL,
      resultType: ExtractPDFResult,
    });

    if (!pdfServicesResponse.result) {
      throw new AdobeExtractException("API_ERROR", "No result from Adobe Extract API");
    }

    const resultAsset = pdfServicesResponse.result.resource;
    const streamAsset = await pdfServices.getContent({ asset: resultAsset });

    // Write ZIP to temp location
    const zipPath = path.join(tmpDir, `result-${Date.now()}.zip`);
    const writeStream = fs.createWriteStream(zipPath);

    await new Promise<void>((resolve, reject) => {
      streamAsset.readStream.pipe(writeStream);
      writeStream.on("finish", () => resolve());
      writeStream.on("error", reject);
    });

    // Extract structuredData.json from ZIP
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    const jsonEntry = entries.find(
      (e) => e.entryName.includes("structuredData.json") && !e.isDirectory
    );

    if (!jsonEntry) {
      throw new AdobeExtractException("API_ERROR", "No structuredData.json found in Adobe response");
    }

    const jsonContent = jsonEntry.getData().toString("utf8");
    const structured = JSON.parse(jsonContent) as AdobeStructuredData;

    // Cleanup
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(zipPath);
    } catch {
      // Ignore cleanup errors
    }

    return structured;
  } catch (e) {
    // Cleanup on error
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {
      // Ignore cleanup errors
    }

    throw mapAdobeError(e);
  }
}
