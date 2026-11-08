import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadSarvamAgentAudioUseCase } from "../application/use-cases/admin/upload-sarvam-agent-audio.use-case";
import { ValidationError } from "../../../shared/errors/validation.error";
import type { CloudinaryService } from "../../../shared/services/cloudinary.service";

describe("UploadSarvamAgentAudioUseCase", () => {
  let mockCloudinaryService: Partial<CloudinaryService>;
  let useCase: UploadSarvamAgentAudioUseCase;

  beforeEach(() => {
    mockCloudinaryService = {
      uploadAudio: vi.fn().mockResolvedValue({
        url: "https://res.cloudinary.com/demo/video/upload/sample.mp3",
        publicId: "sarvam-agent-voices/sample",
        format: "mp3",
        duration: 45.2,
        bytes: 102400,
      }),
    };
    useCase = new UploadSarvamAgentAudioUseCase(mockCloudinaryService as CloudinaryService);
  });

  it("should successfully upload a valid .mp3 file", async () => {
    const buffer = Buffer.from("dummy audio content");
    const result = await useCase.execute({
      buffer,
      originalname: "agent_voice.mp3",
      mimetype: "audio/mpeg",
      size: 102400,
    });

    expect(result.url).toBe("https://res.cloudinary.com/demo/video/upload/sample.mp3");
    expect(mockCloudinaryService.uploadAudio).toHaveBeenCalledWith(
      buffer,
      "sarvam-agent-voices",
      "agent_voice.mp3",
    );
  });

  it("should successfully upload a valid .wav file", async () => {
    const buffer = Buffer.from("dummy audio content");
    const result = await useCase.execute({
      buffer,
      originalname: "agent_voice.wav",
      mimetype: "audio/wav",
      size: 204800,
    });

    expect(result.url).toBe("https://res.cloudinary.com/demo/video/upload/sample.mp3");
    expect(mockCloudinaryService.uploadAudio).toHaveBeenCalledWith(
      buffer,
      "sarvam-agent-voices",
      "agent_voice.wav",
    );
  });

  it("should reject empty buffer", async () => {
    await expect(
      useCase.execute({
        buffer: Buffer.alloc(0),
        originalname: "empty.mp3",
        mimetype: "audio/mpeg",
        size: 0,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("should reject disallowed file formats", async () => {
    await expect(
      useCase.execute({
        buffer: Buffer.from("image"),
        originalname: "avatar.png",
        mimetype: "image/png",
        size: 5000,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("should reject files exceeding 15MB", async () => {
    await expect(
      useCase.execute({
        buffer: Buffer.from("huge"),
        originalname: "huge.wav",
        mimetype: "audio/wav",
        size: 16 * 1024 * 1024,
      }),
    ).rejects.toThrow(ValidationError);
  });
});

