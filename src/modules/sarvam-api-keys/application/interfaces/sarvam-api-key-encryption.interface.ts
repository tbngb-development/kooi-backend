export interface ISarvamApiKeyEncryptionService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  maskKey(apiKey: string): string;
}

