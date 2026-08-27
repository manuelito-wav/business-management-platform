import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { HealthService, HealthStatus } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check(): Promise<HealthStatus> {
    const status = await this.healthService.check();
    if (status.status === "error") {
      throw new ServiceUnavailableException(status);
    }
    return status;
  }
}
