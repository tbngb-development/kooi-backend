import type { PlatformAgentRepository } from "../interfaces/platform-agent-repository.interface";
import type { DispositionObjectiveOption } from "../interfaces/platform-agent-repository.interface";
import type { UpdateExtractionConfigDTO } from "../dto/platform-agent.dto";
import type {
  ExtractionConfig,
  ExtractionMetricConfig,
  ExtractionResultConfig,
} from "../../../../shared/types/bolna.types";
import { PlatformAgentNotFoundError } from "../../domain/errors/platform-agent.errors";
import {
  ValidationError,
  type ValidationErrorDetail,
} from "../../../../shared/errors/validation.error";

interface ResolvedDisposition {
  dispositionId: string;
  dispositionName: string;
  dispositionSlug: string;
  isObjective: boolean;
  isSubjective: boolean;
  objectiveOptions: DispositionObjectiveOption[] | null;
}

export class UpdateExtractionConfigUseCase {
  constructor(private readonly agentRepository: PlatformAgentRepository) {}

  async execute(
    platformAgentId: string,
    dto: UpdateExtractionConfigDTO,
  ): Promise<{ extractionConfig: ExtractionConfig | null }> {
    const agent = await this.agentRepository.findById(platformAgentId);
    if (!agent) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    if (dto.extractionConfig === null) {
      await this.agentRepository.updateExtractionConfig(platformAgentId, {
        extractionConfig: null,
        welcomeMessage: dto.welcomeMessage,
        requiredVariables: dto.requiredVariables,
        gender: dto.gender,
      });
      return { extractionConfig: null };
    }

    // ── Fetch assigned dispositions for validation ──────────────────────
    const agentConfig =
      await this.agentRepository.getAgentExtractionConfig(platformAgentId);
    if (!agentConfig) {
      throw new PlatformAgentNotFoundError(platformAgentId);
    }

    const dispositionLookup = this.buildDispositionLookup(agentConfig);

    // ── Validate metrics ────────────────────────────────────────────────
    const metricErrors: ValidationErrorDetail[] = [];
    for (let i = 0; i < dto.extractionConfig.metrics.length; i++) {
      const metric = dto.extractionConfig.metrics[i];
      const errors = this.validateMetric(metric, i, dispositionLookup);
      metricErrors.push(...errors);
    }

    // ── Validate results ────────────────────────────────────────────────
    const resultErrors: ValidationErrorDetail[] = [];
    for (let i = 0; i < dto.extractionConfig.results.length; i++) {
      const result = dto.extractionConfig.results[i];
      const errors = this.validateResult(result, i, dispositionLookup);
      resultErrors.push(...errors);
    }

    const allErrors: ValidationErrorDetail[] = [
      ...metricErrors,
      ...resultErrors,
    ];

    if (allErrors.length > 0) {
      throw new ValidationError(allErrors);
    }

    // ── Persist ─────────────────────────────────────────────────────────
    await this.agentRepository.updateExtractionConfig(platformAgentId, {
      extractionConfig: dto.extractionConfig,
      welcomeMessage: dto.welcomeMessage,
      requiredVariables: dto.requiredVariables,
      gender: dto.gender,
    });

    return { extractionConfig: dto.extractionConfig };
  }

  // ── Private Helpers ─────────────────────────────────────────────────────

  private buildDispositionLookup(agentConfig: {
    categories: {
      dispositions: {
        dispositionId: string;
        dispositionName: string;
        dispositionSlug: string;
        isObjective: boolean;
        isSubjective: boolean;
        objectiveOptions: DispositionObjectiveOption[] | null;
      }[];
    }[];
  }): Map<string, ResolvedDisposition> {
    const lookup = new Map<string, ResolvedDisposition>();

    for (const cat of agentConfig.categories) {
      for (const disp of cat.dispositions) {
        const entry: ResolvedDisposition = {
          dispositionId: disp.dispositionId,
          dispositionName: disp.dispositionName,
          dispositionSlug: disp.dispositionSlug,
          isObjective: disp.isObjective,
          isSubjective: disp.isSubjective,
          objectiveOptions: disp.objectiveOptions,
        };
        lookup.set(disp.dispositionName.toLowerCase(), entry);
        lookup.set(disp.dispositionSlug.toLowerCase(), entry);
      }
    }

    return lookup;
  }

  private validateMetric(
    metric: ExtractionMetricConfig,
    index: number,
    lookup: Map<string, ResolvedDisposition>,
  ): ValidationErrorDetail[] {
    const errors: ValidationErrorDetail[] = [];

    const disp = lookup.get(metric.disposition.toLowerCase());
    if (!disp) {
      errors.push({
        field: `extractionConfig.metrics[${index}].disposition`,
        message: `Disposition "${metric.disposition}" is not assigned to this agent`,
      });
      return errors;
    }

    if (!disp.isObjective) {
      errors.push({
        field: `extractionConfig.metrics[${index}].disposition`,
        message: `Disposition "${metric.disposition}" is not objective — metrics require objective dispositions with matchValue`,
      });
      return errors;
    }

    const validValues = this.flattenObjectiveValues(disp.objectiveOptions);
    if (!validValues.includes(metric.matchValue.toLowerCase())) {
      errors.push({
        field: `extractionConfig.metrics[${index}].matchValue`,
        message: `matchValue "${metric.matchValue}" does not exist in disposition "${metric.disposition}" objective options [${validValues.join(", ")}]`,
      });
    }

    return errors;
  }

  private validateResult(
    result: ExtractionResultConfig,
    index: number,
    lookup: Map<string, ResolvedDisposition>,
  ): ValidationErrorDetail[] {
    const errors: ValidationErrorDetail[] = [];

    const disp = lookup.get(result.disposition.toLowerCase());
    if (!disp) {
      errors.push({
        field: `extractionConfig.results[${index}].disposition`,
        message: `Disposition "${result.disposition}" is not assigned to this agent`,
      });
    }

    return errors;
  }

  private flattenObjectiveValues(
    options: DispositionObjectiveOption[] | null,
  ): string[] {
    if (!options) return [];

    const values: string[] = [];
    for (const opt of options) {
      values.push(opt.value.toLowerCase());
      if (opt.sub_options && opt.sub_options.length > 0) {
        values.push(...this.flattenObjectiveValues(opt.sub_options));
      }
    }
    return values;
  }
}
