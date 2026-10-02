import { NotFoundError } from "../../../../shared/errors/not-found.error";

export class CallNotFoundError extends NotFoundError {
  constructor() {
    super("Call");
  }
}