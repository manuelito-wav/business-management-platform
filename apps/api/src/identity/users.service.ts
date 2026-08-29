import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { IdGenerator } from "@bmp/domain";
import { AppException } from "../common/app-exception";
import { ID_GENERATOR } from "../common/domain-providers";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordHasherService } from "./password-hasher.service";

export interface CreateUserInput {
  email: string;
  username?: string;
  password: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasherService,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async create(input: CreateUserInput) {
    const passwordHash = await this.passwordHasher.hash(input.password);

    try {
      return await this.prisma.user.create({
        data: {
          id: this.ids.generate(),
          email: input.email,
          username: input.username,
          passwordHash,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = (error.meta?.target as string[] | undefined)?.join(", ") ?? "email/username";
        throw new AppException(
          "USER_ALREADY_EXISTS",
          `A user with this ${target} already exists.`,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  findByEmailOrUsername(identifier: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
