import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../audit/audit.service";
import { BusinessesService } from "../businesses/businesses.service";
import { domainProviders } from "../common/domain-providers";
import { PasswordHasherService } from "../identity/password-hasher.service";
import { UsersService } from "../identity/users.service";
import { MembershipsService } from "../memberships/memberships.service";
import { PermissionsService } from "../memberships/permissions.service";
import { RolesService } from "../memberships/roles.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { ConfigurationService } from "./configuration.service";
import { FEATURE_FLAGS_DEFAULT } from "./sections/feature-flags.config";
import { PAYMENT_METHODS_DEFAULT } from "./sections/payment-methods.config";
import { POLICIES_DEFAULT } from "./sections/policies.config";

const TEST_CORRELATION_ID = "test-correlation-id";

describe("Business configuration registry", () => {
  let prisma: PrismaService;
  let users: UsersService;
  let businesses: BusinessesService;
  let memberships: MembershipsService;
  let configuration: ConfigurationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [
        ...domainProviders,
        UsersService,
        PasswordHasherService,
        PermissionsService,
        RolesService,
        MembershipsService,
        BusinessesService,
        ConfigurationService,
        AuditService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UsersService);
    businesses = moduleRef.get(BusinessesService);
    memberships = moduleRef.get(MembershipsService);
    configuration = moduleRef.get(ConfigurationService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.businessConfiguration.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.role.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.business.deleteMany();
    await prisma.user.deleteMany();
  });

  async function createOwner(email: string) {
    const owner = await users.create({ email, password: "correct-horse-1" });
    const business = await businesses.create(owner.id, { name: "Kiosco de Prueba" });
    return { owner, business };
  }

  it("returns the safe defaults for a business that never set anything", async () => {
    const { business } = await createOwner("config-owner1@kiosk.test");

    const sections = await configuration.getSections(business.id);

    expect(sections.paymentMethods).toEqual(PAYMENT_METHODS_DEFAULT);
    expect(sections.featureFlags).toEqual(FEATURE_FLAGS_DEFAULT);
    expect(sections.policies).toEqual(POLICIES_DEFAULT);
  });

  it("persists an update and returns it on the next read", async () => {
    const { owner, business } = await createOwner("config-owner2@kiosk.test");

    const updated = await configuration.updateSections(
      owner.id,
      business.id,
      { paymentMethods: { enabled: ["cash", "card"] } },
      TEST_CORRELATION_ID,
    );
    expect(updated.paymentMethods).toEqual({ enabled: ["cash", "card"] });

    const reread = await configuration.getSections(business.id);
    expect(reread.paymentMethods).toEqual({ enabled: ["cash", "card"] });
    // Untouched sections keep their defaults.
    expect(reread.featureFlags).toEqual(FEATURE_FLAGS_DEFAULT);
  });

  it("ignores an explicit undefined value for an untouched key (regression)", async () => {
    // A class-validator DTO instance carries every declared property as an
    // own key even when omitted from the request body (this project's
    // ES2022 target enables useDefineForClassFields), so `patch` can
    // legitimately contain `{ featureFlags: undefined }` for a section the
    // caller never mentioned. That must not upsert a bogus stored value.
    const { owner, business } = await createOwner("config-owner2b@kiosk.test");

    await configuration.updateSections(
      owner.id,
      business.id,
      { paymentMethods: { enabled: ["cash"] }, featureFlags: undefined },
      TEST_CORRELATION_ID,
    );

    const stored = await prisma.businessConfiguration.findMany({
      where: { businessId: business.id },
    });
    expect(stored.map((row) => row.key)).toEqual(["paymentMethods"]);
  });

  it("rejects an update from a member without configuration.manage", async () => {
    const { owner, business } = await createOwner("config-owner3@kiosk.test");
    const employee = await users.create({
      email: "config-employee3@kiosk.test",
      password: "correct-horse-1",
    });
    const employeeRole = await prisma.role.findFirstOrThrow({
      where: { businessId: business.id, name: "Employee" },
    });
    await memberships.addMember(
      owner.id,
      business.id,
      { email: employee.email, roleId: employeeRole.id },
      TEST_CORRELATION_ID,
    );

    await expect(
      configuration.updateSections(
        employee.id,
        business.id,
        { featureFlags: { ...FEATURE_FLAGS_DEFAULT, priceLists: true } },
        TEST_CORRELATION_ID,
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("falls back to the safe default when a stored value no longer matches its section's shape", async () => {
    const { business } = await createOwner("config-owner4@kiosk.test");
    await prisma.businessConfiguration.create({
      data: {
        id: "corrupt-config-4",
        businessId: business.id,
        key: "policies",
        value: { negativeProfitabilityHandling: "not-a-real-option" },
      },
    });

    const sections = await configuration.getSections(business.id);

    expect(sections.policies).toEqual(POLICIES_DEFAULT);
  });

  it("updates the business timezone through BusinessesService, independent of the registry sections", async () => {
    const { owner, business } = await createOwner("config-owner5@kiosk.test");
    expect(business.businessTimezone).toBe("America/Argentina/Buenos_Aires");

    const updated = await businesses.updateTimezone(
      business.id,
      "America/Santiago",
      owner.id,
      TEST_CORRELATION_ID,
    );

    expect(updated.businessTimezone).toBe("America/Santiago");
  });
});
