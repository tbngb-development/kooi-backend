import type {
  ClassifierEvaluationParams,
  ClassifierEvaluationResult,
} from "../dto/classifier.dto";

export interface ClassifierProvider {
  evaluate(
    params: ClassifierEvaluationParams,
  ): Promise<ClassifierEvaluationResult>;
}
