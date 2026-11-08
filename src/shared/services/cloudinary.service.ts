import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import streamifier from "streamifier";
import type { Logger } from "../logging/logger.interface";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export interface UploadAudioResult {
  url: string;
  publicId: string;
  format?: string;
  duration?: number;
  bytes: number;
}

export class CloudinaryService {
  constructor(private readonly logger?: Logger) {}

  /**
   * Upload an audio buffer directly to Cloudinary using streaming.
   * Audio files in Cloudinary are uploaded under resource_type: "video".
   */
  async uploadAudio(
    buffer: Buffer,
    folder: string = "sarvam-agent-voices",
    filename?: string,
  ): Promise<UploadAudioResult> {
    return new Promise((resolve, reject) => {
      const uploadOptions: Record<string, unknown> = {
        folder,
        resource_type: "video",
        overwrite: true,
      };

      if (filename) {
        uploadOptions.public_id = filename.replace(/\.[^/.]+$/, "");
      }

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            this.logger?.error("Cloudinary audio upload failed", { error });
            return reject(new Error(error?.message || "Cloudinary upload failed"));
          }

          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            duration: result.duration,
            bytes: result.bytes,
          });
        },
      );

      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}

export const cloudinaryService = new CloudinaryService();
