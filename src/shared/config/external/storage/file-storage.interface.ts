/**
 * Abstraction over file storage providers.
 *
 * The application layer depends on this interface, not on Cloudinary directly.
 * This allows swapping to S3, GCS, or local disk without touching use cases.
 */
export interface FileStorageProvider {
  /**
   * Uploads a raw buffer to persistent storage and returns a public URL.
   *
   * @param buffer   - File content as a Buffer
   * @param fileName - Original file name (used for public_id generation)
   * @param folder   - Storage folder path (e.g. "kooi/tenant123/campaigns/...")
   * @returns          Public download URL
   */
  uploadBuffer(
    buffer: Buffer,
    fileName: string,
    folder: string,
  ): Promise<string>;
}
