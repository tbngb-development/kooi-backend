import { ValidationError } from "../../../../../shared/errors/validation.error";
import type { CloudinaryService, UploadAudioResult } from "../../../../../shared/services/cloudinary.service";
import type { Logger } from "../../../../../shared/logging/logger.interface";

const ALLOWED_MIME_TYPES = new Set([
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
]);

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB

export interface UploadSarvamAgentAudioInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export class UploadSarvamAgentAudioUseCase {
  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly logger?: Logger,
  ) {}

  async execute(input: UploadSarvamAgentAudioInput): Promise<UploadAudioResult> {
    if (!input.buffer || input.buffer.length === 0) {
      throw new ValidationError([
        { field: "audio", message: "Audio file buffer is empty." },
      ]);
    }

    const mime = input.mimetype.toLowerCase();
    const isAllowedExt = /\.(wav|mp3)$/i.test(input.originalname);

    if (!ALLOWED_MIME_TYPES.has(mime) && !isAllowedExt) {
      throw new ValidationError([
        {
          field: "audio",
          message: "Invalid file format. Only .wav and .mp3 audio files are allowed.",
        },
      ]);
    }

    if (input.size > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError([
        {
          field: "audio",
          message: `Audio file exceeds maximum allowed size of 15MB (got ${(input.size / (1024 * 1024)).toFixed(1)}MB).`,
        },
      ]);
    }

    const result = await this.cloudinaryService.uploadAudio(
      input.buffer,
      "sarvam-agent-voices",
      input.originalname,
    );

    const MIN_DURATION_SECONDS = 10;
    const MAX_DURATION_SECONDS = 120;

    if (
      result.duration !== undefined &&
      result.duration !== null &&
      (result.duration < MIN_DURATION_SECONDS || result.duration > MAX_DURATION_SECONDS)
    ) {
      await this.cloudinaryService.deleteAudio(result.publicId);
      throw new ValidationError([
        {
          field: "audio",
          message: `Audio duration must be between ${MIN_DURATION_SECONDS} and ${MAX_DURATION_SECONDS} seconds (detected ${result.duration.toFixed(1)}s).`,
        },
      ]);
    }

    this.logger?.info("Uploaded Sarvam agent voice audio to Cloudinary", {
      action: "sarvam_agent.audio_uploaded",
      publicId: result.publicId,
      url: result.url,
      bytes: result.bytes,
      duration: result.duration,
    });

    return result;
  }
}

