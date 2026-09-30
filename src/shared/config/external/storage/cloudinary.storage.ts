import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import type { FileStorageProvider } from "./file-storage.interface";
import type { Logger } from "../../../logging/logger.interface";

// ── Configuration ────────────────────────────────────────────────────────────

function configureCloudinary(): void {
  if (process.env.CLOUDINARY_URL) {
    return; // cloudinary SDK auto-parses CLOUDINARY_URL
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

configureCloudinary();

// ── Implementation ───────────────────────────────────────────────────────────

export class CloudinaryStorageProvider implements FileStorageProvider {
  constructor(private readonly logger?: Logger) {}

  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    folder: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.logger?.debug("Starting file upload to Cloudinary", {
        action: "cloudinary.upload_start",
        fileName,
        folder,
      });

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder,
          public_id: `${Date.now()}-${fileName.replace(/\.[^/.]+$/, "")}`,
        },
        (error, result) => {
          if (error) {
            this.logger?.error("Cloudinary upload transaction failed", error, {
              action: "cloudinary.upload_failed",
              fileName,
              folder,
            });
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
            return;
          }
          if (!result) {
            this.logger?.error("Cloudinary returned empty upload response", undefined, {
              action: "cloudinary.upload_empty_response",
              fileName,
              folder,
            });
            reject(new Error("Cloudinary returned empty response."));
            return;
          }

          this.logger?.info("Cloudinary upload successful", {
            action: "cloudinary.upload_success",
            fileName,
            folder,
            secureUrl: result.secure_url,
          });

          resolve(result.secure_url);
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}