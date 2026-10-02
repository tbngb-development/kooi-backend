import bcrypt from "bcryptjs";
import { type PasswordService } from "../../application/interfaces/password-service.interface";

const SALT_ROUNDS = 12;

export class BcryptPasswordService implements PasswordService {
  async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, SALT_ROUNDS);
  }

  async compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
