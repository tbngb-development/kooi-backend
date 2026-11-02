export interface ISarvamEncryptionService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  maskKey(apiKey: string): string;
}

