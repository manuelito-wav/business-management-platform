import { Controller, Get, UseGuards } from "@nestjs/common";
import { AccessTokenGuard } from "../identity/access-token.guard";
import { PermissionsService } from "./permissions.service";

/** The catalog is global (D-038), not business-scoped -- any authenticated user may read it. */
@Controller("permissions")
@UseGuards(AccessTokenGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  list() {
    return this.permissions.list();
  }
}
